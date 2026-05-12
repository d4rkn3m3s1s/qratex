'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Send, Camera, X, Check, Loader2, AlertCircle, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { t, Locale, defaultLocale } from '@/i18n/request';
import { LOCALE_STORAGE_KEY, writeLocaleCookieClient } from '@/lib/locale-shared';

interface QRCodeData {
  id: string;
  name: string;
  description: string | null;
  dealer: {
    businessName: string | null;
    name: string | null;
    staffMembers?: {
      id: string;
      user: { name: string | null; image: string | null };
    }[];
  };
}

export default function FeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const code = params.code as string;

  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);

  // i18n
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  useEffect(() => {
    // If logged in user has a language preference, use it
    const userPref = (session?.user as any)?.preferredLanguage;
    if (userPref === 'en') {
      setLocale('en');
      writeLocaleCookieClient('en');
    } else {
      // Check localStorage for anonymous users
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      const next = saved === 'en' || saved === 'tr' ? saved : defaultLocale;
      setLocale(next);
      writeLocaleCookieClient(next);
    }
  }, [session]);

  const toggleLocale = () => {
    const nextLocale = locale === 'tr' ? 'en' : 'tr';
    setLocale(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    writeLocaleCookieClient(nextLocale);
  };

  // Fetch QR code data
  useEffect(() => {
    async function fetchQRCode() {
      try {
        const response = await fetch(`/api/qr-codes/public/${code}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('QR kod bulunamadı veya aktif değil.');
          } else {
            setError('Bir hata oluştu. Lütfen tekrar deneyin.');
          }
          return;
        }
        const data = await response.json();
        setQrData(data.qrCode);
      } catch (err) {
        setError('Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.');
      } finally {
        setLoading(false);
      }
    }

    if (code) {
      fetchQRCode();
    }
  }, [code]);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Lütfen bir puan seçin');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/feedbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCodeId: qrData?.id,
          rating,
          text: text.trim() || undefined,
          media: images.length > 0 ? images : undefined,
          ...(npsScore != null && { npsScore }),
          ...(staffId && { dealerStaffId: staffId }),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || 'Geri bildirim gönderilemedi');
        return;
      }

      setSubmitted(true);
      toast.success('Geri bildiriminiz için teşekkürler! 🎉');
    } catch (err) {
      toast.error('Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 5) {
      toast.error('En fazla 5 fotoğraf yükleyebilirsiniz');
      return;
    }

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Dosya boyutu 5MB\'dan küçük olmalı');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t(locale, 'common.loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t(locale, 'common.error')}</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button asChild variant="outline">
              <Link href="/">{t(locale, 'publicFeedback.returnHome')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <Card className="text-center overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto"
              >
                <Check className="w-10 h-10 text-green-500" />
              </motion.div>
            </div>
            <CardContent className="pt-6 pb-8">
              <h2 className="text-2xl font-bold mb-2">{t(locale, 'publicFeedback.successMsg')}</h2>
              <p className="text-muted-foreground mb-6">
                {t(locale, 'publicFeedback.successMsg')}
                {session?.user && (
                  <>
                    <br />
                    <span className="text-primary font-medium">
                      +{text.trim().length > 50 ? 100 : 50} {t(locale, 'publicFeedback.pointsEarned')}
                    </span>
                  </>
                )}
              </p>
              <div className="space-y-3">
                {session?.user ? (
                  <Button asChild variant="gradient" className="w-full">
                    <Link href="/customer">{t(locale, 'publicFeedback.goToDashboard')}</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="gradient" className="w-full">
                      <Link href="/auth/register">
                        {t(locale, 'publicFeedback.signUpToEarn')}
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/">{t(locale, 'publicFeedback.returnHome')}</Link>
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Feedback form
  return (
    <div className="max-w-lg mx-auto p-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex justify-end mb-4">
          <Button variant="ghost" size="sm" onClick={toggleLocale} className="text-xs uppercase font-semibold">
            {locale === 'tr' ? 'EN' : 'TR'}
          </Button>
        </div>
        <Card glass>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t(locale, 'publicFeedback.title')}</CardTitle>
            <CardDescription>
              <span className="font-medium text-foreground">
                {qrData?.dealer.businessName || qrData?.dealer.name}
              </span>
              <br />
              {qrData?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rating */}
            <div className="space-y-3">
              <Label className="text-center block">{t(locale, 'publicFeedback.rateExperience')}</Label>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="touch-manipulation"
                    aria-label={`${star} star`}
                  >
                    <Star
                      className={cn(
                        'w-12 h-12 transition-colors',
                        (hoverRating || rating) >= star
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground'
                      )}
                    />
                  </motion.button>
                ))}
              </div>
              {rating > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-sm text-muted-foreground"
                >
                  {rating === 5 && t(locale, 'publicFeedback.excellent')}
                  {rating === 4 && t(locale, 'publicFeedback.veryGood')}
                  {rating === 3 && t(locale, 'publicFeedback.good')}
                  {rating === 2 && t(locale, 'publicFeedback.needsImprovement')}
                  {rating === 1 && t(locale, 'publicFeedback.bad')}
                </motion.p>
              )}
            </div>

            {/* Staff Selection (S6-T7) */}
            {qrData?.dealer?.staffMembers && qrData.dealer.staffMembers.length > 0 && (
              <div className="space-y-3">
                <Label className="text-center block text-sm text-foreground/80 flex items-center justify-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  {t(locale, 'publicFeedback.rateStaff') || 'Hangi personelimizle ilgilendiniz? (Opsiyonel)'}
                </Label>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x justify-start sm:justify-center">
                  {qrData.dealer.staffMembers.map(staff => (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => setStaffId(staffId === staff.id ? null : staff.id)}
                      className={`flex flex-col items-center gap-2 min-w-[70px] p-2 rounded-2xl transition-all border snap-center ${staffId === staff.id
                          ? 'border-primary bg-primary/10 shadow-sm scale-105'
                          : 'border-transparent bg-muted/40 hover:bg-muted opacity-80'
                        }`}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-background flex items-center justify-center shadow-inner border border-border/80 dark:border-white/25">
                        {staff.user.image ? (
                          <img src={staff.user.image} alt={staff.user.name || ''} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg font-bold text-muted-foreground uppercase">{staff.user.name?.slice(0, 2) || 'PP'}</span>
                        )}
                      </div>
                      <span className={`text-[11px] font-medium leading-tight text-center truncate w-full ${staffId === staff.id ? 'text-primary' : 'text-muted-foreground'}`}>
                        {staff.user.name?.split(' ')[0] || 'Personel'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* NPS (Ö6) – opsiyonel */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">{t(locale, 'publicFeedback.npsQuestion')}</Label>
              <div className="flex flex-wrap gap-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNpsScore(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${npsScore === n
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                      }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick feedback options (Ö3) */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">{t(locale, 'publicFeedback.quickOptions')}</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  'Çok memnunum',
                  'Personel çok ilgili',
                  'Temizlik mükemmel',
                  'Fiyat uygun',
                  'Tavsiye ederim',
                  'Bekleme süresi uzundu',
                  'Hizmet yavaştı',
                  'Geliştirilmeli',
                  'Geri döneceğim',
                ].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      const sep = text ? ' ' : '';
                      const newText = text + sep + option;
                      if (newText.length <= 2000) setText(newText);
                    }}
                    className="inline-flex items-center rounded-full border border-border/80 bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-primary/10 hover:border-primary/30 transition-colors dark:border-white/25"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="comment">{t(locale, 'publicFeedback.commentLabel')}</Label>
              <textarea
                id="comment"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t(locale, 'publicFeedback.commentPlaceholder')}
                rows={4}
                className="flex w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none dark:border-white/25 dark:bg-white/[0.07]"
                maxLength={2000}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {text.trim().length > 50 && (
                    <span className="text-primary">+50 {t(locale, 'publicFeedback.bonusPoints')}</span>
                  )}
                </span>
                <span>{text.length}/2000</span>
              </div>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>{t(locale, 'publicFeedback.addPhoto')}</Label>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {images.map((img, index) => (
                    <motion.div
                      key={img}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative w-20 h-20 rounded-lg overflow-hidden"
                    >
                      <img
                        src={img}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {images.length < 5 && (
                  <label className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                    <Camera className="w-6 h-6 text-muted-foreground" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Login hint */}
            {!session?.user && (
              <div className="p-4 rounded-lg bg-primary/10 text-sm text-center">
                <Link href="/auth/login" className="text-primary hover:underline font-medium">
                  {t(locale, 'publicFeedback.loginHint')}
                </Link>{' '}
                {t(locale, 'publicFeedback.loginSuffix')}
              </div>
            )}

            {/* Submit */}
            <Button
              variant="gradient"
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={rating === 0 || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t(locale, 'publicFeedback.sending')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {t(locale, 'publicFeedback.send')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}




