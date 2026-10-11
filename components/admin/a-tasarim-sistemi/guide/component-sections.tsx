'use client';

import { useState } from 'react';
import { Activity, AlertCircle, MessageSquare, Plus, Star, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  ConfirmAction,
  EmptyState,
  ErrorState,
  InlineError,
  QueryState,
  SectionCard,
  StatTile,
  type QueryLike,
} from '@/components/states';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
      <p className="qx-caption font-mono text-fg-muted">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function PrimitivesSection() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('ornek@');
  const [on, setOn] = useState(true);
  const emailError = email.includes('@') && email.split('@')[1]?.includes('.') ? null : 'Geçerli bir e-posta adresi girin.';

  return (
    <SectionCard title="Temel bileşenler" description="components/ui — shadcn tabanlı; QDL rol token'larına bağlı. API'ler geriye uyumlu.">
      <div className="space-y-5">
        <Row label="Button">
          <Button>Birincil</Button>
          <Button variant="secondary">İkincil</Button>
          <Button variant="outline">Çerçeve</Button>
          <Button variant="ghost">Hayalet</Button>
          <Button variant="destructive">
            <Trash2 className="h-4 w-4" aria-hidden />
            Sil
          </Button>
          <Button variant="link">Bağlantı</Button>
        </Row>
        <Row label="Button loading">
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1600);
            }}
          >
            Kaydet
          </Button>
          <span className="qx-caption text-fg-muted">Etiket korunur, genişlik zıplamaz, aria-busy.</span>
        </Row>
        <Row label="Badge">
          <Badge>Varsayılan</Badge>
          <Badge variant="brand">Marka</Badge>
          <Badge variant="success">Aktif</Badge>
          <Badge variant="warning">Beklemede</Badge>
          <Badge variant="danger">Hata</Badge>
          <Badge variant="info">Bilgi</Badge>
          <Badge variant="outline">Çerçeve</Badge>
        </Row>
        <Row label="Alert">
          <div className="grid w-full gap-2 lg:grid-cols-2">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>Ödeme alınamadı</AlertTitle>
              <AlertDescription>Kart bilgilerinizi kontrol edip tekrar deneyin.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <Activity className="h-4 w-4" aria-hidden />
              <AlertTitle>Kampanya yayında</AlertTitle>
              <AlertDescription>İlk 24 saatte 128 tarama.</AlertDescription>
            </Alert>
          </div>
        </Row>
        <Row label="Input + InlineError">
          <div className="w-full max-w-sm space-y-1">
            <Label htmlFor="qdl-email">E-posta</Label>
            <Input
              id="qdl-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!emailError}
              errorId="qdl-email-error"
            />
            <InlineError id="qdl-email-error">{emailError}</InlineError>
          </div>
        </Row>
        <Row label="Switch / Progress">
          <div className="flex items-center gap-2">
            <Switch id="qdl-switch" checked={on} onCheckedChange={setOn} />
            <Label htmlFor="qdl-switch">Bildirimler</Label>
          </div>
          <div className="w-full max-w-xs">
            <Progress value={64} aria-label="Profil tamamlanma" />
          </div>
        </Row>
      </div>
    </SectionCard>
  );
}

type DemoKind = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden' | 'stale' | 'refreshing';

const DEMO_LABEL: Record<DemoKind, string> = {
  loading: 'Yükleniyor',
  ready: 'Hazır',
  empty: 'Boş',
  error: 'Hata',
  forbidden: 'Yetkisiz',
  stale: 'Bayat veri',
  refreshing: 'Yenileniyor',
};

const ROWS = [
  { id: 1, name: 'Kadıköy Şubesi', score: 4.7 },
  { id: 2, name: 'Beşiktaş Şubesi', score: 4.4 },
  { id: 3, name: 'Üsküdar Şubesi', score: 4.1 },
];

function demoQuery(kind: DemoKind, refetch: () => void): QueryLike<typeof ROWS> {
  switch (kind) {
    case 'loading':
      return { isLoading: true, refetch };
    case 'empty':
      return { data: [], refetch };
    case 'error':
      return { isError: true, error: new Error('500'), refetch };
    case 'forbidden':
      return { isError: true, error: { status: 403 }, refetch };
    case 'stale':
      return { data: ROWS, isError: true, error: new Error('503'), refetch };
    case 'refreshing':
      return { data: ROWS, isFetching: true, refetch };
    case 'ready':
    default:
      return { data: ROWS, refetch };
  }
}

