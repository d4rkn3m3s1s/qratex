'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Settings,
  Save,
  Loader2,
  Sparkles,
  Shield,
  Activity,
  Zap,
  Eye,
  Users,
  Bell,
  Search,
  TrendingUp,
  CheckCircle2,
  Store,
  RefreshCw,
  AlertTriangle,
  Target,
  MessageSquare,
  BarChart3,
  FileText,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

interface DealerSettings {
  id: string;
  dealerId: string;
  dealer?: { id: string; name: string | null; businessName: string | null };
  isEnabled: boolean;
  autoAnalyze: boolean;
  analysisLanguage: string;
  sentimentEnabled: boolean;
  emotionEnabled: boolean;
  topicEnabled: boolean;
  intentEnabled: boolean;
  urgencyEnabled: boolean;
  entityEnabled: boolean;
  toxicityEnabled: boolean;
  churnEnabled: boolean;
  themeClusterEnabled: boolean;
  weeklyReportEnabled: boolean;
  monthlyReportEnabled: boolean;
  alertOnToxic: boolean;
  alertOnUrgent: boolean;
  alertOnChurnRisk: boolean;
  customPrompt: string | null;
}

const MODULES = [
  { key: 'sentimentEnabled', label: 'Duygu Analizi', desc: 'Olumlu/olumsuz/nötr tespit', icon: MessageSquare, color: 'text-emerald-500' },
  { key: 'emotionEnabled', label: 'Duygu Tespiti', desc: 'Mutlu, kızgın, üzgün vb.', icon: Activity, color: 'text-primary' },
  { key: 'topicEnabled', label: 'Konu Çıkarma', desc: 'Hizmet, kalite, fiyat vb.', icon: FileText, color: 'text-blue-500' },
  { key: 'intentEnabled', label: 'Niyet Tespiti', desc: 'Şikayet, öneri, övgü', icon: Target, color: 'text-orange-500' },
  { key: 'urgencyEnabled', label: 'Aciliyet Tespiti', desc: 'Düşük-kritik aciliyet', icon: AlertTriangle, color: 'text-red-500' },
  { key: 'entityEnabled', label: 'Varlık Tanıma', desc: 'Ürün, kişi, mekan, hizmet', icon: Search, color: 'text-primary' },
  { key: 'toxicityEnabled', label: 'Toksisite Kontrolü', desc: 'Uygunsuz içerik tespiti', icon: Shield, color: 'text-amber-500' },
  { key: 'churnEnabled', label: 'Churn Tahmini', desc: 'Müşteri kaybı riski', icon: Users, color: 'text-destructive' },
  { key: 'themeClusterEnabled', label: 'Tema Kümeleme', desc: 'Otomatik tema keşfi', icon: Layers, color: 'text-primary' },
] as const;

