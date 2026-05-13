import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getSeoSettingsFull } from '@/lib/seo-settings';


export const dynamic = 'force-dynamic';

type CheckResult = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
};

async function safeFetch(url: string) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: '' };
  }
}

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const payload = await getSeoSettingsFull();
  const g = payload.global;
  const checks: CheckResult[] = [];

  const siteUrlValid = (() => {
    try {
      return Boolean(new URL(g.siteUrl));
    } catch {
      return false;
    }
  })();
  checks.push({
    key: 'siteUrl',
    label: 'Site URL geçerli',
    passed: siteUrlValid,
    detail: siteUrlValid ? g.siteUrl : 'Site URL formatı geçersiz',
    severity: 'critical',
  });

  checks.push({
    key: 'metaTitle',
    label: 'Varsayılan başlık',
    passed: g.defaultTitle.trim().length >= 10,
    detail: `${g.defaultTitle.trim().length} karakter`,
    severity: 'warning',
  });

  checks.push({
    key: 'metaDescription',
    label: 'Varsayılan açıklama',
    passed: g.defaultDescription.trim().length >= 70 && g.defaultDescription.trim().length <= 170,
    detail: `${g.defaultDescription.trim().length} karakter`,
    severity: 'warning',
  });

  checks.push({
    key: 'ogImage',
    label: 'OG görsel URL',
    passed: g.ogImageUrl.trim().length > 0,
    detail: g.ogImageUrl || 'Tanımlı değil',
    severity: 'info',
  });

  if (!siteUrlValid) {
    checks.push({
      key: 'robots',
      label: 'robots.txt erişimi',
      passed: false,
      detail: 'Site URL geçersiz olduğu için test edilemedi',
      severity: 'critical',
    });
    checks.push({
      key: 'sitemap',
      label: 'sitemap.xml erişimi',
      passed: false,
      detail: 'Site URL geçersiz olduğu için test edilemedi',
      severity: 'critical',
    });
  } else {
    const robotsUrl = `${g.siteUrl.replace(/\/$/, '')}/robots.txt`;
    const sitemapUrl = `${g.siteUrl.replace(/\/$/, '')}/sitemap.xml`;
    const [robotsRes, sitemapRes] = await Promise.all([safeFetch(robotsUrl), safeFetch(sitemapUrl)]);
    const robotsHasSitemap = /sitemap:/i.test(robotsRes.body);
    const sitemapLooksXml = /<urlset|<sitemapindex/i.test(sitemapRes.body);

    checks.push({
      key: 'robots',
      label: 'robots.txt erişimi',
      passed: robotsRes.ok,
      detail: robotsRes.ok ? `HTTP ${robotsRes.status}` : 'robots.txt erişilemiyor',
      severity: 'critical',
    });
    checks.push({
      key: 'robotsSitemap',
      label: 'robots içinde sitemap satırı',
      passed: robotsHasSitemap,
      detail: robotsHasSitemap ? 'Sitemap satırı bulundu' : 'Sitemap satırı bulunamadı',
      severity: 'warning',
    });
    checks.push({
      key: 'sitemap',
      label: 'sitemap.xml doğrulama',
      passed: sitemapRes.ok && sitemapLooksXml,
      detail: sitemapRes.ok
        ? sitemapLooksXml
          ? `HTTP ${sitemapRes.status}, XML geçerli`
          : `HTTP ${sitemapRes.status}, XML içeriği beklenen formatta değil`
        : 'sitemap.xml erişilemiyor',
      severity: 'critical',
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const failedCount = checks.length - passedCount;
  const score = Math.round((passedCount / checks.length) * 100);

  return NextResponse.json({
    success: true,
    score,
    checks,
    passedCount,
    failedCount,
    totalChecks: checks.length,
    checkedAt: new Date().toISOString(),
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
