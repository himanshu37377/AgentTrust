// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";
import "./IReputationRegistry.sol";

contract AgentDiscovery {
    uint256 public constant MAX_RESULTS = 10;

    address public owner;
    address public agentRegistry;
    address public reputationRegistry;
    uint256 public minTrustScore;

    mapping(bytes32 => uint256[]) private capabilityAgents;
    mapping(uint256 => mapping(bytes32 => bool)) public agentCapability;

    event AgentRegistryUpdated(address indexed agentRegistry);
    event ReputationRegistryUpdated(address indexed reputationRegistry);
    event MinTrustScoreUpdated(uint256 minTrustScore);
    event AgentCapabilityIndexed(uint256 indexed agentId, bytes32 indexed capabilityHash);
    event AgentDiscovered(bytes32 indexed capabilityHash, uint256 indexed agentId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _agentRegistry, address _reputationRegistry) {
        owner = msg.sender;
        agentRegistry = _agentRegistry;
        reputationRegistry = _reputationRegistry;
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        agentRegistry = _agentRegistry;
        emit AgentRegistryUpdated(_agentRegistry);
    }

    function setReputationRegistry(address _reputationRegistry) external onlyOwner {
        reputationRegistry = _reputationRegistry;
        emit ReputationRegistryUpdated(_reputationRegistry);
    }

    function setMinTrustScore(uint256 _minTrustScore) external onlyOwner {
        minTrustScore = _minTrustScore;
        emit MinTrustScoreUpdated(_minTrustScore);
    }

    function indexAgentCapability(uint256 agentId, string calldata capability) external {
        bytes32 capabilityHash = keccak256(bytes(capability));
        require(!agentCapability[agentId][capabilityHash], "Capability already indexed");

        capabilityAgents[capabilityHash].push(agentId);
        agentCapability[agentId][capabilityHash] = true;

        emit AgentCapabilityIndexed(agentId, capabilityHash);
    }

    function findAgentsByCapability(string calldata capability) external view returns (uint256[] memory) {
        bytes32 capabilityHash = keccak256(bytes(capability));
        return _getFilteredAgents(capabilityHash);
    }

    function getTopAgents(string calldata capability, uint256 limit) external view returns (uint256[] memory) {
        bytes32 capabilityHash = keccak256(bytes(capability));
        uint256[] memory filtered = _getFilteredAgents(capabilityHash);
        uint256 resultSize = limit > filtered.length ? filtered.length : limit;
        if (resultSize > MAX_RESULTS) {
            resultSize = MAX_RESULTS;
        }

        uint256[] memory topAgents = new uint256[](resultSize);
        bool[] memory used = new bool[](filtered.length);

        for (uint256 i = 0; i < resultSize; i++) {
            uint256 bestIndex = type(uint256).max;
            uint256 bestScore = 0;

            for (uint256 j = 0; j < filtered.length; j++) {
                if (used[j]) {
                    continue;
                }

                uint256 score = IReputationRegistry(reputationRegistry).getTrustScore(filtered[j]);
                if (bestIndex == type(uint256).max || score > bestScore) {
                    bestIndex = j;
                    bestScore = score;
                }
            }

            if (bestIndex == type(uint256).max) {
                break;
            }

            used[bestIndex] = true;
            topAgents[i] = filtered[bestIndex];
        }

        return topAgents;
    }

    function composeAgentPipeline(string[] calldata capabilities) external view returns (uint256[] memory) {
        uint256[] memory pipelineAgents = new uint256[](capabilities.length);

        for (uint256 i = 0; i < capabilities.length; i++) {
            bytes32 capabilityHash = keccak256(bytes(capabilities[i]));
            uint256[] memory filtered = _getFilteredAgents(capabilityHash);
            if (filtered.length == 0) {
                continue;
            }

            uint256 bestAgentId = filtered[0];
            uint256 bestScore = IReputationRegistry(reputationRegistry).getTrustScore(bestAgentId);

            for (uint256 j = 1; j < filtered.length; j++) {
                uint256 score = IReputationRegistry(reputationRegistry).getTrustScore(filtered[j]);
                if (score > bestScore) {
                    bestScore = score;
                    bestAgentId = filtered[j];
                }
            }

            pipelineAgents[i] = bestAgentId;
        }

        return pipelineAgents;
    }

    function _getFilteredAgents(bytes32 capabilityHash) internal view returns (uint256[] memory) {
        uint256[] memory indexedAgents = capabilityAgents[capabilityHash];
        uint256[] memory temp = new uint256[](indexedAgents.length);
        uint256 count = 0;

        for (uint256 i = 0; i < indexedAgents.length; i++) {
            uint256 agentId = indexedAgents[i];

            if (!_isEligibleAgent(agentId, capabilityHash)) {
                continue;
            }

            temp[count] = agentId;
            count++;
        }

        uint256[] memory filtered = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            filtered[i] = temp[i];
        }

        return filtered;
    }

    function _isEligibleAgent(uint256 agentId, bytes32 capabilityHash) internal view returns (bool) {
        IAgentRegistry.Agent memory agent;
        try IAgentRegistry(agentRegistry).getAgent(agentId) returns (IAgentRegistry.Agent memory fetchedAgent) {
            agent = fetchedAgent;
        } catch {
            return false;
        }

        if (agent.revoked) {
            return false;
        }

        if (!_hasActiveCapability(agentId, capabilityHash)) {
            return false;
        }

        return IReputationRegistry(reputationRegistry).getTrustScore(agentId) > minTrustScore;
    }

    function _hasActiveCapability(uint256 agentId, bytes32 capabilityHash) internal view returns (bool) {
        IAgentRegistry.Capability[] memory capabilities = IAgentRegistry(agentRegistry).getCapabilities(agentId);

        for (uint256 i = 0; i < capabilities.length; i++) {
            if (keccak256(bytes(capabilities[i].name)) == capabilityHash && capabilities[i].active) {
                return true;
            }
        }

        return false;
    }
}
