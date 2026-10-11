/**
 * Qra bilgi tabanı tek navigasyon kaydından türetilir (bilgi mimarisi B2): menüdeki her
 * müşteri sayfasının bir amaç metni var, amaç metni olan her kimlik kayıtta yaşıyor, SSS
 * hedefleri menüde ve hiçbir yol emekli bir sayfaya inmiyor.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  QRA_CUSTOMER_FAQ,
  QRA_PURPOSE,
  buildQraKnowledgeBlock,
  buildQraSiteMap,
  qraCustomerRoutes,
} from '@/lib/qra-knowledge-base';
const { isRetirementStub } = require('@/lib/navigation/next-redirects') as { isRetirementStub: (file: string) => boolean };

describe('Qra bilgi tabanı ↔ navigasyon kaydı', () => {
  it('menüdeki her müşteri sayfasının amaç metni var', () => {
    const missing = qraCustomerRoutes().filter((r) => !QRA_PURPOSE[r.id]).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('amaç metni olan her kimlik menüde (eski/emekli sayfa yok)', () => {
    const ids = new Set(qraCustomerRoutes().map((r) => r.id));
    expect(Object.keys(QRA_PURPOSE).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('SSS hedefleri haritada', () => {
    const ids = new Set(buildQraSiteMap().map((e) => e.id));
    expect(QRA_CUSTOMER_FAQ.filter((f) => !ids.has(f.routeId)).map((f) => f.routeId)).toEqual([]);
  });

  it('haritadaki her yol canlı bir sayfa (yönlendirme koçanı yalnız alt sayfalı dizinde)', () => {
    const entries = buildQraSiteMap();
    const parents = new Set(qraCustomerRoutes().flatMap((r) => (r.parent ? [r.parent] : [])));
    const bad = entries.filter((e) => {
      const file = path.join(process.cwd(), 'app', ...e.path.split('/').filter(Boolean), 'page.tsx');
      if (!fs.existsSync(file)) return true;
      return isRetirementStub(file) && !parents.has(e.id);
    });
    expect(bad.map((e) => e.path)).toEqual([]);
  });

  it('istem metni menü yolunu ve sayfa adını taşır', () => {
    const block = buildQraKnowledgeBlock();
    expect(block).toContain('Cüzdan › Ödüller (/customer/wallet/rewards)');
    expect(block).not.toMatch(/\/customer\/(shop|surprise-boxes|my-card|remedy|nearby|feedbacks|badges)\b/);
  });
});
