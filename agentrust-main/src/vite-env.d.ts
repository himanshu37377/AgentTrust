/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_METADATA_UPLOAD_URL?: string;
  readonly VITE_ZEROG_RPC_URL?: string;
  readonly VITE_ZEROG_CHAIN_ID?: string;
  readonly VITE_ZEROG_NETWORK_NAME?: string;
  readonly VITE_ZEROG_BLOCK_EXPLORER_URL?: string;
  /** Optional: storage URL template only — must include `{hash}` and/or `{seq}` (never paste a full URL with a fixed hash; that produced broken `/storage/root/other` links). */
  readonly VITE_ZEROG_STORAGE_EXPLORER_URL?: string;
  /** Optional: 0G storage indexer HTTP origin (no `/file` suffix). Defaults to Galileo turbo indexer. */
  readonly VITE_ZEROG_STORAGE_FILE_GATEWAY_URL?: string;
  readonly VITE_AGENT_REGISTRY_ADDRESS?: string;
  readonly VITE_VALIDATION_REGISTRY_ADDRESS?: string;
  readonly VITE_STAKING_MANAGER_ADDRESS?: string;
  readonly VITE_TRUST_MANAGER_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
