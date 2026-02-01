'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import {
  CreditCard,
  History,
  Star,
  Calendar,
  Store,
  ArrowRight,
  Loader2,
  QrCode,
  Sparkles,
  CheckCircle2,
  Copy,
  Share2,
  Eye,
  EyeOff,
  ExternalLink,
  Smartphone,
  Download,
  Crown,
  Shield,
  Zap,
  Wifi,
  Fingerprint,
  Award,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDate, formatRelativeTime, getCardStatusLabel, getCardStatusColor } from '@/lib/utils';

// QR Code domain - production URL
const QR_DOMAIN = 'https://demoqratex.vercel.app';

interface UserCard {
  id: string;
  token: string;
  status: string;
  activatedAt: string | null;
  _count: {
    consumptions: number;
  };
  consumptions: {
    id: string;
    createdAt: string;
    dealer: {
      id: string;
      businessName: string | null;
    };
    product: {
      id: string;
      name: string;
    } | null;
  }[];
}

export default function CustomerMyCardPage() {
  const { data: session } = useSession();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCards: 0,
    totalConsumptions: 0,
    reviewPending: 0,
  });
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const [showToken, setShowToken] = useState<{ [key: string]: boolean }>({});
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customer/cards');
      const data = await res.json();

      if (data.success) {
        setCards(data.cards);
        setStats(data.stats);
        
        // Generate QR codes for each card - REAL URLs
        const qrPromises = data.cards.map(async (card: UserCard) => {
          const url = `${QR_DOMAIN}/c/${card.token}`;
          const qrDataUrl = await QRCode.toDataURL(url, {
            width: 400,
            margin: 2,
            color: {
              dark: '#1a1a2e',
              light: '#ffffff',
            },
            errorCorrectionLevel: 'H',
          });
          return { token: card.token, qrDataUrl };
        });
        
        const qrResults = await Promise.all(qrPromises);
        const qrMap: { [key: string]: string } = {};
        qrResults.forEach((result) => {
          qrMap[result.token] = result.qrDataUrl;
        });
        setQrCodes(qrMap);
      }
    } catch (err) {
      console.error('Error fetching cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, cardId: string) => {
    const cardRef = cardRefs.current[cardId];
    if (!cardRef) return;
    const rect = cardRef.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePosition({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePosition({ x: 0.5, y: 0.5 });
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success('Kart ID kopyalandı!');
  };

  const copyUrl = (token: string) => {
    const url = `${QR_DOMAIN}/c/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Kart URL kopyalandı!');
  };

  const shareCard = async (token: string) => {
    const url = `${QR_DOMAIN}/c/${token}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'QRateX Kartım',
          text: 'QRateX dijital kartımı inceleyin!',
          url,
        });
      } catch (err) {
        copyUrl(token);
      }
    } else {
      copyUrl(token);
    }
  };

  const toggleShowToken = (cardId: string) => {
    setShowToken(prev => ({
      ...prev,
      [cardId]: !prev[cardId],
    }));
  };

  // Wallet functions
  const [walletLoading, setWalletLoading] = useState<string | null>(null);

  const addToAppleWallet = async (cardId: string) => {
    setWalletLoading('apple');
    try {
      const response = await fetch(`/api/wallet/apple?cardId=${cardId}`);
      
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || 'Kart oluşturulamadı');
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qratex-card.pkpass`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Kart indirildi! Apple Wallet\'a ekleyebilirsiniz.');
    } catch (error) {
      toast.error('Kart indirilemedi');
    } finally {
      setWalletLoading(null);
    }
  };

  const addToGoogleWallet = async (cardId: string) => {
    setWalletLoading('google');
    try {
      const response = await fetch(`/api/wallet/google?cardId=${cardId}`);
      const data = await response.json();
      
      if (!response.ok) {
        toast.error(data.error || 'Kart oluşturulamadı');
        return;
      }
      
      if (data.saveUrl) {
        window.open(data.saveUrl, '_blank');
        toast.success('Google Wallet sayfası açıldı');
      } else if (data.fallbackUrl) {
        toast.info('Google Wallet henüz yapılandırılmamış');
      }
    } catch (error) {
      toast.error('Kart eklenemedi');
    } finally {
      setWalletLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 sm:p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-cyan-500/20 rounded-full blur-3xl" />
        </div>
        
        {/* Animated particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/30 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                y: [-20, 20],
                opacity: [0, 1, 0],
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
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400" />
            Dijital Kartlarım
          </h1>
          <p className="text-white/70 mt-1 text-sm sm:text-base">Efsanevi QRateX kartınız ve ayrıcalıklarınız</p>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Aktif Kart', value: stats.totalCards, icon: CreditCard, color: 'from-violet-500 to-purple-600' },
          { label: 'Toplam Tüketim', value: stats.totalConsumptions, icon: Zap, color: 'from-cyan-500 to-blue-600' },
          { label: 'Yorum Bekliyor', value: stats.reviewPending, icon: Star, color: 'from-amber-500 to-orange-600' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden group hover:scale-105 transition-transform">
              <CardContent className="p-2 sm:p-4 relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3 relative z-10">
                  <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-gradient-to-br ${stat.color}`}>
                    <stat.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Cards */}
      {cards.length === 0 ? (
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-8 sm:p-12 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                <CreditCard className="w-10 h-10 sm:w-12 sm:h-12 text-purple-500" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2">Henüz kartınız yok</h3>
              <p className="text-muted-foreground mb-4 sm:mb-6 text-sm sm:text-base">
                Restoran veya kafeden aldığınız QR kartı tarayarak aktive edin
              </p>
              <Button asChild className="bg-gradient-to-r from-purple-600 to-cyan-600">
                <Link href="/customer/scan">
                  <QrCode className="w-4 h-4 mr-2" />
                  QR Tara
                </Link>
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {cards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {/* LEGENDARY CARD DESIGN - Full animations */}
              <div className="perspective-1000">
                <motion.div
                  ref={(el) => { cardRefs.current[card.id] = el; }}
                  className="relative w-full max-w-lg mx-auto cursor-pointer group"
                  style={{ 
                    aspectRatio: '1.586/1',
                    transformStyle: 'preserve-3d',
                  }}
                  onMouseMove={(e) => handleMouseMove(e, card.id)}
                  onMouseLeave={handleMouseLeave}
                  whileHover={{
                    rotateY: (mousePosition.x - 0.5) * 15,
                    rotateX: (mousePosition.y - 0.5) * -15,
                    scale: 1.02,
                  }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  onClick={() => { setSelectedCard(card); setShowQrDialog(true); }}
                >
                  {/* Card Background */}
                  <div className="absolute inset-0 rounded-xl sm:rounded-2xl overflow-hidden">
                    {/* Animated gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
                    
                    {/* Holographic effect - animates with mouse */}
                    <motion.div
                      className="absolute inset-0 opacity-60"
                      style={{
                        background: `linear-gradient(${mousePosition.x * 360}deg, 
                          rgba(147, 51, 234, 0.4), 
                          rgba(34, 211, 238, 0.4), 
                          rgba(236, 72, 153, 0.4), 
                          rgba(147, 51, 234, 0.4))`,
                      }}
                    />
                    
                    {/* Moving shine effect */}
                    <motion.div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: `radial-gradient(circle at ${mousePosition.x * 100}% ${mousePosition.y * 100}%, 
                          rgba(255,255,255,0.4) 0%, 
                          transparent 50%)`,
                      }}
                    />
                    
                    {/* Animated rainbow border */}
                    <motion.div
                      className="absolute inset-0 rounded-xl sm:rounded-2xl"
                      style={{
                        background: `linear-gradient(${mousePosition.x * 360}deg, #9333ea, #22d3ee, #ec4899, #9333ea)`,
                        padding: '2px',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude',
                      }}
                      animate={{
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                      }}
                    />
                    
                    {/* Subtle pattern */}
                    <div 
                      className="absolute inset-0 opacity-10"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                      }}
                    />
                    
                    {/* Inner glow */}
                    <div className="absolute inset-[1px] rounded-xl sm:rounded-2xl border border-white/10" />
                  </div>

                  {/* Card Content */}
                  <div className="absolute inset-0 p-3 sm:p-4 md:p-6 flex flex-col justify-between text-white">
                    {/* Top Row */}
                    <div className="flex items-start justify-between">
                      <div>
                        {/* Logo & Title */}
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                          <motion.div 
                            className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center"
                            animate={{ 
                              boxShadow: ['0 0 20px rgba(147, 51, 234, 0.5)', '0 0 30px rgba(34, 211, 238, 0.5)', '0 0 20px rgba(147, 51, 234, 0.5)']
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Sparkles className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                          </motion.div>
                          <span className="text-sm sm:text-lg font-bold tracking-wider bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                            QRateX
                          </span>
                        </div>
                        <p className="text-[8px] sm:text-xs text-white/50 tracking-widest uppercase">Premium Member Card</p>
                      </div>
                      
                      {/* Status Badge */}
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <motion.div
                          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <Wifi className="w-3 h-3 sm:w-4 sm:h-4 text-cyan-400" />
                        </motion.div>
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5">
                          <CheckCircle2 className="w-2 h-2 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                          Aktif
                        </Badge>
                      </div>
                    </div>

                    {/* Middle - QR Code Preview */}
                    <div className="flex items-center justify-center flex-1 py-2 sm:py-4">
                      <motion.div 
                        className="relative"
                        whileHover={{ scale: 1.1 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                      >
                        {/* QR Animated Glow */}
                        <motion.div 
                          className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-lg sm:rounded-xl blur-lg sm:blur-xl"
                          animate={{ 
                            opacity: [0.4, 0.7, 0.4],
                            scale: [1, 1.1, 1],
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                        
                        {/* QR Container */}
                        <div className="relative bg-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl shadow-2xl">
                          {qrCodes[card.token] ? (
                            <img 
                              src={qrCodes[card.token]} 
                              alt="QR Code" 
                              className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-md sm:rounded-lg"
                            />
                          ) : (
                            <QrCode className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-slate-900" />
                          )}
                        </div>
                        
                        {/* Scan hint */}
                        <motion.p 
                          className="absolute -bottom-5 sm:-bottom-6 left-1/2 -translate-x-1/2 text-[8px] sm:text-xs text-white/50 whitespace-nowrap"
                          animate={{ opacity: [0.3, 0.8, 0.3] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          Büyütmek için dokun
                        </motion.p>
                      </motion.div>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex items-end justify-between">
                      {/* Card ID & User */}
                      <div className="space-y-1 sm:space-y-2 min-w-0 flex-1">
                        <div>
                          <p className="text-[7px] sm:text-[10px] text-white/40 uppercase tracking-wider">Card ID</p>
                          <div className="flex items-center gap-1 sm:gap-2 mt-0.5">
                            <code className="text-[9px] sm:text-sm font-mono text-white/80 truncate max-w-[80px] sm:max-w-[150px]">
                              {showToken[card.id] ? card.token.slice(0, 16) + '...' : `•••• •••• ${card.token.slice(-8)}`}
                            </code>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-4 w-4 sm:h-5 sm:w-5 text-white/40 hover:text-white hover:bg-white/10"
                              onClick={(e) => { e.stopPropagation(); toggleShowToken(card.id); }}
                            >
                              {showToken[card.id] ? <EyeOff className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> : <Eye className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <p className="text-[7px] sm:text-[10px] text-white/40 uppercase tracking-wider">Kart Sahibi</p>
                          <p className="text-[10px] sm:text-sm font-medium truncate max-w-[100px] sm:max-w-[180px]">{session?.user?.name || 'Premium Üye'}</p>
                        </div>
                      </div>

                      {/* Stats & Actions */}
                      <div className="text-right space-y-1 sm:space-y-2 flex-shrink-0">
                        <div className="flex items-center justify-end gap-2 sm:gap-4">
                          <div>
                            <p className="text-[7px] sm:text-[10px] text-white/40 uppercase">Tüketim</p>
                            <p className="text-base sm:text-lg font-bold">{card._count.consumptions}</p>
                          </div>
                          <div className="w-px h-6 sm:h-8 bg-white/20" />
                          <div>
                            <p className="text-[7px] sm:text-[10px] text-white/40 uppercase">Seviye</p>
                            <div className="flex items-center gap-0.5 sm:gap-1">
                              <Crown className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" />
                              <p className="text-base sm:text-lg font-bold">VIP</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Quick Actions */}
                        <div className="flex items-center gap-0.5 sm:gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 sm:h-7 sm:w-7 text-white/50 hover:text-white hover:bg-white/10"
                            onClick={(e) => { e.stopPropagation(); copyToken(card.token); }}
                          >
                            <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 sm:h-7 sm:w-7 text-white/50 hover:text-white hover:bg-white/10"
                            onClick={(e) => { e.stopPropagation(); shareCard(card.token); }}
                          >
                            <Share2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Decorative Elements */}
                    <motion.div 
                      className="absolute top-3 right-3 sm:top-4 sm:right-4 opacity-20"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                    >
                      <Shield className="w-10 h-10 sm:w-16 sm:h-16" />
                    </motion.div>
                    <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 opacity-10">
                      <Fingerprint className="w-8 h-8 sm:w-12 sm:h-12" />
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Card Info Below */}
              <Card className="border-0 bg-card/50 backdrop-blur-sm mt-3 sm:mt-4">
                <CardContent className="p-3 sm:p-4 md:p-6">
                  {/* Stats */}
                  <div className="flex flex-wrap items-center gap-3 sm:gap-6 mb-3 sm:mb-4">
                    <div className="flex items-center gap-2">
                      <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                      <span className="text-xs sm:text-sm">
                        <span className="font-medium">{card._count.consumptions}</span> tüketim
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        Aktive: {formatDate(card.activatedAt || '')}
                      </span>
                    </div>
                  </div>

                  {/* Recent Consumptions */}
                  {card.consumptions.length > 0 && (
                    <div className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Son Tüketimler</p>
                      {card.consumptions.slice(0, 3).map((consumption) => (
                        <div 
                          key={consumption.id} 
                          className="flex items-center justify-between p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                            <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs sm:text-sm truncate">
                              {consumption.dealer.businessName || 'İşletme'}
                            </span>
                            {consumption.product && (
                              <span className="text-[10px] sm:text-xs text-muted-foreground truncate hidden sm:inline">
                                - {consumption.product.name}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0 ml-2">
                            {formatRelativeTime(consumption.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button asChild className="flex-1 h-9 sm:h-10 text-xs sm:text-sm bg-gradient-to-r from-purple-600 to-cyan-600">
                      <Link href="/customer/consumptions">
                        Tüm Tüketimlerimi Gör
                        <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5 sm:ml-2" />
                      </Link>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="h-9 w-9 sm:h-10 sm:w-10"
                      onClick={() => shareCard(card.token)}
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* QR Code Dialog - Legendary Design */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 border-purple-500/20 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-white flex items-center justify-center gap-2 text-base sm:text-lg">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              </motion.div>
              QRateX Dijital Kart
            </DialogTitle>
          </DialogHeader>
          {selectedCard && (
            <div className="flex flex-col items-center space-y-4 sm:space-y-6">
              {/* Giant QR Code with animations */}
              <motion.div 
                className="relative"
                initial={{ scale: 0.8, opacity: 0, rotateY: -180 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                transition={{ type: 'spring', duration: 0.8 }}
              >
                {/* Animated glow effect */}
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-xl sm:rounded-2xl blur-xl sm:blur-2xl"
                  animate={{ 
                    opacity: [0.3, 0.6, 0.3],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* QR Container */}
                <div className="relative bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-2xl">
                  {qrCodes[selectedCard.token] && (
                    <img 
                      src={qrCodes[selectedCard.token]} 
                      alt="QR Code" 
                      className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-lg sm:rounded-xl"
                    />
                  )}
                </div>
                
                {/* Animated corners */}
                <motion.div 
                  className="absolute -top-1 -left-1 w-4 h-4 sm:w-6 sm:h-6 border-t-2 border-l-2 border-purple-500 rounded-tl-lg"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <motion.div 
                  className="absolute -top-1 -right-1 w-4 h-4 sm:w-6 sm:h-6 border-t-2 border-r-2 border-cyan-500 rounded-tr-lg"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                />
                <motion.div 
                  className="absolute -bottom-1 -left-1 w-4 h-4 sm:w-6 sm:h-6 border-b-2 border-l-2 border-cyan-500 rounded-bl-lg"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
                />
                <motion.div 
                  className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-6 sm:h-6 border-b-2 border-r-2 border-purple-500 rounded-br-lg"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.9 }}
                />
              </motion.div>

              {/* Info */}
              <div className="text-center space-y-1">
                <p className="text-xs sm:text-sm text-white/70">
                  Bu QR kodu bayiye göstererek tüketim kaydı oluşturun
                </p>
                <p className="text-[10px] sm:text-xs text-white/40 break-all px-4">
                  {QR_DOMAIN}/c/{selectedCard.token}
                </p>
              </div>

              {/* Actions */}
              <div className="w-full space-y-2">
                {/* Quick actions */}
                <div className="flex gap-2">
                  <Button 
                    className="flex-1 h-10 text-xs sm:text-sm bg-white/10 hover:bg-white/20 text-white border-0" 
                    variant="outline"
                    onClick={() => copyUrl(selectedCard.token)}
                  >
                    <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    Kopyala
                  </Button>
                  <Button 
                    className="flex-1 h-10 text-xs sm:text-sm bg-gradient-to-r from-purple-600 to-cyan-600"
                    onClick={() => shareCard(selectedCard.token)}
                  >
                    <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    Paylaş
                  </Button>
                </div>
                
                {/* Wallet Buttons */}
                <div className="pt-3 sm:pt-4 border-t border-white/10">
                  <p className="text-[10px] sm:text-xs text-white/40 text-center mb-2 sm:mb-3">
                    Dijital Cüzdana Ekle
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-10 text-xs sm:text-sm bg-black hover:bg-gray-900 text-white border border-white/20"
                      onClick={() => addToAppleWallet(selectedCard.id)}
                      disabled={walletLoading === 'apple'}
                    >
                      {walletLoading === 'apple' ? (
                        <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                          Apple
                        </>
                      )}
                    </Button>
                    <Button
                      className="flex-1 h-10 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => addToGoogleWallet(selectedCard.id)}
                      disabled={walletLoading === 'google'}
                    >
                      {walletLoading === 'google' ? (
                        <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                      ) : (
                        <>
                          <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                          Google
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review Pending Alert */}
      {stats.reviewPending > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <motion.div 
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Award className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
                  </motion.div>
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base">Yorum Bekleyen Tüketimler</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {stats.reviewPending} tüketim için yorum yaparak puan kazanın!
                    </p>
                  </div>
                </div>
                <Button 
                  asChild 
                  size="sm"
                  className="w-full sm:w-auto border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                  variant="outline"
                >
                  <Link href="/customer/consumptions?hasReview=false">
                    Yorum Yap
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5 sm:ml-2" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
