/**
 * Gelen kutusu sunucu kuralları: görünüm filtreleri, yan etkisiz okuma, arşiv kutusu,
 * sunucuda kurulan yanıt başlıkları + giden kayıt + denetim, senkron durumu ayrıştırma.
 */
const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockAggregate = jest.fn();
const mockAudit = jest.fn();
const mockMail = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    inboxMessage: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a),
      count: (...a: unknown[]) => mockCount(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      aggregate: (...a: unknown[]) => mockAggregate(...a),
    },
    auditLog: { create: (...a: unknown[]) => mockAudit(...a) },
    settings: { findUnique: jest.fn() },
  },
  isPrismaConnectivityError: () => false,
}));
jest.mock('@/lib/mail-sender', () => ({
  sendTransactionalEmail: (...a: unknown[]) => mockMail(...a),
  isMailConfigured: () => true,
}));
jest.mock('@/lib/public-app-origin', () => ({ getPublicAppOrigin: () => 'https://qratex.example' }));
jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('mailparser', () => ({ simpleParser: jest.fn() }));
jest.mock('@/lib/http/define-route', () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message);
      this.code = code;
    }
  }
  return { ApiError };
});

import type { Session } from 'next-auth';
import { getInboxDetail, patchInboxMessage, readAttachments, replyToMessage, searchWhere, viewWhere } from '@/lib/mail-center/inbox.server';
import { describeImapError, parseSyncState } from '@/lib/mail-inbox';

const session = { user: { id: 'admin1', email: 'a@q.test', name: 'Admin', role: 'ADMIN' } } as unknown as Session;
const meta = { ipAddress: null, userAgent: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockAudit.mockResolvedValue({});
  process.env.IMAP_USER = 'qratex.co@gmail.com';
});

describe('viewWhere', () => {
  it('yanıt bekleyen: stajyer + bounce değil + yanıtlanmamış (Message-ID yoksa da dahil)', () => {
    expect(viewWhere('awaiting', ['<a@x>'])).toEqual({
      mailbox: 'INBOX',
      isFromIntern: true,
      isBounce: false,
      OR: [{ messageId: null }, { messageId: { notIn: ['<a@x>'] } }],
    });
  });
  it('arşiv ve giden ayrı kutular; ek/bounce görünümleri arşivi de kapsar', () => {
    expect(viewWhere('archived', [])).toEqual({ mailbox: 'INBOX_ARCHIVED' });
    expect(viewWhere('sent', [])).toEqual({ mailbox: 'QRATEX_SENT' });
    expect(viewWhere('bounce', [])).toEqual({ mailbox: { in: ['INBOX', 'INBOX_ARCHIVED'] }, isBounce: true });
  });
  it('arama gövde önizlemesi ve departmanı da kapsar', () => {
    const w = searchWhere('hukuk') as { OR: Record<string, unknown>[] };
    expect(w.OR.map((o) => Object.keys(o)[0])).toEqual(
      expect.arrayContaining(['snippet', 'matchedDepartment', 'subject', 'fromEmail'])
    );
    expect(searchWhere('   ')).toBeNull();
  });
});

describe('readAttachments', () => {
  it('URL istemciye taşınmaz ama erişilebilirlik bilgisi korunur', () => {
    const r = readAttachments([{ filename: 'cv.pdf', contentType: 'application/pdf', size: 10, url: 'https://pub/x' }, { filename: 'b', size: 1, url: null }]);
    expect(r[0]).toMatchObject({ index: 0, available: true });
    expect(r[1]).toMatchObject({ index: 1, available: false });
    expect(readAttachments(null)).toEqual([]);
  });
});

