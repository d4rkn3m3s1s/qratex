/** ~120 saniyelik canlı senaryo adımları — admin demo paketinin üst katmanı. */

export type DemoScenarioStep = {
  atSec: number;
  title: string;
  detail: string;
  endpoint?: string;
};

export function buildInnovationDemoScenario(dealerId: string): {
  targetDurationSec: number;
  dealerId: string;
  steps: DemoScenarioStep[];
} {
  return {
    targetDurationSec: 120,
    dealerId,
    steps: [
      {
        atSec: 0,
        title: 'Bayi içeriği',
        detail: 'Bu bayi için masa sinyali, flash, özet ve segment taslağı oluşturulur.',
        endpoint: 'POST /api/admin/innovation/demo-package',
      },
      {
        atSec: 15,
        title: 'Sessiz masa sinyali',
        detail: 'Müşteri masadan OK/CONCERN (şikâyet öncesi) bırakır; bayi /dealer/innovation üzerinden görür.',
        endpoint: 'POST /api/innovation/table-pulse',
      },
      {
        atSec: 30,
        title: 'Yakın flash & radar',
        detail: 'Müşteri konumuyla flash listesi ve anonim bölge radarı (keşif kartları dahil).',
        endpoint: 'GET /api/customer/innovation/nearby · GET /api/customer/innovation/radar',
      },
      {
        atSec: 50,
        title: 'Telafi zaman çizelgesi',
        detail: 'Telafi teklifleri remedy timeline ile şeffaf; SLA sağlık skoruna girer.',
        endpoint: 'müşteri telafi / bayi telafi kuyruğu',
      },
      {
        atSec: 70,
        title: 'Deneyim kartı & paylaşım',
        detail: 'Son 3 deneyim özeti; arkadaşa anonim paylaşım linki (7 gün).',
        endpoint: 'GET /api/customer/experiences/at-dealer · POST /api/customer/experience-share',
      },
      {
        atSec: 90,
        title: 'İyileştirme isteği',
        detail: 'Şikâyet değil — yapıcı geri bildirim şablonu + tahmini dönüş süresi.',
        endpoint: 'POST /api/customer/improvement-request',
      },
      {
        atSec: 110,
        title: 'Sağlık skoru 2.0 & partner özeti',
        detail: 'Telafi SLA + masa kapanışı + tekrar ziyaret tek skorda; partner digest webhook.',
        endpoint: 'GET /api/admin/innovation/health-score-v2 · partner digest',
      },
    ],
  };
}
