'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import NextImage from 'next/image';
import { motion } from 'framer-motion';
import {
  Settings,
  Save,
  Globe,
  Palette,
  Bell,
  Shield,
  Database,
  Mail,
  Sparkles,
  User,
  Camera,
  Check,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getInitials } from '@/lib/utils';
import { type BackgroundVariant } from '@/components/ui/backgrounds';

// Avatar listesi
const avatarList = [
  { category: 'Erkek', items: [
    '/images/avatar/AVATAR ERKEK 1.svg',
    '/images/avatar/AVATAR ERKEK 2.svg',
    '/images/avatar/AVATAR ERKEK 3.svg',
    '/images/avatar/AVATAR ERKEK 4.svg',
    '/images/avatar/AVATAR ERKEK 5.svg',
    '/images/avatar/AVATAR ERKEK 6.svg',
    '/images/avatar/AVATAR ERKEK 8.svg',
    '/images/avatar/AVATAR ERKEK 9.svg',
    '/images/avatar/AVATAR ERKEK 10.svg',
    '/images/avatar/AVATAR ERKEK 11.svg',
    '/images/avatar/AVATAR ERKEK 12.svg',
  ]},
  { category: 'Kadın', items: [
    '/images/avatar/AVATAR KADIN 1.svg',
    '/images/avatar/AVATAR KADIN 2.svg',
    '/images/avatar/AVATAR KADIN 3.svg',
    '/images/avatar/AVATAR KADIN 4.svg',
    '/images/avatar/AVATAR KADIN 6.svg',
    '/images/avatar/AVATAR KADIN 7.svg',
    '/images/avatar/AVATAR KADIN 8.svg',
    '/images/avatar/AVATAR KADIN 9.svg',
    '/images/avatar/AVATAR KADIN 10.svg',
    '/images/avatar/KADIN2.svg',
  ]},
  { category: 'Hayvanlar', items: [
    '/images/avatar/CAT.svg',
    '/images/avatar/DOG.svg',
    '/images/avatar/ELEPHANT.svg',
    '/images/avatar/FROG.svg',
    '/images/avatar/KOALA.svg',
    '/images/avatar/LİON.svg',
    '/images/avatar/MONKEY.svg',
    '/images/avatar/PANDA.svg',
    '/images/avatar/SHEEP.svg',
    '/images/avatar/TİGER.svg',
    '/images/avatar/ZÜRAFA.svg',
  ]},
  { category: 'Meyveler', items: [
    '/images/avatar/APPLE.svg',
    '/images/avatar/AVACADO.svg',
    '/images/avatar/BANANA.svg',
    '/images/avatar/BLUEBERRY.svg',
    '/images/avatar/CHERRRY.svg',
    '/images/avatar/DRAGON FRUİT.svg',
    '/images/avatar/GRAPE.svg',
    '/images/avatar/ORANGE.svg',
    '/images/avatar/STRAWBERRY.svg',
    '/images/avatar/WATERMELON.svg',
  ]},
  { category: 'Yiyecekler', items: [
    '/images/avatar/COFFFE.svg',
    '/images/avatar/DONUT.svg',
    '/images/avatar/DRİNKS.svg',
    '/images/avatar/FRİES.svg',
    '/images/avatar/HAMBURGER.svg',
    '/images/avatar/İCE CREAM.svg',
    '/images/avatar/PİZZ.svg',
  ]},
  { category: 'Emojiler', items: [
    '/images/avatar/EMOJİ1.svg',
    '/images/avatar/EMOJİ2.svg',
    '/images/avatar/EMOJİ3.svg',
    '/images/avatar/EMOJİ4.svg',
    '/images/avatar/EMOJİ5.svg',
    '/images/avatar/EMOJİ6.svg',
    '/images/avatar/EMOJİ7.svg',
    '/images/avatar/EMOJİ8.svg',
  ]},
];

interface SiteSettings {
  siteName: string;
  siteDescription: string;
  siteUrl: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  defaultTheme: 'light' | 'dark' | 'system';
  backgroundEffect: BackgroundVariant;
  enableRegistration: boolean;
  enableGoogleAuth: boolean;
  enableMagicLink: boolean;
  maintenanceMode: boolean;
  emailFrom: string;
  smtpHost: string;
  smtpPort: string;
  openaiApiKey: string;
  openaiModel: string;
  aiEnabled: boolean;
  pointsPerFeedback: number;
  pointsPerReferral: number;
  levelUpThreshold: number;
}

