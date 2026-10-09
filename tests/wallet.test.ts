/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { connectWallet, getWallets } from '../src/lib/wallet';

describe('Wallet Standard connection', () => {
  it('discovers a Solana wallet through the app-ready handshake and reads its address', async () => {
    const address = '7xK9' + '111111111111111111111111111111111111';
    const wallet = {
      name: 'Phantom',
      chains: ['solana:mainnet'],
      accounts: [],
      features: {
        'standard:connect': { connect: async () => ({ accounts: [{ address, chains: ['solana:mainnet'] }] }) },
      },
    };
    window.addEventListener('wallet-standard:app-ready', (event) => (event as CustomEvent<{ register: (value: typeof wallet) => void }>).detail.register(wallet), { once: true });
    getWallets();
    const connection = await connectWallet('Phantom');
    expect(connection.address).toBe(address);
    expect(connection.wallet.name).toBe('Phantom');
    await expect(connectWallet('Solflare')).rejects.toThrow('Solflare wallet extension not detected.');
  });
});
