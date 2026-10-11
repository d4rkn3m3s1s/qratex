'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MessageSquareText, Star } from 'lucide-react';
import { StatusBadge } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import { fetchFeedbacks, usersKeys } from '../api';
import { fmtDateTime } from '../format';
import { Pager } from '../parts';
import { AdminKullanicilarText } from '../copy';

const SENTIMENT: Record<string, { label: string; tone: 'success' | 'neutral' | 'danger' }> = {
  positive: { label: 'Olumlu', tone: 'success' },
  neutral: { label: 'Nötr', tone: 'neutral' },
  negative: { label: 'Olumsuz', tone: 'danger' },
};

export function FeedbackTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: usersKeys.sub(userId, 'feedbacks', page),
    queryFn: () => fetchFeedbacks(userId, page),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  return (
    <SectionCard title="Geri bildirimler" icon={<MessageSquareText />} description="Kullanıcının QR ile bıraktığı yorumlar, en yeniden eskiye.">
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: 'Henüz geri bildirim yok', compact: true }}>
        {(d) => (
          <>
            <ol className="space-y-3" aria-label="Geri bildirimler">
              {d.items.map((f) => (
                <li key={f.id} className="rounded-lg border border-subtle bg-surface-1 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 font-semibold text-fg" aria-label={`${f.rating} / 5 puan`}>
                      <Star className="h-4 w-4 text-warning" aria-hidden />
                      {f.rating}/5
                    </span>
                    <span className="text-fg-muted">{f.dealerName ?? 'İşletme bilinmiyor'}</span>
                    <time className="text-fg-subtle" dateTime={f.createdAt}>
                      {fmtDateTime(f.createdAt)}
                    </time>
                    {f.sentiment && SENTIMENT[f.sentiment] ? <StatusBadge size="sm" icon={null} {...SENTIMENT[f.sentiment]} /> : null}
                    {f.isToxic ? <StatusBadge size="sm" tone="danger" label="Toksik" /> : null}
                    {f.deleted ? <StatusBadge size="sm" tone="neutral" label="Silindi" /> : null}
                    {f.replied ? <StatusBadge size="sm" tone="info" icon={null} label="Yanıtlandı" /> : null}
                  </div>
                  {f.text ? <p className="mt-2 whitespace-pre-line text-sm text-fg">{f.text}</p> : <p className="mt-2 text-sm text-fg-subtle"><AdminKullanicilarText k="ratingOnly" /></p>}
                </li>
              ))}
            </ol>
            <Pager page={d.page} pageCount={d.pageCount} total={d.total} onPage={setPage} label="Geri bildirimler" />
          </>
        )}
      </QueryState>
    </SectionCard>
  );
}
