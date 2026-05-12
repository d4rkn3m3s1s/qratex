'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ToggleLeft,
  Link2,
  Key,
  Plus,
  Loader2,
  Copy,
  Radio,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/admin-toast';

const WEBHOOK_EVENTS = ['feedback.created', 'badge.earned', 'quest.completed', 'reward.claimed'];

export default function AdminTechAddPage() {
  const [activeSection, setActiveSection] = useState<'feature' | 'webhook' | 'apikey'>('feature');

  // Özellik bayrağı
  const [featureKey, setFeatureKey] = useState('');
  const [featureName, setFeatureName] = useState('');
  const [featureDesc, setFeatureDesc] = useState('');
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [featureSaving, setFeatureSaving] = useState(false);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['feedback.created']);
  const [webhookSaving, setWebhookSaving] = useState(false);

  // API anahtarı
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  const addFeature = async () => {
    const key = featureKey.trim().toLowerCase().replace(/\s/g, '_');
    if (!key) {
      toast.error('Özellik anahtarı girin');
      return;
    }
    if (!featureName.trim()) {
      toast.error('Özellik adı girin');
      return;
    }
    setFeatureSaving(true);
    try {
      const res = await fetch('/api/admin/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          name: featureName.trim(),
          description: featureDesc.trim() || undefined,
          isEnabled: featureEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Oluşturulamadı');
      toast.success('Özellik bayrağı oluşturuldu');
      setFeatureKey('');
      setFeatureName('');
      setFeatureDesc('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı');
    } finally {
      setFeatureSaving(false);
    }
  };

  const addWebhook = async () => {
    const url = webhookUrl.trim();
    if (!url) {
      toast.error('Webhook URL girin');
      return;
    }
    try {
      new URL(url);
    } catch {
      toast.error('Geçerli bir URL girin');
      return;
    }
    setWebhookSaving(true);
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret: webhookSecret.trim() || undefined,
          events: webhookEvents.length ? webhookEvents : ['feedback.created'],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('Webhook eklendi');
      setWebhookUrl('');
      setWebhookSecret('');
      setWebhookEvents(['feedback.created']);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setWebhookSaving(false);
    }
  };

  const addApiKey = async () => {
    const name = apiKeyName.trim();
    if (!name) {
      toast.error('Anahtar ismi girin');
      return;
    }
    setApiKeySaving(true);
    setNewRawKey(null);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewRawKey(data.rawKey ?? null);
      setApiKeyName('');
      toast.success('API anahtarı oluşturuldu. Bu değeri kopyalayın; bir daha gösterilmeyecek.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı');
    } finally {
      setApiKeySaving(false);
    }
  };

  const copyRawKey = () => {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      toast.success('Panoya kopyalandı');
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Teknoloji Ekle"
        description="Özellik bayrağı, webhook veya API anahtarı ekleyin"
      />

      {/* Sekmeler */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {[
          { id: 'feature' as const, label: 'Özellik bayrağı', icon: ToggleLeft },
          { id: 'webhook' as const, label: "Webhook", icon: Link2 },
          { id: 'apikey' as const, label: 'API anahtarı', icon: Key },
        ].map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={activeSection === id ? 'default' : 'ghost'}
            size="sm"
            className="gap-2"
            onClick={() => setActiveSection(id)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      {/* Özellik bayrağı formu */}
      {activeSection === 'feature' && (
        <Card className="border border-border shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
                <ToggleLeft className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Yeni özellik bayrağı</CardTitle>
                <CardDescription>Platformda açıp kapatacağınız özellik anahtarı</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Anahtar (key)</Label>
              <Input
                value={featureKey}
                onChange={(e) => setFeatureKey(e.target.value.toLowerCase().replace(/\s/g, '_'))}
                placeholder="ornek_ozellik_key"
              />
            </div>
            <div className="space-y-2">
              <Label>Özellik adı</Label>
              <Input
                value={featureName}
                onChange={(e) => setFeatureName(e.target.value)}
                placeholder="Örn: AI Analiz"
              />
            </div>
            <div className="space-y-2">
              <Label>Açıklama (opsiyonel)</Label>
              <Textarea
                value={featureDesc}
                onChange={(e) => setFeatureDesc(e.target.value)}
                placeholder="Kısa açıklama..."
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <Label className="cursor-pointer">Varsayılan açık</Label>
              <Switch checked={featureEnabled} onCheckedChange={setFeatureEnabled} />
            </div>
            <Button onClick={addFeature} disabled={featureSaving} className="gap-2">
              {featureSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Oluştur
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Webhook formu */}
      {activeSection === 'webhook' && (
        <Card className="border border-border shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle>Yeni webhook</CardTitle>
                <CardDescription>Olay gerçekleşince POST atılacak URL</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Secret (opsiyonel, HMAC imza)</Label>
              <Input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Boş bırakılabilir"
              />
            </div>
            <div className="space-y-2">
              <Label>Olaylar</Label>
              <div className="flex flex-wrap gap-3">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes(ev)}
                      onChange={(e) =>
                        setWebhookEvents((prev) =>
                          e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)
                        )
                      }
                      className="rounded border-border/80 dark:border-white/25"
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={addWebhook} disabled={webhookSaving} className="gap-2">
              {webhookSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ekle
            </Button>
          </CardContent>
        </Card>
      )}

      {/* API anahtarı formu */}
      {activeSection === 'apikey' && (
        <Card className="border border-border shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Key className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Yeni API anahtarı</CardTitle>
                <CardDescription>Ham anahtar yalnızca bir kez gösterilir; güvenli saklayın</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>İsim (açıklama)</Label>
              <Input
                value={apiKeyName}
                onChange={(e) => setApiKeyName(e.target.value)}
                placeholder="Örn. Entegrasyon X"
              />
            </div>
            {newRawKey && (
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Yeni anahtar (bir kez gösterilir)</p>
                <code className="mt-2 block break-all text-sm font-mono">{newRawKey}</code>
                <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={copyRawKey}>
                  <Copy className="h-4 w-4" />
                  Kopyala
                </Button>
              </div>
            )}
            <Button onClick={addApiKey} disabled={apiKeySaving} className="gap-2">
              {apiKeySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Oluştur
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Hızlı linkler */}
      <Card className="border border-border/80 bg-muted/30">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Radio className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Listeler:</span>
          <Link href="/admin/features">
            <Button variant="link" size="sm" className="h-auto p-0 text-primary">Özellikler</Button>
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/admin/webhooks">
            <Button variant="link" size="sm" className="h-auto p-0 text-primary">Webhook'lar</Button>
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/admin/api-keys">
            <Button variant="link" size="sm" className="h-auto p-0 text-primary">API Anahtarları</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
