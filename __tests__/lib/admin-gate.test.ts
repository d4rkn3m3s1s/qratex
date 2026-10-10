/**
 * P0-01 — Admin gizli kapı: cevap saklama (özet), fail-closed yorumlama, kilit politikası,
 * katı ayar doğrulaması ve korunan ayar anahtarları.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-abc';

jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { settings: { update: jest.fn().mockResolvedValue({}) } } }));
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn().mockResolvedValue(null), redisSetJson: jest.fn() }));

import {
  AdminGateConfigError,
  DEFAULT_ADMIN_GATE_QUESTION,
  GATE_LOCK_POLICY,
  adminGateUpdateSchema,
  computeGateLock,
  defaultStoredGate,
  hashGateAnswer,
  isProtectedSettingKey,
  loadAdminGate,
  parseStoredGate,
  publicGateView,
  verifyGateAnswer,
} from '@/lib/admin-gate';
import { prisma } from '@/lib/prisma';

describe('cevap saklama', () => {
  it('özet sır ile anahtarlı: sır değişince aynı cevap farklı özet üretir (DB sızıntısı tek başına yetmez)', () => {
    const a = hashGateAnswer('7', 'salt');
    process.env.NEXTAUTH_SECRET = 'other';
    const b = hashGateAnswer('7', 'salt');
    process.env.NEXTAUTH_SECRET = 'test-secret-abc';
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifyGateAnswer: doğru/yanlış/biçim dışı', () => {
    const g = { salt: 's1', answerHash: hashGateAnswer('3', 's1') };
    expect(verifyGateAnswer(g, '3')).toBe(true);
    expect(verifyGateAnswer(g, ' 3 ')).toBe(true);
    expect(verifyGateAnswer(g, '4')).toBe(false);
    expect(verifyGateAnswer(g, '33')).toBe(false);
    expect(verifyGateAnswer(g, 3 as unknown as string)).toBe(false);
    expect(verifyGateAnswer(g, undefined)).toBe(false);
  });

  it('varsayılan kapı: cevap 7, isDefaultAnswer işaretli, düz cevap nesnede YOK', () => {
    const g = defaultStoredGate();
    expect(verifyGateAnswer(g, '7')).toBe(true);
    expect(g.isDefaultAnswer).toBe(true);
    expect(JSON.stringify(g)).not.toMatch(/"answer"/);
  });

  it('publicGateView özet ve tuzu dışarı vermez', () => {
    const view = publicGateView(defaultStoredGate());
    expect(view).not.toHaveProperty('answerHash');
    expect(view).not.toHaveProperty('salt');
    expect(view).not.toHaveProperty('answer');
    expect(view.question).toBe(DEFAULT_ADMIN_GATE_QUESTION);
  });
});

describe('parseStoredGate', () => {
  it('ESKİ düz metin satır özetlenir ve yükseltme istenir', () => {
    const { gate, needsUpgrade } = parseStoredGate({ question: 'Kaç boyut var?', answer: '3' });
    expect(needsUpgrade).toBe(true);
    expect(gate.question).toBe('Kaç boyut var?');
    expect(verifyGateAnswer(gate, '3')).toBe(true);
    expect(JSON.stringify(gate)).not.toContain('"3"');
  });

  it('bozuk satır varsayılana DÜŞMEZ, hata fırlatır (fail-closed)', () => {
    expect(() => parseStoredGate(null)).toThrow(AdminGateConfigError);
    expect(() => parseStoredGate({ question: 'x', answer: '42' })).toThrow(AdminGateConfigError);
    expect(() => parseStoredGate({ v: 2, question: 'x', answerHash: 'zz', salt: 's', cfgVer: 0 })).toThrow(AdminGateConfigError);
    expect(() => parseStoredGate([1])).toThrow(AdminGateConfigError);
  });

  it('v2 satır olduğu gibi okunur', () => {
    const v2 = { v: 2, question: 'Soru nedir?', answerHash: hashGateAnswer('5', 'ab'), salt: 'ab', cfgVer: 9, isDefaultAnswer: false };
    const { gate, needsUpgrade } = parseStoredGate(v2);
    expect(needsUpgrade).toBe(false);
    expect(gate.cfgVer).toBe(9);
    expect(verifyGateAnswer(gate, '5')).toBe(true);
  });
});

describe('loadAdminGate', () => {
  it('DB hatası yutulmaz (çağıran 503 döner; eskiden "7"ye düşüyordu)', async () => {
    const db = { settings: { findUnique: jest.fn().mockRejectedValue(new Error('P1001')) } };
    await expect(loadAdminGate(db as never)).rejects.toThrow('P1001');
  });

  it('eski düz metin satırı okununca DB özetli biçimle yeniden yazılır', async () => {
    const db = {
      settings: { findUnique: jest.fn().mockResolvedValue({ value: { question: 'Soru?', answer: '2' }, updatedAt: new Date() }) },
    };
    const g = await loadAdminGate(db as never);
    expect(verifyGateAnswer(g, '2')).toBe(true);
    const written = (prisma.settings.update as jest.Mock).mock.calls[0][0].data.value;
    expect(written.v).toBe(2);
    expect(written).not.toHaveProperty('answer');
  });
});

describe('computeGateLock (kümülatif kilit)', () => {
  const now = Date.UTC(2026, 9, 8, 12);
  const ago = (ms: number) => new Date(now - ms);

  it('2 yanlış → kilit yok, 1 hak kaldı', () => {
    const s = computeGateLock([ago(1000), ago(2000)], now);
    expect(s.locked).toBe(false);
    expect(s.attemptsLeft).toBe(1);
  });

  it('1 saatte 3 yanlış → 1 saat kilit', () => {
    const s = computeGateLock([ago(1000), ago(2000), ago(3000)], now);
    expect(s.locked).toBe(true);
    expect(s.lockedUntil!.getTime()).toBe(now - 1000 + GATE_LOCK_POLICY.shortLockMs);
  });

  it('kısa kilit bitince yeniden denenebilir; 24 saatte 5 yanlış → 24 saat kilit', () => {
    const h = 60 * 60 * 1000;
    const three = [ago(2 * h), ago(2 * h + 1000), ago(2 * h + 2000)];
    expect(computeGateLock(three, now).locked).toBe(false);
    const five = [ago(1000), ago(2000), ...three];
    const s = computeGateLock(five, now);
    expect(s.locked).toBe(true);
    expect(s.lockedUntil!.getTime()).toBe(now - 1000 + GATE_LOCK_POLICY.longLockMs);
  });

  it('SALDIRI: 10 rakamın hepsini 24 saatte denemek mümkün değil', () => {
    // Saldırgan her kilit bitiminde dener: en fazla 5 yanlış / 24 saat.
    const failures: Date[] = [];
    let t = now;
    let tries = 0;
    for (let step = 0; step < 24 * 60; step++) {
      t = now + step * 60_000;
      const s = computeGateLock(failures, t);
      if (!s.locked) {
        failures.push(new Date(t));
        tries++;
      }
    }
    expect(tries).toBeLessThanOrEqual(GATE_LOCK_POLICY.longMaxFailures);
  });
});

describe('ayar girdisi (zod)', () => {
  it('"42" gibi geçersiz cevap 400 (eskiden sessizce 7 oluyordu)', () => {
    expect(adminGateUpdateSchema.safeParse({ question: 'Geçerli soru', newAnswer: '42' }).success).toBe(false);
    expect(adminGateUpdateSchema.safeParse({ question: 'Geçerli soru', newAnswer: 'a' }).success).toBe(false);
  });
  it('boş/kısa soru reddedilir', () => {
    expect(adminGateUpdateSchema.safeParse({ question: '' }).success).toBe(false);
    expect(adminGateUpdateSchema.safeParse({ question: 'abc' }).success).toBe(false);
  });
  it('bilinmeyen alan (ör. düz "answer") reddedilir', () => {
    expect(adminGateUpdateSchema.safeParse({ question: 'Geçerli soru', answer: '3' }).success).toBe(false);
  });
  it('yalnız soru değişikliği ve boş newAnswer kabul', () => {
    const r = adminGateUpdateSchema.safeParse({ question: 'Geçerli soru', newAnswer: '' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.newAnswer).toBeUndefined();
  });
});

describe('korunan ayar anahtarları', () => {
  it('admin_gate genel ayar uçlarından korunur', () => {
    expect(isProtectedSettingKey('admin_gate')).toBe(true);
    expect(isProtectedSettingKey(' admin_gate ')).toBe(true);
    expect(isProtectedSettingKey('points_matrix')).toBe(false);
    expect(isProtectedSettingKey(undefined)).toBe(false);
  });
});
