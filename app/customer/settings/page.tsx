'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Settings,
  Save,
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  Check,
  Camera,
  Eye,
  ZapOff,
  Database,
  FileDown,
  Trash2,
  Cake,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import { getInitials } from '@/lib/utils';
import { avatarList } from '@/lib/avatar-options';
import { t, type Locale } from '@/i18n/request';
import { useAppLocale } from '@/lib/app-locale';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function CustomerSettingsPage() {
  const queryClient = useQueryClient();
  const { data: session, update } = useSession();
  const { setLocale } = useAppLocale();
  const [saving, setSaving] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Erkek');

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    avatar: '',
    hasPassword: true,
  });

  useEffect(() => {
    if (!session?.user) return;
    setProfile((prev) => ({
      ...prev,
      name: session.user.name || '',
      email: session.user.email || '',
      avatar: session.user.image || '/images/avatar/AVATAR ERKEK 1.svg',
    }));
    void (async () => {
      try {
        const res = await fetch('/api/user/profile', { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && data?.success && data.user) {
          setProfile((p) => ({
            ...p,
            hasPassword: typeof data.user.hasPassword === 'boolean' ? data.user.hasPassword : true,
          }));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [session]);

  const [notifications, setNotifications] = useState({
    emailBadge: true,
    emailQuest: true,
    emailReward: true,
    pushBadge: true,
    pushQuest: true,
    pushReward: true,
  });

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [preferences, setPreferences] = useState({
    language: 'tr',
    theme: 'dark',
    showProfile: true,
    showLeaderboard: true,
    highContrast: false,
    reduceAnimations: false,
  });

  const [exportingData, setExportingData] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [birthdayDate, setBirthdayDate] = useState('');
  const [birthdayBonusHint, setBirthdayBonusHint] = useState<number | null>(null);
  const [birthdayLoading, setBirthdayLoading] = useState(true);
  const [birthdaySaving, setBirthdaySaving] = useState(false);
  const [birthdayIsToday, setBirthdayIsToday] = useState(false);
  const [birthdayCanClaim, setBirthdayCanClaim] = useState(false);
  const [birthdayClaiming, setBirthdayClaiming] = useState(false);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/customer/settings');
        const data = await res.json();
        if (data.success) {
          if (data.data.notifications) {
            setNotifications(data.data.notifications);
          }
          if (data.data.preferences) {
            setPreferences(data.data.preferences);
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/birthday');
        const data = await res.json();
        if (!cancelled && data.success) {
          setBirthdayBonusHint(typeof data.bonusAmount === 'number' ? data.bonusAmount : null);
          setBirthdayIsToday(!!data.isBirthdayToday);
          setBirthdayCanClaim(!!data.canClaimBonus);
          const iso = data.birthday?.birthDate;
          if (iso) {
            const d = new Date(iso);
            if (!Number.isNaN(d.getTime())) {
              setBirthdayDate(d.toISOString().slice(0, 10));
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setBirthdayLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleSaveBirthday = async () => {
    if (!birthdayDate) {
      toast.error(tp('settingsBirthday.errorSelectDate'));
      return;
    }
    setBirthdaySaving(true);
    try {
      const res = await fetch('/api/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', birthDate: birthdayDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tp('settingsBirthday.errorSave'));
      toast.success(data.message || 'Doğum tarihi kaydedildi');
      const r2 = await fetch('/api/birthday');
      const d2 = await r2.json();
      if (r2.ok && d2.success) {
        setBirthdayIsToday(!!d2.isBirthdayToday);
        setBirthdayCanClaim(!!d2.canClaimBonus);
        setBirthdayBonusHint(typeof d2.bonusAmount === 'number' ? d2.bonusAmount : null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBirthdaySaving(false);
    }
  };

  const handleClaimBirthdayBonus = async () => {
    setBirthdayClaiming(true);
    try {
      const res = await fetch('/api/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tp('settingsBirthday.errorClaim'));
      toast.success(data.message || 'Bonus hesabınıza eklendi!');
      setBirthdayCanClaim(false);
      setBirthdayIsToday(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBirthdayClaiming(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/customer/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Bildirim ayarları güncellendi');
      } else {
        toast.error(data.error || 'Bir hata oluştu');
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
        setProfile((p) => ({ ...p, hasPassword: true }));
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

  const handleSetInitialPassword = async () => {
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
      const res = await fetch('/api/user/initial-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: security.newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setProfile((p) => ({ ...p, hasPassword: true }));
        toast.success('Şifre oluşturuldu. Artık e-posta ile de giriş yapabilirsiniz.');
      } else {
        toast.error(data.error || 'İşlem başarısız');
      }
    } catch {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/customer/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Tercihler güncellendi');
        if (preferences.language === 'tr' || preferences.language === 'en') {
          setLocale(preferences.language);
        }
        await update({ preferredLanguage: preferences.language });
        await queryClient.invalidateQueries({ queryKey: ['customer', 'settings-preferences', 'language'] });
      } else {
        toast.error(data.error || 'Bir hata oluştu');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const customerAvatarList = avatarList.filter((c) => c.category !== 'Bayi');
  const effectiveCategory = customerAvatarList.some((c) => c.category === selectedCategory) ? selectedCategory : (customerAvatarList[0]?.category ?? 'Erkek');
  const displayCategoryAvatars = customerAvatarList.find((c) => c.category === effectiveCategory)?.items || [];

  const uiLocale: Locale = preferences.language === 'en' ? 'en' : 'tr';
  const tp = (key: string) => t(uiLocale, key);

  const handleExportPersonalData = async () => {
    setExportingData(true);
    try {
      const res = await fetch('/api/user/data-export', { credentials: 'same-origin' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === 'string' ? err.error : tp('common.error'));
        return;
      }
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition');
      let filename = 'qratex-data-export.json';
      const match = dispo?.match(/filename="([^"]+)"/);
      if (match?.[1]) filename = match[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(uiLocale === 'en' ? 'Download started' : 'İndirme başladı');
    } catch {
      toast.error(tp('common.error'));
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: deleteConfirmEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(typeof data.message === 'string' ? data.message : tp('customerPrivacy.confirmDelete'));
        await signOut({ callbackUrl: '/' });
        return;
      }
      toast.error(typeof data.error === 'string' ? data.error : tp('common.error'));
    } catch {
      toast.error(tp('common.error'));
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        title="Ayarlar"
        description="Hesap ayarlarınızı yönetin"
      />

      {/* Üst çubukta başlık gizli (<sm); mobilde sayfa bağlamı */}
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">Ayarlar</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">Hesap ayarlarınızı yönetin</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="flex flex-wrap gap-1 w-full lg:w-auto">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Bildirimler</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Güvenlik</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Palette className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Tercihler</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2">
            <Database className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{tp('customerPrivacy.tab')}</span>
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
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
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
                          {customerAvatarList.map((category) => (
                            <Button
                              key={category.category}
                              variant={effectiveCategory === category.category ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSelectedCategory(category.category)}
                              className="touch-manipulation min-h-10"
                            >
                              {category.category}
                            </Button>
                          ))}
                        </div>

                        {/* Avatar Grid */}
                        <div className="flex-1 overflow-y-auto py-4">
                          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2 sm:gap-3">
                            {displayCategoryAvatars.map((avatar) => (
                              <button
                                key={avatar}
                                onClick={() => handleSelectAvatar(avatar)}
                                className={`relative p-2 rounded-xl border-2 transition-all hover:scale-105 ${profile.avatar === avatar
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
                      className="mt-3 gap-2 w-full touch-manipulation sm:w-auto min-h-10 justify-center"
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
                  <p className="text-xs text-muted-foreground">Email değiştirmek için destek ile iletişime geçin</p>
                </div>
                <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 w-full touch-manipulation sm:w-auto min-h-10">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cake className="h-5 w-5 text-primary shrink-0" />
                  {tp('settingsBirthday.cardTitle')}
                </CardTitle>
                <CardDescription>{tp('settingsBirthday.cardDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {birthdayLoading ? (
                  <p className="text-sm text-muted-foreground">{tp('settingsBirthday.loading')}</p>
                ) : (
                  <>
                    {birthdayIsToday && birthdayCanClaim && birthdayBonusHint != null && (
                      <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 space-y-3">
                        <p className="text-sm font-medium text-foreground">{tp('settingsBirthday.todayBonusReady')}</p>
                        <p className="text-xs text-muted-foreground">
                          {tp('settingsBirthday.todayBonusBody').replace('{n}', String(birthdayBonusHint))}
                        </p>
                        <Button
                          type="button"
                          className="w-full touch-manipulation gap-2 min-h-10 justify-center"
                          disabled={birthdayClaiming}
                          onClick={() => void handleClaimBirthdayBonus()}
                        >
                          {birthdayClaiming ? tp('settingsBirthday.claiming') : tp('settingsBirthday.claimCta')}
                        </Button>
                      </div>
                    )}
                    {birthdayIsToday && !birthdayCanClaim && (
                      <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                        {tp('settingsBirthday.alreadyClaimed')}
                      </p>
                    )}
                    {birthdayBonusHint != null && (
                      <p className="text-xs text-muted-foreground">
                        {tp('settingsBirthday.annualHint').replace('{n}', String(birthdayBonusHint))}
                      </p>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="birthday-date">{tp('settingsBirthday.labelBirthDate')}</Label>
                      <Input
                        id="birthday-date"
                        type="date"
                        className="max-w-xs touch-manipulation"
                        value={birthdayDate}
                        onChange={(e) => setBirthdayDate(e.target.value)}
                      />
                    </div>
                    <Button type="button" onClick={() => void handleSaveBirthday()} disabled={birthdaySaving} className="gap-2 touch-manipulation w-full sm:w-auto min-h-10">
                      <Save className="h-4 w-4" />
                      {birthdaySaving ? tp('settingsBirthday.saving') : tp('settingsBirthday.saveCta')}
                    </Button>
                  </>
                )}
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
                  <h4 className="font-medium">Email Bildirimleri</h4>
                  <div className="space-y-4 pl-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Rozet Kazandığımda</p>
                        <p className="text-sm text-muted-foreground">Yeni rozet kazandığınızda email al</p>
                      </div>
                      <Switch
                        checked={notifications.emailBadge}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, emailBadge: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Görev Tamamladığımda</p>
                        <p className="text-sm text-muted-foreground">Görev tamamladığınızda email al</p>
                      </div>
                      <Switch
                        checked={notifications.emailQuest}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, emailQuest: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Yeni Ödüller</p>
                        <p className="text-sm text-muted-foreground">Yeni ödüller eklendiğinde email al</p>
                      </div>
                      <Switch
                        checked={notifications.emailReward}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, emailReward: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Push Bildirimleri</h4>
                  <div className="space-y-4 pl-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Rozet Bildirimleri</p>
                        <p className="text-sm text-muted-foreground">Anlık rozet bildirimleri</p>
                      </div>
                      <Switch
                        checked={notifications.pushBadge}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, pushBadge: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Görev Bildirimleri</p>
                        <p className="text-sm text-muted-foreground">Görev hatırlatmaları</p>
                      </div>
                      <Switch
                        checked={notifications.pushQuest}
                        onCheckedChange={(checked) => setNotifications({ ...notifications, pushQuest: checked })}
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveNotifications} disabled={saving} className="gap-2 w-full touch-manipulation sm:w-auto min-h-10">
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
                <CardTitle>Şifre {profile.hasPassword ? 'Değiştir' : 'Oluştur'}</CardTitle>
                <CardDescription>
                  {profile.hasPassword
                    ? 'Güvenliğiniz için güçlü bir şifre kullanın'
                    : 'Google ile giriş yaptıysanız buradan hesaba şifre ekleyebilirsiniz; böylece e-posta + şifre ile de giriş yapabilirsiniz.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile.hasPassword ? (
                <div className="space-y-2">
                  <Label>Mevcut Şifre</Label>
                  <Input
                    type="password"
                    value={security.currentPassword}
                    onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                  />
                </div>
                ) : null}
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
                <Button
                  onClick={profile.hasPassword ? handleChangePassword : handleSetInitialPassword}
                  disabled={
                    saving ||
                    !security.newPassword ||
                    security.newPassword !== security.confirmPassword ||
                    (profile.hasPassword && !security.currentPassword)
                  }
                  className="gap-2 w-full touch-manipulation sm:w-auto min-h-10"
                >
                  <Shield className="h-4 w-4" />
                  {saving ? 'Güncelleniyor...' : profile.hasPassword ? 'Şifreyi Güncelle' : 'Şifre oluştur'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card glass>
              <CardHeader>
                <CardTitle>Tercihler</CardTitle>
                <CardDescription>Uygulama tercihlerinizi özelleştirin</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Dil</Label>
                    <Select
                      value={preferences.language}
                      onValueChange={(value) => setPreferences({ ...preferences, language: value })}
                    >
                      <SelectTrigger>
                        <Globe className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tr">Türkçe</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tema</Label>
                    <Select
                      value={preferences.theme}
                      onValueChange={(value) => setPreferences({ ...preferences, theme: value })}
                    >
                      <SelectTrigger>
                        <Palette className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Koyu</SelectItem>
                        <SelectItem value="light">Açık</SelectItem>
                        <SelectItem value="system">Sistem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Gizlilik</h4>
                  <div className="space-y-4 pl-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Profili Göster</p>
                        <p className="text-sm text-muted-foreground">Profiliniz diğer kullanıcılara görünsün</p>
                      </div>
                      <Switch
                        checked={preferences.showProfile}
                        onCheckedChange={(checked) => setPreferences({ ...preferences, showProfile: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Liderlik Tablosunda Göster</p>
                        <p className="text-sm text-muted-foreground">Liderlik tablosunda görünün</p>
                      </div>
                      <Switch
                        checked={preferences.showLeaderboard}
                        onCheckedChange={(checked) => setPreferences({ ...preferences, showLeaderboard: checked })}
                      />
                    </div>
                  </div>
                </div>

                {/* Accessibility Settings (S6-T8) */}
                <div className="space-y-4">
                  <h4 className="font-medium text-primary">Erişilebilirlik</h4>
                  <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3">
                        <div className="mt-1"><Eye className="h-5 w-5 text-muted-foreground" /></div>
                        <div>
                          <p className="font-medium">Yüksek Kontrast Modu</p>
                          <p className="text-sm text-muted-foreground">Metinler ve arka planlar arasındaki zıtlığı artırır</p>
                        </div>
                      </div>
                      <Switch
                        checked={preferences.highContrast}
                        onCheckedChange={(checked) => setPreferences({ ...preferences, highContrast: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3">
                        <div className="mt-1"><ZapOff className="h-5 w-5 text-muted-foreground" /></div>
                        <div>
                          <p className="font-medium">Animasyonları Azalt</p>
                          <p className="text-sm text-muted-foreground">Görsel geçişleri ve hareket efektlerini en aza indirir</p>
                        </div>
                      </div>
                      <Switch
                        checked={preferences.reduceAnimations}
                        onCheckedChange={(checked) => setPreferences({ ...preferences, reduceAnimations: checked })}
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSavePreferences} disabled={saving} className="gap-2 w-full touch-manipulation sm:w-auto mt-4 min-h-10">
                  <Save className="h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : 'Tercihleri Kaydet'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="privacy">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <Card glass>
              <CardHeader>
                <CardTitle>{tp('customerPrivacy.title')}</CardTitle>
                <CardDescription>{tp('customerPrivacy.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <FileDown className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{tp('customerPrivacy.exportTitle')}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{tp('customerPrivacy.exportDesc')}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-2 w-full touch-manipulation sm:w-auto min-h-10"
                    disabled={exportingData}
                    onClick={handleExportPersonalData}
                  >
                    <FileDown className="h-4 w-4" />
                    {exportingData ? tp('customerPrivacy.exporting') : tp('customerPrivacy.exportBtn')}
                  </Button>
                </div>

                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Trash2 className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-destructive">{tp('customerPrivacy.deleteTitle')}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{tp('customerPrivacy.deleteDesc')}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="gap-2 w-full touch-manipulation sm:w-auto min-h-10"
                    onClick={() => {
                      setDeleteConfirmEmail('');
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {tp('customerPrivacy.deleteOpen')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp('customerPrivacy.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">{tp('customerPrivacy.deleteDesc')}</span>
              <Label className="text-foreground">{tp('customerPrivacy.confirmEmail')}</Label>
              <Input
                type="email"
                autoComplete="email"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder={profile.email || 'email@ornek.com'}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAccount} className="w-full touch-manipulation min-h-10 sm:w-auto mt-0">
              {tp('customerPrivacy.cancel')}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingAccount || !deleteConfirmEmail.trim()}
              onClick={() => void handleDeleteAccount()}
              className="w-full touch-manipulation min-h-10 sm:w-auto"
            >
              {deletingAccount ? '…' : tp('customerPrivacy.confirmDelete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
