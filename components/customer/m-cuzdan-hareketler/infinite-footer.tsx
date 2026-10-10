'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/states';
import { useMovesCopy } from './copy';

type Props = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Sonraki sayfa isteği hata verdi (liste silinmez; satır içi hata + tekrar dene). */
  nextPageError: boolean;
  onLoadMore: () => unknown;
  loadedCount: number;
};

/**
 * Sonsuz kaydırma ayağı: görünür olunca sonraki sayfayı ister (IntersectionObserver,
 * 400px önden); klavye/ekran okuyucu ve gözlemcisiz tarayıcılar için "Daha fazla göster"
 * düğmesi her zaman var. Yüklenen kayıt sayısı kibarca duyurulur.
 */
export function InfiniteFooter({ hasNextPage, isFetchingNextPage, nextPageError, onLoadMore, loadedCount }: Props) {
  const { copy } = useMovesCopy();
  const sentinel = useRef<HTMLDivElement | null>(null);
  const load = useRef(onLoadMore);
  load.current = onLoadMore;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || nextPageError || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) load.current();
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, nextPageError, loadedCount]);

  return (
    <div className="pt-2">
      <p className="sr-only" aria-live="polite">
        {copy.loadedCount(loadedCount)}
      </p>
      {nextPageError ? (
        <InlineError onRetry={() => onLoadMore()}>{copy.loadMoreFailed}</InlineError>
      ) : hasNextPage ? (
        <div ref={sentinel} className="flex justify-center">
          <Button variant="outline" className="min-h-11" onClick={() => onLoadMore()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {copy.loadingMore}
              </>
            ) : (
              copy.loadMore
            )}
          </Button>
        </div>
      ) : loadedCount > 0 ? (
        <p className="qx-caption py-2 text-center text-fg-subtle">{copy.endOfList}</p>
      ) : null}
    </div>
  );
}
