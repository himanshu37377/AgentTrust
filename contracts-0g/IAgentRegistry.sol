// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentRegistry {
    struct Agent {
        string agentId;
        string name;
        string description;
        string capabilities;
        string metadataHash;
        uint256 trustScore;
        uint8 riskLevel;
        bool isDeterministic;
        uint256 stakeAmount;
        bool exists;
        bool revoked;
    }

    function exists(address agent) external view returns (bool);
    function getAgent(address agent) external view returns (Agent memory);
    function updateMetadataHash(address agent, string calldata metadataHash) external;
    function setAgentTrustScore(address agent, uint256 newTrustScore) external;
    function syncStakeAmount(address agent, uint256 newStakeAmount) external;
}
