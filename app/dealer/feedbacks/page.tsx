'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  MessageSquare,
  Search,
  Filter,
  Star,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Calendar,
  TrendingUp,
  TrendingDown,
  X,
  QrCode,
  Clock,
  Sparkles,
  Heart,
  Frown,
  Smile,
  Tag,
  ChevronDown,
  SlidersHorizontal,
  Eye,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { formatRelativeTime, getInitials } from '@/lib/utils';

interface Feedback {
  id: string;
  rating: number;
  text: string | null;
  sentiment: string | null;
  emotions: string[];
  topics: string[];
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  qrCode: {
    id: string;
    name: string;
    businessName: string;
  };
}

// Animated Counter
const AnimatedNumber = ({ value }: { value: number }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const stepValue = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return <span>{count}</span>;
};

export default function DealerFeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchFeedbacks();
  }, [ratingFilter]);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (ratingFilter !== 'all') params.append('rating', ratingFilter);
      
      const res = await fetch(`/api/feedbacks?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setFeedbacks(data.data);
      }
    } catch (error) {
      toast.error('Geri bildirimler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const filteredFeedbacks = feedbacks.filter((feedback) => {
    const matchesSearch = 
      feedback.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.qrCode.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.user?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSentiment = sentimentFilter === 'all' || feedback.sentiment === sentimentFilter;
    
    return matchesSearch && matchesSentiment;
  });

  const stats = {
    total: feedbacks.length,
    avgRating: feedbacks.length > 0 
      ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1)
      : '0',
    positive: feedbacks.filter((f) => f.sentiment === 'positive').length,
    negative: feedbacks.filter((f) => f.sentiment === 'negative').length,
    neutral: feedbacks.filter((f) => f.sentiment === 'neutral' || !f.sentiment).length,
  };

  const getSentimentConfig = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return {
          icon: Smile,
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          label: 'Olumlu',
          gradient: 'from-emerald-500 to-teal-500',
        };
      case 'negative':
        return {
          icon: Frown,
          color: 'text-red-500',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          label: 'Olumsuz',
          gradient: 'from-red-500 to-rose-500',
        };
      default:
        return {
          icon: Meh,
          color: 'text-gray-500',
          bg: 'bg-gray-500/10',
          border: 'border-gray-500/30',
          label: 'Nötr',
          gradient: 'from-gray-500 to-slate-500',
        };
    }
  };

  const renderStars = (rating: number, size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClass} ${
              star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white/20 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <MessageSquare className="w-8 h-8" />
                Geri Bildirimler
              </h1>
              <p className="text-white/70 mt-1">Müşterilerinizden gelen tüm yorumlar</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white">
                <span className="text-2xl font-bold">{stats.total}</span>
                <span className="text-white/70 text-sm ml-2">Toplam</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam', value: stats.total, icon: MessageSquare, color: 'violet', gradient: 'from-violet-500 to-purple-600' },
          { label: 'Ort. Puan', value: stats.avgRating, icon: Star, color: 'yellow', gradient: 'from-yellow-500 to-orange-500', suffix: '/5' },
          { label: 'Olumlu', value: stats.positive, icon: ThumbsUp, color: 'emerald', gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Olumsuz', value: stats.negative, icon: ThumbsDown, color: 'red', gradient: 'from-red-500 to-rose-600' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-${stat.color}-500/10`}>
                    <stat.icon className={`h-5 w-5 text-${stat.color}-500`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {typeof stat.value === 'number' ? <AnimatedNumber value={stat.value} /> : stat.value}
                      {stat.suffix && <span className="text-sm text-muted-foreground">{stat.suffix}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
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
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Yorum, QR kod veya kullanıcı ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background/50"
                />
              </div>
              <div className="flex gap-2">
                <Select value={ratingFilter} onValueChange={setRatingFilter}>
                  <SelectTrigger className="w-[140px] bg-background/50">
                    <Star className="h-4 w-4 mr-2 text-yellow-500" />
                    <SelectValue placeholder="Puan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Puanlar</SelectItem>
                    <SelectItem value="5">⭐ 5 Yıldız</SelectItem>
                    <SelectItem value="4">⭐ 4 Yıldız</SelectItem>
                    <SelectItem value="3">⭐ 3 Yıldız</SelectItem>
                    <SelectItem value="2">⭐ 2 Yıldız</SelectItem>
                    <SelectItem value="1">⭐ 1 Yıldız</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                  <SelectTrigger className="w-[140px] bg-background/50">
                    <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                    <SelectValue placeholder="Duygu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Duygular</SelectItem>
                    <SelectItem value="positive">😊 Olumlu</SelectItem>
                    <SelectItem value="neutral">😐 Nötr</SelectItem>
                    <SelectItem value="negative">😔 Olumsuz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Active Filters */}
            {(ratingFilter !== 'all' || sentimentFilter !== 'all' || searchQuery) && (
              <div className="flex flex-wrap gap-2">
                {ratingFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    {ratingFilter} Yıldız
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setRatingFilter('all')} />
                  </Badge>
                )}
                {sentimentFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    {sentimentFilter === 'positive' ? 'Olumlu' : sentimentFilter === 'negative' ? 'Olumsuz' : 'Nötr'}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setSentimentFilter('all')} />
                  </Badge>
                )}
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1">
                    "{searchQuery}"
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchQuery('')} />
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs"
                  onClick={() => { setRatingFilter('all'); setSentimentFilter('all'); setSearchQuery(''); }}
                >
                  Tümünü Temizle
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feedbacks List */}
      <div className="space-y-3">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i} className="border-0 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="animate-pulse flex gap-4">
                  <div className="h-12 w-12 bg-muted rounded-full" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-muted rounded w-1/4" />
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : filteredFeedbacks.length === 0 ? (
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-12 text-center">
              <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold mb-2">Geri bildirim bulunamadı</h3>
              <p className="text-muted-foreground">Arama kriterlerinize uygun geri bildirim yok</p>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence>
            {filteredFeedbacks.map((feedback, index) => {
              const sentimentConfig = getSentimentConfig(feedback.sentiment);
              const SentimentIcon = sentimentConfig.icon;
              
              return (
                <motion.div
                  key={feedback.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.03 }}
                  layout
                >
                  <Card 
                    className="border-0 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all cursor-pointer group"
                    onClick={() => setSelectedFeedback(feedback)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="relative">
                          <Avatar className="h-12 w-12 border-2 border-background">
                            <AvatarImage src={feedback.user?.image || ''} />
                            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                              {getInitials(feedback.user?.name || 'Anonim')}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`absolute -bottom-1 -right-1 p-1 rounded-full ${sentimentConfig.bg} border-2 border-background`}>
                            <SentimentIcon className={`h-3 w-3 ${sentimentConfig.color}`} />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{feedback.user?.name || 'Anonim'}</span>
                              <Badge variant="outline" className="text-xs gap-1">
                                <QrCode className="h-3 w-3" />
                                {feedback.qrCode.name}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3">
                              {renderStars(feedback.rating)}
                              <Badge className={`${sentimentConfig.bg} ${sentimentConfig.color} ${sentimentConfig.border} border`}>
                                {sentimentConfig.label}
                              </Badge>
                            </div>
                          </div>
                          
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {feedback.text || 'Yorum yapılmadı'}
                          </p>
                          
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {feedback.topics.slice(0, 3).map((topic) => (
                                <Badge key={topic} variant="secondary" className="text-xs gap-1">
                                  <Tag className="h-3 w-3" />
                                  {topic}
                                </Badge>
                              ))}
                              {feedback.topics.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{feedback.topics.length - 3}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(feedback.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Arrow */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="h-5 w-5 text-muted-foreground" />
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

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedFeedback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedFeedback(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="border-0 shadow-2xl overflow-hidden">
                {/* Header with gradient */}
                <div className={`relative p-6 bg-gradient-to-br ${getSentimentConfig(selectedFeedback.sentiment).gradient}`}>
                  <div className="absolute inset-0 overflow-hidden">
                    {[...Array(10)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 bg-white/20 rounded-full"
                        style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                        animate={{ opacity: [0.2, 0.8, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 2 }}
                      />
                    ))}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-white/20"
                    onClick={() => setSelectedFeedback(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  
                  <div className="relative flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-4 border-white/20">
                      <AvatarImage src={selectedFeedback.user?.image || ''} />
                      <AvatarFallback className="bg-white/20 text-white text-xl">
                        {getInitials(selectedFeedback.user?.name || 'Anonim')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-white">
                      <h3 className="text-xl font-bold">{selectedFeedback.user?.name || 'Anonim'}</h3>
                      <p className="text-white/70 text-sm">{selectedFeedback.user?.email || ''}</p>
                    </div>
                  </div>
                </div>

                <CardContent className="p-6 space-y-5">
                  {/* Rating & Sentiment */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {renderStars(selectedFeedback.rating, 'lg')}
                      <span className="text-2xl font-bold">{selectedFeedback.rating}/5</span>
                    </div>
                    <Badge className={`${getSentimentConfig(selectedFeedback.sentiment).bg} ${getSentimentConfig(selectedFeedback.sentiment).color} ${getSentimentConfig(selectedFeedback.sentiment).border} border text-sm px-3 py-1`}>
                      {getSentimentConfig(selectedFeedback.sentiment).label}
                    </Badge>
                  </div>

                  {/* QR Info */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <QrCode className="h-5 w-5 text-violet-500" />
                    <div>
                      <p className="font-medium">{selectedFeedback.qrCode.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedFeedback.qrCode.businessName}</p>
                    </div>
                  </div>

                  {/* Comment */}
                  <div className="p-4 rounded-xl bg-muted/30 border">
                    <p className="text-sm leading-relaxed">
                      {selectedFeedback.text || 'Yorum yapılmadı'}
                    </p>
                  </div>

                  {/* Emotions */}
                  {selectedFeedback.emotions.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Heart className="h-4 w-4 text-pink-500" />
                        Duygular
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedFeedback.emotions.map((e) => (
                          <Badge key={e} variant="outline" className="bg-pink-500/10 text-pink-500 border-pink-500/30">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Topics */}
                  {selectedFeedback.topics.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Tag className="h-4 w-4 text-blue-500" />
                        Konular
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedFeedback.topics.map((t) => (
                          <Badge key={t} variant="secondary">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                    <Clock className="h-4 w-4" />
                    {new Date(selectedFeedback.createdAt).toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
