'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BrainCircuit, CheckCircle2, GitCompare, History, Loader2, Play, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { KeyValueList, StatusBadge } from '@/components/ds/data';
import { ConfirmAction, EmptyState, InlineError, QueryState } from '@/components/states';
import type { LearnedPayloadView, LearningState } from '@/lib/ai-studio/contract';
import { decideProposal, errorText, fetchLearning, restoreLearning, runTraining, studioKeys } from './api';
import { ListDiffView, TextDiff } from './diff-view';
import { actorName, fmtAgo, fmtDateTime, fmtNumber } from './format';
import { ReasonInput, reasonOk } from './parts';
import { usePromptStudioCopy } from './copy';

/**
 * Öğrenilen kurallar: anonim toplulaştırmadan LLM ÖNERİ üretir → diff → yönetici onayı.
 * Onaylanmadan hiçbir prompta girmez. Geçmişteki onaylı sürüm yeniden ÖNERİ olarak yüklenebilir.
 */
export default function LearningTab({ initial }: { initial?: LearningState | null }) {
  const ux = usePromptStudioCopy().ui;
  const query = useQuery({
    queryKey: studioKeys.learning(),
    queryFn: fetchLearning,
    initialData: initial ?? undefined,
    staleTime: 15_000,
    // Eğitim kilidi tutuluyorsa durumu izle (başka admin başlatmış olabilir).
    refetchInterval: (q) => (q.state.data?.status === 'training' ? 5_000 : false),
  });
  return (
    <QueryState query={query} skeleton="detail" error={{ title: ux.ogrenmeDurumuYuklenemedi }}>
      {(s) => <LearningBody s={s} />}
    </QueryState>
  );
}

