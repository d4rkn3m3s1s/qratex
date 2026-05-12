'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Search, Edit, Trash2, Globe, Lock, Loader2 } from 'lucide-react';
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
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppT } from '@/lib/app-locale';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';

type CmsPage = {
  id: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

const initialForm = { title: '', slug: '', content: '', isPublished: true };

export default function AdminPagesPage() {
  const t = useAppT();
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState<CmsPage | null>(null);
  const [formData, setFormData] = useState(initialForm);

  const loadPages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pages', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfalar alınamadı');
      setPages((data.pages ?? []) as CmsPage[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPages();
  }, []);

  const filteredPages = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return pages;
    return pages.filter((p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }, [pages, searchQuery]);

  const resetForm = () => setFormData(initialForm);

  const handleCreate = async () => {
    if (formData.title.trim().length < 2 || formData.slug.trim().length < 1) {
      toast.error('Başlık ve slug zorunlu');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa oluşturulamadı');
      toast.success('Sayfa oluşturuldu');
      setCreateOpen(false);
      resetForm();
      await loadPages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedPage) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPage.id, ...formData }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa güncellenemedi');
      toast.success('Sayfa güncellendi');
      setEditOpen(false);
      setSelectedPage(null);
      resetForm();
      await loadPages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pages?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa silinemedi');
      toast.success('Sayfa silindi');
      await loadPages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (page: CmsPage) => {
    setSelectedPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      content: page.content,
      isPublished: page.isPublished,
    });
    setEditOpen(true);
  };

  const PageForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Sayfa başlığı</Label>
          <Input value={formData.title} onChange={(e) => setFormData((s) => ({ ...s, title: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            value={formData.slug}
            onChange={(e) =>
              setFormData((s) => ({
                ...s,
                slug: e.target.value.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9-]/g, ''),
              }))
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>İçerik</Label>
        <Textarea rows={10} value={formData.content} onChange={(e) => setFormData((s) => ({ ...s, content: e.target.value }))} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Yayınla</Label>
        <Switch checked={formData.isPublished} onCheckedChange={(v) => setFormData((s) => ({ ...s, isPublished: v }))} />
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            setCreateOpen(false);
            setEditOpen(false);
            setSelectedPage(null);
            resetForm();
          }}
        >
          İptal
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Sayfa Yönetimi"
        description="CMS sayfalarını veritabanından yönetin"
        icon={<FileText className="text-white" />}
      />

      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sayfa ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Sayfa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Yeni Sayfa Oluştur</DialogTitle>
              <DialogDescription>CMS sayfası bilgilerini doldurun</DialogDescription>
            </DialogHeader>
            <PageForm onSubmit={handleCreate} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <InlineLoadingStatus className="py-16" label={t('adminInlineLoading.pages')} />
      ) : filteredPages.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">Sayfa bulunamadı.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredPages.map((page, index) => (
            <motion.div key={page.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-semibold line-clamp-1">{page.title}</h3>
                      <p className="text-sm text-muted-foreground font-mono">/{page.slug}</p>
                    </div>
                    <Badge variant={page.isPublished ? 'default' : 'secondary'}>
                      {page.isPublished ? <Globe className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                      {page.isPublished ? 'Yayında' : 'Taslak'}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-3">{page.content || 'İçerik yok'}</p>

                  <div className="text-xs text-muted-foreground">Güncelleme: {new Date(page.updatedAt).toLocaleDateString('tr-TR')}</div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => openEditDialog(page)}>
                      <Edit className="h-4 w-4 mr-2" /> Düzenle
                    </Button>
                    <Button variant="outline" size="icon" className="text-destructive" onClick={() => void handleDelete(page.id)} disabled={saving}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sayfa Düzenle</DialogTitle>
            <DialogDescription>{selectedPage?.title}</DialogDescription>
          </DialogHeader>
          <PageForm onSubmit={handleUpdate} submitLabel="Güncelle" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
