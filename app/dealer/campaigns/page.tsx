'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone,
  Plus,
  Clock,
  Calendar,
  Zap,
  Star,
  Edit,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface HappyHour {
  id: string;
  name: string;
  description: string | null;
  multiplier: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

const dayNames = ['Pzr', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export default function DealerCampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<HappyHour[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    multiplier: 2,
    startTime: '12:00',
    endTime: '14:00',
    daysOfWeek: [1, 2, 3, 4, 5] as number[],
    isActive: true,
  });

  useEffect(() => { fetchCampaigns(); }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/happy-hour');
      const data = await res.json();
      if (data.success) setCampaigns(data.happyHours || []);
    } catch {
      toast.error('Kampanyalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', multiplier: 2, startTime: '12:00', endTime: '14:00', daysOfWeek: [1, 2, 3, 4, 5], isActive: true });
    setEditId(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (c: HappyHour) => {
    setForm({
      name: c.name,
      description: c.description || '',
      multiplier: c.multiplier,
      startTime: c.startTime,
      endTime: c.endTime,
      daysOfWeek: c.daysOfWeek,
      isActive: c.isActive,
    });
    setEditId(c.id);
    setDialogOpen(true);
  };

  const saveCampaign = async () => {
    if (!form.name.trim()) { toast.error('Kampanya adı gerekli'); return; }
    setSaving(true);
    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `/api/happy-hour?id=${editId}` : '/api/happy-hour';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        toast.success(editId ? 'Kampanya güncellendi!' : 'Kampanya oluşturuldu!');
        setDialogOpen(false);
        resetForm();
        fetchCampaigns();
      } else {
        toast.error(data.error || 'Kaydedilemedi');
      }
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      setSaving(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    try {
      const res = await fetch(`/api/happy-hour?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Kampanya silindi');
        fetchCampaigns();
      }
    } catch {
      toast.error('Silinemedi');
    }
  };

  const toggleDay = (day: number) => {
    setForm(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day].sort(),
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground">Kampanyalar yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-4 sm:p-6 md:p-8"
      >
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Megaphone className="w-8 h-8" /> Kampanya Yönetimi
            </h1>
            <p className="text-white/70 mt-1">Happy Hour ve puan çarpanı kampanyaları oluşturun</p>
          </div>
          <Button onClick={openCreate} className="bg-white text-orange-600 hover:bg-white/90">
            <Plus className="w-4 h-4 mr-2" /> Yeni Kampanya
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 bg-card/50"><CardContent className="p-4 text-center">
          <Megaphone className="h-5 w-5 text-orange-500 mx-auto mb-1" />
          <p className="text-xl font-bold">{campaigns.length}</p>
          <p className="text-xs text-muted-foreground">Toplam</p>
        </CardContent></Card>
        <Card className="border-0 bg-card/50"><CardContent className="p-4 text-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-xl font-bold">{campaigns.filter(c => c.isActive).length}</p>
          <p className="text-xs text-muted-foreground">Aktif</p>
        </CardContent></Card>
        <Card className="border-0 bg-card/50"><CardContent className="p-4 text-center">
          <Zap className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
          <p className="text-xl font-bold">{campaigns.length > 0 ? Math.max(...campaigns.map(c => c.multiplier)) : 0}x</p>
          <p className="text-xs text-muted-foreground">Max Çarpan</p>
        </CardContent></Card>
      </div>

      {/* Campaign List */}
      {campaigns.length === 0 ? (
        <Card className="border-0 bg-card/50"><CardContent className="p-12 text-center">
          <Megaphone className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Henüz Kampanya Yok</h3>
          <p className="text-muted-foreground mb-4">İlk kampanyanızı oluşturun ve müşterilerinizi çekin!</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Kampanya Oluştur</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign, index) => (
            <motion.div key={campaign.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <Card className={`border-0 bg-card/50 backdrop-blur-sm ${campaign.isActive ? 'border-l-4 border-l-emerald-500' : 'opacity-70'}`}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-lg">{campaign.name}</h3>
                        <Badge className={campaign.isActive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-muted text-muted-foreground'}>
                          {campaign.isActive ? 'Aktif' : 'Pasif'}
                        </Badge>
                        <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
                          <Zap className="h-3 w-3 mr-1" />{campaign.multiplier}x Puan
                        </Badge>
                      </div>
                      {campaign.description && <p className="text-sm text-muted-foreground mb-3">{campaign.description}</p>}
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-4 w-4" /> {campaign.startTime} - {campaign.endTime}
                        </span>
                        <div className="flex gap-1">
                          {[0, 1, 2, 3, 4, 5, 6].map(d => (
                            <span key={d} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium ${campaign.daysOfWeek.includes(d) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                              {dayNames[d]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEdit(campaign)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteCampaign(campaign.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Kampanya Düzenle' : 'Yeni Kampanya'}</DialogTitle>
            <DialogDescription>Happy Hour kampanya ayarlarını yapılandırın</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Kampanya Adı</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör: Öğle Happy Hour" /></div>
            <div><Label>Açıklama</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Kampanya detayları..." rows={2} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Başlangıç</Label><Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} /></div>
              <div><Label>Bitiş</Label><Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} /></div>
              <div><Label>Çarpan</Label><Input type="number" step="0.5" min="1" max="10" value={form.multiplier} onChange={e => setForm(f => ({ ...f, multiplier: parseFloat(e.target.value) || 1 }))} /></div>
            </div>
            <div>
              <Label className="mb-2 block">Günler</Label>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map(d => (
                  <button key={d} onClick={() => toggleDay(d)}
                    className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${form.daysOfWeek.includes(d) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >{dayNames[d]}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <Label>Aktif</Label>
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
            <Button onClick={saveCampaign} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editId ? 'Güncelle' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