function LearningBody({ s }: { s: LearningState }) {
  const fz = usePromptStudioCopy().fx;
  const ux = usePromptStudioCopy().ui;
  const px = usePromptStudioCopy();
  const qc = useQueryClient();
  const set = (next: LearningState) => {
    qc.setQueryData(studioKeys.learning(), next);
    qc.invalidateQueries({ queryKey: studioKeys.overview() });
  };
  const train = useMutation({
    mutationFn: runTraining,
    onSuccess: (next) => {
      set(next);
      toast.success(ux.oneriHazirInceleyipOnaylayana);
    },
    onError: (e) => {
      toast.error(errorText(e));
      qc.invalidateQueries({ queryKey: studioKeys.learning() });
    },
  });
  const enoughData = s.data.feedbackWithText >= s.minFeedback;
  const training = s.status === 'training' || train.isPending;
  const trainDisabledReason = !s.aiConfigured
    ? ux.aiSaglayicisiYapilandirilmamis
    : !enoughData
      ? fz.minFeedback(s.minFeedback, fmtNumber(s.data.feedbackWithText))
      : s.proposal
        ? ux.bekleyenOneriVarOnce
        : null;

  return (
    <div className="space-y-6">
      <SectionCard
        title={ux.sistemOgrenmesi}
        description={ux.platformGenelindenAnonimToplulastirma}
        icon={<BrainCircuit />}
        actions={
          training ? (
            <StatusBadge label={ux.egitimSuruyor} tone="info" icon={Loader2} />
          ) : s.approval ? (
            <StatusBadge label={fz.inEffect(s.version)} tone="success" />
          ) : (
            <StatusBadge label={ux.onayliKuralYok} tone="neutral" />
          )
        }
      >
        <div className="space-y-4">
          <KeyValueList
            layout="grid"
            columns={3}
            dense
            items={[
              { label: ux.metinliGeriBildirim, value: fmtNumber(s.data.feedbackWithText) },
              { label: ux.duzeltme, value: fmtNumber(s.data.corrections) },
              { label: ux.bayi, value: fmtNumber(s.data.dealers) },
              { label: ux.anlamsalVektorEmbedding, value: fmtNumber(s.data.embeddings) },
              { label: ux.sonEgitim, value: s.lastTrainedAt ? `${fmtDateTime(s.lastTrainedAt)} (${fmtAgo(s.lastTrainedAt)})` : ux.hic },
              {
                label: ux.sonOnay,
                value: s.approval ? `${fmtDateTime(s.approval.approvedAt)} · ${actorName(s.approval.approvedBy)}` : 'Yok',
              },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <ConfirmAction
              tone="brand"
              trigger={
                <Button className="min-h-11 sm:min-h-10" disabled={training || !!trainDisabledReason}>
                  {training ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                  {training ? ux.egitiliyor : ux.yeniOneriUret}
                </Button>
              }
              title={ux.ogrenmeOnerisiUretilsinMi}
              description={ux.aiSaglayicisinaAnonimOzet}
              irreversibleNote={false}
              confirmLabel={ux.oneriUret}
              onConfirm={() => train.mutateAsync()}
            />
            {trainDisabledReason ? <p className="qx-small text-fg-muted">{trainDisabledReason}</p> : null}
            {s.trainingSince ? <p className="qx-small text-fg-muted">{fz.startedAt} {fmtDateTime(s.trainingSince)}</p> : null}
          </div>
          {s.lastRejected ? (
            <p className="qx-small text-fg-muted">
              {fz.lastRejected} {fmtDateTime(s.lastRejected.rejectedAt)} · {actorName(s.lastRejected.rejectedBy)}
              {s.lastRejected.reason ? ` · “${s.lastRejected.reason}”` : ''}
            </p>
          ) : null}
        </div>
      </SectionCard>

      {s.proposal && s.diff ? <ProposalCard s={s} onDone={set} /> : null}

      <SectionCard title={ux.yururluktekiOgrenilenKurallar} description={ux.icgoruRaporuVeAi} icon={<ShieldCheck />}>
        {s.active ? <PayloadView p={s.active} /> : <EmptyState compact title={ux.onayliKuralYok} description={ux.birOneriUretipOnayladiginizda} />}
      </SectionCard>

      <SectionCard title={ux.onayGecmisi} description={ux.oncekiOnayliIceriklerSon} icon={<History />}>
        {s.history.length === 0 ? (
          <EmptyState compact title={ux.gecmisYok} description={ux.ikinciOnaydanSonraOnceki} />
        ) : (
          <ul className="space-y-3">
            {s.history.map((h) => (
              <li key={h.index} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{h.approvedAt ? fmtDateTime(h.approvedAt) : 'Tarihsiz'}</span>
                  <span className="qx-small text-fg-muted">{actorName(h.approvedBy)}</span>
                  <span className="qx-small text-fg-muted">
                    {h.payload.learnedRules.length} kural · {h.payload.learnedThemes.length} tema
                  </span>
                  <ConfirmAction
                    tone="warning"
                    disabled={!!s.proposal}
                    trigger={
                      <Button variant="outline" size="sm" className="ml-auto min-h-11 sm:min-h-9" disabled={!!s.proposal}>
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        {ux.oneriOlarakGeriYukle}
                      </Button>
                    }
                    title={ux.buSurumOneriOlarak}
                    description={ux.yururluktekiKurallarDegismezYuklenen}
                    irreversibleNote={false}
                    confirmLabel={ux.oneriOlarakYukle}
                    onConfirm={async () => {
                      set(await restoreLearning(h.index, s.version));
                      toast.success(ux.gecmisSurumOneriOlarak);
                    }}
                  />
                </div>
                <details>
                  <summary className="qx-small min-h-11 cursor-pointer content-center text-brand">{px.showContent}</summary>
                  <div className="mt-2">
                    <PayloadView p={h.payload} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function ProposalCard({ s, onDone }: { s: LearningState; onDone: (n: LearningState) => void }) {
  const fz = usePromptStudioCopy().fx;
  const uy = usePromptStudioCopy().ui2;
  const ux = usePromptStudioCopy().ui;
  const px = usePromptStudioCopy();
  const p = s.proposal!;
  const d = s.diff!;
  const [reason, setReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const stats = p.trainingDataStats;
  return (
    <SectionCard
      title={ux.onayBekleyenOneri}
      description={p.source === 'restore' ? ux.gecmistenGeriYuklenenIcerik : `${fmtDateTime(p.createdAt)} · model ${p.model} · ${p.promptVersion}`}
      icon={<GitCompare />}
      tone="info"
      stripe
    >
      <div className="space-y-5">
        {p.source === 'training' ? (
          <p className="qx-small text-fg-muted">
            {fz.input(fmtNumber(Number(stats.sampledFeedbackCount ?? 0)), fmtNumber(Number(stats.correctionCount ?? 0)))}{' '}
            {fz.dealersThreshold(fmtNumber(Number(stats.dealerCount ?? 0)), String(stats.minDealersPerLabel ?? 3))}
          </p>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-2">
          <ListDiffView title={ux.kurallar} diff={d.learnedRules} />
          <ListDiffView title={ux.temalar} diff={d.learnedThemes} />
          <ListDiffView title={ux.yap} diff={d.guidelinesDo} />
          <ListDiffView title={ux.kacin} diff={d.guidelinesAvoid} />
        </div>
        {d.promptAppendix.changed ? <TextDiff before={d.promptAppendix.before} after={d.promptAppendix.after} label={ux.ekNot} /> : null}

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <ConfirmAction
            tone="brand"
            trigger={
              <Button className="min-h-11 sm:min-h-10">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {ux.onaylaVeYururlugeKoy}
              </Button>
            }
            title={ux.oneriYururlugeGirsinMi}
            description={ux.onaylananKurallarSonrakiIcgoru}
            impact={[
              { label: ux.eklenenKural, value: String(d.learnedRules.added.length), emphasis: true },
              { label: ux.kaldirilanKural, value: String(d.learnedRules.removed.length) },
              { label: ux.temaDegisimi, value: `+${d.learnedThemes.added.length} / −${d.learnedThemes.removed.length}` },
            ]}
            irreversibleNote={false}
            confirmLabel={ux.onayla}
            onConfirm={async () => {
              onDone(await decideProposal({ action: 'approve', proposalId: p.id }));
              toast.success(ux.ogrenilenKurallarYururlugeGirdi);
            }}
          />
          <div className="min-w-0 flex-1 basis-64">
            <ReasonInput label={ux.reddetmeGerekcesi} value={reason} onChange={setReason} error={rejectError} />
          </div>
          <ConfirmAction
            tone="danger"
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={!reasonOk(reason)} onClick={() => setRejectError(null)}>
                <XCircle className="h-4 w-4" aria-hidden />
                {uy.reddet}
              </Button>
            }
            title={ux.oneriReddedilsinMi}
            description={ux.yururluktekiKurallarDegismezGerekce}
            irreversibleNote={false}
            confirmLabel={ux.reddet}
            disabled={!reasonOk(reason)}
            onConfirm={async () => {
              try {
                onDone(await decideProposal({ action: 'reject', proposalId: p.id, reason }));
                toast.success(ux.oneriReddedildi);
              } catch (e) {
                setRejectError(errorText(e));
                throw e;
              }
            }}
          />
        </div>
        {!reasonOk(reason) ? <InlineError variant="field" tone="info">{px.rejectNeedsReason}</InlineError> : null}
      </div>
    </SectionCard>
  );
}

function PayloadView({ p }: { p: LearnedPayloadView }) {
  const fz = usePromptStudioCopy().fx;
  const uy = usePromptStudioCopy().ui2;
  const ux = usePromptStudioCopy().ui;
  const block = (title: string, items: string[]) => (
    <section className="space-y-1">
      <h4 className="qx-small font-medium text-fg">{title}</h4>
      {items.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-fg">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="qx-small text-fg-muted">{uy.yok}</p>
      )}
    </section>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {block('Kurallar', p.learnedRules)}
      {block(
        'Temalar',
        p.learnedThemes.map((t) => fz.themeLine(t.theme, t.priority === 'high' ? fz.prioHigh : t.priority === 'low' ? fz.prioLow : fz.prioMid, t.count ?? 0))
      )}
      {block('Yap', p.responseGuidelines.do)}
      {block(ux.kacin, p.responseGuidelines.avoid)}
      {p.promptAppendix ? <div className="md:col-span-2">{block('Ek not', [p.promptAppendix])}</div> : null}
    </div>
  );
}
