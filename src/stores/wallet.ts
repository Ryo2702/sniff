import { create } from 'zustand';
import { connectWallet, disconnectWallet, listenForAccountChanges, type StandardWallet, type SupportedWalletName, WalletNotDetectedError } from '../lib/wallet';

type WalletStatus = 'idle' | 'connecting' | 'connected' | 'error';
type WalletState = {
  status: WalletStatus;
  walletName?: SupportedWalletName;
  address: string;
  error: string;
  connect: (walletName: SupportedWalletName) => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
};

let connectedWallet: StandardWallet | undefined;
let stopAccountListener: (() => void) | undefined;

function clearConnection(set: (state: Partial<WalletState>) => void) {
  stopAccountListener?.();
  stopAccountListener = undefined;
  connectedWallet = undefined;
  set({ status: 'idle', walletName: undefined, address: '', error: '' });
}

export const useWallet = create<WalletState>((set, get) => ({
  status: 'idle',
  address: '',
  error: '',
  connect: async (walletName) => {
    if (get().status === 'connecting') return;
    if (connectedWallet && get().walletName !== walletName) await get().disconnect();
    set({ status: 'connecting', walletName, address: '', error: '' });
    try {
      const result = await connectWallet(walletName);
      connectedWallet = result.wallet;
      stopAccountListener = listenForAccountChanges(result.wallet, (address) => {
        if (address) set({ status: 'connected', address, error: '' });
        else clearConnection(set);
      });
      set({ status: 'connected', walletName, address: result.address, error: '' });
    } catch (error) {
      const message = error instanceof WalletNotDetectedError ? error.message : error instanceof Error ? error.message : 'Wallet connection could not be completed.';
      set({ status: 'error', error: message });
    }
  },
  disconnect: async () => {
    const wallet = connectedWallet;
    try { await disconnectWallet(wallet); } catch { /* The local state must still clear if an extension is already gone. */ }
    finally { clearConnection(set); }
  },
  clearError: () => set({ error: '', ...(get().status === 'error' ? { status: 'idle' as const, walletName: undefined } : {}) }),
}));
