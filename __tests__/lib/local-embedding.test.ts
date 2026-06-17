import { localEmbed, cosineSimilarity, LOCAL_EMBEDDING_DIM } from '@/lib/local-embedding';

describe('local-embedding', () => {
  it('produces a fixed-dimension L2-normalized vector', () => {
    const v = localEmbed('Servis çok yavaştı ve garson ilgisizdi');
    expect(v).toHaveLength(LOCAL_EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);
  });

  it('is deterministic (same text -> same vector)', () => {
    const a = localEmbed('Yemekler harikaydı, tekrar geleceğim');
    const b = localEmbed('Yemekler harikaydı, tekrar geleceğim');
    expect(a).toEqual(b);
  });

  it('returns zero vector for empty/too-short text', () => {
    const v = localEmbed('  ');
    expect(v.every((x) => x === 0)).toBe(true);
  });

  it('similar texts score higher than unrelated ones', () => {
    const base = localEmbed('servis çok yavaştı garson ilgisizdi bekledik');
    const similar = localEmbed('servis yavaştı garson ilgisiz çok bekledik');
    const unrelated = localEmbed('yemekler harika lezzetli tatlı muhteşemdi');

    const simScore = cosineSimilarity(base, similar);
    const unrelScore = cosineSimilarity(base, unrelated);

    expect(simScore).toBeGreaterThan(unrelScore);
    expect(simScore).toBeGreaterThan(0.4);
  });

  it('identical text has cosine similarity ~1', () => {
    const a = localEmbed('aynı metin testi burada');
    const b = localEmbed('aynı metin testi burada');
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});
