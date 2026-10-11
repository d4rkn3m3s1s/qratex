'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocaleSafe } from '@/lib/app-locale';
import { useFirstRunTurn } from '@/lib/first-run-queue';
import { useMotionPolicy } from '@/lib/motion/use-reduced-motion-pref';

/**
 * HOŞGELDİN VİDEO MODALI — müşteri giriş yaptıktan sonra bir kez açılan karşılama.
 *
 * Karakter videosu (sessiz başlar; kullanıcı sesi açabilir) + kişisel mesaj. "Bir kez göster"
 * mantığı localStorage ile (kullanıcı bazlı anahtar). Video dosyası yoksa modal HİÇ açılmaz.
 *
 * Erişilebilirlik (mobil-erisilebilirlik-i18n B6/B7/B8):
 *  - Radix Dialog: odak tuzağı, Esc ile kapanma, açanı geri odaklama, başlık/açıklama bağları
 *    (eskiden elle yazılmış Motion katmanıydı: Esc yok, odak tuzağı yok).
 *  - Otomatik oynatma hareket politikasına bağlı (OS ya da uygulama "Animasyonları azalt" →
 *    oynatmaz); görünür oynat/duraklat düğmesi (WCAG 2.2.2 — döngüdeki hareketli içerik).
 *  - İlk açılış sırası: tanıtım ve doğum günü katmanlarıyla aynı anda açılmaz (lib/first-run-queue).
 *  - Metinler uygulama dilinde.
 *
 * Video: public/videos/welcome-customer.mp4  (yoksa modal gösterilmez)
 */
const WELCOME_VIDEO_SRC = '/videos/welcome-customer.mp4';

const COPY = {
  tr: {
    title: (name: string | null) => (name ? `Hoş geldin, ${name}! 👋` : 'Hoş geldin! 👋'),
    body: 'QRateX’e katıldığın için teşekkürler. Deneyimini paylaş, puan kazan, rozet koleksiyonunu büyüt — hadi başlayalım!',
    start: 'Başlayalım',
    close: 'Kapat',
    unmute: 'Sesi aç',
    mute: 'Sesi kapat',
    play: 'Videoyu oynat',
    pause: 'Videoyu duraklat',
    video: 'Karşılama videosu',
  },
  en: {
    title: (name: string | null) => (name ? `Welcome, ${name}! 👋` : 'Welcome! 👋'),
    body: 'Thanks for joining QRateX. Share your experiences, earn points and grow your badge collection — let’s get started!',
    start: 'Let’s go',
    close: 'Close',
    unmute: 'Turn sound on',
    mute: 'Turn sound off',
    play: 'Play video',
    pause: 'Pause video',
    video: 'Welcome video',
  },
} as const;

/** Kullanıcıya özel "gördü" anahtarı (aynı tarayıcıda farklı hesap → ayrı kayıt). */
function storageKey(userId: string): string {
  return `qratex-welcome-video-seen:${userId}`;
}

const overlayButton =
  'absolute top-2 z-20 h-11 w-11 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white focus-visible:ring-2 focus-visible:ring-white';

export function WelcomeVideoModal() {
  const { data: session, status } = useSession();
  const copy = COPY[useLocaleSafe() === 'en' ? 'en' : 'tr'];
  const { allowAutoplay } = useMotionPolicy();
  const [wants, setWants] = useState<boolean | null>(null);
  const [closed, setClosed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { granted, finish } = useFirstRunTurn('welcome-video', wants);

  const userId = session?.user?.id ?? null;
  const firstName = (session?.user?.name ?? '').trim().split(/\s+/)[0] || null;

  useEffect(() => {
    if (status === 'loading') return;
    // Yalnız MÜŞTERİ panelinde karşılama (bayi/admin görmesin).
    if (status !== 'authenticated' || !userId || session?.user?.role !== 'CUSTOMER') {
      setWants(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(storageKey(userId)) === 'true') {
          if (!cancelled) setWants(false);
          return;
        }
      } catch { /* localStorage kapalıysa yine de göster */ }

      // Video dosyası gerçekten var mı? Yoksa modalı hiç açma (kırık kutu görünmesin).
      let exists = false;
      try {
        const res = await fetch(WELCOME_VIDEO_SRC, { method: 'HEAD' });
        exists = res.ok;
      } catch {
        exists = false;
      }
      if (!cancelled) setWants(exists);
    })();

    return () => { cancelled = true; };
  }, [status, userId, session?.user?.role]);

  const open = granted && !closed;

  const close = () => {
    if (userId) {
      try { localStorage.setItem(storageKey(userId), 'true'); } catch { /* yoksay */ }
    }
    setClosed(true);
    finish();
  };

  // Hareket serbestse sessiz otomatik oynat; azaltılmışta kullanıcı başlatır.
  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v || !allowAutoplay) return;
    void v.play().catch(() => {});
  }, [open, allowAutoplay]);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    // Ses açılınca baştan oynat (kullanıcı mesajı baştan duysun).
    if (!v.muted) { v.currentTime = 0; void v.play().catch(() => {}); }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto p-4 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-neutral-950 shadow-2xl">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label={copy.close} className={`${overlayButton} right-2`}>
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </DialogPrimitive.Close>

            <div className="absolute left-2 top-2 z-20 flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={playing ? copy.pause : copy.play}
                className={`${overlayButton} static`}
                onClick={togglePlay}
              >
                {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
              </Button>
              {/* Ses aç/kapa — tarayıcılar sesli otomatik oynatmayı engeller, sessiz başlar */}
              <Button
                variant="ghost"
                size="icon"
                aria-label={muted ? copy.unmute : copy.mute}
                aria-pressed={!muted}
                className={`${overlayButton} static`}
                onClick={toggleSound}
              >
                {muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
              </Button>
            </div>

            <video
              ref={videoRef}
              src={WELCOME_VIDEO_SRC}
              muted
              loop
              playsInline
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              className="h-auto w-full bg-neutral-900 object-cover"
              aria-label={copy.video}
            />

            <div className="space-y-3 p-5 text-center">
              <DialogPrimitive.Title className="text-2xl font-extrabold text-white">
                {copy.title(firstName)}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm leading-relaxed text-white/80">
                {copy.body}
              </DialogPrimitive.Description>
              <Button onClick={close} className="w-full" size="lg">
                {copy.start}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
