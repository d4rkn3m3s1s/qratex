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
import { toast } from 'sonner';

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
  { key: 'emotionEnabled', label: 'Duygu Tespiti', desc: 'Mutlu, kızgın, üzgün vb.', icon: Activity, color: 'text-pink-500' },
  { key: 'topicEnabled', label: 'Konu Çıkarma', desc: 'Hizmet, kalite, fiyat vb.', icon: FileText, color: 'text-blue-500' },
  { key: 'intentEnabled', label: 'Niyet Tespiti', desc: 'Şikayet, öneri, övgü', icon: Target, color: 'text-orange-500' },
  { key: 'urgencyEnabled', label: 'Aciliyet Tespiti', desc: 'Düşük-kritik aciliyet', icon: AlertTriangle, color: 'text-red-500' },
  { key: 'entityEnabled', label: 'Varlık Tanıma', desc: 'Ürün, kişi, mekan, hizmet', icon: Search, color: 'text-violet-500' },
  { key: 'toxicityEnabled', label: 'Toksisite Kontrolü', desc: 'Uygunsuz içerik tespiti', icon: Shield, color: 'text-amber-500' },
  { key: 'churnEnabled', label: 'Churn Tahmini', desc: 'Müşteri kaybı riski', icon: Users, color: 'text-rose-500' },
  { key: 'themeClusterEnabled', label: 'Tema Kümeleme', desc: 'Otomatik tema keşfi', icon: Layers, color: 'text-indigo-500' },
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
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground">AI ayarları yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-4 sm:p-6 md:p-8"
      >
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-white/80" />
              <span className="text-white/80 text-sm font-medium">Sistem Yönetimi</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Settings className="w-8 h-8" /> AI Ayarları Yönetimi
            </h1>
            <p className="text-white/70 mt-1">Tüm dealer&apos;ların AI analiz modüllerini ve ayarlarını yönetin</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center">
              <span className="text-white/60 text-xs">Toplam Dealer</span>
              <p className="text-2xl font-bold">{allDealerSettings.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center">
              <span className="text-white/60 text-xs">AI Aktif</span>
              <p className="text-2xl font-bold">{allDealerSettings.filter(s => s.isEnabled).length}</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Dealer Listesi */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Store className="h-5 w-5 text-violet-500" /> Dealer&apos;lar
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
                    className={`w-full text-left p-3 rounded-xl border transition-all ${selectedDealer === ds.dealerId ? 'bg-violet-500/10 border-violet-500/30' : 'bg-card hover:border-violet-500/20'}`}
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
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
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
                <Card className="border-0 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-violet-500" /> Ana Ayarlar
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
                <Card className="border-0 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-violet-500" /> Derin Öğrenme Modülleri
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
                <Card className="border-0 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-violet-500" /> Raporlama & Uyarılar
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
                <Card className="border-0 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-violet-500" /> Özel Prompt
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

              {/* Kaydet */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
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
