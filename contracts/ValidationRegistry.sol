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
        uint256 agentId;
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

    uint256 public constant BPS_BASE = 10_000;
    uint256 public approvalThresholdBps = 6_600; // 66%
    uint256 public minVotesForFinalization = 3;

    address public owner;
    address public agentRegistry;
    address public reputationRegistry;

    // owner-configurable validator stake requirement (native token / hbar equivalent unit)
    uint256 public validatorStakeRequirement = 100 ether;

    uint256 public executionCounter;

    mapping(uint256 => Execution) public executions;
    mapping(bytes32 => uint256) public executionIdByHash;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    mapping(address => ValidatorInfo) public validators;

    event ExecutionSubmitted(
        uint256 indexed executionId,
        uint256 indexed agentId,
        bytes32 reasoningHash,
        bytes32 outputHash,
        bytes32 executionHash,
        bool isDeterministic
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

    constructor(address _agentRegistry, address _reputationRegistry, address /*_validatorRegistry*/ ) {
        require(_agentRegistry != address(0), "Invalid agent registry");
        require(_reputationRegistry != address(0), "Invalid reputation registry");
        owner = msg.sender;
        agentRegistry = _agentRegistry;
        reputationRegistry = _reputationRegistry;
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

    function generateExecutionHash(uint256 agentId, bytes32 reasoningHash, bytes32 outputHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(agentId, reasoningHash, outputHash));
    }

    function submitExecution(uint256 agentId, bytes32 reasoningHash, bytes32 outputHash)
        external
        returns (uint256 executionId, bytes32 executionHash)
    {
        require(agentId > 0, "Invalid agent id");
        require(reasoningHash != bytes32(0), "Invalid reasoning hash");
        require(outputHash != bytes32(0), "Invalid output hash");

        IAgentRegistry.Agent memory agent = IAgentRegistry(agentRegistry).getAgent(agentId);
        require(agent.isRegistered, "Agent not registered");
        require(!agent.revoked, "Agent revoked");

        executionHash = generateExecutionHash(agentId, reasoningHash, outputHash);
        require(executionIdByHash[executionHash] == 0, "Execution already exists");

        executionId = ++executionCounter;
        executionIdByHash[executionHash] = executionId;

        executions[executionId] = Execution({
            agentId: agentId,
            reasoningHash: reasoningHash,
            outputHash: outputHash,
            executionHash: executionHash,
            isDeterministic: IAgentRegistry(agentRegistry).isAgentDeterministic(agentId),
            approvals: 0,
            rejections: 0,
            finalized: false,
            accepted: false,
            createdAt: block.timestamp
        });

        emit ExecutionSubmitted(
            executionId,
            agentId,
            reasoningHash,
            outputHash,
            executionHash,
            executions[executionId].isDeterministic
        );
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

     // for testing so native tokens do not get stuck
     function withdrawAmount() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No balance");

        payable(owner).sendValue(bal);
    }
}
