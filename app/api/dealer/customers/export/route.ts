/**
 * GET /api/dealer/customers/export — filtrelenmiş müşteri listesini CSV olarak indirir
 * (liste ile aynı filtre/sıralama; en fazla 5.000 satır). Yalnız işletme sahibi; e-posta maskeli;
 * hücreler formül enjeksiyonuna karşı korunur; Excel (TR) için BOM + noktalı virgül.
 */
import { defineRoute } from '@/lib/http/define-route';
import { CustomerListQuery } from '@/lib/dealer-customers/http';
import { fetchUsers, displayUser, selectRows } from '@/lib/dealer-customers/server';
import { TAG_LABEL_TR, istanbulDayKey, toCsv } from '@/lib/dealer-customers/core';

export const dynamic = 'force-dynamic';

const EXPORT_MAX = 5000;
const RISK_TR = { high: 'Yüksek', medium: 'Orta', low: 'Düşük', unknown: 'Veri yok' } as const;
const BAND_TR = { waking: 'Uyanmak üzere', sleeping: 'Uyuyor', lost: 'Kayıp' } as const;

export const GET = defineRoute(
  {
    name: 'dealer.customers.export',
    roles: ['DEALER'],
    tenant: 'dealer',
    query: CustomerListQuery,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ query, tenant }) => {
    const now = new Date();
    const { filtered } = await selectRows(tenant.dealerId, query, now);
    const rows = filtered.slice(0, EXPORT_MAX);
    const users = new Map<string, NonNullable<Parameters<typeof displayUser>[0]>>();
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = await fetchUsers(rows.slice(i, i + 1000).map((r) => r.customerId));
      for (const [k, v] of chunk) users.set(k, v);
    }
    const day = (d: Date | null) => (d ? istanbulDayKey(d) : '');
    const csv = toCsv(
      ['Müşteri', 'E-posta (maskeli)', 'Etiketler', 'Harcama (₺)', 'Ziyaret', 'Ort. sepet (₺)', 'İlk ziyaret', 'Son ziyaret', 'Geri kazanım', 'Kayıp riski', 'Risk (%)'],
      rows.map((r) => {
        const v = displayUser(users.get(r.customerId));
        return [
          v.anonymized ? 'Anonim müşteri' : v.name ?? 'İsimsiz',
          v.email ?? '',
          r.tags.map((t) => TAG_LABEL_TR[t]).join(', '),
          r.totalSpend.toFixed(2).replace('.', ','),
          r.visitCount,
          r.avgOrderValue.toFixed(2).replace('.', ','),
          day(r.firstVisitAt),
          day(r.lastVisitAt),
          r.band ? BAND_TR[r.band] : '',
          RISK_TR[r.risk],
          r.churnRisk != null ? Math.round(r.churnRisk * 100) : '',
        ];
      })
    );
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="musteriler-${istanbulDayKey(now)}.csv"`,
        'cache-control': 'private, no-store',
      },
    });
  }
);
