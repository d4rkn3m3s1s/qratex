'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { m as Motion } from 'framer-motion';
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
import { useAppT } from '@/lib/app-locale';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';
import { ConfirmAction, QueryState } from '@/components/states';
import { toSlugInput } from './slug';

type CmsPage = {
  id: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

type PageFormValues = { title: string; slug: string; content: string; isPublished: boolean };

const initialForm: PageFormValues = { title: '', slug: '', content: '', isPublished: true };

type PageFormProps = {
  idPrefix: string;
  value: PageFormValues;
  onChange: Dispatch<SetStateAction<PageFormValues>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
  /** Yeni sayfada slug, kullanıcı elle değiştirene kadar başlıktan türetilir. */
  autoSlug: boolean;
};

/**
 * MODÜL SEVİYESİNDE tanımlı form (P0-39 / P0-22). Eskiden `AdminPagesPage`
 * gövdesinde `const PageForm = () => …` olarak tanımlanıyordu; her tuş vuruşu
 * yeni bir bileşen tipi üretip input'u unmount/mount ediyor ve odak kayboluyordu.
 */
function PageForm({ idPrefix, value, onChange, onSubmit, onCancel, submitLabel, saving, autoSlug }: PageFormProps) {
  const [slugTouched, setSlugTouched] = useState(!autoSlug);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-title`}>Sayfa başlığı</Label>
          <Input
            id={`${idPrefix}-title`}
            value={value.title}
            maxLength={180}
            onChange={(e) => {
              const title = e.target.value;
              onChange((s) => ({ ...s, title, ...(slugTouched ? {} : { slug: toSlugInput(title).replace(/^-+|-+$/g, '') }) }));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-slug`}>Slug</Label>
          <Input
            id={`${idPrefix}-slug`}
            value={value.slug}
            maxLength={120}
            inputMode="url"
            onChange={(e) => {
              setSlugTouched(true);
              const slug = toSlugInput(e.target.value);
              onChange((s) => ({ ...s, slug }));
            }}
          />
          <p className="qx-caption text-fg-muted">Adres: /{value.slug || 'sayfa-adresi'}</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-content`}>İçerik</Label>
        <Textarea
          id={`${idPrefix}-content`}
          rows={10}
          value={value.content}
          onChange={(e) => {
            const content = e.target.value;
            onChange((s) => ({ ...s, content }));
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-published`}>Yayınla</Label>
        <Switch
          id={`${idPrefix}-published`}
          checked={value.isPublished}
          onCheckedChange={(v) => onChange((s) => ({ ...s, isPublished: v }))}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          İptal
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function AdminPagesPage() {
  const t = useAppT();
  const [pages, setPages] = useState<CmsPage[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState<CmsPage | null>(null);
  const [formData, setFormData] = useState<PageFormValues>(initialForm);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/pages', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfalar alınamadı');
      setPages((data.pages ?? []) as CmsPage[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e : new Error('Yükleme hatası'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const filteredPages = useMemo(() => {
    if (!pages) return null;
    const q = searchQuery.toLocaleLowerCase('tr-TR').trim();
    if (!q) return pages;
    return pages.filter(
      (p) => p.title.toLocaleLowerCase('tr-TR').includes(q) || p.slug.toLowerCase().includes(q)
    );
  }, [pages, searchQuery]);

  const resetForm = () => setFormData(initialForm);

  const closeDialogs = () => {
    setCreateOpen(false);
    setEditOpen(false);
    setSelectedPage(null);
    resetForm();
  };

  const validate = (): boolean => {
    if (formData.title.trim().length < 2) {
      toast.error('Başlık en az 2 karakter olmalı');
      return false;
    }
    const slug = formData.slug.replace(/^-+|-+$/g, '');
    if (!slug) {
      toast.error('Slug zorunlu');
      return false;
    }
    return true;
  };

  const payload = () => ({ ...formData, title: formData.title.trim(), slug: formData.slug.replace(/^-+|-+$/g, '') });

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa oluşturulamadı');
      toast.success('Sayfa oluşturuldu');
      closeDialogs();
      await loadPages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedPage || !validate()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPage.id, ...payload() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa güncellenemedi');
      toast.success('Sayfa güncellendi');
      closeDialogs();
      await loadPages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setSaving(false);
    }
  };

  /** ConfirmAction içinden çağrılır: hata fırlatırsa diyalog açık kalır ve hata gösterilir. */
  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/pages?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa silinemedi');
    toast.success('Sayfa silindi');
    await loadPages();
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

  const searching = searchQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Sayfa Yönetimi"
        description="CMS sayfalarını veritabanından yönetin"
        icon={<FileText className="text-white" />}
      />

      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Sayfa ara..."
            aria-label="Sayfa ara"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            if (open) resetForm();
            setCreateOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Yeni Sayfa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Yeni Sayfa Oluştur</DialogTitle>
              <DialogDescription>CMS sayfası bilgilerini doldurun</DialogDescription>
            </DialogHeader>
            <PageForm
              idPrefix="page-create"
              value={formData}
              onChange={setFormData}
              onSubmit={handleCreate}
              onCancel={closeDialogs}
              submitLabel="Oluştur"
              saving={saving}
              autoSlug
            />
          </DialogContent>
        </Dialog>
      </div>

      <QueryState
        query={{ data: filteredPages, error: loadError, isLoading: loading && !pages, refetch: loadPages }}
        skeleton="cards"
        loadingLabel={t('adminInlineLoading.pages')}
        empty={
          searching
            ? { variant: 'no-results', title: 'Aramanızla eşleşen sayfa yok', description: 'Farklı bir başlık ya da slug deneyin.' }
            : { variant: 'first-use', title: 'Henüz sayfa yok', description: '“Yeni Sayfa” ile ilk CMS sayfanızı oluşturun.' }
        }
      >
        {(list) => (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((page, index) => (
              <Motion.div
                key={page.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 10) * 0.04 }}
              >
                <Card>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <h3 className="line-clamp-1 font-semibold">{page.title}</h3>
                        <p className="truncate font-mono text-sm text-muted-foreground">/{page.slug}</p>
                      </div>
                      <Badge variant={page.isPublished ? 'default' : 'secondary'} className="shrink-0">
                        {page.isPublished ? <Globe className="mr-1 h-3 w-3" aria-hidden /> : <Lock className="mr-1 h-3 w-3" aria-hidden />}
                        {page.isPublished ? 'Yayında' : 'Taslak'}
                      </Badge>
                    </div>

                    <p className="line-clamp-3 text-sm text-muted-foreground">{page.content || 'İçerik yok'}</p>

                    <div className="text-xs text-muted-foreground">
                      Güncelleme: {new Date(page.updatedAt).toLocaleDateString('tr-TR')}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => openEditDialog(page)}>
                        <Edit className="mr-2 h-4 w-4" aria-hidden /> Düzenle
                      </Button>
                      <ConfirmAction
                        trigger={
                          <Button variant="outline" size="icon" className="text-destructive" aria-label={`${page.title} sayfasını sil`}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        }
                        title="Sayfa silinsin mi?"
                        description={`/${page.slug} adresindeki “${page.title}” sayfası kalıcı olarak silinecek; bu adrese gelen ziyaretçiler 404 görür.`}
                        confirmPhrase={page.slug}
                        confirmLabel="Sayfayı sil"
                        onConfirm={() => handleDelete(page.id)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Motion.div>
            ))}
          </div>
        )}
      </QueryState>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) closeDialogs();
          else setEditOpen(true);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sayfa Düzenle</DialogTitle>
            <DialogDescription>{selectedPage?.title}</DialogDescription>
          </DialogHeader>
          {selectedPage ? (
            <PageForm
              key={selectedPage.id}
              idPrefix="page-edit"
              value={formData}
              onChange={setFormData}
              onSubmit={handleUpdate}
              onCancel={closeDialogs}
              submitLabel="Güncelle"
              saving={saving}
              autoSlug={false}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
