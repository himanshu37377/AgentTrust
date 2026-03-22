// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import "../contracts/ValidationRegistry.sol";
import "../contracts/IAgentRegistry.sol";

contract MockAgentRegistry is IAgentRegistry {
    mapping(uint256 => Agent) internal agents;

    function setAgent(uint256 agentId, bool isRegistered, bool revoked, uint256 trustScore) external {
        agents[agentId] = Agent({
            isRegistered: isRegistered,
            owner: address(this),
            metadataURI: "",
            trustScore: trustScore,
            rating: 10,
            riskLevel: 0,
            isDeterministic: false,
            stakeAmount: 0,
            revoked: revoked,
            createdAt: block.timestamp
        });
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getCapability(uint256) external pure returns (Capability memory) {
        revert("not implemented");
    }

    function getCapabilityAt(uint256, uint256) external pure returns (Capability memory) {
        revert("not implemented");
    }

    function getCapabilities(uint256) external pure returns (Capability[] memory) {
        return new Capability[](0);
    }

    function getCapabilityCount(uint256) external pure returns (uint256) {
        return 0;
    }

    function hasCapabilityId(uint256, uint32) external pure returns (bool, bool, bool) {
        return (false, false, false);
    }

    function hasCapability(uint256, string calldata) external pure returns (bool, bool, bool) {
        return (false, false, false);
    }

    function getAgentTrustScore(uint256 agentId) external view returns (uint256) {
        return agents[agentId].trustScore;
    }

    function setAgentTrustScore(uint256 agentId, uint256 newTrustScore) external {
        agents[agentId].trustScore = newTrustScore;
    }

    function isAgentDeterministic(uint256 agentId) external view returns (bool) {
        return agents[agentId].isDeterministic;
    }
}

contract MockReputationRegistry {
    uint256 public lastAgentId;
    bool public lastAccepted;
    uint256 public updateCount;

    function updateTrustScore(uint256 agentId, bool accepted) external returns (uint256) {
        lastAgentId = agentId;
        lastAccepted = accepted;
        updateCount += 1;
        return accepted ? 100 : 0;
    }
}

contract ValidationRegistryTest is Test {
    uint256 internal constant ONE_HBAR = 100_000_000;

    ValidationRegistry internal validationRegistry;
    MockAgentRegistry internal agentRegistry;
    MockReputationRegistry internal reputationRegistry;

    address internal validatorA = address(0xA11);
    address internal validatorB = address(0xB22);
    address internal validatorC = address(0xC33);

    function setUp() public {
        validationRegistry = new ValidationRegistry();
        agentRegistry = new MockAgentRegistry();
        reputationRegistry = new MockReputationRegistry();

        validationRegistry.setAgentRegistry(address(agentRegistry));
        validationRegistry.setReputationRegistry(address(reputationRegistry));
        validationRegistry.setValidatorStakeRequirement(ONE_HBAR);

        agentRegistry.setAgent(1, true, false, 50);

        _registerValidator(validatorA);
        _registerValidator(validatorB);
        _registerValidator(validatorC);
    }

    function testRegisterValidatorStartsAtMaxAccuracy() public view {
        (uint256 validatorId,,,,,, uint256 accuracyScore) = validationRegistry.validators(validatorA);
        assertEq(validatorId, 1);
        assertEq(accuracyScore, 100);
    }

    function testRegisterValidatorAssignsSequentialIds() public view {
        (uint256 validatorIdA,,,,,,) = validationRegistry.validators(validatorA);
        (uint256 validatorIdB,,,,,,) = validationRegistry.validators(validatorB);
        (uint256 validatorIdC,,,,,,) = validationRegistry.validators(validatorC);

        assertEq(validatorIdA, 1);
        assertEq(validatorIdB, 2);
        assertEq(validatorIdC, 3);
    }

    function testFinalizeExecutionUpdatesValidatorAccuracy() public {
        uint256 executionId = _submitExecution(1);

        vm.prank(validatorA);
        validationRegistry.voteExecution(executionId, true);

        vm.prank(validatorB);
        validationRegistry.voteExecution(executionId, true);

        vm.prank(validatorC);
        validationRegistry.voteExecution(executionId, false);

        (,,,,,, uint256 accuracyA) = validationRegistry.validators(validatorA);
        (,,,,,, uint256 accuracyB) = validationRegistry.validators(validatorB);
        (,,,,,, uint256 accuracyC) = validationRegistry.validators(validatorC);

        assertEq(accuracyA, 100);
        assertEq(accuracyB, 100);
        assertEq(accuracyC, 98);
        assertEq(reputationRegistry.lastAgentId(), 1);
        assertTrue(reputationRegistry.lastAccepted());
        assertEq(reputationRegistry.updateCount(), 1);
    }

    function testVerifyDeterministicExecutionAcceptsMatchingBindingHash() public {
        uint256 agentId = 1;
        string memory input = "sum of numbers from 1 to 10";
        string memory output = "55";
        bytes32 executionCommitment = keccak256(abi.encode(input, output, agentId));

        (uint256 executionId,) =
            validationRegistry.submitExecution(agentId, 0, 0, false, "", executionCommitment, bytes32(0), true);

        validationRegistry.verifyDeterministicExecution(executionId, executionCommitment);

        ValidationRegistry.Execution memory exec = validationRegistry.getExecution(executionId);
        assertTrue(exec.finalized);
        assertTrue(exec.accepted);
        assertEq(reputationRegistry.lastAgentId(), agentId);
        assertTrue(reputationRegistry.lastAccepted());
    }

    function testVerifyDeterministicExecutionRejectsMismatchedBindingHash() public {
        uint256 agentId = 1;
        string memory input = "sum of numbers from 1 to 10";
        bytes32 submittedExecutionCommitment = keccak256(abi.encode(input, "55", agentId));
        bytes32 expectedExecutionCommitment = keccak256(abi.encode(input, "56", agentId));

        (uint256 executionId,) =
            validationRegistry.submitExecution(agentId, 0, 0, false, "", submittedExecutionCommitment, bytes32(0), true);

        validationRegistry.verifyDeterministicExecution(executionId, expectedExecutionCommitment);

        ValidationRegistry.Execution memory exec = validationRegistry.getExecution(executionId);
        assertTrue(exec.finalized);
        assertFalse(exec.accepted);
        assertEq(reputationRegistry.lastAgentId(), agentId);
        assertFalse(reputationRegistry.lastAccepted());
    }

    function testSubmitExecutionRejectsReasoningHashForDeterministicFlow() public {
        uint256 agentId = 1;
        bytes32 executionCommitment = keccak256(abi.encode("input", "output", agentId));
        bytes32 reasoningHash = keccak256(abi.encode("reasoning"));

        vm.expectRevert("Reasoning hash unused");
        validationRegistry.submitExecution(agentId, 0, 0, false, "", executionCommitment, reasoningHash, true);
    }

    function testSubmitExecutionAllowsDuplicateDeterministicExecutions() public {
        uint256 agentId = 1;
        bytes32 executionCommitment = keccak256(abi.encode("sum of numbers from 1 to 10", "55", agentId));

        (uint256 firstExecutionId, bytes32 firstExecutionHash) =
            validationRegistry.submitExecution(agentId, 0, 0, false, "", executionCommitment, bytes32(0), true);
        (uint256 secondExecutionId, bytes32 secondExecutionHash) =
            validationRegistry.submitExecution(agentId, 0, 0, false, "", executionCommitment, bytes32(0), true);

        assertEq(firstExecutionHash, secondExecutionHash);
        assertEq(firstExecutionId, 1);
        assertEq(secondExecutionId, 2);

        ValidationRegistry.Execution memory latestByHash = validationRegistry.getExecutionByHash(firstExecutionHash);
        assertEq(latestByHash.executionId, secondExecutionId);
    }

    function testAccuracyPenaltyClampsAtZero() public {
        for (uint256 i = 0; i < 51; i++) {
            uint256 executionId = _submitExecution(i + 1);

            vm.prank(validatorA);
            validationRegistry.voteExecution(executionId, false);

            vm.prank(validatorB);
            validationRegistry.voteExecution(executionId, true);

            vm.prank(validatorC);
            validationRegistry.voteExecution(executionId, true);
        }

        (,,,,,, uint256 accuracyScore) = validationRegistry.validators(validatorA);
        assertEq(accuracyScore, 0);
    }

    function _registerValidator(address validator) internal {
        vm.deal(validator, 10 ether);
        vm.prank(validator);
        validationRegistry.registerValidator{value: ONE_HBAR}();
    }

    function _submitExecution(uint256 seed) internal returns (uint256 executionId) {
        uint256 agentId = 1;
        bytes32 executionCommitment = keccak256(abi.encodePacked("output", seed));
        bytes32 reasoningHash = keccak256(abi.encodePacked("reasoning", seed));
        (executionId,) =
            validationRegistry.submitExecution(agentId, 0, 0, false, "", executionCommitment, reasoningHash, false);
    }
}
