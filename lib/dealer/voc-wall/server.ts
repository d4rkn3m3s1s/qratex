/**
 * Müşteri sesi duvarı — SUNUCU katmanı. Yönetim sayfası (SSR), BFF uçları ve oturumsuz ekran
 * (`/wall/[token]`) AYNI fonksiyonları çağırır. Kiracı kapsamı çağıranın verdiği `dealerId`'dir
 * (BFF `defineRoute` + `resolveDealerScope`, ekran ise token araması ile çözer).
 *
 * Tanımlar:
 *  - "Yayında" = `wallEligibleWhere` (güvenlik, fail-closed) ∧ gizli değil ∧ (sabit ∨ kurallar).
 *  - İstatistikler içerik değil sayımdır: tüm silinmemiş geri bildirimler (toksik olumsuzları
 *    gizlemek tabloyu iyi gösterirdi). Dönem Europe/Istanbul gün sınırlarıyla.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import {
  WALL_FRAUD_THRESHOLD,
  containsBlockedLanguage,
  maskCustomerName,
  toWallText,
  wallEligibleWhere,
} from '@/app/api/dealer/voc-wall/wall-policy';
import {
  CURATION_PAGE_SIZE,
  DEFAULT_WALL_CONFIG,
  DEFAULT_WALL_RULES,
  DISPLAY_TTL_DAYS,
  MAX_ACTIVE_DISPLAYS,
  WALL_CONFIG_CATEGORY,
  WALL_FEED_SIZE,
  applyWallStatus,
  displayIsActive,
  parseWallConfig,
  qrMatrixToPath,
  themeNames,
  topThemes,
  wallConfigKey,
  wallDisplayKey,
  wallVerdict,
  type CurationFilter,
  type CurationPageDto,
  type DisplayDto,
  type WallConfig,
  type WallDisplay,
  type WallFeedDto,
  type WallOverviewDto,
  type WallRange,
  type WallRules,
  type WallStatus,
} from './config';

const DAY_MS = 86_400_000;

/** Kodla kullanılan hata: rota bunu ApiError'a çevirir. */
export class WallError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST',
    message: string
  ) {
    super(message);
    this.name = 'WallError';
  }
}

// ───────────────────────── Yapılandırma ─────────────────────────

/** Okuma (fail-safe): DB okunamazsa güvenli varsayılan (en sıkı değil ama yayın güvenliği ayrı). */
export async function getWallConfig(dealerId: string): Promise<WallConfig> {
  try {
    return await readWallConfigStrict(dealerId);
  } catch (err) {
    console.error('[voc-wall] yapılandırma okunamadı, varsayılan kullanılıyor:', err);
    return { ...DEFAULT_WALL_CONFIG, rules: { ...DEFAULT_WALL_RULES } };
  }
}

/** Yazma öncesi okuma: hata yutulmaz (aksi hâlde varsayılan, gerçek listelerin üstüne yazılırdı). */
async function readWallConfigStrict(dealerId: string): Promise<WallConfig> {
  const row = await prisma.settings.findUnique({ where: { key: wallConfigKey(dealerId) }, select: { value: true } });
  return parseWallConfig(row?.value);
}

async function saveWallConfig(dealerId: string, config: WallConfig): Promise<void> {
  const value = config as unknown as Prisma.InputJsonValue;
  await prisma.settings.upsert({
    where: { key: wallConfigKey(dealerId) },
    create: { key: wallConfigKey(dealerId), value, category: WALL_CONFIG_CATEGORY },
    update: { value },
  });
}

export async function updateWallRules(dealerId: string, rules: WallRules): Promise<WallRules> {
  if (rules.qrCodeId) await assertOwnQr(dealerId, rules.qrCodeId);
  const cfg = await readWallConfigStrict(dealerId);
  await saveWallConfig(dealerId, { ...cfg, rules, version: cfg.version + 1 });
  return rules;
}

async function assertOwnQr(dealerId: string, qrCodeId: string): Promise<void> {
  const qr = await prisma.qRCode.findFirst({ where: { id: qrCodeId, dealerId }, select: { id: true } });
  if (!qr) throw new WallError('NOT_FOUND', 'QR kod bulunamadı.');
}

