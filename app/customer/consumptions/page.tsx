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
  QrCode,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatRelativeTime, formatCurrency } from '@/lib/utils';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { useAppT } from '@/lib/app-locale';

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
  const t = useAppT();
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
      <DashboardPageHero
        eyebrow={t('customerConsumptions.eyebrow')}
        title={t('customerConsumptions.title')}
        description={t('customerConsumptions.description')}
        icon={<History className="h-7 w-7" aria-hidden />}
        tone="auto"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: t('customerConsumptions.total'), value: stats.total, icon: History, iconBox: 'bg-primary/10', iconColor: 'text-primary' },
          { label: t('customerConsumptions.pendingReview'), value: stats.reviewPending, icon: Clock, iconBox: 'bg-amber-500/10', iconColor: 'text-amber-500' },
          { label: t('customerConsumptions.reviewed'), value: stats.reviewed, icon: CheckCircle2, iconBox: 'bg-emerald-500/10', iconColor: 'text-emerald-500' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-2.5 sm:p-4">
                <div className="flex flex-col items-center text-center gap-1 sm:flex-row sm:text-left sm:gap-3">
                  <div className={`rounded-lg p-1.5 sm:rounded-xl sm:p-2.5 ${stat.iconBox}`}>
                    <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.iconColor}`} />
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
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('customerConsumptions.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-3 w-full sm:w-auto">
                <TabsTrigger value="all">{t('customerConsumptions.tabAll')}</TabsTrigger>
                <TabsTrigger value="pending">{t('customerConsumptions.tabPending')}</TabsTrigger>
                <TabsTrigger value="reviewed">{t('customerConsumptions.tabReviewed')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Consumption List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="border-border/60 bg-card/50">
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
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
              <History className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{t('customerConsumptions.emptyTitle')}</h3>
            <p className="text-muted-foreground mb-6">
              {filter === 'pending'
                ? t('customerConsumptions.emptyPending')
                : filter === 'reviewed'
                  ? t('customerConsumptions.emptyReviewed')
                  : t('customerConsumptions.emptyAll')}
            </p>
            {filter === 'all' && (
              <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 w-full max-w-md mx-auto">
                <Button asChild variant="default" className="gap-2 w-full min-h-10 touch-manipulation sm:flex-1">
                  <Link href="/customer/scan">
                    <QrCode className="h-4 w-4" />
                    {t('customerConsumptions.scanQr')}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-2 w-full min-h-10 touch-manipulation sm:flex-1">
                  <Link href="/customer/my-card">
                    <CreditCard className="h-4 w-4" />
                    {t('customerConsumptions.myCard')}
                  </Link>
                </Button>
              </div>
            )}
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
                  <Card className="border-border/60 bg-card/50 backdrop-blur-sm hover:bg-card/70 transition-all cursor-pointer group">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-2 sm:gap-3 overflow-hidden">
                        {/* Dealer logo */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 sm:h-12 sm:w-12">
                          {consumption.dealer.businessLogo ? (
                            <img 
                              src={consumption.dealer.businessLogo} 
                              alt={consumption.dealer.businessName || ''} 
                              className="w-full h-full rounded-xl object-cover"
                            />
                          ) : (
                            <Store className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
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
                                  {t('customerConsumptions.reviewNow')}
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
