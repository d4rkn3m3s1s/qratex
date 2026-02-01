'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Zap,
  Target,
  Star,
  ArrowRight,
  CheckCircle2,
  Clock,
  Shield,
  Rocket,
  Award,
  Activity,
  Eye,
  Users,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

// Circular Progress Component
const CircularProgress = ({ 
  value, 
  size = 140, 
  strokeWidth = 12,
  color = 'primary'
}: { 
  value: number; 
  size?: number; 
  strokeWidth?: number;
  color?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  const colorClasses: Record<string, string> = {
    emerald: 'stroke-emerald-500',
    green: 'stroke-green-500',
    yellow: 'stroke-yellow-500',
    orange: 'stroke-orange-500',
    red: 'stroke-red-500',
    violet: 'stroke-violet-500',
    primary: 'stroke-primary',
  };

  const getColor = (score: number) => {
    if (score >= 80) return 'emerald';
    if (score >= 60) return 'green';
    if (score >= 40) return 'yellow';
    if (score >= 20) return 'orange';
    return 'red';
  };

  const actualColor = color === 'auto' ? getColor(value) : color;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={colorClasses[actualColor] || 'stroke-primary'}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, type: 'spring' }}
          className="text-4xl font-bold"
        >
          {value}
        </motion.span>
        <span className="text-sm text-muted-foreground">Puan</span>
      </div>
    </div>
  );
};

