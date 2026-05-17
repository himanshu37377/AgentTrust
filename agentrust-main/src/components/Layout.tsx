import { BrowserProvider, formatEther } from "ethers";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const navLinks = [
  { path: "/", label: "Home" },
  { path: "/explore", label: "Explore" },
  { path: "/register", label: "Register Agent" },
  { path: "/validators", label: "Validators" },
  { path: "/executions", label: "Execution History" },
];

type EthereumProvider = {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function getEthereumProvider() {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}..${address.slice(-4)}`;
}

function formatOgBalance(balance: bigint) {
  const formatted = Number(formatEther(balance));
  if (formatted >= 1000) {
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return formatted.toLocaleString(undefined, {
    minimumFractionDigits: formatted > 0 && formatted < 1 ? 2 : 0,
    maximumFractionDigits: 4,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const refreshWalletState = async (nextAccount?: string) => {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      setAccount("");
      setBalance("");
      return;
    }

    const provider = new BrowserProvider(ethereum as never);
    const activeAccount =
      nextAccount ||
      ((await ethereum.request({ method: "eth_accounts" })) as string[])[0] ||
      "";

    if (!activeAccount) {
      setAccount("");
      setBalance("");
      return;
    }

    const walletBalance = await provider.getBalance(activeAccount);
    setAccount(activeAccount);
    setBalance(formatOgBalance(walletBalance));
  };

  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      return;
    }

    const handleAccountsChanged = (accounts: unknown) => {
      const nextAccount = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
      void refreshWalletState(nextAccount);
    };

    const handleChainChanged = () => {
      void refreshWalletState();
    };

    void refreshWalletState();
    ethereum.on?.("accountsChanged", handleAccountsChanged);
    ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const connectWallet = async () => {
    const ethereum = getEthereumProvider();

    if (account) {
      setShowWalletModal(true);
      return;
    }

    if (!ethereum?.isMetaMask) {
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return;
    }

    setIsConnecting(true);

    try {
      const chainId = import.meta.env.VITE_ZEROG_CHAIN_ID;
      const rpcUrl = import.meta.env.VITE_ZEROG_RPC_URL;

      if (chainId && rpcUrl) {
        try {
          await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId }],
          });
        } catch (switchError) {
          const errorCode =
            typeof switchError === "object" && switchError && "code" in switchError
              ? Number(switchError.code)
              : 0;

          if (errorCode === 4902) {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId,
                chainName:
                  import.meta.env.VITE_ZEROG_NETWORK_NAME || "0G Galileo Testnet",
                nativeCurrency: {
                  name: "OG",
                  symbol: "OG",
                  decimals: 18,
                },
                rpcUrls: [rpcUrl],
                blockExplorerUrls:
                  import.meta.env.VITE_ZEROG_BLOCK_EXPLORER_URL
                    ? [import.meta.env.VITE_ZEROG_BLOCK_EXPLORER_URL]
                  : undefined,
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      await refreshWalletState(accounts[0] || "");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount("");
    setBalance("");
    setShowWalletModal(false);
  };

  const copyAddress = async () => {
    if (!account) {
      return;
    }

    try {
      await navigator.clipboard.writeText(account);
    } catch (error) {
      console.warn("Unable to copy wallet address", error);
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen z-10">
      {/* Background particles */}
      <div className="particle top-1/4 left-1/4 w-64 h-64 bg-trust-accent-blue rounded-full blur-[120px]" />
      <div className="particle bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[150px]" />

      <header className="sticky top-0 z-50 border-b border-white/5 bg-background-dark/80 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto px-6 flex h-20 items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/agentrust-logo.svg"
              alt="TrustLayer logo"
              className="size-10 rounded-lg border border-white/10 bg-background-dark/70 p-1"
            />
            <Link to="/" className="text-xl font-bold tracking-tight text-white">TrustLayer</Link>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === link.path
                    ? "text-trust-accent-blue font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            {account && (
              <div className="hidden sm:flex min-w-[156px] flex-col rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 leading-tight shadow-[0_10px_30px_rgba(7,12,24,0.25)]">
                <span className="text-sm font-semibold text-cyan-300">{shortenAddress(account)}</span>
                <span className="mt-1 text-xs font-semibold text-emerald-300">
                  {balance || "0"} OG
                </span>
              </div>
            )}
            <button
              onClick={connectWallet}
              className="bg-gradient-to-r from-trust-accent-blue to-trust-accent-purple hover:brightness-110 text-white rounded-lg px-6 py-2.5 text-sm font-bold transition-all shadow-lg shadow-trust-accent-blue/20 active:scale-95"
            >
              {isConnecting ? "Connecting..." : account ? "0G Wallet Connected" : "Connect 0G Wallet"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {showWalletModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[rgba(8,10,20,0.4)] backdrop-blur-md"
            onClick={() => setShowWalletModal(false)}
          />
          <div
            className="relative w-full max-w-md overflow-hidden rounded-[22px] border border-white/10"
            style={{
              background: "linear-gradient(180deg, rgba(18, 24, 46, 0.96), rgba(12, 18, 35, 0.96))",
              boxShadow: "0 24px 70px rgba(0, 0, 0, 0.5), 0 0 28px rgba(90, 110, 255, 0.18)",
            }}
          >
            <div className="border-b border-white/10 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">0G Wallet Connected</h2>
                  <p className="mt-1 text-sm text-slate-400">Manage your connected 0G wallet session.</p>
                </div>
                <button
                  onClick={() => setShowWalletModal(false)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Close wallet modal"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Connected Address</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-cyan-300">{shortenAddress(account)}</p>
                  <button
                    onClick={copyAddress}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-all hover:bg-cyan-400/15 hover:text-white"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M10 20h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                    Copy
                  </button>
                </div>
                <p className="mt-3 text-sm font-semibold text-emerald-300">{balance || "0"} OG available</p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowWalletModal(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                >
                  Keep Connected
                </button>
                <button
                  onClick={disconnectWallet}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
                  style={{
                    background: "linear-gradient(90deg, rgba(220, 38, 38, 0.92), rgba(239, 68, 68, 0.92))",
                    boxShadow: "0 10px 24px rgba(220, 38, 38, 0.25)",
                  }}
                >
                  Disconnect Wallet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-16 border-t border-white/5 py-12 bg-white/[0.02]">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-80">
            <span className="material-symbols-outlined text-trust-accent-blue">security</span>
            <span className="font-bold text-white">TrustLayer Protocol</span>
          </div>
          <div className="flex gap-8 text-sm text-slate-500 font-medium">
            <a className="hover:text-white transition-colors" href="#">Whitepaper</a>
            <a className="hover:text-white transition-colors" href="#">Security Audits</a>
            <a className="hover:text-white transition-colors" href="#">API Docs</a>
            <a className="hover:text-white transition-colors" href="#">Privacy</a>
          </div>
          <div className="flex gap-4">
            <div className="size-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 cursor-pointer transition-colors border border-white/5">
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" /></svg>
            </div>
            <div className="size-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 cursor-pointer transition-colors border border-white/5">
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
