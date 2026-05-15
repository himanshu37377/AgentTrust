// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";

contract TrustManager {
    struct Interaction {
        address agent;
        string storageHash;
        bool success;
        uint256 timestamp;
        string verifier;
    }

    uint256 public constant SUCCESS_REWARD = 5;
    uint256 public constant FAILURE_PENALTY = 3;
    uint256 public constant MAX_TRUST_SCORE = 100;

    address public owner;
    address public agentRegistry;
    address public validationRegistry;

    mapping(address => uint256) private trustScores;
    mapping(address => Interaction[]) private interactions;

    event AgentRegistryUpdated(address indexed agentRegistry);
    event ValidationRegistryUpdated(address indexed validationRegistry);
    event InteractionRecorded(address indexed agent, string storageHash, bool success, string verifier);
    event TrustScoreChanged(address indexed agent, uint256 previousScore, uint256 newScore, bool success);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyValidationRegistry() {
        require(msg.sender == validationRegistry, "Only validation registry");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        require(_agentRegistry != address(0), "Invalid agent registry");
        agentRegistry = _agentRegistry;
        emit AgentRegistryUpdated(_agentRegistry);
    }

    function setValidationRegistry(address _validationRegistry) external onlyOwner {
        require(_validationRegistry != address(0), "Invalid validation registry");
        validationRegistry = _validationRegistry;
        emit ValidationRegistryUpdated(_validationRegistry);
    }

    function recordInteraction(address agent, string calldata storageHash, bool success) external returns (uint256) {
        return _record(agent, storageHash, success, "direct-demo");
    }

    function recordValidatedInteraction(address agent, string calldata storageHash, bool success)
        external
        onlyValidationRegistry
        returns (uint256)
    {
        return _record(agent, storageHash, success, "validation-registry");
    }

    function _record(address agent, string calldata storageHash, bool success, string memory verifier)
        internal
        returns (uint256)
    {
        require(agentRegistry != address(0), "Agent registry not set");

        IAgentRegistry.Agent memory profile = IAgentRegistry(agentRegistry).getAgent(agent);
        require(profile.exists && !profile.revoked, "Agent not registered");
        require(!_isDirectDemo(verifier) || msg.sender == agent, "Unauthorized interaction recorder");

        uint256 currentTrustScore = profile.trustScore;
        uint256 updatedTrustScore = _calculateTrustScore(currentTrustScore, success);

        interactions[agent].push(
            Interaction({
                agent: agent,
                storageHash: storageHash,
                success: success,
                timestamp: block.timestamp,
                verifier: verifier
            })
        );

        trustScores[agent] = updatedTrustScore;
        IAgentRegistry(agentRegistry).updateMetadataHash(agent, storageHash);
        IAgentRegistry(agentRegistry).setAgentTrustScore(agent, updatedTrustScore);

        emit InteractionRecorded(agent, storageHash, success, verifier);
        emit TrustScoreChanged(agent, currentTrustScore, updatedTrustScore, success);

        return updatedTrustScore;
    }

    function _calculateTrustScore(uint256 currentTrustScore, bool success) internal pure returns (uint256) {
        if (success) {
            uint256 increased = currentTrustScore + SUCCESS_REWARD;
            return increased > MAX_TRUST_SCORE ? MAX_TRUST_SCORE : increased;
        }

        if (currentTrustScore > FAILURE_PENALTY) {
            return currentTrustScore - FAILURE_PENALTY;
        }

        return 0;
    }

    function _isDirectDemo(string memory verifier) internal pure returns (bool) {
        return keccak256(bytes(verifier)) == keccak256(bytes("direct-demo"));
    }

    function getTrustScore(address agent) external view returns (uint256) {
        if (trustScores[agent] == 0 && agentRegistry != address(0)) {
            IAgentRegistry.Agent memory profile = IAgentRegistry(agentRegistry).getAgent(agent);
            if (profile.exists) {
                return profile.trustScore;
            }
        }
        return trustScores[agent];
    }

    function getInteractionCount(address agent) external view returns (uint256) {
        return interactions[agent].length;
    }

    function getInteraction(address agent, uint256 index) external view returns (Interaction memory) {
        return interactions[agent][index];
    }
}
