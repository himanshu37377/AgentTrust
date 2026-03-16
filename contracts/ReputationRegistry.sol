// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";

contract ReputationRegistry {
    struct Review {
        address reviewer;
        uint8 rating; // stored as 10..50 (1.0..5.0)
        string feedback;
        uint256 timestamp;
    }

    uint8 public constant MIN_RATING = 10;
    uint8 public constant MAX_RATING = 50;

    uint256 public constant MAX_TRUST_SCORE = 100;
    uint16 public constant SUCCESS_REWARD = 1;
    uint16 public constant FAILURE_PENALTY = 5;

    address public owner;
    address public validationRegistry;
    address public agentRegistry;

    mapping(uint256 => Review[]) public reviews;
    // user-review based aggregates
    mapping(uint256 => uint256) public totalRating;
    mapping(uint256 => uint256) public reviewCount;
    mapping(uint256 => uint256) public averageRating;

    event ReviewSubmitted(uint256 indexed agentId, uint8 rating);
    event TrustScoreUpdated(uint256 indexed agentId, uint256 previousScore, uint256 newScore, bool accepted);
    event RatingReduced(uint256 indexed agentId, uint256 previousRating, uint256 newRating, uint16 reduction);
    event ValidationRegistryUpdated(address indexed validationRegistry);
    event AgentRegistryUpdated(address indexed agentRegistry);
    event StakeSlashRequested(uint256 indexed agentId, uint256 penalty);

    
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   MODIFIERS, CONSTRUCTOR, SETTER
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyValidationRegistry() {
        require(msg.sender == validationRegistry, "Only validation registry");
        _;
    }

    constructor(address _agentRegistry) {
        owner = msg.sender;
        agentRegistry = _agentRegistry;
    }

    function setValidationRegistry(address _validationRegistry) external onlyOwner {
        require(_validationRegistry != address(0), "Invalid validation registry");
        validationRegistry = _validationRegistry;
        emit ValidationRegistryUpdated(_validationRegistry);
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        require(_agentRegistry != address(0), "Invalid agent registry");
        agentRegistry = _agentRegistry;
        emit AgentRegistryUpdated(_agentRegistry);
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   MAIN FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    function submitReview(uint256 agentId, uint8 rating, string calldata feedback) external {
        require(agentId > 0, "Invalid agent id");
        require(rating >= MIN_RATING && rating <= MAX_RATING, "Rating must be between 1.0 and 5.0");

        reviews[agentId].push(Review(msg.sender, rating, feedback, block.timestamp));

        totalRating[agentId] += rating;
        reviewCount[agentId] += 1;
        averageRating[agentId] = totalRating[agentId] / reviewCount[agentId];

        emit ReviewSubmitted(agentId, rating);
    }

    function updateTrustScore(uint256 agentId, bool accepted) external onlyValidationRegistry returns (uint256) {
        // Trust score is different from user rating; it is tied to validation outcomes.
        require(agentId > 0, "Invalid agent id");

        uint256 current = _getAgentTrustScore(agentId);

        if (accepted) {
            uint256 increased = current + SUCCESS_REWARD;
            if (increased > MAX_TRUST_SCORE) {
                increased = MAX_TRUST_SCORE;
            }
            IAgentRegistry(agentRegistry).setAgentTrustScore(agentId, increased);
            emit TrustScoreUpdated(agentId, current, increased, true);
            return increased;
        }

        uint256 updated = slashTrustScore(agentId, FAILURE_PENALTY);
        reduceRating(agentId, FAILURE_PENALTY);
        emit TrustScoreUpdated(agentId, current, updated, false);

        return updated;
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//              SLASHING TRUSTSCORE AND RATING (CALL FROM VALIDATION REGISTRY)
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    function slashTrustScore(uint256 agentId, uint256 penalty) public onlyValidationRegistry returns (uint256) {
        require(agentId > 0, "Invalid agent id");
        require(penalty > 0, "Invalid penalty");

        uint256 current = _getAgentTrustScore(agentId);
        uint256 updated = penalty >= current ? 0 : current - penalty;
        IAgentRegistry(agentRegistry).setAgentTrustScore(agentId, updated);
        return updated;
    }

    function reduceRating(uint256 agentId, uint16 reduction) public onlyValidationRegistry {
        require(agentId > 0, "Invalid agent id");
        require(reduction > 0, "Invalid reduction");

        uint256 currentAvg = averageRating[agentId];
        uint256 updatedAvg = reduction >= currentAvg ? 0 : currentAvg - reduction;
        averageRating[agentId] = updatedAvg;
        emit RatingReduced(agentId, currentAvg, updatedAvg, reduction);
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   EXTERNAL VIEW FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X

    
    function getReviews(uint256 agentId) external view returns (Review[] memory) {
        return reviews[agentId];
    }

    function _getAgentTrustScore(uint256 agentId) internal view returns (uint256) {
        require(agentRegistry != address(0), "Agent registry not set");
        uint256 score = IAgentRegistry(agentRegistry).getAgentTrustScore(agentId);
        return score;
    }

    function getTrustScore(uint256 agentId) external view returns (uint256) {
        require(agentId > 0, "Invalid agent id");
        return _getAgentTrustScore(agentId);
    }
}
