/**
 * P0-34 — KVKK DSR akışı "kâğıt üzerinde" değil:
 *  - Talep yalnız türüne özgü YÜRÜTME KANITI (DsrEvent) varsa `completed` olur.
 *  - Yeniden açılan talep eski kanıtla tekrar kapatılamaz.
 *  - Dışa aktarma/silme/saklama kapsamı PII_REGISTRY'den türer: QRA sohbetleri, push
 *    abonelikleri ve AuditLog yükleri dahil; KVKK kanıt satırları silmede de korunur.
 * Prisma mock'lanır; gerçek DB'ye gidilmez.
 */
jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: jest.fn(async () => undefined) }));
const mockDeleteFromR2 = jest.fn(async (_key: string) => undefined);
jest.mock('@/lib/r2-storage', () => ({
  isR2Configured: () => true,
  keyFromPublicUrl: (u: string) => (u.startsWith('https://cdn.test/') ? u.slice('https://cdn.test/'.length) : null),
  deleteFromR2: (k: string) => mockDeleteFromR2(k),
}));

import { db, resetDb } from '../helpers/prisma-proxy';
import {
  DsrEvidenceError,
  canComplete,
  checkDsrCommand,
  completeDsrIfEvidenced,
  computeDueAt,
  isAccessDownloadable,
  missingEvidence,
  recordDsrEvent,
} from '@/lib/dsr-workflow';
import {
  PROTECTED_AUDIT_ACTIONS,
  applyPersonalDataRetention,
  deletePersonalObjects,
  exportDigest,
  exportUserData,
  purgeRegistryPersonalData,
} from '@/lib/gdpr-core';
import { PII_REGISTRY, delegateName, eraseEntries, exportEntries } from '@/lib/pii-registry';
import type { Prisma } from '@prisma/client';

const tx = db as unknown as Prisma.TransactionClient;

beforeEach(() => {
  resetDb();
  mockDeleteFromR2.mockClear();
});

// ───────────────────────────── Saf durum makinesi ─────────────────────────────

describe('kanıt kuralı (missingEvidence / canComplete)', () => {
  it('silme talebi yürütme kanıtı olmadan kapanamaz', () => {
    expect(canComplete('deletion', [{ type: 'received' }, { type: 'in_review' }])).toBe(false);
    expect(missingEvidence('deletion', [{ type: 'received' }])).toEqual(['erasure_executed']);
    expect(canComplete('deletion', [{ type: 'received' }, { type: 'erasure_executed' }])).toBe(true);
  });

  it('erişim talebi: paket üretildi VE sahibine ulaştı (bildirim ya da indirme)', () => {
    expect(missingEvidence('access', [{ type: 'export_generated' }])).toEqual(['notified']);
    expect(canComplete('access', [{ type: 'export_generated' }, { type: 'notified' }])).toBe(true);
    expect(canComplete('access', [{ type: 'export_generated' }, { type: 'export_downloaded' }])).toBe(true);
    // Yalnız makbuz bildirimi paket üretimi yerine geçmez.
    expect(canComplete('access', [{ type: 'notified' }])).toBe(false);
  });

  it('yeniden açılan talep ESKİ kanıtla kapatılamaz', () => {
    const events = [{ type: 'rectified' }, { type: 'completed' }, { type: 'reopened' }];
    expect(canComplete('rectification', events)).toBe(false);
    expect(canComplete('rectification', [...events, { type: 'rectified' }])).toBe(true);
  });

  it('bilinmeyen tür hiçbir kanıtla kapanmaz', () => {
    expect(canComplete('whatever', [{ type: 'completed' }])).toBe(false);
  });
});

