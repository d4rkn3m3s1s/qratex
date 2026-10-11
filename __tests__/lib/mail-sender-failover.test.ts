/**
 * SMTP → Resend yedeği yalnız KESİN teslim edilmemiş hatada (arka plan Y6/O10).
 * DATA sonrası kopmada ileti gitmiş olabilir: yedeğe geçmek alıcıya iki kopya gönderirdi.
 */
const mockSendMail = jest.fn();
const mockClose = jest.fn();
const mockCreateTransport = jest.fn((..._a: unknown[]) => ({ sendMail: mockSendMail, close: mockClose }));
const mockResendSend = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: (...a: unknown[]) => mockCreateTransport(...a) },
}));
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })) }));

import { classifySmtpFailure, getMailDeliverySummary, sendTransactionalEmail } from '@/lib/mail-sender';

function smtpErr(message: string, extra: Record<string, unknown>): Error {
  return Object.assign(new Error(message), extra);
}

describe('classifySmtpFailure', () => {
  it('bağlantı/kimlik/kodlu ret → kesin teslim edilmedi', () => {
    expect(classifySmtpFailure(smtpErr('Invalid login: 535', { code: 'EAUTH', responseCode: 535 }))).toBe('not_delivered');
    expect(classifySmtpFailure(smtpErr('Connection timeout', { code: 'ETIMEDOUT', command: 'CONN' }))).toBe('not_delivered');
    expect(classifySmtpFailure(smtpErr('Greeting never received', { code: 'ETIMEDOUT', command: 'CONN' }))).toBe('not_delivered');
    expect(classifySmtpFailure(smtpErr('connect ECONNREFUSED 1.2.3.4:587', { code: 'ESOCKET', syscall: 'connect' }))).toBe('not_delivered');
    expect(classifySmtpFailure(smtpErr('Message failed: 552 too big', { code: 'EMESSAGE', responseCode: 552, command: 'DATA' }))).toBe('not_delivered');
    expect(classifySmtpFailure(smtpErr('421 rate limited', { code: 'EENVELOPE', responseCode: 421, command: 'RCPT TO' }))).toBe('not_delivered');
  });

  it('oturum içinde yanıtsız kopma/zaman aşımı → belirsiz', () => {
    expect(classifySmtpFailure(smtpErr('Timeout', { code: 'ETIMEDOUT', command: 'CONN' }))).toBe('ambiguous');
    expect(classifySmtpFailure(smtpErr('Connection closed unexpectedly', { code: 'ECONNECTION', command: 'CONN' }))).toBe('ambiguous');
    expect(classifySmtpFailure(smtpErr('read ECONNRESET', { code: 'ESOCKET', syscall: 'read', command: 'CONN' }))).toBe('ambiguous');
  });
});

describe('sendTransactionalEmail yedek kanalı', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...env,
      SMTP_HOST: 'smtp.ornek.com',
      SMTP_USER: 'u@ornek.com',
      SMTP_PASS: 'x',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'QRateX <bildirim@qratex.com>',
    };
    mockResendSend.mockResolvedValue({ error: null });
  });
  afterAll(() => {
    process.env = env;
  });

  it('kesin hata (bağlantı reddi) → Resend ile teslim', async () => {
    mockSendMail.mockRejectedValueOnce(smtpErr('connect ECONNREFUSED', { code: 'ESOCKET', syscall: 'connect' }));
    const r = await sendTransactionalEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    expect(r).toMatchObject({ ok: true, channel: 'resend', usedResendAfterSmtpFailure: true });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it('belirsiz hata → Resend ÇAĞRILMAZ, maybeDelivered işaretli başarısızlık', async () => {
    mockSendMail.mockRejectedValueOnce(smtpErr('Timeout', { code: 'ETIMEDOUT', command: 'CONN' }));
    const r = await sendTransactionalEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    expect(r).toMatchObject({ ok: false, maybeDelivered: true });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('hata alan havuz atılır: sonraki gönderim yeni transporter kurar', async () => {
    mockSendMail.mockRejectedValueOnce(smtpErr('Timeout', { code: 'ETIMEDOUT', command: 'CONN' }));
    await sendTransactionalEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    const before = mockCreateTransport.mock.calls.length;
    mockSendMail.mockResolvedValueOnce({});
    await sendTransactionalEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    expect(mockCreateTransport.mock.calls.length).toBe(before + 1);
    expect(mockClose).toHaveBeenCalled();
  });

  it('sıcak havuz (art arda gönderim) yeniden kullanılır', async () => {
    mockSendMail.mockResolvedValue({});
    await sendTransactionalEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });
    const before = mockCreateTransport.mock.calls.length;
    await sendTransactionalEmail({ to: 'c@d.com', subject: 's', html: '<p>x</p>' });
    expect(mockCreateTransport.mock.calls.length).toBe(before);
  });

  it('Resend sandbox göndereni sağlık özetinde görünür', () => {
    process.env = { ...env, RESEND_API_KEY: 're_test', EMAIL_FROM: 'qratex.co@gmail.com', RESEND_FROM: '' };
    expect(getMailDeliverySummary().resendSandboxSender).toBe(true);
    process.env = { ...env, RESEND_API_KEY: 're_test', RESEND_FROM: 'bildirim@qratex.com' };
    expect(getMailDeliverySummary().resendSandboxSender).toBe(false);
  });
});
