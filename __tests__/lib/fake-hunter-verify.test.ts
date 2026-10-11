/** @jest-environment node */
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import { fakeHunterVerifier, buildRankedRound, buildPracticeRound, FAKE_HUNTER_POOLS } from '@/lib/games/validators/fake-hunter';
import { FAKE_HUNTER_BANK } from '@/lib/games/content/fake-hunter.server';
import {
  totalScore,
  RANKED_TOTAL,
  MODE_ORDER,
  maxPossibleScore,
  updateElo,
  ELO_START,
  starsFor,
} from '@/components/customer/games/fake-hunter/rules';

const rules: VerifierRules = {
  gameType: 'fake-hunter',
  maxScore: 30,
  rewardThreshold: 14,
  minDurationSec: 20,
  maxScorePerSec: 1.2,
  maxDurationSec: 240,
};

function wrongOf(truth: string): string {
  if (truth === 'real') return 'fake';
  if (truth === 'fake') return 'real';
  return truth === 's0' ? 's1' : 's0';
}

function honestProof(seed: string, correctMask: (i: number) => boolean, gapMs = 3000) {
  const round = buildRankedRound(seed);
  const answers = round.items.map((it, i) => {
    const truth = round.answerKey[it.id];
    return { id: it.id, verdict: correctMask(i) ? truth : wrongOf(truth), tMs: 2000 + i * gapMs };
  });
  return { round, answers };
}