/** Moderasyon: yorumu sabitle / gizle / otomatiğe döndür. Sahiplik feedback→qrCode.dealerId ile. */
export async function setWallStatus(dealerId: string, feedbackId: string, status: WallStatus): Promise<{ status: WallStatus }> {
  const fb = await prisma.feedback.findFirst({
    where: { id: feedbackId, deletedAt: null, qrCode: { dealerId } },
    select: { id: true },
  });
  if (!fb) throw new WallError('NOT_FOUND', 'Geri bildirim bulunamadı.');
  const cfg = await readWallConfigStrict(dealerId);
  const next = applyWallStatus(cfg, feedbackId, status);
  if (!next) throw new WallError('CONFLICT', 'En fazla 20 yorum sabitlenebilir. Önce birinin sabitini kaldırın.');
  await saveWallConfig(dealerId, next);
  return { status };
}

// ───────────────────────── Koşullar ─────────────────────────

function rulesWhere(rules: WallRules): Prisma.FeedbackWhereInput {
  return {
    rating: { gte: rules.minRating },
    ...(rules.requireText ? { AND: [{ text: { not: null } }, { NOT: { text: '' } }] } : {}),
  };
}

/** Ekranda yayında olan yorumlar (DB tarafı; yerel küfür sözlüğü ayrıca uygulanır). */
export function liveWhere(dealerId: string, config: Pick<WallConfig, 'rules' | 'pinned' | 'hidden'>, qrCodeId: string | null): Prisma.FeedbackWhereInput {
  const and: Prisma.FeedbackWhereInput[] = [wallEligibleWhere(dealerId)];
  if (config.hidden.length) and.push({ id: { notIn: config.hidden } });
  if (qrCodeId) and.push({ qrCodeId });
  and.push(config.pinned.length ? { OR: [{ id: { in: config.pinned } }, rulesWhere(config.rules)] } : rulesWhere(config.rules));
  return { AND: and };
}

function baseWhere(dealerId: string, qrCodeId: string | null): Prisma.FeedbackWhereInput {
  return { qrCode: { dealerId }, deletedAt: null, ...(qrCodeId ? { qrCodeId } : {}) };
}

function displayName(user: { name: string | null; anonymizedAt: Date | null } | null, rules: WallRules): string | null {
  if (rules.nameDisplay === 'none' || !user || user.anonymizedAt) return null;
  const masked = maskCustomerName(user.name);
  return masked === maskCustomerName(null) ? null : masked;
}

const ITEM_SELECT = {
  id: true,
  rating: true,
  text: true,
  createdAt: true,
  dealerReply: true,
  user: { select: { name: true, anonymizedAt: true } },
  qrCode: { select: { name: true, location: { select: { name: true } } } },
} satisfies Prisma.FeedbackSelect;

type ItemRow = Prisma.FeedbackGetPayload<{ select: typeof ITEM_SELECT }>;

function toItem(r: ItemRow, rules: WallRules, pinned: string[]) {
  return {
    id: r.id,
    rating: r.rating,
    text: toWallText(r.text),
    name: displayName(r.user, rules),
    location: r.qrCode?.location?.name ?? r.qrCode?.name ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
    pinned: pinned.includes(r.id),
    replied: !!r.dealerReply?.trim(),
  };
}

// ───────────────────────── Ekran akışı ─────────────────────────

export async function loadWallFeed(dealerId: string, config: WallConfig, qrCodeId: string | null, now: Date = new Date()): Promise<WallFeedDto> {
  const qr = qrCodeId ?? config.rules.qrCodeId;
  const key = `voc-wall:feed:v3:${dealerId}:${qr ?? 'all'}:${config.version}`;
  return cachedJson(key, 20, () => buildWallFeed(dealerId, config, qr, now));
}

