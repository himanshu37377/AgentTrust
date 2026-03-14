// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentRegistry {
    struct Capability {
        string name;
        string description;
        string expectedReasoning;
        string outputSchema;
        string domain;
        bool requiresUserAuthorization;
        bool active;
    }

    struct Agent {
        bool isRegistered;
        address owner;
        string metadataURI;
        uint256 trustScore;
        uint8 rating;
        uint8 riskLevel;
        bool isDeterministic;
        uint256 stakeAmount;
        bool revoked;
        uint256 createdAt;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory);
    function getCapability(uint256 agentId) external view returns (Capability memory);
    function getCapabilityAt(uint256 agentId, uint256 index) external view returns (Capability memory);
    function getCapabilities(uint256 agentId) external view returns (Capability[] memory);
    function getCapabilityCount(uint256 agentId) external view returns (uint256);
    function hasCapability(uint256 agentId, string calldata capability)
        external
        view
        returns (bool exists, bool requiresUserAuthorization, bool isActive);
    function getAgentTrustScore(uint256 agentId) external view returns (uint256);
    function setAgentTrustScore(uint256 agentId, uint256 newTrustScore) external;
    function isAgentDeterministic(uint256 agentId) external view returns (bool);
}
