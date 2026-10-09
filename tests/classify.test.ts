import { describe, expect, it } from 'vitest';
import { classify, extractCandidates } from '../src/lib/classify';
import { units } from '../src/lib/model';

describe('SNIFF input detection', () => {
  it('recognizes Solana addresses, signatures, and public links', () => {
    expect(classify('So11111111111111111111111111111111111111112').kind).toBe('address');
    expect(classify('2'.repeat(88)).kind).toBe('transaction');
    expect(classify('@solana').kind).toBe('social');
    expect(classify('https://example.com/project').kind).toBe('website');
  });

  it('keeps OCR candidates bounded and normalizes handles', () => {
    const candidates = extractCandidates('See @Solana and https://example.com/path, $SNIFF');
    expect(candidates.map((candidate) => candidate.value)).toContain('https://x.com/solana');
    expect(candidates.length).toBeLessThanOrEqual(40);
  });

  it('formats exact token units without floating point rounding', () => {
    expect(units('1234500', 6)).toBe('1.2345');
  });
});
