/**
 * Prompt ve Model Stüdyosu (/admin/ai/studio) — paylaşılan sözleşme (istemci + sunucu).
 *
 * Saf modül: Prisma / sunucu bağımlılığı YOK (istemci adası da içe aktarır, Jest doğrudan test eder).
 * Birleşen eski yüzeyler: /admin/ai-learning, /admin/ai-settings, /admin/modules/ai-tones.
 */
import { z } from 'zod';

// ───────────────────────────── Sekmeler ─────────────────────────────

export const STUDIO_TABS = ['promptlar', 'ogrenme', 'usluplar', 'bayiler', 'modeller', 'gecmis'] as const;
export type StudioTab = (typeof STUDIO_TABS)[number];

export function parseStudioTab(raw: unknown): StudioTab {
  return typeof raw === 'string' && (STUDIO_TABS as readonly string[]).includes(raw) ? (raw as StudioTab) : 'promptlar';
}

/** Eski rotalar → stüdyo sekmesi (kalıcı yönlendirme; sorgu parametreleri korunur). */
export function legacyStudioHref(tab: StudioTab, sp: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'tab') continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (typeof v === 'string') qs.append(k, v);
  }
  qs.set('tab', tab);
  return `/admin/ai/studio?${qs.toString()}`;
}

// ───────────────────────────── Ortak ─────────────────────────────

export interface ActorRef {
  id: string | null;
  name: string | null;
  email: string | null;
}

// ───────────────────────────── Promptlar (temel + yönetici notları) ─────────────────────────────

/** Kodda sabit, sürümlü temel promptlar — salt okunur; DB'den gelen hiçbir metin bunların yerine geçmez. */
export interface BasePromptView {
  key: 'analysis' | 'chat' | 'autoReply';
  title: string;
  version: string;
  text: string;
  usedBy: string[];
}

export const NOTE_KEYS = ['system', 'chat'] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];

/**
 * Notların gerçekte kullanıldığı tavan (lib/ai-engine `buildLearnedSystemContext`):
 * sistem notu 600, sohbet notu `CONTEXT_LIMITS.adminChatContext` (1200) karakterde kesilir.
 * Sözleşme bu sınırı aşan metni baştan reddeder; "kaydedildi ama sessizce kesildi" olmaz.
 */
export const NOTE_LIMITS: Record<NoteKey, number> = { system: 600, chat: 1_200 };

export const NOTE_META: Record<NoteKey, { title: string; usedBy: string[]; description: string }> = {
  system: {
    title: 'Analiz ve rapor notu',
    description: 'Yönetici AI asistanında (AI Operasyon Merkezi), onaylı öğrenilmiş kurallarla birlikte sınırlı ek bağlam olarak eklenir. Bayi yüzeyleri (içgörü anlatısı, AI Asistan) yalnız kendi verisinden beslenir; platform notu oraya taşınmaz.',
    usedBy: ['Yönetici AI asistanı (askAI)'],
  },
  chat: {
    title: 'Sohbet notu',
    description: 'Yalnız AI sohbet çağrılarına "yönetici sohbet notları" bloğu olarak eklenir; temel sohbet promptunun yerine geçmez.',
    usedBy: ['Yönetici AI asistanı (askAI)'],
  },
};

export type NoteVersionStatus = 'draft' | 'published' | 'superseded' | 'discarded';

export interface NoteVersion {
  id: string;
  key: NoteKey;
  /** null → notu kaldır (yayınlanınca ek bağlam boşalır). */
  body: string | null;
  /** Değişiklik gerekçesi (zorunlu). */
  note: string;
  status: NoteVersionStatus;
  createdAt: string;
  createdBy: ActorRef;
  publishedAt: string | null;
  publishedBy: ActorRef | null;
  /** Taslağın türetildiği sürüm (geri yükleme ya da düzenleme). */
  basedOn: string | null;
}

export interface NoteState {
  key: NoteKey;
  limit: number;
  /** Şu an prompt kurucunun okuduğu metin (yalnız `adminPromptsEditedAt` damgalıysa etkilidir). */
  live: string | null;
  /** Kolondaki metin damgasız (eski LLM yazımı) ise kullanılmaz — dürüstçe gösterilir. */
  liveIneffective: boolean;
  versions: NoteVersion[];
}

export interface PromptsState {
  base: BasePromptView[];
  notes: NoteState[];
  /** İyimser kilit: sürüm deposunun (Settings) sürümü. */
  version: string;
}

