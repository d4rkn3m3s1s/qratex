'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { Target, ArrowRight, Users, Zap, MailOpen, Crown, HeartHandshake, Sprout, CircleDot, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, QueryState, ConfirmAction, InlineError, TONE_CHIP, TONE_TEXT, type Tone, type ImpactPreview } from '@/components/states';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import type { SegmentAction, SegmentSummary } from '@/lib/segment-action-center';
import { segmentCampaignDraft } from '@/lib/innovation-segment-templates';
import { DEFAULT_WIN_BACK_OFFER_ID, WIN_BACK_OFFER_IDS, type WinBackOfferId } from '@/lib/dealer/win-back-offers';
import {
  RISK_OFFER_MAX_NOTIFICATIONS,
  WIN_BACK_ENDPOINT,
  buildProposalRequest,
  buildRiskOfferRequest,
  buildWinBackRequests,
  describeSendResult,
  readRiskOfferResult,
  readWinBackCandidateIds,
  readWinBackSentCount,
  resolveActionKind,
  type ActionRequest,
} from '@/lib/dealer/segment-action-requests';

type SegmentsResponse = { segments: SegmentSummary[]; totalCustomers: number; note?: string };

class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return {};
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function postAction(req: ActionRequest): Promise<Record<string, unknown>> {
  const res = await fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });
  const data = await readJsonSafe(res);
  if (!res.ok) {
    const msg = typeof data.error === 'string' && data.error ? data.error : 'Aksiyon uygulanamadı';
    throw new HttpError(msg, res.status, typeof data.code === 'string' ? data.code : undefined);
  }
  return data;
}

const SEGMENT_ICON: Record<string, LucideIcon> = {
  'Risk Altında': Zap,
  Uyuyan: MailOpen,
  VIP: Crown,
  'Sadık': HeartHandshake,
  Yeni: Sprout,
};

const PRIORITY_TONE: Record<SegmentAction['priority'], Tone> = { high: 'danger', medium: 'warning', low: 'neutral' };
const PRIORITY_LABEL: Record<SegmentAction['priority'], string> = { high: 'Acil', medium: 'Önemli', low: 'İzle' };

function churnTone(churn: number): { tone: Tone; label: string } {
  if (churn >= 0.5) return { tone: 'danger', label: 'Yüksek' };
  if (churn >= 0.25) return { tone: 'warning', label: 'Orta' };
  return { tone: 'success', label: 'Düşük' };
}

