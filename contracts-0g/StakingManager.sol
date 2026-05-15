// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract StakingManager {
    using Address for address payable;

    uint8 internal constant MIN_RISK_LEVEL = 0;
    uint8 internal constant MAX_RISK_LEVEL = 2;

    struct StakeInfo {
        uint256 amount;
        uint8 riskLevel;
        bool active;
    }

    uint256 internal constant LOW_RISK_STAKE = 0.01 ether;
    uint256 internal constant MEDIUM_RISK_STAKE = 0.03 ether;
    uint256 internal constant HIGH_RISK_STAKE = 0.05 ether;

    address public owner;
    address public agentRegistry;
    address public validationRegistry;

    mapping(address => StakeInfo) public stakes;

    event AgentRegistryUpdated(address indexed agentRegistry);
    event ValidationRegistryUpdated(address indexed validationRegistry);
    event StakeDeposited(address indexed agent, uint256 amount, uint8 riskLevel);
    event StakeSlashed(address indexed agent, uint256 amount, uint256 remainingStake);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAgentRegistry() {
        require(msg.sender == agentRegistry, "Only agent registry");
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

    function quoteStake(uint8 riskLevel) public pure returns (uint256) {
        require(riskLevel >= MIN_RISK_LEVEL && riskLevel <= MAX_RISK_LEVEL, "Invalid risk level");
        if (riskLevel == 0) return LOW_RISK_STAKE;
        if (riskLevel == 1) return MEDIUM_RISK_STAKE;
        return HIGH_RISK_STAKE;
    }

    function stakeForAgent(address agent, uint8 riskLevel) external payable onlyAgentRegistry {
        require(!stakes[agent].active, "Stake already active");

        uint256 requiredStake = quoteStake(riskLevel);
        require(msg.value >= requiredStake, "Invalid stake amount");

        stakes[agent] = StakeInfo({
            amount: msg.value,
            riskLevel: riskLevel,
            active: true
        });

        emit StakeDeposited(agent, msg.value, riskLevel);
    }

    function slashStake(address agent, uint256 bps) external onlyValidationRegistry returns (uint256) {
        StakeInfo storage info = stakes[agent];
        require(info.active, "No active stake");

        uint256 amountToSlash = (info.amount * bps) / 10_000;
        if (amountToSlash > info.amount) {
            amountToSlash = info.amount;
        }

        info.amount -= amountToSlash;
        IAgentRegistry(agentRegistry).syncStakeAmount(agent, info.amount);

        emit StakeSlashed(agent, amountToSlash, info.amount);
        return amountToSlash;
    }

    function getStakeAmount(address agent) external view returns (uint256) {
        return stakes[agent].amount;
    }
}
