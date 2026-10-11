/**
 * Kabuk menüsünün sunucu mantığı: `buildShellConfig` (saf), `snapshotFromRows` +
 * `loadShellConfig` (DB, prisma mock), admin sıra/grup kanonikleştirmesi, ⌘K eşleştirme
 * ve next.config yönlendirme güvenlik kuralı.
 */
jest.mock('@/lib/prisma', () => ({ prisma: { settings: { findMany: jest.fn() } } }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: jest.fn() }));
jest.mock('@/lib/module-gate', () => ({ MODULE_GATE_CACHE_TAG: 'module-gate-settings' }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { prisma } from '@/lib/prisma';
import { buildShellConfig, canonicalOrder, isRouteBlocked, type ShellConfig, type ShellItem } from '@/lib/navigation/shell-config';
import { loadShellConfig, snapshotFromRows } from '@/lib/navigation/get-shell-config';
import { canonicalizeGroupsPayload, canonicalizeOrderIds } from '@/lib/navigation/settings';
import { matchActiveHref, resolveRouteId } from '@/lib/navigation/registry';
import { normalizeSearchText, scoreMatch } from '@/lib/navigation/search';
import { normalizeSidebarNavGroups } from '@/lib/sidebar-groups-settings';
const { buildNavRedirects, isRetirementStub } = require('@/lib/navigation/next-redirects');

const findMany = prisma.settings.findMany as jest.Mock;

function allItems(shell: ShellConfig): ShellItem[] {
  const out: ShellItem[] = [];
  const walk = (it: ShellItem) => {
    out.push(it);
    it.children.forEach(walk);
  };
  for (const n of shell.nodes) (n.kind === 'item' ? [n.item] : n.items).forEach(walk);
  return out;
}

describe('buildShellConfig', () => {
  it('müşteri: 5 alt sekme, TARA ortada; Cüzdan alt öğeleri iç içe; dinamik/gizli rota menü ve palette yok', () => {
    const shell = buildShellConfig('customer');
    expect(shell.bottomTabs.map((t) => t.id)).toEqual([
      'customer.home',
      'customer.places',
      'customer.scan',
      'customer.games',
      'customer.wallet',
    ]);
    expect(shell.bottomTabs.find((t) => t.fab)?.id).toBe('customer.scan');
    const wallet = allItems(shell).find((i) => i.id === 'customer.wallet');
    expect(wallet?.children.map((c) => c.id)).toEqual([
      'customer.wallet.card',
      'customer.wallet.rewards',
      'customer.wallet.owned',
      'customer.wallet.activity',
      'customer.wallet.donate',
    ]);
    const paletteIds = shell.palette.map((p) => p.id);
    expect(paletteIds).not.toContain('customer.places.detail');
    expect(paletteIds).not.toContain('customer.games.game');
    expect(paletteIds).toContain('customer.team.departments'); // child → palette
    expect(shell.links).toMatchObject({ me: '/customer/me', settings: '/customer/me/settings', scan: '/customer/scan' });
  });

  it('menü görünürlüğü kapalı rota: menüden, alt sekmeden, paletten ve alt öğeleriyle birlikte düşer', () => {
    const shell = buildShellConfig('customer', { menuVisibility: { wallet: false, nearby: false } });
    const ids = allItems(shell).map((i) => i.id);
    expect(ids).not.toContain('customer.wallet');
    expect(ids).not.toContain('customer.wallet.card');
    expect(shell.bottomTabs.map((t) => t.id)).not.toContain('customer.places');
    expect(shell.palette.map((p) => p.id)).not.toContain('customer.wallet.rewards');
    // Kısayolun hedefi gizlenince kısayol da düşer.
    expect(shell.shortcuts.map((s) => s.id)).not.toContain('sc.customer.card');
  });

  it('modül kapalı (küresel ya da rol) → menüden düşer', () => {
    const off = buildShellConfig('customer', { moduleControls: { discovery: false } });
    expect(allItems(off).map((i) => i.id)).not.toContain('customer.places');
    const roleOff = buildShellConfig('dealer', { featureVisibility: { ai_features: false } });
    const ids = allItems(roleOff).map((i) => i.id);
    expect(ids).not.toContain('dealer.assistant');
    expect(ids).not.toContain('dealer.analytics.insights');
    expect(roleOff.links.assistant).toBeUndefined();
  });

  it('sayfa kapısı (B11): gizli bölüm URL\'den de kapalı; en özgül desen karar verir; ana sayfa/ayarlar asla', () => {
    const open = buildShellConfig('customer');
    expect(open.gate).toEqual({ blocked: [], open: [] });
    expect(isRouteBlocked(open.gate, '/customer/wallet/rewards')).toBe(false);

    const shell = buildShellConfig('customer', { menuVisibility: { wallet: false, nearby: false, dashboard: false, me: false } });
    expect(isRouteBlocked(shell.gate, '/customer/wallet')).toBe(true);
    expect(isRouteBlocked(shell.gate, '/customer/wallet/rewards')).toBe(true); // üst kapalı → alt da
    expect(isRouteBlocked(shell.gate, '/customer/places/abc123')).toBe(true); // dinamik detay
    expect(isRouteBlocked(shell.gate, '/customer/games')).toBe(false);
    expect(isRouteBlocked(shell.gate, '/customer')).toBe(false); // ana sayfa kapatılamaz
    expect(isRouteBlocked(shell.gate, '/customer/me/settings')).toBe(false); // ayarlar kapatılamaz
    expect(isRouteBlocked(shell.gate, '/customer/me/badges')).toBe(true);

    // Bayi: Genel analitik kapalıyken kendi anahtarı açık alt yol açık kalır.
    const dealer = buildShellConfig('dealer', { menuVisibility: { analytics: false } });
    expect(isRouteBlocked(dealer.gate, '/dealer/analytics')).toBe(true);
    expect(isRouteBlocked(dealer.gate, '/dealer/analytics/heatmap')).toBe(false);
    const ai = buildShellConfig('dealer', { featureVisibility: { ai_features: false } });
    expect(isRouteBlocked(ai.gate, '/dealer/assistant')).toBe(true);
    expect(isRouteBlocked(ai.gate, '/dealer/settings')).toBe(false);

    // Admin kapısı yok.
    expect(buildShellConfig('admin', { moduleControls: { observability: false } }).gate.blocked).toEqual([]);
  });

  it('admin görünürlük ayarlarından etkilenmez; 10 alan grup olarak gelir', () => {
    const shell = buildShellConfig('admin', { menuVisibility: { settings: false }, moduleControls: { observability: false } });
    expect(shell.nodes.every((n) => n.kind === 'group')).toBe(true);
    expect(shell.nodes).toHaveLength(10);
    expect(allItems(shell).map((i) => i.id)).toContain('admin.observability');
  });

  it('bayi: 9 blok; Gelen Kutusu sayaç rozeti ve alt kuyrukları taşır', () => {
    const shell = buildShellConfig('dealer');
    expect(shell.nodes).toHaveLength(9);
    const inbox = allItems(shell).find((i) => i.id === 'dealer.inbox');
    expect(inbox?.badge).toBe('dealerInbox');
    expect(inbox?.children.map((c) => c.href)).toEqual(['/dealer/inbox/remedy', '/dealer/inbox/incidents', '/dealer/inbox/assigned']);
  });

  it('eski sıra kimlikleri (key/href) göç eder ve sırayı uygular', () => {
    const shell = buildShellConfig('dealer', { order: ['settings', 'customers', '/dealer'] });
    const top = shell.nodes.filter((n) => n.kind === 'item').map((n) => (n.kind === 'item' ? n.item.id : ''));
    expect(top.slice(0, 3)).toEqual(['dealer.settings', 'dealer.customers', 'dealer.today']);
    expect(canonicalOrder('dealer', ['growth_hub', 'analytics', 'bilinmeyen'])).toEqual(['dealer.analytics']);
  });

  it('grup override: öğe başka gruba/üst düzeye taşınır, etiket {tr,en} ya da düz metin', () => {
    const shell = buildShellConfig('dealer', {
      groups: {
        groupLabels: { marketing: { tr: 'Büyüme', en: 'Growth' }, analytics: 'Raporlar', yok: 'x' },
        itemGroups: { 'dealer.scan': '', surveys: 'analytics', 'dealer.products': 'olmayan-grup' },
      },
    });
    const marketing = shell.nodes.find((n) => n.kind === 'group' && n.id === 'marketing');
    expect(marketing && marketing.kind === 'group' ? marketing.label : null).toEqual({ tr: 'Büyüme', en: 'Growth' });
    const analytics = shell.nodes.find((n) => n.kind === 'group' && n.id === 'analytics');
    expect(analytics && analytics.kind === 'group' ? analytics.label : null).toEqual({ tr: 'Raporlar', en: 'Raporlar' });
    expect(analytics && analytics.kind === 'group' ? analytics.items.map((i) => i.id) : []).toContain('dealer.surveys');
    expect(shell.nodes.some((n) => n.kind === 'item' && n.item.id === 'dealer.scan')).toBe(true);
    const business = shell.nodes.find((n) => n.kind === 'group' && n.id === 'business');
    expect(business && business.kind === 'group' ? business.items.map((i) => i.id) : []).toContain('dealer.products');
  });

  it('teamOnly bayrağı istemci filtresi için korunur', () => {
    const team = allItems(buildShellConfig('customer')).find((i) => i.id === 'customer.team');
    expect(team?.teamOnly).toBe(true);
  });
});

describe('snapshotFromRows + loadShellConfig', () => {
  beforeEach(() => findMany.mockReset());

  it('ayar satırlarını role göre çözer (eski anahtarlar normalize)', () => {
    const snap = snapshotFromRows('customer', [
      { key: 'sidebarNavOrder', value: { customer: ['my_card', 'dashboard'], admin: ['/admin/cards'] } },
      { key: 'menuVisibility', value: { customer: { my_card: false, journey_score: false }, dealer: { roi: false } } },
      { key: 'moduleControls', value: { quests: false } },
    ]);
    expect(snap.order).toEqual(['my_card', 'dashboard']);
    expect(snap.menuVisibility?.my_card).toBe(false);
    expect(snap.menuVisibility).not.toHaveProperty('journey_score');
    expect(snap.moduleControls?.quests).toBe(false);
    const admin = snapshotFromRows('admin', []);
    expect(admin.menuVisibility).toBeNull();
  });

  it('tek sorgu; DB hatasında varsayılan menü (kabuk çökmez)', async () => {
    findMany.mockResolvedValueOnce([{ key: 'menuVisibility', value: { customer: { wallet: false } } }]);
    const shell = await loadShellConfig('customer');
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(shell.bottomTabs.map((t) => t.id)).not.toContain('customer.wallet');

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    findMany.mockRejectedValueOnce(new Error('db down'));
    const fallback = await loadShellConfig('customer');
    expect(fallback.bottomTabs).toHaveLength(5);
    warn.mockRestore();
  });
});

describe('admin sıra/grup kanonikleştirme', () => {
  it('sıra: eski/yeni kimlikler kayıt kimliğine, bilinmeyen raporlanır', () => {
    expect(canonicalizeOrderIds('admin', ['/admin/cards', 'admin.users', '/admin/ai-dashboard', 'xyz'])).toEqual({
      value: ['admin.cards', 'admin.users', 'admin.ai'],
      unknown: ['xyz'],
    });
  });

  it('grup: bilinmeyen grup/öğe reddedilir, admin rolü desteklenir', () => {
    const res = canonicalizeGroupsPayload('admin', {
      groupLabels: { ai: { tr: 'YZ', en: 'AI' }, nope: 'x' },
      itemGroups: { '/admin/cards': 'overview', 'admin.users': '', ghost: 'ai', 'admin.seo': 'zzz' },
    });
    expect(res.value).toEqual({
      groupLabels: { ai: { tr: 'YZ', en: 'AI' } },
      itemGroups: { 'admin.cards': 'overview', 'admin.users': '' },
    });
    expect(res.unknown.sort()).toEqual(['group:nope', 'group:zzz', 'item:ghost']);
  });

  it('normalizeSidebarNavGroups admin + iki dilli etiketleri korur', () => {
    expect(
      normalizeSidebarNavGroups({ admin: { groupLabels: { ai: { tr: 'YZ', en: '' }, x: 5 } }, dealer: { itemGroups: { a: 'b' } } })
    ).toEqual({ admin: { groupLabels: { ai: { tr: 'YZ' } } }, dealer: { itemGroups: { a: 'b' } } });
  });
});

describe('aktif öğe ve kimlik çözümü', () => {
  it('en uzun önek kazanır; kök yalnız tam eşleşir', () => {
    const hrefs = ['/admin', '/admin/ai', '/admin/ai/quality'];
    expect(matchActiveHref('/admin/ai/quality', hrefs, '/admin')).toBe('/admin/ai/quality');
    expect(matchActiveHref('/admin/ai/x', hrefs, '/admin')).toBe('/admin/ai');
    expect(matchActiveHref('/admin/users', hrefs, '/admin')).toBeNull();
    expect(matchActiveHref('/admin', hrefs, '/admin')).toBe('/admin');
    expect(matchActiveHref('/admin/aix', hrefs, '/admin')).toBeNull();
  });

  it('yönlendirilen eski URL de kimliğe çözülür', () => {
    expect(resolveRouteId('customer', '/customer/lounge')).toBe('customer.wallet.card');
    expect(resolveRouteId('dealer', 'nope')).toBeNull();
  });
});

describe('⌘K eşleştirme', () => {
  it('Türkçe/aksan bağımsız', () => {
    expect(normalizeSearchText('ÖDÜLLER  İçgörü ılık')).toBe('oduller icgoru ilik');
    expect(scoreMatch('odul', 'Ödüller')).toBeGreaterThan(0);
    expect(scoreMatch('ICGORU', 'İçgörüler')).toBeGreaterThan(0);
  });

  it('etiket başı > anahtar kelime; tüm kelimeler eşleşmeli', () => {
    expect(scoreMatch('kart', 'Kartım')).toBeGreaterThan(scoreMatch('kart', 'Cüzdan', ['kart']));
    expect(scoreMatch('telafi kupon', 'Ödüllerim', ['kupon', 'telafi kuponu'])).toBeGreaterThan(0);
    expect(scoreMatch('telafi xyz', 'Ödüllerim', ['telafi'])).toBe(0);
  });
});

describe('next.config yönlendirme güvenlik kuralı', () => {
  let dir: string;
  const write = (rel: string, content: string) => {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-redirects-'));
    write(
      'lib/navigation/redirects.json',
      JSON.stringify([
        { source: '/customer/my-card', destination: '/customer/wallet/card' },
        { source: '/customer/rewards', destination: '/customer/wallet/rewards' },
        { source: '/customer/badges', destination: '/customer/me/badges' },
        { source: '/customer/gone', destination: '/customer/wallet/card' },
      ])
    );
    write('app/customer/wallet/card/page.tsx', 'export default function P(){return <div/>}');
    write('app/customer/me/badges/page.tsx', 'export default function P(){return <div/>}');
    // emekli koçanı
    write(
      'app/customer/my-card/page.tsx',
      "import { permanentRedirect } from 'next/navigation';\nexport default function P(){ permanentRedirect('/customer/wallet/card'); }\n"
    );
    // hâlâ çalışan eski sayfa
    write('app/customer/badges/page.tsx', "'use client';\nexport default function P(){return <main>rozetler</main>}");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('yalnız hedef var + eski sayfa SİLİNMİŞSE etkin; koçan varsa eşlemeyi koçan yapar', () => {
    const out = buildNavRedirects(dir);
    // my-card koçanı kendi (sekme/parametre) eşlemesini yapar → kenar yönlendirmesi üretilmez;
    // rewards hedefi yok; badges hâlâ çalışan sayfa; yalnız silinmiş /customer/gone etkin.
    expect(out).toEqual([{ source: '/customer/gone', destination: '/customer/wallet/card', permanent: true }]);
  });

  it('emekli koçanı tanıma (TypeScript jenerikleri JSX sayılmaz)', () => {
    expect(isRetirementStub(path.join(dir, 'app/customer/my-card/page.tsx'))).toBe(true);
    expect(isRetirementStub(path.join(dir, 'app/customer/badges/page.tsx'))).toBe(false);
    write(
      'app/customer/typed/page.tsx',
      [
        "import { permanentRedirect } from 'next/navigation';",
        'export default async function P({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {',
        '  permanentRedirect(`/customer/places?${new URLSearchParams()}`);',
        '}',
      ].join('\n')
    );
    expect(isRetirementStub(path.join(dir, 'app/customer/typed/page.tsx'))).toBe(true);
    write(
      'app/customer/jsx/page.tsx',
      ["import { redirect } from 'next/navigation';", "export default function P(){ if (!1) redirect('/x'); return <Main />; }"].join('\n')
    );
    expect(isRetirementStub(path.join(dir, 'app/customer/jsx/page.tsx'))).toBe(false);
  });
});
