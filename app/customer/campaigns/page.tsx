'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Megaphone,
  Clock,
  Zap,
  Star,
  Loader2,
  Timer,
  Store,
  Sparkles,
  CalendarDays,
  Heart,
  Share2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { useAppT } from '@/lib/app-locale';
interface Campaign {
  id: string;
  name: string;
  description: string | null;
  multiplier: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isActive: boolean;
  isActiveNow?: boolean;
  dealer?: { id: string; businessName: string | null; image: string | null };
}

const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dayShort = ['Pzr', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export default function CustomerCampaignsPage() {
  const t = useAppT();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/happy-hour');
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.happyHours || []);
      }
    } catch {
      toast.error(t('customerCampaigns.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const activeNow = campaigns.filter(c => c.isActiveNow);
  const upcoming = campaigns.filter(c => !c.isActiveNow && c.isActive);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
        <p className="text-muted-foreground">{t('customerCampaigns.loading')}</p>
      </div>
    );
  }

    return (
      <div className="space-y-6 pb-8">
        <DashboardPageHero
          eyebrow={t('customerCampaigns.eyebrow')}
          title={<>{t('customerCampaigns.title')}</>}
          description={t('customerCampaigns.description')}
          icon={<Megaphone className="h-7 w-7" aria-hidden />}
          tone="auto"
        />

        {/* Active Now */}
        {activeNow.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-balance">
              <Zap className="h-5 w-5 shrink-0 text-yellow-500" />
              {t('customerCampaigns.activeNow')}
            </h2>
            {activeNow.map((campaign, i) => (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 overflow-hidden">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 shrink-0">
                        <Zap className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-lg">{campaign.name}</h3>
                          <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 animate-pulse">
                            {campaign.multiplier}x {t('customerCampaigns.points')}
                          </Badge>
                        </div>
                        {campaign.dealer?.businessName && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                            <Store className="h-3 w-3" /> {campaign.dealer.businessName}
                          </p>
                        )}
                        {campaign.description && <p className="text-sm mb-2">{campaign.description}</p>}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>
                            {campaign.startTime} - {campaign.endTime}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Upcoming / All Active */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-500" />
            {activeNow.length > 0 ? t('customerCampaigns.upcoming') : t('customerCampaigns.allCampaigns')}
          </h2>
          {(activeNow.length > 0 ? upcoming : campaigns).length === 0 ? (
            <Card className="border-border/60 bg-card/50">
              <CardContent className="p-12 text-center">
                <Megaphone className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">{t('customerCampaigns.notFoundTitle')}</h3>
                <p className="text-muted-foreground">{t('customerCampaigns.notFoundDescription')}</p>
              </CardContent>
            </Card>
          ) : (
            (activeNow.length > 0 ? upcoming : campaigns).map((campaign, i) => (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-orange-500/10 shrink-0">
                        <Megaphone className="h-5 w-5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{campaign.name}</h3>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {campaign.multiplier}x
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {campaign.startTime} - {campaign.endTime}
                          </span>
                          <span>•</span>
                          <span>{campaign.daysOfWeek.map((d) => dayShort[d]).join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        {/* Invite & Earn - Davet Et entegrasyonu */}
        <div className="space-y-3 pt-4 border-t border-border/60">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            {t('customerCampaigns.inviteTitle')}
          </h2>
          <Card className="border-0 bg-gradient-to-r from-primary/10 via-violet-500/5 to-primary/10 backdrop-blur-sm">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center sm:items-stretch gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">
                  {t('customerCampaigns.inviteDescription')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('customerCampaigns.inviteSubDescription')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href="/customer/referral">
                    <Share2 className="w-4 h-4" />
                    {t('customerCampaigns.inviteCta')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
}
