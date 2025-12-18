'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [saving, setSaving] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Erkek');
  
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

  const handleSaveNotifications = async () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success('Bildirim ayarları güncellendi');
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

  const currentCategoryAvatars = avatarList.find(c => c.category === selectedCategory)?.items || [];

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Ayarlar"
        description="Hesap ve işletme ayarlarınızı yönetin"
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Bildirimler</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
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
                        
                        {/* Category Tabs */}
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

                        {/* Avatar Grid */}
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
                                <Image
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
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Kişisel Bilgiler
                </CardTitle>
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
                    <Input
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      disabled
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Business Info */}
            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  İşletme Bilgileri
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>İşletme Adı</Label>
                  <Input
                    value={profile.businessName}
                    onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Adres</Label>
                  <Input
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Açıklama</Label>
                  <Textarea
                    value={profile.description}
                    onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
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
            <Card glass>
              <CardHeader>
                <CardTitle>Bildirim Tercihleri</CardTitle>
                <CardDescription>Hangi bildirimleri almak istediğinizi seçin</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Bildirimleri
                  </h4>
                  <div className="space-y-4 pl-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Yeni Geri Bildirim</p>
                        <p className="text-sm text-muted-foreground">Her yeni geri bildirimde email al</p>
                      </div>
                      <Switch
                        checked={notifications.emailFeedback}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, emailFeedback: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Haftalık Rapor</p>
                        <p className="text-sm text-muted-foreground">Her hafta özet rapor al</p>
                      </div>
                      <Switch
                        checked={notifications.emailWeekly}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, emailWeekly: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Uyarılar</p>
                        <p className="text-sm text-muted-foreground">Olumsuz geri bildirimlerde uyarı al</p>
                      </div>
                      <Switch
                        checked={notifications.emailAlerts}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, emailAlerts: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Push Bildirimleri
                  </h4>
                  <div className="space-y-4 pl-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Anlık Bildirimler</p>
                        <p className="text-sm text-muted-foreground">Yeni geri bildirimlerde anlık bildirim</p>
                      </div>
                      <Switch
                        checked={notifications.pushFeedback}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, pushFeedback: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Önemli Uyarılar</p>
                        <p className="text-sm text-muted-foreground">Kritik durumlarda bildirim</p>
                      </div>
                      <Switch
                        checked={notifications.pushAlerts}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, pushAlerts: checked })}
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveNotifications} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
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
            <Card glass>
              <CardHeader>
                <CardTitle>Şifre Değiştir</CardTitle>
                <CardDescription>Hesabınızın güvenliği için güçlü bir şifre kullanın</CardDescription>
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
                <Button onClick={handleChangePassword} disabled={saving} className="gap-2">
                  <Shield className="h-4 w-4" />
                  {saving ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
