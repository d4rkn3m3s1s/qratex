'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { Target, Plus, Search, Edit, Trash2, Star, CheckCircle, XCircle, Calendar, Sparkles, Loader2 } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import { ConfirmAction, QueryState, TONE_CHIP, type Tone } from '@/components/states';
import { QuestForm } from './quest-form';
import {
  QUEST_TYPE_LABELS,
  initialQuestForm,
  normalizeQuestType,
  questToFormValues,
  toQuestPayload,
  validateQuestPayload,
  type QuestFormValues,
} from './quest-form-model';

interface Quest {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: string;
  requirement: { type?: string; count?: number; category?: string } | null;
  reward: { points?: number; xp?: number } | null;
  isActive: boolean;
  expiresAt: string | null;
  _count?: {
    users: number;
  };
}

const TYPE_TONES: Record<keyof typeof QUEST_TYPE_LABELS, Tone> = {
  daily: 'success',
  weekly: 'info',
  monthly: 'brand',
  special: 'warning',
};

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

function errorMessage(data: Record<string, unknown> | null, fallback: string): string {
  return typeof data?.error === 'string' && data.error ? data.error : fallback;
}

export default function AdminQuestsPage() {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState<null | 'quests' | 'achievements'>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [formData, setFormData] = useState<QuestFormValues>(initialQuestForm);

  const fetchQuests = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/gamification/quests', { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok || !data?.success) throw new Error(errorMessage(data, 'Görevler yüklenemedi'));
      setQuests(Array.isArray(data.data) ? (data.data as Quest[]) : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e : new Error('Görevler yüklenemedi'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQuests();
  }, [fetchQuests]);

  const resetForm = () => setFormData(initialQuestForm);

  const closeDialogs = () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedQuest(null);
    resetForm();
  };

  const submit = async (mode: 'create' | 'update') => {
    if (mode === 'update' && !selectedQuest) return;
    const payload = toQuestPayload(formData, { includeActive: mode === 'update' });
    const invalid = validateQuestPayload(payload);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        mode === 'create' ? '/api/gamification/quests' : `/api/gamification/quests/${encodeURIComponent(selectedQuest!.id)}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await readJson(res);
      if (!res.ok || data?.success === false) {
        throw new Error(errorMessage(data, mode === 'create' ? 'Görev oluşturulamadı' : 'Görev güncellenemedi'));
      }
      toast.success(mode === 'create' ? 'Görev oluşturuldu' : 'Görev güncellendi');
      closeDialogs();
      await fetchQuests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  /** ConfirmAction içinden çağrılır: hata fırlatırsa diyalog açık kalır ve hata gösterilir. */
  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/gamification/quests/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok || data?.success === false) throw new Error(errorMessage(data, 'Görev silinemedi'));
    toast.success('Görev kaldırıldı');
    await fetchQuests();
  };

  const seed = async (action: 'quests_defaults' | 'seed_achievements') => {
    setSeeding(action === 'quests_defaults' ? 'quests' : 'achievements');
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await readJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(errorMessage(data, action === 'quests_defaults' ? 'Görevler oluşturulamadı' : 'Başarımlar eklenemedi'));
      }
      toast.success(
        action === 'quests_defaults'
          ? `${typeof data.created === 'number' ? data.created : 0} varsayılan görev hazırlandı`
          : 'Başarım görevleri eklendi'
      );
      await fetchQuests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setSeeding(null);
    }
  };

  const openEditDialog = (quest: Quest) => {
    setSelectedQuest(quest);
    setFormData(questToFormValues(quest));
    setEditDialogOpen(true);
  };

  const filteredQuests = useMemo(() => {
    if (!quests) return null;
    const q = searchQuery.toLocaleLowerCase('tr-TR').trim();
    if (!q) return quests;
    return quests.filter((quest) => quest.name.toLocaleLowerCase('tr-TR').includes(q));
  }, [quests, searchQuery]);

  const searching = searchQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Görev Yönetimi"
        description="Oyunlaştırma görevlerini oluşturun ve yönetin"
        icon={<Target className="text-white" />}
      />

      {/* Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Görev ara..."
            aria-label="Görev ara"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void seed('quests_defaults')} disabled={seeding !== null}>
            {seeding === 'quests' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Varsayılan Görevleri Ekle
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void seed('seed_achievements')}
            disabled={seeding !== null}
          >
            {seeding === 'achievements' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4 text-warning" aria-hidden />
            )}
            Başarımları Ekle
          </Button>
          <Dialog
            open={createDialogOpen}
            onOpenChange={(open) => {
              if (open) resetForm();
              setCreateDialogOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Yeni Görev
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Yeni Görev Oluştur</DialogTitle>
                <DialogDescription>Kullanıcıların tamamlayabileceği yeni bir görev oluşturun</DialogDescription>
              </DialogHeader>
              <QuestForm
                idPrefix="quest-create"
                value={formData}
                onChange={setFormData}
                onSubmit={() => void submit('create')}
                onCancel={closeDialogs}
                submitLabel="Oluştur"
                saving={saving}
                showActiveToggle={false}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quests Grid */}
      <QueryState
        query={{ data: filteredQuests, error: loadError, isLoading: loading && !quests, refetch: fetchQuests }}
        skeleton="cards"
        loadingLabel="Görevler yükleniyor"
        empty={
          searching
            ? { variant: 'no-results', title: 'Aramanızla eşleşen görev yok', description: 'Farklı bir görev adı deneyin.' }
            : {
                variant: 'first-use',
                title: 'Henüz görev yok',
                description: '“Yeni Görev” ile ilk görevi oluşturun ya da varsayılan görevleri ekleyin.',
              }
        }
      >
        {(list) => (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((quest, index) => {
              const typeKey = normalizeQuestType(quest.type);
              const participants = quest._count?.users || 0;
              return (
                <Motion.div
                  key={quest.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 10) * 0.05 }}
                >
                  <Card glass hover className="group">
                    <CardContent className="space-y-4 p-6">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="rounded-lg bg-primary/10 p-2" aria-hidden>
                            <Target className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">{quest.name}</h3>
                            <Badge className={`border-transparent ${TONE_CHIP[typeKey ? TYPE_TONES[typeKey] : 'neutral']}`}>
                              {typeKey ? QUEST_TYPE_LABELS[typeKey] : quest.type || 'Tür yok'}
                            </Badge>
                          </div>
                        </div>
                        {quest.isActive ? (
                          <CheckCircle className="h-5 w-5 shrink-0 text-success" aria-label="Aktif" />
                        ) : (
                          <XCircle className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Pasif" />
                        )}
                      </div>

                      {/* Description */}
                      <p className="line-clamp-2 text-sm text-muted-foreground">{quest.description}</p>

                      {/* Target */}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Hedef</span>
                        <span className="font-medium tabular-nums">{quest.requirement?.count || 1}</span>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1 text-warning">
                          <Star className="h-4 w-4" aria-hidden />
                          <span className="tabular-nums">{quest.reward?.points || 0} puan</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums">{participants} katılımcı</span>
                      </div>

                      {/* Expiry */}
                      {quest.expiresAt && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" aria-hidden />
                          <span>Bitiş: {new Date(quest.expiresAt).toLocaleDateString('tr-TR')}</span>
                        </div>
                      )}

                      {/* Actions — her zaman görünür (dokunmatikte görünmez-ama-tıklanabilir buton yok) */}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditDialog(quest)}>
                          <Edit className="mr-2 h-4 w-4" aria-hidden />
                          Düzenle
                        </Button>
                        <ConfirmAction
                          trigger={
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              aria-label={`${quest.name} görevini kaldır`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          }
                          title="Görev kaldırılsın mı?"
                          description="Görev müşteri listesinden kalkar. Kullanıcıların bu görevdeki ilerlemesi etkilenebilir."
                          impact={[
                            { label: 'Görev', value: quest.name },
                            { label: 'Katılımcı', value: participants, emphasis: participants > 0 },
                          ]}
                          confirmPhrase={participants > 0 ? quest.name : undefined}
                          confirmLabel="Görevi kaldır"
                          onConfirm={() => handleDelete(quest.id)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </Motion.div>
              );
            })}
          </div>
        )}
      </QueryState>

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialogs();
          else setEditDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Görev Düzenle</DialogTitle>
            <DialogDescription>{selectedQuest?.name} görevini düzenleyin</DialogDescription>
          </DialogHeader>
          {selectedQuest ? (
            <QuestForm
              key={selectedQuest.id}
              idPrefix="quest-edit"
              value={formData}
              onChange={setFormData}
              onSubmit={() => void submit('update')}
              onCancel={closeDialogs}
              submitLabel="Güncelle"
              saving={saving}
              showActiveToggle
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
