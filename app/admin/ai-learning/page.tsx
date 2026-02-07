'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Database,
  RefreshCw,
  Loader2,
  Shield,
  Store,
  Clock,
  Hash,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Zap,
  FileText,
  Eye,
  Activity,
  Server,
  Cpu,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface LearningProfile {
  id: string;
  dealerId: string;
  version: number;
  status: string;
  profile: Record<string, unknown> | null;
  lastTrainedAt: string | null;
  trainingFeedbackCount: number;
  correctionsUsed: number;
  createdAt: string;
  updatedAt: string;
}

interface DealerLearningData {
  dealerId: string;
  dealerName: string;
  profile: LearningProfile | null;
  embeddingsCount: number;
  correctionsCount: number;
}

export default function AdminAILearningPage() {
  const [loading, setLoading] = useState(true);
  const [dealers, setDealers] = useState<DealerLearningData[]>([]);
  const [updatingDealer, setUpdatingDealer] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<DealerLearningData | null>(null);

  useEffect(() => {
    fetchLearningData();
  }, []);

  const fetchLearningData = async () => {
    try {
      // Tüm dealer'ları al
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      const dealerUsers = (usersData.users || []).filter((u: { role: string }) => u.role === 'DEALER');

      const results: DealerLearningData[] = [];
      for (const dealer of dealerUsers.slice(0, 50)) {
        try {
          const res = await fetch(`/api/ai/learning?dealerId=${dealer.id}`);
          const data = await res.json();
          results.push({
            dealerId: dealer.id,
            dealerName: dealer.businessName || dealer.name || 'İsimsiz',
            profile: data.profile || null,
            embeddingsCount: data.embeddingsCount || 0,
            correctionsCount: data.correctionsCount || 0,
          });
        } catch {
          results.push({
            dealerId: dealer.id,
            dealerName: dealer.businessName || dealer.name || 'İsimsiz',
            profile: null,
            embeddingsCount: 0,
            correctionsCount: 0,
          });
        }
      }

      setDealers(results);
    } catch (error) {
      console.error('Failed to fetch learning data:', error);
      toast.error('Öğrenme verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const triggerProfileUpdate = async (dealerId: string) => {
    setUpdatingDealer(dealerId);
    try {
      const res = await fetch('/api/ai/learning?action=update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealerId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Adaptif profil güncellendi!');
        await fetchLearningData();
      } else {
        toast.error(data.error || 'Güncelleme başarısız');
      }
    } catch {
      toast.error('Profil güncelleme hatası');
    } finally {
      setUpdatingDealer(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-muted-foreground">AI öğrenme verileri yükleniyor...</p>
      </div>
    );
  }

  const totalProfiles = dealers.filter(d => d.profile).length;
  const totalEmbeddings = dealers.reduce((acc, d) => acc + d.embeddingsCount, 0);
  const totalCorrections = dealers.reduce((acc, d) => acc + d.correctionsCount, 0);

  return (
    <div className="space-y-6 pb-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-4 sm:p-6 md:p-8"
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
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-white/80" />
              <span className="text-white/80 text-sm font-medium">Derin Öğrenme Yönetimi</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Brain className="w-8 h-8" /> AI Öğrenme Merkezi
            </h1>
            <p className="text-white/70 mt-1">Adaptif öğrenme profilleri, embeddings ve düzeltme yönetimi</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center">
              <span className="text-white/60 text-xs">Profil</span>
              <p className="text-2xl font-bold">{totalProfiles}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center">
              <span className="text-white/60 text-xs">Embedding</span>
              <p className="text-2xl font-bold">{totalEmbeddings}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-center">
              <span className="text-white/60 text-xs">Düzeltme</span>
              <p className="text-2xl font-bold">{totalCorrections}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Dealer', value: dealers.length, icon: Store, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Eğitilmiş Profil', value: totalProfiles, icon: Brain, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Embedding Vektörü', value: totalEmbeddings, icon: Database, color: 'text-violet-500', bg: 'bg-violet-500/10' },
          { label: 'AI Düzeltmesi', value: totalCorrections, icon: CheckCircle2, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <Card className="border-0 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <div className={`p-2 rounded-lg ${item.bg} w-fit mx-auto mb-2`}>
                    <Icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Dealer Learning Profiles */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-violet-500" /> Dealer Öğrenme Profilleri
            </CardTitle>
            <CardDescription>Her dealer için adaptif AI öğrenme durumu</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dealers.map((dealer, index) => (
                <motion.div
                  key={dealer.dealerId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + index * 0.03 }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${selectedDealer?.dealerId === dealer.dealerId ? 'bg-violet-500/5 border-violet-500/30' : 'bg-card hover:border-violet-500/20'}`}
                  onClick={() => setSelectedDealer(selectedDealer?.dealerId === dealer.dealerId ? null : dealer)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted/50">
                        <Store className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{dealer.dealerName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={dealer.profile ? 'default' : 'secondary'} className="text-xs">
                            {dealer.profile ? `v${dealer.profile.version}` : 'Profil yok'}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Database className="h-3 w-3" /> {dealer.embeddingsCount}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> {dealer.correctionsCount}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {dealer.profile?.status === 'ready' && (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-xs">Hazır</Badge>
                      )}
                      {dealer.profile?.status === 'training' && (
                        <Badge className="bg-yellow-500/10 text-yellow-500 border-0 text-xs">Eğitiliyor</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); triggerProfileUpdate(dealer.dealerId); }}
                        disabled={updatingDealer === dealer.dealerId}
                      >
                        {updatingDealer === dealer.dealerId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {selectedDealer?.dealerId === dealer.dealerId && dealer.profile && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Versiyon</p>
                          <p className="font-bold text-lg">{dealer.profile.version}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Eğitim Feedback</p>
                          <p className="font-bold text-lg">{dealer.profile.trainingFeedbackCount}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Düzeltme</p>
                          <p className="font-bold text-lg">{dealer.profile.correctionsUsed}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">Son Eğitim</p>
                          <p className="font-bold text-xs mt-1">
                            {dealer.profile.lastTrainedAt
                              ? new Date(dealer.profile.lastTrainedAt).toLocaleDateString('tr-TR')
                              : 'Hiç'}
                          </p>
                        </div>
                      </div>
                      {dealer.profile.profile && (
                        <div className="mt-3 p-3 rounded-lg bg-muted/20 text-xs">
                          <p className="font-medium mb-1">Profil Özeti:</p>
                          <pre className="whitespace-pre-wrap text-muted-foreground max-h-[200px] overflow-y-auto">
                            {JSON.stringify(dealer.profile.profile, null, 2).slice(0, 500)}
                          </pre>
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
