// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentNFT {
    function safeMint(address to, string calldata uri) external returns (uint256 tokenId);
    function revokeNFT(uint256 tokenId, address owner) external;
}
