// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";

contract AgentSearch {
    address public owner;
    address public agentRegistry;

    event AgentRegistryUpdated(address indexed agentRegistry);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _agentRegistry) {
        require(_agentRegistry != address(0), "Invalid agent registry");
        owner = msg.sender;
        agentRegistry = _agentRegistry;
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        require(_agentRegistry != address(0), "Invalid agent registry");
        agentRegistry = _agentRegistry;
        emit AgentRegistryUpdated(_agentRegistry);
    }

    function getAgent(uint256 agentId) external view returns (IAgentRegistry.Agent memory) {
        require(agentId > 0, "Invalid agent id");
        return IAgentRegistry(agentRegistry).getAgent(agentId);
    }

    function getCapability(uint256 agentId) external view returns (IAgentRegistry.Capability memory) {
        require(agentId > 0, "Invalid agent id");
        return IAgentRegistry(agentRegistry).getCapability(agentId);
    }

    function getCapabilities(uint256 agentId) external view returns (IAgentRegistry.Capability[] memory) {
        require(agentId > 0, "Invalid agent id");
        return IAgentRegistry(agentRegistry).getCapabilities(agentId);
    }

    function getAgentTrustScore(uint256 agentId) external view returns (uint256) {
        require(agentId > 0, "Invalid agent id");
        return IAgentRegistry(agentRegistry).getAgentTrustScore(agentId);
    }

    // Score = TrustScore + Rating + CapabilityScore
    function getRankingScore(uint256 agentId) external view returns (uint256) {
        require(agentId > 0, "Invalid agent id");
        IAgentRegistry.Agent memory agent = IAgentRegistry(agentRegistry).getAgent(agentId);
        uint256 capabilityScore = _getCapabilityScore(agentId);
        return agent.trustScore + uint256(agent.rating) + capabilityScore;
    }

    // Backend-friendly batch fetch for paginated sync.
    function getAgentsBatch(uint256 fromAgentId, uint256 toAgentId)
        external
        view
        returns (IAgentRegistry.Agent[] memory results)
    {
        require(fromAgentId > 0, "Invalid from id");
        require(toAgentId >= fromAgentId, "Invalid range");

        uint256 size = toAgentId - fromAgentId + 1;
        IAgentRegistry.Agent[] memory temp = new IAgentRegistry.Agent[](size);
        uint256 count = 0;

        for (uint256 id = fromAgentId; id <= toAgentId; id++) {
            try IAgentRegistry(agentRegistry).getAgent(id) returns (IAgentRegistry.Agent memory agent) {
                temp[count] = agent;
                count++;
            } catch {
                // skip missing/unregistered ids
            }
        }

        results = new IAgentRegistry.Agent[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = temp[i];
        }
    }

    function getAgentRankBatch(uint256 fromAgentId, uint256 toAgentId)
        external
        view
        returns (uint256[] memory agentIds, uint256[] memory scores)
    {
        require(fromAgentId > 0, "Invalid from id");
        require(toAgentId >= fromAgentId, "Invalid range");

        uint256 size = toAgentId - fromAgentId + 1;
        uint256[] memory tempIds = new uint256[](size);
        uint256[] memory tempScores = new uint256[](size);
        uint256 count = 0;

        for (uint256 id = fromAgentId; id <= toAgentId; id++) {
            try IAgentRegistry(agentRegistry).getAgent(id) returns (IAgentRegistry.Agent memory agent) {
                uint256 capabilityScore = _getCapabilityScore(id);
                tempIds[count] = id;
                tempScores[count] = agent.trustScore + uint256(agent.rating) + capabilityScore;
                count++;
            } catch {}
        }

        agentIds = new uint256[](count);
        scores = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            agentIds[i] = tempIds[i];
            scores[i] = tempScores[i];
        }
    }

    function _getCapabilityScore(uint256 agentId) internal view returns (uint256) {
        IAgentRegistry.Capability[] memory capabilities = IAgentRegistry(agentRegistry).getCapabilities(agentId);
        uint256 score = 0;

        for (uint256 i = 0; i < capabilities.length; i++) {
            if (capabilities[i].active && bytes(capabilities[i].name).length > 0) {
                score++;
            }
        }

        return score;
    }
}
