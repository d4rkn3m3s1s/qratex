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

type Rule = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  requiresApproval: boolean;
  approvedAt?: string | null;
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
  const [dryRunResult, setDryRunResult] = useState<{ affectedCount: number; sampleUserIds: string[] } | null>(null);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);

  const selectedRule = useMemo(() => rules.find((r) => r.id === selectedRuleId) || null, [rules, selectedRuleId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rulesRes, runsRes] = await Promise.all([
        fetch('/api/admin/users/automation/rules').then((r) => r.json()),
        fetch('/api/admin/users/automation/runs').then((r) => r.json()),
      ]);
      if (rulesRes?.success) setRules(rulesRes.items || []);
      if (runsRes?.success) {
        setRuns(runsRes.items || []);
        setMetrics(runsRes.metrics || null);
      }
    } catch {
      toast.error('Automation verileri alınamadı');
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
        ? [{ type: 'add_points', amount: form.amount, reason: 'Automation rule' }]
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
        ? { condition: selectedRule.condition, actions: selectedRule.actions }
        : { condition: buildPayload().condition, actions: buildPayload().actions };
      const res = await fetch('/api/admin/users/automation/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Dry-run başarısız');
      setDryRunResult(data.result);
      toast.success('Dry-run tamamlandı');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dry-run başarısız');
    }
  };

  const executeRule = async () => {
    try {
      const payload = selectedRuleId
        ? { ruleId: selectedRuleId, processNow: true }
        : { ...buildPayload(), processNow: true };
      const res = await fetch('/api/admin/users/automation/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Çalıştırılamadı');
      toast.success('Otomasyon çalıştırıldı');
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Çalıştırılamadı');
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
      <Card>
        <CardHeader>
          <CardTitle>Kural Editörü</CardTitle>
          <CardDescription>Koşul ve aksiyon tanımlayıp dry-run ile test edin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Kayıtlı Kural</Label>
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
              <Label>Kural Adı</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="VIP Upgrade Trigger" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Açıklama</Label>
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>Rol Koşulu</Label>
              <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUSTOMER">Customer</SelectItem>
                  <SelectItem value="DEALER">Dealer</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Min Points</Label>
              <Input type="number" value={form.minPoints} onChange={(e) => setForm((p) => ({ ...p, minPoints: Number(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>Aksiyon</Label>
              <Select value={form.actionType} onValueChange={(v) => setForm((p) => ({ ...p, actionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add_points">Puan Ekle</SelectItem>
                  <SelectItem value="add_xp">XP Ekle</SelectItem>
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
              <Label>Priority</Label>
              <Input type="number" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) || 100 }))} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label>Aktif</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label>Onay Gereksin</Label>
              <Switch checked={form.requiresApproval} onCheckedChange={(v) => setForm((p) => ({ ...p, requiresApproval: v }))} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={createRule} disabled={saving} className="gap-2"><Save className="h-4 w-4" />Kural Kaydet</Button>
            <Button variant="outline" onClick={runDry} className="gap-2"><FlaskConical className="h-4 w-4" />Dry-run</Button>
            <Button variant="outline" onClick={executeRule} className="gap-2"><Play className="h-4 w-4" />Execute Now</Button>
            <Button variant="ghost" onClick={fetchData} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Yenile</Button>
          </div>

          {dryRunResult && (
            <div className="rounded-md border p-3 text-sm">
              <p><strong>Etkilenecek kullanıcı:</strong> {dryRunResult.affectedCount}</p>
              <p className="text-muted-foreground">Örnek kullanıcılar: {dryRunResult.sampleUserIds.slice(0, 6).join(', ') || '—'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Otomasyon KPI (24s)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Toplam Run</p><p className="text-xl font-semibold">{metrics?.last24hTotalRuns ?? 0}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Başarısız Run</p><p className="text-xl font-semibold">{metrics?.last24hFailedRuns ?? 0}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Fail Oranı</p><p className="text-xl font-semibold">%{metrics?.last24hFailureRate ?? 0}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Ort. Etkilenen</p><p className="text-xl font-semibold">{metrics?.avgAffectedUsersCompleted ?? 0}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kural Listesi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kural yok.</p>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                <div>
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">{rule.description || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rule.isActive ? 'default' : 'secondary'}>{rule.isActive ? 'Aktif' : 'Pasif'}</Badge>
                  {rule.requiresApproval && <Badge variant={rule.approvedAt ? 'default' : 'outline'}>{rule.approvedAt ? 'Onayli' : 'Onay Bekliyor'}</Badge>}
                  <Badge variant="outline">Run: {rule._count?.runs || 0}</Badge>
                  {rule.requiresApproval && !rule.approvedAt && (
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
          <CardTitle>Run History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz run yok.</p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3 text-sm">
                <div>
                  <p className="font-medium">{run.mode} - {run.status}</p>
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