const backgroundOptions: { id: BackgroundVariant; name: string; description: string; elite?: boolean; special?: boolean }[] = [
  { id: 'original', name: 'Orijinal', description: 'Varsayılan kar ve küre animasyonları' },
  { id: 'aurora', name: 'Aurora', description: 'Kuzey ışıkları efekti' },
  { id: 'sparkles', name: 'Parıltı', description: 'Parlayan yıldızlar' },
  { id: 'beams', name: 'Işınlar', description: 'Animasyonlu ışın efekti' },
  { id: 'gradient', name: 'Gradient', description: 'Hareketli renk geçişleri' },
  { id: 'meteors', name: 'Meteorlar', description: 'Meteor yağmuru efekti' },
  { id: 'grid', name: 'Izgara', description: 'Izgara deseni' },
  { id: 'dots', name: 'Noktalar', description: 'Nokta deseni' },
  // Elit Efektler
  { id: 'matrix', name: '🔥 Matrix', description: 'Klasik matrix yağmuru', elite: true },
  { id: 'particles', name: '✨ Parçacıklar', description: 'İnteraktif parçacık ağı', elite: true },
  { id: 'waves', name: '🌊 Dalgalar', description: 'Akıcı dalga animasyonu', elite: true },
  { id: 'starfield', name: '🚀 Uzay Yolculuğu', description: 'Yıldızlar arası seyahat', elite: true },
  { id: 'cyberpunk', name: '💜 Cyberpunk', description: 'Neon ızgara ve çizgiler', elite: true },
  { id: 'geometric', name: '🔷 Geometrik', description: 'Dönen şekiller', elite: true },
  { id: 'fireflies', name: '🌟 Ateş Böcekleri', description: 'Sihirli ateş böcekleri', elite: true },
  // Özel Gün Efektleri
  { id: 'christmas', name: '🎄 Yılbaşı', description: 'Kar, ışıklar ve Noel ruhu', special: true },
  { id: 'valentine', name: '💕 Sevgililer Günü', description: 'Romantik kalpler ve parıltılar', special: true },
  { id: 'birthday', name: '🎂 Doğum Günü', description: 'Balonlar ve konfetiler', special: true },
  { id: 'none', name: 'Yok', description: 'Arka plan efekti yok' },
];

