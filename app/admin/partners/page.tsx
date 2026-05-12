'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Share2, Plus, Key, Copy, Check } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/admin-toast';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppT } from '@/lib/app-locale';

interface PartnerItem {
  id: string;
  name: string;
  type: string;
  webhookUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function AdminPartnersPage() {
  const t = useAppT();
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'POS' as string, webhookUrl: '' });

  const fetchPartners = async () => {
    try {
      const res = await fetch('/api/admin/partners');
      const data = await res.json();
      if (data.partners) setPartners(data.partners);
    } catch {
      toast.error('Partner listesi yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Partner adı gerekli');
      return;
    }
    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          webhookUrl: form.webhookUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Oluşturulamadı');
      if (data.apiKey) {
        setCreatedKey(data.apiKey);
        toast.success('Partner oluşturuldu. API anahtarını kopyalayın; tekrar gösterilmez.');
      } else {
        setCreateOpen(false);
        setForm({ name: '', type: 'POS', webhookUrl: '' });
        fetchPartners();
        toast.success('Partner oluşturuldu');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Partner oluşturulamadı');
    }
  };

  const closeCreateAndRefresh = () => {
    setCreatedKey(null);
    setCreateOpen(false);
    setForm({ name: '', type: 'POS', webhookUrl: '' });
    fetchPartners();
  };

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      toast.success('Kopyalandı');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Partnerler"
        description="POS, ajans ve dijital menü entegrasyon partnerleri"
        icon={<Share2 className="text-white" />}
      />

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreatedKey(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Partner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Partner</DialogTitle>
              <DialogDescription>
                Partner kaydı oluşturulunca bir kez gösterilecek API anahtarını güvenli saklayın.
              </DialogDescription>
            </DialogHeader>
            {createdKey ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-3 font-mono text-sm break-all">{createdKey}</div>
                <div className="flex gap-2">
                  <Button onClick={copyKey} variant="outline" className="gap-2">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Kopyala
                  </Button>
                  <Button onClick={closeCreateAndRefresh}>Tamam</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <Label>Partner adı</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Örn: Acme POS"
                    />
                  </div>
                  <div>
                    <Label>Tür</Label>
                    <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POS">POS</SelectItem>
                        <SelectItem value="ajans">Ajans</SelectItem>
                        <SelectItem value="dijital_menu">Dijital Menü</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Webhook URL (opsiyonel)</Label>
                    <Input
                      value={form.webhookUrl}
                      onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
                  <Button onClick={handleCreate}>Oluştur</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <InlineLoadingStatus className="py-12" label={t('adminInlineLoading.partners')} />
      ) : partners.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Share2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Henüz partner yok. Yeni Partner ile ekleyin.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {partners.map((p) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{p.type}</Badge>
                      {p.isActive && <Badge>Aktif</Badge>}
                    </div>
                    {p.webhookUrl && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs">{p.webhookUrl}</p>
                    )}
                  </div>
                  <Key className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
