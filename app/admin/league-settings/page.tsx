'use client';

import { useCallback } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { QueryState } from '@/components/states';
import { VersionConflictBanner } from '@/components/settings/version-conflict-banner';
import { toast } from '@/lib/admin-toast';
import { RefreshCw, Save, Trophy } from 'lucide-react';
import type { LeagueRule } from '@/lib/league-rules';
import { fetchResourceJson, requireVersion, saveVersioned } from '@/lib/versioned-resource';
import { useVersionedDraft, useVersionedResource } from '@/hooks/use-versioned-resource';

const HERO_TITLE = 'Lig ayarları';
const HERO_DESCRIPTION =
  'Puan aralıklarına göre lig isimleri ve eşikleri. Leaderboard ve müşteri paneli bu ayarları kullanır.';

const REFRESH_BUTTON_CLASS =
  'gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:hover:text-white';

async function loadLeagueRules() {
  const body = await fetchResourceJson('/api/admin/settings/leagues', 'Lig ayarları alınamadı');
  if (!Array.isArray(body.rules) || body.rules.length === 0) {
    throw new Error('Lig ayarları beklenen biçimde gelmedi');
  }
  return { data: body.rules as LeagueRule[], version: requireVersion(body) };
}

/**
 * P0-28: form YALNIZ sunucudan gelen canlı kurallar + sürümle açılır. Yükleme sürerken iskelet,
 * hata olursa "Tekrar dene" — istemcide varsayılan lig listesi yok, hata durumunda Kaydet yok.
 */
export default function AdminLeagueSettingsPage() {
  const resource = useVersionedResource(loadLeagueRules);

  if (resource.status === 'ready' && resource.data && resource.version) {
    return (
      <LeagueSettingsForm
        key={resource.loadId}
        initial={resource.data}
        initialVersion={resource.version}
        onReload={resource.reload}
        onCommitted={resource.commit}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title={HERO_TITLE}
        description={HERO_DESCRIPTION}
        icon={<Trophy className="text-white" />}
        actions={
          <Button variant="outline" onClick={() => void resource.reload()} disabled={resource.status === 'loading'} className={REFRESH_BUTTON_CLASS}>
            <RefreshCw className={`h-4 w-4 ${resource.status === 'loading' ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />
      <QueryState
        query={resource.query}
        skeleton="cards"
        isEmpty={() => false}
        loadingLabel="Lig ayarları yükleniyor…"
        error={{
          title: 'Lig ayarları yüklenemedi',
          description: 'Canlı ayarlar okunamadığı için düzenleme kilitlendi. Kayıtlı ayarlarınız değişmedi; tekrar deneyin.',
        }}
      >
        {null}
      </QueryState>
    </div>
  );
}

function LeagueSettingsForm({
  initial,
  initialVersion,
  onReload,
  onCommitted,
}: {
  initial: LeagueRule[];
  initialVersion: string;
  onReload: () => unknown;
  onCommitted: (rules: LeagueRule[], version: string) => void;
}) {
  const request = useCallback(
    (rules: LeagueRule[], baseVersion: string) =>
      saveVersioned('/api/admin/settings/leagues', 'PUT', { rules, baseVersion }, 'Kaydetme başarısız'),
    []
  );
  const parse = useCallback(
    (body: Record<string, unknown>) => ({ data: body.rules as LeagueRule[], version: requireVersion(body) }),
    []
  );
  const onSaved = useCallback(
    (rules: LeagueRule[], version: string) => {
      onCommitted(rules, version);
      toast.success('Lig ayarları güncellendi');
    },
    [onCommitted]
  );
  const onError = useCallback((e: unknown) => {
    toast.error(e instanceof Error ? e.message : 'Kaydetme sırasında hata');
  }, []);

  const form = useVersionedDraft<LeagueRule[]>({ initial, initialVersion, request, parse, onSaved, onError });
  const rules = form.draft;

  const updateRule = (index: number, field: keyof LeagueRule, value: string) => {
    form.setDraft((prev) => {
      if (!prev[index]) return prev; // seyrek dizi oluşturma (eski "tek elemanlı liste" hatası)
      const next = [...prev];
      const r = { ...next[index] };
      if (field === 'minPoints' || field === 'maxPoints') {
        r[field] = Math.max(0, Math.floor(Number(value) || 0));
      } else if (field === 'name' || field === 'gradient') {
        r[field] = value;
      }
      next[index] = r;
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title={HERO_TITLE}
        description={HERO_DESCRIPTION}
        icon={<Trophy className="text-white" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void onReload()} disabled={form.saving} className={REFRESH_BUTTON_CLASS}>
              <RefreshCw className="h-4 w-4" />
              Yenile
            </Button>
            <Button
              onClick={() => void form.save()}
              disabled={form.saving || !form.dirty}
              className="gap-2 bg-white text-emerald-900 hover:bg-white/90 shadow-md"
            >
              <Save className="h-4 w-4" />
              {form.saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
        }
      />

      {form.conflict && (
        <VersionConflictBanner
          message={form.conflict.message}
          onReload={onReload}
          onOverwrite={form.conflict.currentVersion ? () => form.save({ overwrite: true }) : undefined}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Lig kuralları
            {form.dirty ? <Badge variant="secondary">Değiştirildi</Badge> : <Badge variant="outline">Güncel</Badge>}
          </CardTitle>
          <CardDescription>
            Her lig için min/max puan ve görünen isim. API üzerinden kaydedilir; leaderboard ve profil ligi bu değerlere göre hesaplanır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rules.map((rule, index) => (
              <Card key={rule.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{rule.name || rule.key}</CardTitle>
                  <CardDescription className="text-xs">{rule.key}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor={`league-${rule.key}-name`} className="text-xs">İsim</Label>
                    <Input
                      id={`league-${rule.key}-name`}
                      value={rule.name}
                      onChange={(e) => updateRule(index, 'name', e.target.value)}
                      placeholder="Lig adı"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`league-${rule.key}-min`} className="text-xs">Min puan</Label>
                      <Input
                        id={`league-${rule.key}-min`}
                        type="number"
                        min={0}
                        value={rule.minPoints}
                        onChange={(e) => updateRule(index, 'minPoints', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`league-${rule.key}-max`} className="text-xs">Max puan</Label>
                      <Input
                        id={`league-${rule.key}-max`}
                        type="number"
                        min={0}
                        value={rule.maxPoints}
                        onChange={(e) => updateRule(index, 'maxPoints', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`league-${rule.key}-gradient`} className="text-xs">Gradient (Tailwind)</Label>
                    <Input
                      id={`league-${rule.key}-gradient`}
                      value={rule.gradient}
                      onChange={(e) => updateRule(index, 'gradient', e.target.value)}
                      placeholder="from-amber-700 to-orange-500"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
