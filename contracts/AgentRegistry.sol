// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IStakingManager.sol";
import "./IAgentNFT.sol";

contract AgentRegistry {
    struct Capability {
        string name;
        string description;
        string expectedReasoning;
        string outputSchema;
        string domain;
        bool requiresUserAuthorization;
        bool active;
    }

    struct CapabilityInput {
        string name;
        string description;
        string expectedReasoning;
        string outputSchema;
        string domain;
    }

    struct Agent {
        bool isRegistered;
        address owner;
        string metadataURI; // agent metadata
        uint256 trustScore; // aggregated trust score
        uint8 rating;
        uint8 riskLevel;
        bool isDeterministic;
        uint256 stakeAmount; // mirror value from staking manager for convenience
        bool revoked; // credential revocation status
        uint256 createdAt;
    }

    uint256 public constant INITIAL_TRUST_SCORE = 50;
    uint256 public constant MAX_TRUST_SCORE = 100;
    uint8 public constant MIN_RISK_LEVEL = 0;
    uint8 public constant MAX_RISK_LEVEL = 2;

    uint256 public constant REVOKE_TRUST_THRESHOLD = 20;
    uint256 public constant BOUNTY_BPS = 100; // 1%

    uint256 private constant TOKEN_UNIT = 1 ether;

    uint256 public nextAgentId;
    uint256[3] internal STAKE_TABLE = [0, 500 * TOKEN_UNIT, 1000 * TOKEN_UNIT];
    address public owner;
    address public reputationRegistry;
    address public stakingManager;
    address public agentNFT;

    mapping(uint256 => Agent) public agents;
    mapping(uint256 => Capability[]) private agentCapabilities;
    mapping(address => uint256) public ownerToAgentId;

    event AgentRegistered(
        uint256 indexed agentId, address indexed owner, uint8 riskLevel, bool isDeterministic, string metadataURI
    );
    event AgentRevoked(uint256 indexed agentId);
    event CapabilityChanged(uint256 indexed agentId, string capability, uint256 riskLevel);
    event ReputationRegistryUpdated(address indexed reputationRegistry);
    event StakingManagerUpdated(address indexed stakingManager);
    event AgentNFTUpdated(address indexed agentNFT);
    event TrustScoreUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);

    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
    //                   MODIFIERS, CONSTRUCTOR, SETTER
    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyReputationRegistry() {
        require(msg.sender == reputationRegistry, "Only reputation registry");
        _;
    }

    constructor(address _stakingManager) {
        owner = msg.sender;
        stakingManager = _stakingManager;
    }

    function setReputationRegistry(address _reputationRegistry) external onlyOwner {
        require(_reputationRegistry != address(0), "Invalid reputation registry");
        reputationRegistry = _reputationRegistry;
        emit ReputationRegistryUpdated(_reputationRegistry);
    }

    function setStakingManager(address _stakingManager) external onlyOwner {
        require(_stakingManager != address(0), "Invalid staking manager");
        stakingManager = _stakingManager;
        emit StakingManagerUpdated(_stakingManager);
    }

    function setAgentNFT(address _agentNFT) external onlyOwner {
        require(_agentNFT != address(0), "Invalid agent NFT");
        agentNFT = _agentNFT;
        emit AgentNFTUpdated(_agentNFT);
    }

    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
    //                      MAIN FUNCTIONS
    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X

    function registerAgent(
        string calldata metadataURI,
        CapabilityInput calldata capabilityInput,
        uint8 riskLevel,
        bool isDeterministic
    ) external payable {
        require(stakingManager != address(0), "Staking manager not set");
        require(agentNFT != address(0), "Agent NFT not set");
        require(riskLevel >= MIN_RISK_LEVEL && riskLevel <= MAX_RISK_LEVEL, "Invalid risk level");

        uint256 stakeRequired = calculateStakeAmount(riskLevel);
        require(msg.value == stakeRequired, "Invalid stake amount");

        uint256 agentId = IAgentNFT(agentNFT).safeMint(msg.sender, metadataURI);
        require(agentId > 0, "Invalid agent id");
        require(!agents[agentId].isRegistered, "Agent id already used");
        nextAgentId = agentId;

        Agent storage agent = agents[agentId];
        agent.isRegistered = true;
        agent.owner = msg.sender;
        agent.metadataURI = metadataURI;
        agent.trustScore = INITIAL_TRUST_SCORE;
        agent.rating = 0;
        agent.riskLevel = riskLevel;
        agent.isDeterministic = isDeterministic;
        agent.stakeAmount = stakeRequired;
        agent.revoked = false;
        agent.createdAt = block.timestamp;

        agentCapabilities[agentId].push(_buildCapability(capabilityInput, riskLevel));

        ownerToAgentId[msg.sender] = agentId;

        IStakingMananger(stakingManager).stakeForAgent{value: msg.value}(agentId, msg.sender, riskLevel);

        agents[agentId].stakeAmount = IStakingMananger(stakingManager).getStakeAmount(agentId);

        emit AgentRegistered(agentId, msg.sender, riskLevel, isDeterministic, metadataURI);
    }

    function calculateStakeAmount(uint8 riskLevel) public view returns (uint256) {
        require(riskLevel >= MIN_RISK_LEVEL && riskLevel <= MAX_RISK_LEVEL, "Invalid risk level");
        return STAKE_TABLE[riskLevel];
    }

    function updateCapability(
        uint256 agentId,
        uint256 capabilityIndex,
        CapabilityInput calldata capabilityInput,
        uint8 riskLevel
    ) external {
        Agent storage agent = agents[agentId];

        require(agent.isRegistered, "Not registered");
        require(!agent.revoked, "Agent revoked");
        require(agent.owner == msg.sender, "Unauthorized");
        require(riskLevel >= MIN_RISK_LEVEL && riskLevel <= MAX_RISK_LEVEL, "Invalid risk level");
        require(capabilityIndex < agentCapabilities[agentId].length, "Invalid capability index");

        agentCapabilities[agentId][capabilityIndex] = _buildCapability(capabilityInput, riskLevel);

        emit CapabilityChanged(agentId, capabilityInput.name, riskLevel);
    }

    function addCapability(uint256 agentId, CapabilityInput calldata capabilityInput, uint8 riskLevel) external {
        Agent storage agent = agents[agentId];

        require(agent.isRegistered, "Not registered");
        require(!agent.revoked, "Agent revoked");
        require(agent.owner == msg.sender, "Unauthorized");
        require(riskLevel >= MIN_RISK_LEVEL && riskLevel <= MAX_RISK_LEVEL, "Invalid risk level");
        require(bytes(capabilityInput.name).length > 0, "Capability name required");

        agentCapabilities[agentId].push(_buildCapability(capabilityInput, riskLevel));

        emit CapabilityChanged(agentId, capabilityInput.name, riskLevel);
    }

    function revokeAgent(uint256 agentId) external {
        Agent storage agent = agents[agentId];

        require(stakingManager != address(0), "Staking manager not set");
        require(agent.isRegistered, "Not registered");
        require(!agent.revoked, "Already revoked");

        bool trustBelow = agent.trustScore <= REVOKE_TRUST_THRESHOLD;
        require(trustBelow, "Revocation criteria not met");

        agent.revoked = true;

        IStakingMananger(stakingManager).liquidateAgent(agentId, msg.sender, BOUNTY_BPS);
        IAgentNFT(agentNFT).revokeNFT(agentId, agent.owner);
        emit AgentRevoked(agentId);
    }

    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
    //                   VIEW FUNCTIONS
    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        Agent memory agent = agents[agentId];
        require(agent.isRegistered, "Not registered");
        return agent;
    }

    function getCapability(uint256 agentId) external view returns (Capability memory) {
        require(agents[agentId].isRegistered, "Not registered");
        require(agentCapabilities[agentId].length > 0, "No capability found");
        return agentCapabilities[agentId][0];
    }

    function getCapabilityAt(uint256 agentId, uint256 index) external view returns (Capability memory) {
        require(agents[agentId].isRegistered, "Not registered");
        require(index < agentCapabilities[agentId].length, "Invalid capability index");
        return agentCapabilities[agentId][index];
    }

    function getCapabilities(uint256 agentId) external view returns (Capability[] memory) {
        require(agents[agentId].isRegistered, "Not registered");
        return agentCapabilities[agentId];
    }

    function getCapabilityCount(uint256 agentId) external view returns (uint256) {
        require(agents[agentId].isRegistered, "Not registered");
        return agentCapabilities[agentId].length;
    }

    function hasCapability(uint256 agentId, string calldata capability)
        external
        view
        returns (bool exists, bool requiresUserAuthorization, bool isActive)
    {
        require(agents[agentId].isRegistered, "Not registered");

        bytes32 capHash = keccak256(bytes(capability));
        Capability[] storage capabilities = agentCapabilities[agentId];

        for (uint256 i = 0; i < capabilities.length; i++) {
            if (keccak256(bytes(capabilities[i].name)) == capHash) {
                return (true, capabilities[i].requiresUserAuthorization, capabilities[i].active);
            }
        }

        return (false, false, false);
    }

    function setAgentTrustScore(uint256 agentId, uint256 newTrustScore) external onlyReputationRegistry {
        Agent storage agent = agents[agentId];
        require(agent.isRegistered, "Not registered");
        require(newTrustScore <= MAX_TRUST_SCORE, "Trust score out of range");

        uint256 oldScore = agent.trustScore;
        agent.trustScore = newTrustScore;

        emit TrustScoreUpdated(agentId, oldScore, newTrustScore);
    }

    function getAgentTrustScore(uint256 agentId) external view returns (uint256) {
        Agent memory agent = agents[agentId];
        require(agent.isRegistered, "Not registered");
        return agent.trustScore;
    }

    function isAgentDeterministic(uint256 agentId) external view returns (bool) {
        Agent memory agent = agents[agentId];
        require(agent.isRegistered, "Not registered");
        return agent.isDeterministic;
    }

    function _buildCapability(CapabilityInput calldata capabilityInput, uint8 riskLevel)
        internal
        pure
        returns (Capability memory)
    {
        return Capability({
            name: capabilityInput.name,
            description: capabilityInput.description,
            expectedReasoning: capabilityInput.expectedReasoning,
            outputSchema: capabilityInput.outputSchema,
            domain: capabilityInput.domain,
            requiresUserAuthorization: riskLevel > 0,
            active: true
        });
    }
}