export default function AdminSettingsPage() {
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Erkek');
  
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    avatar: '',
  });

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [settings, setSettings] = useState<SiteSettings>({
    siteName: 'QRATEX',
    siteDescription: 'QR Kod Tabanlı Müşteri Geri Bildirim Platformu',
    siteUrl: 'https://qratex.com',
    logoUrl: '/logo/icon.png',
    faviconUrl: '/favicon.ico',
    primaryColor: '#8B5CF6',
    defaultTheme: 'dark',
    backgroundEffect: 'original',
    enableRegistration: true,
    enableGoogleAuth: true,
    enableMagicLink: false,
    maintenanceMode: false,
    emailFrom: 'noreply@qratex.com',
    smtpHost: '',
    smtpPort: '587',
    openaiApiKey: '',
    openaiModel: 'gpt-4-turbo-preview',
    aiEnabled: true,
    pointsPerFeedback: 10,
    pointsPerReferral: 50,
    levelUpThreshold: 100,
  });

  useEffect(() => {
    if (session?.user) {
      setProfile({
        name: session.user.name || '',
        email: session.user.email || '',
        avatar: session.user.image || '/images/avatar/AVATAR ERKEK 1.svg',
      });
    }
  }, [session]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      
      if (data.raw && Array.isArray(data.raw)) {
        const merged = { ...settings };
        data.raw.forEach((setting: { key: string; value: unknown }) => {
          if (setting.key in merged) {
            (merged as Record<string, unknown>)[setting.key] = setting.value;
          }
        });
        setSettings(merged);
      }
    } catch (error) {
      console.error('Settings fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAvatar = (avatar: string) => {
    setProfile({ ...profile, avatar });
    setAvatarDialogOpen(false);
    toast.success('Avatar seçildi! Kaydetmeyi unutmayın.');
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          image: profile.avatar,
        }),
      });

      if (res.ok) {
        await update({ name: profile.name, image: profile.avatar });
        toast.success('Profil güncellendi');
      } else {
        toast.error('Profil güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (security.newPassword !== security.confirmPassword) {
      toast.error('Şifreler eşleşmiyor');
      return;
    }
    if (security.newPassword.length < 8) {
      toast.error('Şifre en az 8 karakter olmalıdır');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: security.currentPassword,
          newPassword: security.newPassword,
        }),
      });

      if (res.ok) {
        setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });
        toast.success('Şifre güncellendi');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Şifre güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Batch update - tek istekle tüm ayarları kaydet
      const settingsArray = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        category: 'general',
      }));
      
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsArray }),
      });
      
      if (res.ok) {
        toast.success('Ayarlar kaydedildi');
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      toast.error('Ayarlar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Arka plan efektini anında kaydet
  const handleBackgroundChange = async (variant: BackgroundVariant) => {
    setSettings((prev) => ({ ...prev, backgroundEffect: variant }));
    
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          settings: [{ key: 'backgroundEffect', value: variant, category: 'appearance' }] 
        }),
      });
      
      if (res.ok) {
        toast.success('Arka plan efekti güncellendi');
      } else {
        toast.error('Arka plan efekti kaydedilemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const currentCategoryAvatars = avatarList.find(c => c.category === selectedCategory)?.items || [];

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardHeader title="Ayarlar" description="Platform ayarlarını yapılandırın" />
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted rounded w-full max-w-md" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader title="Ayarlar" description="Platform ve profil ayarlarını yapılandırın" />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 lg:w-auto">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Genel</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Görünüm</span>
          </TabsTrigger>
          <TabsTrigger value="auth" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Kimlik</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="gamification" className="gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Oyunlaştırma</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Avatar Section */}
            <Card glass>
              <CardHeader>
                <CardTitle>Profil Fotoğrafı</CardTitle>
                <CardDescription>Avatarınızı seçin veya değiştirin</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative group">
                    <Avatar className="h-28 w-28 border-4 border-primary/20">
                      <AvatarImage src={profile.avatar} />
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                        {getInitials(profile.name)}
                      </AvatarFallback>
                    </Avatar>
                    <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
                      <DialogTrigger asChild>
                        <button className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <Camera className="h-8 w-8 text-white" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                          <DialogTitle>Avatar Seç</DialogTitle>
                          <DialogDescription>
                            Profiliniz için bir avatar seçin
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="flex flex-wrap gap-2 py-2 border-b">
                          {avatarList.map((category) => (
                            <Button
                              key={category.category}
                              variant={selectedCategory === category.category ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSelectedCategory(category.category)}
                            >
                              {category.category}
                            </Button>
                          ))}
                        </div>

                        <div className="flex-1 overflow-y-auto py-4">
                          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                            {currentCategoryAvatars.map((avatar) => (
                              <button
                                key={avatar}
                                onClick={() => handleSelectAvatar(avatar)}
                                className={`relative p-2 rounded-xl border-2 transition-all hover:scale-105 ${
                                  profile.avatar === avatar
                                    ? 'border-primary bg-primary/10 ring-2 ring-primary/50'
                                    : 'border-border hover:border-primary/50'
                                }`}
                              >
                                <NextImage
                                  src={avatar}
                                  alt="Avatar"
                                  width={64}
                                  height={64}
                                  className="w-full h-auto"
                                />
                                {profile.avatar === avatar && (
                                  <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                                    <Check className="h-3 w-3 text-white" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="font-semibold text-lg">{profile.name}</h3>
                    <p className="text-sm text-muted-foreground">{profile.email}</p>
                    <p className="text-xs text-primary mt-1">Admin</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2"
                      onClick={() => setAvatarDialogOpen(true)}
                    >
                      <Camera className="h-4 w-4" />
                      Avatar Değiştir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Personal Info */}
            <Card glass>
              <CardHeader>
                <CardTitle>Kişisel Bilgiler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ad Soyad</Label>
                    <Input
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={profile.email} disabled />
                  </div>
                </div>
                <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Profili Kaydet'}
                </Button>
              </CardContent>
            </Card>

            {/* Password Change */}
            <Card glass>
              <CardHeader>
                <CardTitle>Şifre Değiştir</CardTitle>
                <CardDescription>Güvenliğiniz için güçlü bir şifre kullanın</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mevcut Şifre</Label>
                  <Input
                    type="password"
                    value={security.currentPassword}
                    onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Yeni Şifre</Label>
                    <Input
                      type="password"
                      value={security.newPassword}
                      onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Yeni Şifre (Tekrar)</Label>
                    <Input
                      type="password"
                      value={security.confirmPassword}
                      onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                    />
                  </div>
                </div>
                <Button onClick={handleChangePassword} disabled={saving} variant="outline" className="gap-2">
                  <Shield className="h-4 w-4" />
                  {saving ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* General Settings */}
        <TabsContent value="general">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card glass>
              <CardHeader>
                <CardTitle>Genel Ayarlar</CardTitle>
                <CardDescription>Site adı, açıklaması ve temel bilgiler</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Site Adı</Label>
                    <Input
                      value={settings.siteName}
                      onChange={(e) => updateSetting('siteName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Site URL</Label>
                    <Input
                      value={settings.siteUrl}
                      onChange={(e) => updateSetting('siteUrl', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Site Açıklaması</Label>
                  <Textarea
                    value={settings.siteDescription}
                    onChange={(e) => updateSetting('siteDescription', e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div>
                    <p className="font-medium text-yellow-500">Bakım Modu</p>
                    <p className="text-sm text-muted-foreground">Siteyi geçici olarak kapatın</p>
                  </div>
                  <Switch
                    checked={settings.maintenanceMode}
                    onCheckedChange={(checked) => updateSetting('maintenanceMode', checked)}
                  />
                </div>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <Card glass>
              <CardHeader>
                <CardTitle>Görünüm Ayarları</CardTitle>
                <CardDescription>Logo, renkler ve tema ayarları</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Logo URL</Label>
                    <Input
                      value={settings.logoUrl}
                      onChange={(e) => updateSetting('logoUrl', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Favicon URL</Label>
                    <Input
                      value={settings.faviconUrl}
                      onChange={(e) => updateSetting('faviconUrl', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ana Renk</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={settings.primaryColor}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="w-16 h-10 p-1"
                      />
                      <Input
                        value={settings.primaryColor}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Varsayılan Tema</Label>
                    <Select
                      value={settings.defaultTheme}
                      onValueChange={(value: 'light' | 'dark' | 'system') => updateSetting('defaultTheme', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Açık</SelectItem>
                        <SelectItem value="dark">Koyu</SelectItem>
                        <SelectItem value="system">Sistem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </CardContent>
            </Card>

            {/* Background Effect Selection */}
            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Arka Plan Efekti
                </CardTitle>
                <CardDescription>Landing page için animasyonlu arka plan seçin</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Standart Efektler */}
                <div>
                  <h4 className="text-sm font-medium mb-3 text-muted-foreground">Standart Efektler</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {backgroundOptions.filter(o => !o.elite).map((option) => (
                      <motion.button
                        key={option.id}
                        type="button"
                        onClick={() => handleBackgroundChange(option.id)}
                        className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                          settings.backgroundEffect === option.id
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/50 hover:bg-accent/50'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {settings.backgroundEffect === option.id && (
                          <div className="absolute top-2 right-2 bg-primary rounded-full p-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{option.name}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Elit Efektler */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-medium bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 bg-clip-text text-transparent">
                      ⭐ Elit Efektler
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 font-medium">
                      PREMIUM
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {backgroundOptions.filter(o => o.elite).map((option) => (
                      <motion.button
                        key={option.id}
                        type="button"
                        onClick={() => handleBackgroundChange(option.id)}
                        className={`relative p-4 rounded-xl border-2 transition-all text-left overflow-hidden ${
                          settings.backgroundEffect === option.id
                            ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 ring-2 ring-purple-500/30'
                            : 'border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/10 bg-gradient-to-br from-purple-500/5 to-pink-500/5'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {settings.backgroundEffect === option.id && (
                          <div className="absolute top-2 right-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full p-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{option.name}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Özel Gün Efektleri */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-medium bg-gradient-to-r from-red-500 via-pink-500 to-amber-500 bg-clip-text text-transparent">
                      🎉 Özel Gün Efektleri
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-red-500/20 to-amber-500/20 text-red-400 font-medium">
                      ÖZEL
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {backgroundOptions.filter(o => o.special).map((option) => (
                      <motion.button
                        key={option.id}
                        type="button"
                        onClick={() => handleBackgroundChange(option.id)}
                        className={`relative p-4 rounded-xl border-2 transition-all text-left overflow-hidden ${
                          settings.backgroundEffect === option.id
                            ? 'border-red-500 bg-gradient-to-br from-red-500/20 via-pink-500/20 to-amber-500/20 ring-2 ring-red-500/30'
                            : 'border-red-500/30 hover:border-red-500/60 hover:bg-red-500/10 bg-gradient-to-br from-red-500/5 via-pink-500/5 to-amber-500/5'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {settings.backgroundEffect === option.id && (
                          <div className="absolute top-2 right-2 bg-gradient-to-r from-red-500 to-amber-500 rounded-full p-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{option.name}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    <strong>✓ Seçili:</strong> {backgroundOptions.find(o => o.id === settings.backgroundEffect)?.name} - {backgroundOptions.find(o => o.id === settings.backgroundEffect)?.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Seçiminiz anında kaydedilir</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Auth Settings */}
        <TabsContent value="auth">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card glass>
              <CardHeader>
                <CardTitle>Kimlik Doğrulama</CardTitle>
                <CardDescription>Kayıt ve giriş ayarları</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">Yeni Kayıtlar</p>
                      <p className="text-sm text-muted-foreground">Kullanıcıların kayıt olmasına izin ver</p>
                    </div>
                    <Switch
                      checked={settings.enableRegistration}
                      onCheckedChange={(checked) => updateSetting('enableRegistration', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">Google ile Giriş</p>
                      <p className="text-sm text-muted-foreground">OAuth 2.0 ile Google girişi</p>
                    </div>
                    <Switch
                      checked={settings.enableGoogleAuth}
                      onCheckedChange={(checked) => updateSetting('enableGoogleAuth', checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">Magic Link</p>
                      <p className="text-sm text-muted-foreground">Email ile şifresiz giriş</p>
                    </div>
                    <Switch
                      checked={settings.enableMagicLink}
                      onCheckedChange={(checked) => updateSetting('enableMagicLink', checked)}
                    />
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* AI Settings */}
        <TabsContent value="ai">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card glass>
              <CardHeader>
                <CardTitle>AI Ayarları</CardTitle>
                <CardDescription>OpenAI entegrasyonu ve AI özellikleri</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">AI Özellikleri</p>
                    <p className="text-sm text-muted-foreground">Duygu analizi ve AI asistan</p>
                  </div>
                  <Switch
                    checked={settings.aiEnabled}
                    onCheckedChange={(checked) => updateSetting('aiEnabled', checked)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>OpenAI API Anahtarı</Label>
                    <Input
                      type="password"
                      value={settings.openaiApiKey}
                      onChange={(e) => updateSetting('openaiApiKey', e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={settings.openaiModel}
                      onValueChange={(value) => updateSetting('openaiModel', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4-turbo-preview">GPT-4 Turbo</SelectItem>
                        <SelectItem value="gpt-4">GPT-4</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Gamification Settings */}
        <TabsContent value="gamification">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card glass>
              <CardHeader>
                <CardTitle>Oyunlaştırma Ayarları</CardTitle>
                <CardDescription>Puan, seviye ve ödül sistemleri</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Geri Bildirim Puanı</Label>
                    <Input
                      type="number"
                      value={settings.pointsPerFeedback}
                      onChange={(e) => updateSetting('pointsPerFeedback', parseInt(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">Her geri bildirim için kazanılan puan</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Referans Puanı</Label>
                    <Input
                      type="number"
                      value={settings.pointsPerReferral}
                      onChange={(e) => updateSetting('pointsPerReferral', parseInt(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">Her referans için kazanılan puan</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Seviye Atlama Eşiği</Label>
                    <Input
                      type="number"
                      value={settings.levelUpThreshold}
                      onChange={(e) => updateSetting('levelUpThreshold', parseInt(e.target.value) || 100)}
                    />
                    <p className="text-xs text-muted-foreground">Seviye başına gereken puan</p>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
