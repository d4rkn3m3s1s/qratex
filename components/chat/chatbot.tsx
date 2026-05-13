'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Minimize2,
  Maximize2,
  Zap,
  Star,
  Brain,
  Rocket,
  Heart,
  Coffee,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { floatingZTw } from '@/lib/ui-z';
import { TW_BRAND_HEADLINE_GRADIENT } from '@/lib/tw-brand-classes';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hey! Ben QRA — minik pencereden bile büyük işler çıkaran yardımcın. Bugün aklında ne var? Sor, merak ettiğini yaz, birlikte halledelim.',
  timestamp: new Date(),
};

const QUICK_ACTIONS = [
  { label: 'QRATEX nedir?', message: 'QRATEX nedir ve nasıl çalışır?', icon: Rocket },
  { label: 'Puan & rozet', message: 'Puan ve rozet sistemi nasıl çalışıyor?', icon: Star },
  { label: 'QR oluşturma', message: 'QR kod nasıl oluşturabilirim?', icon: Zap },
  { label: 'Yardım iste', message: 'Bana yardım eder misin?', icon: Heart },
];

const TYPING_MESSAGES = [
  'Hmm, düşünüyorum…',
  'Cevabı paketliyorum…',
  'Neredeyse…',
  'Son dokunuşlar…',
];

/** Sohbet gövdesinde çok hafif sıvı-cam ışık lekeleri (yeşil / nabız yok) */
function LiquidGlassWash({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.55] dark:opacity-40" aria-hidden>
      <div className="absolute -left-[20%] top-0 h-[75%] w-[65%] rounded-full bg-gradient-to-br from-sky-200/30 via-transparent to-transparent blur-3xl dark:from-sky-500/[0.12]" />
      <div className="absolute -right-[18%] bottom-0 h-[65%] w-[55%] rounded-full bg-gradient-to-tl from-violet-200/25 via-transparent to-transparent blur-3xl dark:from-violet-500/[0.1]" />
    </div>
  );
}

/** iOS benzeri buzlu cam kabuk — panel & FAB */
const glassShell = cn(
  'border border-white/40 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.18),inset_0_1px_0_0_rgba(255,255,255,0.55)]',
  'bg-white/[0.72] backdrop-blur-2xl backdrop-saturate-150',
  'dark:border-white/[0.08] dark:bg-zinc-950/45 dark:shadow-[0_24px_56px_-14px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)]'
);

const glassBubbleAssistant = cn(
  'border border-white/45 bg-white/50 text-foreground shadow-sm backdrop-blur-md',
  'dark:border-white/[0.07] dark:bg-white/[0.06]'
);

const glassBubbleUser = cn(
  'border border-sky-400/35 bg-sky-500/[0.42] text-white shadow-sm backdrop-blur-md',
  'dark:border-sky-400/25 dark:bg-sky-600/45'
);

const glassAvatarFrame = cn(
  'rounded-full bg-gradient-to-b from-white/60 to-white/15 p-[2px] shadow-sm ring-1 ring-white/35 backdrop-blur-sm',
  'dark:from-white/25 dark:to-white/[0.04] dark:ring-white/10'
);

/** QRA maskot PNG — doygunluk / kontrast / primary glow (cam altında renkler belirgin) */
const qraMascotImgFilter = cn(
  'object-cover saturate-[1.22] contrast-[1.08] brightness-[1.05]',
  'drop-shadow-[0_2px_12px_hsl(var(--primary)/0.42)]',
  'dark:saturate-[1.34] dark:brightness-[1.1] dark:drop-shadow-[0_2px_16px_hsl(var(--primary)/0.48)]',
  'transition-[filter,transform] duration-300 ease-out',
  'group-hover:saturate-[1.38] group-hover:brightness-[1.08] group-hover:drop-shadow-[0_3px_16px_hsl(var(--primary)/0.52)]'
);

const qraMascotImgFilterStatic = cn(
  'object-cover saturate-[1.2] contrast-[1.06] brightness-[1.04]',
  'drop-shadow-[0_2px_10px_hsl(var(--primary)/0.38)]',
  'dark:saturate-[1.28] dark:brightness-[1.08] dark:drop-shadow-[0_2px_14px_hsl(var(--primary)/0.44)]'
);

