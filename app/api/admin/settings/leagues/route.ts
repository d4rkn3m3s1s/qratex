import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  DEFAULT_LEAGUE_RULES,
  normalizeLeagueRules,
  clearLeagueRulesCache,
  LEAGUE_RULES_SETTING_KEY,
  LEAGUE_RULES_SETTING_CATEGORY,
} from '@/lib/league-rules';
import { adminLeaguesPutSchema } from '@/lib/validations-admin';
import {
  baseVersionRequiredResponse,
  isVersionConflictError,
  readBaseVersion,
  versionConflictResponse,
  writeVersionedSetting,
} from '@/lib/settings-version';
import { Prisma } from '@prisma/client';
import { deriveLeagueRanges, leagueRulesSchema } from '@/lib/admin-economy/contract';
import { loadLeaguesResource } from '@/lib/admin-economy/server';

export const dynamic = 'force-dynamic';

const LEAGUE_KEYS = DEFAULT_LEAGUE_RULES.map((r) => r.key as string);

/**
 * Gelen kural listesi TAM olmalı: her lig anahtarı tam bir kez, hiçbir eleman null/eksik değil.
 * (Eski istemcinin boş/seyrek diziyle "tek elemanlı" ya da varsayılan listeyi canlıya yazması
 * bu kontrolle sunucuda da engellenir — P0-28.)
 */
function completenessError(rules: unknown): string | null {
  if (!Array.isArray(rules)) return 'Lig kuralları liste olmalı';
  if (rules.length !== LEAGUE_KEYS.length) return `Tam ${LEAGUE_KEYS.length} lig gönderilmeli`;
  const seen = new Set<string>();
  for (const r of rules) {
    if (!r || typeof r !== 'object') return 'Lig listesinde boş eleman var';
    const key = (r as Record<string, unknown>).key;
    if (typeof key !== 'string' || !LEAGUE_KEYS.includes(key)) return 'Bilinmeyen lig anahtarı';
    if (seen.has(key)) return 'Aynı lig iki kez gönderilmiş';
    seen.add(key);
  }
  return null;
}

/**
 * GET — canlı kurallar + sürüm + lig başına müşteri dağılımı. Önbelleksiz; okuma hatası 500
 * (istemci formu açmaz). Eski kayıtlardaki boşluklar bitişik aralıklara çevrilmiş döner.
 */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const res = await loadLeaguesResource();
    return NextResponse.json({
      success: true,
      key: LEAGUE_RULES_SETTING_KEY,
      ...res.data,
      version: res.version,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('League rules fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Lig ayarları getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/** PUT — `baseVersion` ZORUNLU; uyuşmazlıkta 409. Yazma + audit tek transaction. */
export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json().catch(() => null);
    const parsed = adminLeaguesPutSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json(
        { success: false, error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const incomplete = completenessError(parsed.data.rules);
    if (incomplete) {
      return NextResponse.json({ success: false, error: incomplete }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    // Sıkı doğrulama: ilk eşik 0, kesin artan, bitişik aralıklar, son lig sınırsız, ad 1–32.
    const strict = leagueRulesSchema.safeParse(parsed.data.rules);
    if (!strict.success) {
      return NextResponse.json(
        {
          success: false,
          error: strict.error.issues[0]?.message ?? 'Lig kuralları geçersiz',
          code: 'VALIDATION',
          details: strict.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const baseVersion = readBaseVersion(raw);
    if (!baseVersion) return baseVersionRequiredResponse();

    // Üst sınırlar sunucuda bitişik türetilir; gradyan (kullanıcıya gösterilmeyen tema alanı) korunur.
    const rules = deriveLeagueRanges(normalizeLeagueRules(strict.data));

    const saved = await prisma.$transaction(async (tx) => {
      const written = await writeVersionedSetting(tx, {
        key: LEAGUE_RULES_SETTING_KEY,
        value: rules as unknown as Prisma.InputJsonValue,
        category: LEAGUE_RULES_SETTING_CATEGORY,
        baseVersion,
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE_LEAGUE_RULES',
          entity: 'Settings',
          entityId: written.id,
          oldData: written.previous ?? Prisma.JsonNull,
          newData: rules as unknown as Prisma.InputJsonValue,
          ...auditMeta,
        },
      });
      return written;
    });
    clearLeagueRulesCache();

    return NextResponse.json({
      success: true,
      key: saved.key,
      rules,
      version: saved.version,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('League rules update error:', error);
    return NextResponse.json(
      { success: false, error: 'Lig ayarları güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