const reasonText = z.string().trim().min(3, 'Gerekçe en az 3 karakter olmalı').max(200, 'Gerekçe en çok 200 karakter olabilir');

export const noteDraftSchema = z
  .object({
    key: z.enum(NOTE_KEYS),
    body: z.string().max(5_000).nullable(),
    note: reasonText,
    basedOn: z.string().max(64).nullable().optional(),
    baseVersion: z.string().min(1).max(128),
  })
  .strict()
  .superRefine((v, ctx) => {
    const body = v.body?.trim() ?? '';
    if (body.length > NOTE_LIMITS[v.key]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: `Bu not en çok ${NOTE_LIMITS[v.key]} karakter olabilir (fazlası modele hiç ulaşmaz).` });
    }
  })
  .transform((v) => ({ ...v, body: v.body && v.body.trim().length > 0 ? v.body.trim() : null, basedOn: v.basedOn ?? null }));
export type NoteDraftInput = z.input<typeof noteDraftSchema>;

export const noteActionSchema = z
  .object({ action: z.enum(['publish', 'discard']), baseVersion: z.string().min(1).max(128) })
  .strict();

export const notePreviewSchema = z
  .object({ system: z.string().max(5_000).nullable(), chat: z.string().max(5_000).nullable() })
  .strict();

export interface NotePreviewResult {
  /** Analiz/içgörü yoluna giden ek blok (sohbet notu hariç). */
  insightBlock: string;
  /** Sohbet yoluna giden ek blok (sohbet notu dahil). */
  chatBlock: string;
}

// ───────────────────────────── Öğrenme (sistem önerisi + onay) ─────────────────────────────

export interface LearnedPayloadView {
  learnedRules: string[];
  learnedThemes: Array<{ theme: string; priority: 'high' | 'medium' | 'low'; count?: number }>;
  responseGuidelines: { do: string[]; avoid: string[] };
  promptAppendix: string | null;
}

export interface ListDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface LearnedDiffView {
  learnedRules: ListDiff;
  learnedThemes: ListDiff;
  guidelinesDo: ListDiff;
  guidelinesAvoid: ListDiff;
  promptAppendix: { before: string | null; after: string | null; changed: boolean };
}

export interface LearningHistoryEntry {
  index: number;
  approvedAt: string | null;
  approvedBy: ActorRef | null;
  proposalId: string | null;
  payload: LearnedPayloadView;
}

export interface LearningState {
  status: 'idle' | 'training' | 'ready' | 'unknown';
  /** Eğitim kilidi tutuluyorsa başlangıç zamanı (5 dk sonra bayat sayılır). */
  trainingSince: string | null;
  version: number;
  lastTrainedAt: string | null;
  approval: { approvedAt: string; approvedBy: ActorRef | null; proposalId: string | null } | null;
  active: LearnedPayloadView | null;
  proposal: (LearnedPayloadView & { id: string; createdAt: string; model: string; promptVersion: string; source: 'training' | 'restore'; trainingDataStats: Record<string, unknown> }) | null;
  diff: LearnedDiffView | null;
  lastRejected: { proposalId: string; rejectedAt: string; rejectedBy: ActorRef | null; reason: string | null } | null;
  history: LearningHistoryEntry[];
  /** Eğitim girdisi kapsamı — sayılar platform geneli, sunucudan. */
  data: { feedbackWithText: number; corrections: number; dealers: number; embeddings: number };
  /** Sunucu eşiği: bu kadar metinli geri bildirim olmadan eğitim başlamaz. */
  minFeedback: number;
  aiConfigured: boolean;
}

export const MIN_SYSTEM_TRAINING_FEEDBACK = 20;
export const TRAINING_LOCK_STALE_MS = 5 * 60_000;

export const proposalDecisionSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    proposalId: z.string().min(1).max(64),
    reason: z.string().trim().max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action === 'reject' && (!v.reason || v.reason.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Reddetme gerekçesi en az 3 karakter olmalı' });
    }
  });

export const restoreHistorySchema = z
  .object({ index: z.number().int().min(0).max(20), expectedVersion: z.number().int().min(0) })
  .strict();

// ───────────────────────────── Üsluplar ─────────────────────────────

/**
 * Kodda tanımlı yerleşik üslup aileleri (lib/ai-engine FALLBACK_TONE_MAP ile aynı; test eşitliği doğrular).
 * DB kaydı yoksa bu ailenin kısa tarifi kullanılır; bayi seçicisi YALNIZ aktif DB kayıtlarını listeler.
 */
