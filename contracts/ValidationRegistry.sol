// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface IReputationRegistry {
    function updateTrustScore(uint256 agentId, bool accepted) external returns (uint256);
}

contract ValidationRegistry {
    using Address for address payable;

    struct Execution {
        uint256 executionId;
        uint256 agentId;
        uint256 parentExecutionId;
        uint256 callerAgentId;
        bool involvesExternalCall;
        string externalService;
        bytes32 reasoningHash;
        bytes32 outputHash;
        bytes32 executionHash;
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
        uint256 validatorReputation;
        uint256 registeredAt;
    }

    struct ExecutionInput {
        uint256 agentId;
        uint256 parentExecutionId;
        uint256 callerAgentId;
        bool involvesExternalCall;
        string externalService;
        bytes32 outputHash;
        bytes32 reasoningHash;
        bool isDeterministic;
    }

    uint256 public constant BPS_BASE = 10_000;
    uint256 public approvalThresholdBps = 6_600; // 66%
    uint256 public minVotesForFinalization = 3;

    address public owner;
    address public agentRegistry;
    address public reputationRegistry;

    // owner-configurable validator stake requirement (native token / hbar equivalent unit)
    uint256 public validatorStakeRequirement = 100 ether;

    uint256 public executionCounter;

    mapping(uint256 => Execution) private executions;
    mapping(bytes32 => uint256) public executionIdByHash;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    mapping(address => ValidatorInfo) public validators;

    event ExecutionSubmitted(
        uint256 indexed executionId,
        uint256 indexed agentId,
        uint256 parentExecutionId,
        uint256 callerAgentId,
        bool involvesExternalCall,
        string externalService
    );
    event DeterministicExecutionVerified(uint256 indexed executionId, bool accepted);
    event VoteSubmitted(uint256 indexed executionId, address indexed validator, bool approve);
    event ExecutionFinalized(
        uint256 indexed executionId, bool accepted, uint256 approvals, uint256 rejections
    );
    event AgentRegistryUpdated(address indexed agentRegistry);
    event ReputationRegistryUpdated(address indexed reputationRegistry);
    event ValidatorStakeRequirementUpdated(uint256 oldRequirement, uint256 newRequirement);
    event ValidatorRegistered(address indexed validator, uint256 stakedAmount);
    event ValidatorStakeToppedUp(address indexed validator, uint256 amount, uint256 totalStake);
    event ValidatorUnregistered(address indexed validator, uint256 refundedAmount);
    event ValidatorReputationUpdated(address indexed validator, uint256 oldReputation, uint256 newReputation);


// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                     MODIFIERS, CONSTRUCTOR, SETTER
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


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

    function setReputationRegistry(address _reputationRegistry) external onlyOwner {
        require(_reputationRegistry != address(0), "Invalid reputation registry");
        reputationRegistry = _reputationRegistry;
        emit ReputationRegistryUpdated(_reputationRegistry);
    }

    function setValidatorStakeRequirement(uint256 _newRequirement) external onlyOwner {
        require(_newRequirement > 0, "Invalid stake requirement");
        uint256 oldRequirement = validatorStakeRequirement;
        validatorStakeRequirement = _newRequirement;
        emit ValidatorStakeRequirementUpdated(oldRequirement, _newRequirement);
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   MAIN FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    function registerValidator() external payable {
        ValidatorInfo storage validator = validators[msg.sender];
        require(!validator.isRegistered, "Already registered");
        require(msg.value >= validatorStakeRequirement, "Insufficient validator stake");

        validators[msg.sender] = ValidatorInfo({
            isRegistered: true,
            active: true,
            stakedAmount: msg.value,
            validatorReputation: 1,
            registeredAt: block.timestamp
        });

        emit ValidatorRegistered(msg.sender, msg.value);
    }

    function topUpValidatorStake() external payable {
        ValidatorInfo storage validator = validators[msg.sender];
        require(validator.isRegistered, "Not registered");
        require(validator.active, "Validator inactive");
        require(msg.value > 0, "No stake sent");

        validator.stakedAmount += msg.value;
        emit ValidatorStakeToppedUp(msg.sender, msg.value, validator.stakedAmount);
    }

    function unregisterValidator() external {
        ValidatorInfo storage validator = validators[msg.sender];
        require(validator.isRegistered, "Not registered");

        uint256 refund = validator.stakedAmount;
        validator.isRegistered = false;
        validator.active = false;
        validator.stakedAmount = 0;

        if (refund > 0) {
            payable(msg.sender).sendValue(refund);
        }

        emit ValidatorUnregistered(msg.sender, refund);
    }

    function isValidator(address user) public view returns (bool) {
        ValidatorInfo memory validator = validators[user];
        return validator.isRegistered && validator.active && validator.validatorReputation > 0;
    }

    function setConsensusConfig(uint256 _approvalThresholdBps, uint256 _minVotesForFinalization) external onlyOwner {
        require(_approvalThresholdBps > 0 && _approvalThresholdBps <= BPS_BASE, "Invalid threshold bps");
        require(_minVotesForFinalization > 0, "Invalid min votes");
        approvalThresholdBps = _approvalThresholdBps;
        minVotesForFinalization = _minVotesForFinalization;
    }

    function generateExecutionHash(
        uint256 agentId,
        uint256 parentExecutionId,
        uint256 callerAgentId,
        bool involvesExternalCall,
        string calldata externalService,
        bytes32 reasoningHash,
        bytes32 outputHash
    )
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                agentId,
                parentExecutionId,
                callerAgentId,
                involvesExternalCall,
                externalService,
                reasoningHash,
                outputHash
            )
        );
    }

    function submitExecution(
        uint256 agentId,
        uint256 parentExecutionId,
        uint256 callerAgentId,
        bool involvesExternalCall,
        string calldata externalService,
        bytes32 outputHash,
        bytes32 reasoningHash,
        bool isDeterministic
    )
        external
        returns (uint256 executionId, bytes32 executionHash)
    {
        ExecutionInput memory input = ExecutionInput({
            agentId: agentId,
            parentExecutionId: parentExecutionId,
            callerAgentId: callerAgentId,
            involvesExternalCall: involvesExternalCall,
            externalService: externalService,
            outputHash: outputHash,
            reasoningHash: reasoningHash,
            isDeterministic: isDeterministic
        });

        return _submitExecution(input);
    }

    function verifyDeterministicExecution(uint256 executionId, bytes32 expectedOutputHash) external {
        Execution storage exec = executions[executionId];

        require(exec.executionHash != bytes32(0), "Execution not found");
        require(exec.isDeterministic, "Not deterministic");
        require(!exec.finalized, "Already finalized");
        require(expectedOutputHash != bytes32(0), "Invalid expected output hash");

        bool accepted = exec.outputHash == expectedOutputHash;
        _finalize(executionId, accepted);

        emit DeterministicExecutionVerified(executionId, accepted);
    }

    function voteExecution(uint256 executionId, bool approve) external {
        Execution storage exec = executions[executionId];

        require(exec.executionHash != bytes32(0), "Execution not found");
        require(!exec.isDeterministic, "Use deterministic verification");
        require(!exec.finalized, "Already finalized");
        require(!hasVoted[executionId][msg.sender], "Already voted");
        require(isValidator(msg.sender), "Not an active validator");

        hasVoted[executionId][msg.sender] = true;

        if (approve) {
            exec.approvals += 1;
        } else {
            exec.rejections += 1;
        }

        emit VoteSubmitted(executionId, msg.sender, approve);

        _checkConsensus(executionId);
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   EXTERNAL, INTERNAL FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


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

        IReputationRegistry(reputationRegistry).updateTrustScore(exec.agentId, accepted);

        emit ExecutionFinalized(executionId, accepted, exec.approvals, exec.rejections);
    }

    function setValidatorReputation(address validatorAddress, uint256 newReputation) external onlyOwner {
        ValidatorInfo storage validator = validators[validatorAddress];
        require(validator.isRegistered, "Validator not registered");
        require(newReputation > 0, "Invalid reputation");

        uint256 oldReputation = validator.validatorReputation;
        validator.validatorReputation = newReputation;

        emit ValidatorReputationUpdated(validatorAddress, oldReputation, newReputation);
    }

    function getExecutionByHash(bytes32 executionHash) external view returns (Execution memory) {
        uint256 executionId = executionIdByHash[executionHash];
        require(executionId != 0, "Execution not found");
        return executions[executionId];
    }

    function getExecution(uint256 executionId) external view returns (Execution memory) {
        require(executions[executionId].executionId != 0, "Execution not found");
        return executions[executionId];
    }

    function getExecutionParent(uint256 executionId) external view returns (uint256) {
        require(executions[executionId].executionId != 0, "Execution not found");
        return executions[executionId].parentExecutionId;
    }

    function getExecutionCaller(uint256 executionId) external view returns (uint256) {
        require(executions[executionId].executionId != 0, "Execution not found");
        return executions[executionId].callerAgentId;
    }

    function _submitExecution(ExecutionInput memory input)
        internal
        returns (uint256 executionId, bytes32 executionHash)
    {
        require(input.agentId > 0, "Invalid agent id");
        require(input.reasoningHash != bytes32(0), "Invalid reasoning hash");
        require(input.outputHash != bytes32(0), "Invalid output hash");
        require(agentRegistry != address(0), "Agent registry not set");

        IAgentRegistry.Agent memory agent = IAgentRegistry(agentRegistry).getAgent(input.agentId);
        require(agent.isRegistered, "Agent not registered");
        require(!agent.revoked, "Agent revoked");

        if (input.parentExecutionId != 0) {
            require(executions[input.parentExecutionId].executionId != 0, "Parent execution not found");
        }

        if (input.callerAgentId != 0) {
            require(IAgentRegistry(agentRegistry).getAgent(input.callerAgentId).isRegistered, "Caller agent not registered");
        }

        executionHash = keccak256(
            abi.encode(
                input.agentId,
                input.parentExecutionId,
                input.callerAgentId,
                input.involvesExternalCall,
                input.externalService,
                input.reasoningHash,
                input.outputHash
            )
        );
        require(executionIdByHash[executionHash] == 0, "Execution already exists");

        executionId = ++executionCounter;
        executionIdByHash[executionHash] = executionId;

        Execution storage exec = executions[executionId];
        exec.executionId = executionId;
        exec.agentId = input.agentId;
        exec.parentExecutionId = input.parentExecutionId;
        exec.callerAgentId = input.callerAgentId;
        exec.involvesExternalCall = input.involvesExternalCall;
        exec.externalService = input.externalService;
        exec.reasoningHash = input.reasoningHash;
        exec.outputHash = input.outputHash;
        exec.executionHash = executionHash;
        exec.isDeterministic = input.isDeterministic;
        exec.createdAt = block.timestamp;

        emit ExecutionSubmitted(
            executionId,
            input.agentId,
            input.parentExecutionId,
            input.callerAgentId,
            input.involvesExternalCall,
            input.externalService
        );
    }

     // for testing so native tokens do not get stuck
     function withdrawAmount() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No balance");

        payable(owner).sendValue(bal);
    }
}
