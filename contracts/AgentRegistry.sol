// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IStakingManager.sol";
import "./IAgentNFT.sol";

contract AgentRegistry {
    struct Capability {
        uint32 skillId;
        string name;
        string description;
        string expectedReasoning;
        string outputSchema;
        string domain;
        bool requiresUserAuthorization;
        bool active;
    }

    struct CapabilityInput {
        uint32 skillId;
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
    event CapabilityChanged(uint256 indexed agentId, uint32 skillId, string capability, uint256 riskLevel);
    event ReputationRegistryUpdated(address indexed reputationRegistry);
    event StakingManagerUpdated(address indexed stakingManager);
    event AgentNFTUpdated(address indexed agentNFT);
    event TrustScoreUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);

    error OnlyOwner();
    error OnlyReputationRegistry();
    error InvalidReputationRegistry();
    error InvalidStakingManager();
    error InvalidAgentNFT();
    error StakingManagerNotSet();
    error AgentNFTNotSet();
    error InvalidRiskLevel();
    error InvalidStakeAmount();
    error InvalidAgentId();
    error AgentIdAlreadyUsed();
    error NotRegistered();
    error AgentAlreadyRevoked();
    error Unauthorized();
    error InvalidCapabilityIndex();
    error AlreadyRevoked();
    error RevocationCriteriaNotMet();
    error NoCapabilityFound();
    error TrustScoreOutOfRange();
    error SkillIdReserved();

    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
    //                   MODIFIERS, CONSTRUCTOR, SETTER
    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyReputationRegistry() {
        if (msg.sender != reputationRegistry) revert OnlyReputationRegistry();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setReputationRegistry(address _reputationRegistry) external onlyOwner {
        if (_reputationRegistry == address(0)) revert InvalidReputationRegistry();
        reputationRegistry = _reputationRegistry;
        emit ReputationRegistryUpdated(_reputationRegistry);
    }

    function setStakingManager(address _stakingManager) external onlyOwner {
        if (_stakingManager == address(0)) revert InvalidStakingManager();
        stakingManager = _stakingManager;
        emit StakingManagerUpdated(_stakingManager);
    }

    function setAgentNFT(address _agentNFT) external onlyOwner {
        if (_agentNFT == address(0)) revert InvalidAgentNFT();
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
        if (stakingManager == address(0)) revert StakingManagerNotSet();
        if (agentNFT == address(0)) revert AgentNFTNotSet();
        if (riskLevel < MIN_RISK_LEVEL || riskLevel > MAX_RISK_LEVEL) revert InvalidRiskLevel();

        uint256 stakeRequired = calculateStakeAmount(riskLevel);
        if (msg.value != stakeRequired) revert InvalidStakeAmount();

        uint256 agentId = IAgentNFT(agentNFT).safeMint(msg.sender, metadataURI);
        if (agentId == 0) revert InvalidAgentId();
        if (agents[agentId].isRegistered) revert AgentIdAlreadyUsed();
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

        IStakingManager(stakingManager).stakeForAgent{value: msg.value}(agentId, msg.sender, riskLevel);

        agents[agentId].stakeAmount = IStakingManager(stakingManager).getStakeAmount(agentId);

        emit AgentRegistered(agentId, msg.sender, riskLevel, isDeterministic, metadataURI);
    }

    function calculateStakeAmount(uint8 riskLevel) public view returns (uint256) {
        if (riskLevel < MIN_RISK_LEVEL || riskLevel > MAX_RISK_LEVEL) revert InvalidRiskLevel();
        return STAKE_TABLE[riskLevel];
    }

    function updateCapability(
        uint256 agentId,
        uint256 capabilityIndex,
        CapabilityInput calldata capabilityInput,
        uint8 riskLevel
    ) external {
        Agent storage agent = agents[agentId];

        if (!agent.isRegistered) revert NotRegistered();
        if (agent.revoked) revert AgentAlreadyRevoked();
        if (agent.owner != msg.sender) revert Unauthorized();
        if (riskLevel < MIN_RISK_LEVEL || riskLevel > MAX_RISK_LEVEL) revert InvalidRiskLevel();
        if (capabilityIndex >= agentCapabilities[agentId].length) revert InvalidCapabilityIndex();

        agentCapabilities[agentId][capabilityIndex] = _buildCapability(capabilityInput, riskLevel);

        emit CapabilityChanged(agentId, capabilityInput.skillId, capabilityInput.name, riskLevel);
    }

    function addCapability(uint256 agentId, CapabilityInput calldata capabilityInput, uint8 riskLevel) external {
        Agent storage agent = agents[agentId];

        if (!agent.isRegistered) revert NotRegistered();
        if (agent.revoked) revert AgentAlreadyRevoked();
        if (agent.owner != msg.sender) revert Unauthorized();
        if (riskLevel < MIN_RISK_LEVEL || riskLevel > MAX_RISK_LEVEL) revert InvalidRiskLevel();

        agentCapabilities[agentId].push(_buildCapability(capabilityInput, riskLevel));

        emit CapabilityChanged(agentId, capabilityInput.skillId, capabilityInput.name, riskLevel);
    }

    function revokeAgent(uint256 agentId) external {
        Agent storage agent = agents[agentId];

        if (stakingManager == address(0)) revert StakingManagerNotSet();
        if (!agent.isRegistered) revert NotRegistered();
        if (agent.revoked) revert AlreadyRevoked();

        bool trustBelow = agent.trustScore <= REVOKE_TRUST_THRESHOLD;
        if (!trustBelow) revert RevocationCriteriaNotMet();

        agent.revoked = true;

        IStakingManager(stakingManager).liquidateAgent(agentId, msg.sender, BOUNTY_BPS);
        IAgentNFT(agentNFT).revokeNFT(agentId, agent.owner);
        emit AgentRevoked(agentId);
    }

    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
    //                   VIEW FUNCTIONS
    // X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        Agent memory agent = agents[agentId];
        if (!agent.isRegistered) revert NotRegistered();
        return agent;
    }

    function getCapability(uint256 agentId) external view returns (Capability memory) {
        if (!agents[agentId].isRegistered) revert NotRegistered();
        if (agentCapabilities[agentId].length == 0) revert NoCapabilityFound();
        return agentCapabilities[agentId][0];
    }

    function getCapabilityAt(uint256 agentId, uint256 index) external view returns (Capability memory) {
        if (!agents[agentId].isRegistered) revert NotRegistered();
        if (index >= agentCapabilities[agentId].length) revert InvalidCapabilityIndex();
        return agentCapabilities[agentId][index];
    }

    function getCapabilities(uint256 agentId) external view returns (Capability[] memory) {
        if (!agents[agentId].isRegistered) revert NotRegistered();
        return agentCapabilities[agentId];
    }

    function getCapabilityCount(uint256 agentId) external view returns (uint256) {
        if (!agents[agentId].isRegistered) revert NotRegistered();
        return agentCapabilities[agentId].length;
    }

    function hasCapabilityId(uint256 agentId, uint32 skillId)
        external
        view
        returns (bool exists, bool requiresUserAuthorization, bool isActive)
    {
        if (!agents[agentId].isRegistered) revert NotRegistered();

        Capability[] storage capabilities = agentCapabilities[agentId];

        for (uint256 i = 0; i < capabilities.length; i++) {
            if (capabilities[i].skillId == skillId) {
                return (true, capabilities[i].requiresUserAuthorization, capabilities[i].active);
            }
        }

        return (false, false, false);
    }

    function hasCapability(uint256 agentId, string calldata capability)
        external
        view
        returns (bool exists, bool requiresUserAuthorization, bool isActive)
    {
        if (!agents[agentId].isRegistered) revert NotRegistered();

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
        if (!agent.isRegistered) revert NotRegistered();
        if (newTrustScore > MAX_TRUST_SCORE) revert TrustScoreOutOfRange();

        uint256 oldScore = agent.trustScore;
        agent.trustScore = newTrustScore;

        emit TrustScoreUpdated(agentId, oldScore, newTrustScore);
    }

    function getAgentTrustScore(uint256 agentId) external view returns (uint256) {
        Agent memory agent = agents[agentId];
        if (!agent.isRegistered) revert NotRegistered();
        return agent.trustScore;
    }

    function isAgentDeterministic(uint256 agentId) external view returns (bool) {
        Agent memory agent = agents[agentId];
        if (!agent.isRegistered) revert NotRegistered();
        return agent.isDeterministic;
    }

    function _buildCapability(CapabilityInput calldata capabilityInput, uint8 riskLevel)
        internal
        pure
        returns (Capability memory)
    {
        _validateSkillId(capabilityInput.skillId);

        return Capability({
            skillId: capabilityInput.skillId,
            name: capabilityInput.name,
            description: capabilityInput.description,
            expectedReasoning: capabilityInput.expectedReasoning,
            outputSchema: capabilityInput.outputSchema,
            domain: capabilityInput.domain,
            requiresUserAuthorization: riskLevel > 0,
            active: true
        });
    }

    function _validateSkillId(uint32 skillId) internal pure {
        if (skillId > 39 && skillId < 100) revert SkillIdReserved();
    }
}
