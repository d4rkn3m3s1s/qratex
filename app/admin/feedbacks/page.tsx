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
  Eye,
  Trash2,
  Calendar,
  Building,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatDate, formatRelativeTime, getSentimentColor, getSentimentEmoji, getInitials } from '@/lib/utils';

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

const sentimentIcons = {
  positive: ThumbsUp,
  negative: ThumbsDown,
  neutral: Meh,
};

export default function AdminFeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchFeedbacks();
  }, [sentimentFilter]);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (sentimentFilter !== 'all') params.append('sentiment', sentimentFilter);
      
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
    feedback.qrCode.businessName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: feedbacks.length,
    positive: feedbacks.filter((f) => f.sentiment === 'positive').length,
    neutral: feedbacks.filter((f) => f.sentiment === 'neutral').length,
    negative: feedbacks.filter((f) => f.sentiment === 'negative').length,
    avgRating: feedbacks.length > 0 
      ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1)
      : '0',
  };

  const renderStars = (rating: number) => {
    return (
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
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Geri Bildirimler"
        description="Tüm müşteri geri bildirimlerini görüntüleyin"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                <ThumbsUp className="h-5 w-5 text-green-500" />
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
              <div className="p-2 rounded-lg bg-gray-500/10">
                <Meh className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.neutral}</p>
                <p className="text-xs text-muted-foreground">Nötr</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <ThumbsDown className="h-5 w-5 text-red-500" />
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
                placeholder="Metin veya işletme ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Duygu Filtrele" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="positive">Olumlu</SelectItem>
                <SelectItem value="neutral">Nötr</SelectItem>
                <SelectItem value="negative">Olumsuz</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Feedbacks List */}
      <div className="space-y-4">
        {loading ? (
          <Card glass>
            <CardContent className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto" />
              <p className="mt-4 text-muted-foreground">Yükleniyor...</p>
            </CardContent>
          </Card>
        ) : filteredFeedbacks.length === 0 ? (
          <Card glass>
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Geri bildirim bulunamadı</p>
            </CardContent>
          </Card>
        ) : (
          filteredFeedbacks.map((feedback, index) => {
            const SentimentIcon = sentimentIcons[feedback.sentiment as keyof typeof sentimentIcons] || Meh;
            return (
              <motion.div
                key={feedback.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card glass hover className="cursor-pointer" onClick={() => {
                  setSelectedFeedback(feedback);
                  setDetailDialogOpen(true);
                }}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      {/* User Info */}
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <Avatar>
                          <AvatarImage src={feedback.user?.image || ''} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(feedback.user?.name || feedback.user?.email || 'Anonim')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{feedback.user?.name || 'Anonim'}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            {feedback.qrCode.businessName}
                          </p>
                        </div>
                      </div>

                      {/* Feedback Content */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          {renderStars(feedback.rating)}
                          <Badge className={getSentimentColor(feedback.sentiment || 'neutral')}>
                            <SentimentIcon className="h-3 w-3 mr-1" />
                            {feedback.sentiment === 'positive' ? 'Olumlu' : 
                             feedback.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                          </Badge>
                        </div>
                        <p className="text-sm line-clamp-2">{feedback.text || 'Yorum yapılmadı'}</p>
                        {feedback.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {feedback.topics.slice(0, 3).map((topic) => (
                              <Badge key={topic} variant="outline" className="text-xs">
                                {topic}
                              </Badge>
                            ))}
                            {feedback.topics.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{feedback.topics.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Date & Actions */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {formatRelativeTime(feedback.createdAt)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Geri Bildirim Detayı</DialogTitle>
            <DialogDescription>
              {selectedFeedback?.qrCode.businessName} - {formatDate(selectedFeedback?.createdAt || '')}
            </DialogDescription>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              {/* User Info */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Avatar>
                  <AvatarImage src={selectedFeedback.user?.image || ''} />
                  <AvatarFallback>{getInitials(selectedFeedback.user?.name || 'Anonim')}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedFeedback.user?.name || 'Anonim'}</p>
                  <p className="text-sm text-muted-foreground">{selectedFeedback.user?.email || 'Email yok'}</p>
                </div>
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Puan</p>
                <div className="flex items-center gap-2">
                  {renderStars(selectedFeedback.rating)}
                  <span className="text-lg font-bold">{selectedFeedback.rating}/5</span>
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
                    {getSentimentEmoji(selectedFeedback.sentiment || 'neutral')} {selectedFeedback.sentiment}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Duygular</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedFeedback.emotions.map((emotion) => (
                      <Badge key={emotion} variant="outline">{emotion}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Topics */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Konular</p>
                <div className="flex flex-wrap gap-1">
                  {selectedFeedback.topics.map((topic) => (
                    <Badge key={topic} variant="secondary">{topic}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}




