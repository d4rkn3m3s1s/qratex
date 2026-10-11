'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Play, FlaskConical, Save, RefreshCw } from 'lucide-react';
import { AdminText } from './copy';

type Rule = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  requiresApproval: boolean;
  approvedAt?: string | null;
  approvedBy?: { id: string; name: string | null; email: string } | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  priority: number;
  condition: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  _count?: { runs: number };
};

type RunItem = {
  id: string;
  status: string;
  mode: string;
  affectedCount: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
};

type RunMetrics = {
  last24hTotalRuns: number;
  last24hFailedRuns: number;
  last24hFailureRate: number;
  avgAffectedUsersCompleted: number;
};

type DryRunResult = {
  affectedCount: number;
  totalPointsDelta?: number;
  totalXp?: number;
  withinCap?: boolean;
  sample?: Array<{ id: string; name: string | null; email: string; points: number }>;
  sampleUserIds?: string[];
};

const RUN_MODE: Record<string, string> = { dry_run: 'Önizleme', execute: 'Çalıştırma', scheduled: 'Zamanlanmış', manual: 'Elle' };
const RUN_STATUS: Record<string, string> = {
  queued: 'Kuyrukta',
  pending: 'Bekliyor',
  processing: 'İşleniyor',
  running: 'Çalışıyor',
  completed: 'Tamamlandı',
  failed: 'Başarısız',
  partial: 'Kısmen tamamlandı',
  cancelled: 'İptal edildi',
};

const DEFAULT_RULE = {
  name: '',
  description: '',
  role: 'CUSTOMER',
  minPoints: 0,
  actionType: 'add_points',
  amount: 100,
  priority: 100,
  isActive: true,
  requiresApproval: false,
};