const money = (n: number) => `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function SegmentActionCenterPage() {
  const t = useAppT();
  const router = useRouter();
  const [offerBySegment, setOfferBySegment] = useState<Record<string, WinBackOfferId>>({});
  /** Win-back önizlemesinde çözülen alıcılar — onayda AYNI liste kullanılır. */
  const winBackCandidates = useRef<Record<string, string[]>>({});

  const query = useQuery<SegmentsResponse, HttpError>({
    queryKey: ['dealer', 'segment-actions'],
    queryFn: async () => {
      const res = await fetch('/api/dealer/segment-actions');
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new HttpError(typeof data.error === 'string' ? data.error : 'Segmentler yüklenemedi', res.status, typeof data.code === 'string' ? data.code : undefined);
      }
      return {
        segments: Array.isArray(data.segments) ? (data.segments as SegmentSummary[]) : [],
        totalCustomers: typeof data.totalCustomers === 'number' ? data.totalCustomers : 0,
        note: typeof data.note === 'string' ? data.note : undefined,
      };
    },
    staleTime: 60_000,
  });

  const offerFor = (seg: string) => offerBySegment[seg] ?? DEFAULT_WIN_BACK_OFFER_ID;
  const offerLabel = (id: WinBackOfferId) => t(`dealerRadar.winBackOfferOptions.${id}`);

  // ───── Aksiyon tipleri: her biri uçların GERÇEK sözleşmesiyle (lib/dealer/segment-action-requests.ts) ─────

  async function runRiskOffer() {
    const data = await postAction(buildRiskOfferRequest());
    const { sent } = readRiskOfferResult(data);
    const result = describeSendResult(sent);
    if (result.tone === 'success') toast.success(result.message);
    else toast.info(result.message);
  }

  async function loadWinBackImpact(seg: SegmentSummary): Promise<ImpactPreview> {
    const res = await fetch(WIN_BACK_ENDPOINT);
    const data = await readJsonSafe(res);
    if (!res.ok) throw new HttpError(typeof data.error === 'string' ? data.error : 'Alıcılar yüklenemedi', res.status);
    const ids = readWinBackCandidateIds(data);
    winBackCandidates.current[seg.name] = ids;
    return {
      items: [
        { label: 'Karttaki segment', value: `${seg.count.toLocaleString('tr-TR')} müşteri` },
        { label: 'Bu işletmeye 30+ gündür gelmeyen (alıcı)', value: `${ids.length.toLocaleString('tr-TR')} müşteri`, emphasis: true },
        { label: 'Teklif', value: offerLabel(offerFor(seg.name)) },
        { label: 'Kanal', value: 'Uygulama içi bildirim' },
      ],
      warning:
        ids.length === 0
          ? 'Şu an bu işletmeye 30+ gündür gelmeyen müşteri yok; gönderim yapılmayacak.'
          : 'Bildirim onayladığın anda müşterilere gider ve geri alınamaz.',
    };
  }

  async function runWinBack(seg: SegmentSummary) {
    let ids = winBackCandidates.current[seg.name];
    if (!ids) {
      await loadWinBackImpact(seg);
      ids = winBackCandidates.current[seg.name] ?? [];
    }
    const requests = buildWinBackRequests(ids, offerFor(seg.name));
    if (requests.length === 0) {
      toast.info(describeSendResult(0).message);
      return;
    }
    let sent = 0;
    for (const [i, req] of requests.entries()) {
      try {
        const data = await postAction(req);
        sent += readWinBackSentCount(data, (req.body.userIds as string[]).length);
      } catch (e) {
        if (i === 0) throw e; // hiçbir şey gitmedi → diyalog açık kalır, hata gösterilir
        // Kısmi gönderim: tekrar denemek ilk gruplara mükerrer bildirim yollar → diyaloğu kapat, durumu açıkça söyle.
        toast.error(`${sent.toLocaleString('tr-TR')} müşteriye gönderildi; kalanlar gönderilemedi: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
        delete winBackCandidates.current[seg.name];
        return;
      }
    }
    delete winBackCandidates.current[seg.name];
    const result = describeSendResult(sent);
    if (result.tone === 'success') toast.success(result.message);
    else toast.info(result.message);
  }

  async function runProposal(action: SegmentAction) {
    if (!action.proposalSegmentKey) throw new Error('Bu aksiyon için şablon tanımlı değil');
    try {
      await postAction(buildProposalRequest(action.proposalSegmentKey));
    } catch (e) {
      if (e instanceof HttpError && e.status === 403) {
        throw new Error('Segment kampanya taslakları şu an platformda kapalı. Yöneticinle iletişime geç.');
      }
      throw e;
    }
    toast.success('Taslak oluşturuldu — admin onayından sonra gönderebilirsin.', {
      action: { label: 'Taslaklara git', onClick: () => router.push('/dealer/innovation') },
    });
  }

  function renderAction(seg: SegmentSummary) {
    const action = seg.action;
    if (!action) {
      return <p className="qx-small text-fg-muted">Bu segment için otomatik aksiyon önerisi yok.</p>;
    }
    const kind = resolveActionKind(action);
    const ActionIcon = SEGMENT_ICON[seg.name] ?? CircleDot;
    const trigger = (
      <Button size="sm" className="w-full gap-1.5" variant={action.effect === 'draft' ? 'outline' : 'default'}>
        {action.label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    );

    let control: ReactNode = null;
    if (kind === 'risk_offer') {
      control = (
        <ConfirmAction
          trigger={trigger}
          tone="warning"
          title={`${seg.name}: ${action.label}`}
          description="Kayıp riski yüksek müşterilere telafi teklifi bildirimi gönderilir."
          impact={{
            items: [
              { label: 'Karttaki segment', value: `${seg.count.toLocaleString('tr-TR')} müşteri` },
              { label: 'En fazla alıcı', value: `${RISK_OFFER_MAX_NOTIFICATIONS} müşteri`, emphasis: true },
              { label: 'Kanal', value: 'Uygulama içi bildirim' },
            ],
            warning:
              'Alıcılar son 30 günde bu işletmeye yüksek kayıp riskli geri bildirim bırakan müşterilerdir; sayı karttakinden farklı olabilir. Bildirim hemen gider ve geri alınamaz.',
          }}
          irreversibleNote={false}
          confirmLabel="Teklifi gönder"
          onConfirm={runRiskOffer}
        />
      );
    } else if (kind === 'win_back') {
      const selectId = `offer-${seg.name}`;
      control = (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={selectId} className="qx-caption text-fg-muted">Teklif</Label>
            <Select
              value={offerFor(seg.name)}
              onValueChange={(v) => setOfferBySegment((prev) => ({ ...prev, [seg.name]: v as WinBackOfferId }))}
            >
              <SelectTrigger id={selectId} className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIN_BACK_OFFER_IDS.map((id) => (
                  <SelectItem key={id} value={id}>{offerLabel(id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ConfirmAction
            trigger={trigger}
            tone="warning"
            title={`${seg.name}: ${action.label}`}
            description="Bu işletmeye 30 günden uzun süredir gelmeyen müşterilere seçtiğin teklifle bildirim gönderilir."
            loadImpact={() => loadWinBackImpact(seg)}
            irreversibleNote={false}
            confirmLabel="Teklifi gönder"
            onConfirm={() => runWinBack(seg)}
          />
        </div>
      );
    } else if (kind === 'segment_proposal' && action.proposalSegmentKey) {
      const draft = segmentCampaignDraft(action.proposalSegmentKey);
      control = (
        <ConfirmAction
          trigger={trigger}
          tone="brand"
          title={`${seg.name}: ${action.label}`}
          description="Şimdi kimseye bir şey gönderilmez. Taslak admin onayından sonra Yenilik Merkezi'nden gönderilebilir."
          impact={[
            { label: 'Şablon', value: draft.title },
            { label: 'Mesaj', value: <span className="block max-w-[16rem] whitespace-normal text-left">{draft.message}</span> },
            { label: 'Sonuç', value: 'Taslak (onay bekler)', emphasis: true },
          ]}
          irreversibleNote={false}
          confirmLabel="Taslağı oluştur"
          onConfirm={() => runProposal(action)}
        />
      );
    } else {
      control = <InlineError>Bu aksiyon tipi desteklenmiyor.</InlineError>;
    }

    return (
      <div className="space-y-3 rounded-control border bg-surface-muted/60 p-3">
        <div className="flex items-center gap-2">
          <ActionIcon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <p className="qx-small font-semibold text-fg">{action.label}</p>
          <span className={cn('qx-caption ml-auto shrink-0 rounded-chip px-2 py-0.5 font-medium', action.effect === 'send' ? TONE_CHIP.warning : TONE_CHIP.info)}>
            {action.effect === 'send' ? 'Hemen gönderir' : 'Taslak oluşturur'}
          </span>
        </div>
        <p className="qx-small text-fg-muted">{action.rationale}</p>
        {control}
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Target />}
        title="Segment Aksiyon Merkezi"
        description="Müşterilerinin hangi segmentte olduğunu gör; her segment için önerilen aksiyonu önizleyip onaylayarak uygula."
        meta={
          data ? (
            <span className="qx-small inline-flex items-center gap-1.5 text-fg-muted">
              <Users className="h-4 w-4" aria-hidden />
              Toplam <span className="qx-num font-semibold text-fg">{data.totalCustomers.toLocaleString('tr-TR')}</span> müşteri
              <span aria-hidden>·</span> {data.segments.length} segment
            </span>
          ) : null
        }
      />

      <QueryState
        query={query}
        skeleton="cards"
        loadingLabel="Segmentler yükleniyor"
        isEmpty={(d) => d.segments.length === 0}
        error={{ title: 'Segmentler yüklenemedi' }}
        empty={{
          icon: Users,
          title: 'Henüz segment verisi yok',
          description: data?.note ?? 'Müşteri tüketimi biriktikçe segmentler günlük hesaplamayla otomatik oluşur.',
        }}
      >
        {(d) => (
          <div className="space-y-4">
            {d.note && (
              <InlineError variant="banner" tone="info">
                {d.note}
              </InlineError>
            )}
            <ul className="grid gap-4 sm:grid-cols-2">
              {d.segments.map((seg, i) => {
                const pr = seg.action?.priority ?? 'low';
                const tone = PRIORITY_TONE[pr];
                const churn = seg.avgChurn != null ? churnTone(seg.avgChurn) : null;
                return (
                  <Motion.li
                    key={seg.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 6) * 0.04 }}
                    className={cn('min-w-0 space-y-4 rounded-card border bg-surface-1 p-card qx-elevation-1', pr === 'high' && 'border-danger-border')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: seg.color }} />
                        <div className="min-w-0">
                          <h2 className="qx-body font-bold leading-tight text-fg">{seg.name}</h2>
                          <p className="qx-caption text-fg-muted">
                            {seg.count.toLocaleString('tr-TR')} müşteri · ort. {money(seg.avgSpent)}
                          </p>
                        </div>
                      </div>
                      {seg.action && (
                        <span className={cn('qx-caption shrink-0 rounded-chip px-2 py-0.5 font-semibold', TONE_CHIP[tone])}>
                          {PRIORITY_LABEL[pr]}
                        </span>
                      )}
                    </div>

                    <dl className="flex flex-wrap gap-x-6 gap-y-2">
                      <div>
                        <dt className="qx-caption text-fg-muted">Toplam değer</dt>
                        <dd className="qx-num font-semibold text-fg">{money(seg.totalSpent)}</dd>
                      </div>
                      {churn && seg.avgChurn != null && (
                        <div>
                          <dt className="qx-caption text-fg-muted">Ort. kayıp riski</dt>
                          <dd className={cn('qx-num font-semibold', TONE_TEXT[churn.tone])}>
                            %{Math.round(seg.avgChurn * 100)} <span className="qx-caption font-medium">({churn.label})</span>
                          </dd>
                        </div>
                      )}
                    </dl>

                    {renderAction(seg)}
                  </Motion.li>
                );
              })}
            </ul>
          </div>
        )}
      </QueryState>
    </div>
  );
}
