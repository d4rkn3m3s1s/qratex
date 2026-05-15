'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code, Copy, Download, Loader2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import type { AdminApiCatalogPayload } from '@/lib/admin-api-catalog-types';

export default function AdminApiCatalogPage() {
  const t = useAppT();
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<AdminApiCatalogPayload | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/api-catalog', { cache: 'no-store' });
        const data = (await res.json()) as { success?: boolean } & Partial<AdminApiCatalogPayload>;
        if (cancelled) return;
        if (!res.ok || !data.success || !data.routes) {
          toast.error(t('adminApiCatalog.loadError'));
          setCatalog(null);
          return;
        }
        setCatalog({ generatedAt: data.generatedAt!, routes: data.routes });
      } catch {
        if (!cancelled) {
          toast.error(t('adminApiCatalog.loadError'));
          setCatalog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filtered = useMemo(() => {
    if (!catalog?.routes) return [];
    const s = q.trim().toLowerCase();
    if (!s) return catalog.routes;
    return catalog.routes.filter(
      (r) =>
        r.path.toLowerCase().includes(s) ||
        r.methods.some((m) => m.toLowerCase().includes(s)) ||
        r.file.toLowerCase().includes(s)
    );
  }, [catalog, q]);

  const downloadJson = () => {
    if (!catalog) return;
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'admin-api-catalog.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('adminApiCatalog.downloadOk'));
  };

  const copyPath = async (p: string) => {
    try {
      await navigator.clipboard.writeText(p);
      toast.success(t('adminApiCatalog.copied'));
    } catch {
      toast.error(t('adminApiCatalog.loadError'));
    }
  };

  return (
    <div className="min-h-screen space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <AdminPremiumHero
        eyebrow={t('adminApiCatalog.eyebrow')}
        title={t('adminApiCatalog.title')}
        description={t('adminApiCatalog.description')}
        icon={<Code className="text-white" />}
        chips={
          catalog ? (
            <Badge variant="secondary" className="font-mono text-xs">
              {t('adminApiCatalog.count').replace('{count}', String(catalog.routes.length))}
            </Badge>
          ) : null
        }
        aside={
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!catalog} onClick={downloadJson}>
              <Download className="h-4 w-4" />
              {t('adminApiCatalog.downloadJson')}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('adminApiCatalog.searchPlaceholder')}</CardTitle>
          <CardDescription>{t('adminApiCatalog.openapiHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('adminApiCatalog.searchPlaceholder')}
            className="max-w-md"
          />
          {catalog?.generatedAt && (
            <p className="text-xs text-muted-foreground">
              {t('adminApiCatalog.generatedAt')}:{' '}
              <span className="font-mono">{new Date(catalog.generatedAt).toLocaleString('tr-TR')}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground border-l-2 border-amber-500/40 pl-3">{t('adminApiCatalog.regenerateHint')}</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : !catalog ? null : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{t('adminApiCatalog.emptySearch')}</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="col-span-2 hidden sm:block">{t('adminApiCatalog.methods')}</div>
            <div className="col-span-10 sm:col-span-8">{t('adminApiCatalog.path')}</div>
            <div className="col-span-2 hidden sm:block text-right">{t('adminApiCatalog.copyPath')}</div>
          </div>
          <ul className="divide-y divide-border max-h-[min(70vh,720px)] overflow-y-auto">
            {filtered.map((row) => (
              <li key={row.path} className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-muted/30 text-sm">
                <div className="col-span-12 sm:col-span-2 flex flex-wrap gap-1">
                  {(row.methods.length ? row.methods : ['—']).map((m) => (
                    <Badge
                      key={m}
                      variant={m === 'GET' ? 'secondary' : m === 'POST' || m === 'PUT' || m === 'PATCH' ? 'default' : 'outline'}
                      className={cn('text-[10px] font-mono', m === '—' && 'opacity-60')}
                    >
                      {m}
                    </Badge>
                  ))}
                </div>
                <div className="col-span-12 sm:col-span-8 min-w-0">
                  <p className="font-mono text-xs sm:text-sm break-all text-foreground">{row.path}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={row.file}>
                    {row.file}
                  </p>
                </div>
                <div className="col-span-12 sm:col-span-2 flex sm:justify-end">
                  <Button type="button" variant="ghost" size="sm" className="gap-1 h-8" onClick={() => void copyPath(row.path)}>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t('adminApiCatalog.copyPath')}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