describe('checkDsrCommand', () => {
  const open = { type: 'deletion', status: 'in_review', userId: 'u1' };

  it('yanlış türde komut reddedilir (erişim talebinde silme yürütülemez)', () => {
    const r = checkDsrCommand({ ...open, type: 'access' }, 'erase');
    expect(r).toMatchObject({ ok: false, code: 'WRONG_TYPE', status: 409 });
  });

  it('hesaba bağlı olmayan talepte silme yürütülemez', () => {
    expect(checkDsrCommand({ ...open, userId: null }, 'erase')).toMatchObject({ ok: false, code: 'NO_ACCOUNT' });
  });

  it('red ve düzeltme gerekçe ister (en az 10 karakter)', () => {
    expect(checkDsrCommand(open, 'reject', { reason: 'kısa' })).toMatchObject({ ok: false, code: 'REASON_REQUIRED' });
    expect(checkDsrCommand(open, 'reject', { reason: 'Kimlik doğrulanamadı.' })).toEqual({ ok: true });
  });

  it('tamamlanmış SİLME talebi yeniden açılamaz (veri geri gelmez)', () => {
    expect(checkDsrCommand({ ...open, status: 'completed' }, 'reopen', { reason: 'tekrar bakılacak' })).toMatchObject({
      ok: false,
      code: 'INVALID_STATE',
    });
  });

  it('teslim onayı paket üretilmeden verilemez', () => {
    const access = { type: 'access', status: 'in_review', userId: 'u1' };
    expect(checkDsrCommand(access, 'confirm_delivery', { events: [{ type: 'received' }] })).toMatchObject({ ok: false, code: 'NO_EVIDENCE' });
    expect(checkDsrCommand(access, 'confirm_delivery', { events: [{ type: 'export_generated' }] })).toEqual({ ok: true });
  });
});

