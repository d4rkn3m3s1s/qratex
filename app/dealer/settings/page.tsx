'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
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
  Navigation,
  LocateFixed,
  LayoutDashboard,
  ArrowUp,
  ArrowDown,
  Zap,
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
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { toast } from '@/lib/admin-toast';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { getInitials } from '@/lib/utils';
import { avatarList } from '@/lib/avatar-options';
import { useAppT } from '@/lib/app-locale';

export default function DealerSettingsPage() {
  const t = useAppT();
  const { data: session, update } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Bayi');
  const [activeTab, setActiveTab] = useState('profile');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);

  const [dashboardWidgets, setDashboardWidgets] = useState<any[]>([]);
  const [loadingWidgets, setLoadingWidgets] = useState(false);

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    avatar: '',
    businessName: '',
    phone: '+90 555 123 4567',
    address: '',
    latitude: '',
    longitude: '',
    description: '',
    businessHours: '',
    defaultReplyTemplate: '',
    preferredLanguage: 'tr',
    holidayMode: false,
  });

  useEffect(() => {
    if (!session?.user) return;
    setProfile(prev => ({
      ...prev,
      name: session.user.name || '',
      email: session.user.email || '',
      avatar: session.user.image || '/images/avatar/BAYİ AVATAR ERKEK 1.svg',
    }));

    const loadProfile = async () => {
      try {
        const res = await fetch('/api/user/profile', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data?.success) return;
        const user = data.user;
        setProfile(prev => ({
          ...prev,
          name: user.name || prev.name,
          email: user.email || prev.email,
          avatar: user.image || prev.avatar,
          businessName: user.businessName || '',
          phone: user.phone || '',
          address: user.address || '',
          latitude: typeof user.latitude === 'number' ? String(user.latitude) : '',
          longitude: typeof user.longitude === 'number' ? String(user.longitude) : '',
          description: user.businessDesc || '',
          businessHours: user.businessHours || '',
          defaultReplyTemplate: user.defaultReplyTemplate || '',
          preferredLanguage: user.preferredLanguage || 'tr',
          holidayMode: user.holidayMode || false,
        }));
      } catch {
        // keep current values
      }
    };
    loadProfile();

    const loadWidgets = async () => {
      setLoadingWidgets(true);
      try {
        const res = await fetch('/api/dealer/dashboard-layout');
        const data = await res.json();
        if (data.success && data.widgets) {
          setDashboardWidgets(data.widgets);
        }
      } catch (err) { }
      finally { setLoadingWidgets(false); }
    };
    loadWidgets();
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
    toast.success(t('dealerSettings.avatarSelected'));
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
          businessName: profile.businessName || null,
          phone: profile.phone || null,
          businessDesc: profile.description || null,
          address: profile.address || null,
          latitude: profile.latitude !== '' ? Number(profile.latitude) : null,
          longitude: profile.longitude !== '' ? Number(profile.longitude) : null,
          businessHours: profile.businessHours || null,
          defaultReplyTemplate: profile.defaultReplyTemplate || null,
          preferredLanguage: profile.preferredLanguage || null,
          holidayMode: profile.holidayMode,
        }),
      });

      if (res.ok) {
        await update({ name: profile.name, image: profile.avatar });
        toast.success(t('dealerSettings.profileUpdated'));
        router.refresh();
      } else {
        toast.error(t('dealerSettings.profileUpdateError'));
      }
    } catch (error) {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t('dealerSettings.noLocationSupport'));
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setProfile((prev) => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
        }));
        try {
          setResolvingAddress(true);
          const res = await fetch(`/api/location/reverse?lat=${lat}&lng=${lng}`, { cache: 'no-store' });
          const data = await res.json();
          if (res.ok && data?.success && data?.data?.compactAddress) {
            setProfile((prev) => ({
              ...prev,
              address: data.data.compactAddress,
            }));
            toast.success(t('dealerSettings.locationAndAddressFetched'));
          } else {
            toast.success(t('dealerSettings.locationFetchedManualAddress'));
          }
        } catch {
          toast.success(t('dealerSettings.locationFetchedManualAddress'));
        } finally {
          setResolvingAddress(false);
          setGettingLocation(false);
        }
      },
      () => {
        setGettingLocation(false);
        toast.error(t('dealerSettings.locationFetchError'));
      },
      { enableHighAccuracy: false, timeout: 22000, maximumAge: 120_000 }
    );
  };

  const handleResolveAddressFromCoordinates = async () => {
    const lat = Number(profile.latitude);
    const lng = Number(profile.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error(t('dealerSettings.invalidCoordinates'));
      return;
    }
    setResolvingAddress(true);
    try {
      const res = await fetch(`/api/location/reverse?lat=${lat}&lng=${lng}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || t('dealerSettings.addressResolveError'));
        return;
      }
      setProfile((prev) => ({ ...prev, address: data.data.compactAddress || prev.address }));
      toast.success(t('dealerSettings.addressUpdatedFromCoordinates'));
    } catch {
      toast.error(t('dealerSettings.addressResolveError'));
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(t('dealerSettings.notificationsUpdated'));
    }, 1000);
  };

  const handleChangePassword = async () => {
    if (security.newPassword !== security.confirmPassword) {
      toast.error(t('dealerSettings.passwordsDoNotMatch'));
      return;
    }
    if (security.newPassword.length < 8) {
      toast.error(t('dealerSettings.passwordMinLength'));
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
        toast.success(t('dealerSettings.passwordUpdated'));
      } else {
        const data = await res.json();
        toast.error(data.error || t('dealerSettings.passwordUpdateError'));
      }
    } catch (error) {
      toast.error(t('common.error'));
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
    if (strength <= 1) return { label: t('dealerSettings.passwordWeak'), color: 'bg-red-500' };
    if (strength <= 2) return { label: t('dealerSettings.passwordMedium'), color: 'bg-yellow-500' };
    if (strength <= 3) return { label: t('dealerSettings.passwordGood'), color: 'bg-blue-500' };
    return { label: t('dealerSettings.passwordStrong'), color: 'bg-emerald-500' };
  };

  return (
    <div className="space-y-6 pb-8">
      <DashboardPageHero
        eyebrow={t('dealerSettings.eyebrow')}
        title={t('dealerSettings.title')}
        description={t('dealerSettings.description')}
        icon={<Settings className="h-7 w-7" aria-hidden />}
        tone="auto"
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-auto lg:inline-grid bg-muted/50 p-1">
          <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-background">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dealerSettings.tabProfile')}</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-background">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dealerSettings.tabNotifications')}</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-background">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dealerSettings.tabSecurity')}</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2 data-[state=active]:bg-background">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dealerSettings.tabAppearance')}</span>
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
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
              <div className="h-24 border-b border-border bg-muted/60 bg-gradient-to-r from-primary/15 via-muted/80 to-muted/60" />
              <CardContent className="relative pt-0 pb-6 px-6">
                <div className="flex flex-col sm:flex-row items-center gap-6 -mt-12">
                  <div className="relative group">
                    <Avatar className="h-28 w-28 border-4 border-background shadow-xl">
                      <AvatarImage src={profile.avatar} />
                      <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                        {getInitials(profile.name)}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      type="button"
                      onClick={() => setAvatarDialogOpen(true)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={t('dealerSettings.changeAvatar')}
                    >
                      <Camera className="h-8 w-8 text-white" aria-hidden />
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
                      {t('dealerSettings.changeAvatar')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Personal Info */}
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <User className="h-5 w-5 text-blue-500" />
                  </div>
                  {t('dealerSettings.personalInfo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dealer-name" className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {t('dealerSettings.fullName')}
                    </Label>
                    <Input
                      id="dealer-name"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dealer-email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {t('dealerSettings.email')}
                    </Label>
                    <Input
                      id="dealer-email"
                      value={profile.email}
                      disabled
                      className="bg-muted/50"
                      aria-describedby="dealer-email-desc"
                    />
                    <span id="dealer-email-desc" className="sr-only">{t('dealerSettings.emailNotEditable')}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dealer-phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {t('dealerSettings.phone')}
                  </Label>
                  <Input
                    id="dealer-phone"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Business Info */}
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Building className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  {t('dealerSettings.businessInfo')}
                </CardTitle>
                <CardDescription>
                  {t('dealerSettings.businessInfoDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dealer-businessName" className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {t('dealerSettings.businessName')}
                  </Label>
                  <Input
                    id="dealer-businessName"
                    value={profile.businessName}
                    onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dealer-address" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {t('dealerSettings.address')}
                  </Label>
                  <Input
                    id="dealer-address"
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dealer-latitude">{t('dealerSettings.latitude')}</Label>
                    <Input
                      id="dealer-latitude"
                      type="number"
                      step="0.000001"
                      placeholder="41.0082"
                      value={profile.latitude}
                      onChange={(e) => setProfile({ ...profile, latitude: e.target.value })}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dealer-longitude">{t('dealerSettings.longitude')}</Label>
                    <Input
                      id="dealer-longitude"
                      type="number"
                      step="0.000001"
                      placeholder="28.9784"
                      value={profile.longitude}
                      onChange={(e) => setProfile({ ...profile, longitude: e.target.value })}
                      className="bg-background/50"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGetCurrentLocation}
                  disabled={gettingLocation || resolvingAddress}
                  className="gap-2"
                  aria-label={gettingLocation ? t('dealerSettings.locationFetching') : t('dealerSettings.getMyLocation')}
                >
                  <Navigation className={`h-4 w-4 ${gettingLocation ? 'animate-spin' : ''}`} aria-hidden />
                  {gettingLocation ? t('dealerSettings.locationFetching') : t('dealerSettings.getMyLocation')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResolveAddressFromCoordinates}
                  disabled={resolvingAddress}
                  className="gap-2"
                  aria-label={resolvingAddress ? t('dealerSettings.addressResolving') : t('dealerSettings.findAddressFromCoordinates')}
                >
                  <LocateFixed className={`h-4 w-4 ${resolvingAddress ? 'animate-spin' : ''}`} aria-hidden />
                  {resolvingAddress ? t('dealerSettings.addressResolving') : t('dealerSettings.findAddressFromCoordinates')}
                </Button>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {t('dealerSettings.descriptionLabel')}
                  </Label>
                  <Textarea
                    value={profile.description}
                    onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                    rows={3}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('dealerSettings.businessHours')}</Label>
                  <Textarea
                    value={profile.businessHours}
                    onChange={(e) => setProfile({ ...profile, businessHours: e.target.value })}
                    placeholder={t('dealerSettings.businessHoursPlaceholder')}
                    rows={2}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('dealerSettings.defaultReplyTemplate')}</Label>
                  <Textarea
                    value={profile.defaultReplyTemplate}
                    onChange={(e) => setProfile({ ...profile, defaultReplyTemplate: e.target.value })}
                    placeholder={t('dealerSettings.defaultReplyTemplatePlaceholder')}
                    rows={3}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('dealerSettings.preferredLanguage')}</Label>
                  <select
                    value={profile.preferredLanguage}
                    onChange={(e) => setProfile({ ...profile, preferredLanguage: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm text-foreground shadow-sm dark:border-white/25 dark:bg-white/[0.07]"
                  >
                    <option value="tr">{t('dealerSettings.turkish')}</option>
                    <option value="en">{t('dealerSettings.english')}</option>
                  </select>
                </div>
                {/* Holiday Mode (S6-T9) */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/20 bg-destructive/5 mt-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="holiday-mode-switch" className="text-base font-medium flex items-center gap-2">
                      <Zap className="h-4 w-4 text-destructive" />
                      {t('dealerSettings.holidayModeTitle')}
                    </Label>
                    <span className="text-sm text-muted-foreground w-11/12">
                      {t('dealerSettings.holidayModeDescription')}
                    </span>
                  </div>
                  <Switch
                    id="holiday-mode-switch"
                    checked={profile.holidayMode}
                    onCheckedChange={(checked) => setProfile({ ...profile, holidayMode: checked })}
                  />
                </div>
                <Button onClick={handleSaveProfile} disabled={saving} className="mt-4 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? t('common.processing') : t('dealerSettings.saveChanges')}
                </Button>
              </CardContent>
            </Card>

            {/* Automation Info */}
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Zap className="h-5 w-5 text-orange-500" />
                  </div>
                  {t('dealerSettings.automation')}
                </CardTitle>
                <CardDescription>
                  {t('dealerSettings.automationDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="gap-2 w-full sm:w-auto">
                  <Link href="/dealer/settings/auto-replies">
                    {t('dealerSettings.goToAutoReplyRules')}
                  </Link>
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
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Bell className="h-5 w-5 text-amber-500" />
                  </div>
                  {t('dealerSettings.notificationPreferences')}
                </CardTitle>
                <CardDescription>{t('dealerSettings.notificationPreferencesDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Email Notifications */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2 text-lg">
                    <Mail className="h-5 w-5 text-blue-500" />
                    {t('dealerSettings.emailNotifications')}
                  </h4>
                  <div className="space-y-4 pl-7">
                    {[
                      { key: 'emailFeedback', title: t('dealerSettings.emailFeedbackTitle'), desc: t('dealerSettings.emailFeedbackDesc') },
                      { key: 'emailWeekly', title: t('dealerSettings.emailWeeklyTitle'), desc: t('dealerSettings.emailWeeklyDesc') },
                      { key: 'emailAlerts', title: t('dealerSettings.emailAlertsTitle'), desc: t('dealerSettings.emailAlertsDesc') },
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
                    <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                    {t('dealerSettings.pushNotifications')}
                  </h4>
                  <div className="space-y-4 pl-7">
                    {[
                      { key: 'pushFeedback', title: t('dealerSettings.pushFeedbackTitle'), desc: t('dealerSettings.pushFeedbackDesc') },
                      { key: 'pushAlerts', title: t('dealerSettings.pushAlertsTitle'), desc: t('dealerSettings.pushAlertsDesc') },
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
                  {saving ? t('common.processing') : t('dealerSettings.saveSettings')}
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
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <Lock className="h-5 w-5 text-red-500" />
                  </div>
                  {t('dealerSettings.changePassword')}
                </CardTitle>
                <CardDescription>{t('dealerSettings.changePasswordDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dealer-current-password">{t('dealerSettings.currentPassword')}</Label>
                  <div className="relative">
                    <Input
                      id="dealer-current-password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={security.currentPassword}
                      onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                      className="bg-background/50 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showCurrentPassword ? t('dealerSettings.hideCurrentPassword') : t('dealerSettings.showCurrentPassword')}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dealer-new-password">{t('dealerSettings.newPassword')}</Label>
                  <div className="relative">
                    <Input
                      id="dealer-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={security.newPassword}
                      onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                      className="bg-background/50 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showNewPassword ? t('dealerSettings.hideNewPassword') : t('dealerSettings.showNewPassword')}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                  {security.newPassword && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 flex-1 rounded-full ${level <= passwordStrength(security.newPassword)
                              ? getStrengthLabel(passwordStrength(security.newPassword)).color
                              : 'bg-muted'
                              }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('dealerSettings.passwordStrength')}: {getStrengthLabel(passwordStrength(security.newPassword)).label}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dealer-confirm-password">{t('dealerSettings.newPasswordRepeat')}</Label>
                  <Input
                    id="dealer-confirm-password"
                    type="password"
                    value={security.confirmPassword}
                    onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                    className="bg-background/50"
                  />
                  {security.confirmPassword && security.newPassword !== security.confirmPassword && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {t('dealerSettings.passwordsDoNotMatch')}
                    </p>
                  )}
                  {security.confirmPassword && security.newPassword === security.confirmPassword && (
                    <p className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('dealerSettings.passwordsMatch')}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={saving || !security.currentPassword || !security.newPassword || security.newPassword !== security.confirmPassword}
                  className="gap-2 bg-gradient-to-r from-red-500 to-red-700"
                  aria-label={saving ? t('dealerSettings.passwordUpdating') : t('dealerSettings.updatePassword')}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Shield className="h-4 w-4" aria-hidden />}
                  {saving ? t('dealerSettings.updating') : t('dealerSettings.updatePassword')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Dashboard Layout Tab */}
        <TabsContent value="dashboard">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <LayoutDashboard className="h-5 w-5 text-emerald-500" />
                  </div>
                  {t('dealerSettings.dashboardAppearance')}
                </CardTitle>
                <CardDescription>
                  {t('dealerSettings.dashboardAppearanceDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingWidgets ? (
                  <InlineLoadingStatus className="p-8" label={t('dealerSettings.dashboardLayoutLoading')} />
                ) : (
                  <div className="space-y-2">
                    {dashboardWidgets.map((widget, index) => (
                      <div key={widget.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/50">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={widget.visible}
                            onCheckedChange={(checked) => {
                              const newWidgets = [...dashboardWidgets];
                              newWidgets[index].visible = checked;
                              setDashboardWidgets(newWidgets);
                            }}
                          />
                          <span className="font-medium">{widget.label || widget.id}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            disabled={index === 0}
                            onClick={() => {
                              const newWidgets = [...dashboardWidgets];
                              const temp = newWidgets[index];
                              newWidgets[index] = newWidgets[index - 1];
                              newWidgets[index - 1] = temp;
                              newWidgets.forEach((w, i) => w.order = i + 1);
                              setDashboardWidgets(newWidgets);
                            }}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            disabled={index === dashboardWidgets.length - 1}
                            onClick={() => {
                              const newWidgets = [...dashboardWidgets];
                              const temp = newWidgets[index];
                              newWidgets[index] = newWidgets[index + 1];
                              newWidgets[index + 1] = temp;
                              newWidgets.forEach((w, i) => w.order = i + 1);
                              setDashboardWidgets(newWidgets);
                            }}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const res = await fetch('/api/dealer/dashboard-layout', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ widgets: dashboardWidgets })
                      });
                      if (res.ok) toast.success(t('dealerSettings.appearanceSaved'));
                      else toast.error(t('dealerSettings.saveFailed'));
                    } catch { toast.error(t('common.error')); }
                    finally { setSaving(false); }
                  }}
                  disabled={saving || loadingWidgets}
                  className="mt-4 gap-2 bg-gradient-to-r from-emerald-500 to-teal-500"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? t('common.processing') : t('dealerSettings.saveAppearance')}
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
                        <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                        {t('dealerSettings.selectAvatar')}
                      </CardTitle>
                      <CardDescription>{t('dealerSettings.selectAvatarDescription')}</CardDescription>
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
                          className={`relative p-2 rounded-xl border-2 transition-all ${profile.avatar === avatar
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                            : 'border-border hover:border-primary/40 hover:bg-muted/50'
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
                            <div className="absolute right-1 top-1 rounded-full bg-primary p-0.5">
                              <Check className="h-3 w-3 text-primary-foreground" />
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
