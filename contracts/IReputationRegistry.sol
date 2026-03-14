// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReputationRegistry {
    function getTrustScore(uint256 agentId) external view returns (uint256);
}
