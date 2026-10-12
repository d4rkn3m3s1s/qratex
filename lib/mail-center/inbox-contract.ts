/**
 * Gelen kutusu sözleşmesi — istemci + sunucu ortak (prisma importu YOK).
 *
 * Şema dalgası kapalı olduğu için yeni durumlar mevcut `InboxMessage.mailbox` alanıyla ifade edilir:
 *  - `INBOX`          → gelen, aktif
 *  - `INBOX_ARCHIVED` → panelde arşivlenmiş gelen (Gmail'e yansıtılmaz; IMAP UID'i korunur)
 *  - `QRATEX_SENT`    → panelden gönderilmiş yanıt (giden kayıt; thread'de görünür, "yanıtlandı" kaynağı)
 */
import { z } from 'zod';

export const MAILBOX_INBOX = 'INBOX';
export const MAILBOX_ARCHIVED = 'INBOX_ARCHIVED';
export const MAILBOX_SENT = 'QRATEX_SENT';
/** IMAP'ten gelen kayıtların bulunabileceği kutular (senkron dedupe'u ikisine de bakar). */
export const INCOMING_MAILBOXES = [MAILBOX_INBOX, MAILBOX_ARCHIVED] as const;

export const INBOX_VIEWS = ['inbox', 'awaiting', 'intern', 'unread', 'attachments', 'bounce', 'sent', 'archived'] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export const INBOX_VIEW_META: Record<InboxView, { label: string; hint: string }> = {
  inbox: { label: 'Gelen', hint: 'Arşivlenmemiş tüm gelen mailler' },
  awaiting: { label: 'Yanıt bekleyen', hint: 'Stajyerden gelen ve panelden henüz yanıtlanmamış mailler' },
  intern: { label: 'Stajyerler', hint: 'Görev şablonu alıcılarından gelen mailler' },
  unread: { label: 'Okunmamış', hint: 'Panelde henüz açılmamış mailler' },
  attachments: { label: 'Ekli', hint: 'Dosya eki olan mailler' },
  bounce: { label: 'İletilemedi', hint: 'Teslim edilemedi (bounce) bildirimleri' },
  sent: { label: 'Gönderilen', hint: 'Panelden gönderilen yanıtlar' },
  archived: { label: 'Arşiv', hint: 'Panelde arşivlenen mailler' },
};

export const INBOX_PAGE_SIZE = 30;

export const inboxListQuerySchema = z.object({
  view: z.enum(INBOX_VIEWS).default('inbox'),
  q: z.string().trim().max(120).optional().default(''),
  cursor: z.string().trim().max(80).optional(),
});
export type InboxListQuery = z.infer<typeof inboxListQuerySchema>;

export type InboxAttachmentMeta = {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  /** Ek R2'de saklanıyor mu (indirilebilir mi). URL istemciye VERİLMEZ; yetkili uçtan akıtılır. */
  available: boolean;
};

export type InboxListItem = {
  id: string;
  mailbox: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string;
  snippet: string;
  sentAt: string;
  seen: boolean;
  isFromIntern: boolean;
  isBounce: boolean;
  /** Authentication-Results doğrulaması: true/false; null = değerlendirilmedi (eski kayıt / giden / env yok). */
  authVerified: boolean | null;
  authReason: string | null;
  matchedRecipientName: string | null;
  matchedDepartment: string | null;
  attachmentCount: number;
  /** Aynı konuşmadaki toplam mesaj (giden yanıtlar dahil). */
  threadCount: number;
  /** Panelden yanıtlandı mı (giden kayıt var mı). */
  replied: boolean;
};

export type InboxListPage = {
  items: InboxListItem[];
  nextCursor: string | null;
  /** Bu görünüm + arama için toplam eşleşme. */
  matched: number;
};

export type InboxSyncState = {
  lastRunAt: string | null;
  ok: boolean | null;
  source: 'manual' | 'cron' | null;
  error: string | null;
  fetched: number;
  stored: number;
  matched: number;
  /** Bu koşuda bütçe/parti sınırı yüzünden kalan mail var mı (bir sonraki koşu devam eder). */
  hasMore: boolean;
  lastUid: number | null;
  uidValidity: string | null;
};

export type InboxOverview = {
  counts: Record<InboxView, number>;
  sync: InboxSyncState;
  inboxConfigured: boolean;
  mailConfigured: boolean;
  /** IMAP hesabı (env'den); yapılandırılmamışsa null. */
  account: string | null;
  retentionDays: number | null;
  generatedAt: string;
};

export type InboxThreadMessage = {
  id: string;
  mailbox: string;
  direction: 'in' | 'out';
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string;
  sentAt: string;
  seen: boolean;
  isBounce: boolean;
  /** Authentication-Results doğrulaması: true/false; null = değerlendirilmedi (eski kayıt / giden / env yok). */
  authVerified: boolean | null;
  authReason: string | null;
  bodyText: string | null;
  hasHtml: boolean;
  /** Gövdede uzak (http/https) görsel var mı — "uzak görselleri göster" bandı için. */
  hasRemoteImages: boolean;
  attachments: InboxAttachmentMeta[];
};

export type InboxDetail = {
  message: InboxThreadMessage & {
    isFromIntern: boolean;
    matchedTemplateId: string | null;
    matchedRecipientName: string | null;
    matchedDepartment: string | null;
    messageId: string | null;
    replied: boolean;
  };
  /** Konuşmanın tamamı (eskiden yeniye, seçili mesaj dahil). */
  thread: InboxThreadMessage[];
};

export const inboxPatchSchema = z
  .object({
    seen: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.seen !== undefined || v.archived !== undefined, { message: 'Değiştirilecek bir alan gönderin.' });

export const inboxReplySchema = z.object({
  message: z.string().trim().min(1, 'Yanıt metni boş olamaz.').max(12_000, 'Yanıt en fazla 12.000 karakter olabilir.'),
  /** Orijinal mesajı alıntıla (varsayılan açık). */
  quote: z.boolean().optional().default(true),
});

export const inboxSettingsSchema = z.object({
  retentionDays: z.union([z.literal(90), z.literal(180), z.literal(365), z.literal(730), z.null()]),
});

export const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Kapalı (süresiz sakla)' },
  { value: 90, label: '90 gün' },
  { value: 180, label: '180 gün' },
  { value: 365, label: '1 yıl' },
  { value: 730, label: '2 yıl' },
];

/** "Re:" ön ekini tekrarlamadan yanıt konusu üretir; RFC'ye uygun 200 karakter sınırı (kırpar, hata vermez). */
export function replySubject(original: string): string {
  const base = (original || '').trim() || '(konu yok)';
  const subject = /^(re|ynt|yanıt)\s*:/i.test(base) ? base : `Re: ${base}`;
  return subject.length > 200 ? `${subject.slice(0, 199)}…` : subject;
}

/** İnsan dostu bayt. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
