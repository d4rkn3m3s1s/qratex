/**
 * Ajan Konseyi (/admin/agent-council) — istemci ve sunucunun ortak sözleşmesi.
 * Prisma içermez; hem BFF uçları hem istemci adası bu dosyayı içe aktarır.
 *
 * Yaşam döngüsü (AgentRun.status): running → completed | failed | cancelled; arşiv = 'archived'
 * (önceki durum context.statusBeforeArchive'da tutulur, silme yok).
 */
import { z } from 'zod';

// ───────────────────────────── Ajanlar ─────────────────────────────

/** DB'de saklanan kararlı anahtarlar (eski kayıtlarla uyum için 'Grok' anahtarı korunur; görünen ad "Kaptan"). */
export const COUNCIL_AGENTS = ['Harper', 'Benjamin', 'Lucas', 'Grok'] as const;
export type CouncilAgent = (typeof COUNCIL_AGENTS)[number];
export const SPECIALISTS = ['Harper', 'Benjamin', 'Lucas'] as const;
export type Specialist = (typeof SPECIALISTS)[number];
export const CAPTAIN: CouncilAgent = 'Grok';

export type AgentTone = 'info' | 'brand' | 'success' | 'warning';

export interface AgentProfile {
  key: CouncilAgent;
  name: string;
  role: string;
  focus: string;
  brief: string;
  tone: AgentTone;
  initial: string;
}

export const AGENT_PROFILES: Record<CouncilAgent, AgentProfile> = {
  Harper: {
    key: 'Harper',
    name: 'Harper',
    role: 'Veri',
    focus: 'Konseye verilen platform metrikleri, oranlar, eğilim ve belirsizlik',
    brief:
      'Yalnızca sana verilen veri paketine dayan; pakette olmayan sayıyı UYDURMA, eksik veriyi açıkça söyle. Kullandığın metriği adıyla an.',
    tone: 'info',
    initial: 'H',
  },
  Benjamin: {
    key: 'Benjamin',
    name: 'Benjamin',
    role: 'Mantık',
    focus: 'Tutarlılık, kenar durumlar, başarı ve başarısızlık ölçütü, bağımlılıklar',
    brief: 'Çıkarımların tutarlılığını denetle; çelişkiyi, kenar durumu ve ölçülebilir başarı ölçütünü ortaya koy.',
    tone: 'brand',
    initial: 'B',
  },
  Lucas: {
    key: 'Lucas',
    name: 'Lucas',
    role: 'Denge',
    focus: 'Karşı senaryo, kör noktalar, kullanıcı algısı ve yan etkiler',
    brief: 'Çoğunluğun atladığı riski, karşı senaryoyu ve kullanıcı üzerindeki yan etkiyi savun.',
    tone: 'success',
    initial: 'L',
  },
  Grok: {
    key: 'Grok',
    name: 'Kaptan',
    role: 'Sentez',
    focus: 'Tartışmayı yönetir, çatışmayı çözer, tek uygulanabilir karar çıkarır',
    brief: 'Moderatörsün: uzmanların bu turdaki görüşlerini karşılaştır, açık kalan soruyu ve bir sonraki turun odağını belirt.',
    tone: 'warning',
    initial: 'K',
  },
};

export function agentLabel(key: string): string {
  const p = AGENT_PROFILES[key as CouncilAgent];
  return p ? `${p.name} · ${p.role}` : key;
}

// ───────────────────────────── Ayarlar ─────────────────────────────

export const COUNCIL_CONFIG_KEY = 'agent_council_config';

