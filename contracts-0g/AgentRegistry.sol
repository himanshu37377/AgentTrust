// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";
import "./IStakingManager.sol";

contract AgentRegistry is IAgentRegistry {
    struct CapabilityInput {
        uint32 skillId;
        string name;
        string description;
        string expectedReasoning;
        string outputSchema;
        string domain;
    }

    struct RegistrationProfile {
        string agentId;
        string name;
        string description;
        string capabilities;
    }

    uint256 public constant INITIAL_TRUST_SCORE = 50;
    uint256 public constant REVOKE_TRUST_THRESHOLD = 20;
    uint8 public constant MIN_RISK_LEVEL = 0;
    uint8 public constant MAX_RISK_LEVEL = 2;

    address public owner;
    address public trustManager;
    address public stakingManager;
    address public validationRegistry;

    mapping(address => Agent) private agents;
    mapping(string => address) public agentIdToOwner;

    event AgentRegistered(
        address indexed agent, string indexed agentId, string metadataHash, uint8 riskLevel, bool isDeterministic
    );
    event MetadataHashUpdated(address indexed agent, string previousHash, string newHash);
    event TrustManagerUpdated(address indexed trustManager);
    event StakingManagerUpdated(address indexed stakingManager);
    event ValidationRegistryUpdated(address indexed validationRegistry);
    event TrustScoreUpdated(address indexed agent, uint256 previousScore, uint256 newScore);
    event StakeAmountSynced(address indexed agent, uint256 newStakeAmount);
    event AgentRevoked(address indexed agent);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyTrustManager() {
        require(msg.sender == trustManager, "Only trust manager");
        _;
    }

    modifier onlyStakingManager() {
        require(msg.sender == stakingManager, "Only staking manager");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setTrustManager(address _trustManager) external onlyOwner {
        require(_trustManager != address(0), "Invalid trust manager");
        trustManager = _trustManager;
        emit TrustManagerUpdated(_trustManager);
    }

    function setStakingManager(address _stakingManager) external onlyOwner {
        require(_stakingManager != address(0), "Invalid staking manager");
        stakingManager = _stakingManager;
        emit StakingManagerUpdated(_stakingManager);
    }

    function setValidationRegistry(address _validationRegistry) external onlyOwner {
        require(_validationRegistry != address(0), "Invalid validation registry");
        validationRegistry = _validationRegistry;
        emit ValidationRegistryUpdated(_validationRegistry);
    }

    function registerAgent(
        string calldata agentId,
        string calldata name,
        string calldata description,
        string calldata capabilities,
        string calldata metadataHash
    ) external payable {
        _registerAgent(agentId, name, description, capabilities, metadataHash, 0, false);
    }

    function registerAgentWithProfile(
        string calldata agentId,
        string calldata name,
        string calldata description,
        string calldata capabilities,
        string calldata metadataHash,
        uint8 riskLevel,
        bool isDeterministic
    ) external payable {
        _registerAgent(agentId, name, description, capabilities, metadataHash, riskLevel, isDeterministic);
    }

    function registerAgent(
        string calldata metadataHash,
        CapabilityInput calldata capabilityInput,
        uint8 riskLevel,
        bool isDeterministic
    ) external payable {
        RegistrationProfile memory profile = _buildCapabilityRegistration(capabilityInput);
        _registerAgent(
            profile.agentId,
            profile.name,
            profile.description,
            profile.capabilities,
            metadataHash,
            riskLevel,
            isDeterministic
        );
    }

    function _registerAgent(
        string memory agentId,
        string memory name,
        string memory description,
        string memory capabilities,
        string memory metadataHash,
        uint8 riskLevel,
        bool isDeterministic
    ) internal {
        _validateRegistration(agentId);
        require(riskLevel >= MIN_RISK_LEVEL && riskLevel <= MAX_RISK_LEVEL, "Invalid risk level");
        _processStake(riskLevel);
        _writeAgentProfile(agentId, name, description, capabilities, metadataHash, riskLevel, isDeterministic);

        agentIdToOwner[agentId] = msg.sender;
        emit AgentRegistered(msg.sender, agentId, metadataHash, riskLevel, isDeterministic);
    }

    function _writeAgentProfile(
        string memory agentId,
        string memory name,
        string memory description,
        string memory capabilities,
        string memory metadataHash,
        uint8 riskLevel,
        bool isDeterministic
    ) internal {
        Agent storage profile = agents[msg.sender];
        profile.agentId = agentId;
        profile.name = name;
        profile.description = description;
        profile.capabilities = capabilities;
        profile.metadataHash = metadataHash;
        profile.trustScore = INITIAL_TRUST_SCORE;
        profile.riskLevel = riskLevel;
        profile.isDeterministic = isDeterministic;
        profile.stakeAmount = msg.value;
        profile.exists = true;
        profile.revoked = false;
    }

    function _buildCapabilityRegistration(CapabilityInput calldata capabilityInput)
        internal
        view
        returns (RegistrationProfile memory profile)
    {
        profile.agentId = string.concat("agent-", _addressSuffix(msg.sender));
        profile.name = bytes(capabilityInput.name).length > 0 ? capabilityInput.name : "Agent";
        profile.description = bytes(capabilityInput.description).length > 0
            ? capabilityInput.description
            : "0G-native autonomous agent";
        profile.capabilities = bytes(capabilityInput.domain).length > 0
            ? string.concat(capabilityInput.name, ", ", capabilityInput.domain)
            : capabilityInput.name;
    }

    function _validateRegistration(string memory agentId) internal view {
        require(!agents[msg.sender].exists, "Agent already exists");
        require(bytes(agentId).length > 0, "Invalid agent id");
        require(agentIdToOwner[agentId] == address(0), "Agent id already exists");
    }

    function _processStake(uint8 riskLevel) internal {
        if (stakingManager == address(0)) {
            require(msg.value == 0, "Invalid stake amount");
            return;
        }

        uint256 requiredStake = IStakingManager(stakingManager).quoteStake(riskLevel);
        require(msg.value >= requiredStake, "Invalid stake amount");
        if (requiredStake > 0) {
            IStakingManager(stakingManager).stakeForAgent{value: msg.value}(msg.sender, riskLevel);
        }
    }

    function updateMetadataHash(address agent, string calldata metadataHash) external {
        Agent storage profile = agents[agent];
        require(profile.exists, "Agent not found");
        require(!profile.revoked, "Agent revoked");

        bool authorized = msg.sender == agent || msg.sender == trustManager || msg.sender == validationRegistry;
        require(authorized, "Unauthorized metadata update");

        string memory previousHash = profile.metadataHash;
        profile.metadataHash = metadataHash;
        emit MetadataHashUpdated(agent, previousHash, metadataHash);
    }

    function setAgentTrustScore(address agent, uint256 newTrustScore) external onlyTrustManager {
        Agent storage profile = agents[agent];
        require(profile.exists, "Agent not found");

        uint256 previousScore = profile.trustScore;
        profile.trustScore = newTrustScore;
        emit TrustScoreUpdated(agent, previousScore, newTrustScore);
    }

    function syncStakeAmount(address agent, uint256 newStakeAmount) external onlyStakingManager {
        Agent storage profile = agents[agent];
        require(profile.exists, "Agent not found");

        profile.stakeAmount = newStakeAmount;
        emit StakeAmountSynced(agent, newStakeAmount);
    }

    function revokeAgent(address agent) external {
        Agent storage profile = agents[agent];
        require(profile.exists, "Agent not found");
        require(!profile.revoked, "Agent revoked");
        require(profile.trustScore <= REVOKE_TRUST_THRESHOLD, "Revocation criteria not met");
        require(msg.sender == owner || msg.sender == trustManager, "Only owner");

        profile.revoked = true;
        emit AgentRevoked(agent);
    }

    function getAgent(address agent) external view returns (Agent memory result) {
        Agent storage a = agents[agent];
        result.agentId = a.agentId;
        result.name = a.name;
        result.description = a.description;
        result.capabilities = a.capabilities;
        result.metadataHash = a.metadataHash;
        result.trustScore = a.trustScore;
        result.riskLevel = a.riskLevel;
        result.isDeterministic = a.isDeterministic;
        result.stakeAmount = a.stakeAmount;
        result.exists = a.exists;
        result.revoked = a.revoked;
    }

    function getAgentByOwner(address ownerAddress) external view returns (Agent memory result) {
        Agent storage a = agents[ownerAddress];
        result.agentId = a.agentId;
        result.name = a.name;
        result.description = a.description;
        result.capabilities = a.capabilities;
        result.metadataHash = a.metadataHash;
        result.trustScore = a.trustScore;
        result.riskLevel = a.riskLevel;
        result.isDeterministic = a.isDeterministic;
        result.stakeAmount = a.stakeAmount;
        result.exists = a.exists;
        result.revoked = a.revoked;
    }

    function exists(address agent) external view returns (bool) {
        return agents[agent].exists;
    }

    function calculateStakeAmount(uint8 riskLevel) external view returns (uint256) {
        if (stakingManager == address(0)) {
            return 0;
        }

        return IStakingManager(stakingManager).quoteStake(riskLevel);
    }

    function agentNFT() external pure returns (address) {
        return address(0);
    }

    function _addressSuffix(address account) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes20 data = bytes20(account);
        bytes memory str = new bytes(8);

        for (uint256 i = 0; i < 4; i++) {
            str[i * 2] = alphabet[uint8(data[16 + i] >> 4)];
            str[1 + i * 2] = alphabet[uint8(data[16 + i] & 0x0f)];
        }

        return string(str);
    }
}
