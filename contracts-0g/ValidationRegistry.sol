// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";
import "./ITrustManager.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract ValidationRegistry {
    using Address for address payable;

    struct Execution {
        uint256 executionId;
        address agent;
        address submitter;
        string storageHash;
        bytes32 executionCommitment;
        bytes32 reasoningHash;
        bool isDeterministic;
        uint256 approvals;
        uint256 rejections;
        bool finalized;
        bool accepted;
        uint256 createdAt;
    }

    struct ValidatorInfo {
        bool isRegistered;
        bool active;
        uint256 stakedAmount;
        uint256 reputationScore;
        uint256 successfulValidations;
        uint256 failedValidations;
        uint256 slashCount;
        uint256 cooldownEnd;
        uint256 lastValidationAt;
    }

    struct ExecutionInput {
        address agent;
        string storageHash;
        bytes32 executionCommitment;
        bytes32 reasoningHash;
        bool isDeterministic;
    }

    uint256 public constant BPS_BASE = 10_000;
    uint256 public constant VALIDATOR_STAKE_REQUIREMENT = 5 ether;
    uint256 public constant VALIDATOR_UNSTAKE_COOLDOWN = 1 days;
    uint256 public constant INITIAL_REPUTATION = 60;
    uint256 public constant MAX_REPUTATION = 100;
    uint256 public constant REPUTATION_DECAY_INTERVAL = 7 days;
    uint256 public constant REPUTATION_DECAY_AMOUNT = 2;
    uint256 public constant DETERMINISTIC_SLASH_BPS = 2_000;

    address public owner;
    address public agentRegistry;
    address public trustManager;
    address public stakingManager;

    uint256 public approvalThresholdBps = 6_600;
    uint256 public minVotesForFinalization = 2;
    uint256 public executionCounter;

    mapping(uint256 => Execution) private executions;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public voteChoice;
    mapping(uint256 => mapping(address => bool)) public deterministicSlashResolved;
    mapping(uint256 => address[]) private executionVoters;
    mapping(address => ValidatorInfo) public validators;

    event AgentRegistryUpdated(address indexed agentRegistry);
    event TrustManagerUpdated(address indexed trustManager);
    event StakingManagerUpdated(address indexed stakingManager);
    event ValidatorRegistered(address indexed validator, uint256 stakedAmount);
    event ValidatorStakeToppedUp(address indexed validator, uint256 amount, uint256 totalStake);
    event ValidatorUnregistered(address indexed validator, uint256 refundedAmount);
    event ValidatorUnstakeRequested(address indexed validator, uint256 cooldownEnd);
    event ValidatorSlashed(address indexed validator, uint256 amount, uint256 slashCount, string reason);
    event ValidatorReputationUpdated(address indexed validator, uint256 previousScore, uint256 newScore, int256 delta);
    event ExecutionSubmitted(
        uint256 indexed executionId, address indexed agent, string storageHash, bool isDeterministic
    );
    event VoteSubmitted(uint256 indexed executionId, address indexed validator, bool approve);
    event DeterministicExecutionVerified(uint256 indexed executionId, bool accepted);
    event ExecutionFinalized(uint256 indexed executionId, bool accepted, uint256 approvals, uint256 rejections);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
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

    function setTrustManager(address _trustManager) external onlyOwner {
        require(_trustManager != address(0), "Invalid trust manager");
        trustManager = _trustManager;
        emit TrustManagerUpdated(_trustManager);
    }

    function setStakingManager(address _stakingManager) external onlyOwner {
        require(_stakingManager != address(0), "Invalid staking manager");
        stakingManager = _stakingManager;
        emit StakingManagerUpdated(_stakingManager);
    }

    function stakeValidator(uint256 amount) public payable {
        require(msg.value == amount && amount > 0, "Insufficient validator stake");

        ValidatorInfo storage validator = validators[msg.sender];
        uint256 updatedStake = validator.stakedAmount + amount;
        require(updatedStake >= VALIDATOR_STAKE_REQUIREMENT, "Insufficient validator stake");

        if (!validator.isRegistered) {
            validator.isRegistered = true;
            validator.reputationScore = INITIAL_REPUTATION;
            emit ValidatorRegistered(msg.sender, updatedStake);
        } else {
            emit ValidatorStakeToppedUp(msg.sender, amount, updatedStake);
        }

        validator.active = true;
        validator.stakedAmount = updatedStake;
        validator.cooldownEnd = 0;
    }

    function registerValidator() external payable {
        stakeValidator(msg.value);
    }

    function topUpValidatorStake() external payable {
        require(validators[msg.sender].isRegistered, "Validator not registered");
        stakeValidator(msg.value);
    }

    function unstakeValidator() public {
        ValidatorInfo storage validator = validators[msg.sender];
        require(validator.isRegistered, "Validator not registered");

        if (validator.cooldownEnd == 0) {
            validator.active = false;
            validator.cooldownEnd = block.timestamp + VALIDATOR_UNSTAKE_COOLDOWN;
            emit ValidatorUnstakeRequested(msg.sender, validator.cooldownEnd);
            return;
        }

        require(block.timestamp >= validator.cooldownEnd, "Cooldown active");

        uint256 refund = validator.stakedAmount;
        delete validators[msg.sender];
        if (refund > 0) {
            payable(msg.sender).sendValue(refund);
        }

        emit ValidatorUnregistered(msg.sender, refund);
    }

    function unregisterValidator() external {
        unstakeValidator();
    }

    function submitExecution(
        address agent,
        string calldata storageHash,
        bytes32 executionCommitment,
        bytes32 reasoningHash,
        bool isDeterministic
    ) external returns (uint256 executionId) {
        ExecutionInput memory input = ExecutionInput({
            agent: agent,
            storageHash: storageHash,
            executionCommitment: executionCommitment,
            reasoningHash: reasoningHash,
            isDeterministic: isDeterministic
        });

        return _submitExecution(input);
    }

    function verifyDeterministicExecution(uint256 executionId, bytes32 expectedHash) external {
        Execution storage exec = executions[executionId];
        require(exec.executionId != 0, "Invalid execution");
        require(!exec.finalized, "Already finalized");
        require(
            msg.sender == exec.agent || msg.sender == exec.submitter || msg.sender == owner,
            "Unauthorized execution actor"
        );

        bool accepted = exec.executionCommitment == expectedHash;
        _finalize(executionId, accepted);
        emit DeterministicExecutionVerified(executionId, accepted);
    }

    function voteExecution(uint256 executionId, bool approve) external {
        ValidatorInfo storage validator = validators[msg.sender];
        require(validator.isRegistered && validator.active, "Validator not registered");

        Execution storage exec = executions[executionId];
        require(exec.executionId != 0, "Invalid execution");
        require(!exec.finalized, "Already finalized");
        require(!hasVoted[executionId][msg.sender], "Already voted");

        _applyReputationDecay(msg.sender);
        hasVoted[executionId][msg.sender] = true;
        voteChoice[executionId][msg.sender] = approve;

        if (approve) {
            exec.approvals += 1;
        } else {
            exec.rejections += 1;
        }

        executionVoters[executionId].push(msg.sender);
        validator.lastValidationAt = block.timestamp;

        emit VoteSubmitted(executionId, msg.sender, approve);
        _checkConsensus(executionId);
    }

    function slashValidator(address validator, uint256 amount) external onlyOwner {
        _slashValidator(validator, amount, "manual-protocol-slash");
    }

    function slashIncorrectDeterministicVote(uint256 executionId, address validator, bytes32 expectedHash) external {
        Execution storage exec = executions[executionId];
        require(exec.executionId != 0 && exec.isDeterministic && exec.finalized, "Invalid execution");
        require(hasVoted[executionId][validator], "Invalid slash");
        require(!deterministicSlashResolved[executionId][validator], "Duplicate slash resolution");

        bool objectivelyAccepted = exec.executionCommitment == expectedHash;
        bool validatorApproved = voteChoice[executionId][validator];

        require(validatorApproved != objectivelyAccepted, "Invalid slash");

        deterministicSlashResolved[executionId][validator] = true;
        ValidatorInfo storage profile = validators[validator];
        require(profile.isRegistered, "Validator not registered");

        uint256 slashAmount = (profile.stakedAmount * DETERMINISTIC_SLASH_BPS) / BPS_BASE;
        if (slashAmount == 0) {
            slashAmount = profile.stakedAmount;
        }

        _slashValidator(validator, slashAmount, "deterministic-misvalidation");
    }

    function updateReputation(address validator, int256 delta) external onlyOwner {
        _adjustReputation(validator, delta);
    }

    function getExecution(uint256 executionId) external view returns (Execution memory) {
        return executions[executionId];
    }

    function getValidator(address validator) external view returns (ValidatorInfo memory) {
        ValidatorInfo memory profile = validators[validator];
        if (profile.isRegistered && profile.lastValidationAt > 0) {
            uint256 decaySteps = (block.timestamp - profile.lastValidationAt) / REPUTATION_DECAY_INTERVAL;
            if (decaySteps > 0) {
                uint256 decay = decaySteps * REPUTATION_DECAY_AMOUNT;
                profile.reputationScore = profile.reputationScore > decay ? profile.reputationScore - decay : 0;
            }
        }
        return profile;
    }

    function _checkConsensus(uint256 executionId) internal {
        Execution storage exec = executions[executionId];
        uint256 totalVotes = exec.approvals + exec.rejections;

        if (totalVotes < minVotesForFinalization) {
            return;
        }

        uint256 approvalBps = (exec.approvals * BPS_BASE) / totalVotes;
        uint256 rejectionBps = (exec.rejections * BPS_BASE) / totalVotes;

        if (approvalBps >= approvalThresholdBps) {
            _finalize(executionId, true);
            return;
        }

        if (rejectionBps >= approvalThresholdBps) {
            _finalize(executionId, false);
        }
    }

    function _finalize(uint256 executionId, bool accepted) internal {
        Execution storage exec = executions[executionId];
        require(!exec.finalized, "Already finalized");

        exec.finalized = true;
        exec.accepted = accepted;

        if (trustManager != address(0)) {
            ITrustManager(trustManager).recordValidatedInteraction(exec.agent, exec.storageHash, accepted);
        }

        _adjustVoteOutcomes(executionId, accepted);
        emit ExecutionFinalized(executionId, accepted, exec.approvals, exec.rejections);
    }

    function _adjustVoteOutcomes(uint256 executionId, bool accepted) internal {
        address[] memory voters = executionVoters[executionId];
        for (uint256 i = 0; i < voters.length; i++) {
            address validator = voters[i];
            ValidatorInfo storage profile = validators[validator];
            if (!profile.isRegistered) {
                continue;
            }

            bool approved = voteChoice[executionId][validator];
            if (approved == accepted) {
                profile.successfulValidations += 1;
                _adjustReputation(validator, 2);
            } else {
                profile.failedValidations += 1;
                _adjustReputation(validator, -2);
            }

            profile.lastValidationAt = block.timestamp;
        }
    }

    function _adjustReputation(address validator, int256 delta) internal {
        ValidatorInfo storage profile = validators[validator];
        require(profile.isRegistered, "Validator not registered");

        uint256 previousScore = profile.reputationScore;
        if (delta >= 0) {
            uint256 nextScore = previousScore + uint256(delta);
            profile.reputationScore = nextScore > MAX_REPUTATION ? MAX_REPUTATION : nextScore;
        } else {
            uint256 absDelta = uint256(-delta);
            profile.reputationScore = previousScore > absDelta ? previousScore - absDelta : 0;
        }

        emit ValidatorReputationUpdated(validator, previousScore, profile.reputationScore, delta);
    }

    function _applyReputationDecay(address validator) internal {
        ValidatorInfo storage profile = validators[validator];
        if (!profile.isRegistered || profile.lastValidationAt == 0) {
            return;
        }

        uint256 decaySteps = (block.timestamp - profile.lastValidationAt) / REPUTATION_DECAY_INTERVAL;
        if (decaySteps == 0) {
            return;
        }

        uint256 decay = decaySteps * REPUTATION_DECAY_AMOUNT;
        uint256 previousScore = profile.reputationScore;
        profile.reputationScore = previousScore > decay ? previousScore - decay : 0;
        profile.lastValidationAt = block.timestamp;

        emit ValidatorReputationUpdated(validator, previousScore, profile.reputationScore, -int256(decay));
    }

    function _submitExecution(ExecutionInput memory input) internal returns (uint256 executionId) {
        _validateExecutionInput(input);

        executionId = ++executionCounter;
        executions[executionId] = Execution({
            executionId: executionId,
            agent: input.agent,
            submitter: msg.sender,
            storageHash: input.storageHash,
            executionCommitment: input.executionCommitment,
            reasoningHash: input.reasoningHash,
            isDeterministic: input.isDeterministic,
            approvals: 0,
            rejections: 0,
            finalized: false,
            accepted: false,
            createdAt: block.timestamp
        });

        emit ExecutionSubmitted(executionId, input.agent, input.storageHash, input.isDeterministic);
    }

    function _validateExecutionInput(ExecutionInput memory input) internal view {
        require(agentRegistry != address(0), "Invalid agent registry");
        require(input.executionCommitment != bytes32(0), "Invalid execution");
        require(input.isDeterministic || input.reasoningHash != bytes32(0), "Invalid execution");

        IAgentRegistry.Agent memory profile = IAgentRegistry(agentRegistry).getAgent(input.agent);
        require(profile.exists && !profile.revoked, "Agent not registered");
    }

    function _slashValidator(address validator, uint256 amount, string memory reason) internal {
        ValidatorInfo storage profile = validators[validator];
        require(profile.isRegistered && profile.stakedAmount > 0, "Validator not registered");

        uint256 slashAmount = amount > profile.stakedAmount ? profile.stakedAmount : amount;
        profile.stakedAmount -= slashAmount;
        profile.slashCount += 1;
        profile.failedValidations += 1;
        if (profile.stakedAmount < VALIDATOR_STAKE_REQUIREMENT) {
            profile.active = false;
        }

        _adjustReputation(validator, -15);
        emit ValidatorSlashed(validator, slashAmount, profile.slashCount, reason);
    }
}