export const councilConfigSchema = z.object({
  /** Sentezden önceki tartışma turu sayısı. */
  rounds: z.number().int().min(1).max(3),
  /** Hangi uzmanlar konuşur (Kaptan her zaman açık). En az bir uzman. */
  specialists: z
    .array(z.enum(SPECIALISTS))
    .min(1, 'En az bir uzman açık olmalı.')
    .max(3)
    .transform((a) => SPECIALISTS.filter((s) => a.includes(s))),
  /** Oturum başında platform/bayi verisi paketlenip uzmanlara verilsin mi. */
  includeData: z.boolean(),
  /** Tüm ajanların istemine eklenen kurum talimatı (ör. "Kararlarda bayi maliyetini öncele"). */
  guidance: z.string().trim().max(500),
});
export type CouncilConfig = z.infer<typeof councilConfigSchema>;

export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = {
  rounds: 2,
  specialists: ['Harper', 'Benjamin', 'Lucas'],
  includeData: true,
  guidance: '',
};

export const configPutSchema = z.object({
  config: councilConfigSchema,
  /** İyimser kilit: okunan sürüm (null = daha önce hiç kaydedilmemiş). */
  expectedUpdatedAt: z.string().datetime().nullable(),
});

export interface CouncilConfigState {
  config: CouncilConfig;
  updatedAt: string | null;
  /** Kayıtlı değer bozuksa varsayılana düşüldü (UI uyarır). */
  recovered: boolean;
}

export interface CouncilConfigHistoryItem {
  id: string;
  at: string;
  actorName: string | null;
  before: CouncilConfig | null;
  after: CouncilConfig | null;
}

export interface AiProviderInfo {
  configured: boolean;
  provider: string;
  model: string | null;
}

export interface CouncilSettingsPayload extends CouncilConfigState {
  ai: AiProviderInfo;
  history: CouncilConfigHistoryItem[];
  /** Son 90 günde tamamlanan oturumlarda kazanan dağılımı (gerçek kayıtlardan). */
  winners: Array<{ agent: string; count: number }>;
  completed90d: number;
}

/** Bir oturumun toplam LLM çağrı sayısı (tur × (uzman + kaptan) + sentez). */
export function plannedCalls(config: Pick<CouncilConfig, 'rounds' | 'specialists'>): number {
  return config.rounds * (config.specialists.length + 1) + 1;
}

// ───────────────────────────── Oturum ─────────────────────────────

export const SESSION_STATUSES = ['running', 'completed', 'failed', 'cancelled', 'archived'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('platform') }),
  z.object({ kind: z.literal('dealer'), dealerId: z.string().trim().min(1).max(64) }),
]);
export type ScopeInput = z.infer<typeof scopeSchema>;

export type SessionScope = { kind: 'platform' } | { kind: 'dealer'; dealerId: string; dealerName: string };

export const TOPIC_MIN = 10;
export const TOPIC_MAX = 500;

export const createSessionSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(TOPIC_MIN, `Soru en az ${TOPIC_MIN} karakter olmalı.`)
    .max(TOPIC_MAX, `Soru en fazla ${TOPIC_MAX} karakter olabilir.`),
  scope: scopeSchema,
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const sessionActionSchema = z.object({
  action: z.enum(['cancel', 'archive', 'unarchive']),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'running', 'completed', 'failed', 'cancelled', 'archived']).default('all'),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface DataMetric {
  key: string;
  label: string;
  value: number;
  unit?: '%' | '/5' | 'adet';
}

export interface DataPack {
  scopeLabel: string;
  windowDays: number;
  generatedAt: string;
  metrics: DataMetric[];
}

