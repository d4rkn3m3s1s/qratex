'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import {
  PieChart,
  Users,
  Crown,
  Heart,
  Zap,
  Sparkles,
  AlertTriangle,
  Moon,
  Loader2,
  Shield,
  Star,
  Trophy,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/lib/admin-toast';
import { getInitials } from '@/lib/utils';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

interface SegmentData {
  id: string;
  name: string;
  color: string;
  icon: string;
  count: number;
  customers: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    points: number;
    level: number;
    feedbackCount: number;
    badgeCount: number;
  }[];
}

const segmentIcons: Record<string, typeof Users> = {
  vip: Crown,
  loyal: Heart,
  active: Zap,
  new: Sparkles,
  risk: AlertTriangle,
  passive: Moon,
};

const segmentColors: Record<string, string> = {
  amber: 'from-amber-500 to-orange-500',
  emerald: 'from-emerald-500 to-teal-500',
  blue: 'from-blue-500 to-cyan-500',
  violet: 'from-primary to-primary/80',
  red: 'from-red-500 to-red-700',
  gray: 'from-gray-500 to-slate-500',
};

const segmentBg: Record<string, string> = {
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  violet: 'border-primary/30 bg-primary/10 text-primary',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30',
};

const ringByColor: Record<string, string> = {
  amber: 'ring-2 ring-amber-500 shadow-lg',
  emerald: 'ring-2 ring-emerald-500 shadow-lg',
  blue: 'ring-2 ring-blue-500 shadow-lg',
  violet: 'ring-2 ring-primary shadow-lg',
  red: 'ring-2 ring-red-500 shadow-lg',
  gray: 'ring-2 ring-gray-500 shadow-lg',
};

export default function AdminSegmentsPage() {
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);

  const { data, isLoading: loading, refetch } = useQuery<{ success: boolean; segments: SegmentData[]; totalCustomers: number }>({
    queryKey: ['admin', 'segments'],
    queryFn: async () => {
      const res = await fetch('/api/admin/segments');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Segment verileri alınamadı');
      return json;
    },
    staleTime: 60_000,
  });

  const segments = data?.segments ?? [];
  const totalCustomers = data?.totalCustomers ?? 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Müşteri segmentleri analiz ediliyor...</p>
      </div>
    );
  }

  const selected = segments.find(s => s.id === selectedSegment);

  return (
    <div className="space-y-6 pb-8">
      <AdminPremiumHero
        eyebrow="Müşteri zekası"
        title={
          <span className="flex items-center gap-3">
            <PieChart className="w-8 h-8 shrink-0" /> Müşteri Segmentasyonu
          </span>
        }
        description="AI destekli otomatik müşteri segmentasyonu ve analizi"
        icon={<Shield className="text-white" />}
        actions={
          <Button
            onClick={() => refetch()}
            className="bg-white text-emerald-900 hover:bg-white/90 shadow-md"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Yenile
          </Button>
        }
        aside={
          <div className="rounded-xl px-4 py-2 text-center border backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/20 dark:text-white">
            <span className="text-xs text-muted-foreground dark:text-white/70">Toplam müşteri</span>
            <p className="text-2xl font-bold tabular-nums">{totalCustomers}</p>
          </div>
        }
      />

      {/* Segment Cards */}
      {segments.length === 0 ? (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            Henüz segment yok veya veriler yüklenemedi.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {segments.map((seg, i) => {
            const Icon = segmentIcons[seg.id] || Users;
            const isSelected = selectedSegment === seg.id;
            return (
              <Motion.div key={seg.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.05 }}>
                <Card
                  className={`border-0 cursor-pointer transition-all hover:scale-105 ${isSelected ? (ringByColor[seg.color] || 'ring-2 ring-primary shadow-lg') : 'bg-card/50'}`}
                  onClick={() => setSelectedSegment(isSelected ? null : seg.id)}
                >
                  <CardContent className="p-4 text-center">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${segmentColors[seg.color]} w-fit mx-auto mb-2`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-xs text-muted-foreground">{seg.icon} {seg.name}</p>
                    <p className="text-2xl font-bold">{seg.count}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {totalCustomers > 0 ? Math.round((seg.count / totalCustomers) * 100) : 0}%
                    </p>
                  </CardContent>
                </Card>
              </Motion.div>
            );
          })}
        </div>
      )}

      {/* Distribution Bar */}
      <Card className="border-border/60 bg-card/50">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Segment Dağılımı</p>
          <div className="h-4 rounded-full overflow-hidden flex">
            {segments.map(seg => {
              const pct = totalCustomers > 0 ? (seg.count / totalCustomers) * 100 : 0;
              return (
                <Motion.div key={seg.id} initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8 }}
                  className={`bg-gradient-to-r ${segmentColors[seg.color]} cursor-pointer`}
                  title={`${seg.name}: ${seg.count} (${pct.toFixed(0)}%)`}
                  onClick={() => setSelectedSegment(seg.id)}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {segments.map(seg => (
              <div key={seg.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${segmentColors[seg.color]}`} />
                {seg.name} ({seg.count})
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected Segment Detail */}
      {selected && (
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-xl">{selected.icon}</span>
                {selected.name} Segment ({selected.count} müşteri)
              </CardTitle>
              <CardDescription>
                {selected.id === 'vip' && 'Yüksek seviye, çok feedback ve rozet sahibi müşteriler'}
                {selected.id === 'loyal' && 'Düzenli feedback veren sadık müşteriler'}
                {selected.id === 'active' && 'Son dönemde aktif olan müşteriler'}
                {selected.id === 'new' && 'Son 7 günde katılan yeni müşteriler'}
                {selected.id === 'risk' && 'Eskiden aktif ama son dönemde sessiz kalan müşteriler'}
                {selected.id === 'passive' && 'Uzun süredir aktif olmayan müşteriler'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected.customers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Bu segmentte müşteri yok</p>
              ) : (
                <div className="space-y-2">
                  {selected.customers.map((customer, i) => (
                    <Motion.div key={customer.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={customer.image || ''} />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-xs text-primary-foreground">
                          {getInitials(customer.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{customer.name || 'İsimsiz'}</p>
                        <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">Lv.{customer.level}</Badge>
                        <Badge className={`text-xs ${segmentBg[selected.color]}`}>
                          <Star className="h-2.5 w-2.5 mr-0.5" />{customer.points}
                        </Badge>
                      </div>
                    </Motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Motion.div>
      )}
    </div>
  );
}
