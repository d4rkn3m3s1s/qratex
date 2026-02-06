'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Settings,
  Save,
  Loader2,
  Sparkles,
  MessageSquare,
  Shield,
  Target,
  AlertTriangle,
  Activity,
  Zap,
  Eye,
  Users,
  BarChart3,
  Bell,
  FileText,
  Search,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface AISettingsState {
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

const defaultSettings: AISettingsState = {
  isEnabled: true,
  autoAnalyze: true,
  analysisLanguage: 'tr',
  sentimentEnabled: true,
  emotionEnabled: true,
  topicEnabled: true,
  intentEnabled: true,
  urgencyEnabled: true,
  entityEnabled: true,
  toxicityEnabled: true,
  churnEnabled: true,
  themeClusterEnabled: true,
  weeklyReportEnabled: true,
  monthlyReportEnabled: true,
  alertOnToxic: true,
  alertOnUrgent: true,
  alertOnChurnRisk: true,
  customPrompt: null,
};

const analysisFeatures = [
  { key: 'sentimentEnabled', label: 'Duygu Analizi', description: 'Geri bildirimlerin olumlu/olumsuz/nötr sınıflandırması', icon: MessageSquare, color: 'text-blue-500' },
  { key: 'emotionEnabled', label: 'Duygu Tespiti', description: 'Mutlu, kızgın, hayal kırıklığı gibi spesifik duyguları tespit eder', icon: Sparkles, color: 'text-purple-500' },
  { key: 'topicEnabled', label: 'Konu Çıkarma', description: 'Hizmet, kalite, fiyat gibi konuları otomatik tespit eder', icon: FileText, color: 'text-emerald-500' },
  { key: 'intentEnabled', label: 'Niyet Analizi', description: 'Şikayet, öneri, övgü, soru gibi niyetleri belirler', icon: Target, color: 'text-orange-500' },
  { key: 'urgencyEnabled', label: 'Aciliyet Tespiti', description: 'Geri bildirimin ne kadar acil aksiyon gerektirdiğini belirler', icon: AlertTriangle, color: 'text-red-500' },
  { key: 'entityEnabled', label: 'Varlık Tanıma', description: 'Kişi, ürün, mekan gibi varlıkları metinden çıkarır', icon: Search, color: 'text-cyan-500' },
  { key: 'toxicityEnabled', label: 'Toksisite Kontrolü', description: 'Hakaret, küfür ve uygunsuz içerik tespiti', icon: Shield, color: 'text-yellow-500' },
  { key: 'churnEnabled', label: 'Churn Tahmini', description: 'Müşteri kaybı riskini tahmin eder', icon: Users, color: 'text-pink-500' },
  { key: 'themeClusterEnabled', label: 'Tema Kümeleme', description: 'Benzer geri bildirimleri otomatik gruplar', icon: BarChart3, color: 'text-indigo-500' },
];

const alertFeatures = [
  { key: 'alertOnToxic', label: 'Toksik İçerik Uyarısı', description: 'Uygunsuz içerik tespit edildiğinde bildirim gönder', icon: Shield, color: 'text-red-500' },
  { key: 'alertOnUrgent', label: 'Acil Durum Uyarısı', description: 'Aciliyet skoru yüksek geri bildirim geldiğinde uyar', icon: AlertTriangle, color: 'text-orange-500' },
  { key: 'alertOnChurnRisk', label: 'Churn Risk Uyarısı', description: 'Müşteri kaybı riski yüksek olduğunda bildir', icon: Users, color: 'text-pink-500' },
];

const reportFeatures = [
  { key: 'weeklyReportEnabled', label: 'Haftalık AI Raporu', description: 'Her hafta otomatik içgörü raporu oluştur', icon: FileText, color: 'text-blue-500' },
  { key: 'monthlyReportEnabled', label: 'Aylık AI Raporu', description: 'Her ay detaylı analiz raporu oluştur', icon: BarChart3, color: 'text-violet-500' },
];

export default function DealerAISettingsPage() {
  const [settings, setSettings] = useState<AISettingsState>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/ai/analyze?action=get_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to fetch AI settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/analyze?action=update_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('AI ayarları kaydedildi!');
      } else {
        toast.error('Ayarlar kaydedilemedi');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  // Sentiment alt katmanları - sentiment kapatılınca bunlar da kapanır
  const sentimentSubLayers = ['emotionEnabled', 'intentEnabled', 'urgencyEnabled'];

  const toggleSetting = (key: string) => {
    setSettings(prev => {
      const newVal = !prev[key as keyof AISettingsState];
      const updates: Partial<AISettingsState> = { [key]: newVal };

      // Sentiment kapatılınca alt katmanlar da kapansın (Zonka davranışı)
      if (key === 'sentimentEnabled' && !newVal) {
        for (const sub of sentimentSubLayers) {
          (updates as Record<string, boolean>)[sub] = false;
        }
      }

      // Ana AI motoru kapatılınca tüm alt özellikler de kapansın
      if (key === 'isEnabled' && !newVal) {
        for (const f of analysisFeatures) {
          (updates as Record<string, boolean>)[f.key] = false;
        }
        for (const f of alertFeatures) {
          (updates as Record<string, boolean>)[f.key] = false;
        }
        for (const f of reportFeatures) {
          (updates as Record<string, boolean>)[f.key] = false;
        }
        updates.autoAnalyze = false;
      }

      return { ...prev, ...updates };
    });
  };

  const enabledCount = analysisFeatures.filter(f => settings[f.key as keyof AISettingsState]).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/30 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ y: [0, -15, 0], opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-white/80" />
              <span className="text-white/80 text-sm font-medium">Yapay Zeka Yapılandırması</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Brain className="w-8 h-8" />
              AI Kontrol Paneli
            </h1>
            <p className="text-white/70 mt-1">
              AI analiz özelliklerini ihtiyacınıza göre yapılandırın
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white">
              <span className="text-white/60 text-sm">Aktif Özellik</span>
              <p className="text-2xl font-bold">{enabledCount}/{analysisFeatures.length}</p>
            </div>
            <Button onClick={saveSettings} disabled={saving} className="bg-white text-purple-600 hover:bg-white/90">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Master Toggle */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${settings.isEnabled ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                  <Zap className={`h-6 w-6 ${settings.isEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">AI Motoru</h3>
                  <p className="text-sm text-muted-foreground">Tüm AI özelliklerini açıp kapatın</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={settings.isEnabled ? 'bg-emerald-500/10 text-emerald-500 border-0' : 'bg-muted text-muted-foreground border-0'}>
                  {settings.isEnabled ? 'Aktif' : 'Pasif'}
                </Badge>
                <Switch checked={settings.isEnabled} onCheckedChange={() => toggleSetting('isEnabled')} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Auto Analyze */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${settings.autoAnalyze ? 'bg-blue-500/10' : 'bg-muted'}`}>
                  <Activity className={`h-6 w-6 ${settings.autoAnalyze ? 'text-blue-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Otomatik Analiz</h3>
                  <p className="text-sm text-muted-foreground">Yeni geri bildirimler geldiğinde otomatik AI analizi çalıştır</p>
                </div>
              </div>
              <Switch checked={settings.autoAnalyze} onCheckedChange={() => toggleSetting('autoAnalyze')} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Analysis Features */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              Analiz Özellikleri
            </CardTitle>
            <CardDescription>
              Her geri bildirimde çalışacak AI analiz modüllerini seçin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {analysisFeatures.map((feature, index) => {
                const Icon = feature.icon;
                const isEnabled = settings[feature.key as keyof AISettingsState] as boolean;
                return (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + index * 0.05 }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                      isEnabled ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isEnabled ? 'bg-card' : 'bg-muted'}`}>
                        <Icon className={`h-5 w-5 ${isEnabled ? feature.color : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className={`font-medium ${!isEnabled && 'text-muted-foreground'}`}>{feature.label}</p>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleSetting(feature.key)}
                        disabled={!settings.isEnabled || (sentimentSubLayers.includes(feature.key) && !settings.sentimentEnabled)}
                      />
                      {sentimentSubLayers.includes(feature.key) && !settings.sentimentEnabled && settings.isEnabled && (
                        <span className="text-[10px] text-muted-foreground">Duygu Analizi gerekli</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Alert Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              Uyarı Ayarları
            </CardTitle>
            <CardDescription>
              Hangi durumlarda bildirim almak istediğinizi belirleyin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {alertFeatures.map((feature, index) => {
                const Icon = feature.icon;
                const isEnabled = settings[feature.key as keyof AISettingsState] as boolean;
                return (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45 + index * 0.05 }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                      isEnabled ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isEnabled ? 'bg-card' : 'bg-muted'}`}>
                        <Icon className={`h-5 w-5 ${isEnabled ? feature.color : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className={`font-medium ${!isEnabled && 'text-muted-foreground'}`}>{feature.label}</p>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleSetting(feature.key)}
                      disabled={!settings.isEnabled}
                    />
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Report Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Otomatik Raporlar
            </CardTitle>
            <CardDescription>
              Periyodik AI içgörü raporlarını yapılandırın
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {reportFeatures.map((feature, index) => {
                const Icon = feature.icon;
                const isEnabled = settings[feature.key as keyof AISettingsState] as boolean;
                return (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55 + index * 0.05 }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                      isEnabled ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isEnabled ? 'bg-card' : 'bg-muted'}`}>
                        <Icon className={`h-5 w-5 ${isEnabled ? feature.color : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className={`font-medium ${!isEnabled && 'text-muted-foreground'}`}>{feature.label}</p>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleSetting(feature.key)}
                      disabled={!settings.isEnabled}
                    />
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Custom Prompt */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-500" />
              Özel Prompt
            </CardTitle>
            <CardDescription>
              AI analizine eklenecek özel talimatlar. İşletmenize özgü bağlam eklemek için kullanın.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Örnek: Bu bir restoran işletmesidir. Yemek kalitesi, servis hızı ve ambiyans konularına özellikle dikkat et. Vejetaryen menü seçenekleri önemli bir konudur."
              value={settings.customPrompt || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, customPrompt: e.target.value || null }))}
              rows={4}
              className="resize-none"
              disabled={!settings.isEnabled}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Bu metin, AI analiz promptuna eklenir ve sonuçları işletmenize göre özelleştirir.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save Button (Bottom) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="flex justify-end"
      >
        <Button onClick={saveSettings} disabled={saving} size="lg" className="bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700">
          {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
          {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
        </Button>
      </motion.div>
    </div>
  );
}