export interface SessionMessage {
  id: string;
  round: number;
  agent: string;
  kind: 'turn' | 'moderation' | 'synthesis' | 'legacy';
  content: string;
  model: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

export interface DecisionAction {
  key: string;
  title: string;
  detail: string;
  priority: Priority;
}

export interface SessionDecision {
  answer: string;
  winner: string;
  winnerRationale: string;
  confidence: number | null;
  dissent: string[];
  actions: DecisionAction[];
}

export interface PublishedRecord {
  actionKey: string;
  actionItemId: string;
  dealerId: string;
  dealerName: string;
  title: string;
  at: string;
  byName: string | null;
  /** ActionItem'ın güncel durumu (okuma anında). null = kayıt artık yok. */
  status: string | null;
}

export interface SessionSummary {
  id: string;
  topic: string;
  status: SessionStatus;
  statusBeforeArchive: SessionStatus | null;
  scope: SessionScope | null;
  winner: string | null;
  confidence: number | null;
  createdAt: string;
  createdByName: string | null;
  legacy: boolean;
  publishedCount: number;
}

export interface SessionDetail extends SessionSummary {
  updatedAt: string;
  config: CouncilConfig | null;
  dataPack: DataPack | null;
  messages: SessionMessage[];
  decision: SessionDecision | null;
  /** Tamamlanan tartışma turu (0..rounds); sentez ayrı. */
  completedRounds: number;
  plannedRounds: number;
  /** Sıradaki adım: tur numarası ya da 'synthesis'; bitmişse null. */
  nextStep: number | 'synthesis' | null;
  lastError: { message: string; at: string } | null;
  /** Bir adım şu an sunucuda sürüyor (başka sekme/oturum). */
  stepInFlight: boolean;
  published: PublishedRecord[];
  models: string[];
  callCount: number;
}

export interface SessionPage {
  items: SessionSummary[];
  nextCursor: string | null;
  counts: Record<SessionStatus, number>;
}

export const publishSchema = z.object({
  dealerId: z.string().trim().min(1).max(64),
  dueInDays: z.number().int().min(1).max(60),
  actions: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(16),
        title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(200),
        detail: z.string().trim().max(1000),
        priority: z.enum(PRIORITIES),
      })
    )
    .min(1, 'En az bir aksiyon seçin.')
    .max(8),
});
export type PublishInput = z.infer<typeof publishSchema>;

export interface PublishResult {
  created: number;
  skipped: string[];
  detail: SessionDetail;
}

export interface DealerOption {
  id: string;
  label: string;
  secondary: string | null;
}

// ───────────────────────────── Sentez çıktısı ─────────────────────────────

/** LLM'in sentez JSON'u. Esnek okunur, sıkı doğrulanır. */
export const synthesisSchema = z.object({
  answer: z.string().trim().min(20).max(4000),
  winner: z.enum(COUNCIL_AGENTS),
  winnerRationale: z.string().trim().min(5).max(800),
  confidence: z.number().min(0).max(100),
  dissent: z.array(z.string().trim().min(3).max(400)).max(5).default([]),
  actions: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(200),
        detail: z.string().trim().max(1000).default(''),
        priority: z.enum(PRIORITIES).catch('medium'),
      })
    )
    .min(1)
    .max(6),
});

/** Ham LLM metnini sentez kararına çevirir; geçersizse null (çağıran açık hata verir, şablon YOK). */
export function parseSynthesis(raw: string, allowedWinners: readonly string[]): SessionDecision | null {
  let json: unknown;
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (typeof o.confidence === 'string') o.confidence = Number(String(o.confidence).replace('%', '').replace(',', '.'));
  }
  const parsed = synthesisSchema.safeParse(json);
  if (!parsed.success) return null;
  const d = parsed.data;
  if (!allowedWinners.includes(d.winner)) return null;
  const confidence = d.confidence > 1 ? d.confidence / 100 : d.confidence;
  return {
    answer: d.answer,
    winner: d.winner,
    winnerRationale: d.winnerRationale,
    confidence: Math.round(confidence * 100) / 100,
    dissent: d.dissent,
    actions: d.actions.map((a, i) => ({ key: `a${i}`, title: a.title, detail: a.detail, priority: a.priority })),
  };
}

/**
 * Karar metninde geçen ama veri paketinde OLMAYAN metrik anahtarlarını döndürür (halüsinasyon bekçisi).
 * Metrik anahtarları snake_case'tir (ör. negatif_oran_30g); metinde bu biçimde geçen her belirteç
 * paketteki anahtarlardan biri olmalı. Paket yoksa (veri kapalı) hiçbir metrik anahtarına izin yok.
 */