export const BUILTIN_TONES: ReadonlyArray<{ slug: string; name: string; descriptor: string }> = [
  { slug: 'formal', name: 'Resmi', descriptor: 'Resmi, kurumsal ve nazik' },
  { slug: 'friendly', name: 'Samimi', descriptor: 'Samimi, sıcak ve arkadaş canlısı' },
  { slug: 'humorous', name: 'Esprili', descriptor: 'Esprili, enerjik ve eğlenceli' },
  { slug: 'professional', name: 'Profesyonel', descriptor: 'Profesyonel, çözüm odaklı ve ciddi' },
];

/** Üslup promptunun modele ulaşan tavanı (buildAutoReplySystemPrompt → sanitizeContextText(…, 600)). */
export const TONE_PROMPT_MAX = 600;
export const TONE_PROMPT_MIN = 20;
export const TONE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export type ToneSource = 'builtin' | 'override' | 'custom';

export interface ToneRow {
  /** DB kimliği; yerleşik ve henüz etkinleştirilmemişse null. */
  id: string | null;
  slug: string;
  name: string;
  systemPrompt: string | null;
  isActive: boolean;
  source: ToneSource;
  /** Yerleşik aile tarifi (custom'da null → "professional" ailesine düşer). */
  descriptor: string | null;
  /** Bu üslubu kullanan aktif/pasif otomatik yanıt kuralı ve bayi sayısı. */
  usage: { rules: number; activeRules: number; dealers: number };
  updatedAt: string | null;
  version: string | null;
}

export interface TonesState {
  tones: ToneRow[];
  /** Kurallarda geçen ama katalogda (aktif DB kaydı) olmayan slug'lar — bu kurallar AI üslubu yerine şablona/varsayılana düşer. */
  orphanSlugs: Array<{ slug: string; rules: number }>;
}

const toneName = z.string().trim().min(2, 'Ad en az 2 karakter olmalı').max(60, 'Ad en çok 60 karakter olabilir');
const tonePrompt = z
  .string()
  .trim()
  .min(TONE_PROMPT_MIN, `Üslup talimatı en az ${TONE_PROMPT_MIN} karakter olmalı`)
  .max(TONE_PROMPT_MAX, `Üslup talimatı en çok ${TONE_PROMPT_MAX} karakter olabilir (fazlası modele ulaşmaz)`);

export const toneCreateSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(TONE_SLUG_RE, 'Anahtar yalnız küçük harf, rakam ve tire içerebilir (2–40 karakter)').min(2).max(40),
    name: toneName,
    systemPrompt: tonePrompt,
    reason: reasonText,
  })
  .strict();

export const toneUpdateSchema = z
  .object({ name: toneName.optional(), systemPrompt: tonePrompt.optional(), reason: reasonText, expectedVersion: z.string().min(1).max(128) })
  .strict()
  .refine((v) => v.name !== undefined || v.systemPrompt !== undefined, { message: 'Değişiklik yok', path: ['name'] });

export const toneStatusSchema = z
  .object({ active: z.boolean(), reason: reasonText, expectedVersion: z.string().min(1).max(128) })
  .strict();

export const tonePreviewSchema = z
  .object({
    slug: z.string().trim().max(40),
    systemPrompt: z.string().trim().max(TONE_PROMPT_MAX).nullable(),
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().min(5, 'Örnek yorum en az 5 karakter olmalı').max(600),
  })
  .strict();

export interface TonePreviewResult {
  reply: string | null;
  /** Gönderilen sistem mesajı (tam, değiştirilmeden) — admin neyin gittiğini görür. */
  systemPrompt: string;
  model: string | null;
  /** reply null ise neden. */
  reason: 'unconfigured' | 'blocked' | null;
}

export interface ToneHistoryEntry {
  id: string;
  action: string;
  at: string;
  actor: ActorRef | null;
  reason: string | null;
  before: { name?: string; systemPrompt?: string; isActive?: boolean } | null;
  after: { name?: string; systemPrompt?: string; isActive?: boolean } | null;
}

// ───────────────────────────── Bayiler (AI politikası + öğrenme profili) ─────────────────────────────

export const DEALER_FILTERS = ['all', 'ai_off', 'auto_off', 'custom_prompt', 'with_profile', 'no_profile'] as const;
export type DealerFilter = (typeof DEALER_FILTERS)[number];

export const dealerListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  filter: z.enum(DEALER_FILTERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  size: z.coerce.number().int().min(10).max(50).optional().catch(undefined),
});
export type DealerListQuery = z.infer<typeof dealerListQuerySchema>;

