// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAgentRegistry.sol";

contract AuthorizationManager {
    
    struct Permission {
        uint256 agentId;
        string capability;
        uint256 expiry;
    }

    uint256 public constant MIN_TRUST_SCORE_FOR_AUTH = 30;
    uint256 public constant DEFAULT_AUTH_DURATION = 30 days;

    address public owner;
    address public agentRegistry;

    mapping(address => Permission[]) public userPermissions;

    event AgentAuthorized(address indexed user, uint256 indexed agentId, string capability);
    event AuthorizationRevoked(address indexed user, uint256 indexed agentId);
    event AgentRegistryUpdated(address indexed agentRegistry);

    
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                   MODIFIERS, CONSTRUCTOR, SETTER
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

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                     MAIN FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X


    function authorizeAgent(uint256 agentId, string calldata capability) external {
        require(agentRegistry != address(0), "Agent registry not set");
        require(agentId > 0, "Invalid agent id");
        require(bytes(capability).length > 0, "Capability required");

        IAgentRegistry.Agent memory agent = IAgentRegistry(agentRegistry).getAgent(agentId);
        require(!agent.revoked, "Agent revoked");

        uint256 finalExpiry = block.timestamp + DEFAULT_AUTH_DURATION;
        _upsertPermission(msg.sender, agentId, capability, finalExpiry);

        emit AgentAuthorized(msg.sender, agentId , capability);
    }

    function revokeAuthorization(uint256 agentId) external {
        require(agentId > 0, "Invalid agent id");

        Permission[] storage perms = userPermissions[msg.sender];
        uint256 i = 0;
        bool removed;

        while (i < perms.length) {
            if (perms[i].agentId == agentId) {
                perms[i] = perms[perms.length - 1];
                perms.pop();
                removed = true;
            } else {
                i++;
            }
        }

        require(removed, "No authorization found");
        emit AuthorizationRevoked(msg.sender, agentId);
    }

// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
//                     EXTERNAL, INTERNAL FUNCTIONS
// X-----------------X-----------------X-----------------X-----------------X-----------------X-----------------X
  

    function checkPermission(address user, uint256 agentId, string calldata capability) external view returns (bool) {
        require(user != address(0), "Invalid user");
        require(agentId > 0, "Invalid agent id");
        require(bytes(capability).length > 0, "Capability required");

        if (agentRegistry == address(0)) return false;

        IAgentRegistry.Agent memory agent;
        try IAgentRegistry(agentRegistry).getAgent(agentId) returns (IAgentRegistry.Agent memory fetchedAgent) {
            agent = fetchedAgent;
        } catch {
            return false;
        }

        if (agent.revoked || agent.trustScore < MIN_TRUST_SCORE_FOR_AUTH) {
            return false;
        }

        (bool exists, bool requiresUserAuthorization, bool isActive) = _getCapabilityDetails(agentId, capability);
        if (!exists || !isActive) return false;
        if (!requiresUserAuthorization) return true;

        Permission[] storage perms = userPermissions[user];
        bytes32 capHash = keccak256(bytes(capability));

        for (uint256 i = 0; i < perms.length; i++) {
            if (
                perms[i].agentId == agentId
                    && keccak256(bytes(perms[i].capability)) == capHash
                    && perms[i].expiry >= block.timestamp
            ) {
                return true;
            }
        }

        return false;
    }

    function _upsertPermission(address user, uint256 agentId, string calldata capability, uint256 expiry) internal {
        Permission[] storage perms = userPermissions[user];
        bytes32 capHash = keccak256(bytes(capability));

        for (uint256 i = 0; i < perms.length; i++) {
            if (perms[i].agentId == agentId && keccak256(bytes(perms[i].capability)) == capHash) {
                perms[i].expiry = expiry;
                return;
            }
        }

        perms.push(Permission({agentId: agentId, capability: capability, expiry: expiry}));
    }

    function _getCapabilityDetails(uint256 agentId, string calldata capability)
        internal
        view
        returns (bool exists, bool requiresUserAuthorization, bool isActive)
    {
        return IAgentRegistry(agentRegistry).hasCapability(agentId, capability);
    }
}
