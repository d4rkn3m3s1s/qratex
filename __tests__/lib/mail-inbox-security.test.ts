/**
 * Gelen kutusu güvenliği: sahte From (kimlik doğrulama), sahte bounce (DSN + token + eşik),
 * ReDoS (büyük/özel hazırlanmış girdide doğrusal süre).
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

import { applyBounceToSends, extractBounceInfo, extractTrackTokens, revertBounces } from '@/lib/mail-center/bounce';
import { isDeliveryStatusReport, verifyMailAuth } from '@/lib/mail-center/mail-auth';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv_-';

describe('applyBounceToSends (token eşleşmesi + eşik)', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
  });

  it('token yoksa (yalnız alıcı adresi içeren sahte bounce) hiçbir kayda dokunmaz', async () => {
    expect(await applyBounceToSends({ recipients: ['a@b.com'], permanent: true, reason: '5.1.1' }, new Date(), [])).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('ilk eşleşen bounce yalnız not düşer; durum "error" olmaz (eşik 2)', async () => {
    mockFindMany
      .mockResolvedValueOnce([{ id: 's1', email: 'Stajyer@ornek.com', lastError: null }])
      .mockResolvedValueOnce([{ id: 's1' }]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const n = await applyBounceToSends(
      { recipients: ['stajyer@ornek.com'], permanent: true, reason: '5.1.1' },
      new Date('2026-10-05T10:00:00Z'),
      [TOKEN]
    );
    expect(n).toBe(0);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.token).toEqual({ in: [TOKEN] });
    expect(where.createdAt.gte.toISOString()).toBe('2026-09-28T10:00:00.000Z');
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany.mock.calls[0][0].data).toEqual({ lastError: '[bounce] Teslim edilemedi: 5.1.1' });
  });

  it('ikinci kalıcı bounce eşiği aşar → kayıtlar "error"', async () => {
    mockFindMany
      .mockResolvedValueOnce([{ id: 's2', email: 'stajyer@ornek.com', lastError: null }])
      .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 2 });
    const n = await applyBounceToSends({ recipients: ['stajyer@ornek.com'], permanent: true, reason: null }, new Date(), [TOKEN]);
    expect(n).toBe(2);
    expect(mockUpdateMany.mock.calls[1][0]).toEqual({ where: { id: { in: ['s1', 's2'] }, status: 'sent' }, data: { status: 'error' } });
  });

  it('geçici bounce / alıcısız bildirim kayda dokunmaz; DB hatası 0 döner', async () => {
    expect(await applyBounceToSends({ recipients: ['a@b.com'], permanent: false, reason: null }, new Date(), [TOKEN])).toBe(0);
    expect(await applyBounceToSends({ recipients: [], permanent: true, reason: null }, new Date(), [TOKEN])).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
    mockFindMany.mockRejectedValue(new Error('db down'));
    await expect(applyBounceToSends({ recipients: ['a@b.com'], permanent: true, reason: null }, new Date(), [TOKEN])).resolves.toBe(0);
  });

  it('admin geri alma: bounce işaretli kayıtlar "sent"e döner', async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    expect(await revertBounces('Stajyer@ornek.com')).toBe(2);
    expect(mockUpdateMany.mock.calls[0][0].data).toEqual({ status: 'sent', lastError: null });
  });
});

describe('extractTrackTokens', () => {
  it('X-Qratex-Ref başlığından ve pixel yolundan token çıkarır', () => {
    const src = `Content-Type: text/rfc822-headers\n\nX-Qratex-Ref: ${TOKEN}\n<img src="https://qratex.com/api/track/email-open/ZZZZZZZZZZZZZZZZZZZZZZZZ">`;
    expect(extractTrackTokens(src).sort()).toEqual([TOKEN, 'ZZZZZZZZZZZZZZZZZZZZZZZZ'].sort());
    expect(extractTrackTokens('X-Qratex-Ref: kisa')).toEqual([]);
  });
});

const AUTHSERV = 'mx.google.com';
const mail = (ar: string, extra = '') => `${ar}\r\nFrom: Stajyer <stajyer@ornek.com>\r\n${extra}Subject: x\r\n\r\nbody`;

describe('verifyMailAuth (sahte From)', () => {
  it('kendi MX imizin hizalı dmarc/dkim pass sonucu → doğrulanmış', () => {
    const src = mail(
      'Authentication-Results: mx.google.com;\r\n       dkim=pass header.i=@ornek.com header.s=s1;\r\n       spf=pass smtp.mailfrom=stajyer@ornek.com;\r\n       dmarc=pass (p=NONE) header.from=ornek.com'
    );
    expect(verifyMailAuth(src, 'stajyer@ornek.com', AUTHSERV).verified).toBe(true);
  });

  it('başlık yok / dmarc fail / yabancı authserv-id / env yok → doğrulanmamış', () => {
    expect(verifyMailAuth(mail('X-Foo: 1'), 'stajyer@ornek.com', AUTHSERV).verified).toBe(false);
    expect(
      verifyMailAuth(mail('Authentication-Results: mx.google.com; spf=softfail smtp.mailfrom=evil.com; dmarc=fail header.from=ornek.com'), 'stajyer@ornek.com', AUTHSERV).verified
    ).toBe(false);
    expect(verifyMailAuth(mail('Authentication-Results: evil.example; dmarc=pass header.from=ornek.com'), 'stajyer@ornek.com', AUTHSERV).verified).toBe(false);
    expect(verifyMailAuth(mail('Authentication-Results: mx.google.com; dmarc=pass header.from=ornek.com'), 'stajyer@ornek.com', '').verified).toBe(false);
  });

  it('saldırganın alta eklediği sahte "pass" başlığı sayılmaz (yalnız en üstteki)', () => {
    const src = mail(
      'Authentication-Results: mx.google.com; dmarc=fail header.from=ornek.com',
      'Authentication-Results: mx.google.com; dmarc=pass header.from=ornek.com\r\n'
    );
    expect(verifyMailAuth(src, 'stajyer@ornek.com', AUTHSERV).verified).toBe(false);
  });

  it('başka alan adı için dkim/spf pass (hizasız) → doğrulanmamış', () => {
    const src = mail('Authentication-Results: mx.google.com; dkim=pass header.d=evil.com; spf=pass smtp.mailfrom=bounce@evil.com');
    expect(verifyMailAuth(src, 'stajyer@ornek.com', AUTHSERV).verified).toBe(false);
  });
});

describe('isDeliveryStatusReport (sahte bounce)', () => {
  it('yalnız multipart/report; report-type=delivery-status DSN sayılır', () => {
    expect(isDeliveryStatusReport('Content-Type: multipart/report; report-type=delivery-status;\r\n boundary="b"\r\n\r\n')).toBe(true);
    expect(isDeliveryStatusReport('Subject: Undeliverable\r\nContent-Type: text/plain\r\n\r\nStatus: 5.1.1')).toBe(false);
  });
});

describe('ReDoS: büyük/özel hazırlanmış girdi < 50 ms', () => {
  const time = (fn: () => unknown) => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };
  it('extractBounceInfo, extractTrackTokens, verifyMailAuth doğrusal kalır', () => {
    const big = 'a'.repeat(2_000_000);
    const evilDs = 'Final-Recipient: ' + ' '.repeat(500_000) + 'x'.repeat(500_000);
    const evilMail = 'aaaa.'.repeat(400_000) + '@';
    expect(time(() => extractBounceInfo({ deliveryStatus: evilDs, bodyText: evilMail, failedRecipientsHeader: big, subject: big }))).toBeLessThan(50);
    expect(time(() => extractBounceInfo({ bodyText: 'a'.repeat(1_000_000) }))).toBeLessThan(50);
    expect(time(() => extractBounceInfo({ bodyText: ('a'.repeat(60) + '@' + 'b'.repeat(60) + '.').repeat(20_000) }))).toBeLessThan(50);
    expect(time(() => extractTrackTokens('X-Qratex-Ref:' + ' '.repeat(1_000_000) + '/api/track/email-open/'.repeat(50_000)))).toBeLessThan(50);
    const hdr = 'Authentication-Results: mx.google.com;' + ' dkim=pass'.repeat(200_000) + '\r\n\r\n';
    expect(time(() => verifyMailAuth(hdr, 'a@ornek.com', AUTHSERV))).toBeLessThan(50);
  });
});