/** Bayi listesi sorgu dizesi (istemci ve sunucu ön yüklemesi aynı anahtarı üretir). */
export function buildDealerQs(p: { q?: string; filter?: string; page?: number; size?: number }): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set('q', p.q);
  if (p.filter && p.filter !== 'all') qs.set('filter', p.filter);
  if (p.page && p.page > 1) qs.set('page', String(p.page));
  if (p.size && p.size !== 20) qs.set('size', String(p.size));
  return qs.toString();
}

export interface DealerPolicyView {
  isEnabled: boolean;
  autoAnalyze: boolean;
  alertOnToxic: boolean;
  alertOnUrgent: boolean;
  alertOnChurnRisk: boolean;
  weeklyReportEnabled: boolean;
  customPrompt: string | null;
  version: string;
  isDefault: boolean;
}

export interface DealerRow {
  id: string;
  name: string;
  email: string | null;
  policy: Pick<DealerPolicyView, 'isEnabled' | 'autoAnalyze' | 'isDefault'> & { hasCustomPrompt: boolean };
  profile: { version: number; status: string; lastTrainedAt: string | null } | null;
}

export interface DealerListPage {
  items: DealerRow[];
  total: number;
  page: number;
  size: number;
}

export interface DealerProfileView {
  version: number;
  status: string;
  lastTrainedAt: string | null;
  trainingFeedbackCount: number;
  correctionsUsed: number;
  businessContext: { sector: string | null; keyTerms: string[] };
  themes: Array<{ theme: string; priority: string; note: string | null }>;
  entities: Array<{ alias: string; canonical: string; type: string }>;
  risks: Array<{ pattern: string; action: string }>;
  guidelines: { do: string[]; avoid: string[] };
}

export interface DealerDetail {
  id: string;
  name: string;
  email: string | null;
  policy: DealerPolicyView;
  profile: DealerProfileView | null;
  retrain: { shouldRetrain: boolean; reason: string | null; newFeedbackCount: number; newCorrectionsCount: number };
  corrections: Array<{ id: string; field: string; oldValue: string; newValue: string; note: string | null; at: string }>;
  usage7d: { calls: number; failures: number; tokens: number };
  /** Profil yenileme sunucu eşiği. */
  minFeedbackForProfile: number;
  feedbackWithText: number;
}

export const DEALER_PROFILE_MIN_FEEDBACK = 5;

export const DEALER_AI_CONTEXT_MAX = 1_000;

export const dealerPolicyPatchSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    autoAnalyze: z.boolean().optional(),
    alertOnToxic: z.boolean().optional(),
    alertOnUrgent: z.boolean().optional(),
    alertOnChurnRisk: z.boolean().optional(),
    weeklyReportEnabled: z.boolean().optional(),
    customPrompt: z.string().trim().max(DEALER_AI_CONTEXT_MAX, `İşletme bağlamı en çok ${DEALER_AI_CONTEXT_MAX} karakter olabilir`).nullable().optional(),
    reason: reasonText,
    baseVersion: z.string().min(1).max(128),
  })
  .strict()
  .transform((v) => ({ ...v, customPrompt: v.customPrompt === undefined ? undefined : v.customPrompt && v.customPrompt.length > 0 ? v.customPrompt : null }));
export type DealerPolicyPatch = z.output<typeof dealerPolicyPatchSchema>;

export const POLICY_FIELDS = ['isEnabled', 'autoAnalyze', 'alertOnToxic', 'alertOnUrgent', 'alertOnChurnRisk', 'weeklyReportEnabled', 'customPrompt'] as const;

export const POLICY_FIELD_LABELS: Record<(typeof POLICY_FIELDS)[number], string> = {
  isEnabled: 'AI ana anahtarı',
  autoAnalyze: 'Otomatik analiz',
  alertOnToxic: 'Toksik içerik bildirimi',
  alertOnUrgent: 'Acil geri bildirim bildirimi',
  alertOnChurnRisk: 'Kayıp riski bildirimi',
  weeklyReportEnabled: 'Haftalık özet e-postası',
  customPrompt: 'İşletme bağlamı',
};

// ───────────────────────────── Modeller ─────────────────────────────

export const MODEL_SLOTS = ['volume', 'dealerLearning', 'systemLearning'] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];

