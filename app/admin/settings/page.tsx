'use client';

import { BRAND_PRIMARY_HEX } from '@/lib/brand-colors';
import { useState, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
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
  History,
  AlertTriangle,
  RotateCcw,
  FlaskConical,
  Layers,
  Trash2,
  SlidersHorizontal,
  Search,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { toast } from '@/lib/admin-toast';
import { cn, getInitials } from '@/lib/utils';
import {
  TW_BRAND_BADGE_SOFT_PILL,
  TW_BRAND_BG_SOFT_BR,
  TW_BRAND_BG_SUBTLE_BR,
  TW_BRAND_GRADIENT_HORIZONTAL_STRONG,
} from '@/lib/tw-brand-classes';
import { type BackgroundVariant } from '@/components/ui/backgrounds';
import { avatarList } from '@/lib/avatar-options';
import { BootstrapActionButton } from '@/components/admin/bootstrap-action-button';
import type { ModuleControlItem, ModuleControlsMap, ModuleScope } from '@/lib/module-controls';
import type { MenuItemCatalogItem, VisibilityRole, FeatureVisibilityRole, RoleVisibilityMap } from '@/lib/visibility-controls';

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

type SettingsAuditEntry = {
  id: string;
  action: string;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
  user?: { email: string | null; name: string | null };
};

type DemoSummary = {
  insightsDemoCategories: number;
  suspiciousDemoLogs: number;
  aiQualityDemoSamples: number;
  totalDemoRecords: number;
};

type ModuleDataResponse = {
  catalog: ModuleControlItem[];
  controls: ModuleControlsMap;
};

type VisibilityDataResponse = {
  featureVisibility: Record<FeatureVisibilityRole, RoleVisibilityMap>;
  menuVisibility: Record<VisibilityRole, RoleVisibilityMap>;
  systemFeatureVisibility: RoleVisibilityMap;
  catalog: {
    features: Record<FeatureVisibilityRole, ModuleControlItem[]>;
    menu: Record<VisibilityRole, MenuItemCatalogItem[]>;
  };
};

const backgroundOptions: { id: BackgroundVariant; name: string; description: string; elite?: boolean; special?: boolean; legendary?: boolean }[] = [
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
  // Efsanevi Efektler
  { id: 'nebula', name: '🌌 Nebula', description: 'Kozmik bulutsu ve yıldızlar', legendary: true },
  { id: 'northern-lights', name: '🌈 Kuzey Işıkları', description: 'Büyüleyici aurora dalgaları', legendary: true },
  { id: 'holographic', name: '💎 Holografik', description: 'Gökkuşağı prizma efekti', legendary: true },
  { id: 'galaxy', name: '🪐 Galaksi', description: 'Dönen spiral galaksi', legendary: true },
  // Özel Gün Efektleri
  { id: 'christmas', name: '🎄 Yılbaşı', description: 'Kar, ışıklar ve Noel ruhu', special: true },
  { id: 'valentine', name: '💕 Sevgililer Günü', description: 'Romantik kalpler ve parıltılar', special: true },
  { id: 'birthday', name: '🎂 Doğum Günü', description: 'Balonlar ve konfetiler', special: true },
  { id: 'none', name: 'Yok', description: 'Arka plan efekti yok' },
];

const settingsToasts = {
  success: (message: string, options?: Parameters<typeof toast.success>[1]) =>
    toast.success(message, options),
  info: (message: string) => toast(message),
  warn: (message: string) => toast.error(message),
};

const SETTINGS_TAB_IDS = ['profile', 'general', 'appearance', 'auth', 'ai', 'gamification', 'modules', 'page-settings'] as const;
type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

function isSettingsTabId(v: string): v is SettingsTabId {
  return (SETTINGS_TAB_IDS as readonly string[]).includes(v);
}

export default function AdminSettingsPage() {
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Erkek');
  const [auditEntries, setAuditEntries] = useState<SettingsAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [rollbackingId, setRollbackingId] = useState<string | null>(null);
  const [demoSummary, setDemoSummary] = useState<DemoSummary | null>(null);
  const [demoSummaryLoading, setDemoSummaryLoading] = useState(false);
  const [demoBatchLoading, setDemoBatchLoading] = useState<'seed' | 'clear' | null>(null);
  const [moduleCatalog, setModuleCatalog] = useState<ModuleControlItem[]>([]);
  const [moduleControls, setModuleControls] = useState<ModuleControlsMap>({});
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleScope, setModuleScope] = useState<ModuleScope | 'all'>('all');
  const [visibilityRole, setVisibilityRole] = useState<VisibilityRole>('dealer');
  const [featureVisibility, setFeatureVisibility] = useState<Record<FeatureVisibilityRole, RoleVisibilityMap>>({
    dealer: {},
    customer: {},
    system: {},
  });
  const [menuVisibility, setMenuVisibility] = useState<Record<VisibilityRole, RoleVisibilityMap>>({ dealer: {}, customer: {} });
  const [visibilityCatalog, setVisibilityCatalog] = useState<VisibilityDataResponse['catalog'] | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState('');
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<
    | null
    | {
        kind: 'success';
        delivery: {
          channel: 'smtp' | 'resend';
          effectiveFrom: string;
          usedResendAfterSmtpFailure: boolean;
        };
      }
    | { kind: 'error'; message: string }
  >(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeResult, setComposeResult] = useState<
    | null
    | {
        kind: 'success';
        delivery: {
          channel: 'smtp' | 'resend';
          effectiveFrom: string;
          usedResendAfterSmtpFailure: boolean;
        };
      }
    | { kind: 'error'; message: string }
  >(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('profile');
  const [serverMailEnv, setServerMailEnv] = useState<{
    configured: boolean;
    smtp: boolean;
    resend: boolean;
  } | null>(null);
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
    siteName: 'QRateX',
    siteDescription: 'QR Kod Tabanlı Müşteri Geri Bildirim Platformu',
    siteUrl: 'https://qratex.com',
    logoUrl: '/logo/icon.png',
    faviconUrl: '/favicon.ico',
    primaryColor: BRAND_PRIMARY_HEX.toUpperCase(),
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

  useLayoutEffect(() => {
    try {
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
      if (q && isSettingsTabId(q)) setSettingsTab(q);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSettingsTabChange = (v: string) => {
    if (!isSettingsTabId(v)) return;
    setSettingsTab(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', v);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    } catch {
      /* ignore */
    }
  };

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

  useEffect(() => {
    loadDemoSummary();
  }, []);

  useEffect(() => {
    loadModuleControls();
  }, []);

  useEffect(() => {
    loadVisibilitySettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/system-status', { cache: 'no-store' });
        const data = (await res.json()) as {
          success?: boolean;
          mail?: { configured: boolean; smtp: boolean; resend: boolean };
        };
        if (!cancelled && data.success && data.mail) setServerMailEnv(data.mail);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      
      if (data.entries && Array.isArray(data.entries)) {
        const merged = { ...settings };
        data.entries.forEach((setting: { key: string; value: unknown }) => {
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
    settingsToasts.info('Avatar secildi. Kaydetmeyi unutmayin.');
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
        settingsToasts.success('Profil guncellendi.');
      } else {
        settingsToasts.warn('Profil guncellenemedi.');
      }
    } catch (error) {
      settingsToasts.warn('Beklenmeyen bir hata olustu.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (security.newPassword !== security.confirmPassword) {
      settingsToasts.warn('Sifreler eslesmiyor.');
      return;
    }
    if (security.newPassword.length < 8) {
      settingsToasts.warn('Sifre en az 8 karakter olmalidir.');
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
        settingsToasts.success('Sifre guncellendi.');
      } else {
        const data = await res.json();
        settingsToasts.warn(data.error || 'Sifre guncellenemedi.');
      }
    } catch (error) {
      settingsToasts.warn('Beklenmeyen bir hata olustu.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    setEmailTestSending(true);
    setEmailTestResult(null);
    try {
      const trimmed = emailTestTo.trim();
      const res = await fetch('/api/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmed ? { to: trimmed } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        delivery?: {
          channel: 'smtp' | 'resend';
          effectiveFrom: string;
          usedResendAfterSmtpFailure?: boolean;
        };
      };
      if (!res.ok || !data.success) {
        const errMsg = data.error || 'Test e-postası gönderilemedi';
        setEmailTestResult({ kind: 'error', message: errMsg });
        settingsToasts.warn(errMsg);
        return;
      }
      if (data.delivery) {
        setEmailTestResult({
          kind: 'success',
          delivery: {
            channel: data.delivery.channel,
            effectiveFrom: data.delivery.effectiveFrom,
            usedResendAfterSmtpFailure: Boolean(data.delivery.usedResendAfterSmtpFailure),
          },
        });
      }
      const channelLabel = data.delivery?.channel === 'smtp' ? 'SMTP' : 'Resend';
      const descParts: string[] = [`Kanal: ${channelLabel}`];
      if (data.delivery?.effectiveFrom) {
        descParts.push(`Gönderen: ${data.delivery.effectiveFrom}`);
      }
      if (data.delivery?.usedResendAfterSmtpFailure) {
        descParts.push('SMTP kimlik doğrulaması başarısız; Resend yedeği kullanıldı.');
      }
      settingsToasts.success(data.message || 'Test gönderildi.', {
        description: descParts.join(' · '),
        duration: 9000,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Test e-postası gönderilemedi.';
      setEmailTestResult({ kind: 'error', message: msg });
      settingsToasts.warn(msg);
    } finally {
      setEmailTestSending(false);
    }
  };

  const handleSendComposeMail = async () => {
    setComposeSending(true);
    setComposeResult(null);
    try {
      const res = await fetch('/api/admin/compose-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo.trim(),
          subject: composeSubject.trim(),
          message: composeMessage.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        delivery?: {
          channel: 'smtp' | 'resend';
          effectiveFrom: string;
          usedResendAfterSmtpFailure?: boolean;
        };
      };
      if (!res.ok || !data.success) {
        const errMsg = data.error || 'E-posta gönderilemedi';
        setComposeResult({ kind: 'error', message: errMsg });
        settingsToasts.warn(errMsg);
        return;
      }
      if (data.delivery) {
        setComposeResult({
          kind: 'success',
          delivery: {
            channel: data.delivery.channel,
            effectiveFrom: data.delivery.effectiveFrom,
            usedResendAfterSmtpFailure: Boolean(data.delivery.usedResendAfterSmtpFailure),
          },
        });
      }
      const channelLabel = data.delivery?.channel === 'smtp' ? 'SMTP' : 'Resend';
      const descParts: string[] = [`Kanal: ${channelLabel}`];
      if (data.delivery?.effectiveFrom) {
        descParts.push(`Gönderen: ${data.delivery.effectiveFrom}`);
      }
      if (data.delivery?.usedResendAfterSmtpFailure) {
        descParts.push('SMTP kimlik doğrulaması başarısız; Resend yedeği kullanıldı.');
      }
      settingsToasts.success(data.message || 'E-posta gönderildi.', {
        description: descParts.join(' · '),
        duration: 9000,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'E-posta gönderilemedi.';
      setComposeResult({ kind: 'error', message: msg });
      settingsToasts.warn(msg);
    } finally {
      setComposeSending(false);
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
        settingsToasts.success('Ayarlar kaydedildi.');
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      settingsToasts.warn('Ayarlar kaydedilemedi.');
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
        settingsToasts.success('Arka plan efekti guncellendi.');
      } else {
        settingsToasts.warn('Arka plan efekti kaydedilemedi.');
      }
    } catch (error) {
      settingsToasts.warn('Beklenmeyen bir hata olustu.');
    }
  };

  const currentCategoryAvatars = avatarList.find(c => c.category === selectedCategory)?.items || [];

  const loadDemoSummary = async () => {
    try {
      setDemoSummaryLoading(true);
      const res = await fetch('/api/admin/bootstrap/summary', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Demo özeti alınamadı');
      setDemoSummary(data.summary ?? null);
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Demo ozeti alinamadi.');
    } finally {
      setDemoSummaryLoading(false);
    }
  };

  const runBootstrapBatch = async (mode: 'seed' | 'clear') => {
    try {
      setDemoBatchLoading(mode);
      const actions =
        mode === 'seed'
          ? ['seed_insights_categories', 'seed_suspicious_activities', 'seed_ai_quality_samples']
          : ['clear_insights_categories', 'clear_suspicious_activities', 'clear_ai_quality_samples'];
      const results = await Promise.all(
        actions.map(async (action) => {
          const res = await fetch('/api/admin/bootstrap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });
          const data = await res.json();
          if (!res.ok || !data?.success) {
            throw new Error(data?.error || `${action} başarısız`);
          }
          return data;
        })
      );
      const count =
        mode === 'seed'
          ? results.reduce((acc, item) => acc + (Number(item.created) || 0) + (Number(item.updated) || 0), 0)
          : results.reduce((acc, item) => acc + (Number(item.cleared) || 0), 0);
      settingsToasts.success(
        mode === 'seed'
          ? `Toplu demo uretimi tamamlandi (${count} kayit etkilendi).`
          : `Toplu demo temizligi tamamlandi (${count} kayit silindi).`
      );
      await loadDemoSummary();
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Toplu demo islemi basarisiz oldu.');
    } finally {
      setDemoBatchLoading(null);
    }
  };

  const loadSettingsAudit = async () => {
    try {
      setAuditLoading(true);
      const res = await fetch('/api/admin/settings/audit');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ayar geçmişi yüklenemedi');
      setAuditEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Ayar gecmisi yuklenemedi.');
    } finally {
      setAuditLoading(false);
    }
  };

  const loadModuleControls = async () => {
    try {
      setModuleLoading(true);
      const res = await fetch('/api/admin/settings/modules', { cache: 'no-store' });
      const data = (await res.json()) as ModuleDataResponse & { success?: boolean; error?: string };
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Modül kontrolleri yüklenemedi');
      setModuleCatalog(Array.isArray(data.catalog) ? data.catalog : []);
      setModuleControls(data.controls ?? {});
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Modul kontrolleri yuklenemedi.');
    } finally {
      setModuleLoading(false);
    }
  };

  const saveModuleControls = async () => {
    try {
      setModuleSaving(true);
      const res = await fetch('/api/admin/settings/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controls: moduleControls }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Kaydedilemedi');
      settingsToasts.success('Modul kontrolleri kaydedildi.');
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Modul kontrolleri kaydedilemedi.');
    } finally {
      setModuleSaving(false);
    }
  };

  const loadVisibilitySettings = async () => {
    try {
      setVisibilityLoading(true);
      const res = await fetch('/api/admin/settings/visibility', { cache: 'no-store' });
      const data = (await res.json()) as VisibilityDataResponse & { success?: boolean; error?: string };
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa ayarları yüklenemedi');
      setFeatureVisibility(data.featureVisibility);
      setMenuVisibility(data.menuVisibility);
      setVisibilityCatalog(data.catalog);
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Sayfa ayarlari yuklenemedi.');
    } finally {
      setVisibilityLoading(false);
    }
  };

  const saveVisibilitySettings = async () => {
    try {
      setVisibilitySaving(true);
      const res = await fetch('/api/admin/settings/visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureVisibility: {
            dealer: featureVisibility.dealer,
            customer: featureVisibility.customer,
          },
          systemFeatureVisibility: featureVisibility.system,
          menuVisibility,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Sayfa ayarları kaydedilemedi');
      settingsToasts.success('Sayfa ayarlari kaydedildi.');
      await loadSettingsAudit();
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Sayfa ayarlari kaydedilemedi.');
    } finally {
      setVisibilitySaving(false);
    }
  };

  const setScopeState = (scope: ModuleScope, value: boolean) => {
    const next = { ...moduleControls };
    for (const item of moduleCatalog) {
      if (item.scope === scope) next[item.key] = value;
    }
    setModuleControls(next);
  };

  const setRoleFeatureState = (role: FeatureVisibilityRole, value: boolean) => {
    const keys = visibilityCatalog?.features?.[role]?.map((item) => item.key) ?? [];
    setFeatureVisibility((prev) => ({
      ...prev,
      [role]: keys.reduce<RoleVisibilityMap>((acc, key) => {
        acc[key] = value;
        return acc;
      }, { ...prev[role] }),
    }));
  };

  const setRoleMenuState = (role: VisibilityRole, value: boolean) => {
    const keys = visibilityCatalog?.menu?.[role]?.map((item) => item.key) ?? [];
    setMenuVisibility((prev) => ({
      ...prev,
      [role]: keys.reduce<RoleVisibilityMap>((acc, key) => {
        acc[key] = value;
        return acc;
      }, { ...prev[role] }),
    }));
  };

  const filteredModules = moduleCatalog.filter((item) => {
    const inScope = moduleScope === 'all' ? true : item.scope === moduleScope;
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return inScope;
    return inScope && (item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.key.toLowerCase().includes(q));
  });

  const rollbackSettings = async (auditLogId: string) => {
    try {
      const ok = window.confirm('Bu sürüme dönmek istediğine emin misin? Mevcut ayarlar üzerine yazılacak.');
      if (!ok) return;
      setRollbackingId(auditLogId);
      const res = await fetch('/api/admin/settings/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditLogId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Rollback başarısız');
      const restored = Array.isArray(data?.restoredKeys) ? data.restoredKeys.length : 0;
      settingsToasts.success(`Ayarlar geri alindi${restored > 0 ? ` (${restored} anahtar)` : ''}.`);
      await fetchSettings();
      await loadSettingsAudit();
    } catch (error) {
      settingsToasts.warn(error instanceof Error ? error.message : 'Rollback basarisiz.');
    } finally {
      setRollbackingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ayarlar" description="Platform ayarlarını yapılandırın" />
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
      <PageHeader title="Ayarlar" description="Platform ve profil ayarlarını yapılandırın" />

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Hızlı admin başlangıcı</CardTitle>
          <CardDescription>
            Boş panelleri tek tıkla doldurup admin modüllerini hemen test edebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <BootstrapActionButton action="seed_insights_categories" label="Sektör verisi üret" />
          <BootstrapActionButton action="seed_suspicious_activities" label="Şüpheli aktivite üret" />
          <BootstrapActionButton action="seed_ai_quality_samples" label="AI kalite örneği üret" />
          <BootstrapActionButton action="assign_ab_cohorts" label="A/B cohort ata" />
          <BootstrapActionButton action="clear_insights_categories" label="Demo sektör verisini sil" variant="destructive" />
          <BootstrapActionButton action="clear_suspicious_activities" label="Demo şüpheli aktiviteleri sil" variant="destructive" />
          <BootstrapActionButton action="clear_ai_quality_samples" label="Demo AI örneklerini sil" variant="destructive" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Demo Durum Merkezi
          </CardTitle>
          <CardDescription>
            Admin demo verilerinin canlı sayacı. Toplu üretim veya toplu temizlik yapabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadDemoSummary} disabled={demoSummaryLoading}>
              <Layers className={`h-4 w-4 mr-2 ${demoSummaryLoading ? 'animate-spin' : ''}`} />
              Demo özetini yenile
            </Button>
            <Button
              size="sm"
              onClick={() => runBootstrapBatch('seed')}
              disabled={demoBatchLoading !== null}
            >
              <FlaskConical className={`h-4 w-4 mr-2 ${demoBatchLoading === 'seed' ? 'animate-spin' : ''}`} />
              Toplu demo üret
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => runBootstrapBatch('clear')}
              disabled={demoBatchLoading !== null}
            >
              <Trash2 className={`h-4 w-4 mr-2 ${demoBatchLoading === 'clear' ? 'animate-spin' : ''}`} />
              Toplu demo sil
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Insights demo kategori</p>
              <p className="text-xl font-semibold">{demoSummary?.insightsDemoCategories ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Fraud demo log</p>
              <p className="text-xl font-semibold">{demoSummary?.suspiciousDemoLogs ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">AI quality demo örnek</p>
              <p className="text-xl font-semibold">{demoSummary?.aiQualityDemoSamples ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Toplam demo iz</p>
              <p className="text-xl font-semibold">{demoSummary?.totalDemoRecords ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Kritik değişiklik geçmişi
          </CardTitle>
          <CardDescription>
            Toplu ayar değişiklikleri burada görünür. Gerekirse tek tıkla önceki sürüme dönebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={loadSettingsAudit} disabled={auditLoading} className="mb-3 gap-2">
            <History className={`h-4 w-4 ${auditLoading ? 'animate-spin' : ''}`} />
            Geçmişi getir
          </Button>
          {auditEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Henüz geçmiş kaydı yok.
            </div>
          ) : (
            <div className="space-y-2">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <div className="font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      {entry.action}
                    </div>
                    <p className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString('tr-TR')}
                      {entry.user?.email ? ` • ${entry.user.email}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => rollbackSettings(entry.id)}
                    disabled={rollbackingId === entry.id}
                  >
                    <RotateCcw className={`h-4 w-4 ${rollbackingId === entry.id ? 'animate-spin' : ''}`} />
                    Bu sürüme dön
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={settingsTab} onValueChange={handleSettingsTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 h-auto gap-1 p-1">
          <TabsTrigger value="profile" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <User className="h-4 w-4 shrink-0" />
            Profil
          </TabsTrigger>
          <TabsTrigger value="general" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <Globe className="h-4 w-4 shrink-0" />
            Genel
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <Palette className="h-4 w-4 shrink-0" />
            Görünüm
          </TabsTrigger>
          <TabsTrigger value="auth" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <Shield className="h-4 w-4 shrink-0" />
            Kimlik
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <Sparkles className="h-4 w-4 shrink-0" />
            AI
          </TabsTrigger>
          <TabsTrigger value="gamification" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <Database className="h-4 w-4 shrink-0" />
            Oyun
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            Modüller
          </TabsTrigger>
          <TabsTrigger value="page-settings" className="flex flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 sm:py-1.5 text-[10px] sm:text-sm">
            <Layers className="h-4 w-4 shrink-0" />
            Sayfa Ayarı
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
                          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2 sm:gap-3">
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
                    {backgroundOptions.filter(o => !o.elite && !o.special && !o.legendary).map((option) => (
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
                    <h4 className="text-sm font-medium bg-gradient-to-r from-primary via-violet-500 to-orange-500 bg-clip-text text-transparent">
                      ⭐ Elit Efektler
                    </h4>
                    <span
                      className={cn(
                        TW_BRAND_BADGE_SOFT_PILL,
                        'px-2 py-0.5 text-[10px] font-medium text-primary'
                      )}
                    >
                      PREMIUM
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {backgroundOptions.filter(o => o.elite).map((option) => (
                      <motion.button
                        key={option.id}
                        type="button"
                        onClick={() => handleBackgroundChange(option.id)}
                        className={cn(
                          'relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all',
                          settings.backgroundEffect === option.id
                            ? cn('border-primary ring-2 ring-primary/30', TW_BRAND_BG_SOFT_BR)
                            : cn(
                                'border-primary/30 hover:border-primary/60 hover:bg-primary/10',
                                TW_BRAND_BG_SUBTLE_BR
                              )
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {settings.backgroundEffect === option.id && (
                          <div
                            className={cn(
                              'absolute right-2 top-2 rounded-full p-0.5',
                              TW_BRAND_GRADIENT_HORIZONTAL_STRONG
                            )}
                          >
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

                {/* Efsanevi Efektler */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-medium bg-gradient-to-r from-cyan-400 via-blue-500 to-primary bg-clip-text text-transparent">
                      👑 Efsanevi Efektler
                    </h4>
                    <span className="rounded-full bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-primary/20 px-2 py-0.5 text-[10px] font-medium text-cyan-400 animate-pulse">
                      LEGENDARY
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {backgroundOptions.filter(o => o.legendary).map((option) => (
                      <motion.button
                        key={option.id}
                        type="button"
                        onClick={() => handleBackgroundChange(option.id)}
                        className={`relative p-4 rounded-xl border-2 transition-all text-left overflow-hidden ${
                          settings.backgroundEffect === option.id
                            ? 'border-cyan-500 bg-gradient-to-br from-cyan-500/20 via-blue-500/20 to-primary/20 ring-2 ring-cyan-500/30'
                            : 'border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-primary/5 hover:border-cyan-500/60 hover:bg-cyan-500/10'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {settings.backgroundEffect === option.id && (
                          <div className="absolute right-2 top-2 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-primary p-0.5">
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
                    <h4 className="text-sm font-medium bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 bg-clip-text text-transparent">
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
                            ? 'border-red-500 bg-gradient-to-br from-red-500/20 via-orange-500/20 to-amber-500/20 ring-2 ring-red-500/30'
                            : 'border-red-500/30 hover:border-red-500/60 hover:bg-red-500/10 bg-gradient-to-br from-red-500/5 via-orange-500/5 to-amber-500/5'
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

            <Card glass className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4" />
                  E-posta gönderimi (.env)
                </CardTitle>
                <CardDescription>
                  Şifre sıfırlama ve magic link mesajları sunucudaki ortam değişkenleriyle gönderilir (veritabanındaki SMTP alanları
                  gönderimi doğrudan etkilemez). Gmail için hesapta 2 adımlı doğrulama ve uygulama şifresi kullanın.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {serverMailEnv && (
                  <p
                    className={`text-xs rounded-md border px-3 py-2 ${
                      serverMailEnv.configured
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50'
                    }`}
                  >
                    <span className="font-medium">Sunucu (.env) özeti:</span>{' '}
                    {serverMailEnv.configured
                      ? [serverMailEnv.smtp && 'SMTP', serverMailEnv.resend && 'Resend'].filter(Boolean).join(' · ') || '—'
                      : 'SMTP veya RESEND_API_KEY tanımlı değil — şifre sıfırlama / doğrulama e-postaları gönderilemez.'}
                  </p>
                )}
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
                  <li>
                    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">SMTP_HOST</code>,{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">SMTP_PORT</code> (587 veya 465),{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">SMTP_USER</code>,{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">SMTP_PASS</code> veya{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">SMTP_PASSWORD</code>
                  </li>
                  <li>
                    İsteğe bağlı: <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">SMTP_SECURE=true</code> veya
                    port 465 ile TLS
                  </li>
                  <li>
                    Gönderen başlığı: <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">EMAIL_FROM</code> (örn.{' '}
                    <span className="font-mono text-xs">QRateX &lt;noreply@alanadiniz.com&gt;</span>)
                  </li>
                  <li>
                    Alternatif: <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">RESEND_API_KEY</code> (SMTP yoksa
                    Resend kullanılır)
                  </li>
                  <li>
                    SMTP 535 (kimlik) hatasında otomatik Resend denemesi:{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">SMTP_FALLBACK_RESEND</code> (varsayılan açık;
                    kapatmak için <span className="font-mono text-xs">false</span>)
                  </li>
                </ul>
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Label htmlFor="admin-email-test-to">Test e-postası alıcısı</Label>
                  <p className="text-xs text-muted-foreground">Boş bırakılırsa oturum açtığınız admin e-postasına gönderilir.</p>
                  <Input
                    id="admin-email-test-to"
                    type="email"
                    placeholder={profile.email || 'ornek@alanadiniz.com'}
                    value={emailTestTo}
                    onChange={(e) => setEmailTestTo(e.target.value)}
                    autoComplete="email"
                  />
                  <Button type="button" variant="secondary" className="gap-2" onClick={handleSendTestEmail} disabled={emailTestSending || !serverMailEnv?.configured}>
                    <Mail className={`h-4 w-4 ${emailTestSending ? 'animate-pulse' : ''}`} />
                    {emailTestSending ? 'Gönderiliyor...' : 'Test e-postası gönder'}
                  </Button>
                  {!serverMailEnv?.configured && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">E-posta sunucusu tanımlı değilken test gönderilemez.</p>
                  )}
                  {emailTestResult?.kind === 'success' && (
                    <Alert className="border-emerald-500/30 bg-emerald-500/5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <AlertTitle>Gönderim özeti</AlertTitle>
                      <AlertDescription className="space-y-1 text-muted-foreground">
                        <p>
                          <span className="font-medium text-foreground">Kanal:</span>{' '}
                          {emailTestResult.delivery.channel === 'smtp' ? 'SMTP' : 'Resend API'}
                        </p>
                        <p className="break-all">
                          <span className="font-medium text-foreground">Gönderen:</span>{' '}
                          {emailTestResult.delivery.effectiveFrom}
                        </p>
                        {emailTestResult.delivery.usedResendAfterSmtpFailure && (
                          <p className="text-amber-700 dark:text-amber-400">
                            SMTP girişi reddedildi; mesaj Resend ile iletildi. Kalıcı çözüm için Gmail uygulama şifresi veya yalnızca
                            Resend kullanın.
                          </p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  {emailTestResult?.kind === 'error' && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Gönderilemedi</AlertTitle>
                      <AlertDescription className="break-words">{emailTestResult.message}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Özel e-posta (logo şablonu)</p>
                    <p className="text-xs text-muted-foreground">
                      Konu ve düz metin mesaj girin; HTML otomatik üretilir. Üstte marka logosu{' '}
                      <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">/logo/logo-light.png</code> kullanılır
                      (mutlak adres için <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">NEXT_PUBLIC_APP_URL</code>{' '}
                      veya <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">NEXTAUTH_URL</code>).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-compose-to">Alıcı</Label>
                    <Input
                      id="admin-compose-to"
                      type="email"
                      placeholder="alici@ornek.com"
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="admin-compose-subject">Konu</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{composeSubject.length}/200</span>
                    </div>
                    <Input
                      id="admin-compose-subject"
                      type="text"
                      placeholder="Örn. Duyuru: bakım penceresi"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="admin-compose-message">Mesaj</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{composeMessage.length}/12000</span>
                    </div>
                    <Textarea
                      id="admin-compose-message"
                      placeholder="Paragraflar için çift satır sonu kullanın. HTML yazmayın; metin kaçışlı gönderilir."
                      value={composeMessage}
                      onChange={(e) => setComposeMessage(e.target.value)}
                      rows={8}
                      className="min-h-[140px] resize-y"
                      maxLength={12000}
                    />
                  </div>
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={handleSendComposeMail}
                    disabled={
                      composeSending || !composeTo.trim() || !composeSubject.trim() || !composeMessage.trim() || !serverMailEnv?.configured
                    }
                  >
                    <Mail className={`h-4 w-4 ${composeSending ? 'animate-pulse' : ''}`} />
                    {composeSending ? 'Gönderiliyor...' : 'Özel şablonla gönder'}
                  </Button>
                  {!serverMailEnv?.configured && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      E-posta sunucusu tanımlı değilken gönderim yapılamaz; önce SMTP veya Resend yapılandırın.
                    </p>
                  )}
                  {composeResult?.kind === 'success' && (
                    <Alert className="border-emerald-500/30 bg-emerald-500/5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <AlertTitle>Gönderim özeti</AlertTitle>
                      <AlertDescription className="space-y-1 text-muted-foreground">
                        <p>
                          <span className="font-medium text-foreground">Kanal:</span>{' '}
                          {composeResult.delivery.channel === 'smtp' ? 'SMTP' : 'Resend API'}
                        </p>
                        <p className="break-all">
                          <span className="font-medium text-foreground">Gönderen:</span>{' '}
                          {composeResult.delivery.effectiveFrom}
                        </p>
                        {composeResult.delivery.usedResendAfterSmtpFailure && (
                          <p className="text-amber-700 dark:text-amber-400">
                            SMTP girişi reddedildi; mesaj Resend ile iletildi.
                          </p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  {composeResult?.kind === 'error' && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Gönderilemedi</AlertTitle>
                      <AlertDescription className="break-words">{composeResult.message}</AlertDescription>
                    </Alert>
                  )}
                </div>
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

        <TabsContent value="modules">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card glass>
              <CardHeader>
                <CardTitle>Tüm Modül Kontrol Merkezi</CardTitle>
                <CardDescription>
                  Müşteri + bayi + admin tarafındaki tüm ana modülleri buradan açıp kapatabilirsiniz.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-sm">
                    <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={moduleSearch}
                      onChange={(e) => setModuleSearch(e.target.value)}
                      placeholder="Modül ara (bağış, davet, squads...)"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={moduleScope} onValueChange={(v) => setModuleScope(v as ModuleScope | 'all')}>
                      <SelectTrigger className="w-full min-w-0 sm:w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tüm scope</SelectItem>
                        <SelectItem value="customer">Müşteri</SelectItem>
                        <SelectItem value="dealer">Bayi</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="platform">Platform</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={loadModuleControls} disabled={moduleLoading}>
                      {moduleLoading ? 'Yükleniyor...' : 'Yenile'}
                    </Button>
                    <Button onClick={saveModuleControls} disabled={moduleSaving}>
                      {moduleSaving ? 'Kaydediliyor...' : 'Kaydet'}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 rounded-lg border p-3 bg-muted/30">
                  <Button size="sm" variant="outline" onClick={() => setScopeState('customer', true)}>Müşteri tümünü aç</Button>
                  <Button size="sm" variant="outline" onClick={() => setScopeState('dealer', true)}>Bayi tümünü aç</Button>
                  <Button size="sm" variant="outline" onClick={() => setScopeState('admin', true)}>Admin tümünü aç</Button>
                  <Button size="sm" variant="outline" onClick={() => setScopeState('platform', true)}>Platform tümünü aç</Button>
                  <Button size="sm" variant="destructive" onClick={() => setScopeState('customer', false)}>Müşteri tümünü kapat</Button>
                  <Button size="sm" variant="destructive" onClick={() => setScopeState('dealer', false)}>Bayi tümünü kapat</Button>
                </div>

                {filteredModules.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Filtreye uygun modül bulunamadı.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredModules.map((item) => {
                      const enabled = moduleControls[item.key] !== false;
                      return (
                        <div key={item.key} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-medium">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="px-2 py-0.5 rounded-full border">{item.scope}</span>
                              <span className="px-2 py-0.5 rounded-full border">{item.severity}</span>
                              <span className="px-2 py-0.5 rounded-full border font-mono">{item.key}</span>
                            </div>
                            {item.detailHref ? (
                              <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                                <Link href={item.detailHref}>
                                  Detay sayfasına git
                                  <ExternalLink className="h-3 w-3 ml-1" />
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              setModuleControls((prev) => ({ ...prev, [item.key]: checked }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="page-settings">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card glass>
              <CardHeader>
                <CardTitle>Bayi/Müşteri Sayfa Ayar Merkezi</CardTitle>
                <CardDescription>
                  Özellik ve menü görünürlüğünü role göre yönetin. Değişiklikler denetime loglanır.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border bg-muted/20 p-3 md:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rol seçimi</p>
                    <span className="text-[11px] text-muted-foreground">Responsive görünüm</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={visibilityRole === 'dealer' ? 'default' : 'outline'}
                        onClick={() => setVisibilityRole('dealer')}
                        className="w-full"
                      >
                        Bayi
                      </Button>
                      <Button
                        type="button"
                        variant={visibilityRole === 'customer' ? 'default' : 'outline'}
                        onClick={() => setVisibilityRole('customer')}
                        className="w-full"
                      >
                        Müşteri
                      </Button>
                    </div>
                    <Button variant="outline" onClick={loadVisibilitySettings} disabled={visibilityLoading} className="w-full sm:w-auto">
                      {visibilityLoading ? 'Yükleniyor...' : 'Yenile'}
                    </Button>
                    <Button onClick={saveVisibilitySettings} disabled={visibilitySaving} className="w-full sm:w-auto">
                      {visibilitySaving ? 'Kaydediliyor...' : 'Kaydet'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-3 md:p-4 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Toplu işlemler</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-background/80 p-2 grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRoleFeatureState(visibilityRole, true)}>
                        Özellik aç
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRoleFeatureState(visibilityRole, false)}>
                        Özellik kapat
                      </Button>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-2 grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRoleMenuState(visibilityRole, true)}>
                        Menü aç
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRoleMenuState(visibilityRole, false)}>
                        Menü kapat
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-xl border bg-card/60 p-3 md:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Özellik görünürlüğü</p>
                      <span className="text-[11px] px-2 py-1 rounded-full border text-muted-foreground">{visibilityRole}</span>
                    </div>
                    <div className="space-y-2">
                      {(visibilityCatalog?.features?.[visibilityRole] ?? []).map((item) => (
                        <div key={item.key} className="rounded-lg border bg-background/70 p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{item.label}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                            <p className="text-[11px] text-muted-foreground font-mono mt-1">{item.key}</p>
                          </div>
                          <Switch
                            checked={featureVisibility[visibilityRole]?.[item.key] !== false}
                            onCheckedChange={(checked) =>
                              setFeatureVisibility((prev) => ({
                                ...prev,
                                [visibilityRole]: { ...prev[visibilityRole], [item.key]: checked },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card/60 p-3 md:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Menü/sayfa görünürlüğü</p>
                      <span className="text-[11px] px-2 py-1 rounded-full border text-muted-foreground">{visibilityRole}</span>
                    </div>
                    <div className="space-y-2">
                      {(visibilityCatalog?.menu?.[visibilityRole] ?? []).map((item) => (
                        <div key={item.key} className="rounded-lg border bg-background/70 p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{item.label}</p>
                            <p className="text-[11px] text-muted-foreground font-mono truncate">{item.href}</p>
                          </div>
                          <Switch
                            checked={menuVisibility[visibilityRole]?.[item.key] !== false}
                            onCheckedChange={(checked) =>
                              setMenuVisibility((prev) => ({
                                ...prev,
                                [visibilityRole]: { ...prev[visibilityRole], [item.key]: checked },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-transparent to-primary/10 p-3 md:p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-semibold">Sistem özellik görünürlüğü (admin/platform)</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRoleFeatureState('system', true)}>
                        Tümünü aç
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRoleFeatureState('system', false)}>
                        Tümünü kapat
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(visibilityCatalog?.features?.system ?? []).map((item) => (
                      <div key={item.key} className="rounded-lg border bg-background/70 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{item.label}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                          <p className="text-[11px] text-muted-foreground font-mono mt-1">{item.key}</p>
                        </div>
                        <Switch
                          checked={featureVisibility.system?.[item.key] !== false}
                          onCheckedChange={(checked) =>
                            setFeatureVisibility((prev) => ({
                              ...prev,
                              system: { ...prev.system, [item.key]: checked },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
