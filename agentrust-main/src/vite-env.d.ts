/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HEDERA_RPC_URL?: string;
  readonly VITE_HEDERA_MIRROR_NODE_URL?: string;
  readonly VITE_HEDERA_CHAIN_ID?: string;
  readonly VITE_HEDERA_NETWORK_NAME?: string;
  readonly VITE_HEDERA_BLOCK_EXPLORER_URL?: string;
  readonly VITE_AGENT_REGISTRY_ADDRESS?: string;
  readonly VITE_REPUTATION_REGISTRY_ADDRESS?: string;
  readonly VITE_VALIDATION_REGISTRY_ADDRESS?: string;
  readonly VITE_STAKING_MANAGER_ADDRESS?: string;
  readonly VITE_AUTHORIZATION_MANAGER_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
