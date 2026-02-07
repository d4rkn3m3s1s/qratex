'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Copy,
  Share2,
  Gift,
  Star,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
  Trophy,
  Zap,
  Heart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { getInitials } from '@/lib/utils';

interface ReferralData {
  referralCode: string;
  referrals: {
    id: string;
    status: string;
    pointsEarned: number;
    bonusGiven: number;
    createdAt: string;
    completedAt: string | null;
    referred: {
      id: string;
      name: string | null;
      image: string | null;
      createdAt: string;
    };
  }[];
  referredBy: {
    referrer: { id: string; name: string | null; image: string | null };
  } | null;
  stats: {
    totalReferrals: number;
    completedReferrals: number;
    totalPointsEarned: number;
  };
}

export default function CustomerReferralPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferralData | null>(null);
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const res = await fetch('/api/referral');
      const result = await res.json();
      if (result.success) {
        setData(result);
      }
    } catch (error) {
      toast.error('Davet bilgileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    toast.success('Davet kodu kopyalandı!');
  };

  const shareCode = async () => {
    if (!data?.referralCode) return;
    const shareData = {
      title: 'QRATEX\'e Katıl!',
      text: `QRATEX'e katıl ve bonus puan kazan! Davet kodum: ${data.referralCode}`,
      url: `${window.location.origin}/auth/register?ref=${data.referralCode}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        copyCode();
      }
    } else {
      copyCode();
    }
  };

  const applyReferralCode = async () => {
    if (!applyCode.trim()) return;
    setApplying(true);
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: applyCode.trim() }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(result.message || 'Davet kodu uygulandı!');
        setApplyCode('');
        fetchReferralData();
      } else {
        toast.error(result.error || 'Kod uygulanamadı');
      }
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground">Davet bilgileri yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 p-4 sm:p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <motion.div key={i} className="absolute w-1 h-1 bg-white/30 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ y: [0, -15, 0], opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Heart className="w-8 h-8" /> Arkadaşını Davet Et
          </h1>
          <p className="text-white/70 mt-1">Arkadaşlarını davet et, birlikte puan kazanın!</p>
        </div>
      </motion.div>

      {/* Referral Code */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" /> Davet Kodun
            </CardTitle>
            <CardDescription>Bu kodu arkadaşlarınla paylaş, ikisi de puan kazanır!</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-1 w-full">
                <div className="relative">
                  <Input
                    value={data?.referralCode || ''}
                    readOnly
                    className="text-center text-2xl font-bold tracking-widest bg-muted/50 h-14"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={copyCode} variant="outline" size="lg">
                  <Copy className="h-4 w-4 mr-2" /> Kopyala
                </Button>
                <Button onClick={shareCode} size="lg" className="bg-gradient-to-r from-pink-500 to-rose-500 text-white">
                  <Share2 className="h-4 w-4 mr-2" /> Paylaş
                </Button>
              </div>
            </div>

            {/* Bonus Info */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-violet-500/10 text-center">
                <Gift className="h-6 w-6 text-violet-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-violet-500">1000</p>
                <p className="text-xs text-muted-foreground">Sana puan</p>
              </div>
              <div className="p-4 rounded-xl bg-pink-500/10 text-center">
                <Star className="h-6 w-6 text-pink-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-pink-500">500</p>
                <p className="text-xs text-muted-foreground">Arkadaşına puan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Apply Referral Code */}
      {!data?.referredBy && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-5 w-5 text-yellow-500" /> Davet Kodu Kullan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={applyCode}
                  onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                  placeholder="Davet kodunu gir..."
                  className="flex-1"
                />
                <Button onClick={applyReferralCode} disabled={applying || !applyCode.trim()}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Uygula'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Referred By */}
      {data?.referredBy && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-0 bg-emerald-500/5 border-emerald-500/20">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">{data.referredBy.referrer.name || 'Bir kullanıcı'}</span> tarafından davet edildiniz
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Davet Edilen', value: data?.stats.totalReferrals || 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Tamamlanan', value: data?.stats.completedReferrals || 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Kazanılan Puan', value: data?.stats.totalPointsEarned || 0, icon: Trophy, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Card className="border-0 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <div className={`p-2 rounded-lg ${stat.bg} w-fit mx-auto mb-2`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <p className="text-xl font-bold">{stat.value}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Referral List */}
      {data?.referrals && data.referrals.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-500" /> Davet Ettiklerim
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.referrals.map((ref, i) => (
                <motion.div key={ref.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={ref.referred.image || ''} />
                    <AvatarFallback className="bg-gradient-to-br from-pink-500 to-rose-600 text-white text-sm">
                      {getInitials(ref.referred.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{ref.referred.name || 'Kullanıcı'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ref.createdAt).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ref.status === 'COMPLETED' ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> +{ref.pointsEarned}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" /> Bekliyor
                      </Badge>
                    )}
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
