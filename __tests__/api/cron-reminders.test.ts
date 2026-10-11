/**
 * Hatırlatma cron'ları: tekrar deneme ve teslim güvencesi (denetim Y2 + O8).
 *
 * Yeniden üretilen hatalar:
 *  - team-task-due: başarısız gönderim işaretlenmiyordu ve pencere "bugün" olduğundan ertesi gün
 *    görev pencereden çıkıyordu → hatırlatma KALICI olarak kayboluyordu; yanıt yine ok:true/200.
 *  - team-task-due: "TR günü" `toLocaleString` + `setHours` ile UTC sunucuda 3 saat kayıyordu.
 *  - intern-deadline: bir alıcı başarılıysa şablon "gönderildi" sayılıyor, başarısız alıcılar hiç
 *    tekrar denenmiyordu.
 */
const mockTaskFindMany = jest.fn();
const mockTaskUpdateMany = jest.fn();
const mockSettingsFind = jest.fn();
const mockSettingsUpsert = jest.fn();
const mockSend = jest.fn();
const mockMailConfigured = jest.fn();
const mockGetTemplates = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    companyTask: {
      findMany: (...a: unknown[]) => mockTaskFindMany(...a),
      updateMany: (...a: unknown[]) => mockTaskUpdateMany(...a),
    },
    settings: {
      findUnique: (...a: unknown[]) => mockSettingsFind(...a),
      upsert: (...a: unknown[]) => mockSettingsUpsert(...a),
    },
  },
}));
jest.mock('@/lib/mail-sender', () => ({
  sendTransactionalEmail: (...a: unknown[]) => mockSend(...a),
  isMailConfigured: () => mockMailConfigured(),
}));
jest.mock('@/lib/public-app-origin', () => ({ getPublicAppOrigin: () => 'https://qratex.test' }));
jest.mock('@/lib/intern-task-emails', () => ({
  getInternTaskEmails: () => mockGetTemplates(),
  INTERN_TASK_DEADLINE_LABEL: '23:59',
  formatDeadlineLabel: (d: string | undefined) => (d ?? '').trim(),
  renderSimpleBrandedEmail: (i: { heading: string; bodyHtml: string }) => `<h1>${i.heading}</h1>${i.bodyHtml}`,
  // Testte her şablon "bugün" bitiyor.
  deadlineIsToday: (d: string | undefined) => Boolean(d),
}));

import { GET as teamTaskDue } from '@/app/api/cron/team-task-due/route';
import { GET as internDeadline } from '@/app/api/cron/intern-deadline/route';
import { taskDueWindow, dueRelativeLabel, trDayKey, TASK_DUE_LOOKBACK_MS } from '@/lib/cron-time';

const SECRET = 'test-cron-secret';
/** Bol bütçe: orkestratörün geçirdiği son tarih başlığı. */
const req = (path: string) =>
  new Request(`http://localhost${path}`, {
    headers: { authorization: `Bearer ${SECRET}`, 'x-cron-deadline-at': String(Date.now() + 60_000) },
  });
