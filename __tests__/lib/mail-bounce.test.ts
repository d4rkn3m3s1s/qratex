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

import { extractBounceInfo } from '@/lib/mail-center/bounce';

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
