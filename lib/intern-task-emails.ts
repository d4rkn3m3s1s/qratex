/**
 * STAJYER / GENEL MAİL ŞABLONLARI — admin panelinden (`/admin/intern-emails`) yönetilen markalı
 * mail şablonları + kişiselleştirme + HTML render + son teslim yardımcıları.
 *
 * Depolama: `Settings[intern_task_emails]` = `{ version, updatedAt, updatedBy, templates }`.
 * Eski biçim (çıplak dizi) okunurken sürüm 0 kabul edilir; ilk kayıtta yeni biçime geçer.
 *
 * Değişmezler (denetim Bulgu 2-3 + 8):
 *  - Kaynak kodda GERÇEK KİŞİ VERİSİ YOK. Varsayılan şablon listesi boştur; gerçek atamalar
 *    yalnız DB'de durur (KVKK veri minimizasyonu).
 *  - "Ayar yok" ile "boş liste" ayrıdır; boş liste meşru bir durumdur ve varsayılanlar
 *    ASLA geri yazılmaz.
 *  - DB okuma hatası YUTULMAZ (fail-closed): gönderim yolları yanlış listeye mail atamaz.
 *  - Yazma iyimser kilitlidir (`version`); eşzamanlı düzenleme 409 ile reddedilir.
 *  - Silme yok, ARŞİV var (`archivedAt`): gönderim geçmişi sahipsiz kalmaz.
 */
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const INTERN_EMAILS_SETTING_KEY = 'intern_task_emails';
export const INTERN_EMAILS_SETTING_CATEGORY = 'email';

/**
 * @deprecated Eski sabit varsayılan son teslim etiketi. Artık hiçbir mailde varsayılan tarih
 * BASILMAZ (geçmiş tarih basma hatası, Bulgu 6). Yalnız geriye uyumlu dışa aktarım için durur.
 */
export const INTERN_TASK_DEADLINE_LABEL = '14 Ağustos 17.00';

/**
 * Mailde gömülen mutlak URL'ler (özellikle AÇILMA TAKİP PIXEL'i) için güvenilir origin.
 * KRİTİK: pixel URL'si asla `localhost` olmamalı — yoksa mail istemcisi (Gmail vb.) ona
 * ulaşamaz ve açılma HİÇ kaydedilmez. Öncelik: MAIL_PUBLIC_ORIGIN (açık ayar) → normal origin
 * (localhost değilse) → Vercel prod URL → normal origin (son çare).
 */
export function mailPublicOrigin(): string {
  const clean = (u: string) => u.replace(/\/$/, '');
  const explicit = process.env.MAIL_PUBLIC_ORIGIN?.trim();
  if (explicit) return clean(explicit);

  const base = getPublicAppOrigin();
  const isLocal = /localhost|127\.0\.0\.1|\.local(?::|$|\/)/i.test(base);
  if (!isLocal) return clean(base);

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${clean(vercelProd)}`;
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${clean(vercelUrl)}`;

  console.warn('[intern-mail] mailPublicOrigin localhost döndü; açılma takibi çalışmaz. MAIL_PUBLIC_ORIGIN ayarla.');
  return clean(base);
}

// Şablon türü sabitleri client-safe ayrı dosyada (prisma sızmasın).
import { INTERN_EMAIL_KINDS, MAIL_VARIABLES, isInternEmailKind, type InternEmailKind } from '@/lib/intern-email-kinds';
export { INTERN_EMAIL_KINDS, MAIL_VARIABLES, isInternEmailKind, type InternEmailKind };