export default function AdminAISettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allDealerSettings, setAllDealerSettings] = useState<DealerSettings[]>([]);
  const [selectedDealer, setSelectedDealer] = useState<string | null>(null);
  const [editSettings, setEditSettings] = useState<Partial<DealerSettings>>({});

  useEffect(() => {
    fetchAllSettings();
  }, []);

  const fetchAllSettings = async () => {
    try {
      const res = await fetch('/api/ai/analyze?action=get_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (data.allSettings) {
        setAllDealerSettings(data.allSettings);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      toast.error('AI ayarları yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const bootstrapSettings = async () => {
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ensure_ai_settings' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'AI ayarlar? haz?rlanamad?');
      toast.success(`${data.created ?? 0} dealer i?in varsay?lan AI ayar? olu?turuldu`);
      fetchAllSettings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI ayarlar? haz?rlanamad?');
    }
  };

  const selectDealer = (dealerId: string) => {
    setSelectedDealer(dealerId);
    const ds = allDealerSettings.find(s => s.dealerId === dealerId);
    if (ds) {
      setEditSettings({ ...ds });
    }
  };

  const toggleModule = (key: string, value: boolean) => {
    setEditSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    if (!selectedDealer) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ai/analyze?action=update_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editSettings, dealerId: selectedDealer }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('AI ayarları güncellendi!');
        await fetchAllSettings();
      } else {
        toast.error(data.error || 'Güncelleme başarısız');
      }
    } catch {
      toast.error('Güncelleme hatası');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">AI ayarları yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <AdminPremiumHero
        eyebrow="Sistem yönetimi"
        title={
          <span className="flex items-center gap-3">
            <Settings className="w-8 h-8 shrink-0" /> AI Ayarları Yönetimi
          </span>
        }
        description="Tüm dealer'ların AI analiz modüllerini ve ayarlarını yönetin"
        icon={<Shield className="text-white" />}
        aside={
          <div className="flex flex-wrap gap-2 justify-end">
            <div className="rounded-xl px-4 py-2 text-center border min-w-[6rem] backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
              <span className="text-xs text-muted-foreground dark:text-white/70">Toplam dealer</span>
              <p className="text-2xl font-bold tabular-nums">{allDealerSettings.length}</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center border min-w-[6rem] backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
              <span className="text-xs text-muted-foreground dark:text-white/70">AI aktif</span>
              <p className="text-2xl font-bold tabular-nums">{allDealerSettings.filter((s) => s.isEnabled).length}</p>
            </div>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Dealer Listesi */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Store className="h-5 w-5 text-primary" /> Dealer&apos;lar
              </CardTitle>
              <CardDescription>AI ayarlarını yönetmek için bir dealer seçin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {allDealerSettings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Henüz AI ayarı olan dealer yok</p>
              ) : (
                allDealerSettings.map((ds) => (
                  <button
                    key={ds.dealerId}
                    onClick={() => selectDealer(ds.dealerId)}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${selectedDealer === ds.dealerId ? 'border-primary/30 bg-primary/10' : 'bg-card hover:border-primary/20'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{ds.dealer?.businessName || ds.dealer?.name || 'İsimsiz'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ds.isEnabled ? '🟢 AI Aktif' : '🔴 AI Kapalı'}
                        </p>
                      </div>
                      <Badge variant={ds.isEnabled ? 'default' : 'secondary'} className="text-xs">
                        {ds.autoAnalyze ? 'Otomatik' : 'Manuel'}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Ayar Detayları */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedDealer ? (
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <Brain className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-xl font-bold mb-2">Dealer Seçin</h3>
                <p className="text-muted-foreground">Soldaki listeden AI ayarlarını yönetmek istediğiniz dealer&apos;ı seçin</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Ana Ayarlar */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" /> Ana Ayarlar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                      <div>
                        <Label className="font-medium">AI Analiz Motoru</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">AI&apos;ı bu dealer için aç/kapat</p>
                      </div>
                      <Switch checked={editSettings.isEnabled ?? true} onCheckedChange={v => toggleModule('isEnabled', v)} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                      <div>
                        <Label className="font-medium">Otomatik Analiz</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Yeni feedback&apos;ler otomatik analiz edilsin</p>
                      </div>
                      <Switch checked={editSettings.autoAnalyze ?? true} onCheckedChange={v => toggleModule('autoAnalyze', v)} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Analiz Modülleri */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" /> Derin Öğrenme Modülleri
                    </CardTitle>
                    <CardDescription>Hangi AI analiz modüllerinin aktif olacağını seçin</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-3">
                      {MODULES.map(mod => {
                        const Icon = mod.icon;
                        const isEnabled = (editSettings as Record<string, unknown>)[mod.key] ?? true;
                        return (
                          <div key={mod.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg bg-background`}>
                                <Icon className={`h-4 w-4 ${mod.color}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{mod.label}</p>
                                <p className="text-xs text-muted-foreground">{mod.desc}</p>
                              </div>
                            </div>
                            <Switch checked={!!isEnabled} onCheckedChange={v => toggleModule(mod.key, v)} />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Raporlama & Alertler */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" /> Raporlama & Uyarılar
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { key: 'weeklyReportEnabled', label: 'Haftalık AI Raporu' },
                      { key: 'monthlyReportEnabled', label: 'Aylık AI Raporu' },
                      { key: 'alertOnToxic', label: 'Toksik İçerik Uyarısı' },
                      { key: 'alertOnUrgent', label: 'Acil Geri Bildirim Uyarısı' },
                      { key: 'alertOnChurnRisk', label: 'Churn Riski Uyarısı' },
                    ].map(item => (
                      <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                        <Label className="font-medium text-sm">{item.label}</Label>
                        <Switch
                          checked={!!((editSettings as Record<string, unknown>)[item.key] ?? true)}
                          onCheckedChange={v => toggleModule(item.key, v)}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Custom Prompt */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" /> Özel Prompt
                    </CardTitle>
                    <CardDescription>AI analiz motoruna özel bağlam ekleyin</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={editSettings.customPrompt || ''}
                      onChange={e => setEditSettings(prev => ({ ...prev, customPrompt: e.target.value }))}
                      placeholder="Ör: Bu işletme bir restoran. Yemek kalitesi ve servis hızı özellikle önemli..."
                      rows={4}
                      className="bg-muted/30"
                    />
                  </CardContent>
                </Card>
              </motion.div>

              {/* AI Tones Management */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" /> AI Yanıt Üslupları
                      </CardTitle>
                      <CardDescription>Otomatik yanıtlar için kullanılacak sistem üsluplarını yönetin</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Bu kısım normalde bir liste ve modal ile yeni ekleme içermeli, şimdilik temel bir yapı kuruyorum */}
                      <p className="text-xs text-muted-foreground italic">Dinamik üslup yönetimi API üzerinden aktiftir. Detaylı UI için 'modules/ai-tones' sayfasını ziyaret edin.</p>
                      <Button variant="outline" className="w-full" asChild>
                        <a href="/admin/modules/ai-tones">Üslupları Yönet (Gelişmiş)</a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Kaydet */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                <Button onClick={saveSettings} disabled={saving} className="w-full" size="lg">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Ayarları Kaydet
                </Button>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

