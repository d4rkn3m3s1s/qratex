/**
 * Bayi Etki (ROI + iş sonuçları, b-kiyas-etki) — paylaşılan yanıt sözleşmesi.
 *
 * Eski `/dealer/roi` ve `/dealer/business-outcomes` tek ekranda birleşir. Sunucu sayıyı hesaplar
 * (yol haritası §4.4/7), istemci biçimler. Her hesap yöntemi `methods` ile açıkça döner ve
 * varsayımlar (geri dönüş penceresi, ortalama sepet) bayi tarafından düzenlenebilir; varsayılanlar
 * sunucudan gelir (§4.4/6).
 */
import type { MetricValue } from '@/components/ds/data/metric-format';
import type { CompareMode, DateRangePreset, DayRange } from '@/components/ds/page/date-range';

export const IMPACT_TZ = 'Europe/Istanbul' as const;

export const RETURN_WINDOWS = [14, 30, 60] as const;
export type ReturnWindow = (typeof RETURN_WINDOWS)[number];
export const DEFAULT_RETURN_WINDOW: ReturnWindow = 30;

/** Ortalama sepet (₺) üst sınırı — hatalı girişe karşı. */
export const MAX_BASKET_TRY = 100_000;

/** Bir oranın anlamlı sayılması için en az örneklem. */
export const IMPACT_MIN_SAMPLE = 10;
/** Kapanan döngü kıyası için her kolda en az müşteri. */
export const CLOSED_LOOP_MIN_ARM = 5;

export type GoalKey = 'replyRate' | 'medianReplyHours' | 'negativeShare' | 'returningRate' | 'recoveryRate';
export const GOAL_KEYS: readonly GoalKey[] = ['replyRate', 'medianReplyHours', 'negativeShare', 'returningRate', 'recoveryRate'];
/** Hedefin yönü: `up` → değer hedefe eşit/üstündeyse tuttu. */
export const GOAL_DIRECTION: Readonly<Record<GoalKey, 'up' | 'down'>> = {
  replyRate: 'up',
  medianReplyHours: 'down',
  negativeShare: 'down',
  returningRate: 'up',
  recoveryRate: 'up',
};

export type ImpactGoals = Partial<Record<GoalKey, number>>;

/** Bayinin kayıtlı Etki ayarları (Settings `dealer-impact:v1:{dealerId}`). */
export interface ImpactSettings {
  returnWindowDays: ReturnWindow;
  /** null → otomatik (dönemde kayıtlı tutarların ortalaması). */
  basketTry: number | null;
  goals: ImpactGoals;
  updatedAt: string | null;
}

export interface GoalProgress {
  key: GoalKey;
  target: number;
  /** Güncel değer (hedefle aynı birimde). */
  value: number | null;
  met: boolean | null;
}

export type ClosedLoopStatus = 'ok' | 'insufficient' | 'no_cohort';

export interface ClosedLoopArm {
  customers: number;
  returned: number;
  /** Yüzde; kolda örneklem < CLOSED_LOOP_MIN_ARM ise null. */
  rate: number | null;
}

export interface ClosedLoop {
  status: ClosedLoopStatus;
  windowDays: ReturnWindow;
  /**
   * Kohort: geri dönüş penceresi dönem içinde KAPANAN şikâyetler — tarihleri
   * [dönem başı − pencere, min(dönem sonu, şimdi) − pencere). Böylece her dönemin sonucu tam
   * gözlenmiş olur. Kohort boşsa null.
   */
  cohort: DayRange | null;
  replied: ClosedLoopArm;
  unreplied: ClosedLoopArm;
  /** Henüz pencere süresi dolmamış şikâyetçi sayısı (sonuç bekleniyor). */
  pending: number;
  /** Yanıtlananların geri dönüş oranı − yanıtlanmayanlarınki (yüzde puanı). */
  liftPoints: number | null;
  /** Geri dönen (yanıtlanmış) şikâyetçilerin pencere içinde KAYITLI harcaması (₺). */
  returnedRevenue: number;
  /** Fark × yanıtlanan şikâyetçi sayısı (tahmini ek ziyaret). */
  estimatedExtraVisits: number | null;
  /** Ek ziyaret × ortalama sepet (tahmini). */
  estimatedExtraRevenue: number | null;
}

export interface BasketAssumption {
  /** Hesapta kullanılan değer (₺) ya da null (tahmin yapılamıyor). */
  value: number | null;
  source: 'custom' | 'observed' | 'none';
  /** Dönemde tutarı girilmiş ziyaretlerin ortalaması. */
  observedAvg: number | null;
  /** Tutarı girilmiş ziyaretlerin oranı (%). */
  amountCoverage: number | null;
}

export interface ImpactKpis {
  returningRate: MetricValue;
  negativeShare: MetricValue;
  recoveryRate: MetricValue;
  revenue: MetricValue;
  replyRate: MetricValue;
  medianReply: MetricValue;
  actionsClosed: MetricValue;
}

export interface Workload {
  open: number;
  overdue: number;
  awaitingApproval: number;
  unrepliedNegative: number;
}

export interface TrendPoint {
  /** Hafta başı (Pazartesi, İstanbul günü). */
  week: string;
  feedback: number;
  replied: number;
  /** Kayıt yoksa null (0'a çakılmaz). */
  avgRating: number | null;
  negative: number;
  actionsClosed: number;
  visits: number;
  revenue: number;
}

export interface ImpactLocationRow {
  id: string | null;
  name: string | null;
  feedback: number;
  replyRate: number | null;
  medianReplySec: number | null;
  avgRating: number | null;
  negativeShare: number | null;
}

export type NextStepKind = 'unreplied_negative' | 'remedy_approval' | 'overdue_actions' | 'record_amounts' | 'set_goals';

export interface NextStep {
  kind: NextStepKind;
  count: number;
  href: string;
}

export interface ImpactQuery {
  preset: DateRangePreset;
  range: DayRange;
  compare: CompareMode;
  compareRange: DayRange | null;
}

export interface ImpactData {
  generatedAt: string;
  tz: typeof IMPACT_TZ;
  query: ImpactQuery;
  settings: ImpactSettings;
  assumptions: { windowDays: ReturnWindow; basket: BasketAssumption };
  closedLoop: ClosedLoop;
  kpis: ImpactKpis;
  goals: GoalProgress[];
  workload: Workload;
  trend: TrendPoint[];
  locations: ImpactLocationRow[];
  nextSteps: NextStep[];
  /** Bayinin hiç geri bildirimi ve ziyareti yok (kurulum boş durumu). */
  hasAnyData: boolean;
  /** ADMIN salt-okunur görüntüleme (ayar yazılamaz). */
  readOnly: boolean;
}

/** Varsayımlar sunucuda kayıtlıdır; kaydedince bu önek altındaki bütün sorgular tazelenir. */
export const IMPACT_QUERY_PREFIX = ['dealer-impact'] as const;

export function impactQueryKey(q: Pick<ImpactQuery, 'range' | 'compare'>): readonly unknown[] {
  return [...IMPACT_QUERY_PREFIX, q.range.from, q.range.to, q.compare] as const;
}
