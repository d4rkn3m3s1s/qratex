'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  CheckCircle2,
  Search,
  Filter,
  Star,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Eye,
  Trash2,
  Calendar,
  Building,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckSquare,
  Square,
  AlertCircle,
  ShoppingBag,
  QrCode,
  User,
  SlidersHorizontal,
  X,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppT } from '@/lib/app-locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { formatDate, formatRelativeTime, getSentimentColor, getSentimentEmoji, getInitials } from '@/lib/utils';
import {
  exportToCSV,
  exportToPDF,
  feedbackCSVColumns,
  buildFeedbackListPDFContent,
  buildAnalyticsPDFContent,
  type FeedbackExportRow,
} from '@/lib/export-utils';

interface Feedback {
  id: string;
  rating: number;
  text: string | null;
  sentiment: string | null;
  emotions: string[];
  topics: string[];
  createdAt: string;
  type: 'qr' | 'consumption';
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  businessName?: string;
  dealerName?: string;
  dealerId?: string;
  productName?: string;
  dimensions?: any;
  qrCode?: {
    id: string;
    name: string;
    businessName: string;
  };
}

interface Stats {
  total: number;
  qrFeedbacks: number;
  consumptionReviews: number;
  avgRating: string;
  positive: number;
  neutral: number;
  negative: number;
  ratingDistribution: { [key: number]: number };
  nps?: number | null;
  npsTotal?: number;
  npsPromoters?: number;
  npsPassives?: number;
  npsDetractors?: number;
}

interface Dealer {
  id: string;
  name: string;
}

const sentimentIcons = {
  positive: ThumbsUp,
  negative: ThumbsDown,
  neutral: Meh,
};

