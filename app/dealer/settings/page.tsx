'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Save,
  User,
  Building,
  Bell,
  Shield,
  Mail,
  Camera,
  Check,
  Phone,
  MapPin,
  FileText,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getInitials } from '@/lib/utils';

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

export default function DealerSettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Erkek');
  const [activeTab, setActiveTab] = useState('profile');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    avatar: '',
    businessName: 'Cafe Merkez',
    phone: '+90 555 123 4567',
    address: 'İstanbul, Kadıköy',
    description: 'Kaliteli kahve ve taze yiyecekler sunan samimi bir cafe.',
  });

  useEffect(() => {
    if (session?.user) {
      setProfile(prev => ({
        ...prev,
        name: session.user.name || '',
        email: session.user.email || '',
        avatar: session.user.image || '/images/avatar/AVATAR ERKEK 1.svg',
      }));
    }
  }, [session]);

  const [notifications, setNotifications] = useState({
    emailFeedback: true,
    emailWeekly: true,
    emailAlerts: true,
    pushFeedback: true,
    pushAlerts: true,
  });

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

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
        toast.success('Profil başarıyla güncellendi!');
        router.refresh();
      } else {
        toast.error('Profil güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success('Bildirim ayarları güncellendi!');
    }, 1000);
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
        toast.success('Şifre başarıyla güncellendi!');
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

  const currentCategoryAvatars = avatarList.find(c => c.category === selectedCategory)?.items || [];

  const passwordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const getStrengthLabel = (strength: number) => {
    if (strength <= 1) return { label: 'Zayıf', color: 'bg-red-500' };
    if (strength <= 2) return { label: 'Orta', color: 'bg-yellow-500' };
    if (strength <= 3) return { label: 'İyi', color: 'bg-blue-500' };
    return { label: 'Güçlü', color: 'bg-emerald-500' };
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-violet-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-blue-500/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Settings className="w-8 h-8" />
            Ayarlar
          </h1>
          <p className="text-white/70 mt-1">Hesap ve işletme ayarlarınızı yönetin</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid bg-muted/50 p-1">
          <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-background">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-background">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Bildirimler</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-background">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Güvenlik</span>
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
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
              <CardContent className="relative pt-0 pb-6 px-6">
                <div className="flex flex-col sm:flex-row items-center gap-6 -mt-12">
                  <div className="relative group">
                    <Avatar className="h-28 w-28 border-4 border-background shadow-xl">
                      <AvatarImage src={profile.avatar} />
                      <AvatarFallback className="text-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
                        {getInitials(profile.name)}
                      </AvatarFallback>
                    </Avatar>
                    <button 
                      onClick={() => setAvatarDialogOpen(true)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Camera className="h-8 w-8 text-white" />
                    </button>
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="font-bold text-xl">{profile.name}</h3>
                    <p className="text-muted-foreground">{profile.email}</p>
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
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <User className="h-5 w-5 text-blue-500" />
                  </div>
                  Kişisel Bilgiler
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Ad Soyad
                    </Label>
                    <Input
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email
                    </Label>
                    <Input
                      value={profile.email}
                      disabled
                      className="bg-muted/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Telefon
                  </Label>
                  <Input
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Business Info */}
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-violet-500/10">
                    <Building className="h-5 w-5 text-violet-500" />
                  </div>
                  İşletme Bilgileri
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    İşletme Adı
                  </Label>
                  <Input
                    value={profile.businessName}
                    onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Adres
                  </Label>
                  <Input
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Açıklama
                  </Label>
                  <Textarea
                    value={profile.description}
                    onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                    rows={3}
                    className="bg-background/50"
                  />
                </div>
                <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Bell className="h-5 w-5 text-amber-500" />
                  </div>
                  Bildirim Tercihleri
                </CardTitle>
                <CardDescription>Hangi bildirimleri almak istediğinizi seçin</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Email Notifications */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2 text-lg">
                    <Mail className="h-5 w-5 text-blue-500" />
                    Email Bildirimleri
                  </h4>
                  <div className="space-y-4 pl-7">
                    {[
                      { key: 'emailFeedback', title: 'Yeni Geri Bildirim', desc: 'Her yeni geri bildirimde email al' },
                      { key: 'emailWeekly', title: 'Haftalık Rapor', desc: 'Her hafta özet rapor al' },
                      { key: 'emailAlerts', title: 'Uyarılar', desc: 'Olumsuz geri bildirimlerde uyarı al' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                        <Switch
                          checked={notifications[item.key as keyof typeof notifications]}
                          onCheckedChange={(checked) => setNotifications({ ...notifications, [item.key]: checked })}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Push Notifications */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5 text-violet-500" />
                    Push Bildirimleri
                  </h4>
                  <div className="space-y-4 pl-7">
                    {[
                      { key: 'pushFeedback', title: 'Anlık Bildirimler', desc: 'Yeni geri bildirimlerde anlık bildirim' },
                      { key: 'pushAlerts', title: 'Önemli Uyarılar', desc: 'Kritik durumlarda bildirim' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                        <Switch
                          checked={notifications[item.key as keyof typeof notifications]}
                          onCheckedChange={(checked) => setNotifications({ ...notifications, [item.key]: checked })}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button onClick={handleSaveNotifications} disabled={saving} className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <Lock className="h-5 w-5 text-red-500" />
                  </div>
                  Şifre Değiştir
                </CardTitle>
                <CardDescription>Hesabınızın güvenliği için güçlü bir şifre kullanın</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mevcut Şifre</Label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={security.currentPassword}
                      onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                      className="bg-background/50 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Yeni Şifre</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? 'text' : 'password'}
                      value={security.newPassword}
                      onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                      className="bg-background/50 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {security.newPassword && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 flex-1 rounded-full ${
                              level <= passwordStrength(security.newPassword)
                                ? getStrengthLabel(passwordStrength(security.newPassword)).color
                                : 'bg-muted'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Şifre gücü: {getStrengthLabel(passwordStrength(security.newPassword)).label}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Yeni Şifre (Tekrar)</Label>
                  <Input
                    type="password"
                    value={security.confirmPassword}
                    onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                    className="bg-background/50"
                  />
                  {security.confirmPassword && security.newPassword !== security.confirmPassword && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Şifreler eşleşmiyor
                    </p>
                  )}
                  {security.confirmPassword && security.newPassword === security.confirmPassword && (
                    <p className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Şifreler eşleşiyor
                    </p>
                  )}
                </div>
                <Button 
                  onClick={handleChangePassword} 
                  disabled={saving || !security.currentPassword || !security.newPassword || security.newPassword !== security.confirmPassword} 
                  className="gap-2 bg-gradient-to-r from-red-500 to-rose-500"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  {saving ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Avatar Selection Modal */}
      <AnimatePresence>
        {avatarDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setAvatarDialogOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-2xl max-h-[85vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="border-0 shadow-2xl">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-violet-500" />
                        Avatar Seç
                      </CardTitle>
                      <CardDescription>Profiliniz için bir avatar seçin</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setAvatarDialogOpen(false)}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="p-0">
                  {/* Category Tabs */}
                  <div className="flex flex-wrap gap-2 p-4 border-b bg-muted/30">
                    {avatarList.map((category) => (
                      <Button
                        key={category.category}
                        variant={selectedCategory === category.category ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory(category.category)}
                        className={selectedCategory === category.category ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600' : ''}
                      >
                        {category.category}
                      </Button>
                    ))}
                  </div>

                  {/* Avatar Grid */}
                  <div className="p-4 max-h-[50vh] overflow-y-auto">
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                      {currentCategoryAvatars.map((avatar) => (
                        <motion.button
                          key={avatar}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSelectAvatar(avatar)}
                          className={`relative p-2 rounded-xl border-2 transition-all ${
                            profile.avatar === avatar
                              ? 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/50'
                              : 'border-border hover:border-violet-500/50 hover:bg-muted/50'
                          }`}
                        >
                          <Image
                            src={avatar}
                            alt="Avatar"
                            width={64}
                            height={64}
                            className="w-full h-auto"
                          />
                          {profile.avatar === avatar && (
                            <div className="absolute top-1 right-1 bg-violet-500 rounded-full p-0.5">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
