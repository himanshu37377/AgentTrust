// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ValidationRegistry — public compose-task access (reference)
 * @notice Canonical implementation lives in `../../contracts-0g/ValidationRegistry.sol`.
 *
 * Changes merged there:
 * - `submitExecution`: any wallet may submit for a registered, non-revoked agent (no `msg.sender == agent`).
 * - `verifyDeterministicExecution`: agent, execution submitter, or registry owner may finalize.
 * - `Execution.submitter` records who submitted the compose task.
 *
 * Redeploy ValidationRegistry and update:
 *   VITE_VALIDATION_REGISTRY_ADDRESS=<new address>
 */
