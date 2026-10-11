'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  History,
  MessageSquareText,
  Pencil,
  Plus,
  Reply,
  Siren,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PanelPage, PageHeader, SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { IconButton } from '@/components/ds/a11y';
import { ConfirmAction, InlineError, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { useMotionPolicy } from '@/lib/motion';
import { replyRuleBodySchema, type ReplyRuleBody } from '@/lib/dealer-automation/reply-rules';
import { AUTOMATION_KEYS, type RepliesOverviewDto, type ReplyRuleDto } from '@/lib/dealer-automation/types';
import {
  createReplyRule,
  deleteReplyRule,
  errorText,
  fetchReplies,
  fetchReplyRuns,
  fmtDateTime,
  fmtInt,
  fmtRelative,
  reorderReplyRules,
  setReplyRuleState,
} from './api';
import { AutomationNav } from './automation-nav';
import type { ReplyEditorState } from './reply-editor';

// Düzenleyici (form + önizleme) yalnız açılınca yüklenir.
const ReplyEditor = dynamic(() => import('./reply-editor').then((mod) => mod.ReplyEditor), { ssr: false });

const PRESETS: Array<{ title: string; hint: string; body: ReplyRuleBody }> = [
  {
    title: 'Düşük puana özür yanıtı',
    hint: 'Puan 2 ve altı → kişisel özür',
    body: {
      name: 'Düşük puana özür',
      condition: { field: 'rating', op: 'lte', value: 2 },
      action: 'reply',
      template:
        'Merhaba {{musteri}}, yaşadığınız olumsuz deneyim için gerçekten üzgünüz. Geri bildiriminizi ekibimizle paylaştık; bir sonraki ziyaretinizde farkı göstermek isteriz. — {{isletme}}',
      tone: null,
      isActive: true,
    },
  },
  {
    title: '1 yıldızda vaka aç',
    hint: 'Sorumlu atanıp takip edilsin',
    body: {
      name: '1 yıldız → vaka',
      condition: { field: 'rating', op: 'eq', value: 1 },
      action: 'incident',
      template: '1 yıldızlı geri bildirim: müşteriyle 24 saat içinde iletişime geçin.',
      tone: null,
      isActive: true,
    },
  },
  {
    title: '5 yıldıza teşekkür',
    hint: 'Memnun müşteriye sıcak bir yanıt',
    body: {
      name: '5 yıldıza teşekkür',
      condition: { field: 'rating', op: 'gte', value: 5 },
      action: 'reply',
      template: 'Teşekkürler {{musteri}}! Güzel yorumunuz ekibimizi çok mutlu etti. Sizi yeniden ağırlamayı dört gözle bekliyoruz. — {{isletme}}',
      tone: null,
      isActive: true,
    },
  },
  {
    title: 'Bekleme şikâyetinde vaka',
    hint: '“bekledim”, “geç geldi”, “yavaş” geçerse',
    body: {
      name: 'Bekleme şikâyeti',
      condition: { field: 'text', op: 'contains', keywords: ['bekledim', 'geç geldi', 'yavaş'], wholeWord: false },
      action: 'incident',
      template: 'Servis hızı şikâyeti — vardiya sorumlusu kontrol etsin.',
      tone: null,
      isActive: true,
    },
  },
];

export function RepliesScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: AUTOMATION_KEYS.replies, queryFn: ({ signal }) => fetchReplies(signal), staleTime: 30_000 });
  const [editor, setEditor] = useState<ReplyEditorState>(null);
  const atLimit = !!q.data && q.data.rules.length >= q.data.limit;

  const refresh = () => qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.replies });

  const newButton = (
    <Button
      onClick={() => setEditor({ mode: 'create' })}
      disabled={!q.data || atLimit}
      title={atLimit ? `En fazla ${q.data?.limit} kural tanımlanabilir.` : undefined}
      className="min-h-11"
    >
      <Plus className="mr-2 h-4 w-4" aria-hidden />
      Yeni kural
    </Button>
  );

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Otomasyon"
          title="Otomatik yanıtlar"
          description="Geri bildirim geldiği anda koşula göre müşteriye yanıt yazın ya da vaka açın. Her geri bildirim için en fazla bir kural, bir kez çalışır."
          icon={<Reply className="h-5 w-5" aria-hidden />}
          actions={newButton}
          meta={<AutomationNav />}
        />
      }
    >
      <QueryState query={q} skeleton="list" onRetry={() => q.refetch()} isEmpty={() => false}>
        {(data) => (
          <>
            <Summary data={data} />
            <Warnings data={data} />
            {data.rules.length === 0 ? (
              <Presets onPick={(body) => setEditor({ mode: 'create', preset: body })} />
            ) : (
              <SectionCard
                title="Kurallar"
                description="Yukarıdan aşağı değerlendirilir; geri bildirime uyan İLK kural çalışır, diğerleri atlanır. Sırayı oklarla değiştirin."
                actions={<span className="qx-caption tabular-nums text-fg-muted">{fmtInt(data.rules.length)}/{fmtInt(data.limit)} kural</span>}
              >
                <RuleList
                  data={data}
                  atLimit={atLimit}
                  onEdit={(rule) => setEditor({ mode: 'edit', rule })}
                  onDuplicate={(rule) =>
                    rule.condition &&
                    setEditor({
                      mode: 'create',
                      preset: {
                        name: `${rule.name} (kopya)`.slice(0, 80),
                        condition: rule.condition,
                        action: rule.action,
                        template: rule.template,
                        tone: rule.toneMissing ? null : rule.tone,
                        isActive: false,
                      },
                    })
                  }
                />
              </SectionCard>
            )}
            {data.rules.length > 0 && data.rules.length < 3 && !atLimit && (
              <Presets compact onPick={(body) => setEditor({ mode: 'create', preset: body })} />
            )}
            {editor && (
              <ReplyEditor
                state={editor}
                overview={data}
                onClose={() => setEditor(null)}
                onSaved={() => {
                  setEditor(null);
                  void refresh();
                }}
              />
            )}
          </>
        )}
      </QueryState>
    </PanelPage>
  );
}