async function buildWallFeed(dealerId: string, config: WallConfig, qr: string | null, now: Date): Promise<WallFeedDto> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since24 = new Date(now.getTime() - DAY_MS);
  const scope = baseWhere(dealerId, qr);
  const [rows, agg, count24h, qrRow, dealer] = await Promise.all([
    prisma.feedback.findMany({
      where: liveWhere(dealerId, config, qr),
      orderBy: { createdAt: 'desc' },
      take: WALL_FEED_SIZE * 2,
      select: ITEM_SELECT,
    }),
    prisma.feedback.aggregate({ where: { ...scope, createdAt: { gte: since30 } }, _avg: { rating: true }, _count: true }),
    prisma.feedback.count({ where: { ...scope, createdAt: { gte: since24 } } }),
    prisma.qRCode.findFirst({
      where: { dealerId, isActive: true, revokedAt: null, archivedAt: null, ...(qr ? { id: qr } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    }),
    prisma.user.findUnique({ where: { id: dealerId }, select: { businessName: true, name: true } }),
  ]);

  const items = rows
    .filter((r) => !containsBlockedLanguage(r.text))
    .map((r) => toItem(r, config.rules, config.pinned))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return config.pinned.indexOf(a.id) - config.pinned.indexOf(b.id);
      return 0;
    })
    .slice(0, WALL_FEED_SIZE);

  let feedbackQr: WallFeedDto['feedbackQr'] = null;
  if (qrRow) {
    const [{ buildQrTargetUrl }, { qrMatrix }] = await Promise.all([
      import('@/lib/dealer/qr-codes/load.server'),
      import('@/lib/dealer/qr-codes/matrix'),
    ]);
    const url = buildQrTargetUrl(qrRow.code);
    const m = qrMatrix(url, 'M');
    feedbackQr = { url, path: qrMatrixToPath(m.rows), size: m.size };
  }

  const count30d = typeof agg._count === 'number' ? agg._count : 0;
  return {
    business: dealer?.businessName?.trim() || dealer?.name?.trim() || null,
    items,
    summary: {
      avgRating30d: count30d > 0 && agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null,
      count30d,
      count24h,
    },
    feedbackQr,
    rotateSeconds: config.rules.rotateSeconds,
    generatedAt: now.toISOString(),
  };
}

// ───────────────────────── Yönetim özeti ─────────────────────────

function countOf(c: unknown): number {
  if (typeof c === 'number') return c;
  return (c as { _all?: number } | null)?._all ?? 0;
}

function positivePct(groups: Array<{ sentiment: string | null; _count: unknown }>): number | null {
  let known = 0;
  let pos = 0;
  for (const g of groups) {
    if (!g.sentiment) continue;
    const n = countOf(g._count);
    known += n;
    if (g.sentiment.toLowerCase() === 'positive') pos += n;
  }
  return known > 0 ? Math.round((pos / known) * 1000) / 10 : null;
}

