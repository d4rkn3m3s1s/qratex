/**
 * Mail şablonları (`/admin/intern-emails`) sözleşmesi — istemci + sunucu ortak (prisma YOK).
 * Yazma doğrulaması burada TEK zod şemasıdır: istemci formu ve PUT ucu aynı kuralları kullanır
 * (sessiz düşürme yok; geçersiz öğe 400 + hangi alan neden).
 */
import { z } from 'zod';
import { isInternEmailKind, type InternEmailKind } from '@/lib/intern-email-kinds';

export const MAX_TEMPLATES = 300;
export const MAX_RECIPIENTS_PER_TEMPLATE = 25;
export const KNOWN_VARIABLES = ['isim', 'ad', 'departman', 'email', 'deadline', 'konu'] as const;

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim()) && v.trim().length <= 320;
}

/** Serbest metinden (virgül, noktalı virgül, satır, boşluk — CSV yapıştırma dahil) alıcı listesi. */
export function parseRecipientInput(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^<|>$/g, '').toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (isValidEmail(p)) {
      if (!valid.includes(p)) valid.push(p);
    } else if (!invalid.includes(p)) invalid.push(p);
  }
  return { valid, invalid };
}

export function splitRecipients(email: string): string[] {
  return Array.from(new Set(email.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean)));
}

/** Gövde/konudaki TANINMAYAN `{{değişken}}`ler (sunucu olduğu gibi bırakır → kullanıcı uyarılır). */
export function unknownVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) {
    const name = m[1].toLowerCase();
    if (!(KNOWN_VARIABLES as readonly string[]).includes(name)) out.add(m[1]);
  }
  return [...out];
}

const ISO_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const templateInputSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Geçersiz şablon kimliği.'),
    kind: z.string().refine((v): v is InternEmailKind => isInternEmailKind(v), 'Geçersiz şablon türü.'),
    department: z.string().trim().min(1, 'Departman boş olamaz.').max(60, 'Departman en fazla 60 karakter.'),
    recipientName: z.string().trim().max(80, 'Alıcı adı en fazla 80 karakter.'),
    email: z.string().max(MAX_RECIPIENTS_PER_TEMPLATE * 330),
    subject: z.string().trim().min(1, 'Konu boş olamaz.').max(200, 'Konu en fazla 200 karakter.'),
    body: z.string().max(20_000, 'Gövde en fazla 20.000 karakter.'),
    deadline: z
      .string()
      .trim()
      .max(60)
      .optional()
      .refine((v) => !v || ISO_LOCAL_RE.test(v) || v.length <= 60, 'Son teslim tarihi geçersiz.'),
    reminder: z.boolean().optional(),
    archivedAt: z.string().max(40).nullable().optional(),
  })
  .superRefine((t, ctx) => {
    const list = splitRecipients(t.email);
    if (list.length > MAX_RECIPIENTS_PER_TEMPLATE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: `Bir şablonda en fazla ${MAX_RECIPIENTS_PER_TEMPLATE} alıcı olabilir.` });
    }
    const bad = list.filter((e) => !isValidEmail(e));
    if (bad.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: `Geçersiz e-posta: ${bad.slice(0, 3).join(', ')}` });
    }
  });
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const saveTemplatesSchema = z
  .object({
    baseVersion: z.number().int().min(0),
    templates: z.array(templateInputSchema).max(MAX_TEMPLATES, `En fazla ${MAX_TEMPLATES} şablon olabilir.`),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.templates.forEach((t, i) => {
      if (seen.has(t.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['templates', i, 'id'], message: 'Aynı kimlikli iki şablon var.' });
      seen.add(t.id);
    });
  });

