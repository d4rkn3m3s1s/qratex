'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Plus, Save, Loader2, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function AdminAITonesPage() {
  const [loading, setLoading] = useState(true);
  const [tones, setTones] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTone, setEditingTone] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTones();
  }, []);

  const fetchTones = async () => {
    try {
      const res = await fetch('/api/admin/settings/ai-tones');
      const data = await res.json();
      if (data.success) setTones(data.tones);
    } catch (error) {
      toast.error('Üsluplar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      id: editingTone?.id,
      slug: formData.get('slug'),
      name: formData.get('name'),
      systemPrompt: formData.get('systemPrompt'),
    };

    setSaving(true);
    try {
      const method = editingTone ? 'PATCH' : 'POST';
      const res = await fetch('/api/admin/settings/ai-tones', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(editingTone ? 'Üslup güncellendi' : 'Yeni üslup eklendi');
        setIsDialogOpen(false);
        fetchTones();
      } else {
        toast.error(result.error || 'İşlem başarısız');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Yanıt Üslupları</h1>
          <p className="text-muted-foreground">Otomatik AI yanıtları için tonlama ve sistem direktiflerini özelleştirin.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingTone(null);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Yeni Üslup Ekle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingTone ? 'Üslubu Düzenle' : 'Yeni Üslup Ekle'}</DialogTitle>
              <DialogDescription>
                AI'nın bu üslup seçildiğinde nasıl davranacağını belirleyin.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Görünen Ad</Label>
                  <Input id="name" name="name" defaultValue={editingTone?.name} placeholder="Örn: Samimi ve Sıcak" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (Sistem Anahtarı)</Label>
                  <Input id="slug" name="slug" defaultValue={editingTone?.slug} placeholder="Örn: friendly" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">Sistem Promptu</Label>
                <Textarea 
                  id="systemPrompt" 
                  name="systemPrompt" 
                  defaultValue={editingTone?.systemPrompt} 
                  placeholder="AI'ya nasıl yanıt üretmesi gerektiğini detaylıca anlatın..."
                  rows={10}
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  İpucu: Prompt içinde "kısa tut", "nazik ol", "müşteri ismini kullan" gibi direktifler verebilirsiniz.
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Kaydet
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {tones.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">Kayıtlı üslup bulunamadı</h3>
            <p className="text-sm text-muted-foreground">Henüz bir AI üslubu tanımlanmamış.</p>
          </Card>
        ) : (
          tones.map((tone) => (
            <Card key={tone.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{tone.name}</CardTitle>
                    <Badge variant="outline" className="text-[10px] mt-1">{tone.slug}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => {
                    setEditingTone(tone);
                    setIsDialogOpen(true);
                  }}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono line-clamp-3 overflow-hidden text-muted-foreground">
                  {tone.systemPrompt}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
