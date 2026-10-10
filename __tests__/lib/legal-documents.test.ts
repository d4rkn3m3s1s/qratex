import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LEGAL_DOCUMENTS,
  LEGAL_SLUGS,
  formatLegalDate,
  getRelatedLegalDocuments,
  legalDateToDate,
} from '@/lib/legal/documents';
import { DATA_PROCESSORS, PROCESSOR_PACKAGES } from '@/lib/legal/processors';
import { buildLegalCategoryRows, listAutoRetentionRules, retentionText } from '@/lib/legal/inventory-view';
import { COOKIE_POLICY_EFFECTIVE_DATE, COOKIE_POLICY_VERSION } from '@/lib/consent/inventory';
import type { PiiRegistryEntry } from '@/lib/pii-registry';
import { breadcrumbLd, serializeJsonLd } from '@/components/public/p-blog-yasal/serialize-json-ld';

const ROOT = path.resolve(__dirname, '..', '..');

describe('yasal belge kaydı', () => {
  it('her belge: yol = slug, sürüm ve yürürlük tarihi changelog’un ilk satırıyla aynı', () => {
    for (const slug of LEGAL_SLUGS) {
      const d = LEGAL_DOCUMENTS[slug];
      expect(d.slug).toBe(slug);
      expect(d.path).toBe(`/${slug}`);
      expect(d.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.changelog[0]?.version).toBe(d.version);
      expect(d.changelog[0]?.date).toBe(d.effectiveDate);
      // Yeniden eskiye sıralı
      for (let i = 1; i < d.changelog.length; i++) {
        expect(d.changelog[i - 1]!.date >= d.changelog[i]!.date).toBe(true);
      }
      expect(d.description.length).toBeLessThanOrEqual(170);
    }
  });

  it('çerez politikası sürümü rıza envanteriyle aynı kaynaktan gelir', () => {
    expect(LEGAL_DOCUMENTS['cerez-politikasi'].version).toBe(COOKIE_POLICY_VERSION);
    expect(LEGAL_DOCUMENTS['cerez-politikasi'].effectiveDate).toBe(COOKIE_POLICY_EFFECTIVE_DATE);
  });

  it('yasal sayfalarda render anı tarihi (new Date()) kullanılmaz', () => {
    for (const slug of LEGAL_SLUGS) {
      const src = readFileSync(path.join(ROOT, 'app', '(okuma)', slug, 'page.tsx'), 'utf8');
      expect(src).not.toMatch(/new Date\(\)/);
      expect(src).not.toMatch(/toLocaleDateString/);
    }
  });

  it('tarih Europe/Istanbul gece yarısıdır ve Türkçe biçimlenir', () => {
    expect(legalDateToDate('2026-10-10').toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(formatLegalDate('2026-10-10')).toBe('10 Ekim 2026');
  });

  it('ilgili belgeler kendisini içermez', () => {
    const rel = getRelatedLegalDocuments('kullanim-sartlari').map((d) => d.slug);
    expect(rel).toEqual(['gizlilik-politikasi', 'kvkk-aydinlatma-metni', 'cerez-politikasi']);
  });
});

describe('hizmet sağlayıcı listesi', () => {
  it('listelenen her paket package.json’da gerçekten var (ölü satır yok)', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const name of PROCESSOR_PACKAGES) {
      expect(pkg.dependencies?.[name]).toBeDefined();
    }
  });

  it('veri işleyen bilinen bağımlılıklar listede (yeni sağlayıcı eklenince metin de güncellenmeli)', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const watched = ['posthog-js', '@sentry/nextjs', 'stripe', 'resend', 'inngest', '@upstash/redis', '@aws-sdk/client-s3', 'web-push'];
    for (const name of watched) {
      if (pkg.dependencies?.[name]) expect(PROCESSOR_PACKAGES).toContain(name);
    }
  });

  it('her satır dolu; rıza gerektiren tek sağlayıcı analitik', () => {
    for (const p of DATA_PROCESSORS) {
      expect(p.name && p.purpose && p.data && p.location && p.evidence).toBeTruthy();
    }
    expect(DATA_PROCESSORS.filter((p) => p.basis === 'consent').map((p) => p.name)).toEqual(['PostHog']);
  });
});

describe('envanter görünümü', () => {
  const sample: PiiRegistryEntry[] = [
    {
      model: 'QraChatLog',
      relation: 'userId',
      subject: 'self',
      categories: ['serbest_metin', 'ai'],
      piiFields: ['message'],
      export: null,
      erase: 'delete',
      retentionDays: 180,
      retentionField: 'createdAt',
      legalBasis: 'Sözleşme',
    },
    {
      model: 'AuditLog',
      relation: 'userId',
      subject: 'self',
      categories: ['güvenlik'],
      piiFields: ['ipAddress'],
      export: null,
      erase: 'redact',
      retentionDays: 3650,
      legalBasis: 'Hukuki yükümlülük',
    },
    {
      model: 'Order',
      relation: 'dealerId',
      subject: 'business',
      categories: ['işlem'],
      piiFields: [],
      export: null,
      erase: 'business',
      retentionDays: null,
      legalBasis: 'Ticari',
    },
  ];

  it('yalnız veri sahibinin kendi kayıtlarından satır üretir', () => {
    const rows = buildLegalCategoryRows(sample);
    expect(rows.map((r) => r.category)).toEqual(['serbest_metin', 'ai', 'güvenlik']);
    expect(rows[0]).toMatchObject({ retention: ['180 gün sonra otomatik silinir'], onErase: ['silinir'] });
    expect(rows[2]).toMatchObject({ retention: ['10 yıl (yasal saklama)'] });
  });

  it('saklama cümleleri', () => {
    expect(retentionText({ retentionDays: 30, retentionField: undefined })).toBe('en fazla 30 gün');
    expect(retentionText({ retentionDays: null, retentionField: undefined })).toBe('hesabınız açık kaldığı sürece');
  });

  it('gerçek envanter boş değil ve otomatik saklama kuralları listelenir', () => {
    expect(buildLegalCategoryRows().length).toBeGreaterThan(3);
    const auto = listAutoRetentionRules(sample);
    expect(auto).toEqual([{ model: 'QraChatLog', days: 180 }]);
  });
});

describe('JSON-LD serileştirme', () => {
  it('</script> ve satır ayırıcılarını kaçışlar; JSON olarak geri okunur', () => {
    const data = { name: '</script><script>alert(1)</script> &  x ' };
    const out = serializeJsonLd(data);
    expect(out).not.toMatch(/<|>/);
    expect(out).not.toContain(' ');
    expect(out).not.toContain(' ');
    expect(JSON.parse(out)).toEqual(data);
  });

  it('breadcrumb canonical tabanını kullanır', () => {
    expect(breadcrumbLd('https://qratex.com', [{ name: 'Ana Sayfa', path: '/' }, { name: 'Blog', path: '/blog' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: 'https://qratex.com' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://qratex.com/blog' },
      ],
    });
  });
});
