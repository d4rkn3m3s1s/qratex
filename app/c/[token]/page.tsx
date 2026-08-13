'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { m as Motion, AnimatePresence } from 'framer-motion';
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
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Kart bilgisi yükleniyor...</p>
        </Motion.div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="border-border/60 bg-card/80 backdrop-blur-xl">
            <CardHeader className="px-4 text-center sm:px-6">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 sm:h-20 sm:w-20">
                {errorCode === 'CARD_BLOCKED' ? (
                  <AlertTriangle className="h-8 w-8 text-red-500 sm:h-10 sm:w-10" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-500 sm:h-10 sm:w-10" />
                )}
              </div>
              <CardTitle className="text-xl sm:text-2xl">
                {errorCode === 'CARD_NOT_FOUND' && 'Kart Bulunamadı'}
                {errorCode === 'CARD_BLOCKED' && 'Kart Bloklanmış'}
                {!errorCode && 'Hata'}
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {error}
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center px-4 sm:px-6 pb-6">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/">Ana Sayfaya Dön</Link>
              </Button>
            </CardFooter>
          </Card>
        </Motion.div>
      </div>
    );
  }

  // Card already activated - show info
  if (cardInfo?.isActivated && cardInfo.customer) {
    const isOwnCard = session?.user?.id === cardInfo.customer.id;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="relative overflow-hidden border-border/60 bg-card/80 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <div className="absolute -right-1/2 -top-1/2 h-full w-full rounded-full bg-primary/[0.06] blur-3xl" />
              <div className="absolute -bottom-1/2 -left-1/2 h-full w-full rounded-full bg-primary/[0.05] blur-3xl" />
            </div>

            <CardHeader className="relative px-4 text-center sm:px-6">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 sm:h-20 sm:w-20">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 sm:h-10 sm:w-10 dark:text-emerald-500" />
              </div>
              <CardTitle className="text-xl sm:text-2xl">Kart Aktif</CardTitle>
              <CardDescription className="text-sm sm:text-base">Bu kart zaten aktive edilmiş</CardDescription>
            </CardHeader>

            <CardContent className="relative space-y-4 px-4 sm:px-6">
              {/* Card owner info */}
              <div className="rounded-xl border border-border bg-muted/40 p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:h-12 sm:w-12">
                    {cardInfo.customer.image ? (
                      <img 
                        src={cardInfo.customer.image} 
                        alt={cardInfo.customer.name || ''} 
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{cardInfo.customer.name}</p>
                    <p className="text-xs text-muted-foreground sm:text-sm">
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

            <CardFooter className="relative flex-col gap-2 px-4 pb-6 sm:px-6">
              {isOwnCard ? (
                <>
                  <Button className="w-full" asChild>
                    <Link href="/customer/my-card">
                      <CreditCard className="mr-2 h-4 w-4" />
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
                      <Button className="w-full" onClick={() => signIn(undefined, { callbackUrl: `/c/${token}` })}>
                        <LogIn className="mr-2 h-4 w-4" />
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
        </Motion.div>
      </div>
    );
  }

  // Card not activated - show activation flow
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="relative overflow-hidden border-border/60 bg-card/80 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute -right-1/2 -top-1/2 h-full w-full animate-pulse rounded-full bg-primary/[0.07] blur-3xl" />
            <div className="absolute -bottom-1/2 -left-1/2 h-full w-full animate-pulse rounded-full bg-primary/[0.05] blur-3xl" />
          </div>

          <CardHeader className="relative px-4 text-center sm:px-6">
            <Motion.div
              className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 sm:h-24 sm:w-24"
              animate={{
                boxShadow: [
                  '0 10px 40px hsl(var(--primary) / 0.25)',
                  '0 14px 44px hsl(var(--primary) / 0.35)',
                  '0 10px 40px hsl(var(--primary) / 0.25)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <CreditCard className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden />
            </Motion.div>
            <CardTitle className="text-xl sm:text-2xl">QRateX Kartı</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Bu kartı aktive ederek QRateX ayrıcalıklarına katılın
            </CardDescription>
          </CardHeader>

          <CardContent className="relative space-y-4 px-4 sm:px-6">
            {/* Benefits */}
            <div className="space-y-2 sm:space-y-3">
              {[
                { icon: Gift, text: 'Puan kazanın ve ödüllere ulaşın', color: 'text-amber-600 dark:text-amber-400' },
                { icon: History, text: 'Tüketimlerinizi takip edin', color: 'text-blue-600 dark:text-blue-400' },
                { icon: Star, text: 'Yorum yaparak puan kazanın', color: 'text-primary' },
              ].map((item, index) => (
                <Motion.div
                  key={item.text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-2.5 sm:p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/80">
                    <item.icon className={`h-4 w-4 ${item.color}`} aria-hidden />
                  </div>
                  <span className="text-xs text-foreground sm:text-sm">{item.text}</span>
                </Motion.div>
              ))}
            </div>

            {/* Auth state */}
            <AnimatePresence mode="wait">
              {!session?.user ? (
                <Motion.div
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
                    <Button className="h-10 flex-1 sm:h-9" asChild>
                      <Link href={`/auth/register?callbackUrl=/c/${token}`}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Kayıt Ol
                      </Link>
                    </Button>
                  </div>
                </Motion.div>
              ) : session.user.role !== 'CUSTOMER' ? (
                <Motion.div
                  key="wrong-role"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20"
                >
                  <p className="text-red-400 text-xs sm:text-sm text-center">
                    ⚠️ Sadece müşteri hesapları kart aktive edebilir. Lütfen müşteri hesabıyla giriş yapın.
                  </p>
                </Motion.div>
              ) : (
                <Motion.div
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
                </Motion.div>
              )}
            </AnimatePresence>
          </CardContent>

          <CardFooter className="relative px-4 pb-6 sm:px-6">
            {session?.user && session.user.role === 'CUSTOMER' && (
              <Button
                className="h-11 w-full text-base sm:h-12 sm:text-lg"
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
        <p className="mt-6 text-center text-xs text-muted-foreground sm:text-sm">
          Powered by <span className="font-medium text-primary">QRateX</span>
        </p>
      </Motion.div>
    </div>
  );
}
