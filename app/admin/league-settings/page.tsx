'use client';

import { useEffect, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/admin-toast';
import { RefreshCw, Save, Trophy } from 'lucide-react';
import type { LeagueRule } from '@/lib/league-rules';
import { TW_BRAND_GRADIENT_STOPS_WIDE } from '@/lib/tw-brand-classes';

export default function AdminLeagueSettingsPage() {
  const [rules, setRules] = useState<LeagueRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialSignature, setInitialSignature] = useState('');

  const fetchRules = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings/leagues', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Lig ayarları alınamadı');
      const list = Array.isArray(data.rules) && data.rules.length >= 7 ? data.rules : [
        { key: 'BASLANGIC', name: 'Başlangıç', minPoints: 0, maxPoints: 2999, gradient: 'from-slate-500 to-slate-700' },
        { key: 'KOR', name: 'Kor', minPoints: 3000, maxPoints: 5000, gradient: 'from-amber-700 to-orange-500' },
        { key: 'VEYRA', name: 'Veyra', minPoints: 7500, maxPoints: 10000, gradient: 'from-slate-400 to-slate-600' },
        { key: 'SAVASCI', name: 'Savaşçı', minPoints: 12000, maxPoints: 15000, gradient: 'from-yellow-400 to-amber-600' },
        { key: 'ETERON', name: 'Eteron', minPoints: 18000, maxPoints: 21000, gradient: 'from-cyan-400 to-sky-600' },
        { key: 'VETRA', name: 'Vetra', minPoints: 25000, maxPoints: 30000, gradient: 'from-primary to-primary/70' },
        { key: 'ZENOR', name: 'Zenor', minPoints: 50000, maxPoints: 100000, gradient: TW_BRAND_GRADIENT_STOPS_WIDE },
      ];
      setRules(list);
      setInitialSignature(JSON.stringify(list));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lig ayarları alınamadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const isDirty = initialSignature !== JSON.stringify(rules);

  const updateRule = (index: number, field: keyof LeagueRule, value: string | number) => {
    setRules((prev) => {
      const next = [...prev];
      const r = { ...next[index], [field]: value };
      if (field === 'minPoints' || field === 'maxPoints') r[field] = Math.max(0, Math.floor(Number(value) || 0));
      next[index] = r;
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/admin/settings/leagues', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Kaydetme başarısız');
      setRules(data.rules ?? rules);
      setInitialSignature(JSON.stringify(data.rules));
      toast.success('Lig ayarları güncellendi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydetme sırasında hata');
    } finally {
      setSaving(false);
    }
  };

  if (loading && rules.length === 0) {
    return (
      <div className="space-y-6">
        <AdminPremiumHero
          title="Lig ayarları"
          description="Puan aralıklarına göre ligleri yönetin"
          icon={<Trophy className="text-white" />}
        />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Yükleniyor...</CardContent>
        </Card>
      </div>
    );
  }

  const defaults: LeagueRule[] = [
    { key: 'BASLANGIC', name: 'Başlangıç', minPoints: 0, maxPoints: 2999, gradient: 'from-slate-500 to-slate-700' },
    { key: 'KOR', name: 'Kor', minPoints: 3000, maxPoints: 5000, gradient: 'from-amber-700 to-orange-500' },
    { key: 'VEYRA', name: 'Veyra', minPoints: 7500, maxPoints: 10000, gradient: 'from-slate-400 to-slate-600' },
    { key: 'SAVASCI', name: 'Savaşçı', minPoints: 12000, maxPoints: 15000, gradient: 'from-yellow-400 to-amber-600' },
    { key: 'ETERON', name: 'Eteron', minPoints: 18000, maxPoints: 21000, gradient: 'from-cyan-400 to-sky-600' },
    { key: 'VETRA', name: 'Vetra', minPoints: 25000, maxPoints: 30000, gradient: 'from-primary to-primary/70' },
    { key: 'ZENOR', name: 'Zenor', minPoints: 50000, maxPoints: 100000, gradient: TW_BRAND_GRADIENT_STOPS_WIDE },
  ];
  const displayRules = rules.length >= 7 ? rules : defaults;

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Lig ayarları"
        description="Puan aralıklarına göre lig isimleri ve eşikleri. Leaderboard ve müşteri paneli bu ayarları kullanır."
        icon={<Trophy className="text-white" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchRules}
              disabled={loading || saving}
              className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || saving || !isDirty}
              className="gap-2 bg-white text-emerald-900 hover:bg-white/90 shadow-md"
            >
              <Save className="h-4 w-4" />
              Kaydet
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Lig kuralları
            {isDirty ? <Badge variant="secondary">Değiştirildi</Badge> : <Badge variant="outline">Güncel</Badge>}
          </CardTitle>
          <CardDescription>
            Her lig için min/max puan ve görünen isim. API üzerinden kaydedilir; leaderboard ve profil ligi bu değerlere göre hesaplanır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayRules.map((rule, index) => (
              <Card key={rule.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{rule.name || rule.key}</CardTitle>
                  <CardDescription className="text-xs">{rule.key}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">İsim</Label>
                    <Input
                      value={rule.name}
                      onChange={(e) => updateRule(index, 'name', e.target.value)}
                      placeholder="Lig adı"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Min puan</Label>
                      <Input
                        type="number"
                        min={0}
                        value={rule.minPoints}
                        onChange={(e) => updateRule(index, 'minPoints', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max puan</Label>
                      <Input
                        type="number"
                        min={0}
                        value={rule.maxPoints}
                        onChange={(e) => updateRule(index, 'maxPoints', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Gradient (Tailwind)</Label>
                    <Input
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
