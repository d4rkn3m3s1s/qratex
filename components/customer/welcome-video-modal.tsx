'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * HOŞGELDİN VİDEO MODALI — müşteri giriş yaptıktan sonra bir kez açılan karşılama.
 *
 * Karakter videosu (sessiz otomatik oynatır; kullanıcı sesi açabilir) + kişisel mesaj.
 * "Bir kez göster" mantığı localStorage ile (kullanıcı bazlı anahtar) — kapatınca
 * bir daha açılmaz. Video dosyası yoksa modal HİÇ açılmaz (sessizce devre dışı),
 * yani dosya eklenene kadar kullanıcı bir şey görmez.
 *
 * Video: public/videos/welcome-customer.mp4  (yoksa modal gösterilmez)
 */

/**
 * Video yolu — SABİT ad. Videoyu değiştirmek için kodu düzenlemeye gerek yok:
 * yeni dosyayı aynı adla (public/videos/welcome-customer.mp4) üzerine yaz, yeter.
 */
const WELCOME_VIDEO_SRC = '/videos/welcome-customer.mp4';

/** Kullanıcıya özel "gördü" anahtarı (aynı tarayıcıda farklı hesap → ayrı kayıt). */
function storageKey(userId: string): string {
  return `qratex-welcome-video-seen:${userId}`;
}

export function WelcomeVideoModal() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const userId = session?.user?.id ?? null;
  const firstName = (session?.user?.name ?? '').trim().split(/\s+/)[0] || null;

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    // Yalnız MÜŞTERİ panelinde karşılama (bayi/admin görmesin).
    if (session?.user?.role !== 'CUSTOMER') return;

    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(storageKey(userId)) === 'true') return; // zaten gördü
      } catch { /* localStorage kapalıysa yine de göster */ }

      // Video dosyası gerçekten var mı? Yoksa modalı hiç açma (kırık kutu görünmesin).
      try {
        const res = await fetch(WELCOME_VIDEO_SRC, { method: 'HEAD' });
        if (!res.ok) return;
      } catch {
        return; // erişilemiyorsa sessizce vazgeç
      }
      if (!cancelled) setOpen(true);
    })();

    return () => { cancelled = true; };
  }, [status, userId, session?.user?.role]);

  const close = () => {
    if (userId) {
      try { localStorage.setItem(storageKey(userId), 'true'); } catch { /* yoksay */ }
    }
    setOpen(false);
  };

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    // Ses açılınca baştan oynat (kullanıcı mesajı baştan duysun).
    if (!v.muted) { v.currentTime = 0; void v.play().catch(() => {}); }
  };

  return (
    <AnimatePresence>
      {open && (
        <Motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Hoş geldin"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[70] overflow-y-auto bg-black/70 backdrop-blur-md"
          onClick={close}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <Motion.div
              initial={{ scale: 0.92, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 24, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-neutral-950 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="Kapat"
                className="absolute right-2 top-2 z-20 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white"
                onClick={close}
              >
                <X className="h-5 w-5" />
              </Button>

              {/* Ses aç/kapa — tarayıcılar sesli otomatik oynatmayı engeller, sessiz başlar */}
              <Button
                variant="ghost"
                size="icon"
                aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
                className="absolute left-2 top-2 z-20 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white"
                onClick={toggleSound}
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>

              <video
                ref={videoRef}
                src={WELCOME_VIDEO_SRC}
                autoPlay
                muted
                loop
                playsInline
                className="h-auto w-full bg-neutral-900 object-cover"
                aria-label="Karşılama videosu"
              />

              <div className="space-y-3 p-5 text-center">
                <h2 className="text-2xl font-extrabold text-white">
                  {firstName ? `Hoş geldin, ${firstName}! 👋` : 'Hoş geldin! 👋'}
                </h2>
                <p className="text-sm leading-relaxed text-white/70">
                  QRateX’e katıldığın için teşekkürler. Deneyimini paylaş, puan kazan,
                  rozet koleksiyonunu büyüt — hadi başlayalım!
                </p>
                <Button onClick={close} className="w-full" size="lg">
                  Başlayalım
                </Button>
              </div>
            </Motion.div>
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}