export async function loadWallOverview(
  dealerId: string,
  opts: { range: WallRange; qrCodeId: string | null },
  now: Date = new Date()
): Promise<WallOverviewDto> {
  const config = await getWallConfig(dealerId);
  const today = istanbulDay(now);
  const from = istanbulDayStart(addDays(today, -(opts.range - 1)));
  const prevFrom = istanbulDayStart(addDays(today, -(opts.range * 2 - 1)));
  const scope = baseWhere(dealerId, opts.qrCodeId);
  const cur = { ...scope, createdAt: { gte: from } };
  const prev = { ...scope, createdAt: { gte: prevFrom, lt: from } };

  const [aggCur, aggPrev, sentCur, sentPrev, liveCount, themeRows, qrCodes] = await Promise.all([
    prisma.feedback.aggregate({ where: cur, _avg: { rating: true }, _count: true }),
    prisma.feedback.aggregate({ where: prev, _avg: { rating: true }, _count: true }),
    prisma.feedback.groupBy({ by: ['sentiment'], where: cur, _count: true }),
    prisma.feedback.groupBy({ by: ['sentiment'], where: prev, _count: true }),
    prisma.feedback.count({ where: liveWhere(dealerId, config, opts.qrCodeId ?? config.rules.qrCodeId) }),
    prisma.feedback.findMany({
      where: { ...cur, aiProcessedAt: { not: null } },
      select: { themes: true, sentiment: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.qRCode.findMany({
      where: { dealerId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, location: { select: { name: true } } },
      take: 200,
    }),
  ]);

  const round1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10);
  const count = countOf(aggCur._count);
  const countPrev = countOf(aggPrev._count);
  return {
    range: opts.range,
    qrCodeId: opts.qrCodeId,
    stats: {
      avgRating: count > 0 ? round1(aggCur._avg.rating) : null,
      avgRatingPrev: countPrev > 0 ? round1(aggPrev._avg.rating) : null,
      count,
      countPrev,
      positivePct: positivePct(sentCur as Array<{ sentiment: string | null; _count: unknown }>),
      positivePctPrev: positivePct(sentPrev as Array<{ sentiment: string | null; _count: unknown }>),
      liveCount,
    },
    themes: topThemes(themeRows),
    rules: config.rules,
    qrCodes: qrCodes.map((q) => ({ id: q.id, name: q.name, location: q.location?.name ?? null })),
    pinnedCount: config.pinned.length,
    hiddenCount: config.hidden.length,
  };
}

// ───────────────────────── Küratörlük listesi ─────────────────────────

const CURATION_SELECT = {
  ...ITEM_SELECT,
  qrCodeId: true,
  userId: true,
  isPublic: true,
  isToxic: true,
  trustFlagged: true,
  fraudScore: true,
  aiProcessedAt: true,
  aiModelUsed: true,
  intent: true,
  themes: true,
  user: { select: { name: true, anonymizedAt: true, fraudStatus: true } },
} satisfies Prisma.FeedbackSelect;

export async function loadCurationPage(
  dealerId: string,
  opts: { filter: CurationFilter; page: number; qrCodeId: string | null }
): Promise<CurationPageDto> {
  const config = await getWallConfig(dealerId);
  const scope = baseWhere(dealerId, opts.qrCodeId);
  const live = liveWhere(dealerId, config, config.rules.qrCodeId);
  let where: Prisma.FeedbackWhereInput;
  switch (opts.filter) {
    case 'pinned':
      where = { ...scope, id: { in: config.pinned } };
      break;
    case 'hidden':
      where = { ...scope, id: { in: config.hidden } };
      break;
    case 'live':
      where = { AND: [scope, live] };
      break;
    case 'blocked':
      where = { AND: [scope, { NOT: live }, { id: { notIn: [...config.hidden, ...config.pinned] } }] };
      break;
    default:
      where = scope;
  }
  const page = Math.max(1, opts.page);
  const rows = await prisma.feedback.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * CURATION_PAGE_SIZE,
    take: CURATION_PAGE_SIZE + 1,
    select: CURATION_SELECT,
  });
  const items = rows.slice(0, CURATION_PAGE_SIZE).map((r) => ({
    ...toItem(r, config.rules, config.pinned),
    verdict: wallVerdict(
      {
        id: r.id,
        rating: r.rating,
        text: r.text,
        isPublic: r.isPublic,
        isToxic: r.isToxic,
        trustFlagged: r.trustFlagged,
        fraudScore: r.fraudScore,
        aiProcessedAt: r.aiProcessedAt,
        aiModelUsed: r.aiModelUsed,
        userId: r.userId,
        authorFraudStatus: r.user?.fraudStatus ?? null,
        qrCodeId: r.qrCodeId,
      },
      config,
      { fraudThreshold: WALL_FRAUD_THRESHOLD, blockedLanguage: containsBlockedLanguage }
    ),
    intent: r.intent ?? null,
    themes: themeNames(r.themes).map((t) => t.theme).slice(0, 4),
  }));
  return { items, page, hasMore: rows.length > CURATION_PAGE_SIZE, filter: opts.filter };
}

// ───────────────────────── Ekran bağlantıları ─────────────────────────

export const DISPLAY_TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;
export const hashDisplayToken = (token: string) => createHash('sha256').update(token).digest('hex');

function toDisplayDto(d: WallDisplay, now: Date): DisplayDto {
  return { id: d.id, label: d.label, qrCodeId: d.qrCodeId, createdAt: d.createdAt, expiresAt: d.expiresAt, active: displayIsActive(d, now) };
}

export async function listDisplays(dealerId: string, now: Date = new Date()): Promise<DisplayDto[]> {
  const cfg = await readWallConfigStrict(dealerId);
  return cfg.displays
    .map((d) => toDisplayDto(d, now))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt.localeCompare(a.createdAt));
}

