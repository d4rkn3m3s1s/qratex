import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  getLeagueRules,
  normalizeLeagueRules,
  clearLeagueRulesCache,
  LEAGUE_RULES_SETTING_KEY,
  LEAGUE_RULES_SETTING_CATEGORY,
} from '@/lib/league-rules';
import { adminLeaguesPutSchema } from '@/lib/validations-admin';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const rules = await getLeagueRules();
    return NextResponse.json({
      success: true,
      key: LEAGUE_RULES_SETTING_KEY,
      rules,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('League rules fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Lig ayarları getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json();
    const parsed = adminLeaguesPutSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json(
        { success: false, error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const rules = normalizeLeagueRules(parsed.data.rules);

    const previous = await prisma.settings.findUnique({
      where: { key: LEAGUE_RULES_SETTING_KEY },
    });

    const saved = await prisma.settings.upsert({
      where: { key: LEAGUE_RULES_SETTING_KEY },
      update: {
        value: rules as unknown as Prisma.InputJsonValue,
        category: LEAGUE_RULES_SETTING_CATEGORY,
      },
      create: {
        key: LEAGUE_RULES_SETTING_KEY,
        value: rules as unknown as Prisma.InputJsonValue,
        category: LEAGUE_RULES_SETTING_CATEGORY,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_LEAGUE_RULES',
        entity: 'Settings',
        entityId: saved.id,
        oldData: previous?.value ?? Prisma.JsonNull,
        newData: rules as unknown as Prisma.InputJsonValue,
        ...auditMeta,
      },
    });
    clearLeagueRulesCache();

    return NextResponse.json({
      success: true,
      key: saved.key,
      rules,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('League rules update error:', error);
    return NextResponse.json(
      { success: false, error: 'Lig ayarları güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