/** Gönderim: kayıtlı şablon (gerçek) ya da taslak (test). */
export const sendSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    templateId: z.string().min(1).max(64),
    /** Yalnız henüz BAŞARIYLA gönderilmemiş alıcılar (varsayılan): tekrar denemede çift mail yok. */
    onlyNew: z.boolean().default(true),
    /** Yalnız bu alıcılar (süre bütçesi sonrası devam çağrısı); şablonda olmayan adres yok sayılır. */
    only: z.array(z.string().trim().toLowerCase().max(320)).max(MAX_RECIPIENTS_PER_TEMPLATE).optional(),
  }),
  z.object({
    action: z.literal('test'),
    testTo: z.string().trim().refine(isValidEmail, 'Geçerli bir test adresi girin.'),
    /** Kaydedilmemiş taslak da test edilebilir (Bulgu 1). */
    template: templateInputSchema,
  }),
]);

export const previewSchema = z.object({
  template: z.object({
    id: z.string().max(64).optional(),
    kind: z.string().max(20).optional(),
    department: z.string().max(60).optional(),
    recipientName: z.string().max(80).optional(),
    email: z.string().max(MAX_RECIPIENTS_PER_TEMPLATE * 330).optional(),
    subject: z.string().max(200).optional(),
    body: z.string().max(20_000).optional(),
    deadline: z.string().max(60).optional(),
  }),
  /** Önizlemede `{{email}}` için örnek alıcı. */
  sampleTo: z.string().max(320).optional(),
});

// ─────────────────────────── Yanıt tipleri ───────────────────────────

export type TemplateRecipientStat = {
  email: string;
  status: string;
  error: string | null;
  openedAt: string | null;
  openCount: number;
  sentAt: string;
  openedQuickly: boolean;
  /** Bu alıcıdan gelen kutusuna düşen yanıt sayısı (InboxMessage eşleşmesi). */
  replies: number;
};

export type TemplateStatView = {
  sent: number;
  opened: number;
  errored: number;
  replied: number;
  lastSentAt: string | null;
  recipients: TemplateRecipientStat[];
};

export type ReminderInfo = {
  /** Bugün (TR) bu şablona hatırlatma gidecek mi / gitti mi. */
  dueToday: boolean;
  sentTo: string[];
  completed: boolean;
};

export type TemplatesView = {
  version: number;
  updatedAt: string | null;
  updatedByName: string | null;
  exists: boolean;
  templates: TemplateInput[];
  stats: Record<string, TemplateStatView>;
  testStats: Record<string, TemplateStatView>;
  reminders: Record<string, ReminderInfo>;
  /** Şablona bağlanmış gelen kutusu yanıtları (şablon id → adet). */
  repliesByTemplate: Record<string, number>;
  mailConfigured: boolean;
  /** Açılma pikselinin gömüleceği origin localhost mu (takip çalışmaz uyarısı). */
  trackingOriginLocal: boolean;
  generatedAt: string;
};

export type SendResultRow = { to: string; ok: boolean; skipped?: boolean; error?: string };
export type SendOutcome = { results: SendResultRow[]; sent: number; failed: number; skipped: number };

export type SendHistoryRow = {
  id: string;
  email: string;
  kind: 'send' | 'test';
  status: string;
  error: string | null;
  sentAt: string;
  openedAt: string | null;
  openCount: number;
  openedQuickly: boolean;
  sentByName: string | null;
  channel: string | null;
};
export type SendHistoryPage = { items: SendHistoryRow[]; nextCursor: string | null };

/** İstemci tarafında yeni şablon kimliği (sunucu zod'u ile uyumlu). */
export function newTemplateId(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.floor(Date.now()).toString(36);
  return `tpl-${rnd}`;
}

/** Şablon türüne göre birincil gönder butonu metni (Bulgu 12). */
export function sendLabelFor(kind: InternEmailKind | string | undefined): string {
  switch (kind) {
    case 'task':
      return 'Görevi gönder';
    case 'reminder':
      return 'Hatırlatmayı gönder';
    case 'welcome':
      return 'Karşılama mailini gönder';
    default:
      return 'Gönder';
  }
}