export const MODEL_SLOT_META: Record<ModelSlot, { title: string; description: string }> = {
  volume: {
    title: 'Hacim modeli',
    description: 'Geri bildirim analizi, içgörü ve haftalık özet anlatıları, otomatik yanıt, yönetici asistanı, konsey ve ekip AI bu modelle çalışır.',
  },
  dealerLearning: {
    title: 'Bayi öğrenme modeli',
    description: 'Bayi adaptif profilinin (temalar, terimler, yap/kaçın) çıkarılması.',
  },
  systemLearning: {
    title: 'Sistem öğrenme modeli',
    description: 'Platform geneli anonim öğrenme önerisi (onay bekleyen kurallar).',
  },
};

export type AiProvider = 'groq' | 'openai' | 'none';

export const MODEL_CATALOG: Record<Exclude<AiProvider, 'none'>, ReadonlyArray<{ id: string; label: string; note: string }>> = {
  groq: [
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', note: 'Hacim varsayılanı; hızlı, JSON uyumu iyi. (Llama 3.1 8B Groq listesinden kalktı.)' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', note: 'En yüksek kalite ve katı JSON; ücretsiz katmanda günlük istek kotası düşük.' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Düşük maliyet, iyi JSON uyumu.' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', note: 'Daha güçlü akıl yürütme, orta maliyet.' },
    { id: 'gpt-4o', label: 'GPT-4o', note: 'Yüksek kalite, yüksek maliyet.' },
  ],
};

export function isAllowedModel(provider: AiProvider, model: string): boolean {
  if (provider === 'none') return false;
  return MODEL_CATALOG[provider].some((m) => m.id === model);
}

export type ModelRouting = Partial<Record<ModelSlot, string | null>>;

export interface ModelSlotState {
  slot: ModelSlot;
  /** Çağrılarda gerçekten kullanılan model. */
  effective: string | null;
  source: 'override' | 'env' | 'default' | 'none';
  /** Yönetici seçimi (geçersizse yok sayılır ve `overrideIgnored` true olur). */
  override: string | null;
  overrideIgnored: boolean;
  envDefault: string | null;
}

export interface ModelUsageRow {
  model: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number | null;
}

export interface ModelsState {
  provider: AiProvider;
  slots: ModelSlotState[];
  catalog: ReadonlyArray<{ id: string; label: string; note: string }>;
  usage7d: ModelUsageRow[];
  version: string;
}

export const modelRoutingSchema = z
  .object({
    routing: z.object({
      volume: z.string().trim().max(80).nullable().optional(),
      dealerLearning: z.string().trim().max(80).nullable().optional(),
      systemLearning: z.string().trim().max(80).nullable().optional(),
    }).strict(),
    reason: reasonText,
    baseVersion: z.string().min(1).max(128),
  })
  .strict();

// ───────────────────────────── Genel bakış + geçmiş ─────────────────────────────

export interface StudioOverview {
  dealers: number;
  aiOff: number;
  customPrompts: number;
  profiles: number;
  pendingProposal: boolean;
  activeTones: number;
  calls7d: number;
  failures7d: number;
  provider: AiProvider;
}

export const STUDIO_AUDIT_ENTITIES = ['AIPromptNote', 'AISystemLearning', 'AITone', 'AISettings', 'AIModelRouting', 'AIDealerLearningProfile'] as const;

export const historyQuerySchema = z.object({
  entity: z.enum(STUDIO_AUDIT_ENTITIES).optional().catch(undefined),
  cursor: z.string().max(64).optional().catch(undefined),
});

export interface StudioAuditEntry {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: ActorRef | null;
  summary: string;
}

export interface StudioAuditPage {
  items: StudioAuditEntry[];
  nextCursor: string | null;
}

// ───────────────────────────── Satır farkı (saf) ─────────────────────────────

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string };

/**
 * Satır bazlı LCS farkı. Promptlar ≤ birkaç bin karakter olduğundan O(n·m) yeterli;
 * güvenlik için 400×400 satırı aşan girdide kaba fark (tümü sil + tümü ekle) döner.
 */
export function lineDiff(before: string | null | undefined, after: string | null | undefined): DiffLine[] {
  const a = (before ?? '').split('\n');
  const b = (after ?? '').split('\n');
  if (before == null || before === '') a.length = 0;
  if (after == null || after === '') b.length = 0;
  const n = a.length;
  const m = b.length;
  if (n > 400 || m > 400) {
    return [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i++] });
    } else {
      out.push({ type: 'add', text: b[j++] });
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] });
  while (j < m) out.push({ type: 'add', text: b[j++] });
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === 'add') added++;
    else if (l.type === 'del') removed++;
  }
  return { added, removed };
}
