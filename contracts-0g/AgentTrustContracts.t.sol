// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import "./AgentRegistry.sol";
import "./StakingManager.sol";
import "./TrustManager.sol";
import "./ValidationRegistry.sol";

contract AgentTrustContractsTest is Test {
    AgentRegistry internal agentRegistry;
    StakingManager internal stakingManager;
    TrustManager internal trustManager;
    ValidationRegistry internal validationRegistry;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);

    function setUp() public {
        agentRegistry = new AgentRegistry();
        stakingManager = new StakingManager();
        trustManager = new TrustManager();
        validationRegistry = new ValidationRegistry();

        agentRegistry.setTrustManager(address(trustManager));
        agentRegistry.setStakingManager(address(stakingManager));
        agentRegistry.setValidationRegistry(address(validationRegistry));

        stakingManager.setAgentRegistry(address(agentRegistry));
        stakingManager.setValidationRegistry(address(validationRegistry));

        trustManager.setAgentRegistry(address(agentRegistry));
        trustManager.setValidationRegistry(address(validationRegistry));

        validationRegistry.setAgentRegistry(address(agentRegistry));
        validationRegistry.setTrustManager(address(trustManager));
    }

    function testRegisterAgentRejectsDuplicateAgentId() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        agentRegistry.registerAgentWithProfile{value: 0.01 ether}(
            "agent-calculator",
            "Calculator",
            "Deterministic demo agent",
            "calculator",
            "0xroot",
            0,
            true
        );

        vm.prank(bob);
        vm.expectRevert(bytes("Agent id already exists"));
        agentRegistry.registerAgentWithProfile{value: 0.01 ether}(
            "agent-calculator",
            "Copycat",
            "Duplicate ID",
            "calculator",
            "0xroot2",
            0,
            true
        );
    }

    function testAgentStakeAccountingMatchesStakingManager() public {
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        agentRegistry.registerAgentWithProfile{value: 0.02 ether}(
            "agent-staked",
            "Staked Agent",
            "Overpaid stake should stay consistent",
            "verification",
            "0xroot",
            0,
            false
        );

        IAgentRegistry.Agent memory agent = agentRegistry.getAgent(alice);
        assertEq(agent.stakeAmount, 0.02 ether);
        assertEq(stakingManager.getStakeAmount(alice), 0.02 ether);
    }

    function testOnlyAgentCanRecordDirectInteraction() public {
        _registerAliceAgent();

        vm.prank(bob);
        vm.expectRevert(bytes("Unauthorized interaction recorder"));
        trustManager.recordInteraction(alice, "0xmemory", true);

        vm.prank(alice);
        uint256 trustAfter = trustManager.recordInteraction(alice, "0xmemory", true);

        assertEq(trustAfter, 55);
        assertEq(trustManager.getInteractionCount(alice), 1);
    }

    function testAnyWalletCanSubmitForRegisteredAgent() public {
        _registerAliceAgent();

        bytes32 commitment = keccak256("canonical-binding");

        vm.prank(bob);
        uint256 executionId = validationRegistry.submitExecution(alice, "0xmemory", commitment, bytes32(0), true);

        ValidationRegistry.Execution memory execution = validationRegistry.getExecution(executionId);
        assertEq(execution.agent, alice);
        assertEq(execution.submitter, bob);
    }

    function testSubmitterCanFinalizeDeterministicExecution() public {
        _registerAliceAgent();

        bytes32 commitment = keccak256("canonical-binding");

        vm.prank(bob);
        uint256 executionId = validationRegistry.submitExecution(alice, "0xmemory", commitment, bytes32(0), true);

        vm.prank(carol);
        vm.expectRevert(bytes("Unauthorized execution actor"));
        validationRegistry.verifyDeterministicExecution(executionId, commitment);

        vm.prank(bob);
        validationRegistry.verifyDeterministicExecution(executionId, commitment);

        ValidationRegistry.Execution memory execution = validationRegistry.getExecution(executionId);
        assertTrue(execution.finalized);
        assertTrue(execution.accepted);
        assertEq(trustManager.getTrustScore(alice), 55);
    }

    function testAgentCanStillFinalizeOwnDeterministicExecution() public {
        _registerAliceAgent();

        bytes32 commitment = keccak256("canonical-binding");

        vm.prank(alice);
        uint256 executionId = validationRegistry.submitExecution(alice, "0xmemory", commitment, bytes32(0), true);

        vm.prank(alice);
        validationRegistry.verifyDeterministicExecution(executionId, commitment);

        ValidationRegistry.Execution memory execution = validationRegistry.getExecution(executionId);
        assertTrue(execution.finalized);
        assertTrue(execution.accepted);
    }

    function testRejectsOutOfRangeRiskLevelAcrossRegistryAndStaking() public {
        vm.deal(alice, 1 ether);

        vm.expectRevert(bytes("Invalid risk level"));
        stakingManager.quoteStake(3);

        vm.prank(alice);
        vm.expectRevert(bytes("Invalid risk level"));
        agentRegistry.registerAgentWithProfile{value: 0.01 ether}(
            "agent-risk",
            "Risk Agent",
            "Invalid risk level",
            "analysis",
            "0xroot",
            3,
            false
        );
    }

    function _registerAliceAgent() internal {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        agentRegistry.registerAgentWithProfile{value: 0.01 ether}(
            "agent-alice",
            "Alice Agent",
            "Registered test agent",
            "calculator, verification",
            "0xroot",
            0,
            true
        );
    }
}
