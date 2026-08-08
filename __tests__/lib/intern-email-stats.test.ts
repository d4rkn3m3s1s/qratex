/**
 * Gönderim/açılma istatistiği toplama (groupSends). Kritik senaryo: tekrar gönderim önceki
 * açılma kanıtını SİLMEMELİ; hata durumları ayrı sayılmalı; çift sayım olmamalı.
 */
import { groupSends, type SendRow } from '@/lib/intern-email-stats';

// createdAt DESC sıralı (route orderBy ile aynı) satır üretici.
const row = (o: Partial<SendRow> & { templateId: string; email: string }): SendRow => ({
  status: 'sent', lastError: null, firstOpenedAt: null, openCount: 0,
  createdAt: new Date('2026-08-08T10:00:00Z'), ...o,
});

describe('groupSends', () => {
  it('tek başarılı gönderim: sent=1, opened=0', () => {
    const r = groupSends([row({ templateId: 't1', email: 'a@x.com' })]);
    expect(r.t1.sent).toBe(1);
    expect(r.t1.opened).toBe(0);
    expect(r.t1.errored).toBe(0);
    expect(r.t1.recipients[0].status).toBe('sent');
    expect(r.t1.recipients[0].openedAt).toBeNull();
  });

  it('açılmış gönderim: opened=1, recipient.openedAt dolu', () => {
    const r = groupSends([
      row({ templateId: 't1', email: 'a@x.com', firstOpenedAt: new Date('2026-08-08T11:00:00Z'), openCount: 2 }),
    ]);
    expect(r.t1.opened).toBe(1);
    expect(r.t1.recipients[0].openedAt).toBe('2026-08-08T11:00:00.000Z');
    expect(r.t1.recipients[0].openCount).toBe(2);
  });

  it('KRİTİK: tekrar gönderim önceki açılmayı SİLMEZ (eski kayıt açık, yeni kayıt açılmamış)', () => {
    // DESC sıralı: önce yeni (henüz açılmamış), sonra eski (açılmış).
    const r = groupSends([
      row({ templateId: 't1', email: 'a@x.com', createdAt: new Date('2026-08-08T12:00:00Z'), firstOpenedAt: null }),
      row({ templateId: 't1', email: 'a@x.com', createdAt: new Date('2026-08-08T09:00:00Z'), firstOpenedAt: new Date('2026-08-08T09:30:00Z'), openCount: 1 }),
    ]);
    // Alıcı bir kez açtı → hâlâ "açıldı" sayılmalı, "bekliyor" değil.
    expect(r.t1.opened).toBe(1);
    expect(r.t1.sent).toBe(1); // tek alıcı, çift sayılmaz
    expect(r.t1.recipients).toHaveLength(1);
    expect(r.t1.recipients[0].openedAt).toBe('2026-08-08T09:30:00.000Z');
    // lastSentAt = en yeni gönderim.
    expect(r.t1.lastSentAt).toBe('2026-08-08T12:00:00.000Z');
  });

  it('hata durumu: errored=1, status=error, opened saymaz', () => {
    const r = groupSends([
      row({ templateId: 't1', email: 'a@x.com', status: 'error', lastError: 'SMTP timeout' }),
    ]);
    expect(r.t1.errored).toBe(1);
    expect(r.t1.sent).toBe(0);
    expect(r.t1.opened).toBe(0);
    expect(r.t1.recipients[0].status).toBe('error');
    expect(r.t1.recipients[0].error).toBe('SMTP timeout');
  });

  it('hatalı gönderim sonra başarılı tekrar: en yeni (başarılı) durum kazanır', () => {
    const r = groupSends([
      row({ templateId: 't1', email: 'a@x.com', createdAt: new Date('2026-08-08T13:00:00Z'), status: 'sent' }),
      row({ templateId: 't1', email: 'a@x.com', createdAt: new Date('2026-08-08T09:00:00Z'), status: 'error', lastError: 'x' }),
    ]);
    expect(r.t1.sent).toBe(1);
    expect(r.t1.errored).toBe(0);
    expect(r.t1.recipients[0].status).toBe('sent');
  });

  it('çok alıcı + çok şablon doğru gruplanır (çift sayım yok)', () => {
    const r = groupSends([
      row({ templateId: 't1', email: 'a@x.com', firstOpenedAt: new Date('2026-08-08T11:00:00Z') }),
      row({ templateId: 't1', email: 'b@x.com' }),
      row({ templateId: 't2', email: 'c@x.com', status: 'error', lastError: 'e' }),
    ]);
    expect(r.t1.sent).toBe(2);
    expect(r.t1.opened).toBe(1);
    expect(r.t2.errored).toBe(1);
    expect(r.t2.sent).toBe(0);
  });

  it('boş girdi → boş sonuç', () => {
    expect(groupSends([])).toEqual({});
  });
});