export interface InternTaskEmail {
  /** Stabil id (düzenleme/arşiv için). */
  id: string;
  /** Şablon türü (görsel kimlik + bölümler). Yoksa 'task'. */
  kind?: InternEmailKind;
  /** Departman etiketi (gruplama). */
  department: string;
  /** Alıcı adı (metinde hitap). */
  recipientName: string;
  /** Alıcı e-postası/e-postaları (virgülle ayrılmış). Boş olabilir (taslak). */
  email: string;
  /** Mail konusu. */
  subject: string;
  /** Mail gövdesi (düz metin; "1." başlık, "•/-" madde). */
  body: string;
  /**
   * Son teslim. Yeni kayıtlar `YYYY-MM-DDTHH:mm` (Europe/Istanbul yerel saat) biçimindedir;
   * eski kayıtlar serbest metin olabilir ("14 Ağustos 17.00"). Boşsa son teslim kartı BASILMAZ.
   */
  deadline?: string;
  /** Son teslim günü otomatik hatırlatma (varsayılan açık; yalnız `false` kapatır). */
  reminder?: boolean;
  /** Arşivlendiyse ISO zaman (listede gizlenir, gönderilmez, hatırlatma gitmez). */
  archivedAt?: string | null;
}

/** Kaynak kodda kişisel veri tutulmaz → varsayılan liste BOŞ (Bulgu 3). */
export const DEFAULT_INTERN_TASK_EMAILS: InternTaskEmail[] = [];

// ════════════════════════════════════════════════════════════════════════════
// DEPOLAMA — Settings JSON (sürümlü, iyimser kilitli).
// ════════════════════════════════════════════════════════════════════════════

const ISO_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const TEMPLATE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Tek ham öğeyi şablona çevirir (geçersizse null). */
function normalizeOne(raw: unknown): InternTaskEmail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null;
  const subject = typeof r.subject === 'string' ? r.subject.trim() : '';
  if (!id || !subject) return null;
  const deadline = typeof r.deadline === 'string' && r.deadline.trim() ? r.deadline.trim().slice(0, 60) : undefined;
  const out: InternTaskEmail = {
    id,
    kind: isInternEmailKind(r.kind) ? r.kind : 'task',
    department: typeof r.department === 'string' && r.department.trim() ? r.department : 'Genel',
    recipientName: typeof r.recipientName === 'string' ? r.recipientName : '',
    email: typeof r.email === 'string' ? r.email.trim() : '',
    subject,
    body: typeof r.body === 'string' ? r.body : '',
    deadline,
  };
  if (r.reminder === false) out.reminder = false;
  if (typeof r.archivedAt === 'string' && r.archivedAt) out.archivedAt = r.archivedAt;
  return out;
}

/**
 * Ham JSON'ı şablon listesine çevirir. Hem eski çıplak dizi hem `{ templates }` sarmalayıcısı
 * okunur. Geçersiz öğe atılır; dizi değilse BOŞ liste (varsayılana DÜŞMEZ).
 */
export function normalizeInternEmails(value: unknown): InternTaskEmail[] {
  const list: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { templates?: unknown }).templates)
      ? (value as { templates: unknown[] }).templates
      : [];
  const out: InternTaskEmail[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const t = normalizeOne(raw);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

export type InternTemplatesState = {
  /** Ayar satırı var mı (yoksa hiç kaydedilmemiş). */
  exists: boolean;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Arşivliler DAHİL tüm şablonlar. */
  templates: InternTaskEmail[];
};

function readMeta(value: unknown): { version: number; updatedAt: string | null; updatedBy: string | null } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      version: typeof o.version === 'number' && Number.isFinite(o.version) ? o.version : 0,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null,
      updatedBy: typeof o.updatedBy === 'string' ? o.updatedBy : null,
    };
  }
  return { version: 0, updatedAt: null, updatedBy: null };
}

/** Tüm şablonları sürüm bilgisiyle okur. DB hatası FIRLATILIR (fail-closed). */
export async function loadInternTemplatesState(): Promise<InternTemplatesState> {
  const setting = await prisma.settings.findUnique({ where: { key: INTERN_EMAILS_SETTING_KEY }, select: { value: true } });
  if (!setting) return { exists: false, version: 0, updatedAt: null, updatedBy: null, templates: [] };
  return { exists: true, ...readMeta(setting.value), templates: normalizeInternEmails(setting.value) };
}