function Summary({ data }: { data: RepliesOverviewDto }) {
  return (
    <MetricGrid cols={4}>
      <MetricTile
        label="Etkin kural"
        metric={{ value: data.summary.activeCount }}
        icon={<Zap className="h-4 w-4" aria-hidden />}
        hint={`${fmtInt(data.rules.length)}/${fmtInt(data.limit)} kural tanımlı`}
      />
      <MetricTile label="Otomatik yanıt (7 gün)" metric={{ value: data.summary.replies7 }} icon={<MessageSquareText className="h-4 w-4" aria-hidden />} />
      <MetricTile
        label="Açılan vaka (7 gün)"
        metric={{ value: data.summary.incidents7 }}
        icon={<Siren className="h-4 w-4" aria-hidden />}
        href="/dealer/inbox/incidents"
      />
      <MetricTile
        label="Tetiklenemeyen kural"
        metric={{ value: data.summary.brokenCount }}
        tone={data.summary.brokenCount > 0 ? 'warning' : undefined}
        icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
        hint="Kayıtlı koşulu geçersiz olan kurallar hiç çalışmaz."
      />
    </MetricGrid>
  );
}

function Warnings({ data }: { data: RepliesOverviewDto }) {
  const usesTone = data.rules.some((r) => r.isActive && r.tone);
  const usesSentiment = data.rules.some((r) => r.isActive && r.condition?.field === 'sentiment');
  return (
    <div className="space-y-2">
      {data.summary.brokenCount > 0 && (
        <InlineError variant="banner" tone="warning">
          {fmtInt(data.summary.brokenCount)} kuralın koşulu geçersiz (ör. “Metin ≤ 2”) ve hiç tetiklenmiyor. İşaretli kuralları düzenleyip koşulu yeniden seçin.
        </InlineError>
      )}
      {usesTone && data.ai.canUseAi === false && (
        <InlineError variant="banner" tone="info">
          AI ayarınız kapalı: “AI ile kişiselleştir” kuralları şu an yedek metni gönderiyor.{' '}
          <Link href="/dealer/settings" className="font-medium underline underline-offset-2">
            AI ayarları
          </Link>
        </InlineError>
      )}
      {usesSentiment && data.ai.canAnalyze === false && (
        <InlineError variant="banner" tone="info">
          Otomatik AI analizi kapalı olduğu için duygu koşullu kurallar tetiklenmiyor.
        </InlineError>
      )}
    </div>
  );
}

