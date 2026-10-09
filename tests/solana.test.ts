import { afterEach, describe, expect, it, vi } from 'vitest';
import { addr, entity, type Snapshot } from '../src/lib/model';
import { queryClient } from '../src/lib/providers/client';
import { solana } from '../src/lib/providers/solana';

const market = '6Scr6DJM5q3m58YfLm6zsNffMD5GByL5MgyMc4DUUXMX';
const mint = '8sRoVmMeSw5aDF6AdS4RR1ro4X5y2Z5RapHzjYhpump';
const tokenProgram = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const pumpFunProgram = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe('Solana route resolution', () => {
  it('resolves a Pump.fun market account to its Token-2022 mint', async () => {
    const response = (result: unknown) => new Response(JSON.stringify({ result }), { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method === 'getAccountInfo') {
        const address = body.params[0];
        if (address === market) return response({ context: { slot: 1 }, value: { lamports: 1, owner: pumpFunProgram, executable: false, data: ['', 'base64'] } });
        return response({ context: { slot: 2 }, value: { lamports: 1, owner: tokenProgram, executable: false, data: { parsed: { type: 'mint', info: { supply: '1000000', decimals: 6, mintAuthority: null, freezeAuthority: null, extensions: [{ extension: 'tokenMetadata', state: { name: 'PENG', symbol: 'PENG' } }] } } } } });
      }
      if (body.method === 'getTokenAccountsByOwner') {
        const programId = (body.params[1] as { programId: string }).programId;
        return response({ value: programId === tokenProgram ? [{ pubkey: 'token-account', account: { lamports: 1, owner: tokenProgram, executable: false, data: { parsed: { type: 'account', info: { mint, tokenAmount: { amount: '100', decimals: 6 } } } } } }] : [] });
      }
      if (body.method === 'getTokenLargestAccounts') return response({ context: { slot: 3 }, value: [] });
      if (body.method === 'getSignaturesForAddress') return response([]);
      throw new Error(`Unexpected RPC method: ${body.method}`);
    });

    const snapshot = { target: addr(market), root: entity(addr(market)), entities: [], relationships: [], findings: [], transfers: [], at: new Date().toISOString(), warnings: [], coverage: '' } as Snapshot;
    await solana(snapshot, new AbortController().signal, () => undefined, 'PublicNode');

    expect(snapshot.target.value).toBe(mint);
    expect(snapshot.root.kind).toBe('token');
    expect(snapshot.token?.name).toBe('PENG');
    expect(snapshot.entities.some((item) => item.kind === 'pool' && item.value === market)).toBe(true);
    expect(snapshot.relationships.some((item) => item.type === 'pool')).toBe(true);
  });
});
