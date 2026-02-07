'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

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
      toast.error('Kampanyalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const activeNow = campaigns.filter(c => c.isActiveNow);
  const upcoming = campaigns.filter(c => !c.isActiveNow && c.isActive);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
        <p className="text-muted-foreground">Kampanyalar yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-4 sm:p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(10)].map((_, i) => (
            <motion.div key={i} className="absolute w-1 h-1 bg-white/30 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ y: [0, -15, 0], opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Megaphone className="w-8 h-8" /> Aktif Kampanyalar
          </h1>
          <p className="text-white/70 mt-1">İşletmelerin özel fırsatları ve puan çarpanları</p>
        </div>
      </motion.div>

      {/* Active Now */}
      {activeNow.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Şu An Aktif
          </h2>
          {activeNow.map((campaign, i) => (
            <motion.div key={campaign.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
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
                          {campaign.multiplier}x Puan
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
                        <span>{campaign.startTime} - {campaign.endTime}</span>
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
          {activeNow.length > 0 ? 'Yaklaşan Kampanyalar' : 'Tüm Kampanyalar'}
        </h2>
        {(activeNow.length > 0 ? upcoming : campaigns).length === 0 ? (
          <Card className="border-0 bg-card/50">
            <CardContent className="p-12 text-center">
              <Megaphone className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">Kampanya Bulunamadı</h3>
              <p className="text-muted-foreground">Şu an aktif kampanya bulunmuyor</p>
            </CardContent>
          </Card>
        ) : (
          (activeNow.length > 0 ? upcoming : campaigns).map((campaign, i) => (
            <motion.div key={campaign.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 bg-card/50 backdrop-blur-sm">
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
                        <span>{campaign.startTime} - {campaign.endTime}</span>
                        <span>•</span>
                        <span>{campaign.daysOfWeek.map(d => dayShort[d]).join(', ')}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
