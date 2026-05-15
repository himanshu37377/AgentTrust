// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingManager {
    function quoteStake(uint8 riskLevel) external pure returns (uint256);
    function stakeForAgent(address agent, uint8 riskLevel) external payable;
    function slashStake(address agent, uint256 bps) external returns (uint256);
    function getStakeAmount(address agent) external view returns (uint256);
}
