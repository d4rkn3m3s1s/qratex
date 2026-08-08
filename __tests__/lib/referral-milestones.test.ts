/**
 * Referral kademe mantığı: hangi kademeler talep edilebilir, bir sonraki hedef ne,
 * ilerleme oranı. Yanlış hesap ya çift ödül (idempotency kırılır) ya da eksik ödül
 * (ulaşılmış kademe verilmez) üretir.
 */
import {
  REFERRAL_MILESTONES,
  parseClaimedReferralMilestones,
  claimableReferralMilestones,
  nextReferralMilestone,
  referralProgress,
} from '@/lib/referral-milestones';

describe('REFERRAL_MILESTONES veri bütünlüğü', () => {
  it('kademeler artan ve puanları pozitif', () => {
    const counts = REFERRAL_MILESTONES.map((m) => m.count);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(new Set(counts).size).toBe(counts.length);
    for (const m of REFERRAL_MILESTONES) expect(m.points).toBeGreaterThan(0);
  });
});

describe('parseClaimedReferralMilestones', () => {
  it('geçerli number[] döner, çöpü atar', () => {
    expect(parseClaimedReferralMilestones([3, 5])).toEqual([3, 5]);
    expect(parseClaimedReferralMilestones(['3', null, 5, NaN])).toEqual([5]);
    expect(parseClaimedReferralMilestones(null)).toEqual([]);
    expect(parseClaimedReferralMilestones('nope')).toEqual([]);
  });
});

describe('claimableReferralMilestones', () => {
  it('eşik altında: hiçbir kademe talep edilemez', () => {
    expect(claimableReferralMilestones(2, [])).toEqual([]);
  });

  it('3 davet + hiç alınmamış → sadece 3. kademe talep edilebilir', () => {
    const c = claimableReferralMilestones(3, []);
    expect(c.map((m) => m.count)).toEqual([3]);
  });

  it('10 davet + 3 alınmış → 5 ve 10 talep edilebilir (3 hariç)', () => {
    const c = claimableReferralMilestones(10, [3]);
    expect(c.map((m) => m.count)).toEqual([5, 10]);
  });

  it('hepsi alınmışsa boş', () => {
    const c = claimableReferralMilestones(30, [3, 5, 10, 25]);
    expect(c).toEqual([]);
  });
});

describe('nextReferralMilestone', () => {
  it('0 davet → ilk kademe (3)', () => {
    expect(nextReferralMilestone(0)?.count).toBe(3);
  });
  it('4 davet → sonraki 5', () => {
    expect(nextReferralMilestone(4)?.count).toBe(5);
  });
  it('en yüksek kademe geçildi → null', () => {
    expect(nextReferralMilestone(100)).toBeNull();
  });
});

describe('referralProgress', () => {
  it('taban ile hedef arasında doğru oran', () => {
    // 4 davet: prev threshold=3, next=5 → span=2, done=1 → ratio 0.5
    const p = referralProgress(4);
    expect(p.next?.count).toBe(5);
    expect(p.target).toBe(5);
    expect(p.ratio).toBeCloseTo(0.5, 5);
  });

  it('ilk kademeye doğru: taban 0', () => {
    // 1 davet: prev=0, next=3 → span=3, done=1 → ratio 1/3
    const p = referralProgress(1);
    expect(p.ratio).toBeCloseTo(1 / 3, 5);
  });

  it('tüm kademeler geçilmiş → next null, ratio 1', () => {
    const p = referralProgress(50);
    expect(p.next).toBeNull();
    expect(p.ratio).toBe(1);
  });
});