function Presets({ onPick, compact }: { onPick: (b: ReplyRuleBody) => void; compact?: boolean }) {
  return (
    <SectionCard
      title={compact ? 'Hazır kural ekleyin' : 'Henüz kural yok — hazır bir kuralla başlayın'}
      description="Seçtiğiniz kural düzenleyicide açılır; kaydetmeden önce son 30 günde kaç geri bildirime uyacağını görürsünüz."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {PRESETS.map((p) => (
          <li key={p.title}>
            <button
              type="button"
              onClick={() => onPick(replyRuleBodySchema.parse(p.body))}
              className="flex min-h-11 w-full items-start gap-3 rounded-card border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="mt-0.5 rounded-control bg-brand-subtle p-2 text-brand" aria-hidden>
                {p.body.action === 'incident' ? <Siren className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-fg">{p.title}</span>
                <span className="qx-small text-fg-muted">{p.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function RuleList({
  data,
  atLimit,
  onEdit,
  onDuplicate,
}: {
  data: RepliesOverviewDto;
  atLimit: boolean;
  onEdit: (r: ReplyRuleDto) => void;
  onDuplicate: (r: ReplyRuleDto) => void;
}) {
  const qc = useQueryClient();
  const policy = useMotionPolicy();
  const key = AUTOMATION_KEYS.replies;

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderReplyRules(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RepliesOverviewDto>(key);
      if (prev) {
        const byId = new Map(prev.rules.map((r) => [r.id, r]));
        qc.setQueryData<RepliesOverviewDto>(key, {
          ...prev,
          rules: ids.map((id, i) => ({ ...(byId.get(id) as ReplyRuleDto), order: i })),
        });
      }
      return { prev };
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorText(e));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; isActive: boolean; name: string }) => setReplyRuleState(v.id, v.isActive),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RepliesOverviewDto>(key);
      if (prev) qc.setQueryData<RepliesOverviewDto>(key, { ...prev, rules: prev.rules.map((r) => (r.id === v.id ? { ...r, isActive: v.isActive } : r)) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorText(e));
    },
    onSuccess: (_r, v) => toast.success(v.isActive ? `“${v.name}” başlatıldı` : `“${v.name}” durduruldu`),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const move = (index: number, dir: -1 | 1) => {
    const ids = data.rules.map((r) => r.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j] as string, ids[index] as string];
    reorder.mutate(ids);
  };

  const remove = async (rule: ReplyRuleDto) => {
    const res = await deleteReplyRule(rule.id);
    await qc.invalidateQueries({ queryKey: key });
    const snap = replyRuleBodySchema.safeParse(res.snapshot);
    toast.success(`“${rule.name}” silindi`, {
      action:
        snap.success && !atLimit
          ? {
              label: 'Geri al',
              onClick: () => {
                createReplyRule(snap.data)
                  .then(() => {
                    toast.success('Kural geri getirildi (listenin sonuna eklendi).');
                    void qc.invalidateQueries({ queryKey: key });
                  })
                  .catch((e) => toast.error(errorText(e)));
              },
            }
          : undefined,
    });
  };

  return (
    <ol className="space-y-3" aria-label="Otomatik yanıt kuralları (değerlendirme sırasıyla)">
      <AnimatePresence initial={false}>
        {data.rules.map((rule, i) => (
          <Motion.li
            key={rule.id}
            layout={!policy.reduce}
            initial={policy.reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={policy.reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: policy.reduce ? 0 : 0.18 }}
          >
            <RuleCard
              rule={rule}
              index={i}
              count={data.rules.length}
              atLimit={atLimit}
              busy={reorder.isPending || (toggle.isPending && toggle.variables?.id === rule.id)}
              onMove={(dir) => move(i, dir)}
              onToggle={(isActive) => toggle.mutate({ id: rule.id, isActive, name: rule.name })}
              onEdit={() => onEdit(rule)}
              onDuplicate={() => onDuplicate(rule)}
              onDelete={() => remove(rule)}
            />
          </Motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

function RuleCard({
  rule,
  index,
  count,
  atLimit,
  busy,
  onMove,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  rule: ReplyRuleDto;
  index: number;
  count: number;
  atLimit: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => Promise<void>;
}) {
  const [showRuns, setShowRuns] = useState(false);
  const broken = !rule.condition;
  const runsId = `runs-${rule.id}`;
  return (
    <article
      aria-label={`${index + 1}. kural: ${rule.name}`}
      className={cn(
        'rounded-card border bg-surface-1 p-3 sm:p-4',
        broken ? 'border-warning-border' : 'border-subtle',
        !rule.isActive && 'opacity-75'
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-sm font-semibold tabular-nums text-fg"
          aria-hidden
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-fg">{rule.name}</h3>
            {!rule.isActive && <span className="rounded-chip bg-surface-2 px-2 py-0.5 qx-caption text-fg-muted">Durduruldu</span>}
            {broken && (
              <span className="inline-flex items-center gap-1 rounded-chip bg-warning-subtle px-2 py-0.5 qx-caption text-fg">
                <AlertTriangle className="h-3 w-3" aria-hidden /> Tetiklenemez
              </span>
            )}
          </div>
          <p className="text-sm text-fg">
            <span className="font-medium">{rule.sentence}</span>
            <span className="text-fg-muted"> → </span>
            {rule.action === 'incident' ? (
              <span className="inline-flex items-center gap-1">
                <Siren className="h-3.5 w-3.5 text-danger" aria-hidden /> vaka aç
              </span>
            ) : rule.tone ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden /> AI ile yanıtla ({rule.toneName ?? 'üslup kaldırılmış'})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <MessageSquareText className="h-3.5 w-3.5 text-brand" aria-hidden /> sabit metinle yanıtla
              </span>
            )}
          </p>
          {rule.template && <p className="qx-small line-clamp-2 text-fg-muted">{rule.tone ? `Yedek: ${rule.template}` : rule.template}</p>}
          {rule.toneMissing && <p className="qx-small text-warning">Seçili üslup artık tanımlı değil; yedek metin gönderiliyor.</p>}
          <p className="qx-caption text-fg-muted">
            {rule.stats.count30 > 0
              ? `Son 30 günde ${fmtInt(rule.stats.count30)} kez çalıştı${rule.stats.ai30 ? ` (${fmtInt(rule.stats.ai30)} AI yanıtı)` : ''} · son: ${fmtRelative(rule.stats.lastAt)}`
              : 'Son 30 günde çalışmadı'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.isActive}
            disabled={busy || broken}
            onCheckedChange={onToggle}
            aria-label={`${rule.name}: ${rule.isActive ? 'etkin, durdurmak için' : 'durduruldu, başlatmak için'} değiştir`}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-subtle pt-2">
        <IconButton aria-label={`${rule.name}: yukarı taşı`} icon={<ArrowUp />} tooltip disabled={busy || index === 0} onClick={() => onMove(-1)} />
        <IconButton aria-label={`${rule.name}: aşağı taşı`} icon={<ArrowDown />} tooltip disabled={busy || index === count - 1} onClick={() => onMove(1)} />
        <span className="mx-1 h-6 border-l border-subtle" aria-hidden />
        <IconButton aria-label={`${rule.name}: düzenle`} icon={<Pencil />} tooltip onClick={onEdit} />
        <IconButton aria-label={`${rule.name}: çoğalt`} icon={<Copy />} tooltip disabled={atLimit || broken} onClick={onDuplicate} />
        <IconButton
          aria-label={`${rule.name}: çalışma geçmişi`}
          icon={<History />}
          tooltip
          pressed={showRuns}
          aria-expanded={showRuns}
          aria-controls={runsId}
          onClick={() => setShowRuns((s) => !s)}
        />
        <span className="flex-1" />
        <ConfirmAction
          trigger={<IconButton aria-label={`${rule.name}: sil`} icon={<Trash2 />} variant="danger" tooltip />}
          title={`“${rule.name}” kuralı silinsin mi?`}
          description="Kural hemen çalışmayı bırakır. Daha önce yazılan yanıtlar ve açılan vakalar yerinde kalır. Silmeden sonra kısa süre “Geri al” ile geri getirebilirsiniz; yalnız durdurmak isterseniz anahtarı kapatın."
          tone="warning"
          irreversibleNote={false}
          confirmLabel="Sil"
          onConfirm={onDelete}
        />
      </div>
      {showRuns && <RunsPanel id={runsId} ruleId={rule.id} />}
    </article>
  );
}

function RunsPanel({ id, ruleId }: { id: string; ruleId: string }) {
  const q = useQuery({ queryKey: AUTOMATION_KEYS.replyRuns(ruleId), queryFn: ({ signal }) => fetchReplyRuns(ruleId, signal), staleTime: 30_000 });
  return (
    <div id={id} className="mt-2 rounded-control bg-surface-2 p-3">
      <QueryState
        query={q}
        skeleton="list"
        isEmpty={(d) => d.runs.length === 0}
        empty={{ compact: true, title: 'Henüz çalışma kaydı yok', description: 'Kural bir geri bildirime uyduğunda burada görünür.' }}
      >
        {(d) => (
          <ul className="space-y-2">
            {d.runs.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <time dateTime={r.at} className="qx-caption tabular-nums text-fg-muted">
                  {fmtDateTime(r.at)}
                </time>
                <span className="text-fg">{r.action === 'incident' ? 'Vaka açıldı' : r.ai ? 'AI yanıtı yazıldı' : 'Yanıt yazıldı'}</span>
                {r.feedback ? (
                  <Link href={r.feedback.href} className="min-w-0 truncate text-brand underline-offset-2 hover:underline">
                    {r.feedback.rating != null ? `${r.feedback.rating} ★ · ` : ''}
                    {r.feedback.textPreview ?? 'Yalnız puan'}
                  </Link>
                ) : (
                  <span className="qx-caption text-fg-muted">geri bildirim silinmiş</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