export function StatesSection() {
  const [kind, setKind] = useState<DemoKind>('ready');
  const [visits, setVisits] = useState(12480);
  const [failNext, setFailNext] = useState(false);

  return (
    <div className="space-y-section">
      <SectionCard
        title="QueryState — tek veri-durum bileşeni"
        description="loading (statik iskelet) · error (+ tekrar dene; türüne göre metin) · empty · ready (+ bayat veri bandı, arka plan yenileme). Hata asla boş liste gibi görünmez. Örnek satırlar bileşen gösterimidir."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Durum seç">
            {(Object.keys(DEMO_LABEL) as DemoKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'qx-caption min-h-9 rounded-chip border px-2.5 font-medium transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  kind === k ? 'border-brand-border bg-brand-subtle text-brand' : 'bg-surface-1 text-fg-muted hover:text-fg',
                )}
              >
                {DEMO_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="rounded-card border border-dashed p-3 sm:p-4">
            <QueryState
              query={demoQuery(kind, () => new Promise<void>((r) => window.setTimeout(() => { setKind('ready'); r(); }, 900)))}
              skeleton="table"
              empty={{
                variant: 'first-use',
                title: 'Henüz şube eklenmedi',
                description: 'İlk şubenizi ekleyince puan ve geri bildirimler burada listelenir.',
                action: (
                  <Button size="sm">
                    <Plus className="h-4 w-4" aria-hidden />
                    Şube ekle
                  </Button>
                ),
              }}
            >
              {(rows) => (
                <ul className="divide-y rounded-control border bg-surface-1">
                  {rows.map((r) => (
                    <li key={r.id} className="qx-small flex items-center justify-between px-4 py-3 text-fg">
                      {r.name}
                      <span className="qx-num inline-flex items-center gap-1 font-semibold">
                        <Star className="h-3.5 w-3.5 text-warning" aria-hidden />
                        {r.score.toLocaleString('tr-TR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-section lg:grid-cols-2">
        <SectionCard title="EmptyState" description="variant: first-use · no-results · filtered · permission">
          <div className="grid gap-2 sm:grid-cols-2">
            <EmptyState compact variant="no-results" />
            <EmptyState compact variant="permission" />
          </div>
        </SectionCard>
        <SectionCard title="ErrorState" description="kind: generic · offline · forbidden · moduleDisabled · notFound; digest gösterimi">
          <ErrorState kind="generic" onRetry={() => new Promise((r) => window.setTimeout(r, 900))} digest="a1b2c3" />
        </SectionCard>
      </div>

      <SectionCard
        title="StatTile"
        description="Değer + değişim (ikon + metin; yalnız renge dayanmaz) + örneklem. Değer değişince sayar; ilk boyamada saymaz. Bu bölümdeki sayılar bileşen örneğidir, platform verisi değildir."
        actions={
          <Button size="sm" variant="outline" onClick={() => setVisits((v) => v + 487)}>
            Değeri artır
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Ziyaret" value={visits} icon={<Users />} tone="brand" delta={{ value: 12.4 }} hint="Son 30 gün" />
          <StatTile label="Ortalama puan" value={4.62} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} unit="/ 5" icon={<Star />} tone="warning" delta={{ value: 0.3, format: 'absolute' }} hint="n = 842 yanıt" />
          <StatTile label="Şikâyet" value={37} icon={<MessageSquare />} tone="danger" delta={{ value: -18, goodDirection: 'down' }} hint="Azalması iyi" />
          <StatTile label="Dönüşüm" value={null} loading icon={<Activity />} tone="info" />
        </div>
      </SectionCard>

      <SectionCard
        title="ConfirmAction"
        description="Etki önizlemesi (sunucudan), tipli onay, işlem bitene kadar açık kalma, hata olursa kapanmadan gösterme. Native confirm() ve tek tıkla kalıcı işlem yerine. Buradaki düğmeler yalnız diyaloğu gösterir; hiçbir kayıt değişmez."
      >
        <div className="flex flex-wrap items-center gap-3">
          <ConfirmAction
            trigger={
              <Button variant="destructive">
                <Trash2 className="h-4 w-4" aria-hidden />
                Kampanyayı sil
              </Button>
            }
            title="“Yaz Kampanyası” silinsin mi?"
            description="Kampanya ve ona bağlı QR yönlendirmeleri kalıcı olarak kaldırılır."
            loadImpact={() =>
              new Promise((r) =>
                window.setTimeout(
                  () =>
                    r({
                      items: [
                        { label: 'Bağlı QR kod', value: 14 },
                        { label: 'Bekleyen ödül', value: 3, emphasis: true },
                        { label: 'Son 30 gün tarama', value: '2.418' },
                      ],
                      warning: '3 müşterinin bekleyen ödülü iptal edilecek.',
                    }),
                  700,
                ),
              )
            }
            confirmPhrase="Yaz Kampanyası"
            confirmLabel="Kalıcı olarak sil"
            onConfirm={() =>
              new Promise<void>((resolve, reject) =>
                window.setTimeout(() => (failNext ? reject(new Error('Sunucu 409: kampanya şu an kullanımda.')) : resolve()), 900),
              )
            }
          />
          <ConfirmAction
            trigger={<Button variant="outline">Bildirimi gönder</Button>}
            tone="brand"
            title="Bildirim 1.204 müşteriye gönderilsin mi?"
            impact={[
              { label: 'Alıcı', value: '1.204' },
              { label: 'Kanal', value: 'Push + e-posta' },
            ]}
            onConfirm={() => new Promise((r) => window.setTimeout(r, 600))}
          />
          <label className="qx-small inline-flex items-center gap-2 text-fg-muted">
            <Switch checked={failNext} onCheckedChange={setFailNext} aria-label="Sonraki silme hata versin" />
            Silme hata versin (diyalog açık kalır)
          </label>
        </div>
      </SectionCard>
    </div>
  );
}
