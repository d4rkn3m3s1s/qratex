import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminSeoRateLimit } from '@/lib/rate-limit';
import {
  getSeoSettingsFull,
  SEO_SETTINGS_KEY,
  SEO_CACHE_TAG,
  type SeoGlobalSettings,
  type SeoPageOverride,
  type SeoSettingsPayload,
  type ExtraSitemapEntry,
} from '@/lib/seo-settings';
import { adminSeoPutSchema } from '@/lib/validations-admin';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const VALID_KEYS: (keyof SeoGlobalSettings)[] = [
  'defaultTitle',
  'defaultDescription',
  'siteName',
  'siteUrl',
  'ogImageUrl',
  'ogImageWidth',
  'ogImageHeight',
  'twitterHandle',
  'twitterCard',
  'locale',
  'keywords',
  'organizationName',
  'organizationDescription',
  'websiteDescription',
  'robotsIndex',
  'robotsFollow',
  'robotsDisallow',
  'sitemapEnabled',
  'canonicalBase',
  'extraSitemapUrls',
];

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function sanitizeGlobal(body: Record<string, unknown>): SeoGlobalSettings {
  const out: Record<string, unknown> = {};
  for (const key of VALID_KEYS) {
    const v = body[key];
    if (v === undefined) continue;
    if (key === 'keywords' && Array.isArray(v)) {
      out[key] = v.filter((x) => typeof x === 'string');
      continue;
    }
    if (key === 'robotsDisallow' && Array.isArray(v)) {
      out[key] = v.filter((x) => typeof x === 'string');
      continue;
    }
    if (key === 'extraSitemapUrls' && Array.isArray(v)) {
      out[key] = v
        .filter((e): e is ExtraSitemapEntry => e != null && typeof (e as ExtraSitemapEntry).url === 'string')
        .map((e) => ({
          url: (e as ExtraSitemapEntry).url,
          priority: typeof (e as ExtraSitemapEntry).priority === 'number' ? (e as ExtraSitemapEntry).priority : undefined,
          changeFrequency: (e as ExtraSitemapEntry).changeFrequency,
          lastModified: typeof (e as ExtraSitemapEntry).lastModified === 'string' ? (e as ExtraSitemapEntry).lastModified : undefined,
        }));
      continue;
    }
    if (key === 'ogImageWidth' || key === 'ogImageHeight') {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) out[key] = n;
      continue;
    }
    if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
      out[key] = v;
    }
  }
  return out as unknown as SeoGlobalSettings;
}

function validateGlobalUrls(g: SeoGlobalSettings): string | null {
  if (g.siteUrl && !isValidUrl(g.siteUrl)) return 'Geçersiz Site URL';
  if (g.ogImageUrl && !isValidUrl(g.ogImageUrl)) return 'Geçersiz OG görsel URL';
  if (g.canonicalBase && g.canonicalBase.trim() !== '' && !isValidUrl(g.canonicalBase)) return 'Geçersiz Canonical base URL';
  return null;
}

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const rl = checkAdminSeoRateLimit(auth.session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }
    const payload = await getSeoSettingsFull();
    return NextResponse.json(payload, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SEO GET error:', e);
    return NextResponse.json({ error: 'SEO ayarları getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const rl = checkAdminSeoRateLimit(auth.session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }
    const raw = await request.json();
    const parsed = adminSeoPutSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const body = parsed.data as Record<string, unknown>;
    const global = body.global ? sanitizeGlobal(body.global as Record<string, unknown>) : undefined;
    const pageOverrides = body.pageOverrides as SeoPageOverride[] | undefined;
    const current = await getSeoSettingsFull();
    const nextGlobal = global ? { ...current.global, ...global } : current.global;
    const urlErr = validateGlobalUrls(nextGlobal);
    if (urlErr) return NextResponse.json({ error: urlErr }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    const nextOverrides =
      pageOverrides && Array.isArray(pageOverrides)
        ? pageOverrides.filter(
            (p) => p && typeof p.path === 'string' && typeof p.title === 'string' && typeof p.description === 'string'
          )
        : current.pageOverrides;

    const value: SeoSettingsPayload = {
      global: nextGlobal,
      pageOverrides: nextOverrides,
    };

    const existing = await prisma.settings.findUnique({ where: { key: SEO_SETTINGS_KEY } });
    const setting = await prisma.settings.upsert({
      where: { key: SEO_SETTINGS_KEY },
      create: { key: SEO_SETTINGS_KEY, value: value as object, category: 'seo' },
      update: { value: value as object, updatedAt: new Date() },
    });

    const auditMeta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: existing ? 'update' : 'create',
        entity: 'settings',
        entityId: setting.id,
        oldData: (existing?.value ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        newData: value as unknown as Prisma.InputJsonValue,
        ...auditMeta,
      },
    });

    revalidateTag(SEO_CACHE_TAG, 'max');
    return NextResponse.json({ ok: true, settings: value }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SEO PUT error:', e);
    return NextResponse.json({ error: 'SEO ayarları kaydedilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
