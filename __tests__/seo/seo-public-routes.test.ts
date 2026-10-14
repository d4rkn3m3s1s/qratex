import fs from 'fs';
import path from 'path';
import { cleanEnvUrl } from '@/lib/env-url';

jest.mock('@/lib/seo-settings', () => ({
  getSeoSettings: jest.fn(async () => ({
    canonicalBase: '',
    siteUrl: 'https://qratex.app/\n',
    sitemapEnabled: true,
    robotsDisallow: ['/admin/'],
  })),
}));
jest.mock('@/lib/cms-pages/pages.server', () => ({ listPublishedCmsForSitemap: jest.fn(async () => []) }));

describe('cleanEnvUrl', () => {
  it('trims whitespace/newline and trailing slashes', () => {
    expect(cleanEnvUrl(' https://qratex.app//\n')).toBe('https://qratex.app');
    expect(cleanEnvUrl('  \n')).toBeUndefined();
    expect(cleanEnvUrl(undefined)).toBeUndefined();
  });
});

describe('robots.ts', () => {
  it('normalizes base and adds AI crawler rule', async () => {
    const robots = (await import('@/app/robots')).default;
    const r = await robots();
    expect(r.sitemap).toBe('https://qratex.app/sitemap.xml');
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const ai = rules.find((x) => Array.isArray(x.userAgent) && x.userAgent.includes('GPTBot'));
    expect(ai).toBeDefined();
    for (const ua of ['ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bingbot', 'OAI-SearchBot']) {
      expect(ai!.userAgent).toContain(ua);
    }
    expect(ai!.allow).toEqual(['/', '/llms.txt']);
    expect(ai!.disallow).toEqual(['/admin/']);
  });
});

describe('sitemap.ts', () => {
  it('uses trimmed base without newline', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    expect(entries[0].url).toBe('https://qratex.app');
    for (const e of entries) expect(e.url).not.toMatch(/\s/);
  });
});

describe('home Organization JSON-LD', () => {
  it('declares square logo, image, alternateName and sameAs', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/(public)/page.tsx'), 'utf8');
    expect(src).toContain("url: `${base}/icons/favicon-512.png`, width: 512, height: 512");
    expect(src).toContain("alternateName: ['QRateX', 'Qratex', 'QRateX App']");
    expect(src).toContain("sameAs: ['https://www.instagram.com/qratexco/']");
    expect(fs.existsSync(path.join(process.cwd(), 'public/icons/favicon-512.png'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'public/llms.txt'))).toBe(true);
  });
});
