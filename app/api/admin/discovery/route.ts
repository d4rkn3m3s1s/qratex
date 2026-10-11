/**
 * GET /api/admin/discovery — canlı keşif ayarı + sürüm + ayarda geçen işletmelerin adları.
 *   Okuma hatası 500 (istemci formu açmaz — P0-28; "boş config ile kaydet" imkânsız).
 * PUT /api/admin/discovery — gerçek zod şeması (lib/admin-discovery/contract.ts), işletme
 *   kimlikleri DEALER doğrulaması, `baseVersion` ZORUNLU (428) ve uyuşmazlıkta 409 (C2 kilidi);
 *   yazma + denetim tek transaction.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { ApiError, errorResponse } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { baseVersionRequiredResponse, readBaseVersion } from '@/lib/settings-version';
import { discoveryConfigSchema, issuePathLabel } from '@/lib/admin-discovery/contract';
import { getDiscoveryState, resolveDealers, saveDiscovery } from '@/lib/admin-discovery/server';

export const dynamic = 'force-dynamic';

function requestId(): string {
  return `disc_${Date.now().toString(36)}`;
}

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const state = await getDiscoveryState(prisma);
    return NextResponse.json({ success: true, ok: true, data: state, ...state }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Admin discovery config fetch error:', error);
    return NextResponse.json({ success: false, ok: false, error: 'Keşif ayarları alınamadı', code: 'INTERNAL', retryable: true }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json().catch(() => null);
    const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const parsed = discoveryConfigSchema.safeParse(body.config);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: `${issuePathLabel(i.path)}: ${i.message}` }));
      return NextResponse.json(
        { success: false, ok: false, error: details[0]?.message ?? 'Keşif ayarı geçersiz.', code: 'VALIDATION', details },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const baseVersion = readBaseVersion(raw);
    if (!baseVersion) return baseVersionRequiredResponse();
    const restoredFrom = typeof body.restoredFrom === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.restoredFrom) ? body.restoredFrom : undefined;

    const saved = await saveDiscovery(prisma, { config: parsed.data, baseVersion, restoredFrom }, actorFromSession(session), request);
    const dealers = await resolveDealers(prisma, [
      ...saved.config.locations.map((l) => l.dealerId),
      ...saved.config.sponsored.map((s) => s.dealerId ?? '').filter(Boolean),
    ]).catch(() => ({}));
    const data = { config: saved.config, version: saved.version, dealers };
    return NextResponse.json({ success: true, ok: true, data, ...data }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, requestId());
    console.error('Admin discovery config update error:', error);
    return NextResponse.json({ success: false, ok: false, error: 'Keşif ayarları güncellenemedi', code: 'INTERNAL', retryable: true }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