describe('içerik havuzu', () => {
  it('en az 120 öğe, benzersiz kimlik, her modda ≥ 30', () => {
    expect(FAKE_HUNTER_BANK.length).toBeGreaterThanOrEqual(120);
    expect(new Set(FAKE_HUNTER_BANK.map((i) => i.id)).size).toBe(FAKE_HUNTER_BANK.length);
    for (const m of MODE_ORDER) expect(FAKE_HUNTER_BANK.filter((i) => i.payload.mode === m).length).toBeGreaterThanOrEqual(30);
  });
  it('kelime etiketi var olan bir bölüme işaret eder', () => {
    for (const it of FAKE_HUNTER_BANK.filter((i) => i.payload.mode === 'kelime')) {
      const parts = it.payload.parts as string[];
      expect(Number(it.label.slice(1))).toBeLessThan(parts.length);
    }
  });
  it('ikili modlarda sıralı havuzda iki etiketten de yeterli öğe var', () => {
    for (const m of ['kaydir', 'dosya', 'profil']) {
      const p = FAKE_HUNTER_POOLS.ranked.filter((i) => i.payload.mode === m);
      expect(p.filter((i) => i.label === 'real').length).toBeGreaterThanOrEqual(3);
      expect(p.filter((i) => i.label === 'fake').length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('tur kurulumu', () => {
  it('sıralı tur deterministik, 12 öğe, aşamalı, etiket/açıklama sızdırmaz', () => {
    const a = buildRankedRound('tohum-1');
    expect(a).toEqual(buildRankedRound('tohum-1'));
    expect(a.items).toHaveLength(RANKED_TOTAL);
    expect(a.items.map((i) => i.mode)).toEqual(MODE_ORDER.flatMap((m) => [m, m, m]));
    for (const it of a.items) {
      expect(it.id).toMatch(/^q\d+$/);
      expect(it).not.toHaveProperty('why');
      expect(it).not.toHaveProperty('label');
      expect(JSON.stringify(it)).not.toMatch(/fh-/);
    }
    for (const m of ['kaydir', 'dosya', 'profil']) {
      const labels = a.items.filter((i) => i.mode === m).map((i) => a.answerKey[i.id]);
      expect(new Set(labels)).toEqual(new Set(['real', 'fake']));
    }
  });
  it('aşama içinde zorluk azalmaz', () => {
    const a = buildRankedRound('eğri');
    for (const m of MODE_ORDER) {
      const d = a.items.filter((i) => i.mode === m).map((i) => Number(i.difficulty));
      expect(d).toEqual([...d].sort((x, y) => x - y));
    }
  });
  it('pratik turu sıralı havuzdan ayrı ve açıklamalı', () => {
    const p = buildPracticeRound('x');
    expect(p.items.length).toBeGreaterThan(12);
    expect(p.items.every((i) => typeof i.why === 'string')).toBe(true);
    const rankedTexts = new Set(FAKE_HUNTER_POOLS.ranked.map((i) => JSON.stringify(i.payload)));
    for (const it of p.items) {
      const { id: _id, difficulty: _d, ...payload } = it;
      void _id;
      void _d;
      expect(rankedTexts.has(JSON.stringify(payload))).toBe(false);
    }
  });
});

describe('sunucu otoritesi', () => {
  it('dürüst ve iyi oyun ödüllenir; istemci skoru sunucuyla birebir', () => {
    const mask = (i: number) => i % 5 !== 4;
    const { answers } = honestProof('dürüst', mask);
    const client = totalScore(answers.map((_, i) => mask(i)));
    const out = runVerifier(fakeHunterVerifier, { seed: 'dürüst', rules, proof: { answers }, clientScore: client, serverElapsedSec: 60 });
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(client);
    expect(out.verifiedScore).toBeGreaterThanOrEqual(rules.rewardThreshold);
  });
  it('kusursuz tur tavanı ve saniye başı sınırı aşmaz', () => {
    expect(maxPossibleScore(RANKED_TOTAL)).toBeLessThanOrEqual(rules.maxScore);
    expect(maxPossibleScore(RANKED_TOTAL) / 30).toBeLessThanOrEqual(rules.maxScorePerSec!);
  });
  it('şişirilmiş skor sunucu skoruna iner (score_mismatch)', () => {
    const { answers } = honestProof('şişir', () => false);
    const out = runVerifier(fakeHunterVerifier, { seed: 'şişir', rules, proof: { answers }, clientScore: 30, serverElapsedSec: 60 });
    expect(out.verifiedScore).toBe(0);
    expect(out.flags).toContain('score_mismatch');
  });
  it('hep "sahte" demek eşiği geçemez', () => {
    const strategies: [string, string][] = ['s0', 's1', 's2', 's3'].flatMap((k) => [['fake', k], ['real', k]] as [string, string][]);
    for (let n = 0; n < 40; n++) {
      const seed = `h${n}`;
      const [bin, kel] = strategies[n % strategies.length];
      const round = buildRankedRound(seed);
      const answers = round.items.map((it, i) => ({ id: it.id, verdict: it.mode === 'kelime' ? kel : bin, tMs: 1000 + i * 3000 }));
      const out = runVerifier(fakeHunterVerifier, { seed, rules, proof: { answers }, clientScore: 0, serverElapsedSec: 60 });
      expect(out.verifiedScore).toBeLessThan(rules.rewardThreshold);
    }
  });
  it('kanıtsız deneme bloklanır', () => {
    const out = runVerifier(fakeHunterVerifier, { seed: 's', rules, proof: undefined, clientScore: 28, serverElapsedSec: 60 });
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });
  it('insanüstü hızlı betik bloklanır', () => {
    const { answers } = honestProof('bot', () => true, 50);
    const out = runVerifier(fakeHunterVerifier, { seed: 'bot', rules, proof: { answers }, clientScore: 28, serverElapsedSec: 60 });
    expect(out.flags).toContain('implausible');
    expect(out.verifiedScore).toBe(0);
  });
  it('tekrarlı ya da uydurma kimlik bloklanır', () => {
    const { answers } = honestProof('dup', () => true);
    const dup = [...answers, { ...answers[0], tMs: 99_000 }];
    expect(runVerifier(fakeHunterVerifier, { seed: 'dup', rules, proof: { answers: dup }, clientScore: 0, serverElapsedSec: 120 }).flags).toContain('proof_invalid');
    const forged = [{ id: 'q99', verdict: 'fake', tMs: 1000 }];
    expect(runVerifier(fakeHunterVerifier, { seed: 'dup', rules, proof: { answers: forged }, clientScore: 0, serverElapsedSec: 120 }).flags).toContain('proof_invalid');
  });
  it('başka tohumun cevap anahtarı işe yaramaz', () => {
    const { answers } = honestProof('A', () => true);
    const out = runVerifier(fakeHunterVerifier, { seed: 'B', rules, proof: { answers }, clientScore: 28, serverElapsedSec: 60 });
    expect(out.verifiedScore).toBeLessThan(28);
  });
  it('sunucu süresinden sonraki cevap bloklanır', () => {
    const { answers } = honestProof('geç', () => true);
    const out = runVerifier(fakeHunterVerifier, { seed: 'geç', rules, proof: { answers }, clientScore: 28, serverElapsedSec: 10 });
    expect(out.flags).toContain('implausible');
  });
});

describe('Elo ve yıldız', () => {
  it('zor öğeyi bilmek kolayı bilmekten çok kazandırır', () => {
    expect(updateElo(ELO_START, 3, true) - ELO_START).toBeGreaterThan(updateElo(ELO_START, 1, true) - ELO_START);
    expect(updateElo(ELO_START, 1, false)).toBeLessThan(ELO_START);
  });
  it('yıldızlar eşik altında 0, tavanda 3', () => {
    expect(starsFor(10, 14, 28)).toBe(0);
    expect(starsFor(14, 14, 28)).toBe(1);
    expect(starsFor(28, 14, 28)).toBe(3);
  });
});
