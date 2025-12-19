'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Brain,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

export default function DealerAIInsightsPage() {
  const [loading, setLoading] = useState(false);
  const [insights] = useState({
    overallScore: 82,
    trend: 'up',
    summary: 'Genel müşteri memnuniyetiniz iyi seviyede. Hizmet kalitesi ve yemek lezzetiniz çok beğeniliyor. Ancak bekleme süreleri konusunda iyileştirme yapılabilir.',
    strengths: [
      { title: 'Hizmet Kalitesi', score: 92, description: 'Müşteriler personel ilgisinden çok memnun' },
      { title: 'Yemek Lezzeti', score: 88, description: 'Lezzet ve porsiyon miktarı övülüyor' },
      { title: 'Ambiyans', score: 85, description: 'Mekan atmosferi beğeniliyor' },
    ],
    weaknesses: [
      { title: 'Bekleme Süresi', score: 58, description: 'Yoğun saatlerde uzun bekleme şikayetleri' },
      { title: 'Fiyatlandırma', score: 65, description: 'Bazı müşteriler fiyatları yüksek buluyor' },
    ],
    recommendations: [
      {
        priority: 'high',
        title: 'Bekleme Sürelerini Azaltın',
        description: 'Yoğun saatlerde ek personel görevlendirin veya rezervasyon sistemi kurun.',
        impact: 'Memnuniyette %15 artış potansiyeli',
      },
      {
        priority: 'medium',
        title: 'Sadakat Programı Başlatın',
        description: 'Sık gelen müşterilere özel indirimler sunarak fiyat algısını iyileştirin.',
        impact: 'Tekrar ziyaret oranında %20 artış',
      },
      {
        priority: 'low',
        title: 'Menü Çeşitliliğini Artırın',
        description: 'Vejetaryen ve vegan seçenekler ekleyin.',
        impact: 'Yeni müşteri kazanımı potansiyeli',
      },
    ],
    alerts: [
      { type: 'warning', message: 'Son 7 günde 3 olumsuz yorum alındı' },
      { type: 'info', message: 'Cumartesi günleri en yoğun gününüz' },
    ],
    predictedRating: 4.5,
    customerSentiment: {
      positive: 68,
      neutral: 22,
      negative: 10,
    },
  });

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success('AI içgörüleri güncellendi');
    }, 2000);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-green-500/10 text-green-500 border-green-500/20';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Yüksek';
      case 'medium': return 'Orta';
      default: return 'Düşük';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <DashboardHeader
          title="AI İçgörüler"
          description="Yapay zeka destekli işletme analizi ve öneriler"
        />
        <Button onClick={handleRefresh} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Overall Score */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card glass className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <CardContent className="p-6 relative">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">{insights.overallScore}</span>
                  </div>
                  <Sparkles className="absolute -top-1 -right-1 h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Genel Skor</h3>
                  <div className="flex items-center gap-1 text-green-500">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm">+5 son aydan</span>
                  </div>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-muted-foreground">{insights.summary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Alerts */}
      {insights.alerts.length > 0 && (
        <div className="space-y-2">
          {insights.alerts.map((alert, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card glass className={alert.type === 'warning' ? 'border-yellow-500/20' : 'border-blue-500/20'}>
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className={`h-5 w-5 ${alert.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}`} />
                  <span>{alert.message}</span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strengths */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card glass>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Güçlü Yönler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.strengths.map((item) => (
                <div key={item.title} className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-green-500">{item.score}/100</span>
                  </div>
                  <Progress value={item.score} className="h-2" indicatorClassName="bg-green-500" />
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Weaknesses */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card glass>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                İyileştirme Alanları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.weaknesses.map((item) => (
                <div key={item.title} className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-yellow-500">{item.score}/100</span>
                  </div>
                  <Progress value={item.score} className="h-2" indicatorClassName="bg-yellow-500" />
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recommendations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card glass>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              AI Önerileri
            </CardTitle>
            <CardDescription>
              Yapay zeka tarafından oluşturulan iyileştirme önerileri
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insights.recommendations.map((rec, index) => (
                <motion.div
                  key={rec.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="p-4 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{rec.title}</h4>
                        <Badge className={getPriorityColor(rec.priority)}>
                          {getPriorityLabel(rec.priority)} Öncelik
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                      <p className="text-sm text-green-500">
                        <TrendingUp className="h-4 w-4 inline mr-1" />
                        {rec.impact}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Prediction */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card glass>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">AI Tahmin</h3>
                <p className="text-muted-foreground">
                  Önerileri uygularsanız, önümüzdeki 30 gün içinde puanınızın{' '}
                  <span className="text-green-500 font-bold">{insights.predictedRating}</span>'a 
                  çıkması bekleniyor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}


