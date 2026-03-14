// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract StakingManager {
    using Address for address payable;

    struct StakeInfo {
        uint256 amount;
        uint256 riskLevel;
        address owner;
        bool active;
    }

    uint256 public constant TRUST_POINTS_BASE = 100;

    address public owner;
    address public agentRegistry;

    mapping(uint256 => StakeInfo) public agentStakes;

    uint256 public minTrustThreshold;

    event Staked(uint256 indexed agentId, uint256 amount, address indexed owner);
    event Slashed(uint256 indexed agentId, uint256 amount);
    event Unstaked(uint256 indexed agentId, uint256 amount, address indexed owner);
    event Liquidated(uint256 indexed agentId, address indexed bonusReceiver, uint256 bonusAmount, uint256 seizedAmount);
    event AgentRegistryUpdated(address indexed agentRegistry);
    event MinTrustThresholdUpdated(uint256 threshold);


// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   MODIFIERS, CONSTRUCTOR, SETTER
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAgentRegistry() {
        require(msg.sender == agentRegistry, "Only agent registry");
        _;
    }

    constructor() {
        owner = msg.sender;
        minTrustThreshold = 40;
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        require(_agentRegistry != address(0), "Invalid agent registry");
        agentRegistry = _agentRegistry;
        emit AgentRegistryUpdated(_agentRegistry);
    }

    function setMinTrustThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold <= TRUST_POINTS_BASE, "Invalid threshold");
        minTrustThreshold = _threshold;
        emit MinTrustThresholdUpdated(_threshold);
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                      MAIN FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    // Called by AgentRegistry at registration; stake custody stays in this contract.
    function stakeForAgent(uint256 agentId, address agentOwner, uint256 riskLevel) external payable onlyAgentRegistry {
        require(agentId > 0, "Invalid agent id");
        require(agentOwner != address(0), "Invalid owner");

        StakeInfo storage info = agentStakes[agentId];
        require(!info.active, "Stake already active");

        agentStakes[agentId] = StakeInfo({amount: msg.value, riskLevel: riskLevel, owner: agentOwner, active: true});

        emit Staked(agentId, msg.value, agentOwner);
    }

    function unstake(uint256 agentId) external {
        require(agentRegistry != address(0), "Agent registry not set");
        require(agentId > 0, "Invalid agent id");

        StakeInfo storage info = agentStakes[agentId];
        require(info.active, "No active stake");
        require(info.owner == msg.sender, "Only agent owner");

        IAgentRegistry.Agent memory agent = IAgentRegistry(agentRegistry).getAgent(agentId);
        require(!agent.revoked, "Revoked agent cannot unstake");

        _slashFromTrust(agentId);

        uint256 payout = info.amount;
        info.amount = 0;
        info.active = false;

        if (payout > 0) {
            payable(info.owner).sendValue(payout);
        }

        emit Unstaked(agentId, payout, info.owner);
    }

    // Called by AgentRegistry during revocation. Sends bounty and seizes remaining stake.
    function liquidateAgent(uint256 agentId, address bonusReceiver, uint256 bountyBps)
        external
        onlyAgentRegistry
        returns (uint256 bonusAmount, uint256 seizedAmount)
    {
        require(agentId > 0, "Invalid agent id");
        require(bonusReceiver != address(0), "Invalid bonus receiver");
        require(bountyBps <= 10_000, "Invalid bounty bps");

        StakeInfo storage info = agentStakes[agentId];
        require(info.active, "No active stake");

        uint256 remainingStakeAmount = info.amount;
        bonusAmount = (remainingStakeAmount * bountyBps) / 10_000;
        seizedAmount = remainingStakeAmount - bonusAmount;

        info.amount = 0;
        info.active = false;

        if (bonusAmount > 0) {
            payable(bonusReceiver).sendValue(bonusAmount);
        }

        emit Liquidated(agentId, bonusReceiver, bonusAmount, seizedAmount);
    }

    function getStakeAmount(uint256 agentId) external view returns (uint256) {
        return agentStakes[agentId].amount;
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   EXTERNAL VIEW, INTERNAL FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    function _slashFromTrust(uint256 agentId) internal {
        StakeInfo storage info = agentStakes[agentId];
        if (!info.active || info.amount == 0) return;

        IAgentRegistry.Agent memory agent = IAgentRegistry(agentRegistry).getAgent(agentId);

        if (agent.trustScore >= TRUST_POINTS_BASE) return;
        if (agent.trustScore >= minTrustThreshold) return;

        uint256 slashed = (info.amount * (TRUST_POINTS_BASE - agent.trustScore)) / TRUST_POINTS_BASE;
        if (slashed >= info.amount) {
            slashed = info.amount;
        }

        if (slashed > 0) {
            info.amount -= slashed;
            emit Slashed(agentId, slashed);
        }
    }

    // for testing so native tokens do not get stuck
    function withdrawAmount() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No balance");

        payable(owner).sendValue(bal);
    }

    receive() external payable {}
}