/** FAB hover — küçük sıvı cam baloncukları (yalnızca fine pointer / fare) */
const FAB_LIQUID_BUBBLES = [
  { id: 'a', left: '6%', top: '78%', size: 7, rise: 20, drift: 5, delay: 0 },
  { id: 'b', left: '88%', top: '70%', size: 5, rise: 26, drift: -4, delay: 0.15 },
  { id: 'c', left: '18%', top: '8%', size: 6, rise: 22, drift: -3, delay: 0.08 },
  { id: 'd', left: '72%', top: '4%', size: 5, rise: 24, drift: 4, delay: 0.22 },
  { id: 'e', left: '2%', top: '38%', size: 4, rise: 18, drift: 3, delay: 0.28 },
  { id: 'f', left: '92%', top: '32%', size: 6, rise: 21, drift: -5, delay: 0.12 },
  { id: 'g', left: '48%', top: '0%', size: 4, rise: 19, drift: 2, delay: 0.35 },
] as const;

export function Chatbot() {
  const { data: session } = useSession();
  const prefersReducedMotion = useReducedMotion();
  const motionLite = prefersReducedMotion === true;
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  const [typingMessage, setTypingMessage] = useState(TYPING_MESSAGES[0]);
  const [botImageOk, setBotImageOk] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(pointer: fine)');
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closePanel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closePanel]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const gap = typeof window !== 'undefined' ? window.innerWidth - document.documentElement.clientWidth : 0;
    document.body.style.overflow = 'hidden';
    if (gap > 0) {
      document.body.style.paddingRight = `${gap}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setTypingMessage(TYPING_MESSAGES[Math.floor(Math.random() * TYPING_MESSAGES.length)]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          conversationHistory,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const waitSec = Math.max(
          1,
          Math.ceil((typeof data.retryAfterMs === 'number' ? data.retryAfterMs : 60_000) / 1000)
        );
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            response.status === 429
              ? `Vay, çok hızlısın! Dakika kotası doldu — ${waitSec} sn sonra tekrar dene. (Giriş yapan müşteriler de sınırlı; bayi ve admin daha rahat.)`
              : (data.error as string) || 'Yanıt alınamadı.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || 'Yanıt alınamadı.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Bağlantı hatası. Lütfen tekrar deneyin.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const fabSpring = { type: 'spring' as const, stiffness: 260, damping: 22 };
  const panelSpring = { type: 'spring' as const, stiffness: 380, damping: 34 };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={fabSpring}
            className={cn(
              floatingZTw.assistant,
              'fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[45] flex flex-col items-end gap-2 sm:bottom-8 sm:right-8 sm:flex-row sm:items-end sm:justify-end sm:gap-3 md:bottom-10 md:right-10'
            )}
          >
            <motion.button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={false}
              aria-controls="qratex-chatbot-panel"
              aria-label="QRA sohbetini aç"
              onClick={() => setIsOpen(true)}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              animate={
                motionLite
                  ? undefined
                  : {
                      y: [0, -3, 0],
                    }
              }
              transition={
                motionLite
                  ? undefined
                  : {
                      y: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
                    }
              }
              className="group relative isolate flex h-[3.75rem] w-[3.75rem] shrink-0 touch-manipulation cursor-pointer items-center justify-center overflow-visible rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-16 sm:w-16"
            >
              <div
                className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-b from-white/80 via-white/25 to-transparent opacity-90 blur-xl dark:from-white/25 dark:via-white/10 dark:opacity-60"
                aria-hidden
              />

              <AnimatePresence>
                {isHovered && finePointer && !motionLite && (
                  <motion.div
                    key="fab-liquid-bubbles"
                    className="pointer-events-none absolute inset-0 z-[5]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {FAB_LIQUID_BUBBLES.map((b) => (
                      <motion.span
                        key={b.id}
                        className={cn(
                          'pointer-events-none absolute rounded-full border border-white/55',
                          'bg-gradient-to-br from-white/75 via-white/25 to-primary/20',
                          'shadow-[inset_0_1px_3px_rgba(255,255,255,0.95),0_2px_6px_-1px_rgba(0,0,0,0.12)]',
                          'backdrop-blur-sm dark:border-white/20 dark:from-white/40 dark:via-white/12 dark:to-primary/15',
                          'dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.25),0_2px_8px_-2px_rgba(0,0,0,0.35)]'
                        )}
                        style={{
                          left: b.left,
                          top: b.top,
                          width: b.size,
                          height: b.size,
                        }}
                        initial={{ opacity: 0, scale: 0.4, y: 0, x: 0 }}
                        animate={{
                          opacity: [0, 0.92, 0.75, 0],
                          y: [0, -8 - b.rise, -14 - b.rise],
                          x: [0, b.drift * 0.6, b.drift],
                          scale: [0.5, 1, 0.85, 0.45],
                        }}
                        exit={{ opacity: 0, scale: 0.3, transition: { duration: 0.2 } }}
                        transition={{
                          duration: 2.35,
                          repeat: Infinity,
                          delay: b.delay,
                          ease: [0.22, 1, 0.36, 1],
                          repeatDelay: 0.35,
                        }}
                        aria-hidden
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                className={cn(
                  'relative z-10 flex h-[3.35rem] w-[3.35rem] items-center justify-center overflow-hidden rounded-full',
                  'border-[1.5px] border-white/65 bg-gradient-to-b from-white/55 via-white/30 to-white/[0.14]',
                  'shadow-[0_14px_36px_-10px_rgba(0,0,0,0.22),inset_0_2px_0_0_rgba(255,255,255,0.85),inset_0_-14px_28px_-6px_rgba(255,255,255,0.18)]',
                  'backdrop-blur-2xl backdrop-saturate-150',
                  'dark:border-white/22 dark:from-white/22 dark:via-white/12 dark:to-white/[0.05]',
                  'dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_-12px_24px_-8px_rgba(0,0,0,0.25)]',
                  'sm:h-14 sm:w-14'
                )}
                whileHover={motionLite ? undefined : { scale: 1.04 }}
                whileTap={{ scale: 0.92 }}
              >
                {!motionLite && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/[0.08]"
                    animate={{ x: ['-120%', '120%'] }}
                    transition={{ duration: 3.6, repeat: Infinity, ease: 'linear' }}
                    aria-hidden
                  />
                )}
                <motion.span
                  className="relative z-[1] flex items-center justify-center"
                  animate={isHovered && !motionLite ? { rotate: [0, -10, 10, 0] } : { rotate: 0 }}
                  transition={{ duration: 0.55 }}
                >
                  {botImageOk ? (
                    <Image
                      src="/logo/chatbot.png"
                      alt=""
                      width={56}
                      height={56}
                      priority
                      className={cn(
                        'h-[2.6rem] w-[2.6rem] rounded-full ring-1 ring-white/35 sm:h-12 sm:w-12 dark:ring-white/15',
                        qraMascotImgFilter
                      )}
                      onError={() => setBotImageOk(false)}
                    />
                  ) : (
                    <Bot className="h-7 w-7 text-primary sm:h-8 sm:w-8" aria-hidden />
                  )}
                </motion.span>
              </motion.div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="qra-open-layer"
            className="pointer-events-none fixed inset-0 z-[44]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.button
              type="button"
              aria-label="Sohbet panelini kapat"
              className="pointer-events-auto absolute inset-0 bg-black/45 backdrop-blur-md sm:bg-black/35"
              onClick={closePanel}
            />

            <motion.div
              initial={{ opacity: 0, y: 36, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={panelSpring}
              id="qratex-chatbot-panel"
              role="dialog"
              aria-modal="true"
              aria-label={isMinimized ? 'QRA sohbet — küçük görünüm' : 'QRA ile sohbet'}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                floatingZTw.assistant,
                'pointer-events-auto fixed flex flex-col overflow-hidden',
                glassShell,
                'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-bottom,0px)))] max-sm:w-full max-sm:rounded-t-[1.75rem] max-sm:rounded-b-none',
                'sm:bottom-[max(1rem,env(safe-area-inset-bottom,0px))] sm:right-[max(1rem,env(safe-area-inset-right,0px))] sm:left-auto sm:top-auto sm:max-h-[min(600px,calc(100dvh-5rem))] sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-[1.75rem]',
                'md:bottom-6 md:right-6 md:max-h-[min(640px,calc(100dvh-4rem))] md:w-[min(26rem,calc(100vw-3rem))]',
                isMinimized
                  ? cn(
                      'max-sm:inset-x-auto max-sm:left-auto max-sm:right-[max(0.75rem,env(safe-area-inset-right,0px))]',
                      'max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] max-sm:top-auto max-sm:h-auto max-sm:max-h-none',
                      'max-sm:w-auto max-sm:max-w-[min(20rem,calc(100vw-1.5rem))] max-sm:rounded-2xl max-sm:shadow-2xl',
                      'max-sm:ring-1 max-sm:ring-white/30 dark:max-sm:ring-white/10',
                      'h-auto sm:h-auto sm:min-h-0 sm:w-max sm:max-w-[min(21rem,calc(100vw-2rem))] md:w-max'
                    )
                  : 'max-sm:h-[min(88dvh,calc(100dvh-1rem))] sm:h-[min(560px,calc(100dvh-5rem))] md:h-[min(580px,calc(100dvh-4.5rem))]'
              )}
            >
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 top-0 z-[1]',
                  isMinimized
                    ? 'h-px rounded-t-2xl bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/15'
                    : 'h-px rounded-t-[1.75rem] bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/12 md:h-[2px]'
                )}
                aria-hidden
              />

              <header
                className={cn(
                  'relative flex shrink-0 items-center justify-between gap-2 sm:gap-3',
                  isMinimized
                    ? 'border-b-0 px-2.5 py-2 sm:px-3 sm:py-2'
                    : 'border-b border-white/20 px-3 py-3 dark:border-white/[0.06] sm:px-4 sm:py-3.5'
                )}
              >
                <div
                  className="absolute inset-0 -z-0 bg-gradient-to-b from-white/40 to-transparent opacity-90 dark:from-white/[0.05] dark:to-transparent dark:opacity-100"
                  aria-hidden
                />
                {!motionLite && !isMinimized && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent dark:via-white/5"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    aria-hidden
                  />
                )}

                <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                  <motion.div
                    className="relative shrink-0"
                    animate={motionLite || isMinimized ? undefined : { y: [0, -2, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <div
                      className={cn(
                        glassAvatarFrame,
                        isMinimized ? 'h-9 w-9' : 'h-10 w-10 sm:h-11 sm:w-11'
                      )}
                    >
                      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white/50 backdrop-blur-sm dark:bg-zinc-900/55">
                        {botImageOk ? (
                          <Image
                            src="/logo/chatbot.png"
                            alt=""
                            width={48}
                            height={48}
                            className={cn('h-full w-full', qraMascotImgFilterStatic)}
                            onError={() => setBotImageOk(false)}
                          />
                        ) : (
                          <Brain
                            className={cn('text-primary', isMinimized ? 'h-5 w-5' : 'h-6 w-6 sm:h-7 sm:w-7')}
                            aria-hidden
                          />
                        )}
                      </div>
                    </div>
                  </motion.div>

                  <div className="min-w-0">
                    <h3 className="flex min-w-0 flex-wrap items-center gap-2 truncate text-sm font-semibold tracking-tight sm:text-base">
                      <span className={cn('truncate', TW_BRAND_HEADLINE_GRADIENT)}>QRA</span>
                      {!isMinimized && (
                        <>
                          <span className="hidden rounded-full border border-white/40 bg-white/35 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.06] sm:inline">
                            Asistan
                          </span>
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-foreground/50 motion-reduce:hidden sm:h-4 sm:w-4" aria-hidden />
                        </>
                      )}
                    </h3>
                    {!isMinimized && (
                      <>
                        <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">QRATEX için yapay zeka yardımcısı</p>
                        <motion.p
                          className="mt-1 flex min-h-[1.125rem] items-center gap-1.5 truncate text-[11px] text-muted-foreground sm:mt-1.5 sm:text-xs"
                          key={isLoading ? typingMessage : 'idle'}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          {isLoading ? (
                            <>
                              <Zap className="h-3.5 w-3.5 shrink-0 text-foreground/45 motion-reduce:animate-none animate-pulse sm:h-4 sm:w-4" />
                              <span className="truncate text-foreground/90">{typingMessage}</span>
                            </>
                          ) : (
                            <>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" aria-hidden />
                              <span className="truncate">Çevrimiçi · Hazırım</span>
                            </>
                          )}
                        </motion.p>
                      </>
                    )}
                  </div>
                </div>

                <div className="relative z-[1] flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={isMinimized ? 'Sohbeti genişlet' : 'Küçült'}
                    type="button"
                    className={cn(
                      'touch-manipulation rounded-xl border border-transparent hover:border-white/25 hover:bg-white/25 dark:hover:bg-white/[0.06]',
                      isMinimized ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-9 w-9 sm:h-10 sm:w-10'
                    )}
                    onClick={() => setIsMinimized(!isMinimized)}
                  >
                    {isMinimized ? (
                      <Maximize2 className="h-4 w-4 text-foreground sm:h-[1.125rem] sm:w-[1.125rem]" />
                    ) : (
                      <Minimize2 className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    aria-label="Kapat"
                    className={cn(
                      'touch-manipulation rounded-xl border border-transparent hover:border-white/20 hover:bg-red-500/10 hover:text-destructive dark:hover:bg-red-950/30',
                      isMinimized ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-9 w-9 sm:h-10 sm:w-10'
                    )}
                    onClick={closePanel}
                  >
                    <X className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
                  </Button>
                </div>
              </header>

              {!isMinimized && (
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <LiquidGlassWash enabled={!motionLite} />

                  <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-3 py-3 sm:px-4 sm:py-4">
                    <ul className="mx-auto max-w-none space-y-3 sm:space-y-3.5">
                      {messages.map((message, index) => (
                        <motion.li
                          key={message.id}
                          initial={{ opacity: 0, y: 12, filter: motionLite ? undefined : 'blur(3px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30,
                            delay: index === messages.length - 1 ? 0 : 0,
                          }}
                          className={cn('flex gap-2 sm:gap-2.5', message.role === 'user' ? 'flex-row-reverse' : '')}
                        >
                          <Avatar className="mt-0.5 h-8 w-8 shrink-0 ring-1 ring-white/35 ring-offset-1 ring-offset-transparent dark:ring-white/10 sm:h-9 sm:w-9">
                            {message.role === 'assistant' ? (
                              <>
                                {botImageOk ? <AvatarImage src="/logo/chatbot.png" alt="" className={qraMascotImgFilterStatic} /> : null}
                                <AvatarFallback className="border border-white/30 bg-white/55 text-primary backdrop-blur-md dark:border-white/10 dark:bg-zinc-800/70 dark:text-zinc-100">
                                  <Bot className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
                                </AvatarFallback>
                              </>
                            ) : (
                              <>
                                <AvatarImage src={session?.user?.image || ''} alt="" />
                                <AvatarFallback className="border border-white/30 bg-white/55 text-primary backdrop-blur-md dark:border-white/10 dark:bg-zinc-800/70 dark:text-zinc-100">
                                  <User className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
                                </AvatarFallback>
                              </>
                            )}
                          </Avatar>

                          <div
                            className={cn(
                              'max-w-[min(100%,17.5rem)] px-3 py-2 text-sm leading-relaxed sm:max-w-[min(100%,19rem)] sm:rounded-2xl sm:px-3.5 sm:py-2.5',
                              message.role === 'user'
                                ? cn(glassBubbleUser, 'rounded-2xl rounded-tr-md')
                                : cn(glassBubbleAssistant, 'rounded-2xl rounded-tl-md')
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                            <time
                              className={cn(
                                'mt-1.5 block text-[10px] tabular-nums sm:text-[11px]',
                                message.role === 'user' ? 'text-white/70' : 'text-muted-foreground'
                              )}
                              dateTime={message.timestamp.toISOString()}
                            >
                              {message.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </time>
                          </div>
                        </motion.li>
                      ))}
                    </ul>

                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mx-auto mt-3 flex gap-2 sm:mt-4 sm:gap-2.5"
                        aria-live="polite"
                      >
                        <Avatar className="h-8 w-8 shrink-0 ring-1 ring-white/35 ring-offset-1 ring-offset-transparent dark:ring-white/10 sm:h-9 sm:w-9">
                          {botImageOk ? <AvatarImage src="/logo/chatbot.png" alt="" className={qraMascotImgFilterStatic} /> : null}
                          <AvatarFallback className="border border-white/30 bg-white/55 text-primary backdrop-blur-md dark:border-white/10 dark:bg-zinc-800/70 dark:text-zinc-100">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={cn(
                            glassBubbleAssistant,
                            'rounded-2xl rounded-tl-md px-3 py-2 sm:px-3.5 sm:py-2.5'
                          )}
                        >
                          <div className="flex items-center gap-2 sm:gap-2.5">
                            <div className="flex gap-1.5">
                              {[0, 1, 2].map((i) => (
                                <motion.span
                                  key={i}
                                  className="h-2 w-2 rounded-full bg-foreground/20 dark:bg-white/25"
                                  animate={
                                    motionLite
                                      ? undefined
                                      : {
                                          y: [0, -6, 0],
                                          opacity: [0.45, 1, 0.45],
                                        }
                                  }
                                  transition={
                                    motionLite
                                      ? undefined
                                      : { duration: 0.55, repeat: Infinity, delay: i * 0.12 }
                                  }
                                />
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground">Yazıyorum…</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    <div ref={messagesEndRef} className="h-px w-full shrink-0" />
                  </div>

                  <AnimatePresence>
                    {messages.length <= 2 && !isLoading && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="shrink-0 border-t border-white/25 bg-white/25 px-3 pb-2 pt-3 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.04] sm:px-4 sm:pb-3 sm:pt-3.5"
                      >
                        <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-foreground">
                          <Lightbulb className="h-4 w-4 text-foreground/50" aria-hidden />
                          Hızlı başlangıç
                        </p>
                        <p className="mb-2.5 text-[11px] leading-snug text-muted-foreground sm:mb-3 sm:text-xs">
                          Aşağıdan seç veya yaz; masaüstünde <span className="font-medium text-foreground">Enter</span> gönderir,{' '}
                          <span className="font-medium text-foreground">Shift+Enter</span> satır kırar.
                        </p>
                        <div className="mx-auto grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
                          {QUICK_ACTIONS.map((action, i) => (
                            <motion.button
                              key={action.label}
                              type="button"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.04 * i, type: 'spring', stiffness: 400, damping: 34 }}
                              whileHover={motionLite ? undefined : { y: -1 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => sendMessage(action.message)}
                              className="flex min-h-11 touch-manipulation items-center gap-2.5 rounded-2xl border border-white/40 bg-white/45 p-2.5 text-left text-foreground shadow-sm backdrop-blur-md transition-[transform,box-shadow] hover:bg-white/55 hover:shadow-md dark:border-white/10 dark:bg-white/[0.07] dark:hover:bg-white/[0.1] sm:min-h-12 sm:gap-3 sm:p-3"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/35 bg-white/40 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.06] sm:h-9 sm:w-9">
                                <action.icon className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" aria-hidden />
                              </span>
                              <span className="text-[11px] font-semibold leading-snug sm:text-xs">{action.label}</span>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="shrink-0 border-t border-white/30 bg-white/30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-2xl dark:border-white/[0.07] dark:bg-zinc-950/40 sm:px-4 sm:pb-3.5 sm:pt-3.5">
                    <div className="mx-auto flex gap-2 sm:gap-2.5">
                      <div className="relative min-w-0 flex-1">
                        <textarea
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="Merhaba… veya sorunu yaz"
                          disabled={isLoading}
                          rows={1}
                          className={cn(
                            'min-h-[2.75rem] w-full resize-none touch-manipulation rounded-2xl border border-white/45 bg-white/50 px-3 py-2.5 text-sm leading-snug text-foreground placeholder:text-muted-foreground/75 backdrop-blur-md',
                            'focus:border-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                            'disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900/45 sm:min-h-11 sm:px-3.5 sm:py-3'
                          )}
                          style={{ maxHeight: 140 }}
                        />
                      </div>
                      <motion.div whileTap={{ scale: 0.94 }} className="shrink-0 self-end">
                        <Button
                          type="button"
                          aria-label="Gönder"
                          onClick={() => sendMessage(input)}
                          disabled={!input.trim() || isLoading}
                          size="icon"
                          className="h-11 w-11 touch-manipulation rounded-2xl border border-white/45 bg-gradient-to-b from-white/90 to-white/55 text-primary shadow-md backdrop-blur-md hover:from-white hover:to-white/70 disabled:opacity-50 dark:border-white/12 dark:from-zinc-700/95 dark:to-zinc-800/90 dark:text-white sm:h-12 sm:w-12"
                        >
                          <Send className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
                        </Button>
                      </motion.div>
                    </div>
                    <p className="mx-auto mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground sm:mt-2.5 sm:text-[11px]">
                      <Zap className="h-3 w-3 shrink-0 text-foreground/35 sm:h-3.5 sm:w-3.5" aria-hidden />
                      Groq ile hızlı yanıt
                      <Coffee className="h-3 w-3 shrink-0 text-foreground/35 sm:h-3.5 sm:w-3.5" aria-hidden />
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
