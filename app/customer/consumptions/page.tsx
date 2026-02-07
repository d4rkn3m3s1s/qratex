'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Star,
  MessageSquare,
  ChevronRight,
  Filter,
  Search,
  Store,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatRelativeTime, formatCurrency } from '@/lib/utils';

interface Consumption {
  id: string;
  amount: number | null;
  note: string | null;
  createdAt: string;
  dealer: {
    id: string;
    name: string;
    businessName: string | null;
    businessLogo: string | null;
    image: string | null;
  };
  product: {
    id: string;
    name: string;
    price: number | null;
    category: {
      id: string;
      name: string;
      icon: string;
    };
  } | null;
  review: {
    id: string;
    rating: number;
    text: string | null;
  } | null;
}

export default function CustomerConsumptionsPage() {
  const { data: session } = useSession();
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    reviewPending: 0,
    reviewed: 0,
  });

  useEffect(() => {
    fetchConsumptions();
  }, [filter]);

  const fetchConsumptions = async () => {
    try {
      setLoading(true);
      const hasReviewParam = filter === 'pending' ? 'false' : filter === 'reviewed' ? 'true' : '';
      const url = `/api/customer/consumptions${hasReviewParam ? `?hasReview=${hasReviewParam}` : ''}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setConsumptions(data.items);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching consumptions:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredConsumptions = consumptions.filter((c) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.dealer.businessName?.toLowerCase().includes(query) ||
      c.dealer.name.toLowerCase().includes(query) ||
      c.product?.name.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-4 sm:p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <History className="w-8 h-8" />
            Tüketim Geçmişim
          </h1>
          <p className="text-white/70 mt-1">Tüm tüketimlerinizi görüntüleyin ve yorum yapın</p>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Toplam', value: stats.total, icon: History, color: 'violet' },
          { label: 'Yorum Bekliyor', value: stats.reviewPending, icon: Clock, color: 'amber' },
          { label: 'Yorumlandı', value: stats.reviewed, icon: CheckCircle2, color: 'emerald' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex flex-col items-center text-center gap-1 sm:flex-row sm:text-left sm:gap-3">
                  <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-${stat.color}-500/10`}>
                    <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 text-${stat.color}-500`} />
                  </div>
                  <div>
                    <p className="text-base sm:text-2xl font-bold">{stat.value}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İşletme veya ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-3 w-full sm:w-auto">
                <TabsTrigger value="all">Tümü</TabsTrigger>
                <TabsTrigger value="pending">Bekleyen</TabsTrigger>
                <TabsTrigger value="reviewed">Yorumlanan</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Consumption List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="border-0 bg-card/50">
              <CardContent className="p-3 sm:p-6">
                <div className="animate-pulse space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-muted rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-1/4" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredConsumptions.length === 0 ? (
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
              <History className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Tüketim bulunamadı</h3>
            <p className="text-muted-foreground">
              {filter === 'pending' 
                ? 'Yorum bekleyen tüketim bulunmuyor' 
                : filter === 'reviewed'
                ? 'Henüz yorum yapılmış tüketim yok'
                : 'Henüz tüketim kaydınız yok'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {filteredConsumptions.map((consumption, index) => (
              <motion.div
                key={consumption.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/customer/consumptions/${consumption.id}`}>
                  <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card/70 transition-all cursor-pointer group">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-2 sm:gap-3 overflow-hidden">
                        {/* Dealer logo */}
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center shrink-0">
                          {consumption.dealer.businessLogo ? (
                            <img 
                              src={consumption.dealer.businessLogo} 
                              alt={consumption.dealer.businessName || ''} 
                              className="w-full h-full rounded-xl object-cover"
                            />
                          ) : (
                            <Store className="w-5 h-5 sm:w-6 sm:h-6 text-violet-500" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="font-semibold text-sm sm:text-base truncate">
                              {consumption.dealer.businessName || consumption.dealer.name}
                            </h3>
                            <div className="flex items-center gap-1 shrink-0">
                              {consumption.review ? (
                                <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30 text-[10px] sm:text-xs px-1.5 py-0">
                                  <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 fill-current" />
                                  {consumption.review.rating}
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px] sm:text-xs px-1.5 py-0">
                                  <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5" />
                                  Yorum Yap
                                </Badge>
                              )}
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                            {consumption.product && (
                              <>
                                <span>{consumption.product.category.icon}</span>
                                <span className="truncate">{consumption.product.name}</span>
                                <span>•</span>
                              </>
                            )}
                            <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                            <span className="whitespace-nowrap">{formatRelativeTime(consumption.createdAt)}</span>
                          </div>

                          {/* Amount & Review preview */}
                          <div className="flex items-center gap-2 mt-1">
                            {consumption.amount && (
                              <span className="text-xs sm:text-sm font-medium">
                                {formatCurrency(consumption.amount)}
                              </span>
                            )}
                            {consumption.review?.text && (
                              <p className="text-[10px] sm:text-xs text-muted-foreground truncate flex-1">
                                &quot;{consumption.review.text}&quot;
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
