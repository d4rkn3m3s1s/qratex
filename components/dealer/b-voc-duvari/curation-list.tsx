'use client';

import { useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, EyeOff, Eye, MapPin, MessageSquareReply, Pin, PinOff, ShieldAlert, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { SectionCard } from '@/components/ds/page';
import { QueryState, TONE_CHIP, type Tone } from '@/components/states';
import { useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { BlockReason, CurationFilter, CurationItemDto, WallStatus, WallVerdict } from '@/lib/dealer/voc-wall/config';
import { VOC_ROOT, curationKey, fetchCuration, setItemStatus, WallApiError } from './api';
import { relativeTime } from './wall-display';

const FILTER_OPTIONS: Array<{ value: CurationFilter; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'live', label: 'Yayında' },
  { value: 'pinned', label: 'Sabit' },
  { value: 'hidden', label: 'Gizli' },
  { value: 'blocked', label: 'Yayın dışı' },
];

const REASON: Record<BlockReason, string> = {
  toxic: 'Toksik içerik',
  flagged: 'Güven işareti var',
  fraud: 'Sahte olabilir',
  pending: 'AI denetimi bekleniyor',
  author: 'Yazarın hesabı işaretli',
  private: 'Herkese açık değil',
  language: 'Uygunsuz dil',
  low_rating: 'Puan eşiğin altında',
  no_text: 'Yazılı yorum yok',
  other_qr: 'Seçili QR dışında',
};

const INTENT: Record<string, string> = {
  complaint: 'Şikâyet',
  suggestion: 'Öneri',
  praise: 'Övgü',
  question: 'Soru',
};

function verdictChip(v: WallVerdict): { label: string; tone: Tone } {
  switch (v.state) {
    case 'pinned':
      return { label: 'Sabit · yayında', tone: 'brand' };
    case 'live':
      return { label: 'Yayında', tone: 'success' };
    case 'hidden':
      return { label: 'Gizlendi', tone: 'neutral' };
    default:
      return { label: REASON[v.reason], tone: v.safety ? 'danger' : 'warning' };
  }
}

export function CurationList({ qrCodeId, canModerate }: { qrCodeId: string | null; canModerate: boolean }) {
  const [filter, setFilter] = useState<CurationFilter>('all');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const policy = useMotionPolicy();
  const query = useQuery({
    queryKey: curationKey(filter, page, qrCodeId),
    queryFn: () => fetchCuration(filter, page, qrCodeId),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WallStatus }) => setItemStatus(id, status),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'pinned' ? 'Yorum ekrana sabitlendi.' : v.status === 'hidden' ? 'Yorum ekrandan gizlendi.' : 'Yorum otomatik kurallara döndü.');
      void qc.invalidateQueries({ queryKey: VOC_ROOT });
    },
    onError: (e) => toast.error(e instanceof WallApiError ? e.message : 'İşlem tamamlanamadı.'),
  });

  return (
    <SectionCard
      title="Yayın listesi"
      description="Her yorumun mağaza ekranındaki durumu. Güvenlik süzgecine takılan yorumlar sabitlense bile yayınlanmaz."
      actions={
        <ChoiceChips
          aria-label="Duruma göre süz"
          size="sm"
          scroll
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => {
            setFilter(v ?? 'all');
            setPage(1);
          }}
        />
      }
    >
      <QueryState
        query={query}
        skeleton="list"
        isEmpty={(d) => d.items.length === 0}
        empty={{
          variant: filter === 'all' ? 'default' : 'filtered',
          title: filter === 'all' ? 'Henüz geri bildirim yok' : 'Bu süzgeçte yorum yok',
          description:
            filter === 'all'
              ? 'QR kodlarınızdan yorum geldikçe burada listelenir ve kurallarınıza göre ekrana çıkar.'
              : 'Başka bir durum seçin.',
        }}
        showRefreshing
      >
        {(data) => (
          <>
            <ul className="divide-y divide-subtle" aria-busy={query.isFetching}>
              <AnimatePresence initial={false}>
                {data.items.map((item) => (
                  <m.li
                    key={item.id}
                    layout={!policy.reduce}
                    initial={false}
                    exit={policy.reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={policy.transition({ duration: 0.2 })}
                  >
                    <CurationRow
                      item={item}
                      canModerate={canModerate}
                      busy={mutation.isPending && mutation.variables?.id === item.id}
                      onSet={(status) => mutation.mutate({ id: item.id, status })}
                    />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
            {(page > 1 || data.hasMore) && (
              <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Sayfalama">
                <Button variant="outline" size="sm" className="min-h-11" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft aria-hidden className="mr-1 h-4 w-4" /> Önceki
                </Button>
                <span className="qx-caption text-fg-muted">Sayfa {page}</span>
                <Button variant="outline" size="sm" className="min-h-11" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
                  Sonraki <ChevronRight aria-hidden className="ml-1 h-4 w-4" />
                </Button>
              </nav>
            )}
          </>
        )}
      </QueryState>
    </SectionCard>
  );
}

function CurationRow({
  item,
  canModerate,
  busy,
  onSet,
}: {
  item: CurationItemDto;
  canModerate: boolean;
  busy: boolean;
  onSet: (s: WallStatus) => void;
}) {
  const chip = verdictChip(item.verdict);
  const safety = item.verdict.state === 'blocked' && item.verdict.safety;
  const pinned = item.verdict.state === 'pinned';
  const hidden = item.verdict.state === 'hidden';
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${item.rating} / 5 yıldız`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} aria-hidden className={cn('h-3.5 w-3.5', i <= item.rating ? 'fill-amber-400 text-amber-400' : 'text-fg-subtle')} />
            ))}
          </span>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[chip.tone])}>
            {safety && <ShieldAlert aria-hidden className="h-3 w-3" />}
            {chip.label}
          </span>
          {item.intent && INTENT[item.intent] && (
            <span className="rounded-full border border-subtle px-2 py-0.5 text-xs text-fg-muted">{INTENT[item.intent]}</span>
          )}
          {item.themes.map((t) => (
            <span key={t} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted">
              {t}
            </span>
          ))}
        </div>
        <p className={cn('qx-body break-words', item.text ? 'text-fg' : 'italic text-fg-muted')}>{item.text ?? 'Yalnız puan verildi.'}</p>
        <p className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
          <span>{item.name ?? 'Anonim'}</span>
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3 w-3" /> {item.location}
            </span>
          )}
          <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
          {item.replied && (
            <span className="inline-flex items-center gap-1 text-success">
              <MessageSquareReply aria-hidden className="h-3 w-3" /> Yanıtlandı
            </span>
          )}
        </p>
      </div>
      {canModerate && (
        <div className="flex shrink-0 gap-2">
          {safety ? (
            <p className="qx-caption max-w-[14rem] text-fg-muted">Güvenlik süzgeci bu yorumu yayınlamaz.</p>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={busy || hidden}
                onClick={() => onSet(pinned ? 'auto' : 'pinned')}
                aria-label={pinned ? 'Sabiti kaldır' : 'Ekrana sabitle'}
              >
                {pinned ? <PinOff aria-hidden className="h-4 w-4 sm:mr-1" /> : <Pin aria-hidden className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">{pinned ? 'Sabiti kaldır' : 'Sabitle'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={busy}
                onClick={() => onSet(hidden ? 'auto' : 'hidden')}
                aria-label={hidden ? 'Ekranda göster' : 'Ekrandan gizle'}
              >
                {hidden ? <Eye aria-hidden className="h-4 w-4 sm:mr-1" /> : <EyeOff aria-hidden className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">{hidden ? 'Göster' : 'Gizle'}</span>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
