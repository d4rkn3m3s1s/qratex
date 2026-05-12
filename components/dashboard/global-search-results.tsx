'use client';

import { useCallback } from 'react';
import { User, Users, MessageSquare, Package, QrCode, Loader2 } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';

export interface GlobalSearchResultsShape {
  users: { id: string; name: string | null; email: string; businessName: string | null; role: string; href: string }[];
  feedbacks: { id: string; text: string | null; rating: number; sentiment: string | null; createdAt: string; href: string }[];
  products: { id: string; name: string; categoryName?: string; href: string }[];
  qrCodes: { id: string; name: string; code: string; businessName: string | null; href: string }[];
}

interface GlobalSearchResultsProps {
  visible: boolean;
  searchLoading: boolean;
  searchResults: GlobalSearchResultsShape | null;
  totalResults: number;
  onNavigate: (href: string) => void;
  /** Benzersiz id: `aria-controls` / klavyeyle atlama için */
  resultsRegionId: string;
  /** Desktop dropdown vs sheet içi için padding */
  className?: string;
  /** İlk sonuçta ↑ ile arama kutusuna dön */
  onRequestFocusSearch?: () => void;
  /** Escape veya iptal ile açılır öğeyi kapat */
  onDismiss?: () => void;
}

export function GlobalSearchResults({
  visible,
  searchLoading,
  searchResults,
  totalResults,
  onNavigate,
  resultsRegionId,
  className = '',
  onRequestFocusSearch,
  onDismiss,
}: GlobalSearchResultsProps) {
  const t = useAppT();
  const handleHitKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const root =
        typeof document !== 'undefined' ? document.getElementById(resultsRegionId) : null;
      const hits = root
        ? [...root.querySelectorAll<HTMLButtonElement>('button[data-global-search-hit]')]
        : [];
      const i = hits.indexOf(e.currentTarget);
      if (i < 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = hits[i + 1] ?? hits[0];
        next?.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = hits[i - 1];
        if (prev) prev.focus();
        else onRequestFocusSearch?.();
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        hits[0]?.focus();
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        hits[hits.length - 1]?.focus();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss?.();
        return;
      }
    },
    [resultsRegionId, onRequestFocusSearch, onDismiss]
  );

  if (!visible) return null;

  return (
    <div
      id={resultsRegionId}
      role="region"
      aria-label={t('appShell.globalSearchResultsRegion')}
      aria-busy={searchLoading}
      className={className}
    >
      {searchLoading ? (
        <div className="flex items-center gap-2 p-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>{t('appShell.globalSearchSearching')}</span>
        </div>
      ) : searchResults && totalResults > 0 ? (
        <div className="space-y-1 p-2">
          {searchResults.users.length > 0 && (
            <div role="group" aria-label={t('appShell.globalSearchSectionUsers')}>
              <p aria-hidden className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5 shrink-0" />
                {t('appShell.globalSearchSectionUsers')}
              </p>
              {searchResults.users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  data-global-search-hit
                  className="flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={[u.name || u.email, u.businessName, t('appShell.globalSearchAriaUser')].filter(Boolean).join(', ')}
                  onClick={() => onNavigate(u.href)}
                  onKeyDown={handleHitKeyDown}
                >
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name || u.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.businessName || u.email}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchResults.feedbacks.length > 0 && (
            <div role="group" aria-label={t('appShell.globalSearchSectionFeedbacks')}>
              <p aria-hidden className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                {t('appShell.globalSearchSectionFeedbacks')}
              </p>
              {searchResults.feedbacks.map((fb) => (
                <button
                  key={fb.id}
                  type="button"
                  data-global-search-hit
                  className="flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${fb.text || `${fb.rating} ${t('appShell.globalSearchPointsShort')}`}, ${t('appShell.globalSearchAriaFeedback')}`}
                  onClick={() => onNavigate(fb.href)}
                  onKeyDown={handleHitKeyDown}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">{fb.text || `${fb.rating} ${t('appShell.globalSearchPointsShort')}`}</span>
                    <span className="block text-xs text-muted-foreground">{fb.sentiment || t('appShell.globalSearchSentimentNeutral')}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchResults.products.length > 0 && (
            <div role="group" aria-label={t('appShell.globalSearchSectionProducts')}>
              <p aria-hidden className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <Package className="h-3.5 w-3.5 shrink-0" />
                {t('appShell.globalSearchSectionProducts')}
              </p>
              {searchResults.products.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  data-global-search-hit
                  className="flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={[pr.name, pr.categoryName, t('appShell.globalSearchAriaProduct')].filter(Boolean).join(', ')}
                  onClick={() => onNavigate(pr.href)}
                  onKeyDown={handleHitKeyDown}
                >
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{pr.name}</span>
                    {pr.categoryName && (
                      <span className="block truncate text-xs text-muted-foreground">{pr.categoryName}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchResults.qrCodes.length > 0 && (
            <div role="group" aria-label={t('appShell.globalSearchSectionQrCodes')}>
              <p aria-hidden className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <QrCode className="h-3.5 w-3.5 shrink-0" />
                {t('appShell.globalSearchSectionQrCodes')}
              </p>
              {searchResults.qrCodes.map((qr) => (
                <button
                  key={qr.id}
                  type="button"
                  data-global-search-hit
                  className="flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={[qr.name, qr.businessName || qr.code, t('appShell.globalSearchAriaQr')].filter(Boolean).join(', ')}
                  onClick={() => onNavigate(qr.href)}
                  onKeyDown={handleHitKeyDown}
                >
                  <QrCode className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{qr.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{qr.businessName || qr.code}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : searchResults && totalResults === 0 ? (
        <div className="p-4 text-center text-sm text-muted-foreground" role="status">
          {t('appShell.noResults')}
        </div>
      ) : null}
    </div>
  );
}
