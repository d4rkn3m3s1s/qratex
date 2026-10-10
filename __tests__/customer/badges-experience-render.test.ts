/**
 * Ben → Rozetler istemci adası — sunucu render dumanı (DOM yok), gerçek DTO şekliyle:
 *  - tek h1; hero paydasız ("X / X", "%100", "Sıradaki %0" yok), gerçek puan toplamı,
 *  - kartlar klavyeyle erişilebilir <button> + anlamlı aria-label, "Yeni"/vitrin işareti,
 *  - "keşfedilecek rozet" ipucu sayı sızdırmaz; "puanla aç" dünyası yok,
 *  - boş koleksiyonda dürüst boş durum + gerçek CTA (QR okut).
 */
const mockSearch = { value: '' };
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearch.value),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/customer/me/badges',
}));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
jest.mock('@/components/providers/confetti-provider', () => ({ useConfetti: () => ({ fireStars: jest.fn() }) }));

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLocaleProvider } from '@/lib/app-locale';
import type { CollectionItem, CollectionOverview } from '@/lib/badges/collection-logic';
import { BadgesExperience } from '@/components/customer/m-rozetler/badges-experience';

function item(over: Partial<CollectionItem> & { id: string; name: string }): CollectionItem {
  return {
    kind: 'badge',
    description: 'Açıklama',
    icon: null,
    thumb: null,
    rarity: 'common',
    category: 'feedback',
    characterCategory: null,
    color: null,
    earnedAt: '2026-10-08T10:00:00.000Z',
    creditedPoints: 0,
    catalogPoints: 0,
    holders: 5,
    holdersPct: 0.5,
    quote: null,
    isPinned: false,
    isNew: false,
    surprise: false,
    ...over,
  };
}

function overview(over: Partial<CollectionOverview> = {}): CollectionOverview {
  const items = [
    item({ id: 'badge-yeni-ses', name: 'Yeni Ses', creditedPoints: 200, isNew: true, isPinned: true }),
    item({ id: 'badge-efsane', name: 'Efsane', rarity: 'legendary', creditedPoints: 4000, holders: 2, holdersPct: 0.2 }),
    item({
      id: 'badge-sheldon',
      name: 'Sheldon Cooper',
      kind: 'character',
      category: 'komedi',
      rarity: 'rare',
      characterCategory: { key: 'komedi', name: 'Komedi', emoji: '😂', accent: '#eab308' },
    }),
  ];
  return {
    items,
    stats: {
      total: 3,
      badges: 2,
      characters: 1,
      pointsFromBadges: 4200,
      earnedThisMonth: 3,
      legendary: 1,
      epic: 0,
      rarest: { id: 'badge-efsane', name: 'Efsane', rarity: 'legendary', holdersPct: 0.2 },
      pinnedBadges: 1,
      pinnedTotal: 1,
      pinLimit: 4,
    },
    character: {
      featuredBadgeId: 'badge-sheldon',
      bar: { current: 4, threshold: 6, progress: 4 / 6, remaining: 2, ready: false },
      categoryStats: [{ key: 'komedi', name: 'Komedi', emoji: '😂', accent: '#eab308', collected: 1, complete: false }],
    },
    moreToDiscover: true,
    nextSurprise: { current: 7, target: 20, remaining: 13 },
    generatedAt: '2026-10-10T12:00:00.000Z',
    ...over,
  };
}

function render(data: CollectionOverview, search = '') {
  mockSearch.value = search;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      AppLocaleProvider,
      null,
      createElement(QueryClientProvider, { client: qc }, createElement(BadgesExperience, { initialData: data })),
    ),
  );
}

describe('BadgesExperience (SSR)', () => {
  it('tek h1, paydasız hero, gerçek puan toplamı', () => {
    const html = render(overview());
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Rozetler');
    expect(html).toMatch(/4\.200|4,200/);
    expect(html).not.toMatch(/3\s*\/\s*3/);
    expect(html).not.toContain('Sıradaki %0');
    expect(html).toContain('Sheldon Cooper');
  });

  it('kartlar buton + anlamlı etiket; yeni ve vitrin işareti; folyo yalnız efsanevide', () => {
    const html = render(overview());
    expect(html).toMatch(/<button[^>]*data-badge-id="badge-yeni-ses"[^>]*aria-label="Yeni Ses, Yaygın, [^"]*kazanıldı, Vitrinde, Yeni"/);
    expect(html).toMatch(/<button[^>]*data-badge-id="badge-efsane"[^>]*aria-haspopup="dialog"/);
    expect(html).toContain('Keşfedilecek rozetler var');
    expect(html).not.toMatch(/puan ile aç|puanla aç/i);
  });

  it('sürpriz bölmesi: karakter barı ve sonraki sürpriz ilerleme çubuğu (ad yok)', () => {
    const html = render(overview());
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="7"');
    expect(html).toContain('aria-valuemax="20"');
    expect(html).not.toContain('badge-usta-yorumcu');
  });

  it('boş koleksiyon: dürüst boş durum + QR CTA', () => {
    const html = render(
      overview({
        items: [],
        stats: { ...overview().stats, total: 0, badges: 0, characters: 0, pointsFromBadges: 0, earnedThisMonth: 0, legendary: 0, rarest: null, pinnedBadges: 0, pinnedTotal: 0 },
        character: { featuredBadgeId: null, bar: { current: 0, threshold: 6, progress: 0, remaining: 6, ready: false }, categoryStats: [] },
      }),
    );
    expect(html).toContain('Henüz rozetin yok');
    expect(html).toContain('href="/customer/scan"');
  });

  it('karakter sekmesi URL’den: kategori grubu ve tek "?" kartı', () => {
    const html = render(overview(), 'tab=characters');
    expect(html).toContain('Komedi');
    expect(html).toContain('1 karakter toplandı');
    expect(html).toContain('Henüz keşfedilmedi');
  });
});
