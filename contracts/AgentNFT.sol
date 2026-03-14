// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {HederaTokenService} from "./Hedera/HederaTokenService.sol";
import {IHederaTokenService} from "./Hedera/IHederaTokenService.sol";
import {HederaResponseCodes} from "./Hedera/HederaResponseCodes.sol";
import {KeyHelper} from "./Hedera/KeyHelper.sol";
import {ExpiryHelper} from "./Hedera/ExpiryHelper.sol";

contract AgentNFT is Ownable, HederaTokenService, KeyHelper, ExpiryHelper {
    using Address for address payable;

    int64 private constant AUTO_RENEW_PERIOD = 8_000_000;
    bytes private constant DEFAULT_METADATA = hex"01";

    address public registry;
    address public tokenAddress;
    string public name;
    string public symbol;

    event RegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event CollectionCreated(address indexed tokenAddress);
    event AgentMinted(uint256 indexed tokenId, address indexed to, string metadataURI);
    event NFTMinted(address indexed to, uint256 indexed tokenId, int64 newTotalSupply);
    event NFTBurned(uint256 indexed tokenId, int64 newTotalSupply);
    event NFTRevoked(uint256 indexed tokenId, address indexed owner);
    event FundsWithdrawn(address indexed to, uint256 amount);

    modifier onlyRegistry() {
        require(msg.sender == registry, "Only registry");
        _;
    }

    constructor(address initialRegistry) Ownable(msg.sender) {
        require(initialRegistry != address(0), "Invalid registry");
        registry = initialRegistry;
    }

    function setRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "Invalid registry");
        address oldRegistry = registry;
        registry = newRegistry;
        emit RegistryUpdated(oldRegistry, newRegistry);
    }

    function safeMint(address to, string calldata uri)
        external
        onlyRegistry
        returns (uint256 tokenId)
    {
        require(tokenAddress != address(0), "HTS: not created");
        require(to != address(0), "Invalid recipient");
        bytes memory metadata = bytes(uri);
        require(metadata.length > 0, "Metadata required");
        require(metadata.length <= 100, "Metadata exceeds HTS limit");

        tokenId = _mintAndSend(to, metadata);
        emit AgentMinted(tokenId, to, uri);
    }

    function createNFTCollection(string memory _name, string memory _symbol)
        external
        payable
        onlyOwner
        returns (address createdTokenAddress)
    {
        require(tokenAddress == address(0), "Already initialized");
        name = _name;
        symbol = _symbol;

        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
        token.treasury = address(this);
        token.memo = "";
        token.tokenSupplyType = false;
        token.maxSupply = 0;
        token.freezeDefault = false;
        token.tokenKeys = _buildTokenKeys();
        token.expiry = createAutoRenewExpiry(address(this), AUTO_RENEW_PERIOD);

        (int256 responseCode, address createdAddress) = createNonFungibleToken(token);

        require(responseCode == HederaResponseCodes.SUCCESS, "HTS collection creation failed");
        require(createdAddress != address(0), "Invalid HTS token address");
        tokenAddress = createdAddress;
        emit CollectionCreated(createdAddress);
        return createdAddress;
    }

    function mintNFT(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _mintAndSend(to, DEFAULT_METADATA);
    }

    function mintNFT(address to, bytes memory metadata) external onlyOwner returns (uint256 tokenId) {
        require(metadata.length <= 100, "HTS: metadata >100 bytes");
        tokenId = _mintAndSend(to, metadata);
    }

    function burnNFT(uint256 tokenId) external {
        require(tokenAddress != address(0), "HTS: not created");

        address owner_ = IERC721(tokenAddress).ownerOf(tokenId);
        require(
            msg.sender == owner_
                || IERC721(tokenAddress).getApproved(tokenId) == msg.sender
                || IERC721(tokenAddress).isApprovedForAll(owner_, msg.sender),
            "caller not owner nor approved"
        );

        if (owner_ != address(this)) {
            bool contractApproved = IERC721(tokenAddress).getApproved(tokenId) == address(this)
                || IERC721(tokenAddress).isApprovedForAll(owner_, address(this));
            require(contractApproved, "contract not approved to transfer");
            IERC721(tokenAddress).transferFrom(owner_, address(this), tokenId);
        }

        int64[] memory serials = new int64[](1);
        serials[0] = int64(uint64(tokenId));
        (int256 responseCode, int64 newTotalSupply) = burnToken(tokenAddress, 0, serials);
        require(responseCode == HederaResponseCodes.SUCCESS, "HTS: burn failed");

        emit NFTBurned(tokenId, newTotalSupply);
    }

    function revokeNFT(uint256 tokenId, address owner) external onlyRegistry {
        require(tokenAddress != address(0), "HTS: not created");
        require(owner != address(0), "Invalid owner");

        int64[] memory serials = new int64[](1);
        serials[0] = int64(uint64(tokenId));

        int256 responseCode = wipeTokenAccountNFT(tokenAddress, owner, serials);
        require(responseCode == HederaResponseCodes.SUCCESS, "HTS: revoke failed");

        emit NFTRevoked(tokenId, owner);
    }

    function _mintAndSend(address to, bytes memory metadata) internal returns (uint256 tokenId) {
        require(tokenAddress != address(0), "HTS: not created");
        require(to != address(0), "Invalid recipient");

        bytes[] memory metadataBatch = new bytes[](1);
        metadataBatch[0] = metadata;

        (int256 responseCode, int64 newTotalSupply, int64[] memory serialNumbers) =
            mintToken(tokenAddress, 0, metadataBatch);
        require(responseCode == HederaResponseCodes.SUCCESS, "HTS mint failed");
        require(serialNumbers.length == 1 && serialNumbers[0] > 0, "Invalid serial");

        tokenId = uint256(uint64(serialNumbers[0]));
        IERC721(tokenAddress).transferFrom(address(this), to, tokenId);
        emit NFTMinted(to, tokenId, newTotalSupply);
    }

    function _buildTokenKeys()
        internal
        view
        returns (IHederaTokenService.TokenKey[] memory tokenKeys)
    {
        tokenKeys = new IHederaTokenService.TokenKey[](3);
        tokenKeys[0] = getSingleKey(KeyType.ADMIN, KeyValueType.CONTRACT_ID, address(this));
        tokenKeys[1] = getSingleKey(KeyType.SUPPLY, KeyValueType.CONTRACT_ID, address(this));
        tokenKeys[2] = getSingleKey(KeyType.WIPE, KeyValueType.CONTRACT_ID, address(this));
    }

    // Just for the purpose of testing
    function withdraw(address payable to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds");

        to.sendValue(amount);
        emit FundsWithdrawn(to, amount);
    }
}
