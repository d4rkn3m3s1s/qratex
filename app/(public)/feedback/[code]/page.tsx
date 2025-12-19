'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Send, Camera, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface QRCodeData {
  id: string;
  name: string;
  description: string | null;
  dealer: {
    businessName: string | null;
    name: string | null;
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
          <p className="text-muted-foreground">Yükleniyor...</p>
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
            <h2 className="text-xl font-semibold mb-2">Hata</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button asChild variant="outline">
              <Link href="/">Ana Sayfaya Dön</Link>
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
              <h2 className="text-2xl font-bold mb-2">Teşekkürler! 🎉</h2>
              <p className="text-muted-foreground mb-6">
                Geri bildiriminiz başarıyla kaydedildi.
                {session?.user && (
                  <>
                    <br />
                    <span className="text-primary font-medium">
                      +{text.trim().length > 50 ? 100 : 50} puan kazandınız!
                    </span>
                  </>
                )}
              </p>
              <div className="space-y-3">
                {session?.user ? (
                  <Button asChild variant="gradient" className="w-full">
                    <Link href="/customer">Dashboard'a Git</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="gradient" className="w-full">
                      <Link href="/auth/register">
                        Kayıt Ol ve Puan Kazan
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/">Ana Sayfaya Dön</Link>
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
        <Card glass>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Geri Bildirim</CardTitle>
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
              <Label className="text-center block">Deneyiminizi Değerlendirin</Label>
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
                  {rating === 5 && 'Mükemmel! 🌟'}
                  {rating === 4 && 'Çok İyi! 😊'}
                  {rating === 3 && 'İyi 👍'}
                  {rating === 2 && 'Geliştirilmeli 🤔'}
                  {rating === 1 && 'Kötü 😞'}
                </motion.p>
              )}
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="comment">Yorumunuz (opsiyonel)</Label>
              <textarea
                id="comment"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Deneyiminizi detaylı anlatın..."
                rows={4}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                maxLength={2000}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {text.trim().length > 50 && (
                    <span className="text-primary">+50 bonus puan!</span>
                  )}
                </span>
                <span>{text.length}/2000</span>
              </div>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Fotoğraf Ekle (opsiyonel)</Label>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {images.map((img, index) => (
                    <motion.div
                      key={index}
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
                  Giriş yapın
                </Link>{' '}
                ve geri bildirimleriniz için puan kazanın!
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
                  Gönderiliyor...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Gönder
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}



