import { describe, expect, it } from 'vitest';
import { addr, entity, type Snapshot } from '../src/lib/model';
import { analyze } from '../src/lib/workers/analysis';
import { newCase } from '../src/stores/app';

const wallet = 'SharedWallet111111111111111111111111111111111111';

function tokenSnapshot(token: string, account: string): Snapshot {
  const root = entity(addr(token), 'token', token, true);
  const tokenAccount = entity(addr(account), 'tokenAccount', account, true);
  const owner = entity(addr(wallet), 'wallet', wallet, true);
  const holderFinding = { id: `holder:${token}`, title: 'Holder', description: 'Observed holder', entityIds: [root.id, tokenAccount.id], category: 'holder' as const, source: { provider: 'Solana RPC', url: `https://solscan.io/token/${token}`, at: new Date().toISOString(), strength: 'onchain' as const } };
  const ownerFinding = { id: `owner:${token}`, title: 'Owner', description: 'Observed owner', entityIds: [owner.id, tokenAccount.id], category: 'holder' as const, source: { provider: 'Solana RPC', url: `https://solscan.io/account/${wallet}`, at: new Date().toISOString(), strength: 'onchain' as const } };
  return { target: addr(token), root, entities: [root, tokenAccount, owner], relationships: [{ id: holderFinding.id, from: root.id, to: tokenAccount.id, type: 'holding', findingId: holderFinding.id }, { id: ownerFinding.id, from: owner.id, to: tokenAccount.id, type: 'holding', findingId: ownerFinding.id }], findings: [holderFinding, ownerFinding], transfers: [], at: new Date().toISOString(), warnings: [], coverage: 'test' };
}

describe('case graph analysis', () => {
  it('finds a wallet shared by more than one token snapshot', () => {
    const caseFile = newCase();
    caseFile.snapshots = [tokenSnapshot('TokenOne111111111111111111111111111111111111', 'AccountOne11111111111111111111111111111111111'), tokenSnapshot('TokenTwo111111111111111111111111111111111111', 'AccountTwo11111111111111111111111111111111111')];

    const result = analyze(caseFile);

    expect(result.shared).toContainEqual(expect.objectContaining({ kind: 'wallet', projects: expect.arrayContaining([caseFile.snapshots[0].root.id, caseFile.snapshots[1].root.id]) }));
  });
});