/** Aktif (arşivlenmemiş) şablonlar — gönderim ve hatırlatma yolları bunu kullanır. DB hatası fırlatılır. */
export async function getInternTaskEmails(): Promise<InternTaskEmail[]> {
  const { templates } = await loadInternTemplatesState();
  return templates.filter((t) => !t.archivedAt);
}

export class InternTemplatesConflictError extends Error {
  readonly currentVersion: number;
  constructor(currentVersion: number) {
    super('Şablonlar siz düzenlerken başka bir yönetici tarafından değiştirildi.');
    this.name = 'InternTemplatesConflictError';
    this.currentVersion = currentVersion;
  }
}

/**
 * Şablon listesini İYİMSER KİLİTLE kaydeder: `baseVersion` güncel sürümle eşleşmezse
 * `InternTemplatesConflictError`. Karşılaştır-ve-yaz tek `updateMany` koşuluyla (atomik).
 */
export async function saveInternTemplates(
  list: InternTaskEmail[],
  input: { baseVersion: number; userId: string }
): Promise<{ version: number; updatedAt: string }> {
  const updatedAt = new Date().toISOString();
  const version = input.baseVersion + 1;
  const value = { version, updatedAt, updatedBy: input.userId, templates: list } as unknown as Prisma.InputJsonValue;

  const current = await prisma.settings.findUnique({ where: { key: INTERN_EMAILS_SETTING_KEY }, select: { value: true } });
  if (!current) {
    if (input.baseVersion !== 0) throw new InternTemplatesConflictError(0);
    try {
      await prisma.settings.create({ data: { key: INTERN_EMAILS_SETTING_KEY, value, category: INTERN_EMAILS_SETTING_CATEGORY } });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new InternTemplatesConflictError(-1);
      throw e;
    }
    return { version, updatedAt };
  }

  const meta = readMeta(current.value);
  if (meta.version !== input.baseVersion) throw new InternTemplatesConflictError(meta.version);
  // Okuduğumuz değer hâlâ aynıysa yaz (araya giren yazım 0 satır günceller → çakışma).
  const res = await prisma.settings.updateMany({
    where: { key: INTERN_EMAILS_SETTING_KEY, value: { equals: current.value as Prisma.InputJsonValue } },
    data: { value, category: INTERN_EMAILS_SETTING_CATEGORY },
  });
  if (res.count === 0) {
    const fresh = await loadInternTemplatesState();
    throw new InternTemplatesConflictError(fresh.version);
  }
  return { version, updatedAt };
}

/** Şablonun geçerli alıcı listesi (küçük harf, tekil). */
export function templateRecipients(tpl: Pick<InternTaskEmail, 'email'>): string[] {
  return Array.from(new Set(tpl.email.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean)));
}

// ════════════════════════════════════════════════════════════════════════════
// SON TESLİM — ISO yerel saat (Europe/Istanbul) + eski serbest metin uyumu.
// ════════════════════════════════════════════════════════════════════════════

const TR_MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** `YYYY-MM-DDTHH:mm` mi. */
export function isIsoLocalDeadline(deadline: string | undefined | null): boolean {
  return !!deadline && ISO_LOCAL_RE.test(deadline.trim());
}