describe('süreler', () => {
  it('KVKK m.13: son tarih başvurudan 30 gün sonra', () => {
    const created = new Date('2026-10-01T00:00:00Z');
    expect(computeDueAt(created).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('paket yalnız tamamlanan erişim talebinde ve 30 gün içinde indirilebilir', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    expect(isAccessDownloadable({ type: 'access', status: 'completed', processedAt: new Date('2026-10-01') }, now)).toBe(true);
    expect(isAccessDownloadable({ type: 'access', status: 'completed', processedAt: new Date('2026-08-01') }, now)).toBe(false);
    expect(isAccessDownloadable({ type: 'access', status: 'in_review', processedAt: null }, now)).toBe(false);
    expect(isAccessDownloadable({ type: 'deletion', status: 'completed', processedAt: new Date('2026-10-01') }, now)).toBe(false);
  });
});

// ───────────────────────────── Yazıcılar (tx) ─────────────────────────────

describe('recordDsrEvent', () => {
  it('kanıt satırı + aktörlü denetim satırı aynı tx içinde yazılır', async () => {
    db.dsrEvent.create.mockResolvedValue({ id: 'ev1' });
    db.auditLog.create.mockResolvedValue({ id: 'al1' });
    await recordDsrEvent(tx, {
      requestId: 'r1',
      type: 'erasure_executed',
      actorId: 'admin-1',
      detail: { counts: { 'QraChatLog.userId': 3 } },
      meta: { ipAddress: '1.2.3.4', userAgent: 'jest' },
    });
    expect(db.dsrEvent.create).toHaveBeenCalledWith({
      data: { requestId: 'r1', type: 'erasure_executed', actorId: 'admin-1', detail: { counts: { 'QraChatLog.userId': 3 } } },
      select: { id: true },
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'admin-1',
      action: 'dsr_erasure_executed',
      entity: 'DataSubjectRequest',
      entityId: 'r1',
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
    });
  });
});

describe('completeDsrIfEvidenced — "Tamamlandı" yalnız kanıtla', () => {
  beforeEach(() => {
    db.dataSubjectRequest.findUnique.mockResolvedValue({ type: 'deletion', status: 'in_review' });
    db.dsrEvent.create.mockResolvedValue({ id: 'evc' });
    db.auditLog.create.mockResolvedValue({ id: 'al' });
  });

  it('HATA SENARYOSU: yürütülmemiş silme talebi kapatılamaz, satır güncellenmez', async () => {
    db.dsrEvent.findMany.mockResolvedValue([{ type: 'received' }, { type: 'in_review' }]);
    await expect(completeDsrIfEvidenced(tx, 'r1', 'admin-1')).rejects.toBeInstanceOf(DsrEvidenceError);
    expect(db.dataSubjectRequest.updateMany).not.toHaveBeenCalled();
    expect(db.dataSubjectRequest.update).not.toHaveBeenCalled();
  });

  it('yürütme kanıtı varsa koşullu kapanış + "completed" kanıtı', async () => {
    db.dsrEvent.findMany.mockResolvedValue([{ type: 'received' }, { type: 'erasure_executed' }]);
    db.dataSubjectRequest.updateMany.mockResolvedValue({ count: 1 });
    await expect(completeDsrIfEvidenced(tx, 'r1', 'admin-1')).resolves.toEqual({ completed: true });
    const call = db.dataSubjectRequest.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'r1', status: { in: ['received', 'in_review'] } });
    expect(call.data.status).toBe('completed');
    expect(db.dsrEvent.create.mock.calls.at(-1)[0].data.type).toBe('completed');
  });

  it('eşzamanlı ikinci kapanış etkisiz (zaten kapalı → count 0, ikinci kanıt yazılmaz)', async () => {
    db.dsrEvent.findMany.mockResolvedValue([{ type: 'erasure_executed' }]);
    db.dataSubjectRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(completeDsrIfEvidenced(tx, 'r1', 'admin-1')).resolves.toEqual({ completed: false });
    expect(db.dsrEvent.create).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── Kapsam: dışa aktarma / silme / saklama ─────────────────────────────

function primeExport(rowsFor: Record<string, unknown[]> = {}) {
  db.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Ayşe', email: 'ayse@test.local' });
  for (const e of exportEntries()) {
    const d = delegateName(e.model);
    if (!db[d].findMany.getMockImplementation()) db[d].findMany.mockResolvedValue(rowsFor[e.model] ?? []);
  }
}

describe('exportUserData — QRA sohbetleri dahil tam envanter', () => {
  it('QRA sohbet kayıtları pakette; sorgu kişinin kendi satırlarıyla sınırlı', async () => {
    db.qraChatLog.findMany.mockResolvedValue([{ id: 'c1', userMessage: 'Merhaba', assistantMessage: 'Selam', model: 'x', createdAt: new Date() }]);
    primeExport();
    const data = await exportUserData('u1');
    const sections = data.sections as Record<string, unknown[]>;
    expect(sections.qraChatLogs).toHaveLength(1);
    expect(data.counts.qraChatLogs).toBe(1);
    const q = db.qraChatLog.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ userId: 'u1' });
    expect(Object.keys(q.select)).toEqual(expect.arrayContaining(['userMessage', 'assistantMessage']));
    // Profil sorgusu gizli değer seçmez.
    const profileSelect = db.user.findUnique.mock.calls[0][0].select;
    expect(profileSelect.password).toBeUndefined();
    expect(profileSelect.twoFactorSecret).toBeUndefined();
  });

  it('üst sınır aşılırsa sessizce kesilmez: truncated listesine yazılır', async () => {
    const entry = PII_REGISTRY.find((e) => e.model === 'QraChatLog')!;
    const max = entry.export!.max;
    db.qraChatLog.findMany.mockResolvedValue(Array.from({ length: max + 1 }, (_, i) => ({ id: `c${i}` })));
    primeExport();
    const data = await exportUserData('u1');
    expect(data.truncated).toContain('qraChatLogs');
    expect(data.counts.qraChatLogs).toBe(max);
  });

  it('paket özeti deterministik (kanıt zincirine içerik değil özet yazılır)', () => {
    expect(exportDigest({ a: 1 })).toBe(exportDigest({ a: 1 }));
    expect(exportDigest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(exportDigest({ a: 1 })).not.toBe(exportDigest({ a: 2 }));
  });
});

function primeErase() {
  for (const e of eraseEntries()) {
    const d = delegateName(e.model);
    db[d].deleteMany.mockResolvedValue({ count: 2 });
    db[d].updateMany.mockResolvedValue({ count: 2 });
    db[d].findMany.mockResolvedValue([]);
  }
}

describe('purgeRegistryPersonalData — silme talebinin çevre kapsamı', () => {
  it('QRA sohbetleri ve push abonelikleri SİLİNİR', async () => {
    primeErase();
    const res = await purgeRegistryPersonalData(tx, 'u1');
    expect(db.qraChatLog.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(res.counts['QraChatLog.userId']).toBe(2);
    expect(res.counts['PushSubscription.userId']).toBe(2);
  });

  it('AuditLog yükleri temizlenir AMA KVKK yürütme kanıtları (gdpr_*, dsr_*) korunur', async () => {
    primeErase();
    await purgeRegistryPersonalData(tx, 'u1');
    const call = db.auditLog.updateMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([{ userId: 'u1' }, { entity: 'User', entityId: 'u1' }]);
    expect(call.where.NOT).toEqual(PROTECTED_AUDIT_ACTIONS);
    expect(call.data).toMatchObject({ ipAddress: null, userAgent: null });
    expect(db.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it('yorum fotoğrafları ve yüklenen dosyalar R2 silme listesine girer', async () => {
    primeErase();
    db.feedback.findMany.mockResolvedValue([{ media: [{ url: 'https://cdn.test/fb/1.jpg' }, 'https://cdn.test/fb/2.jpg'] }]);
    db.fileUpload.findMany.mockResolvedValue([{ url: 'https://cdn.test/up/a.png', thumbnail: null }]);
    const res = await purgeRegistryPersonalData(tx, 'u1');
    expect(res.objectUrls).toEqual(
      expect.arrayContaining(['https://cdn.test/fb/1.jpg', 'https://cdn.test/fb/2.jpg', 'https://cdn.test/up/a.png'])
    );
    // Medya alanı redakte edilir (satır kalır, puan istatistiği korunur).
    expect(db.feedback.updateMany).toHaveBeenCalled();
    expect(db.feedback.deleteMany).not.toHaveBeenCalled();
    await expect(deletePersonalObjects(res.objectUrls)).resolves.toBe(3);
    expect(mockDeleteFromR2).toHaveBeenCalledWith('fb/1.jpg');
  });

  it('işletme ve aktör kayıtlarına dokunulmaz (QR, puan defteri, tüketim satırı)', async () => {
    primeErase();
    await purgeRegistryPersonalData(tx, 'u1');
    expect(db.qRCode.deleteMany).not.toHaveBeenCalled();
    expect(db.qRCode.updateMany).not.toHaveBeenCalled();
    expect(db.pointsLedger.deleteMany).not.toHaveBeenCalled();
    expect(db.consumption.deleteMany).not.toHaveBeenCalled();
    expect(db.dataSubjectRequest.deleteMany).not.toHaveBeenCalled();
    expect(db.consentRecord.deleteMany).not.toHaveBeenCalled();
  });
});

describe('applyPersonalDataRetention — saklama süresi gerçekten uygulanır', () => {
  const NOW = new Date('2026-10-10T00:00:00Z');

  it('QRA sohbetleri 180 günden eskiyse silinir', async () => {
    db.qraChatLog.deleteMany.mockResolvedValue({ count: 7 });
    db.notification.deleteMany.mockResolvedValue({ count: 0 });
    db.pushNotificationLog.deleteMany.mockResolvedValue({ count: 1 });
    const res = await applyPersonalDataRetention({ now: NOW });
    const cutoff = new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000);
    expect(db.qraChatLog.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: cutoff } } });
    expect(db.pushNotificationLog.deleteMany).toHaveBeenCalledWith({ where: { sentAt: { lt: cutoff } } });
    expect(res.counts['QraChatLog.userId']).toBe(7);
    expect(res.errors).toEqual([]);
  });

  it('bir modelin hatası diğerlerini durdurmaz ve raporlanır', async () => {
    db.qraChatLog.deleteMany.mockRejectedValue(new Error('tablo yok'));
    db.notification.deleteMany.mockResolvedValue({ count: 4 });
    db.pushNotificationLog.deleteMany.mockResolvedValue({ count: 0 });
    const res = await applyPersonalDataRetention({ now: NOW });
    expect(res.errors).toEqual([expect.stringContaining('QraChatLog.userId')]);
    expect(res.counts['Notification.userId']).toBe(4);
  });

  it('dryRun yalnız sayar, silmez', async () => {
    db.qraChatLog.count.mockResolvedValue(3);
    db.notification.count.mockResolvedValue(0);
    db.pushNotificationLog.count.mockResolvedValue(0);
    const res = await applyPersonalDataRetention({ now: NOW, dryRun: true });
    expect(res.counts['QraChatLog.userId']).toBe(3);
    expect(db.qraChatLog.deleteMany).not.toHaveBeenCalled();
  });
});
