'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Zap, Target, Calendar, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppT } from '@/lib/app-locale';

export default function GamificationSettingsPage() {
  const t = useAppT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/gamification/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
      }
        } catch (error) {
            toast.error(t('adminGamificationSettings.loadError'));
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/gamification/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(t('adminGamificationSettings.saveSuccess'));
                setSettings(data.settings);
            } else {
                toast.error(data.error || t('adminGamificationSettings.saveFailed'));
            }
        } catch (error) {
            toast.error(t('adminGamificationSettings.genericError'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('adminGamificationSettings.title')}</h1>
                    <p className="text-muted-foreground">{t('adminGamificationSettings.description')}</p>
                </div>
                <Button onClick={handleSave} disabled={saving} variant="gradient">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {t('adminGamificationSettings.save')}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Çarpanlar */}
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-primary" />
                            <CardTitle>{t('adminGamificationSettings.multipliers')}</CardTitle>
                        </div>
                        <CardDescription>{t('adminGamificationSettings.multipliersDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t('adminGamificationSettings.xpMultiplier')}</Label>
                            <Input 
                                type="number" 
                                step="0.1" 
                                value={settings.xpMultiplier} 
                                onChange={e => setSettings({...settings, xpMultiplier: parseFloat(e.target.value)})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('adminGamificationSettings.pointMultiplier')}</Label>
                            <Input 
                                type="number" 
                                step="0.1" 
                                value={settings.pointMultiplier} 
                                onChange={e => setSettings({...settings, pointMultiplier: parseFloat(e.target.value)})}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Limitler */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Target className="w-5 h-5 text-orange-500" />
                            <CardTitle>{t('adminGamificationSettings.limitsAndRewards')}</CardTitle>
                        </div>
                        <CardDescription>{t('adminGamificationSettings.limitsAndRewardsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t('adminGamificationSettings.dailyXpCap')}</Label>
                            <Input 
                                type="number" 
                                value={settings.dailyXpCap} 
                                onChange={e => setSettings({...settings, dailyXpCap: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('adminGamificationSettings.levelUpRewardBase')}</Label>
                            <Input 
                                type="number" 
                                value={settings.levelUpRewardBase} 
                                onChange={e => setSettings({...settings, levelUpRewardBase: parseInt(e.target.value)})}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Sezon Ayarları */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-emerald-500" />
                            <CardTitle>{t('adminGamificationSettings.seasonManagement')}</CardTitle>
                        </div>
                        <CardDescription>{t('adminGamificationSettings.seasonManagementDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>{t('adminGamificationSettings.seasonName')}</Label>
                                <Input 
                                    placeholder={t('adminGamificationSettings.seasonNamePlaceholder')}
                                    value={settings.seasonName || ''} 
                                    onChange={e => setSettings({...settings, seasonName: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('adminGamificationSettings.seasonEndsAt')}</Label>
                                <Input 
                                    type="datetime-local" 
                                    value={settings.seasonEndsAt ? new Date(settings.seasonEndsAt).toISOString().slice(0, 16) : ''} 
                                    onChange={e => setSettings({...settings, seasonEndsAt: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="flex items-start justify-between p-4 border rounded-lg bg-background/50">
                            <div className="space-y-0.5">
                                <Label className="text-base">{t('adminGamificationSettings.isSeasonActive')}</Label>
                                <p className="text-sm text-muted-foreground">{t('adminGamificationSettings.isSeasonActiveDesc')}</p>
                            </div>
                            <Switch 
                                checked={settings.isSeasonActive} 
                                onCheckedChange={c => setSettings({...settings, isSeasonActive: c})}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