/** Mailde/ekranda gösterilecek etiket: "15 Ekim 2026, 17:00". Eski serbest metin olduğu gibi döner. */
export function formatDeadlineLabel(deadline: string | undefined | null): string {
  const d = (deadline ?? '').trim();
  if (!d) return '';
  const m = d.match(ISO_LOCAL_RE);
  if (!m) return d;
  const month = TR_MONTH_NAMES[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month} ${m[1]}, ${m[4]}:${m[5]}`;
}

/** Geçerli bir şablon id'si mi (istemci üretir). */
export function isValidTemplateId(id: string): boolean {
  return TEMPLATE_ID_RE.test(id);
}

// ════════════════════════════════════════════════════════════════════════════
// ÇOK GÜZEL ÖZEL HTML RENDER — kendi kurumsal tasarımı: koyu gradient hero + GÖMÜLÜ
// beyaz logo (domain gerekmez) + departman renkli rozet + şık gövde + son teslim kartı.
// ════════════════════════════════════════════════════════════════════════════


/**
 * Gövdedeki {{degisken}} yer tutucularını doldurur. Tanınmayan değişken OLDUĞU GİBİ bırakılır
 * (silinmez — kullanıcı hatasını görsün). Türkçe eş adlar: isim=ad. Değerler render'da escape edilir.
 */
export function applyMailVariables(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zçğıöşü_]+)\s*\}\}/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    const v = vars[key];
    return typeof v === 'string' && v.length ? v : whole;
  });
}

/** Departman → { emoji, renk } — mailde görsel kimlik (her departmanın kendi rengi). */
function departmentTheme(dept: string): { emoji: string; color: string; soft: string } {
  const d = dept.toLowerCase();
  if (d.includes('hukuk')) return { emoji: '⚖️', color: '#0ea5e9', soft: '#0ea5e91a' };
  if (d.includes('iş gel') || d.includes('is gel')) return { emoji: '📊', color: '#10b981', soft: '#10b9811a' };
  if (d.includes('pazarlama')) return { emoji: '🎯', color: '#f43f5e', soft: '#f43f5e1a' };
  if (d.includes('sosyal')) return { emoji: '📱', color: '#8b5cf6', soft: '#8b5cf61a' };
  if (d.includes('dizayn') || d.includes('deneyim')) return { emoji: '🎨', color: '#ec4899', soft: '#ec48991a' };
  if (d.includes('üretim') || d.includes('gelişt')) return { emoji: '⚙️', color: '#f59e0b', soft: '#f59e0b1a' };
  return { emoji: '✨', color: '#9333ea', soft: '#9333ea1a' };
}

/** HTML-escape (XSS koruması). */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Görev gövdesini ŞIK HTML'e çevirir: "1. Başlık" / "N." ile başlayan satırlar numaralı
 * bölüm başlığı olur; "•" madde işaretli satırlar şık liste olur; diğerleri paragraf.
 */
function prettyBody(body: string, color: string): string {
  const blocks = body.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    // Numaralı ana başlık (ör. "1. Pazar Analizi") — ilk satır ise vurgulu bölüm.
    const firstNumbered = /^\s*\d+\.\s/.test(lines[0]);
    const rows: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bullet = /^\s*[•\-]\s+/.test(line);
      const numHead = i === 0 && firstNumbered;
      if (numHead) {
        rows.push(`<p style="margin:22px 0 8px;font-size:16px;font-weight:800;color:#0f172a;">${escHtml(line.trim())}</p>`);
      } else if (bullet) {
        const txt = line.replace(/^\s*[•\-]\s+/, '');
        rows.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px;"><tr>
          <td style="vertical-align:top;padding:2px 10px 0 2px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};"></span></td>
          <td style="font-size:14.5px;line-height:1.65;color:#475569;">${escHtml(txt)}</td></tr></table>`);
      } else {
        rows.push(`<p style="margin:0 0 12px;font-size:14.5px;line-height:1.7;color:#475569;">${escHtml(line)}</p>`);
      }
    }
    out.push(rows.join(''));
  }
  return out.join('');
}

const EMAIL_HEAD = `<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>QRateX</title>
<!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
</head>`;

/**
 * Bir stajyer görev maili için ÇOK GÜZEL, modern, kurumsal HTML üretir.
 * - Koyu gradient hero + GÖMÜLÜ beyaz logo (domain gerekmez, asla kırılmaz).
 * - Departman renkli rozet + karşılama.
 * - Şık gövde (numaralı başlıklar + renkli madde işaretleri).
 * - Dikkat çekici son teslim kartı.
 * - trackToken verilirse görünmez açılma pixel'i.
 */