const OK = { ok: true, channel: 'smtp', effectiveFrom: 'QRATEX <no-reply@qratex.test>' };
const FAIL = { ok: false, error: 'SMTP 421 geçici hata' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockMailConfigured.mockReturnValue(true);
  mockTaskUpdateMany.mockResolvedValue({ count: 1 });
  mockSettingsUpsert.mockResolvedValue({});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

describe('cron-time', () => {
  it('pencere sunucu saat diliminden bağımsız: geriye 36 saat, ileriye 24 saat', () => {
    const now = new Date('2026-10-10T03:00:00Z');
    const w = taskDueWindow(now);
    expect(w.from.toISOString()).toBe(new Date(now.getTime() - TASK_DUE_LOOKBACK_MS).toISOString());
    expect(w.to.toISOString()).toBe('2026-10-11T03:00:00.000Z');
  });

  it('TR takvimi: UTC 22:30 TR\'de ertesi gün', () => {
    expect(trDayKey(new Date('2026-10-10T22:30:00Z'))).toBe('2026-10-11');
    expect(trDayKey(new Date('2026-10-10T20:30:00Z'))).toBe('2026-10-10');
  });

  it('eski hata: TR 01:00\'de biten görev, TR 06:00 koşusunda "yarın" (bir gün önce "bugün" değil)', () => {
    const run = new Date('2026-10-10T03:00:00Z'); // TR 06:00
    expect(dueRelativeLabel(new Date('2026-10-10T22:00:00Z'), run)).toBe('tomorrow'); // TR 11 Ekim 01:00
    expect(dueRelativeLabel(new Date('2026-10-10T15:00:00Z'), run)).toBe('today');
    expect(dueRelativeLabel(new Date('2026-10-10T02:00:00Z'), run)).toBe('overdue');
  });
});

describe('GET /api/cron/team-task-due', () => {
  const task = (id: string) => ({
    id,
    title: `Görev ${id}`,
    description: null,
    dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    assignedTo: { email: `${id}@ornek.test`, name: 'Ayşe' },
  });

  it('yetkisiz 401', async () => {
    const res = await teamTaskDue(new Request('http://localhost/api/cron/team-task-due'));
    expect(res.status).toBe(401);
  });

  it('pencere geçmiş 36 saati de kapsar (başarısız kalan hatırlatma ertesi gün kaybolmaz)', async () => {
    mockTaskFindMany.mockResolvedValue([]);
    await teamTaskDue(req('/api/cron/team-task-due'));
    const where = mockTaskFindMany.mock.calls[0][0].where;
    expect(where.dueReminderSentAt).toBeNull();
    expect(Date.now() - where.dueAt.gte.getTime()).toBeGreaterThanOrEqual(35 * 60 * 60 * 1000);
    expect(where.dueAt.lte.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it('başarılı gönderim görev başına, dueReminderSentAt=null koşuluyla işaretlenir', async () => {
    mockTaskFindMany.mockResolvedValue([task('t1'), task('t2')]);
    mockSend.mockResolvedValue(OK);
    const res = await teamTaskDue(req('/api/cron/team-task-due'));
    expect(res.status).toBe(200);
    expect(mockTaskUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockTaskUpdateMany.mock.calls[0][0].where).toEqual({ id: 't1', dueReminderSentAt: null });
  });

  it('kalıcı başarısız gönderim: görev İŞARETLENMEZ (sonraki koşu dener) ve yanıt 500 (alarm)', async () => {
    mockTaskFindMany.mockResolvedValue([task('t1'), task('t2')]);
    mockSend.mockImplementation(async ({ to }: { to: string }) => (to.startsWith('t1') ? FAIL : OK));
    const res = await teamTaskDue(req('/api/cron/team-task-due'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.sent).toBe(1);
    expect(body.failed).toBe(1);
    const marked = mockTaskUpdateMany.mock.calls.map((c) => c[0].where.id);
    expect(marked).toEqual(['t2']);
  }, 15_000);

  it('geçici hata aynı koşuda yeniden denenir', async () => {
    mockTaskFindMany.mockResolvedValue([task('t1')]);
    mockSend.mockResolvedValueOnce(FAIL).mockResolvedValueOnce(OK);
    const res = await teamTaskDue(req('/api/cron/team-task-due'));
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockTaskUpdateMany).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('mail kanalı yokken bekleyen hatırlatma varsa başarılı sayılmaz', async () => {
    mockTaskFindMany.mockResolvedValue([task('t1')]);
    mockMailConfigured.mockReturnValue(false);
    const res = await teamTaskDue(req('/api/cron/team-task-due'));
    expect(res.status).toBe(503);
  });

  it('görev başlığı e-posta HTML\'inde kaçışlanır', async () => {
    mockTaskFindMany.mockResolvedValue([{ ...task('t1'), title: '<a href="https://kotu.test">tıkla</a>' }]);
    mockSend.mockResolvedValue(OK);
    await teamTaskDue(req('/api/cron/team-task-due'));
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).not.toContain('<a href="https://kotu.test">');
  });
});

describe('GET /api/cron/intern-deadline', () => {
  const template = { id: 'tpl1', email: 'a@ornek.test, b@ornek.test', recipientName: 'Ali', department: 'Tasarım', deadline: '10 Ekim 18:00' };

  it('bir alıcı başarısızsa şablon kapanmaz, yalnız başarılı alıcı kaydedilir ve yanıt 500', async () => {
    mockGetTemplates.mockResolvedValue([template]);
    mockSettingsFind.mockResolvedValue(null);
    mockSend.mockImplementation(async ({ to }: { to: string }) => (to.startsWith('b@') ? FAIL : OK));
    const res = await internDeadline(req('/api/cron/intern-deadline'));
    expect(res.status).toBe(500);
    const lastFlag = mockSettingsUpsert.mock.calls.at(-1)![0].update.value;
    expect(lastFlag.templateIds).toEqual([]);
    expect(lastFlag.recipients.tpl1).toEqual(['a@ornek.test']);
  }, 15_000);

  it('yeniden çalıştırmada yalnız kalan alıcıya gider; hepsine ulaşınca şablon kapanır', async () => {
    mockGetTemplates.mockResolvedValue([template]);
    const dayKey = trDayKey(new Date());
    mockSettingsFind.mockResolvedValue({ value: { dayKey, templateIds: [], recipients: { tpl1: ['a@ornek.test'] } } });
    mockSend.mockResolvedValue(OK);
    const res = await internDeadline(req('/api/cron/intern-deadline'));
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('b@ornek.test');
    const lastFlag = mockSettingsUpsert.mock.calls.at(-1)![0].update.value;
    expect(lastFlag.templateIds).toEqual(['tpl1']);
  });

  it('bugün kapanmış şablon için mail gitmez', async () => {
    mockGetTemplates.mockResolvedValue([template]);
    mockSettingsFind.mockResolvedValue({ value: { dayKey: trDayKey(new Date()), templateIds: ['tpl1'], recipients: {} } });
    const res = await internDeadline(req('/api/cron/intern-deadline'));
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
