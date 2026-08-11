'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Database,
  RefreshCw,
  Loader2,
  Shield,
  Store,
  CheckCircle2,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  Zap,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

interface LearningProfile {
  id: string;
  dealerId: string;
  version: number;
  status: string;
  profile: Record<string, unknown> | null;
  lastTrainedAt: string | null;
  trainingFeedbackCount: number;
  correctionsUsed: number;
  createdAt: string;
  updatedAt: string;
}

interface DealerLearningData {
  dealerId: string;
  dealerName: string;
  profile: LearningProfile | null;
  embeddingsCount: number;
  correctionsCount: number;
}

type FilterType = 'all' | 'with_profile' | 'no_profile';

export default function AdminAILearningPage() {
  const [loading, setLoading] = useState(true);
  const [dealers, setDealers] = useState<DealerLearningData[]>([]);
  const [updatingDealer, setUpdatingDealer] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<DealerLearningData | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  // Sistem geneli AI öğrenme
  const [systemProfile, setSystemProfile] = useState<{
    profile: unknown;
    systemPrompt: string | null;
    chatSystemPrompt: string | null;
    trainingDataStats: unknown;
    version: number;
    status: string;
    lastTrainedAt: string | null;
  } | null>(null);
  const [systemStats, setSystemStats] = useState<{
    feedbackCount: number;
    correctionCount: number;
    dealerCount: number;
    embeddingCount: number;
  } | null>(null);
  const [systemTraining, setSystemTraining] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showChatPrompt, setShowChatPrompt] = useState(false);
  const [editPrompts, setEditPrompts] = useState(false);
  const [editSystemPrompt, setEditSystemPrompt] = useState('');
  const [editChatPrompt, setEditChatPrompt] = useState('');
  const [savingPrompts, setSavingPrompts] = useState(false);

  useEffect(() => {
    fetchLearningData();
    fetchSystemProfile();
  }, []);

  const fetchSystemProfile = async () => {
    try {
      const res = await fetch('/api/admin/ai-learning/system');
      const data = await res.json();
      if (data.success) {
        setSystemProfile(data.profile || null);
        setSystemStats(data.stats || null);
      }
    } catch {
      // ignore
    }
  };

  const triggerSystemTraining = async () => {
    if (systemTraining) return;
    if (!confirm('Sistem geneli AI eğitimi başlatılsın mı? Tüm veritabanı verileri (geri bildirimler, düzeltmeler, kullanıcılar, ayarlar) kullanılacak. Bu işlem birkaç dakika sürebilir.')) return;
    setSystemTraining(true);
    try {
      const res = await fetch('/api/admin/ai-learning/system', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Sistem profili v${data.version} güncellendi!`);
        await fetchSystemProfile();
      } else {
        toast.error(data.error || 'Eğitim başarısız');
      }
    } catch {
      toast.error('Eğitim başarısız');
    } finally {
      setSystemTraining(false);
    }
  };

  const savePrompts = async () => {
    if (savingPrompts) return;
    setSavingPrompts(true);
    try {
      const res = await fetch('/api/admin/ai-learning/system', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: editSystemPrompt || null,
          chatSystemPrompt: editChatPrompt || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Promptlar güncellendi');
        setEditPrompts(false);
        await fetchSystemProfile();
      } else {
        toast.error(data.error || 'Güncelleme başarısız');
      }
    } catch {
      toast.error('Güncelleme hatası');
    } finally {
      setSavingPrompts(false);
    }
  };

  const startEditPrompts = () => {
    setEditSystemPrompt(systemProfile?.systemPrompt ?? '');
    setEditChatPrompt(systemProfile?.chatSystemPrompt ?? '');
    setEditPrompts(true);
  };

  const fetchLearningData = async () => {
    try {
      // Tüm dealer'ları al (API items + total döner; role=DEALER ile filtrele)
      const usersRes = await fetch('/api/admin/users?role=DEALER&pageSize=100');
      const usersData = await usersRes.json();
      const dealerUsers = usersData.items || usersData.users || [];

      const results: DealerLearningData[] = [];
      for (const dealer of dealerUsers.slice(0, 50)) {
        try {
          const res = await fetch(`/api/ai/learning?dealerId=${dealer.id}`);
          const data = await res.json();
          results.push({
            dealerId: dealer.id,
            dealerName: dealer.businessName || dealer.name || 'İsimsiz',
            profile: data.profile || null,
            embeddingsCount: data.embeddingsCount || 0,
            correctionsCount: data.correctionsCount || 0,
          });
        } catch {
          results.push({
            dealerId: dealer.id,
            dealerName: dealer.businessName || dealer.name || 'İsimsiz',
            profile: null,
            embeddingsCount: 0,
            correctionsCount: 0,
          });
        }
      }

      setDealers(results);
    } catch (error) {
      console.error('Failed to fetch learning data:', error);
      toast.error('Öğrenme verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const triggerProfileUpdate = async (dealerId: string) => {
    setUpdatingDealer(dealerId);
    try {
      const res = await fetch('/api/ai/learning?action=update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealerId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Adaptif profil güncellendi!');
        await fetchLearningData();
      } else {
        toast.error(data.error || 'Güncelleme başarısız');
      }
    } catch {
      toast.error('Profil güncelleme hatası');
    } finally {
      setUpdatingDealer(null);
    }
  };

  const triggerBulkUpdate = async () => {
    const toUpdate = dealers.filter(d => d.profile || d.embeddingsCount > 0);
    if (toUpdate.length === 0) {
      toast.info('Güncellenecek dealer yok');
      return;
    }
    if (!confirm(`${toUpdate.length} işletme için profil güncellemesi başlatılsın mı? Bu işlem birkaç dakika sürebilir.`)) return;
    setBulkUpdating(true);
    let done = 0;
    for (const d of toUpdate) {
      try {
        const res = await fetch('/api/ai/learning?action=update_profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealerId: d.dealerId }),
        });
        if ((await res.json()).success) done++;
      } catch {
        // skip
      }
    }
    setBulkUpdating(false);
    toast.success(`${done}/${toUpdate.length} profil güncellendi`);
    await fetchLearningData();
  };

  const filteredDealers = filter === 'all'
    ? dealers
    : filter === 'with_profile'
      ? dealers.filter(d => d.profile)
      : dealers.filter(d => !d.profile);

  if (loading) {
    return (
      <div className="space-y-6 pb-8">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalProfiles = dealers.filter(d => d.profile).length;
  const totalEmbeddings = dealers.reduce((acc, d) => acc + d.embeddingsCount, 0);
  const totalCorrections = dealers.reduce((acc, d) => acc + d.correctionsCount, 0);

  return (
    <div className="space-y-6 pb-8">
      <AdminPremiumHero
        eyebrow="Derin öğrenme yönetimi"
        title={
          <span className="flex items-center gap-3">
            <Brain className="w-8 h-8 shrink-0" /> AI Öğrenme Merkezi
          </span>
        }
        description="Adaptif öğrenme profilleri, embeddings ve düzeltme yönetimi"
        icon={<Shield className="text-white" />}
        aside={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <div className="rounded-xl px-4 py-2 text-center border min-w-[5.5rem] backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
              <span className="text-xs text-muted-foreground dark:text-white/70">Profil</span>
              <p className="text-2xl font-bold tabular-nums">{totalProfiles}</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center border min-w-[5.5rem] backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
              <span className="text-xs text-muted-foreground dark:text-white/70">Embedding</span>
              <p className="text-2xl font-bold tabular-nums">{totalEmbeddings}</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center border min-w-[5.5rem] backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
              <span className="text-xs text-muted-foreground dark:text-white/70">Düzeltme</span>
              <p className="text-2xl font-bold tabular-nums">{totalCorrections}</p>
            </div>
          </div>
        }
      />

      {/* Sistem Derinliği ve Öğrenme Kapsamı */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
        <Card className="border border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" aria-hidden />
              Sistem Derinliği ve Öğrenme Kapsamı
            </CardTitle>
            <CardDescription>
              Tüm veritabanı verileriyle eğitilen merkezi AI. Geri bildirimler, düzeltmeler, kullanıcılar ve ayarlar dahil en ince detaylar kullanılır.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {systemStats && (
                <>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Toplam Geri Bildirim</p>
                    <p className="text-xl font-bold">{systemStats.feedbackCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">AI Düzeltmesi</p>
                    <p className="text-xl font-bold">{systemStats.correctionCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Dealer</p>
                    <p className="text-xl font-bold">{systemStats.dealerCount}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Embedding</p>
                    <p className="text-xl font-bold">{systemStats.embeddingCount}</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {systemProfile && (
                <>
                  <Badge variant="secondary" className="border-0 bg-primary/15 text-primary">
                    v{systemProfile.version}
                  </Badge>
                  <Badge variant={systemProfile.status === 'ready' ? 'default' : 'secondary'}>
                    {systemProfile.status === 'ready' ? 'Hazır' : systemProfile.status}
                  </Badge>
                  {systemProfile.lastTrainedAt && (
                    <span className="text-xs text-muted-foreground">
                      Son eğitim: {new Date(systemProfile.lastTrainedAt).toLocaleString('tr-TR')}
                    </span>
                  )}
                </>
              )}
              <Button
                onClick={triggerSystemTraining}
                disabled={systemTraining || (systemStats?.feedbackCount ?? 0) < 3}
              >
                {systemTraining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                {systemTraining ? 'Eğitiliyor...' : 'Sistem Profilini Eğit'}
              </Button>
              {(systemStats?.feedbackCount ?? 0) < 3 && (
                <span className="text-xs text-muted-foreground">En az 3 geri bildirim gerekli</span>
              )}
            </div>
            {systemProfile && (systemProfile.systemPrompt || systemProfile.chatSystemPrompt || editPrompts) && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {!editPrompts ? (
                    <Button variant="outline" size="sm" onClick={startEditPrompts}>
                      Sistem / Sohbet Promptunu Düzenle
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={savePrompts}
                        disabled={savingPrompts}
                      >
                        {savingPrompts ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Kaydet
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditPrompts(false)}>
                        İptal
                      </Button>
                    </>
                  )}
                </div>
                {editPrompts ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">Sistem promptu (analiz/rapor için)</label>
                      <textarea
                        value={editSystemPrompt}
                        onChange={e => setEditSystemPrompt(e.target.value)}
                        className="w-full p-3 rounded-xl bg-muted/50 text-sm font-mono min-h-[120px]"
                        placeholder="Sistem promptu..."
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-2">Sohbet promptu (Ask AI için)</label>
                      <textarea
                        value={editChatPrompt}
                        onChange={e => setEditChatPrompt(e.target.value)}
                        className="w-full p-3 rounded-xl bg-muted/50 text-sm font-mono min-h-[120px]"
                        placeholder="Sohbet promptu..."
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {systemProfile?.systemPrompt && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/90"
                        >
                          <FileText className="h-4 w-4" />
                          {showSystemPrompt ? 'Sistem promptunu gizle' : 'Sistem promptunu göster'}
                        </button>
                        <AnimatePresence>
                          {showSystemPrompt && (
                            <motion.pre
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="p-4 rounded-xl bg-muted/50 text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap font-mono"
                            >
                              {systemProfile.systemPrompt}
                            </motion.pre>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    {systemProfile?.chatSystemPrompt && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowChatPrompt(!showChatPrompt)}
                          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/90"
                        >
                          <FileText className="h-4 w-4" />
                          {showChatPrompt ? 'Sohbet promptunu gizle' : 'Sohbet promptunu göster'}
                        </button>
                        <AnimatePresence>
                          {showChatPrompt && (
                            <motion.pre
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="p-4 rounded-xl bg-muted/50 text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap font-mono"
                            >
                              {systemProfile.chatSystemPrompt}
                            </motion.pre>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {systemProfile?.profile != null && typeof systemProfile.profile === 'object' ? (
              <div className="p-4 rounded-xl bg-muted/30 text-sm">
                <p className="font-medium mb-2 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" aria-hidden />
                  Öğrenilen Profil Özeti
                </p>
                <pre className="text-xs overflow-x-auto max-h-40 overflow-y-auto">
                  {JSON.stringify(systemProfile.profile, null, 2)}
                </pre>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      {/* Nasıl çalışır? */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-primary/20">
          <CardHeader className="py-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowHelp((v) => !v)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <HelpCircle className="h-4 w-4 text-primary" />
                AI Öğrenme ve Adaptasyon nasıl çalışır?
              </span>
              {showHelp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </CardHeader>
          {showHelp && (
            <CardContent className="pt-0 text-sm text-muted-foreground space-y-2">
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Sistem geneli AI:</strong> Tüm veritabanı verileriyle (geri bildirimler, düzeltmeler, kullanıcılar, ayarlar) eğitilen merkezi AI. Dünya standartlarında sistem promptu ve öğrenilen kalıplar.</li>
                <li><strong>Adaptif dealer profili:</strong> Her işletme için geri bildirimler ve düzeltmelerden çıkarılan JSON profil (sektör, temalar, terimler, yanıt kuralları).</li>
                <li><strong>Geri bildirim analizi:</strong> Yeni geri bildirim analiz edilirken sistem + dealer profili bağlam olarak kullanılır; sonuçlar işletmeye daha uyumlu olur.</li>
                <li><strong>Embedding:</strong> Metin vektörleri benzer geri bildirim araması ve gruplama için saklanır.</li>
                <li><strong>Düzeltmeler:</strong> Bayi AI sonucunu düzelttiğinde (duygu, niyet, tema vb.) kayıt tutulur; hem sistem hem dealer profili güncellemesinde bu düzeltmeler öğrenilir.</li>
                <li><strong>Ne zaman güncellemeli?</strong> Sistem profilini periyodik (örn. haftalık) veya önemli veri artışı sonrası eğitin. Dealer profili: 20+ yeni geri bildirim veya 5+ yeni düzeltme sonrası.</li>
              </ul>
            </CardContent>
          )}
        </Card>
      </motion.div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Dealer', value: dealers.length, icon: Store, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Eğitilmiş Profil', value: totalProfiles, icon: Brain, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Embedding Vektörü', value: totalEmbeddings, icon: Database, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'AI Düzeltmesi', value: totalCorrections, icon: CheckCircle2, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.05 }}>
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <div className={`p-2 rounded-lg ${item.bg} w-fit mx-auto mb-2`}>
                    <Icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Dealer Learning Profiles */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" aria-hidden /> Dealer Öğrenme Profilleri
                </CardTitle>
                <CardDescription>Her dealer için adaptif AI öğrenme durumu</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border bg-muted/30 p-0.5">
                  {(['all', 'with_profile', 'no_profile'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === f ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {f === 'all' ? 'Tümü' : f === 'with_profile' ? 'Profil var' : 'Profil yok'}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={triggerBulkUpdate}
                  disabled={bulkUpdating || dealers.filter(d => d.profile || d.embeddingsCount > 0).length === 0}
                >
                  {bulkUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Toplu güncelle
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredDealers.map((dealer, index) => (
                <motion.div
                  key={dealer.dealerId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + index * 0.03 }}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${selectedDealer?.dealerId === dealer.dealerId ? 'border-primary/30 bg-primary/5' : 'bg-card hover:border-primary/20'}`}
                  onClick={() => setSelectedDealer(selectedDealer?.dealerId === dealer.dealerId ? null : dealer)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted/50">
                        <Store className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{dealer.dealerName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={dealer.profile ? 'default' : 'secondary'} className="text-xs">
                            {dealer.profile ? `v${dealer.profile.version}` : 'Profil yok'}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Database className="h-3 w-3" /> {dealer.embeddingsCount}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> {dealer.correctionsCount}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {dealer.profile?.status === 'ready' && (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-xs">Hazır</Badge>
                      )}
                      {dealer.profile?.status === 'training' && (
                        <Badge className="bg-yellow-500/10 text-yellow-500 border-0 text-xs">Eğitiliyor</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); triggerProfileUpdate(dealer.dealerId); }}
                        disabled={updatingDealer === dealer.dealerId}
                      >
                        {updatingDealer === dealer.dealerId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {selectedDealer?.dealerId === dealer.dealerId && dealer.profile && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Versiyon</p>
                          <p className="font-bold text-lg">{dealer.profile.version}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Eğitim Feedback</p>
                          <p className="font-bold text-lg">{dealer.profile.trainingFeedbackCount}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Düzeltme</p>
                          <p className="font-bold text-lg">{dealer.profile.correctionsUsed}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Son Eğitim</p>
                          <p className="font-bold text-xs mt-1">
                            {dealer.profile.lastTrainedAt
                              ? new Date(dealer.profile.lastTrainedAt).toLocaleDateString('tr-TR')
                              : 'Hiç'}
                          </p>
                        </div>
                      </div>
                      {dealer.profile.profile && (
                        <div className="mt-3 space-y-2 text-xs">
                          {(() => {
                            const p = dealer.profile!.profile as Record<string, unknown>;
                            const bc = p.businessContext as Record<string, unknown> | undefined;
                            const themes = p.learnedThemes as Array<{ theme?: string; priority?: string }> | undefined;
                            const guidelines = p.responseGuidelines as { do?: string[]; avoid?: string[] } | undefined;
                            const aliases = p.entityAliases as Array<{ alias?: string; canonical?: string }> | undefined;
                            return (
                              <>
                                {bc && (bc.sector || (Array.isArray(bc.keyTerms) && bc.keyTerms.length > 0)) && (
                                  <div className="p-2 rounded-lg bg-muted/20">
                                    <p className="font-medium text-foreground mb-1">İş bağlamı</p>
                                    {bc.sector != null ? <p>Sektör: {String(bc.sector)}</p> : null}
                                    {Array.isArray(bc.keyTerms) && bc.keyTerms.length > 0 && (
                                      <p className="text-muted-foreground">Terimler: {bc.keyTerms.slice(0, 8).join(', ')}</p>
                                    )}
                                  </div>
                                )}
                                {Array.isArray(themes) && themes.length > 0 && (
                                  <div className="p-2 rounded-lg bg-muted/20">
                                    <p className="font-medium text-foreground mb-1">Temalar</p>
                                    <p className="text-muted-foreground">{themes.slice(0, 6).map(t => t.theme || '').filter(Boolean).join(' • ')}</p>
                                  </div>
                                )}
                                {guidelines && (guidelines.do?.length || guidelines.avoid?.length) && (
                                  <div className="p-2 rounded-lg bg-muted/20">
                                    <p className="font-medium text-foreground mb-1">Kurallar</p>
                                    {guidelines.do?.length ? <p>Yap: {guidelines.do.slice(0, 3).join('; ')}</p> : null}
                                    {guidelines.avoid?.length ? <p className="text-muted-foreground">Kaçın: {guidelines.avoid.slice(0, 3).join('; ')}</p> : null}
                                  </div>
                                )}
                                {Array.isArray(aliases) && aliases.length > 0 && (
                                  <div className="p-2 rounded-lg bg-muted/20">
                                    <p className="font-medium text-foreground mb-1">Varlıklar</p>
                                    <p className="text-muted-foreground">{aliases.slice(0, 5).map(e => e.canonical || e.alias).filter(Boolean).join(', ')}</p>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