describe('getInboxDetail', () => {
  it('GET yan etkisizdir (okundu işaretlemez) ve konuşmayı döner', async () => {
    const msg = { id: 'm1', mailbox: 'INBOX', threadRoot: '<r@x>', messageId: '<m1@x>', fromEmail: 'z@x.com', fromName: null, toEmail: null, subject: 's', sentAt: new Date(), seen: false, isBounce: false, bodyText: 'x', bodyHtml: null, attachments: [], isFromIntern: true, matchedTemplateId: 't1', matchedRecipientName: 'Z', matchedDepartment: 'Hukuk' };
    mockFindUnique.mockResolvedValue(msg);
    mockFindMany.mockResolvedValue([msg]);
    mockCount.mockResolvedValue(0);
    const d = await getInboxDetail('m1');
    expect(d.message.matchedTemplateId).toBe('t1');
    expect(d.thread).toHaveLength(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('bulunamazsa NOT_FOUND (DB hatası 404 gibi gösterilmez: hata yutulmaz)', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(getInboxDetail('yok')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    mockFindUnique.mockRejectedValue(new Error('db kapalı'));
    await expect(getInboxDetail('m1')).rejects.toThrow('db kapalı');
  });
});

describe('patchInboxMessage', () => {
  it('arşiv kutu değiştirir ve denetime yazar', async () => {
    mockFindUnique.mockResolvedValue({ id: 'm1', mailbox: 'INBOX', seen: true });
    mockUpdate.mockResolvedValue({ id: 'm1', mailbox: 'INBOX_ARCHIVED', seen: true });
    await patchInboxMessage({ id: 'm1', archived: true, session, meta });
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ mailbox: 'INBOX_ARCHIVED' });
    expect(mockAudit.mock.calls[0][0].data.action).toBe('INBOX_ARCHIVE');
  });
  it('giden yanıt arşivlenemez', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', mailbox: 'QRATEX_SENT', seen: true });
    await expect(patchInboxMessage({ id: 's1', archived: true, session, meta })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('replyToMessage', () => {
  const parent = {
    id: 'm1',
    mailbox: 'INBOX',
    fromEmail: 'stajyer@x.com',
    fromName: 'Zerda',
    subject: 'Re: Görev',
    sentAt: new Date('2026-10-10T08:00:00Z'),
    bodyText: 'teslim ettim',
    messageId: '<m1@gmail>',
    references: '<root@qratex> <m0@gmail>',
    inReplyTo: '<m0@gmail>',
    threadRoot: '<root@qratex>',
    isBounce: false,
    seen: false,
    matchedTemplateId: 't1',
    matchedRecipientName: 'Zerda',
    matchedDepartment: 'Hukuk',
  };

  it('başlıkları sunucuda kurar, "Re: Re:" üretmez, gideni aynı thread kökünde saklar, denetler', async () => {
    mockFindUnique.mockResolvedValue(parent);
    mockMail.mockResolvedValue({ ok: true, channel: 'smtp', effectiveFrom: 'QRateX <qratex.co@gmail.com>' });
    mockAggregate.mockResolvedValue({ _max: { uid: 4 } });
    mockCreate.mockResolvedValue({ id: 'sent1' });
    mockUpdate.mockResolvedValue({});
    const r = await replyToMessage({ id: 'm1', message: 'Teşekkürler', quote: true, session, meta });
    expect(r.sentId).toBe('sent1');
    const mail = mockMail.mock.calls[0][0];
    expect(mail.to).toBe('stajyer@x.com');
    expect(mail.subject).toBe('Re: Görev');
    expect(mail.headers).toEqual({ 'In-Reply-To': '<m1@gmail>', References: '<root@qratex> <m0@gmail> <m1@gmail>' });
    expect(mail.text).toContain('> teslim ettim');
    const saved = mockCreate.mock.calls[0][0].data;
    expect(saved).toMatchObject({ uid: 5, mailbox: 'QRATEX_SENT', inReplyTo: '<m1@gmail>', threadRoot: '<root@qratex>', toEmail: 'stajyer@x.com', messageId: null });
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ seen: true });
    expect(mockAudit.mock.calls[0][0].data.action).toBe('INBOX_REPLY');
  });

  it('bounce bildirimi yanıtlanmaz; gönderim hatası görünür hata olur', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...parent, isBounce: true });
    await expect(replyToMessage({ id: 'm1', message: 'x', quote: false, session, meta })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    mockFindUnique.mockResolvedValueOnce(parent);
    mockMail.mockResolvedValueOnce({ ok: false, error: 'SMTP 535' });
    await expect(replyToMessage({ id: 'm1', message: 'x', quote: false, session, meta })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('UID çakışmasında (P2002) bir sonraki UID ile yeniden dener', async () => {
    mockFindUnique.mockResolvedValue(parent);
    mockMail.mockResolvedValue({ ok: true, channel: 'smtp', effectiveFrom: 'x' });
    mockAggregate.mockResolvedValue({ _max: { uid: 1 } });
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' })).mockResolvedValueOnce({ id: 'sent2' });
    mockUpdate.mockResolvedValue({});
    await expect(replyToMessage({ id: 'm1', message: 'x', quote: false, session, meta })).resolves.toEqual({ sentId: 'sent2' });
    expect(mockCreate.mock.calls[1][0].data.uid).toBe(3);
  });
});

describe('senkron durumu', () => {
  it('bozuk/eksik değer güvenli varsayılana düşer', () => {
    expect(parseSyncState(null)).toMatchObject({ lastRunAt: null, ok: null, lastUid: null, hasMore: false });
    expect(parseSyncState({ lastRunAt: '2026-10-11T00:00:00Z', ok: true, source: 'cron', lastUid: 42, uidValidity: '7', stored: 3 })).toMatchObject({
      ok: true,
      source: 'cron',
      lastUid: 42,
      uidValidity: '7',
      stored: 3,
    });
  });
  it('IMAP hataları Türkçe ve eyleme dönük', () => {
    expect(describeImapError(Object.assign(new Error('Command failed'), { authenticationFailed: true }))).toContain('uygulama şifresini');
    expect(describeImapError(new Error('connect ETIMEDOUT'))).toContain('zaman aşımı');
  });
});