export function renderInternTaskEmailHtml(tpl: InternTaskEmail, trackToken?: string, recipientEmail?: string): { html: string; text: string } {
  const origin = mailPublicOrigin();
  const kind: InternEmailKind = tpl.kind ?? 'task';
  const theme = departmentTheme(tpl.department);
  const greetName = tpl.recipientName ? escHtml(tpl.recipientName) : 'Merhaba';
  // Bu şablonun kendi son teslim tarihi. Boşsa kart BASILMAZ (eski sabit varsayılan geçmiş
  // bir tarih basıyordu — Bulgu 6). ISO kayıtlar "15 Ekim 2026, 17:00" biçiminde gösterilir.
  const deadline = formatDeadlineLabel(tpl.deadline);
  // Değişkenleri doldur — kişiselleştirme.
  // {{email}}: KVKK — varsa YALNIZ o alıcının adresi (recipientEmail); yoksa boş (tüm listeyi ASLA
  //   basma — çok-alıcılı şablonda alıcılar birbirinin adresini görmesin).
  // {{deadline}}: yalnız 'task' türünde anlamlı; diğer türlerde boş (alakasız tarih basmasın).
  const body = applyMailVariables(tpl.body, {
    isim: tpl.recipientName, ad: tpl.recipientName, departman: tpl.department,
    email: recipientEmail ?? '', deadline: kind === 'task' ? deadline : '', konu: tpl.subject,
  });
  // Bilinen ama bu gönderimde boş kalan değişkenler mailde "{{deadline}}" diye görünmesin.
  const cleaned = body.replace(/\{\{\s*(isim|ad|departman|email|deadline|konu)\s*\}\}/gi, '');
  tpl = { ...tpl, body: cleaned };

  // Tür-özel görsel/metin. accent = hero şerit + vurgu rengi.
  const K = ((): { emoji: string; accent: string; badge: string | null; titleSuffix: string; sub: string; sign: string } => {
    switch (kind) {
      case 'general':
        return { emoji: '✉️', accent: theme.color, badge: null, titleSuffix: '', sub: '', sign: 'ReverBot & QRateX Ekibi' };
      case 'welcome':
        return { emoji: '🎉', accent: '#8b5cf6', badge: 'QRATEX EKİBİ', titleSuffix: ', aramıza hoş geldin!', sub: 'Seni ekibimizde görmekten mutluluk duyuyoruz.', sign: 'ReverBot & QRateX Ekibi' };
      case 'reminder':
        return { emoji: '🔔', accent: '#f59e0b', badge: 'HATIRLATMA', titleSuffix: '', sub: '', sign: 'ReverBot & QRateX Ekibi' };
      case 'minimal':
        return { emoji: '', accent: theme.color, badge: null, titleSuffix: '', sub: '', sign: 'QRateX' };
      case 'task':
      default:
        return { emoji: theme.emoji, accent: theme.color, badge: `${escHtml(tpl.department.toUpperCase())} DEPARTMANI`, titleSuffix: tpl.recipientName ? ', görevin hazır!' : '', sub: 'QRateX ekibine katılım sürecinin bir parçası olarak sana özel bir görev.', sign: 'ReverBot & QRateX Ekibi' };
    }
  })();
  const showDeadline = kind === 'task' && deadline.length > 0;
  const preheader = kind === 'task'
    ? `QRateX ekibinden görev ataması${deadline ? ` — son teslim ${escHtml(deadline)}` : ''}.`
    : `QRateX — ${escHtml(tpl.subject || 'mesaj')}`;

  const pixel = trackToken
    ? `<img src="${origin}/api/track/email-open/${encodeURIComponent(trackToken)}" width="1" height="1" alt="" border="0" style="width:1px;height:1px;max-height:1px;max-width:1px;border:0;margin:0;padding:0;" />`
    : '';

  const html = `<!DOCTYPE html>
<html lang="tr">
${EMAIL_HEAD}
<body style="margin:0;padding:0;background:#eef2f7;-webkit-font-smoothing:antialiased;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.12);">

        <!-- HERO: koyu gradient + logo (HTTPS URL — Gmail data: URI'yi engeller) + parıltı şeridi -->
        <tr><td style="background:#0b0618;background:linear-gradient(135deg,#1a0a2e 0%,#0f0f1e 55%,#16213e 100%);padding:40px 40px 32px;text-align:center;">
          <img src="${origin}/logo/font-white.png" width="180" alt="QRateX" style="display:block;margin:0 auto ${K.badge ? '20px' : '0'};width:180px;max-width:60%;height:auto;border:0;" />
          ${K.badge ? `<div style="display:inline-block;padding:8px 18px;border-radius:999px;background:${K.accent}1a;border:1px solid ${K.accent}55;">
            <span style="font-size:13px;font-weight:800;letter-spacing:0.6px;color:${K.accent};">${K.emoji ? K.emoji + '&nbsp;&nbsp;' : ''}${K.badge}</span>
          </div>` : ''}
        </td></tr>
        <!-- Işıltı çizgisi -->
        <tr><td style="height:4px;background:linear-gradient(90deg,${K.accent},#e879f9,${K.accent});"></td></tr>

        <!-- GÖVDE -->
        <tr><td style="padding:36px 40px 8px;">
          <h1 style="margin:0 0 ${K.sub ? '4px' : '18px'};font-size:24px;line-height:1.25;font-weight:800;color:#0f172a;">
            ${K.emoji ? K.emoji + ' ' : ''}${greetName}${K.titleSuffix}
          </h1>
          ${K.sub ? `<p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">${escHtml(K.sub)}</p>` : ''}
          ${prettyBody(tpl.body, K.accent)}
        </td></tr>

        ${showDeadline ? `<!-- SON TESLİM kartı (dikkat çekici) -->
        <tr><td style="padding:8px 40px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1.5px solid #f59e0b66;border-radius:16px;padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="52" style="vertical-align:middle;"><div style="width:44px;height:44px;border-radius:12px;background:#f59e0b;text-align:center;line-height:44px;font-size:22px;">⏳</div></td>
                <td style="vertical-align:middle;padding-left:8px;">
                  <div style="font-size:11px;font-weight:800;letter-spacing:1.2px;color:#b45309;text-transform:uppercase;">Son Teslim Tarihi</div>
                  <div style="font-size:20px;font-weight:900;color:#78350f;margin-top:1px;">${escHtml(deadline)}</div>
                  <div style="font-size:13px;color:#92400e;margin-top:2px;">Görev sonucunu bu tarih ve saate kadar iletmeni bekliyoruz.</div>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>` : ''}

        <!-- İMZA -->
        <tr><td style="padding:24px 40px 32px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:18px;">
            ${kind === 'task' ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#94a3b8;">
              Bu görev, QRateX ekibine katılım sürecinin bir parçasıdır. Soruların için bize her zaman ulaşabilirsin. 🚀
            </p>` : ''}
            <p style="margin:0;font-size:14px;font-weight:800;color:#7c3aed;">${escHtml(K.sign)}</p>
          </div>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#0f0f1e;padding:22px 40px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:0.3px;">QRateX · Yapay Zeka Destekli QR Geri Bildirim Platformu</p>
          <p style="margin:6px 0 0;font-size:11px;color:#475569;">Sorun ve teslimlerin için bu maili doğrudan yanıtlayabilirsin.</p>
        </td></tr>

      </table>
      ${pixel}
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    ...(kind === 'task' ? [`${tpl.department} Departmanı`, ''] : []),
    tpl.body,
    '',
    ...(showDeadline ? [`⏳ Son teslim: ${deadline}`, ''] : []),
    K.sign,
  ];
  const text = textLines.join('\n');
  return { html, text };
}

/**
 * Basit ama ŞIK markalı e-posta (cron hatırlatmaları için) — GÖMÜLÜ beyaz logolu koyu hero +
 * beyaz kart gövdesi + opsiyonel CTA. Domain gerekmez (logo base64). renderInternTaskEmailHtml
 * ile aynı görsel dil, ama serbest içerik.
 */
export function renderSimpleBrandedEmail(input: {
  heading: string;
  bodyHtml: string;
  cta?: { href: string; label: string };
  accent?: string;
  /** Altbilgi notu (varsayılan: "Bu otomatik bir bildirimdir, lütfen yanıtlamayın."). */
  footerNote?: string;
}): string {
  const accent = input.accent || '#9333ea';
  const footerNote = escHtml(input.footerNote ?? 'Bu otomatik bir bildirimdir, lütfen yanıtlamayın.');
  const origin = mailPublicOrigin();
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;"><tr><td style="border-radius:12px;background:linear-gradient(135deg,${accent},#e879f9);">
        <a href="${input.cta.href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">${input.cta.label}</a>
       </td></tr></table>`
    : '';
  return `<!DOCTYPE html><html lang="tr">${EMAIL_HEAD}
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.12);">
      <tr><td style="background:linear-gradient(135deg,#1a0a2e,#0f0f1e 55%,#16213e);padding:36px 40px 28px;text-align:center;">
        <img src="${origin}/logo/font-white.png" width="170" alt="QRateX" style="display:block;margin:0 auto;width:170px;max-width:60%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,${accent},#e879f9,${accent});"></td></tr>
      <tr><td style="padding:34px 40px 30px;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:800;color:#0f172a;">${escHtml(input.heading)}</h1>
        ${input.bodyHtml}
        ${cta}
      </td></tr>
      <tr><td style="background:#0f0f1e;padding:20px 40px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#64748b;">QRateX · Yapay Zeka Destekli QR Geri Bildirim Platformu</p>
        <p style="margin:6px 0 0;font-size:11px;color:#475569;">${footerNote}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Türkçe ay adları → ay numarası (1-12). Serbest-metin deadline'ı çözmek için. */
const TR_MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};

/**
 * Serbest-metin deadline etiketini ({gün} {ay adı}, ör. "14 Ağustos 17.00") bugünün TR
 * tarihiyle karşılaştırır. Cron her gün çalışıp bugüne denk gelen görevleri bulmak için kullanır.
 *
 * ÖNEMLİ: BOŞ/tanımsız deadline → false döner (varsayılana DÜŞMEZ). Yani deadline'ı olmayan
 * şablon için cron hatırlatması gönderilmez — 13 varsayılan şablonun hepsi 14 Ağustos'ta
 * beklenmedik toplu mail atmasın diye. (Varsayılan etiket yalnızca mailde GÖRSEL gösterim içindir.)
 *
 * Parse: önce "{gün} {ay adı}" (ör. "14 Ağustos") denenir; bulunursa SONUÇ ONA göre döner ve
 * sayısal biçim DENENMEZ — böylece metindeki SAAT kısmı ("...17.08") yanlışlıkla tarih sanılmaz.
 * Ay adı yoksa "{gün}.{ay}" / "{gün}/{ay}" sayısal biçimi denenir.
 */
export function deadlineIsToday(deadline: string | undefined, today: { day: number; month: number; year?: number }): boolean {
  if (!deadline || !deadline.trim()) return false; // boş → hatırlatma yok
  const raw = deadline.toLowerCase();

  // 0) ISO yerel saat ("2026-10-15T17:00") — yeni kayıtlar; yıl da karşılaştırılır.
  const iso = deadline.trim().match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}$/);
  if (iso) {
    const [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return d === today.day && mo === today.month && (today.year == null || y === today.year);
  }

  // 1) "14 ağustos ..." — gün + TR ay adı. Ay adı bulunursa SADECE bunu esas al (erken karar).
  const nameMatch = raw.match(/(\d{1,2})\s*([a-zçğıöşü]+)/i);
  if (nameMatch) {
    const month = TR_MONTHS[nameMatch[2]];
    if (month) {
      const day = parseInt(nameMatch[1], 10);
      return day === today.day && month === today.month; // saat kısmına BAKMA
    }
  }

  // 2) Ay adı yoktu → "14.08" / "14/08" sayısal biçim. (ay 1-12 olmalı.)
  const numMatch = raw.match(/\b(\d{1,2})[.\/](\d{1,2})\b/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10);
    if (month >= 1 && month <= 12) return day === today.day && month === today.month;
  }
  return false;
}