export function unknownMetricRefs(decision: SessionDecision, pack: DataPack | null): string[] {
  const allowed = new Set((pack?.metrics ?? []).map((m) => m.key.toLowerCase()));
  const text = [
    decision.answer,
    decision.winnerRationale,
    ...decision.dissent,
    ...decision.actions.flatMap((a) => [a.title, a.detail]),
  ].join('\n');
  const found = new Set<string>();
  for (const m of text.matchAll(/(?<![\p{L}\p{N}_])[a-zçğıöşü][a-z0-9çğıöşü]*(?:_[a-z0-9çğıöşü]+)+(?![\p{L}\p{N}_])/gu)) {
    const k = m[0].toLowerCase();
    if (!allowed.has(k)) found.add(k);
  }
  return [...found];
}

// ───────────────────────────── Dışa aktarım ─────────────────────────────

export const STATUS_LABEL: Record<SessionStatus, string> = {
  running: 'Sürüyor',
  completed: 'Tamamlandı',
  failed: 'Başarısız',
  cancelled: 'Sonlandırıldı',
  archived: 'Arşivde',
};

const ISTANBUL_FMT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatIstanbul(iso: string): string {
  return ISTANBUL_FMT.format(new Date(iso));
}

export function scopeLabel(scope: SessionScope | null): string {
  if (!scope) return 'Kapsam yok';
  return scope.kind === 'platform' ? 'Tüm platform' : `Bayi: ${scope.dealerName}`;
}

/** Oturumu Markdown'a çevirir (kopyala / indir). Yalnız kayıtlı veriden. */
export function sessionToMarkdown(s: SessionDetail): string {
  const lines: string[] = [];
  lines.push(`# Ajan Konseyi: ${s.topic}`, '');
  lines.push(`- Durum: ${STATUS_LABEL[s.status]}`);
  lines.push(`- Kapsam: ${scopeLabel(s.scope)}`);
  lines.push(`- Başlatan: ${s.createdByName ?? 'bilinmiyor'} · ${formatIstanbul(s.createdAt)} (İstanbul)`);
  if (s.models.length) lines.push(`- Model: ${s.models.join(', ')} · ${s.callCount} çağrı`);
  lines.push('');
  if (s.dataPack) {
    lines.push(`## Konseyin gördüğü veri (${s.dataPack.scopeLabel}, son ${s.dataPack.windowDays} gün)`, '');
    for (const m of s.dataPack.metrics) lines.push(`- ${m.label}: ${m.value}${m.unit && m.unit !== 'adet' ? m.unit : ''}`);
    lines.push('');
  }
  if (s.decision) {
    const d = s.decision;
    lines.push('## Karar', '', d.answer, '');
    lines.push(
      `**Öne çıkan görüş:** ${agentLabel(d.winner)}${d.confidence != null ? ` · güven %${Math.round(d.confidence * 100)}` : ''}`,
      '',
      d.winnerRationale,
      ''
    );
    if (d.dissent.length) {
      lines.push('### Karşı görüşler ve riskler', '');
      for (const x of d.dissent) lines.push(`- ${x}`);
      lines.push('');
    }
    lines.push('### Aksiyonlar', '');
    for (const a of d.actions) lines.push(`- [${PRIORITY_LABEL[a.priority]}] ${a.title}${a.detail ? `: ${a.detail}` : ''}`);
    lines.push('');
  }
  lines.push('## Tartışma', '');
  let round = -1;
  for (const m of s.messages) {
    if (m.round !== round) {
      round = m.round;
      lines.push(m.kind === 'synthesis' ? '### Sentez' : `### Tur ${m.round}`, '');
    }
    lines.push(`**${agentLabel(m.agent)}:** ${m.content}`, '');
  }
  return lines.join('\n');
}
