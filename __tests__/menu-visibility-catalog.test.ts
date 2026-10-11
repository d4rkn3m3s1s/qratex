/**
 * Tek navigasyon kaydı (lib/navigation/registry.ts) koruma testi — `npm run verify:menu`.
 *
 *  1. Kayıt iç tutarlılığı: kimlik/yol/menü anahtarı tekil, üst ve grup başvuruları geçerli,
 *     iki dilli etiket dolu, alt sekme çubuğu 5 sekme + 1 merkez eylem.
 *  2. Menü görünürlük kataloğu kayıttan türetilir (eski elle tutulan liste yok).
 *  3. Dosya sistemiyle İKİ YÖNLÜ kontrol:
 *     - kayıttaki her menü/palet yolunun (`primary|secondary|child`) bir page.tsx'i var;
 *     - panel dizinlerindeki her page.tsx kayıtta (rota, dinamik desen ya da yönlendirme kaynağı).
 *  4. `redirects.json` kayıtla senkron; yönlendirme zinciri ve döngü yok.
 *  5. Eski sidebar kimliklerinin hepsi kayıtta çözülür (DB'deki sıra/grup ayarı kaybolmaz).
 *
 * `redirects.json`'ı yenilemek için: UPDATE_NAV_REDIRECTS=1 npx jest __tests__/menu-visibility-catalog.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CUSTOMER_MENU_CATALOG,
  DEALER_MENU_CATALOG,
  MENU_CATALOG_BY_ROLE,
  getMenuCatalogKeys,
  getDefaultVisibilitySettings,
} from '@/lib/visibility-controls';
import {
  NAV_GROUPS,
  NAV_ICON_NAMES,
  NAV_ROUTES,
  NAV_SHORTCUTS,
  PALETTE_STATUSES,
  deriveRedirects,
  hrefPatternMatches,
  isDynamicHref,
  resolveRouteId,
  routesForRole,
  type NavRole,
} from '@/lib/navigation/registry';
import { adminNavItems, customerNavItems, dealerNavItems, getNavOrderId } from '@/lib/navigation/legacy-nav';
const { isRetirementStub } = require('@/lib/navigation/next-redirects') as { isRetirementStub: (file: string) => boolean };

const ROOT = process.cwd();
const ROLES: NavRole[] = ['customer', 'dealer', 'admin', 'staff'];
const PANEL_DIRS: Record<NavRole, string> = {
  customer: 'app/customer',
  dealer: 'app/dealer',
  admin: 'app/admin',
  staff: 'app/staff',
};

function pageExists(href: string): boolean {
  return fs.existsSync(path.join(ROOT, 'app', ...href.split('/').filter(Boolean), 'page.tsx'));
}

function listPanelPages(role: NavRole): string[] {
  const base = path.join(ROOT, PANEL_DIRS[role]);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name === 'page.tsx') {
        const rel = path.relative(path.join(ROOT, 'app'), dir).split(path.sep).join('/');
        out.push('/' + rel);
      }
    }
  };
  walk(base);
  return out.sort();
}

describe('Navigasyon kaydı — iç tutarlılık', () => {
  it('kimlikler küresel olarak tekil', () => {
    const ids = NAV_ROUTES.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it.each(ROLES)('%s: yollar ve menü anahtarları tekil', (role) => {
    const list = routesForRole(role);
    const hrefs = list.map((r) => r.href);
    expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i)).toEqual([]);
    const keys = list.flatMap((r) => (r.menuKey ? [r.menuKey] : []));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    const legacy = list.flatMap((r) => r.legacyIds ?? []);
    expect(legacy.filter((k, i) => legacy.indexOf(k) !== i)).toEqual([]);
  });

  it('üst ve grup başvuruları aynı rolde ve geçerli', () => {
    for (const r of NAV_ROUTES) {
      if (r.parent) {
        const p = NAV_ROUTES.find((x) => x.id === r.parent);
        expect({ id: r.id, parentRole: p?.role }).toEqual({ id: r.id, parentRole: r.role });
      }
      if (r.group) {
        expect({ id: r.id, group: NAV_GROUPS.some((g) => g.id === r.group && g.role === r.role) }).toEqual({ id: r.id, group: true });
      }
      if (r.status === 'secondary') expect({ id: r.id, hasParent: !!r.parent }).toEqual({ id: r.id, hasParent: true });
    }
  });

  it('her rota/grup/kısayol iki dilde etiketli, ikon kayıtlı', () => {
    const icons = new Set<string>(NAV_ICON_NAMES);
    for (const x of [...NAV_ROUTES, ...NAV_GROUPS, ...NAV_SHORTCUTS]) {
      expect(x.label.tr.trim().length).toBeGreaterThan(0);
      expect(x.label.en.trim().length).toBeGreaterThan(0);
      expect(icons.has(x.icon)).toBe(true);
    }
  });

  it('yollar rol önekiyle başlar', () => {
    for (const r of NAV_ROUTES) {
      expect(r.href === `/${r.role}` || r.href.startsWith(`/${r.role}/`)).toBe(true);
    }
  });

  it('müşteri alt sekme çubuğu: Ana Sayfa · Keşfet · TARA · Oyna · Cüzdan', () => {
    const tabs = routesForRole('customer')
      .filter((r) => r.bottomTab != null)
      .sort((a, b) => (a.bottomTab ?? 0) - (b.bottomTab ?? 0));
    expect(tabs.map((t) => t.href)).toEqual(['/customer', '/customer/places', '/customer/scan', '/customer/games', '/customer/wallet']);
    expect(tabs.filter((t) => t.bottomFab).map((t) => t.href)).toEqual(['/customer/scan']);
  });

  it('bayi 9 blok, admin 10 alan', () => {
    const blocks = (role: NavRole) => {
      const seen: string[] = [];
      for (const r of routesForRole(role).filter((x) => x.status === 'primary' && !x.parent)) {
        const key = r.group ? `g:${r.group}` : `i:${r.id}`;
        if (!seen.includes(key)) seen.push(key);
      }
      return seen;
    };
    expect(blocks('dealer')).toHaveLength(9);
    expect(NAV_GROUPS.filter((g) => g.role === 'admin')).toHaveLength(10);
    expect(blocks('admin').every((b) => b.startsWith('g:'))).toBe(true);
  });

  it('kapı ayarı menüde kamuflajlı etiketini ve ikonunu korur, aramada anahtar kelimesi yok', () => {
    const gate = NAV_ROUTES.find((r) => r.href === '/admin/gate-settings');
    expect(gate?.label).toEqual({ tr: 'Gizli Kapı', en: 'Secret Gate' });
    expect(gate?.icon).toBe('Rocket');
    expect(gate?.keywords ?? []).toEqual([]);
  });
});

describe('Menü görünürlük kataloğu (kayıttan türetilir)', () => {
  it('bayi & müşteri katalog anahtarları ve yolları tekil', () => {
    for (const cat of [DEALER_MENU_CATALOG, CUSTOMER_MENU_CATALOG]) {
      expect(new Set(cat.map((i) => i.key)).size).toBe(cat.length);
      expect(new Set(cat.map((i) => i.href)).size).toBe(cat.length);
    }
  });

  it('katalog = kayıtta menuKey taşıyan menü rotaları (iki yönlü)', () => {
    for (const role of ['dealer', 'customer'] as const) {
      const fromRegistry = routesForRole(role)
        .filter((r) => r.menuKey && (r.status === 'primary' || r.status === 'secondary'))
        .map((r) => `${r.menuKey}|${r.href}`)
        .sort();
      const catalog = MENU_CATALOG_BY_ROLE[role].map((i) => `${i.key}|${i.href}`).sort();
      expect(catalog).toEqual(fromRegistry);
    }
  });

  it('getMenuCatalogKeys katalog uzunluğuyla eşit; varsayılanlar açık', () => {
    const defaults = getDefaultVisibilitySettings();
    for (const role of ['dealer', 'customer'] as const) {
      expect(getMenuCatalogKeys(role).length).toBe(MENU_CATALOG_BY_ROLE[role].length);
      for (const key of getMenuCatalogKeys(role)) expect(defaults.menuVisibility[role][key]).toBe(true);
    }
  });

  it('API menü kapısının kullandığı eski anahtarlar katalogda (module-gate assertMenuItemVisible)', () => {
    expect(getMenuCatalogKeys('customer')).toEqual(expect.arrayContaining(['nearby', 'donations']));
    expect(getMenuCatalogKeys('dealer')).toEqual(expect.arrayContaining(['campaigns']));
  });

  it('bayi Ayarlar (abonelik/ödeme) gizlenemez', () => {
    expect(NAV_ROUTES.find((r) => r.id === 'dealer.settings')?.menuKey).toBeUndefined();
  });
});

describe('Dosya sistemi ↔ kayıt (iki yönlü)', () => {
  // Paralel yüzey ajanları yeni sayfaları oluştururken bu liste geçici olarak dolu olabilir;
  // dalga sonunda BOŞ olmalı.
  it('kayıttaki her menü/palet yolunun page.tsx dosyası var', () => {
    const missing = NAV_ROUTES.filter((r) => PALETTE_STATUSES.has(r.status) && !isDynamicHref(r.href) && !pageExists(r.href)).map(
      (r) => `${r.id} → ${r.href}`
    );
    expect(missing).toEqual([]);
  });

  it.each(ROLES)('%s: panel dizinindeki her page.tsx kayıtta', (role) => {
    const list = routesForRole(role);
    const redirectSources = new Set(list.flatMap((r) => r.redirectFrom ?? []));
    const orphans = listPanelPages(role).filter(
      (p) => !list.some((r) => hrefPatternMatches(r.href, p)) && !redirectSources.has(p)
    );
    expect(orphans).toEqual([]);
  });

  // Birleştirilen yüzeyin canlı kopyası kalmasın (B5): eski URL'de dosya varsa yalnız yönlendirme yapar.
  it.each(ROLES)('%s: yönlendirme kaynağı ve emekli rota sayfaları yalnız emekli koçanı', (role) => {
    const list = routesForRole(role);
    const legacy = new Set([
      ...list.flatMap((r) => r.redirectFrom ?? []),
      ...list.filter((r) => r.status === 'deprecated' && !isDynamicHref(r.href)).map((r) => r.href),
    ]);
    const live = [...legacy].filter((href) => {
      const file = path.join(ROOT, 'app', ...href.split('/').filter(Boolean), 'page.tsx');
      return fs.existsSync(file) && !isRetirementStub(file);
    });
    expect(live).toEqual([]);
  });

  // Menü/palet öğesi bir emekli koçanına inmesin (her tıklamada fazladan yönlendirme). Alt öğeleri
  // olan dizin yolu (ör. Cüzdan → Kartım) bilinçli istisnadır.
  it('menü/palet rotası emekli koçanı değil (alt öğeli dizin yolu hariç)', () => {
    const parents = new Set(NAV_ROUTES.flatMap((r) => (r.parent ? [r.parent] : [])));
    const stubs = NAV_ROUTES.filter(
      (r) =>
        PALETTE_STATUSES.has(r.status) &&
        !isDynamicHref(r.href) &&
        !parents.has(r.id) &&
        isRetirementStub(path.join(ROOT, 'app', ...r.href.split('/').filter(Boolean), 'page.tsx'))
    ).map((r) => `${r.id} → ${r.href}`);
    expect(stubs).toEqual([]);
  });
});

describe('Erişilebilirlik (B10)', () => {
  // Daraltılmış menüde yalnız ikon görünür: aynı roldeki menü öğeleri ayırt edilebilmeli.
  it.each(ROLES)('%s: menü öğelerinin (primary/secondary) ikonları tekil', (role) => {
    const menu = routesForRole(role).filter((r) => r.status === 'primary' || r.status === 'secondary');
    const icons = menu.map((r) => r.icon);
    const dupes = menu.filter((r, i) => icons.indexOf(r.icon) !== i).map((r) => `${r.id}:${r.icon}`);
    expect(dupes).toEqual([]);
  });
});

describe('Yönlendirmeler', () => {
  const derived = deriveRedirects();
  const file = path.join(ROOT, 'lib/navigation/redirects.json');

  it('redirects.json kayıtla senkron', () => {
    if (process.env.UPDATE_NAV_REDIRECTS === '1') {
      fs.writeFileSync(file, JSON.stringify(derived, null, 2) + '\n');
    }
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(onDisk).toEqual(derived);
  });

  it('kaynaklar tekil, aktif bir rota değil, zincir/döngü yok', () => {
    const sources = derived.map((r) => r.source);
    expect(sources.filter((s, i) => sources.indexOf(s) !== i)).toEqual([]);
    const activeHrefs = new Set(NAV_ROUTES.filter((r) => r.status !== 'deprecated').map((r) => r.href));
    expect(sources.filter((s) => activeHrefs.has(s))).toEqual([]);
    const sourceSet = new Set(sources);
    expect(derived.filter((r) => sourceSet.has(r.destination.split('?')[0]))).toEqual([]);
  });
});

describe('Eski sidebar kimlikleri göç eder', () => {
  it.each([
    ['admin', adminNavItems],
    ['dealer', dealerNavItems],
    ['customer', customerNavItems],
  ] as const)('%s: her eski kimlik kayıtta çözülür', (role, items) => {
    const unresolved = items.map(getNavOrderId).filter((id) => !resolveRouteId(role, id));
    expect(unresolved).toEqual([]);
  });
});