export function UsersAutomationPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [form, setForm] = useState(DEFAULT_RULE);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  // P0-19: "Şimdi çalıştır" iki adımlı — sunucu önizlemesi (kişi sayısı + toplam puan) onaylanmadan
  // iş kuyruğa girmez. Yalnız kayıtlı ve başka bir yöneticinin onayladığı kural çalışır.
  const [executePreview, setExecutePreview] = useState<DryRunResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedRule = useMemo(() => rules.find((r) => r.id === selectedRuleId) || null, [rules, selectedRuleId]);

  useEffect(() => {
    setExecutePreview(null);
  }, [selectedRuleId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [rulesRes, runsRes] = await Promise.all([
        fetch('/api/admin/users/automation/rules').then((r) => r.json()),
        fetch('/api/admin/users/automation/runs').then((r) => r.json()),
      ]);
      if (!rulesRes?.success || !runsRes?.success) {
        throw new Error(rulesRes?.error || runsRes?.error || 'Otomasyon verileri alınamadı');
      }
      setRules(rulesRes.items || []);
      setRuns(runsRes.items || []);
      setMetrics(runsRes.metrics || null);
    } catch (error) {
      // Hata görünür kalır: boş liste "hiç kural yok" gibi görünmesin.
      setLoadError(error instanceof Error ? error.message : 'Otomasyon verileri alınamadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    condition: {
      role: form.role,
      minPoints: form.minPoints,
    },
    actions:
      form.actionType === 'add_points'
        ? [{ type: 'add_points', amount: form.amount, reason: 'Otomasyon kuralı' }]
        : [{ type: 'add_xp', amount: form.amount }],
    isActive: form.isActive,
    priority: form.priority,
    requiresApproval: form.requiresApproval,
  });

  const createRule = async () => {
    if (!form.name.trim()) {
      toast.error('Kural adı zorunlu');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch('/api/admin/users/automation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Kural oluşturulamadı');
      toast.success('Kural oluşturuldu');
      setForm(DEFAULT_RULE);
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kural oluşturulamadı');
    } finally {
      setSaving(false);
    }
  };

  const runDry = async () => {
    try {
      const payload = selectedRule
        ? { ruleId: selectedRule.id }
        : { condition: buildPayload().condition, actions: buildPayload().actions };
      const res = await fetch('/api/admin/users/automation/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Önizleme başarısız');
      setDryRunResult(data.result);
      toast.success('Önizleme hazır (hiçbir şey yazılmadı)');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Önizleme başarısız');
    }
  };

  const executeRule = async () => {
    if (!selectedRuleId) {
      toast.error('Çalıştırmak için kayıtlı ve onaylı bir kural seçin');
      return;
    }
    try {
      setExecuting(true);
      const res = await fetch('/api/admin/users/automation/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: selectedRuleId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Önizleme alınamadı');
      setExecutePreview(data.result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Önizleme alınamadı');
    } finally {
      setExecuting(false);
    }
  };

  const confirmExecute = async () => {
    if (!selectedRuleId || !executePreview) return;
    try {
      setExecuting(true);
      const res = await fetch('/api/admin/users/automation/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `auto-${selectedRuleId}-${Date.now().toString(36)}`,
        },
        body: JSON.stringify({
          ruleId: selectedRuleId,
          processNow: true,
          confirm: {
            affectedCount: executePreview.affectedCount,
            totalPointsDelta: executePreview.totalPointsDelta ?? 0,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        if (data?.code === 'CONFIRMATION_REQUIRED' && data?.preview) setExecutePreview(data.preview);
        throw new Error(data?.error || 'Çalıştırılamadı');
      }
      toast.success('Otomasyon çalıştırıldı');
      setExecutePreview(null);
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Çalıştırılamadı');
    } finally {
      setExecuting(false);
    }
  };

  const toggleActive = async (rule: Rule) => {
    try {
      const res = await fetch(`/api/admin/users/automation/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Güncellenemedi');
      toast.success(rule.isActive ? 'Kural pasifleştirildi' : 'Kural etkinleştirildi');
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Güncellenemedi');
    }
  };

  const approveRule = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/admin/users/automation/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Onay başarısız');
      toast.success('Kural onaylandı');
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Onay başarısız');
    }
  };

  return (
    <div className="space-y-4">
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-border bg-danger-subtle p-3 text-sm text-danger">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={fetchData}>
            Tekrar dene
          </Button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle><AdminText k="ruleEditor" /></CardTitle>
          <CardDescription><AdminText k="ruleEditorHint" /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label><AdminText k="savedRule" /></Label>
              <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Mevcut kural seçin (opsiyonel)" />
                </SelectTrigger>
                <SelectContent>
                  {rules.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label><AdminText k="ruleName" /></Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ör. Sadık müşteri ödülü" />
            </div>
          </div>

          <div className="space-y-2">
            <Label><AdminText k="description" /></Label>
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label><AdminText k="roleCondition" /></Label>
              <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUSTOMER"><AdminText k="customer" /></SelectItem>
                  <SelectItem value="DEALER">Bayi</SelectItem>
                  <SelectItem value="ADMIN"><AdminText k="admin" /></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>En az puan</Label>
              <Input type="number" value={form.minPoints} onChange={(e) => setForm((p) => ({ ...p, minPoints: Number(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Aksiyon</Label>
              <Select value={form.actionType} onValueChange={(v) => setForm((p) => ({ ...p, actionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add_points">Puan ekle</SelectItem>
                  <SelectItem value="add_xp">XP ekle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tutar</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) || 0 }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label><AdminText k="priority" /></Label>
              <Input type="number" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) || 100 }))} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label>Aktif</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
            </div>
            <div className="flex items-center border rounded-md p-3 text-xs text-muted-foreground">
              Her kural, çalıştırılmadan önce oluşturandan farklı bir yöneticinin onayını ister.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={createRule} disabled={saving} className="gap-2"><Save className="h-4 w-4" /><AdminText k="saveRule" /></Button>
            <Button variant="outline" onClick={runDry} className="gap-2"><FlaskConical className="h-4 w-4" /><AdminText k="previewBtn" /></Button>
            <Button variant="outline" onClick={executeRule} disabled={executing || !selectedRuleId} className="gap-2"><Play className="h-4 w-4" /><AdminText k="runNow" /></Button>
            <Button variant="ghost" onClick={fetchData} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Yenile</Button>
          </div>

          {dryRunResult && (
            <div className="rounded-md border p-3 text-sm space-y-1" aria-live="polite">
              <p><strong><AdminText k="affectedUsers" /></strong> {dryRunResult.affectedCount.toLocaleString('tr-TR')}</p>
              {typeof dryRunResult.totalPointsDelta === 'number' && (
                <p><strong>Toplam puan etkisi:</strong> {dryRunResult.totalPointsDelta.toLocaleString('tr-TR')}</p>
              )}
              {dryRunResult.withinCap === false && (
                <p className="text-destructive"><AdminText k="overCap" /></p>
              )}
              <p className="text-muted-foreground">
                Örnek: {(dryRunResult.sample ?? []).map((u) => u.name || u.email).join(', ') || '—'}
              </p>
            </div>
          )}

          {executePreview && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2" role="region" aria-live="polite" aria-label="Çalıştırma onayı">
              <p className="font-semibold"><AdminText k="confirmRun" /></p>
              <p>
                {executePreview.affectedCount.toLocaleString('tr-TR')} kullanıcı · toplam{' '}
                {(executePreview.totalPointsDelta ?? 0).toLocaleString('tr-TR')} puan
                {executePreview.totalXp ? ` · ${executePreview.totalXp.toLocaleString('tr-TR')} XP` : ''}
              </p>
              <p className="text-muted-foreground">
                Örnek: {(executePreview.sample ?? []).map((u) => u.name || u.email).join(', ') || '—'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={confirmExecute} disabled={executing || executePreview.withinCap === false}>
                  Onayla ve çalıştır
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExecutePreview(null)} disabled={executing}>
                  Vazgeç
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Son 24 saat</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground"><AdminText k="run" /></p><p className="text-xl font-semibold">{metrics?.last24hTotalRuns ?? 0}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground"><AdminText k="failed" /></p><p className="text-xl font-semibold">{metrics?.last24hFailedRuns ?? 0}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground"><AdminText k="errorRate" /></p><p className="text-xl font-semibold">%{metrics?.last24hFailureRate ?? 0}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Ort. etkilenen</p><p className="text-xl font-semibold">{metrics?.avgAffectedUsersCompleted ?? 0}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kurallar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground"><AdminText k="noRules" /></p>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                <div>
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">{rule.description || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rule.isActive ? 'default' : 'secondary'}>{rule.isActive ? 'Aktif' : 'Pasif'}</Badge>
                  <Badge variant={rule.approvedAt ? 'default' : 'outline'}>
                    {rule.approvedAt ? `Onaylı${rule.approvedBy?.name ? ` · ${rule.approvedBy.name}` : ''}` : 'Onay bekliyor'}
                  </Badge>
                  <Badge variant="outline">{rule._count?.runs || 0} çalıştırma</Badge>
                  <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => toggleActive(rule)}>
                    {rule.isActive ? 'Pasifleştir' : 'Etkinleştir'}
                  </Button>
                  {!rule.approvedAt && (
                    <Button size="sm" variant="outline" onClick={() => approveRule(rule.id)}>
                      Onayla
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><AdminText k="runHistory" /></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground"><AdminText k="noRuns" /></p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3 text-sm">
                <div>
                  <p className="font-medium">{RUN_MODE[run.mode] ?? run.mode} · {RUN_STATUS[run.status] ?? run.status}</p>
                  <p className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString('tr-TR')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span>Etkilenen: {run.affectedCount}</span>
                  <span>Başarılı: {run.successCount}</span>
                  <span>Hata: {run.failedCount}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
