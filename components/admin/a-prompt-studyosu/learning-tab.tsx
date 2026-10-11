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

/**
 * Öğrenilen kurallar: anonim toplulaştırmadan LLM ÖNERİ üretir → diff → yönetici onayı.
 * Onaylanmadan hiçbir prompta girmez. Geçmişteki onaylı sürüm yeniden ÖNERİ olarak yüklenebilir.
 */
export default function LearningTab({ initial }: { initial?: LearningState | null }) {
  const query = useQuery({
    queryKey: studioKeys.learning(),
    queryFn: fetchLearning,
    initialData: initial ?? undefined,
    staleTime: 15_000,
    // Eğitim kilidi tutuluyorsa durumu izle (başka admin başlatmış olabilir).
    refetchInterval: (q) => (q.state.data?.status === 'training' ? 5_000 : false),
  });
  return (
    <QueryState query={query} skeleton="detail" error={{ title: 'Öğrenme durumu yüklenemedi' }}>
      {(s) => <LearningBody s={s} />}
    </QueryState>
  );
}

function LearningBody({ s }: { s: LearningState }) {
  const qc = useQueryClient();
  const set = (next: LearningState) => {
    qc.setQueryData(studioKeys.learning(), next);
    qc.invalidateQueries({ queryKey: studioKeys.overview() });
  };
  const train = useMutation({
    mutationFn: runTraining,
    onSuccess: (next) => {
      set(next);
      toast.success('Öneri hazır. İnceleyip onaylayana kadar hiçbir prompta etkisi yok.');
    },
    onError: (e) => {
      toast.error(errorText(e));
      qc.invalidateQueries({ queryKey: studioKeys.learning() });
    },
  });
  const enoughData = s.data.feedbackWithText >= s.minFeedback;
  const training = s.status === 'training' || train.isPending;
  const trainDisabledReason = !s.aiConfigured
    ? 'AI sağlayıcısı yapılandırılmamış.'
    : !enoughData
      ? `Eğitim için en az ${s.minFeedback} metinli geri bildirim gerekir (şu an ${fmtNumber(s.data.feedbackWithText)}).`
      : s.proposal
        ? 'Bekleyen öneri var; önce onu onaylayın ya da reddedin.'
        : null;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Sistem öğrenmesi"
        description="Platform genelinden ANONİM toplulaştırma (sayılar, dağılımlar ve en az 3 farklı işletmede geçen tema etiketleri). Ham yorum metni, işletme/ürün adı ve bayilerin özel bağlamları modele gönderilmez."
        icon={<BrainCircuit />}
        actions={
          training ? (
            <StatusBadge label="Eğitim sürüyor" tone="info" icon={Loader2} />
          ) : s.approval ? (
            <StatusBadge label={`Yürürlükte · sürüm ${s.version}`} tone="success" />
          ) : (
            <StatusBadge label="Onaylı kural yok" tone="neutral" />
          )
        }
      >
        <div className="space-y-4">
          <KeyValueList
            layout="grid"
            columns={3}
            dense
            items={[
              { label: 'Metinli geri bildirim', value: fmtNumber(s.data.feedbackWithText) },
              { label: 'Düzeltme', value: fmtNumber(s.data.corrections) },
              { label: 'Bayi', value: fmtNumber(s.data.dealers) },
              { label: 'Anlamsal vektör (embedding)', value: fmtNumber(s.data.embeddings) },
              { label: 'Son eğitim', value: s.lastTrainedAt ? `${fmtDateTime(s.lastTrainedAt)} (${fmtAgo(s.lastTrainedAt)})` : 'Hiç' },
              {
                label: 'Son onay',
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
                  {training ? 'Eğitiliyor…' : 'Yeni öneri üret'}
                </Button>
              }
              title="Öğrenme önerisi üretilsin mi?"
              description="AI sağlayıcısına anonim özet gönderilir (günlük token tavanı ve dakikalık limit uygulanır). Çıkan öneri ONAY BEKLER; yürürlükteki kurallar siz onaylayana kadar değişmez. Yönetici notları ve temel promptlar bu işlemden etkilenmez."
              irreversibleNote={false}
              confirmLabel="Öneri üret"
              onConfirm={() => train.mutateAsync()}
            />
            {trainDisabledReason ? <p className="qx-small text-fg-muted">{trainDisabledReason}</p> : null}
            {s.trainingSince ? <p className="qx-small text-fg-muted">Başlangıç: {fmtDateTime(s.trainingSince)}</p> : null}
          </div>
          {s.lastRejected ? (
            <p className="qx-small text-fg-muted">
              Son reddedilen öneri: {fmtDateTime(s.lastRejected.rejectedAt)} · {actorName(s.lastRejected.rejectedBy)}
              {s.lastRejected.reason ? ` · “${s.lastRejected.reason}”` : ''}
            </p>
          ) : null}
        </div>
      </SectionCard>

      {s.proposal && s.diff ? <ProposalCard s={s} onDone={set} /> : null}

      <SectionCard title="Yürürlükteki öğrenilen kurallar" description="İçgörü raporu ve AI sohbetinde sınırlı ek bağlam olarak kullanılır (en çok 8 kural, 5 yap, 5 kaçın, 6 tema)." icon={<ShieldCheck />}>
        {s.active ? <PayloadView p={s.active} /> : <EmptyState compact title="Onaylı kural yok" description="Bir öneri üretip onayladığınızda burada görünür. O zamana kadar modeller yalnız temel promptlarla çalışır." />}
      </SectionCard>

      <SectionCard title="Onay geçmişi" description="Önceki onaylı içerikler (son 5). Geri yüklemek yeni bir ÖNERİ oluşturur; yine diff ve onaydan geçer." icon={<History />}>
        {s.history.length === 0 ? (
          <EmptyState compact title="Geçmiş yok" description="İkinci onaydan sonra önceki içerik burada saklanır." />
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
                        Öneri olarak geri yükle
                      </Button>
                    }
                    title="Bu sürüm öneri olarak yüklensin mi?"
                    description="Yürürlükteki kurallar değişmez; yüklenen içerik bekleyen öneri olur ve onayınızı bekler."
                    irreversibleNote={false}
                    confirmLabel="Öneri olarak yükle"
                    onConfirm={async () => {
                      set(await restoreLearning(h.index, s.version));
                      toast.success('Geçmiş sürüm öneri olarak yüklendi.');
                    }}
                  />
                </div>
                <details>
                  <summary className="qx-small min-h-11 cursor-pointer content-center text-brand">İçeriği göster</summary>
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
  const p = s.proposal!;
  const d = s.diff!;
  const [reason, setReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const stats = p.trainingDataStats;
  return (
    <SectionCard
      title="Onay bekleyen öneri"
      description={p.source === 'restore' ? 'Geçmişten geri yüklenen içerik.' : `${fmtDateTime(p.createdAt)} · model ${p.model} · ${p.promptVersion}`}
      icon={<GitCompare />}
      tone="info"
      stripe
    >
      <div className="space-y-5">
        {p.source === 'training' ? (
          <p className="qx-small text-fg-muted">
            Girdi: {fmtNumber(Number(stats.sampledFeedbackCount ?? 0))} örneklenmiş geri bildirim, {fmtNumber(Number(stats.correctionCount ?? 0))} düzeltme,{' '}
            {fmtNumber(Number(stats.dealerCount ?? 0))} bayi; etiket eşiği en az {String(stats.minDealersPerLabel ?? 3)} işletme.
          </p>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-2">
          <ListDiffView title="Kurallar" diff={d.learnedRules} />
          <ListDiffView title="Temalar" diff={d.learnedThemes} />
          <ListDiffView title="Yap" diff={d.guidelinesDo} />
          <ListDiffView title="Kaçın" diff={d.guidelinesAvoid} />
        </div>
        {d.promptAppendix.changed ? <TextDiff before={d.promptAppendix.before} after={d.promptAppendix.after} label="Ek not" /> : null}

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <ConfirmAction
            tone="brand"
            trigger={
              <Button className="min-h-11 sm:min-h-10">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Onayla ve yürürlüğe koy
              </Button>
            }
            title="Öneri yürürlüğe girsin mi?"
            description="Onaylanan kurallar sonraki içgörü raporu ve AI sohbeti çağrılarından itibaren sınırlı ek bağlam olarak kullanılır. Yürürlükteki içerik onay geçmişine taşınır."
            impact={[
              { label: 'Eklenen kural', value: String(d.learnedRules.added.length), emphasis: true },
              { label: 'Kaldırılan kural', value: String(d.learnedRules.removed.length) },
              { label: 'Tema değişimi', value: `+${d.learnedThemes.added.length} / −${d.learnedThemes.removed.length}` },
            ]}
            irreversibleNote={false}
            confirmLabel="Onayla"
            onConfirm={async () => {
              onDone(await decideProposal({ action: 'approve', proposalId: p.id }));
              toast.success('Öğrenilen kurallar yürürlüğe girdi.');
            }}
          />
          <div className="min-w-0 flex-1 basis-64">
            <ReasonInput label="Reddetme gerekçesi" value={reason} onChange={setReason} error={rejectError} />
          </div>
          <ConfirmAction
            tone="danger"
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={!reasonOk(reason)} onClick={() => setRejectError(null)}>
                <XCircle className="h-4 w-4" aria-hidden />
                Reddet
              </Button>
            }
            title="Öneri reddedilsin mi?"
            description="Yürürlükteki kurallar değişmez. Gerekçe denetim geçmişine yazılır."
            irreversibleNote={false}
            confirmLabel="Reddet"
            disabled={!reasonOk(reason)}
            onConfirm={async () => {
              try {
                onDone(await decideProposal({ action: 'reject', proposalId: p.id, reason }));
                toast.success('Öneri reddedildi.');
              } catch (e) {
                setRejectError(errorText(e));
                throw e;
              }
            }}
          />
        </div>
        {!reasonOk(reason) ? <InlineError variant="field" tone="info">Reddetmek için gerekçe yazın.</InlineError> : null}
      </div>
    </SectionCard>
  );
}

function PayloadView({ p }: { p: LearnedPayloadView }) {
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
        <p className="qx-small text-fg-muted">Yok</p>
      )}
    </section>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {block('Kurallar', p.learnedRules)}
      {block(
        'Temalar',
        p.learnedThemes.map((t) => `${t.theme} (${t.priority === 'high' ? 'yüksek' : t.priority === 'low' ? 'düşük' : 'orta'} öncelik${t.count ? ` · ${t.count}` : ''})`)
      )}
      {block('Yap', p.responseGuidelines.do)}
      {block('Kaçın', p.responseGuidelines.avoid)}
      {p.promptAppendix ? <div className="md:col-span-2">{block('Ek not', [p.promptAppendix])}</div> : null}
    </div>
  );
}
