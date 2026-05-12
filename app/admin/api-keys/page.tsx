'use client';

import { useState, useEffect } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Trash2, Key, Copy } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: { name: string | null; email: string | null };
};

export default function AdminApiKeysPage() {
  const [list, setList] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  const fetchList = () => {
    fetch('/api/admin/api-keys')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Liste yüklenemedi'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const create = () => {
    const n = name.trim();
    if (!n) {
      toast.error('İsim girin');
      return;
    }
    setSaving(true);
    setNewRawKey(null);
    fetch('/api/admin/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setNewRawKey(data.rawKey);
        setName('');
        fetchList();
        toast.success('Anahtar oluşturuldu; bu değeri kopyalayın, bir daha gösterilmeyecek.');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Oluşturulamadı'))
      .finally(() => setSaving(false));
  };

  const remove = (id: string) => {
    if (!confirm('Bu API anahtarı silinsin mi? İlgili entegrasyonlar çalışmayı durdurur.')) return;
    fetch(`/api/admin/api-keys?id=${id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        toast.success('Anahtar silindi');
        fetchList();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Silinemedi'));
  };

  const copyRaw = () => {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      toast.success('Panoya kopyalandı');
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AdminPremiumHero
        title="API Anahtarları"
        description="Harici entegrasyonlar için anahtar oluşturun; isteklerde Authorization: Bearer <anahtar> kullanın"
        icon={<Key className="text-white" />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Yeni anahtar
          </CardTitle>
          <CardDescription>Oluşturulduktan sonra ham anahtar yalnızca bir kez gösterilir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>İsim (açıklama)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Entegrasyon X"
            />
          </div>
          {newRawKey && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Yeni anahtar (bir kez gösterilir)</p>
              <code className="mt-1 block break-all text-sm">{newRawKey}</code>
              <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={copyRaw}>
                <Copy className="h-4 w-4" />
                Kopyala
              </Button>
            </div>
          )}
          <Button onClick={create} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Oluştur
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kayıtlı anahtarlar</CardTitle>
          <CardDescription>Ham anahtar saklanmaz; yalnızca ön ek ve son kullanım görünür.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz API anahtarı yok.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{k.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {k.keyPrefix}… · Son kullanım: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('tr-TR') : '—'}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(k.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
