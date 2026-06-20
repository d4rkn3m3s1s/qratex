/**
 * notify-email: olay e-postası tetikleyici testleri.
 * - Mail yapılandırılmamışsa no-op.
 * - Kullanıcının e-postası yoksa no-op.
 * - Settings.notifications.<pref> false ise gönderilmez (opt-out).
 * - Tüm kontroller geçerse gönderilir.
 */
const mockUserFindUnique = jest.fn();
const mockSettingsFindUnique = jest.fn();
const mockSend = jest.fn();
const mockIsMailConfigured = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    settings: { findUnique: (...a: unknown[]) => mockSettingsFindUnique(...a) },
  },
}));

jest.mock('@/lib/mail-sender', () => ({
  isMailConfigured: () => mockIsMailConfigured(),
  sendTransactionalEmail: (...a: unknown[]) => mockSend(...a),
}));

jest.mock('@/lib/public-app-origin', () => ({
  getPublicAppOrigin: () => 'https://app.example',
}));

import { sendEventEmail } from '@/lib/notify-email';

const baseInput = {
  userId: 'u1',
  prefKey: 'emailReply' as const,
  subject: 'subj',
  heading: 'head',
  bodyLines: ['line'],
};

beforeEach(() => {
  mockUserFindUnique.mockReset();
  mockSettingsFindUnique.mockReset();
  mockSend.mockReset();
  mockIsMailConfigured.mockReset();
  mockSend.mockResolvedValue({ ok: true });
});

describe('sendEventEmail', () => {
  it('mail yapılandırılmamışsa no-op (false döner, gönderim yok)', async () => {
    mockIsMailConfigured.mockReturnValue(false);
    const ok = await sendEventEmail(baseInput);
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('kullanıcı e-postası yoksa gönderilmez', async () => {
    mockIsMailConfigured.mockReturnValue(true);
    mockUserFindUnique.mockResolvedValue({ email: null });
    const ok = await sendEventEmail(baseInput);
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('tercih açıkça false ise opt-out (gönderilmez)', async () => {
    mockIsMailConfigured.mockReturnValue(true);
    mockUserFindUnique.mockResolvedValue({ email: 'a@b.c' });
    mockSettingsFindUnique.mockResolvedValue({ value: { notifications: { emailReply: false } } });
    const ok = await sendEventEmail(baseInput);
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('tercih tanımsızsa varsayılan açık → gönderilir', async () => {
    mockIsMailConfigured.mockReturnValue(true);
    mockUserFindUnique.mockResolvedValue({ email: 'a@b.c' });
    mockSettingsFindUnique.mockResolvedValue(null);
    const ok = await sendEventEmail(baseInput);
    expect(ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('a@b.c');
  });

  it('hata fırlatmaz; gönderim hatasında false döner', async () => {
    mockIsMailConfigured.mockReturnValue(true);
    mockUserFindUnique.mockResolvedValue({ email: 'a@b.c' });
    mockSettingsFindUnique.mockResolvedValue(null);
    mockSend.mockResolvedValue({ ok: false, error: 'boom' });
    const ok = await sendEventEmail(baseInput);
    expect(ok).toBe(false);
  });
});
