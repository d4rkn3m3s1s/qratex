/**
 * Modül kapısı bağları — kodla senkron mu? (Özellik ve Deney Kontrolü)
 *
 * `lib/data/module-gate-bindings.json` elle düzenlenmez. Bir route'a `assertModuleEnabled('x')`
 * ya da `defineRoute({ module: 'x' })` eklediğinizde bu test kırılır; yeniden üretmek için:
 *
 *   UPDATE_GATE_BINDINGS=1 npx jest __tests__/admin/a-ozellik-deney/gate-bindings.test.ts
 */
/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { MODULE_CATALOG } from '@/lib/module-controls';
import { controlReadKeys, directGateKeys, helperGateMap, routeEndpoint, scanModuleGates, httpMethods } from '@/lib/admin-flags/gate-scan';

const ROOT = path.resolve(__dirname, '../../..');
const FILE = path.join(ROOT, 'lib/data/module-gate-bindings.json');

describe('gate-scan birimleri', () => {
  it('literal, sabit ve defineRoute modül anahtarlarını bulur; menü görünürlüğünü saymaz', () => {
    const src = `
      const KEY = 'squads';
      await assertModuleEnabled('quests', {});
      await assertCustomerModule('donations', 'donations');
      const b = await isCustomerModuleBlocked(KEY, null);
      await assertMenuItemVisible('rewards', 'customer');
      export const GET = defineRoute({ name: 'x', roles: ['ADMIN'], module: 'campaigns' }, h);
    `;
    expect(directGateKeys(src).sort()).toEqual(['campaigns', 'donations', 'quests', 'squads']);
  });

  it('sarmalayıcı fonksiyonları anahtarlarına eşler', () => {
    const src = `
      export async function assertInviteModule(id: string) { await assertModuleEnabled('referrals', { userId: id }); }
      export function other() { return 1; }
    `;
    expect([...helperGateMap(src).entries()]).toEqual([['assertInviteModule', ['referrals']]]);
  });

  it('modül kontrol okumalarını yalnız katalog anahtarları için sayar', () => {
    const src = `const a = moduleControls.landing_pricing !== false; const b = controls['ab_testing']; controls.length;`;
    expect(controlReadKeys(src, new Set(['landing_pricing', 'ab_testing'])).sort()).toEqual(['ab_testing', 'landing_pricing']);
  });

  it('route yolundan uç ve metot türetir', () => {
    expect(routeEndpoint('app/api/customer/squads/[id]/route.ts')).toBe('/api/customer/squads/[id]');
    expect(routeEndpoint('app/(public)/api/x/route.ts')).toBe('/api/x');
    expect(httpMethods('export const GET = a; export async function POST() {}')).toEqual(['GET', 'POST']);
  });
});

describe('module-gate-bindings.json', () => {
  it('kod tabanıyla senkron', () => {
    const scanned = scanModuleGates(ROOT, MODULE_CATALOG.map((m) => m.key));
    if (process.env.UPDATE_GATE_BINDINGS === '1') {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(scanned, null, 2) + '\n', 'utf8');
    }
    const committed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    expect(committed).toEqual(scanned);
  });
});