// Animated Progress Bar
const AnimatedProgress = ({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => (
  <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${value}%` }}
      transition={{ duration: 1, delay, ease: 'easeOut' }}
      className={`h-full rounded-full ${color}`}
    />
  </div>
);

export default function DealerAIInsightsPage() {
  const [loading, setLoading] = useState(false);
  const [animateKey, setAnimateKey] = useState(0);
  
  const [insights] = useState({
    overallScore: 82,
    trend: 'up',
    trendValue: 5,
    summary: 'Genel müşteri memnuniyetiniz iyi seviyede. Hizmet kalitesi ve yemek lezzetiniz çok beğeniliyor. Ancak bekleme süreleri konusunda iyileştirme yapılabilir.',
    strengths: [
      { title: 'Hizmet Kalitesi', score: 92, description: 'Müşteriler personel ilgisinden çok memnun', icon: Users },
      { title: 'Yemek Lezzeti', score: 88, description: 'Lezzet ve porsiyon miktarı övülüyor', icon: Star },
      { title: 'Ambiyans', score: 85, description: 'Mekan atmosferi beğeniliyor', icon: Eye },
    ],
    weaknesses: [
      { title: 'Bekleme Süresi', score: 58, description: 'Yoğun saatlerde uzun bekleme şikayetleri', icon: Clock },
      { title: 'Fiyatlandırma', score: 65, description: 'Bazı müşteriler fiyatları yüksek buluyor', icon: Target },
    ],
    recommendations: [
      {
        priority: 'high',
        title: 'Bekleme Sürelerini Azaltın',
        description: 'Yoğun saatlerde ek personel görevlendirin veya rezervasyon sistemi kurun.',
        impact: 'Memnuniyette %15 artış potansiyeli',
        effort: 'Orta',
        icon: Clock,
      },
      {
        priority: 'medium',
        title: 'Sadakat Programı Başlatın',
        description: 'Sık gelen müşterilere özel indirimler sunarak fiyat algısını iyileştirin.',
        impact: 'Tekrar ziyaret oranında %20 artış',
        effort: 'Düşük',
        icon: Award,
      },
      {
        priority: 'low',
        title: 'Menü Çeşitliliğini Artırın',
        description: 'Vejetaryen ve vegan seçenekler ekleyin.',
        impact: 'Yeni müşteri kazanımı potansiyeli',
        effort: 'Yüksek',
        icon: Lightbulb,
      },
    ],
    alerts: [
      { type: 'warning', message: 'Son 7 günde 3 olumsuz yorum alındı', action: 'İncele' },
      { type: 'info', message: 'Cumartesi günleri en yoğun gününüz', action: 'Planla' },
      { type: 'success', message: 'Bu hafta %12 daha fazla olumlu yorum aldınız', action: null },
    ],
    predictedRating: 4.5,
    customerSentiment: {
      positive: 68,
      neutral: 22,
      negative: 10,
    },
    keyMetrics: [
      { label: 'Memnuniyet', value: 85, trend: 'up', change: 3 },
      { label: 'Sadakat', value: 72, trend: 'up', change: 5 },
      { label: 'Öneri Oranı', value: 78, trend: 'down', change: -2 },
    ],
  });

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setAnimateKey(prev => prev + 1);
      toast.success('AI içgörüleri güncellendi!');
    }, 2000);
  };

  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'high':
        return {
          color: 'text-red-500',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          label: 'Yüksek Öncelik',
          gradient: 'from-red-500 to-rose-600',
        };
      case 'medium':
        return {
          color: 'text-yellow-500',
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          label: 'Orta Öncelik',
          gradient: 'from-yellow-500 to-orange-500',
        };
      default:
        return {
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          label: 'Düşük Öncelik',
          gradient: 'from-emerald-500 to-teal-600',
        };
    }
  };

  const getAlertConfig = (type: string) => {
    switch (type) {
      case 'warning':
        return { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' };
      case 'success':
        return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
      default:
        return { icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
    }
  };

  return (
    <div className="space-y-6 pb-8" key={animateKey}>
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-black/20 rounded-full blur-3xl" />
          
          {/* Animated particles */}
          {[...Array(30)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/40 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{
                y: [0, -20, 0],
                opacity: [0.2, 1, 0.2],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
          ))}
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 mb-2"
              >
                <Brain className="w-6 h-6 text-white/80" />
                <span className="text-white/80 text-sm font-medium">Yapay Zeka Destekli</span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3"
              >
                <Sparkles className="w-8 h-8" />
                AI İçgörüler
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white/70 mt-1"
              >
                İşletmeniz için akıllı analiz ve kişiselleştirilmiş öneriler
              </motion.p>
            </div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-4"
            >
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-4">
                <CircularProgress value={insights.overallScore} size={100} strokeWidth={10} color="auto" />
                <div className="text-white">
                  <p className="text-white/60 text-sm">Genel Skor</p>
                  <div className="flex items-center gap-2">
                    {insights.trend === 'up' ? (
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                    <span className={`font-semibold ${insights.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                      +{insights.trendValue} bu ay
                    </span>
                  </div>
                </div>
              </div>
              <Button 
                onClick={handleRefresh} 
                disabled={loading}
                className="bg-white text-purple-600 hover:bg-white/90"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Yenileniyor...' : 'Yenile'}
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Alerts */}
      <div className="space-y-2">
        {insights.alerts.map((alert, index) => {
          const config = getAlertConfig(alert.type);
          const AlertIcon = config.icon;
          
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className={`border-0 ${config.bg}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <AlertIcon className={`h-5 w-5 ${config.color}`} />
                    </div>
                    <span className="font-medium">{alert.message}</span>
                  </div>
                  {alert.action && (
                    <Button variant="ghost" size="sm" className={config.color}>
                      {alert.action}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4">
        {insights.keyMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">{metric.label}</span>
                  <Badge className={metric.trend === 'up' ? 'bg-emerald-500/10 text-emerald-500 border-0' : 'bg-red-500/10 text-red-500 border-0'}>
                    {metric.trend === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {Math.abs(metric.change)}%
                  </Badge>
                </div>
                <p className="text-3xl font-bold mb-2">{metric.value}%</p>
                <AnimatedProgress 
                  value={metric.value} 
                  color={metric.value >= 70 ? 'bg-emerald-500' : metric.value >= 50 ? 'bg-yellow-500' : 'bg-red-500'} 
                  delay={0.3 + index * 0.1}
                />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Strengths */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-500">
                <ThumbsUp className="h-5 w-5" />
                Güçlü Yönler
              </CardTitle>
              <CardDescription>Müşterilerinizin en çok beğendiği özellikler</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.strengths.map((item, index) => {
                const ItemIcon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + index * 0.1 }}
                    className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <ItemIcon className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{item.title}</span>
                          <span className="text-emerald-500 font-bold">{item.score}/100</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                        <AnimatedProgress value={item.score} color="bg-emerald-500" delay={0.5 + index * 0.1} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        {/* Weaknesses */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-500">
                <ThumbsDown className="h-5 w-5" />
                İyileştirme Alanları
              </CardTitle>
              <CardDescription>Geliştirilmesi gereken noktalar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.weaknesses.map((item, index) => {
                const ItemIcon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + index * 0.1 }}
                    className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-yellow-500/10">
                        <ItemIcon className="h-5 w-5 text-yellow-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold">{item.title}</span>
                          <span className="text-yellow-500 font-bold">{item.score}/100</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                        <AnimatedProgress value={item.score} color="bg-yellow-500" delay={0.5 + index * 0.1} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* AI Recommendations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
                <Lightbulb className="h-5 w-5 text-white" />
              </div>
              AI Önerileri
            </CardTitle>
            <CardDescription>
              Yapay zeka tarafından oluşturulan kişiselleştirilmiş iyileştirme önerileri
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insights.recommendations.map((rec, index) => {
                const priorityConfig = getPriorityConfig(rec.priority);
                const RecIcon = rec.icon;
                
                return (
                  <motion.div
                    key={rec.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className={`p-5 rounded-xl border ${priorityConfig.border} ${priorityConfig.bg}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${priorityConfig.gradient} shrink-0`}>
                        <RecIcon className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="font-bold text-lg">{rec.title}</h4>
                          <Badge className={`${priorityConfig.bg} ${priorityConfig.color} ${priorityConfig.border} border`}>
                            {priorityConfig.label}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mb-3">{rec.description}</p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{rec.impact}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-blue-500" />
                            <span className="text-muted-foreground">Efor: {rec.effort}</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0">
                        Uygula
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Prediction */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <Card className="border-0 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <motion.div 
                  className="p-4 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600"
                  animate={{ 
                    boxShadow: ['0 0 20px rgba(139, 92, 246, 0.3)', '0 0 40px rgba(139, 92, 246, 0.5)', '0 0 20px rgba(139, 92, 246, 0.3)']
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Brain className="h-8 w-8 text-white" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-violet-500" />
                    AI Tahmin
                  </h3>
                  <p className="text-muted-foreground">
                    Önerileri uygularsanız, önümüzdeki 30 gün içinde puanınızın{' '}
                    <span className="text-emerald-500 font-bold text-xl">{insights.predictedRating}</span>'a 
                    çıkması bekleniyor.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.div
                    key={star}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.8 + star * 0.1 }}
                  >
                    <Star 
                      className={`h-8 w-8 ${star <= Math.floor(insights.predictedRating) ? 'text-yellow-500 fill-yellow-500' : star - 0.5 <= insights.predictedRating ? 'text-yellow-500 fill-yellow-500/50' : 'text-muted-foreground/30'}`} 
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
