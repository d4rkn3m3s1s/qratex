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
import { useSourceT } from '@/components/ds/page/source-dict';
import { DS_DICT, useDesignSystemCopy } from '../copy';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
      <p className="qx-caption font-mono text-fg-muted">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function PrimitivesSection() {
  const uy = useDesignSystemCopy().ui2;
  const ux = useDesignSystemCopy().ui;
  const dx = useDesignSystemCopy();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('ornek@');
  const [on, setOn] = useState(true);
  const emailError = email.includes('@') && email.split('@')[1]?.includes('.') ? null : ux.gecerliBirEPosta;

  return (
    <SectionCard title={ux.temelBilesenler} description={ux.componentsUiShadcnTabanli}>
      <div className="space-y-5">
        <Row label={ux.button}>
          <Button>Birincil</Button>
          <Button variant="secondary">{dx.secondary}</Button>
          <Button variant="outline">{dx.outline}</Button>
          <Button variant="ghost">Hayalet</Button>
          <Button variant="destructive">
            <Trash2 className="h-4 w-4" aria-hidden />
            {uy.sil}
          </Button>
          <Button variant="link">{dx.link}</Button>
        </Row>
        <Row label={ux.buttonLoading}>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1600);
            }}
          >
            {uy.kaydet}
          </Button>
          <span className="qx-caption text-fg-muted">{dx.loadingNote}</span>
        </Row>
        <Row label={ux.badge}>
          <Badge>{dx.defaultLabel}</Badge>
          <Badge variant="brand">Marka</Badge>
          <Badge variant="success">{uy.aktif}</Badge>
          <Badge variant="warning">Beklemede</Badge>
          <Badge variant="danger">{uy.hata}</Badge>
          <Badge variant="info">{uy.bilgi}</Badge>
          <Badge variant="outline">{dx.outline}</Badge>
        </Row>
        <Row label={ux.alert}>
          <div className="grid w-full gap-2 lg:grid-cols-2">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>{dx.paymentFailed}</AlertTitle>
              <AlertDescription>{uy.kartBilgileriniziKontrolEdip}</AlertDescription>
            </Alert>
            <Alert variant="success">
              <Activity className="h-4 w-4" aria-hidden />
              <AlertTitle>{dx.campaignLive}</AlertTitle>
              <AlertDescription>{dx.firstDayScans}</AlertDescription>
            </Alert>
          </div>
        </Row>
        <Row label={ux.inputInlineerror}>
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
        <Row label={ux.switchProgress}>
          <div className="flex items-center gap-2">
            <Switch id="qdl-switch" checked={on} onCheckedChange={setOn} />
            <Label htmlFor="qdl-switch">Bildirimler</Label>
          </div>
          <div className="w-full max-w-xs">
            <Progress value={64} aria-label={ux.profilTamamlanma} />
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
  const fz = useDesignSystemCopy().fx;
  const L = useSourceT(DS_DICT);
  const ux = useDesignSystemCopy().ui;
  const dx = useDesignSystemCopy();
  const [kind, setKind] = useState<DemoKind>('ready');
  const [visits, setVisits] = useState(12480);
  const [failNext, setFailNext] = useState(false);

  return (
    <div className="space-y-section">
      <SectionCard
        title={ux.querystateTekVeriDurum}
        description={ux.loadingStatikIskeletError}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={ux.durumSec}>
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
                {L(DEMO_LABEL[k])}
              </button>
            ))}
          </div>
          <div className="rounded-card border border-dashed p-3 sm:p-4">
            <QueryState
              query={demoQuery(kind, () => new Promise<void>((r) => window.setTimeout(() => { setKind('ready'); r(); }, 900)))}
              skeleton="table"
              empty={{
                variant: 'first-use',
                title: ux.henuzSubeEklenmedi,
                description: ux.ilkSubeniziEkleyincePuan,
                action: (
                  <Button size="sm">
                    <Plus className="h-4 w-4" aria-hidden />
                    {ux.subeEkle}
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
        <SectionCard title={ux.emptystate} description="variant: first-use · no-results · filtered · permission">
          <div className="grid gap-2 sm:grid-cols-2">
            <EmptyState compact variant="no-results" />
            <EmptyState compact variant="permission" />
          </div>
        </SectionCard>
        <SectionCard title={ux.errorstate} description={ux.kindGenericOfflineForbidden}>
          <ErrorState kind="generic" onRetry={() => new Promise((r) => window.setTimeout(r, 900))} digest="a1b2c3" />
        </SectionCard>
      </div>

      <SectionCard
        title={ux.stattile}
        description={ux.degerDegisimIkonMetin}
        actions={
          <Button size="sm" variant="outline" onClick={() => setVisits((v) => v + 487)}>
            {ux.degeriArtir}
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={ux.ziyaret} value={visits} icon={<Users />} tone="brand" delta={{ value: 12.4 }} hint={ux.son30Gun} />
          <StatTile label={ux.ortalamaPuan} value={4.62} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} unit="/ 5" icon={<Star />} tone="warning" delta={{ value: 0.3, format: 'absolute' }} hint={ux.n842Yanit} />
          <StatTile label={ux.sikayet} value={37} icon={<MessageSquare />} tone="danger" delta={{ value: -18, goodDirection: 'down' }} hint={ux.azalmasiIyi} />
          <StatTile label={ux.donusum} value={null} loading icon={<Activity />} tone="info" />
        </div>
      </SectionCard>

      <SectionCard
        title={ux.confirmaction}
        description={ux.etkiOnizlemesiSunucudanTipli}
      >
        <div className="flex flex-wrap items-center gap-3">
          <ConfirmAction
            trigger={
              <Button variant="destructive">
                <Trash2 className="h-4 w-4" aria-hidden />
                {ux.kampanyayiSil}
              </Button>
            }
            title={ux.yazKampanyasiSilinsinMi}
            description={ux.kampanyaVeOnaBagli}
            loadImpact={() =>
              new Promise((r) =>
                window.setTimeout(
                  () =>
                    r({
                      items: [
                        { label: ux.bagliQrKod, value: 14 },
                        { label: ux.bekleyenOdul, value: 3, emphasis: true },
                        { label: ux.son30GunTarama, value: '2.418' },
                      ],
                      warning: ux.t3MusterininBekleyenOdulu,
                    }),
                  700,
                ),
              )
            }
            confirmPhrase={ux.yazKampanyasi}
            confirmLabel={ux.kaliciOlarakSil}
            onConfirm={() =>
              new Promise<void>((resolve, reject) =>
                window.setTimeout(() => (failNext ? reject(new Error(fz.serverConflict)) : resolve()), 900),
              )
            }
          />
          <ConfirmAction
            trigger={<Button variant="outline">{dx.sendNotification}</Button>}
            tone="brand"
            title={ux.bildirim1204Musteriye}
            impact={[
              { label: ux.alici, value: '1.204' },
              { label: ux.kanal, value: 'Push + e-posta' },
            ]}
            onConfirm={() => new Promise((r) => window.setTimeout(r, 600))}
          />
          <label className="qx-small inline-flex items-center gap-2 text-fg-muted">
            <Switch checked={failNext} onCheckedChange={setFailNext} aria-label={ux.sonrakiSilmeHataVersin} />
            {ux.silmeHataVersinDiyalog}
          </label>
        </div>
      </SectionCard>
    </div>
  );
}
