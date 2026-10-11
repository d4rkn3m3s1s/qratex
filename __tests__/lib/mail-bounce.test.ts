/**
 * Bounce ↔ gönderim kaydı (arka plan O2): DSN'den alıcı/kalıcılık çıkarımı ve yalnız son
 * başarılı gönderimin "Teslim edilemedi" işaretlenmesi.
 */
const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    internEmailSend: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
    },
  },
}));

import { applyBounceToSends, extractBounceInfo } from '@/lib/mail-center/bounce';

const GMAIL_DSN = [
  'Reporting-MTA: dns; googlemail.com',
  'Arrival-Date: Mon, 5 Oct 2026 10:00:00 -0700',
  '',
  'Final-Recipient: rfc822; Stajyer.Yok@ornek.com',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.',
].join('\n');

describe('extractBounceInfo', () => {
  it('RFC 3464 DSN: alıcı küçük harfe, kalıcı, neden Status + Diagnostic', () => {
    const info = extractBounceInfo({ deliveryStatus: GMAIL_DSN, subject: 'Delivery Status Notification (Failure)' });
    expect(info.recipients).toEqual(['stajyer.yok@ornek.com']);
    expect(info.permanent).toBe(true);
    expect(info.reason).toMatch(/^5\.1\.1 — 550-5\.1\.1/);
  });

  it('gecikme (4.x.x / delayed) kalıcı sayılmaz', () => {
    const ds = 'Final-Recipient: rfc822; a@b.com\nAction: delayed\nStatus: 4.4.7';
    expect(extractBounceInfo({ deliveryStatus: ds }).permanent).toBe(false);
    expect(extractBounceInfo({ subject: 'Delivery Status Notification (Delay)', bodyText: 'a@b.com' }).permanent).toBe(false);
  });

  it('DSN yoksa X-Failed-Recipients, o da yoksa gövde; kendi adresimiz ve daemon alıcı sayılmaz', () => {
    expect(extractBounceInfo({ failedRecipientsHeader: 'x@y.com, Z@Y.com' }).recipients).toEqual(['x@y.com', 'z@y.com']);
    const fromBody = extractBounceInfo({
      bodyText: 'Mesajınız qratex.co@gmail.com adresinden kayip@ornek.com adresine iletilemedi. mailer-daemon@googlemail.com',
      subject: 'Undeliverable',
      ownAddresses: ['qratex.co@gmail.com'],
    });
    expect(fromBody.recipients).toEqual(['kayip@ornek.com']);
    expect(fromBody.permanent).toBe(true);
  });
});

describe('applyBounceToSends', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
  });

  it('alıcı başına yalnız EN SON başarılı gönderimi hata yapar (7 gün penceresi)', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'yeni', email: 'Stajyer.Yok@ornek.com' },
      { id: 'eski', email: 'stajyer.yok@ornek.com' },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const n = await applyBounceToSends(
      { recipients: ['stajyer.yok@ornek.com'], permanent: true, reason: '5.1.1' },
      new Date('2026-10-05T10:00:00Z')
    );
    expect(n).toBe(1);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('sent');
    expect(where.kind).toBe('send');
    expect(where.createdAt.gte.toISOString()).toBe('2026-09-28T10:00:00.000Z');
    const upd = mockUpdateMany.mock.calls[0][0];
    expect(upd.where.id.in).toEqual(['yeni']);
    expect(upd.data).toMatchObject({ status: 'error' });
    expect(upd.data.lastError).toMatch(/^Teslim edilemedi \(geri döndü\): 5\.1\.1/);
  });

  it('geçici bounce ya da alıcısız bildirim kayda dokunmaz', async () => {
    expect(await applyBounceToSends({ recipients: ['a@b.com'], permanent: false, reason: null }, new Date())).toBe(0);
    expect(await applyBounceToSends({ recipients: [], permanent: true, reason: null }, new Date())).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('DB hatası senkronu bozmaz (0 döner)', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'));
    await expect(
      applyBounceToSends({ recipients: ['a@b.com'], permanent: true, reason: null }, new Date())
    ).resolves.toBe(0);
  });
});
