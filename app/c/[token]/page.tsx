'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  LogIn,
  UserPlus,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Gift,
  Star,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface CardInfo {
  id: string;
  token: string;
  status: 'UNUSED' | 'ACTIVATED' | 'BLOCKED';
  isActivated: boolean;
  activatedAt: string | null;
  customer: {
    id: string;
    name: string;
    image: string | null;
  } | null;
}

export default function CardActivationPage() {
  // Get token from URL params using useParams hook (Next.js 14 compatible)
  const params = useParams();
  const token = params.token as string;
  
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchCardInfo();
    }
  }, [token]);

  const fetchCardInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const res = await fetch(`/api/cards/${token}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Kart bulunamadı');
        setErrorCode(data.code || null);
        return;
      }

      setCardInfo(data.card);
    } catch (err) {
      setError('Kart bilgisi alınamadı');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!session?.user) {
      toast.error('Lütfen önce giriş yapın');
      return;
    }

    if (session.user.role !== 'CUSTOMER') {
      toast.error('Sadece müşteriler kart aktive edebilir');
      return;
    }

    setActivating(true);
    try {
      const res = await fetch(`/api/cards/${token}/activate`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Kart aktive edilemedi');
        if (data.code === 'ALREADY_ACTIVATED') {
          fetchCardInfo(); // Kartı yeniden yükle
        }
        return;
      }

      toast.success('Kart başarıyla aktive edildi! 🎉');
      
      // Kartı yeniden yükle
      await fetchCardInfo();
      
      // Müşteri paneline yönlendir
      setTimeout(() => {
        router.push('/customer/my-card');
      }, 1500);
    } catch (err) {
      toast.error('Bir hata oluştu');
    } finally {
      setActivating(false);
    }
  };

  // Loading state
  if (loading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 animate-spin text-violet-500 mx-auto mb-4" />
          <p className="text-white/70">Kart bilgisi yükleniyor...</p>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="border-0 bg-slate-900/50 backdrop-blur-xl">
            <CardHeader className="text-center px-4 sm:px-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                {errorCode === 'CARD_BLOCKED' ? (
                  <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-red-500" />
                ) : (
                  <XCircle className="w-8 h-8 sm:w-10 sm:h-10 text-red-500" />
                )}
              </div>
              <CardTitle className="text-xl sm:text-2xl text-white">
                {errorCode === 'CARD_NOT_FOUND' && 'Kart Bulunamadı'}
                {errorCode === 'CARD_BLOCKED' && 'Kart Bloklanmış'}
                {!errorCode && 'Hata'}
              </CardTitle>
              <CardDescription className="text-white/60 text-sm sm:text-base">
                {error}
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center px-4 sm:px-6 pb-6">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/">Ana Sayfaya Dön</Link>
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Card already activated - show info
  if (cardInfo?.isActivated && cardInfo.customer) {
    const isOwnCard = session?.user?.id === cardInfo.customer.id;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="border-0 bg-slate-900/50 backdrop-blur-xl overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-violet-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-fuchsia-500/10 rounded-full blur-3xl" />
            </div>

            <CardHeader className="relative text-center px-4 sm:px-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500" />
              </div>
              <CardTitle className="text-xl sm:text-2xl text-white">
                Kart Aktif
              </CardTitle>
              <CardDescription className="text-white/60 text-sm sm:text-base">
                Bu kart zaten aktive edilmiş
              </CardDescription>
            </CardHeader>

            <CardContent className="relative space-y-4 px-4 sm:px-6">
              {/* Card owner info */}
              <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                    {cardInfo.customer.image ? (
                      <img 
                        src={cardInfo.customer.image} 
                        alt={cardInfo.customer.name || ''} 
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="w-5 h-5 sm:w-6 sm:h-6 text-violet-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium truncate">{cardInfo.customer.name}</p>
                    <p className="text-xs sm:text-sm text-white/50">
                      {isOwnCard ? 'Bu sizin kartınız' : 'Kart sahibi'}
                    </p>
                  </div>
                </div>
              </div>

              {isOwnCard && (
                <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-emerald-400 text-xs sm:text-sm text-center">
                    🎉 Bu kart size bağlı! Tüketim geçmişinizi görüntüleyebilirsiniz.
                  </p>
                </div>
              )}
            </CardContent>

            <CardFooter className="relative flex-col gap-2 px-4 sm:px-6 pb-6">
              {isOwnCard ? (
                <>
                  <Button 
                    className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600"
                    asChild
                  >
                    <Link href="/customer/my-card">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Kartımı Görüntüle
                    </Link>
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full"
                    asChild
                  >
                    <Link href="/customer/consumptions">
                      <History className="w-4 h-4 mr-2" />
                      Tüketim Geçmişim
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  {!session?.user ? (
                    <>
                      <Button 
                        className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600"
                        onClick={() => signIn(undefined, { callbackUrl: `/c/${token}` })}
                      >
                        <LogIn className="w-4 h-4 mr-2" />
                        Giriş Yap
                      </Button>
                      <Button 
                        variant="outline"
                        className="w-full"
                        asChild
                      >
                        <Link href={`/auth/register?callbackUrl=/c/${token}`}>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Kayıt Ol
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" asChild className="w-full">
                      <Link href="/customer">Panelime Git</Link>
                    </Button>
                  )}
                </>
              )}
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Card not activated - show activation flow
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="border-0 bg-slate-900/50 backdrop-blur-xl overflow-hidden">
          {/* Animated background */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-violet-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-fuchsia-500/10 rounded-full blur-3xl animate-pulse" />
          </div>

          <CardHeader className="relative text-center px-4 sm:px-6">
            <motion.div 
              className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30"
              animate={{ 
                boxShadow: ['0 10px 40px rgba(139, 92, 246, 0.3)', '0 10px 40px rgba(217, 70, 239, 0.3)', '0 10px 40px rgba(139, 92, 246, 0.3)']
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <CreditCard className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
            </motion.div>
            <CardTitle className="text-xl sm:text-2xl text-white">
              QRateX Kartı
            </CardTitle>
            <CardDescription className="text-white/60 text-sm sm:text-base">
              Bu kartı aktive ederek QRateX ayrıcalıklarına katılın
            </CardDescription>
          </CardHeader>

          <CardContent className="relative space-y-4 px-4 sm:px-6">
            {/* Benefits */}
            <div className="space-y-2 sm:space-y-3">
              {[
                { icon: Gift, text: 'Puan kazanın ve ödüllere ulaşın', color: 'text-amber-400' },
                { icon: History, text: 'Tüketimlerinizi takip edin', color: 'text-blue-400' },
                { icon: Star, text: 'Yorum yaparak puan kazanın', color: 'text-purple-400' },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-3 p-2.5 sm:p-3 rounded-lg bg-white/5"
                >
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <span className="text-white/80 text-xs sm:text-sm">{item.text}</span>
                </motion.div>
              ))}
            </div>

            {/* Auth state */}
            <AnimatePresence mode="wait">
              {!session?.user ? (
                <motion.div
                  key="not-logged-in"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20"
                >
                  <p className="text-amber-400 text-xs sm:text-sm text-center mb-3">
                    Kartı aktive etmek için giriş yapın veya kayıt olun
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1 h-10 sm:h-9"
                      onClick={() => signIn(undefined, { callbackUrl: `/c/${token}` })}
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Giriş Yap
                    </Button>
                    <Button 
                      className="flex-1 h-10 sm:h-9 bg-gradient-to-r from-violet-600 to-fuchsia-600"
                      asChild
                    >
                      <Link href={`/auth/register?callbackUrl=/c/${token}`}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Kayıt Ol
                      </Link>
                    </Button>
                  </div>
                </motion.div>
              ) : session.user.role !== 'CUSTOMER' ? (
                <motion.div
                  key="wrong-role"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20"
                >
                  <p className="text-red-400 text-xs sm:text-sm text-center">
                    ⚠️ Sadece müşteri hesapları kart aktive edebilir. Lütfen müşteri hesabıyla giriş yapın.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-emerald-400 text-sm font-medium truncate">
                        Merhaba, {session.user.name}!
                      </p>
                      <p className="text-emerald-400/70 text-xs">
                        Kartı aktive etmeye hazırsınız
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>

          <CardFooter className="relative px-4 sm:px-6 pb-6">
            {session?.user && session.user.role === 'CUSTOMER' && (
              <Button 
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 h-11 sm:h-12 text-base sm:text-lg"
                onClick={handleActivate}
                disabled={activating}
              >
                {activating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Aktive Ediliyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    Kartı Aktive Et
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Footer */}
        <p className="text-center text-white/40 text-xs sm:text-sm mt-6">
          Powered by <span className="text-violet-400 font-medium">QRateX</span>
        </p>
      </motion.div>
    </div>
  );
}
