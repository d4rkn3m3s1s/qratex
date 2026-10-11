/**
 * Mail şablonları sunucu kuralları: tek zod şeması (sessiz düşürme yok), iyimser kilit,
 * fail-closed okuma, "yalnız yeni alıcılar" idempotent gönderim, denetim farkı.
 */
const mockSettingsFind = jest.fn();
const mockSettingsCreate = jest.fn();
const mockSettingsUpdateMany = jest.fn();
const mockSendFindMany = jest.fn();
const mockSendCreate = jest.fn();
const mockAuditCreate = jest.fn();
const mockMail = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    settings: {
      findUnique: (...a: unknown[]) => mockSettingsFind(...a),
      create: (...a: unknown[]) => mockSettingsCreate(...a),
      updateMany: (...a: unknown[]) => mockSettingsUpdateMany(...a),
    },
    internEmailSend: {
      findMany: (...a: unknown[]) => mockSendFindMany(...a),
      create: (...a: unknown[]) => mockSendCreate(...a),
    },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  },
}));
jest.mock('@/lib/mail-sender', () => ({
  sendTransactionalEmail: (...a: unknown[]) => mockMail(...a),
  isMailConfigured: () => true,
}));
jest.mock('@/lib/public-app-origin', () => ({ getPublicAppOrigin: () => 'https://qratex.example' }));

import type { Session } from 'next-auth';
import {
  InternTemplatesConflictError,
  getInternTaskEmails,
  saveInternTemplates,
  type InternTaskEmail,
} from '@/lib/intern-task-emails';
import { diffTemplates, readReminderFlag, sendSavedTemplate } from '@/lib/mail-center/templates.server';
import { parseRecipientInput, saveTemplatesSchema, sendSchema, unknownVariables } from '@/lib/mail-center/templates-contract';

const session = { user: { id: 'admin1', email: 'a@q.test', name: 'Admin', role: 'ADMIN' } } as unknown as Session;
const meta = { ipAddress: null, userAgent: null };
const base = { id: 't1', kind: 'task', department: 'Hukuk', recipientName: 'Zerda', email: 'z@x.com', subject: 'Konu', body: 'Merhaba' };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuditCreate.mockResolvedValue({});
  mockSendCreate.mockResolvedValue({});
});