/** Salt-okunur ekran bağlantısı üretir. Ham token YALNIZ bu yanıtta döner; DB'de özeti tutulur. */
export async function createDisplay(
  dealerId: string,
  input: { label: string; qrCodeId: string | null },
  now: Date = new Date()
): Promise<{ display: DisplayDto; token: string }> {
  if (input.qrCodeId) await assertOwnQr(dealerId, input.qrCodeId);
  const cfg = await readWallConfigStrict(dealerId);
  if (cfg.displays.filter((d) => displayIsActive(d, now)).length >= MAX_ACTIVE_DISPLAYS) {
    throw new WallError('CONFLICT', `En fazla ${MAX_ACTIVE_DISPLAYS} etkin ekran bağlantısı olabilir. Kullanılmayanı iptal edin.`);
  }
  const token = randomBytes(24).toString('base64url');
  const tokenHash = hashDisplayToken(token);
  const display: WallDisplay = {
    id: randomUUID(),
    label: input.label.trim().slice(0, 60) || 'Ekran',
    tokenHash,
    qrCodeId: input.qrCodeId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DISPLAY_TTL_DAYS * DAY_MS).toISOString(),
    revokedAt: null,
  };
  await prisma.settings.create({
    data: { key: wallDisplayKey(tokenHash), value: { dealerId, displayId: display.id }, category: WALL_CONFIG_CATEGORY },
  });
  await saveWallConfig(dealerId, { ...cfg, displays: [...cfg.displays, display] });
  return { display: toDisplayDto(display, now), token };
}

/** İptal (silme değil): kayıt geçmişte kalır, arama anahtarı kaldırılır → bağlantı anında ölür. */
export async function revokeDisplay(dealerId: string, displayId: string, now: Date = new Date()): Promise<DisplayDto> {
  const cfg = await readWallConfigStrict(dealerId);
  const d = cfg.displays.find((x) => x.id === displayId);
  if (!d) throw new WallError('NOT_FOUND', 'Ekran bağlantısı bulunamadı.');
  const revoked = { ...d, revokedAt: d.revokedAt ?? now.toISOString() };
  await saveWallConfig(dealerId, { ...cfg, displays: cfg.displays.map((x) => (x.id === displayId ? revoked : x)) });
  await prisma.settings.deleteMany({ where: { key: wallDisplayKey(d.tokenHash) } });
  return toDisplayDto(revoked, now);
}

export type ResolvedDisplay =
  | { ok: true; dealerId: string; display: WallDisplay; config: WallConfig }
  | { ok: false; reason: 'invalid' | 'revoked' | 'expired' };

/** Oturumsuz ekran: token → bayi. DB hatası yutulmaz (çağıran hata ekranı gösterir). */
export async function resolveDisplayToken(token: string, now: Date = new Date()): Promise<ResolvedDisplay> {
  if (!DISPLAY_TOKEN_RE.test(token)) return { ok: false, reason: 'invalid' };
  const tokenHash = hashDisplayToken(token);
  const row = await prisma.settings.findUnique({ where: { key: wallDisplayKey(tokenHash) }, select: { value: true } });
  const v = row?.value as { dealerId?: unknown; displayId?: unknown } | null | undefined;
  if (!v || typeof v.dealerId !== 'string' || typeof v.displayId !== 'string') return { ok: false, reason: 'invalid' };
  const config = await readWallConfigStrict(v.dealerId);
  const display = config.displays.find((d) => d.id === v.displayId && d.tokenHash === tokenHash);
  if (!display) return { ok: false, reason: 'invalid' };
  if (display.revokedAt) return { ok: false, reason: 'revoked' };
  if (!displayIsActive(display, now)) return { ok: false, reason: 'expired' };
  return { ok: true, dealerId: v.dealerId, display, config };
}

/** Modül kapalıysa ekran da kapanır (menü gizleme yetmez — denetim Bulgu 6). */
export async function isWallModuleEnabled(): Promise<boolean> {
  try {
    const { assertModuleEnabled } = await import('@/lib/module-gate');
    return (await assertModuleEnabled('voc_wall', { routeKey: 'wall.display' })) === null;
  } catch (err) {
    console.error('[voc-wall] modül kapısı okunamadı:', err);
    return true;
  }
}
