// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITrustManager {
    function recordValidatedInteraction(address agent, string calldata storageHash, bool success)
        external
        returns (uint256);
}
