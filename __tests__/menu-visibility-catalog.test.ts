/**
 * Menü kataloğu ile sidebar / ayarlar tutarlılığı.
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

function assertUniqueKeys(items: { key: string }[]) {
  const keys = items.map((i) => i.key);
  expect(new Set(keys).size).toBe(keys.length);
}

function assertUniqueHrefs(items: { href: string }[]) {
  const hrefs = items.map((i) => i.href);
  expect(new Set(hrefs).size).toBe(hrefs.length);
}

describe('Menu visibility catalog', () => {
  it('dealer & customer catalog keys and hrefs are unique', () => {
    assertUniqueKeys(DEALER_MENU_CATALOG);
    assertUniqueHrefs(DEALER_MENU_CATALOG);
    assertUniqueKeys(CUSTOMER_MENU_CATALOG);
    assertUniqueHrefs(CUSTOMER_MENU_CATALOG);
  });

  it('getMenuCatalogKeys matches catalog length', () => {
    expect(getMenuCatalogKeys('dealer').length).toBe(DEALER_MENU_CATALOG.length);
    expect(getMenuCatalogKeys('customer').length).toBe(CUSTOMER_MENU_CATALOG.length);
  });

  it('defaults include every catalog menu key as true', () => {
    const defaults = getDefaultVisibilitySettings();
    for (const role of ['dealer', 'customer'] as const) {
      for (const key of getMenuCatalogKeys(role)) {
        expect(defaults.menuVisibility[role][key]).toBe(true);
      }
    }
  });

  it('dealer sidebar contains every catalog key and href', () => {
    const sidebarPath = path.join(process.cwd(), 'components/dashboard/sidebar.tsx');
    const src = fs.readFileSync(sidebarPath, 'utf8');
    const dealerBlock = src.split('const dealerNavItems')[1]?.split('const customerNavItems')[0] ?? '';
    expect(dealerBlock.length).toBeGreaterThan(100);
    for (const item of MENU_CATALOG_BY_ROLE.dealer) {
      expect(dealerBlock).toContain(`key: '${item.key}'`);
      expect(dealerBlock).toContain(`href: '${item.href}'`);
    }
  });

  it('customer sidebar contains every catalog key and href', () => {
    const sidebarPath = path.join(process.cwd(), 'components/dashboard/sidebar.tsx');
    const src = fs.readFileSync(sidebarPath, 'utf8');
    const customerBlock = src.split('const customerNavItems')[1]?.split('];')[0] ?? '';
    expect(customerBlock.length).toBeGreaterThan(100);
    for (const item of MENU_CATALOG_BY_ROLE.customer) {
      expect(customerBlock).toContain(`key: '${item.key}'`);
      expect(customerBlock).toContain(`href: '${item.href}'`);
    }
  });
});
