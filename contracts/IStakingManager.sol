// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingManager {
    function stakeForAgent(uint256 agentId, address agentOwner, uint256 riskLevel) external payable;

    function liquidateAgent(uint256 agentId, address bonusReceiver, uint256 bountyBps)
        external
        returns (uint256 bonusAmount, uint256 seizedAmount);

    function getStakeAmount(uint256 agentId) external view returns (uint256);
}
