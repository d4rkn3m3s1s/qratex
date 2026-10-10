/**
 * Yıkıcı işlem sözleşmesi — "silme = arşiv + etki önizlemesi" (P0-24…26, F0.6).
 *
 * Neden: rozet, ödül, plan, kart ve QR silme uçları `delete` çağırıyordu; şemadaki
 * `onDelete: Cascade` zinciri tek tıkla müşterinin puanla aldığı kupon kodlarını, kazanılmış
 * rozetleri, yorumları ve tüketim geçmişini geri dönüşsüz yok ediyordu. Artık:
 *
 *   1. Uç HİÇBİR ZAMAN hard delete yapmaz; kayıt `archivedAt` (+ `isActive=false`) ile arşivlenir.
 *   2. Kayda bağlı veri (kazanım, abone, tüketim…) varsa ve istek onay taşımıyorsa uç
 *      409 `CONFIRM_REQUIRED` + `impact` döner. İstemci bu önizlemeyi `ConfirmAction`
 *      (components/states) ile gösterir ve aynı isteği `?confirm=archive` ile tekrarlar.
 *   3. `?dryRun=1` → hiçbir şey yazılmadan 200 + `impact` (ConfirmAction `loadImpact`).
 *   4. Engelleyici durum varsa (aktif abonelik, karakter rozeti…) onay da işe yaramaz:
 *      409 `ARCHIVE_BLOCKED`.
 *
 * İstemci sözleşmesi (yanıt gövdesi):
 *   { success:false, ok:false, code:'CONFIRM_REQUIRED', error, message,
 *     impact:{ entity, entityId, entityLabel?, items:[{key,label,value,emphasis?}], warning?, blockers? },
 *     confirmWith:'confirm=archive' }
 */
import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export interface ImpactEntry {
  /** Makine anahtarı (ör. `earnedBy`, `subscribers`). */
  key: string;
  /** Kullanıcıya gösterilecek Türkçe etiket. */
  label: string;
  value: number;
  /** Vurgulanacak satır (kaybı/etkisi büyük olan). */
  emphasis?: boolean;
}

export interface DeletionImpact {
  entity: string;
  entityId: string;
  /** Onay ekranında ad yazdırmak için (ConfirmAction `confirmPhrase`). */
  entityLabel?: string | null;
  items: ImpactEntry[];
  /** Önizlemede gösterilecek ek uyarı. */
  warning?: string;
  /** Doluysa işlem onayla da yapılamaz (409 ARCHIVE_BLOCKED). */
  blockers?: string[];
}

export interface ArchiveIntent {
  /** İstek açık onay taşıyor mu (`?confirm=archive|1|true`). */
  confirmed: boolean;
  /** Yalnız önizleme (`?dryRun=1|true`). */
  dryRun: boolean;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'archive', 'anonymize', 'evet']);

function truthy(v: string | null | undefined): boolean {
  return typeof v === 'string' && TRUTHY.has(v.trim().toLowerCase());
}

/** URL sorgusundan (ve isteğe bağlı JSON gövde alanlarından) arşiv niyetini okur. */
export function readArchiveIntent(
  request: { url: string },
  body?: { confirm?: unknown; dryRun?: unknown } | null
): ArchiveIntent {
  const sp = new URL(request.url).searchParams;
  const bodyConfirm = body?.confirm === true || (typeof body?.confirm === 'string' && truthy(body.confirm));
  const bodyDry = body?.dryRun === true || (typeof body?.dryRun === 'string' && truthy(body.dryRun));
  return {
    confirmed: truthy(sp.get('confirm')) || bodyConfirm,
    dryRun: truthy(sp.get('dryRun')) || truthy(sp.get('preview')) || bodyDry,
  };
}

/** Etki satırlarının toplamı (0 → arşivlenecek kayda bağlı veri yok). */
export function impactTotal(impact: Pick<DeletionImpact, 'items'>): number {
  return impact.items.reduce((sum, i) => sum + (Number.isFinite(i.value) ? Math.max(0, i.value) : 0), 0);
}

export type ArchiveDecision = 'preview' | 'blocked' | 'confirm' | 'proceed';

/**
 * Tek karar noktası:
 *  - dryRun → preview
 *  - engelleyici var → blocked
 *  - bağlı veri var ve onay yok → confirm (409)
 *  - aksi hâlde → proceed
 */
export function decideArchive(impact: DeletionImpact, intent: ArchiveIntent): ArchiveDecision {
  if (intent.dryRun) return 'preview';
  if (impact.blockers && impact.blockers.length > 0) return 'blocked';
  if (impactTotal(impact) > 0 && !intent.confirmed) return 'confirm';
  return 'proceed';
}

function body(code: string, message: string, impact: DeletionImpact, extra: Record<string, unknown> = {}) {
  return { ok: false, success: false, code, error: message, message, impact, ...extra };
}

/** 200 — yalnız önizleme (yazım yok). */
export function impactPreviewResponse(impact: DeletionImpact): NextResponse {
  return NextResponse.json(
    { ok: true, success: true, dryRun: true, impact, requiresConfirm: impactTotal(impact) > 0, blocked: !!impact.blockers?.length },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/** 409 — bağlı veri var; istemci önizlemeyi gösterip `?confirm=archive` ile tekrar etmeli. */
export function confirmRequiredResponse(impact: DeletionImpact, message: string): NextResponse {
  return NextResponse.json(body('CONFIRM_REQUIRED', message, impact, { confirmWith: 'confirm=archive' }), {
    status: 409,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

/** 409 — işlem onayla da yapılamaz. */
export function archiveBlockedResponse(impact: DeletionImpact, message?: string): NextResponse {
  const msg = message ?? impact.blockers?.[0] ?? 'Bu kayıt şu an arşivlenemez.';
  return NextResponse.json(body('ARCHIVE_BLOCKED', msg, impact), { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
}

/**
 * Karar → yanıt. `proceed` için null döner (çağıran arşivi yürütür).
 *   const early = archiveGateResponse(impact, intent, 'Bu rozeti 12 kullanıcı kazanmış…');
 *   if (early) return early;
 */
export function archiveGateResponse(
  impact: DeletionImpact,
  intent: ArchiveIntent,
  confirmMessage: string
): NextResponse | null {
  switch (decideArchive(impact, intent)) {
    case 'preview':
      return impactPreviewResponse(impact);
    case 'blocked':
      return archiveBlockedResponse(impact);
    case 'confirm':
      return confirmRequiredResponse(impact, confirmMessage);
    default:
      return null;
  }
}

/** Liste uçlarında arşiv görünürlüğü: `?archived=only|include` (varsayılan: gizle). */
export function archivedListFilter(request: { url: string }): { archivedAt: null } | { archivedAt: { not: null } } | Record<string, never> {
  const v = new URL(request.url).searchParams.get('archived');
  if (v === 'only' || v === '1' || v === 'true') return { archivedAt: { not: null } };
  if (v === 'include' || v === 'all') return {};
  return { archivedAt: null };
}
