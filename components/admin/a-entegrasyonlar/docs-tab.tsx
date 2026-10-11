'use client';

import { SectionCard } from '@/components/ds/page';
import { API_SCOPES, WEBHOOK_EVENTS } from '@/lib/integrations/contract';
import { CodeBlock } from './secret-reveal';
import { VERIFY_SNIPPET } from './webhook-dialogs';
import { origin } from './format';
import { AdminEntegrasyonlarText } from './copy';

/**
 * Partnere gönderilecek "kurulum paketi": temel adres, kimlik doğrulama, kapsamlar, uçlar,
 * webhook olay şemaları ve imza doğrulama. İçerik kod kataloğundan üretilir (tek kaynak).
 */
export function DocsTab() {
  const base = origin();
  return (
    <div className="space-y-6">
      <SectionCard title="Kimlik doğrulama" description="Her istekte Bearer API anahtarı. Anahtarlar kapsamlı, süreli ve isteğe bağlı olarak bir bayiye/IP listesine bağlıdır.">
        <div className="space-y-4">
          <CodeBlock title="Olay kataloğu (her geçerli anahtar)" code={`curl -H "Authorization: Bearer qrx_…" \\\n  "${base}/api/partner/v1/catalog"`} />
          <CodeBlock title="Bayi 24 saat özeti (kapsam: read:partner_digest)" code={`curl -H "Authorization: Bearer qrx_…" \\\n  "${base}/api/partner/v1/digest"`} />
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-fg">401</dt>
              <dd className="text-fg-muted"><AdminEntegrasyonlarText k="err401" /></dd>
            </div>
            <div>
              <dt className="font-medium text-fg">403</dt>
              <dd className="text-fg-muted"><AdminEntegrasyonlarText k="err403" /></dd>
            </div>
            <div>
              <dt className="font-medium text-fg">503</dt>
              <dd className="text-fg-muted"><AdminEntegrasyonlarText k="err503" /></dd>
            </div>
            <div>
              <dt className="font-medium text-fg"><AdminEntegrasyonlarText k="dealerScope" /></dt>
              <dd className="text-fg-muted"><AdminEntegrasyonlarText k="dealerScopeHint" /></dd>
            </div>
          </dl>
        </div>
      </SectionCard>

      <SectionCard title="Kapsamlar" description="Anahtar yalnız verilen kapsamların uçlarını çağırabilir.">
        <ul className="space-y-2 text-sm">
          {API_SCOPES.map((s) => (
            <li key={s.key} className="rounded-control border border-border p-3">
              <p className="font-mono text-xs text-brand">{s.key}</p>
              <p className="font-medium text-fg">{s.label}</p>
              <p className="text-fg-muted">{s.description}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Webhook olayları"
        description="Gövde: { event, timestamp, data }. Başlıklar: X-Qratex-Event, X-Qratex-Delivery (tekil teslim kimliği), X-Qratex-Timestamp, X-Qratex-Signature (sha256=…, eski) ve X-Qratex-Signature-V2 (t=…,v1=…)."
      >
        <div className="space-y-4">
          {WEBHOOK_EVENTS.map((e) => (
            <CodeBlock
              key={e.key}
              title={`${e.label} · ${e.key}`}
              code={JSON.stringify({ event: e.key, timestamp: '2026-10-11T09:30:00.000Z', data: e.sample }, null, 2)}
            />
          ))}
          <CodeBlock title="İmza doğrulama (Node.js)" code={VERIFY_SNIPPET} />
          <p className="text-sm text-fg-muted">
            Teslim: 8 sn zaman aşımı, geçici hatalarda (ağ, 429, 5xx) en fazla 3 deneme; yönlendirmeler izlenmez. 2xx dışı yanıt başarısız sayılır. Art arda 15 başarısız teslimde uç otomatik duraklatılır.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