describe('saveTemplatesSchema (tek doğrulama)', () => {
  it('boş liste meşrudur (varsayılanlar geri yazılmaz)', () => {
    expect(saveTemplatesSchema.safeParse({ baseVersion: 2, templates: [] }).success).toBe(true);
  });

  it('geçersiz e-posta reddedilir (sessizce düşürülmez)', () => {
    const r = saveTemplatesSchema.safeParse({ baseVersion: 0, templates: [{ ...base, email: 'z@x.com, bozuk' }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain('Geçersiz e-posta');
  });

  it('aynı kimlikli iki şablon reddedilir', () => {
    const r = saveTemplatesSchema.safeParse({ baseVersion: 0, templates: [base, base] });
    expect(r.success).toBe(false);
  });

  it('boş konu ve fazla uzun konu Türkçe mesajla reddedilir', () => {
    const r = saveTemplatesSchema.safeParse({ baseVersion: 0, templates: [{ ...base, subject: '' }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Konu boş olamaz.');
  });

  it('test gönderimi taslak şablonu taşır (kaydedilmemiş olabilir)', () => {
    expect(sendSchema.safeParse({ action: 'test', testTo: 'ben@x.com', template: { ...base, id: 'tpl-yeni' } }).success).toBe(true);
    expect(sendSchema.safeParse({ action: 'test', testTo: 'yanlis', template: base }).success).toBe(false);
  });
});

describe('alıcı girişi ve değişkenler', () => {
  it('CSV / satır / noktalı virgül yapıştırmayı ayrıştırır, tekrarı atar, geçersizi ayırır', () => {
    expect(parseRecipientInput('a@x.com; B@x.com\nb@x.com, kotu-adres')).toEqual({ valid: ['a@x.com', 'b@x.com'], invalid: ['kotu-adres'] });
  });

  it('tanınmayan değişkenleri bulur', () => {
    expect(unknownVariables('{{isim}} {{ Departman }} {{soyad}}')).toEqual(['soyad']);
  });
});

describe('getInternTaskEmails (fail-closed)', () => {
  it('DB okuma hatası yutulmaz', async () => {
    mockSettingsFind.mockRejectedValue(new Error('neon uykuda'));
    await expect(getInternTaskEmails()).rejects.toThrow('neon uykuda');
  });

  it('ayar yoksa boş liste; arşivliler gönderim listesinde yok', async () => {
    mockSettingsFind.mockResolvedValueOnce(null);
    await expect(getInternTaskEmails()).resolves.toEqual([]);
    mockSettingsFind.mockResolvedValueOnce({ value: { version: 1, templates: [base, { ...base, id: 't2', archivedAt: '2026-01-01T00:00:00Z' }] } });
    const list = await getInternTaskEmails();
    expect(list.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('saveInternTemplates (iyimser kilit)', () => {
  const list = [base as InternTaskEmail];

  it('sürüm uyuşmazsa çakışma', async () => {
    mockSettingsFind.mockResolvedValue({ value: { version: 5, templates: [] } });
    await expect(saveInternTemplates(list, { baseVersion: 4, userId: 'u' })).rejects.toBeInstanceOf(InternTemplatesConflictError);
    expect(mockSettingsUpdateMany).not.toHaveBeenCalled();
  });

  it('eski çıplak dizi = sürüm 0; karşılaştır-ve-yaz ile kaydeder', async () => {
    mockSettingsFind.mockResolvedValue({ value: [base] });
    mockSettingsUpdateMany.mockResolvedValue({ count: 1 });
    const r = await saveInternTemplates(list, { baseVersion: 0, userId: 'u' });
    expect(r.version).toBe(1);
    const arg = mockSettingsUpdateMany.mock.calls[0][0];
    expect(arg.where.value).toEqual({ equals: [base] });
    expect(arg.data.value.templates).toEqual(list);
  });

  it('araya yazım girerse (0 satır) çakışma', async () => {
    mockSettingsFind.mockResolvedValueOnce({ value: { version: 2, templates: [] } }).mockResolvedValueOnce({ value: { version: 3, templates: [] } });
    mockSettingsUpdateMany.mockResolvedValue({ count: 0 });
    await expect(saveInternTemplates(list, { baseVersion: 2, userId: 'u' })).rejects.toMatchObject({ currentVersion: 3 });
  });

  it('ilk kayıt create; yarışta P2002 → çakışma', async () => {
    mockSettingsFind.mockResolvedValue(null);
    mockSettingsCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(saveInternTemplates(list, { baseVersion: 0, userId: 'u' })).rejects.toBeInstanceOf(InternTemplatesConflictError);
  });
});

describe('sendSavedTemplate (yalnız yeni alıcılar → tekrar denemede çift mail yok)', () => {
  it('daha önce başarıyla alanı atlar, yalnız yeniye gönderir ve denetime yazar', async () => {
    mockSettingsFind.mockResolvedValue({ value: { version: 1, templates: [{ ...base, email: 'a@x.com, b@x.com' }] } });
    mockSendFindMany.mockResolvedValue([{ email: 'a@x.com' }]);
    mockMail.mockResolvedValue({ ok: true, channel: 'smtp', effectiveFrom: 'x' });
    const r = await sendSavedTemplate({ templateId: 't1', onlyNew: true, session, meta });
    expect(mockMail).toHaveBeenCalledTimes(1);
    expect(mockMail.mock.calls[0][0].to).toBe('b@x.com');
    expect(r).toMatchObject({ sent: 1, skipped: 1, failed: 0, remaining: 0 });
    expect(mockSendCreate.mock.calls[0][0].data).toMatchObject({ templateId: 't1', email: 'b@x.com', kind: 'send', status: 'sent' });
    expect(mockAuditCreate.mock.calls[0][0].data.action).toBe('INTERN_EMAIL_SEND');
  });

  it('only: devam çağrısı yalnız kalan alıcılara gider', async () => {
    mockSettingsFind.mockResolvedValue({ value: { version: 1, templates: [{ ...base, email: 'a@x.com, b@x.com, c@x.com' }] } });
    mockMail.mockResolvedValue({ ok: true, channel: 'smtp', effectiveFrom: 'x' });
    await sendSavedTemplate({ templateId: 't1', onlyNew: false, only: ['c@x.com', 'yabanci@x.com'], session, meta });
    expect(mockMail.mock.calls.map((c) => c[0].to)).toEqual(['c@x.com']);
  });

  it('arşivli ya da olmayan şablon gönderilmez', async () => {
    mockSettingsFind.mockResolvedValue({ value: { version: 1, templates: [{ ...base, archivedAt: '2026-01-01T00:00:00Z' }] } });
    await expect(sendSavedTemplate({ templateId: 't1', onlyNew: true, session, meta })).rejects.toThrow('arşiv');
    expect(mockMail).not.toHaveBeenCalled();
  });

  it('gönderim hatası kaydedilir ve sayılır (sessiz başarı yok)', async () => {
    mockSettingsFind.mockResolvedValue({ value: { version: 1, templates: [base] } });
    mockSendFindMany.mockResolvedValue([]);
    mockMail.mockResolvedValue({ ok: false, error: 'SMTP 421' });
    const r = await sendSavedTemplate({ templateId: 't1', onlyNew: true, session, meta });
    expect(r.failed).toBe(1);
    expect(mockSendCreate.mock.calls[0][0].data).toMatchObject({ status: 'error', lastError: 'SMTP 421' });
  });
});

describe('diffTemplates (denetim farkı)', () => {
  it('eklenen, çıkarılan ve değişen alanları verir', () => {
    const a = [base, { ...base, id: 't2' }] as InternTaskEmail[];
    const b = [{ ...base, subject: 'Yeni' }, { ...base, id: 't3' }] as InternTaskEmail[];
    expect(diffTemplates(a, b)).toEqual({ added: ['t3'], removed: ['t2'], changed: [{ id: 't1', fields: ['subject'] }] });
  });
});

describe('readReminderFlag', () => {
  it('başka güne ait bayrak boş sayılır', () => {
    expect(readReminderFlag({ dayKey: '2026-10-10', templateIds: ['t1'], recipients: {} }, '2026-10-11')).toEqual({ templateIds: [], recipients: {} });
    expect(readReminderFlag({ dayKey: '2026-10-11', templateIds: ['t1'], recipients: { t1: ['a@x.com', 3] } }, '2026-10-11')).toEqual({
      templateIds: ['t1'],
      recipients: { t1: ['a@x.com'] },
    });
  });
});
