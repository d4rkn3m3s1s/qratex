'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatRelativeTime, getSentimentColor, getInitials } from '@/lib/utils';

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

export default function DealerFeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);

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

  const filteredFeedbacks = feedbacks.filter((feedback) =>
    feedback.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    feedback.qrCode.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: feedbacks.length,
    avgRating: feedbacks.length > 0 
      ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1)
      : '0',
    positive: feedbacks.filter((f) => f.sentiment === 'positive').length,
    negative: feedbacks.filter((f) => f.sentiment === 'negative').length,
  };

  const renderStars = (rating: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'
          }`}
        />
      ))}
    </div>
  );

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive': return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'negative': return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default: return <Meh className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Geri Bildirimler"
        description="Müşterilerinizden gelen tüm geri bildirimleri görüntüleyin"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Toplam</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgRating}</p>
                <p className="text-xs text-muted-foreground">Ort. Puan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.positive}</p>
                <p className="text-xs text-muted-foreground">Olumlu</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.negative}</p>
                <p className="text-xs text-muted-foreground">Olumsuz</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card glass>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Yorum veya QR kod ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Puan Filtrele" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="5">5 Yıldız</SelectItem>
                <SelectItem value="4">4 Yıldız</SelectItem>
                <SelectItem value="3">3 Yıldız</SelectItem>
                <SelectItem value="2">2 Yıldız</SelectItem>
                <SelectItem value="1">1 Yıldız</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Feedbacks */}
      <div className="space-y-4">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-4">
                <div className="animate-pulse flex gap-4">
                  <div className="h-10 w-10 bg-muted rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/4" />
                    <div className="h-3 bg-muted rounded w-3/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : filteredFeedbacks.length === 0 ? (
          <Card glass>
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Henüz geri bildirim yok</p>
            </CardContent>
          </Card>
        ) : (
          filteredFeedbacks.map((feedback, index) => (
            <motion.div
              key={feedback.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                glass 
                hover 
                className="cursor-pointer"
                onClick={() => setSelectedFeedback(feedback)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar>
                      <AvatarImage src={feedback.user?.image || ''} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(feedback.user?.name || 'Anonim')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{feedback.user?.name || 'Anonim'}</span>
                          <Badge variant="outline" className="text-xs">
                            {feedback.qrCode.name}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {renderStars(feedback.rating)}
                          {getSentimentIcon(feedback.sentiment)}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {feedback.text || 'Yorum yapılmadı'}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {feedback.topics.slice(0, 3).map((topic) => (
                          <Badge key={topic} variant="secondary" className="text-xs">
                            {topic}
                          </Badge>
                        ))}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatRelativeTime(feedback.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Geri Bildirim Detayı</DialogTitle>
            <DialogDescription>
              {selectedFeedback?.qrCode.name} - {selectedFeedback?.qrCode.businessName}
            </DialogDescription>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={selectedFeedback.user?.image || ''} />
                  <AvatarFallback>{getInitials(selectedFeedback.user?.name || 'A')}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedFeedback.user?.name || 'Anonim'}</p>
                  <p className="text-sm text-muted-foreground">{selectedFeedback.user?.email || ''}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {renderStars(selectedFeedback.rating)}
                <Badge className={getSentimentColor(selectedFeedback.sentiment || 'neutral')}>
                  {selectedFeedback.sentiment === 'positive' ? 'Olumlu' :
                   selectedFeedback.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                </Badge>
              </div>

              <div className="p-4 rounded-lg bg-muted/50">
                <p>{selectedFeedback.text || 'Yorum yapılmadı'}</p>
              </div>

              {selectedFeedback.emotions.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Duygular</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFeedback.emotions.map((e) => (
                      <Badge key={e} variant="outline">{e}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedFeedback.topics.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Konular</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFeedback.topics.map((t) => (
                      <Badge key={t} variant="secondary">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

