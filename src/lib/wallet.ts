export const supportedWalletNames = ['Phantom', 'Solflare'] as const;
export type SupportedWalletName = (typeof supportedWalletNames)[number];

type WalletAccount = {
  address: string;
  chains?: readonly string[];
};

type WalletFeature = {
  connect?: (input?: unknown) => Promise<{ accounts?: readonly WalletAccount[] }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, listener: (event: unknown) => void) => (() => void) | void;
};

export type StandardWallet = {
  name: string;
  icon?: string;
  chains?: readonly string[];
  accounts?: readonly WalletAccount[];
  features?: Record<string, WalletFeature | undefined>;
};

type WalletRegistrationApi = { register: (wallet: StandardWallet) => void };
type WalletsApi = {
  register: (wallet: StandardWallet) => void;
  get: () => readonly StandardWallet[];
  on: (event: 'register' | 'unregister', listener: (wallet: StandardWallet) => void) => () => void;
};

type LegacyPublicKey = { toString: () => string } | string;
type LegacyProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: LegacyPublicKey | null;
  connect?: () => Promise<{ publicKey?: LegacyPublicKey } | void>;
  disconnect?: () => Promise<void> | void;
  on?: (event: string, listener: (publicKey?: LegacyPublicKey | null) => void) => void;
  off?: (event: string, listener: (publicKey?: LegacyPublicKey | null) => void) => void;
  removeListener?: (event: string, listener: (publicKey?: LegacyPublicKey | null) => void) => void;
};

const solanaMainnet = 'solana:mainnet';
let localApi: WalletsApi | undefined;
let localWallets: StandardWallet[] = [];

function browserWallets(): WalletsApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window.navigator as Navigator & { wallets?: { getWallets?: () => unknown } }).wallets?.getWallets?.();
  if (!candidate || typeof candidate !== 'object') return undefined;
  const value = candidate as Partial<WalletsApi>;
  return typeof value.get === 'function' && typeof value.on === 'function' && typeof value.register === 'function' ? candidate as WalletsApi : undefined;
}

export function getWallets(): WalletsApi {
  const native = browserWallets();
  if (native) return native;
  if (localApi) return localApi;

  const listeners: Record<'register' | 'unregister', Array<(wallet: StandardWallet) => void>> = { register: [], unregister: [] };
  const register = (wallet: StandardWallet) => {
    if (!wallet || typeof wallet.name !== 'string' || localWallets.includes(wallet)) return;
    localWallets = [...localWallets, wallet];
    listeners.register.forEach((listener) => listener(wallet));
  };
  const api: WalletsApi = {
    register,
    get: () => localWallets,
    on: (event, listener) => {
      listeners[event].push(listener);
      return () => { listeners[event] = listeners[event].filter((item) => item !== listener); };
    },
  };
  localApi = api;
  if (typeof window === 'undefined') return api;

  // Wallet Standard uses these events so extensions can register without a package or global provider assumption.
  window.addEventListener('wallet-standard:register-wallet', (event) => {
    const callback = (event as CustomEvent<(registration: WalletRegistrationApi) => void>).detail;
    if (typeof callback === 'function') callback({ register });
  });
  window.dispatchEvent(new CustomEvent<WalletRegistrationApi>('wallet-standard:app-ready', { detail: { register } }));
  return api;
}

function isSolanaWallet(wallet: StandardWallet) {
  return Boolean(wallet.chains?.includes(solanaMainnet) || wallet.accounts?.some((account) => account.chains?.includes(solanaMainnet)));
}

function publicAddress(value: LegacyPublicKey | null | undefined) {
  if (typeof value === 'string') return value;
  try { return value?.toString(); } catch { return undefined; }
}

function legacyWallet(name: SupportedWalletName): StandardWallet | undefined {
  if (typeof window === 'undefined') return undefined;
  const globals = window as Window & { phantom?: { solana?: LegacyProvider } & LegacyProvider; solflare?: LegacyProvider };
  const provider = name === 'Phantom' ? globals.phantom?.solana ?? globals.phantom : globals.solflare;
  if (!provider?.connect) return undefined;
  return {
    name,
    chains: [solanaMainnet],
    features: {
      'standard:connect': { connect: async () => {
        const result = await provider.connect?.();
        const address = publicAddress(result && 'publicKey' in result ? result.publicKey : provider.publicKey);
        return { accounts: address ? [{ address, chains: [solanaMainnet] }] : [] };
      } },
      'standard:disconnect': { disconnect: async () => { await provider.disconnect?.(); } },
      'standard:events': { on: (event, listener) => {
        if (event !== 'change' || !provider.on) return () => undefined;
        const handleChange = (publicKey?: LegacyPublicKey | null) => {
          const address = publicAddress(publicKey);
          listener({ accounts: address ? [{ address, chains: [solanaMainnet] }] : [] });
        };
        provider.on('accountChanged', handleChange);
        return () => { provider.off?.('accountChanged', handleChange); provider.removeListener?.('accountChanged', handleChange); };
      } },
    },
  };
}

function walletByName(name: SupportedWalletName) {
  const standard = getWallets().get().find((wallet) => wallet.name.trim().toLowerCase() === name.toLowerCase() && isSolanaWallet(wallet) && Boolean(wallet.features?.['standard:connect']?.connect));
  return standard ?? legacyWallet(name);
}

export class WalletNotDetectedError extends Error {
  constructor(public readonly walletName: SupportedWalletName) {
    super(`${walletName} wallet extension not detected.`);
    this.name = 'WalletNotDetectedError';
  }
}

export class WalletConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletConnectionError';
  }
}

export function accountAddress(account: WalletAccount | undefined) {
  return account?.address && typeof account.address === 'string' ? account.address : undefined;
}

export async function connectWallet(name: SupportedWalletName) {
  const wallet = walletByName(name);
  const feature = wallet?.features?.['standard:connect'];
  if (!wallet || !feature?.connect) throw new WalletNotDetectedError(name);
  try {
    const result = await feature.connect();
    const account = result.accounts?.find((item) => item.chains?.includes(solanaMainnet)) ?? result.accounts?.[0];
    const address = accountAddress(account);
    if (!address) throw new WalletConnectionError(`${name} did not return a Solana public address.`);
    return { wallet, account, address };
  } catch (error) {
    if (error instanceof WalletConnectionError || error instanceof WalletNotDetectedError) throw error;
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
    if (code === 4001 || message.includes('reject') || message.includes('cancel') || message.includes('denied')) throw new WalletConnectionError('Connection request was rejected.');
    throw new WalletConnectionError('Wallet connection could not be completed. Try again from the extension.');
  }
}

export async function disconnectWallet(wallet: StandardWallet | undefined) {
  await wallet?.features?.['standard:disconnect']?.disconnect?.();
}

export function listenForAccountChanges(wallet: StandardWallet, onChange: (address: string | undefined) => void) {
  const events = wallet.features?.['standard:events'];
  if (!events?.on) return () => undefined;
  const unsubscribe = events.on('change', (event) => {
    const accounts = (event as { accounts?: readonly WalletAccount[] } | undefined)?.accounts;
    onChange(accountAddress(accounts?.find((item) => item.chains?.includes(solanaMainnet)) ?? accounts?.[0]));
  });
  return typeof unsubscribe === 'function' ? unsubscribe : () => undefined;
}