export default function AdminFeedbacksPage() {
  const t = useAppT();
  const searchParams = useSearchParams();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const feedbacksFetchRef = useRef<AbortController | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [dealerFilter, setDealerFilter] = useState<string>('all');
  const [needsReview, setNeedsReview] = useState(false); // P2-27: intentScore < 0.7 manuel inceleme
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [minRating, setMinRating] = useState<string>('');
  const [maxRating, setMaxRating] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(searchQuery.trim()), 400);
    return () => clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    const q = searchParams?.get('search') ?? '';
    setSearchQuery(q);
    setSearchDebounced(q.trim());
  }, [searchParams]);

  const fetchFeedbacks = useCallback(async () => {
    feedbacksFetchRef.current?.abort();
    const ac = new AbortController();
    feedbacksFetchRef.current = ac;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());
      if (sentimentFilter !== 'all') params.append('sentiment', sentimentFilter);
      if (dealerFilter !== 'all') params.append('dealerId', dealerFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (minRating) params.append('minRating', minRating);
      if (maxRating) params.append('maxRating', maxRating);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (searchDebounced) params.append('search', searchDebounced);
      if (needsReview) params.append('needsReview', 'true');

      const res = await fetch(`/api/admin/feedbacks?${params}`, { signal: ac.signal });
      const data = await res.json();

      if (feedbacksFetchRef.current !== ac) return;
      if (data.success) {
        setFeedbacks(data.data);
        setStats(data.stats);
        setDealers(data.dealers || []);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (feedbacksFetchRef.current !== ac) return;
      toast.error('Geri bildirimler yüklenemedi');
    } finally {
      if (feedbacksFetchRef.current === ac) {
        feedbacksFetchRef.current = null;
        setLoading(false);
      }
    }
  }, [
    sentimentFilter,
    dealerFilter,
    typeFilter,
    minRating,
    maxRating,
    startDate,
    endDate,
    page,
    needsReview,
    searchDebounced,
  ]);

  useEffect(() => {
    void fetchFeedbacks();
    return () => {
      feedbacksFetchRef.current?.abort();
    };
  }, [fetchFeedbacks]);

  const handleSearch = () => {
    setPage(1);
    setSearchDebounced(searchQuery.trim());
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    
    try {
      // Group by type
      const qrIds = feedbacks.filter(f => f.type === 'qr' && selectedIds.includes(f.id)).map(f => f.id);
      const consumptionIds = feedbacks.filter(f => f.type === 'consumption' && selectedIds.includes(f.id)).map(f => f.id);
      
      const promises = [];
      if (qrIds.length > 0) {
        promises.push(fetch('/api/admin/feedbacks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedbackIds: qrIds, type: 'qr' }),
        }));
      }
      if (consumptionIds.length > 0) {
        promises.push(fetch('/api/admin/feedbacks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedbackIds: consumptionIds, type: 'consumption' }),
        }));
      }
      
      await Promise.all(promises);
      
      toast.success(`${selectedIds.length} geri bildirim silindi`);
      setSelectedIds([]);
      setDeleteDialogOpen(false);
      fetchFeedbacks();
    } catch (error) {
      toast.error('Silme işlemi başarısız');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === feedbacks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(feedbacks.map(f => f.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const clearFilters = () => {
    setSentimentFilter('all');
    setDealerFilter('all');
    setNeedsReview(false);
    setTypeFilter('all');
    setMinRating('');
    setMaxRating('');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSearchDebounced('');
    setPage(1);
  };

  const hasActiveFilters = sentimentFilter !== 'all' || dealerFilter !== 'all' || typeFilter !== 'all' || minRating || maxRating || startDate || endDate || searchQuery || needsReview;

  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((feedback) =>
      !searchQuery || 
      feedback.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.user?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [feedbacks, searchQuery]);

  const exportRows: FeedbackExportRow[] = filteredFeedbacks.map((f) => ({
    createdAt: formatDate(f.createdAt),
    userName: f.user?.name || f.user?.email || 'Anonim',
    rating: f.rating,
    text: f.text || '',
    sentiment: f.sentiment === 'positive' ? 'Olumlu' : f.sentiment === 'negative' ? 'Olumsuz' : 'Nötr',
    qrName: f.type === 'consumption' ? (f.productName || 'Ürün') : (f.businessName || f.qrCode?.name || 'QR'),
    dealerReply: (f as { dealerReply?: string }).dealerReply || '',
  }));

  const handleExportCSV = () => {
    const data = exportRows.map((r) => ({ ...r }));
    exportToCSV(data, 'geribildirimler', feedbackCSVColumns, {
      watermark: { userId: 'admin', timestamp: new Date().toISOString() },
    });
    toast.success('Excel (CSV) indirildi');
  };

  const handleExportPDF = () => {
    const tableContent = buildFeedbackListPDFContent(exportRows);
    const summaryContent = stats
      ? buildAnalyticsPDFContent({
          totalFeedbacks: stats.total,
          avgRating: stats.avgRating,
          sentimentBreakdown: { positive: stats.positive, neutral: stats.neutral, negative: stats.negative },
        })
      : '';
    const content = summaryContent + tableContent;
    exportToPDF('Geri Bildirimler Raporu', content, 'geribildirimler-raporu');
    toast.success('PDF indirildi');
  };

  const renderStars = (rating: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6 pb-8 px-1 sm:px-0">
      <AdminPremiumHero
        eyebrow="İçgörü"
        title="Geri bildirimler"
        description="Tüm müşteri geri bildirimlerini yönetin."
        icon={<MessageSquare className="text-white" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFeedbacks}
            className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Yenile
          </Button>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
          {[
            { title: 'Toplam', value: stats.total, icon: MessageSquare, color: 'bg-primary/10 text-primary' },
            { title: 'QR Yorum', value: stats.qrFeedbacks, icon: QrCode, color: 'bg-primary/10 text-primary' },
            { title: 'Tüketim Yorum', value: stats.consumptionReviews, icon: ShoppingBag, color: 'bg-orange-500/10 text-orange-500' },
            { title: 'Ort. Puan', value: stats.avgRating, icon: Star, color: 'bg-yellow-500/10 text-yellow-500' },
            ...(stats.npsTotal != null && stats.npsTotal > 0
              ? [{ title: 'NPS', value: `${stats.nps ?? 0}`, icon: BarChart3, color: 'bg-cyan-500/10 text-cyan-500' as const }]
              : []),
            { title: 'Olumlu', value: stats.positive, icon: ThumbsUp, color: 'bg-green-500/10 text-green-500' },
            { title: 'Nötr', value: stats.neutral, icon: Meh, color: 'bg-gray-500/10 text-gray-500' },
            { title: 'Olumsuz', value: stats.negative, icon: ThumbsDown, color: 'bg-red-500/10 text-red-500' },
          ].map((stat, i) => (
            <motion.div key={stat.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.05 }}>
              <Card className="border-border/60 bg-card/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${stat.color}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.title}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Rating Distribution */}
      {stats && (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1 flex items-center gap-2">
                {[5, 4, 3, 2, 1].map(rating => {
                  const count = stats.ratingDistribution[rating] || 0;
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={rating} className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-0.5">{rating}<Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /></span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <Progress value={percentage} className="h-1.5" indicatorClassName={rating >= 4 ? 'bg-green-500' : rating === 3 ? 'bg-yellow-500' : 'bg-red-500'} />
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-border/60 bg-card/50">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            {/* Search & Type */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Metin, kullanıcı veya işletme ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Tabs value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }} className="w-full sm:w-auto">
                <TabsList className="grid w-full grid-cols-3 h-auto min-h-11 gap-1 p-1">
                  <TabsTrigger value="all" className="text-[11px] sm:text-xs py-2.5 px-1.5">Tümü</TabsTrigger>
                  <TabsTrigger value="qr" className="text-[11px] sm:text-xs gap-1 py-2.5 px-1.5"><QrCode className="w-3 h-3 shrink-0" />QR</TabsTrigger>
                  <TabsTrigger value="consumption" className="text-[11px] sm:text-xs gap-1 py-2.5 px-1.5"><ShoppingBag className="w-3 h-3 shrink-0" />Tüketim</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Advanced Filters */}
            <div className="flex flex-wrap gap-3">
              <Select value={sentimentFilter} onValueChange={(v) => { setSentimentFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Duygu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Duygular</SelectItem>
                  <SelectItem value="positive">Olumlu</SelectItem>
                  <SelectItem value="neutral">Nötr</SelectItem>
                  <SelectItem value="negative">Olumsuz</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dealerFilter} onValueChange={(v) => { setDealerFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Building className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Bayi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Bayiler</SelectItem>
                  {dealers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <SlidersHorizontal className="w-4 h-4" />
                    Gelişmiş Filtreler
                    {hasActiveFilters && <Badge className="ml-1 h-5 w-5 p-0 justify-center">!</Badge>}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Gelişmiş Filtreler</SheetTitle>
                    <SheetDescription>Geri bildirimleri detaylı filtreleyin</SheetDescription>
                  </SheetHeader>
                  <div className="space-y-6 mt-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Puan Aralığı</label>
                      <div className="flex items-center gap-2">
                        <Select value={minRating || 'any'} onValueChange={(v) => setMinRating(v === 'any' ? '' : v)}>
                          <SelectTrigger><SelectValue placeholder="Min" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Hepsi</SelectItem>
                            {[1,2,3,4,5].map(r => <SelectItem key={r} value={r.toString()}>{r} ⭐</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <span>-</span>
                        <Select value={maxRating || 'any'} onValueChange={(v) => setMaxRating(v === 'any' ? '' : v)}>
                          <SelectTrigger><SelectValue placeholder="Max" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Hepsi</SelectItem>
                            {[1,2,3,4,5].map(r => <SelectItem key={r} value={r.toString()}>{r} ⭐</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tarih Aralığı</label>
                      <div className="flex flex-col gap-2">
                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 space-y-0">
                      <Checkbox
                        id="needsReview"
                        checked={needsReview}
                        onCheckedChange={(c) => { setNeedsReview(!!c); setPage(1); }}
                      />
                      <label htmlFor="needsReview" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        Manuel İnceleme (düşük AI güveni &lt;%70)
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setPage(1);
                          setSearchDebounced(searchQuery.trim());
                        }}
                        className="flex-1"
                      >
                        Uygula
                      </Button>
                      <Button variant="outline" onClick={clearFilters}>Temizle</Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                  <X className="w-4 h-4" />
                  Filtreleri Temizle
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 ml-auto">
                    <Download className="w-4 h-4" />
                    Dışa aktar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCSV} disabled={filteredFeedbacks.length === 0}>
                    Excel (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF} disabled={filteredFeedbacks.length === 0}>
                    PDF indir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-0 bg-primary/5 border-primary/20">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox checked={selectedIds.length === feedbacks.length} onCheckedChange={toggleSelectAll} />
                <span className="text-sm font-medium">{selectedIds.length} seçildi</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Sil
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Feedbacks List */}
      <div className="space-y-3">
        {loading ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="p-12 text-center">
              <InlineLoadingStatus spinnerClassName="text-primary" description={t('adminInlineLoading.feedbacks')} />
            </CardContent>
          </Card>
        ) : filteredFeedbacks.length === 0 ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="p-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground">Geri bildirim bulunamadı</p>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredFeedbacks.map((feedback, index) => {
              const SentimentIcon = sentimentIcons[feedback.sentiment as keyof typeof sentimentIcons] || Meh;
              const isSelected = selectedIds.includes(feedback.id);
              
              return (
                <motion.div
                  key={feedback.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: Math.min(index, 10) * 0.03 }}
                >
                  <Card className={`border-border/60 bg-card/50 hover:bg-card/80 transition-colors ${isSelected ? 'ring-2 ring-primary' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Checkbox */}
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(feedback.id)} className="mt-1" />
                        
                        {/* User Info */}
                        <div className="flex items-center gap-3 min-w-0 sm:min-w-[180px]">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={feedback.user?.image || ''} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {getInitials(feedback.user?.name || feedback.user?.email || 'Anonim')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{feedback.user?.name || 'Anonim'}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              {feedback.type === 'consumption' ? (
                                <><ShoppingBag className="h-3 w-3" />{feedback.productName || 'Ürün'}</>
                              ) : (
                                <><Building className="h-3 w-3" />{feedback.businessName || 'İşletme'}</>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {renderStars(feedback.rating)}
                            <Badge className={getSentimentColor(feedback.sentiment || 'neutral')}>
                              <SentimentIcon className="h-3 w-3 mr-1" />
                              {feedback.sentiment === 'positive' ? 'Olumlu' : feedback.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {feedback.type === 'consumption' ? 'Tüketim' : 'QR'}
                            </Badge>
                            {(feedback as any).dealerReply && (
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> İşletme Yanıtladı
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm line-clamp-2">{feedback.text || 'Yorum yapılmadı'}</p>
                          {(feedback as any).dealerReply && (
                            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-0.5">İşletme Yanıtı:</p>
                              <p className="text-xs line-clamp-2">{(feedback as any).dealerReply}</p>
                            </div>
                          )}
                          {feedback.topics && feedback.topics.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {feedback.topics.slice(0, 3).map((topic) => (
                                <Badge key={topic} variant="secondary" className="text-xs">{topic}</Badge>
                              ))}
                              {feedback.topics.length > 3 && <Badge variant="secondary" className="text-xs">+{feedback.topics.length - 3}</Badge>}
                            </div>
                          )}
                        </div>

                        {/* Date & Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground hidden sm:block">{formatRelativeTime(feedback.createdAt)}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedFeedback(feedback); setDetailDialogOpen(true); }}>
                                <Eye className="w-4 h-4 mr-2" />Detay Gör
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedIds([feedback.id]); setDeleteDialogOpen(true); }}>
                                <Trash2 className="w-4 h-4 mr-2" />Sil
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Toplam {total} sonuçtan {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)} gösteriliyor
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Geri Bildirim Detayı</DialogTitle>
            <DialogDescription>
              {selectedFeedback?.type === 'consumption' ? 'Tüketim Yorumu' : 'QR Geri Bildirimi'} - {formatDate(selectedFeedback?.createdAt || '')}
            </DialogDescription>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              {/* User Info */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedFeedback.user?.image || ''} />
                  <AvatarFallback className="text-lg">{getInitials(selectedFeedback.user?.name || 'Anonim')}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedFeedback.user?.name || 'Anonim'}</p>
                  <p className="text-sm text-muted-foreground">{selectedFeedback.user?.email || 'Email yok'}</p>
                </div>
                <Badge variant="outline" className="ml-auto">
                  {selectedFeedback.type === 'consumption' ? <ShoppingBag className="w-3 h-3 mr-1" /> : <QrCode className="w-3 h-3 mr-1" />}
                  {selectedFeedback.type === 'consumption' ? 'Tüketim' : 'QR'}
                </Badge>
              </div>

              {/* Business/Product Info */}
              <div className="p-4 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Building className="w-4 h-4" />
                  {selectedFeedback.businessName}
                </div>
                {selectedFeedback.productName && (
                  <div className="flex items-center gap-2 text-sm">
                    <ShoppingBag className="w-4 h-4" />
                    {selectedFeedback.productName}
                  </div>
                )}
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Puan</p>
                <div className="flex items-center gap-2">
                  {renderStars(selectedFeedback.rating)}
                  <span className="text-xl font-bold">{selectedFeedback.rating}/5</span>
                </div>
              </div>

              {/* Text */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Yorum</p>
                <p className="p-4 rounded-lg bg-muted/50">{selectedFeedback.text || 'Yorum yapılmadı'}</p>
              </div>

              {/* Sentiment & Emotions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Duygu Analizi</p>
                  <Badge className={getSentimentColor(selectedFeedback.sentiment || 'neutral')}>
                    {getSentimentEmoji(selectedFeedback.sentiment || 'neutral')} {selectedFeedback.sentiment || 'Belirsiz'}
                  </Badge>
                </div>
                {selectedFeedback.emotions && selectedFeedback.emotions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Duygular</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedFeedback.emotions.map((emotion) => (
                        <Badge key={emotion} variant="outline">{emotion}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Topics */}
              {selectedFeedback.topics && selectedFeedback.topics.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Konular</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFeedback.topics.map((topic) => (
                      <Badge key={topic} variant="secondary">{topic}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Dimensions (for consumption reviews) */}
              {selectedFeedback.dimensions && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Detaylı Değerlendirme</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selectedFeedback.dimensions).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between p-2 rounded bg-muted/30">
                        <span className="text-sm capitalize">{key}</span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Silme Onayı
            </DialogTitle>
            <DialogDescription>
              {selectedIds.length} geri bildirimi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>İptal</Button>
            <Button variant="destructive" onClick={handleDelete}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
