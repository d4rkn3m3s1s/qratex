'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useReducedMotion } from 'framer-motion';
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Minimize2,
  Maximize2,
  Zap,
  Star,
  Wand2,
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
import {
  TW_BRAND_AURA_LINEAR,
  TW_BRAND_AVATAR_HALO,
  TW_BRAND_CHAT_HEADER_BG,
  TW_BRAND_DOT,
  TW_BRAND_FACE_GRADIENT,
  TW_BRAND_GRADIENT_STOPS_SOFT,
  TW_BRAND_HEADLINE_GRADIENT,
  TW_BRAND_ORB_FILL,
  TW_BRAND_PANEL_SHELL_SOFT,
  TW_BRAND_SEND_BTN,
  TW_BRAND_USER_BUBBLE,
} from '@/lib/tw-brand-classes';

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
  { label: 'QRATEX nedir?', message: 'QRATEX nedir ve nasıl çalışır?', icon: Rocket, color: 'from-primary to-primary/80' },
  { label: 'Puan & rozet', message: 'Puan ve rozet sistemi nasıl çalışıyor?', icon: Star, color: 'from-amber-500 to-orange-500' },
  { label: 'QR oluşturma', message: 'QR kod nasıl oluşturabilirim?', icon: Zap, color: 'from-cyan-500 to-blue-500' },
  { label: 'Yardım iste', message: 'Bana yardım eder misin?', icon: Heart, color: TW_BRAND_GRADIENT_STOPS_SOFT },
];

const TYPING_MESSAGES = [
  'Hmm, düşünüyorum…',
  'Cevabı paketliyorum…',
  'Neredeyse…',
  'Son dokunuşlar…',
];

// Floating particles component
const FloatingParticles = ({ enabled }: { enabled: boolean }) => {
  if (!enabled) return null;
  return (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    {[...Array(6)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-1 h-1 bg-primary/40 rounded-full"
        initial={{ 
          x: Math.random() * 100, 
          y: Math.random() * 100,
          opacity: 0 
        }}
        animate={{
          x: [null, Math.random() * 100 - 50],
          y: [null, Math.random() * 100 - 50],
          opacity: [0, 1, 0],
        }}
        transition={{
          duration: 3 + Math.random() * 2,
          repeat: Infinity,
          delay: i * 0.5,
        }}
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
        }}
      />
    ))}
  </div>
  );
};

// Glowing orb for FAB
function GlowingOrb({ isHovered, reducedMotion }: { isHovered: boolean; reducedMotion: boolean }) {
  if (reducedMotion) {
    return (
      <div
        className={cn('absolute inset-0 rounded-full opacity-40', TW_BRAND_AURA_LINEAR)}
        aria-hidden
      />
    );
  }
  return (
    <>
      <motion.div
        className={cn('absolute inset-0 rounded-full', TW_BRAND_AURA_LINEAR)}
        animate={{
          scale: isHovered ? [1, 1.2, 1] : 1,
          opacity: isHovered ? [0.5, 0.8, 0.5] : 0.5,
        }}
        transition={{ duration: 1.5, repeat: Infinity }}
        aria-hidden
      />
      <motion.div
        className={cn('absolute -inset-1 rounded-full blur-lg', TW_BRAND_AURA_LINEAR)}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 2, repeat: Infinity }}
        aria-hidden
      />
    </>
  );
}

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
  const [typingMessage, setTypingMessage] = useState(TYPING_MESSAGES[0]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Mouse tracking for FAB
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-100, 100], [10, -10]);
  const rotateY = useTransform(mouseX, [-100, 100], [-10, 10]);
  const springRotateX = useSpring(rotateX, { stiffness: 150, damping: 20 });
  const springRotateY = useSpring(rotateY, { stiffness: 150, damping: 20 });

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

  /** Arkaplan kaydırmasını tam genişlikte panel açıkken kapatır; scrollbar payı için padding telafisi */
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

  // Rotate typing message
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setTypingMessage(TYPING_MESSAGES[Math.floor(Math.random() * TYPING_MESSAGES.length)]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    mouseX.set(e.clientX - centerX);
    mouseY.set(e.clientY - centerY);
  };

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

  return (
    <>
      {/* Epic Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -180 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0, rotate: 180 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className={cn(
              'fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))]',
              floatingZTw.assistant
            )}
          >
            <motion.button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={false}
              aria-controls="qratex-chatbot-panel"
              aria-label="QRA sohbetini aç — yardıma hazırım"
              onClick={() => setIsOpen(true)}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => {
                setIsHovered(false);
                mouseX.set(0);
                mouseY.set(0);
              }}
              onMouseMove={handleMouseMove}
              style={{
                rotateX: springRotateX,
                rotateY: springRotateY,
                transformStyle: 'preserve-3d',
              }}
              className="group relative flex h-16 w-16 touch-manipulation cursor-pointer items-center justify-center rounded-full shadow-2xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <GlowingOrb isHovered={isHovered} reducedMotion={motionLite} />
              
              {/* Main button */}
              <motion.div
                className={cn(
                  'relative z-10 h-14 w-14 rounded-full flex items-center justify-center overflow-hidden shadow-inner',
                  TW_BRAND_ORB_FILL
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {/* Animated background */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
                
                {/* Bot icon or image */}
                <motion.div
                  animate={isHovered ? { rotate: [0, -10, 10, 0] } : {}}
                  transition={{ duration: 0.5 }}
                >
                  <Image
                    src="/logo/chatbot.png"
                    alt="QRA Chatbot"
                    width={48}
                    height={48}
                    priority
                    className="object-cover rounded-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <Bot className="h-7 w-7 text-white hidden first:block" />
                </motion.div>
              </motion.div>

              {/* Notification badge with pulse */}
              <motion.span 
                className="absolute -top-1 -right-1 flex h-5 w-5"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
              >
                <motion.span 
                  className="absolute inline-flex h-full w-full rounded-full bg-green-400"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="relative inline-flex rounded-full h-5 w-5 bg-green-500 items-center justify-center">
                  <Sparkles className="h-3 w-3 text-white" />
                </span>
              </motion.span>

              {/* Hover tooltip */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, x: 10, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 10, scale: 0.8 }}
                    className="absolute right-full mr-3 max-w-[200px] rounded-2xl border border-primary/20 bg-background/95 px-3.5 py-2.5 shadow-xl shadow-primary/10 backdrop-blur-md"
                  >
                    <p className="text-sm font-bold leading-tight text-foreground">QRA burada</p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      Soru sor, birlikte çözelim — tek dokunuş yeter.
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                      <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Hazırım, bekliyorum
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Orbiting particles */}
            {isHovered && !motionLite && (
              <>
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={cn('absolute h-2 w-2 rounded-full', TW_BRAND_DOT)}
                    style={{
                      top: '50%',
                      left: '50%',
                    }}
                    animate={{
                      x: [0, Math.cos(i * 120 * (Math.PI / 180)) * 40],
                      y: [0, Math.sin(i * 120 * (Math.PI / 180)) * 40],
                      scale: [0, 1, 0],
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Epic Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            id="qratex-chatbot-panel"
            role="dialog"
            aria-modal="true"
            aria-label="QRA ile sohbet"
            className={cn(
              'fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] flex max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden',
              floatingZTw.assistant,
              isMinimized
                ? 'h-16 w-[min(22rem,calc(100vw-2rem))] sm:w-80'
                : 'h-[min(550px,calc(100dvh-5rem))] w-[min(400px,calc(100vw-2rem))] sm:h-[min(600px,calc(100dvh-4rem))] sm:w-[420px]'
            )}
          >
            {/* Glassmorphism container */}
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl" />
            
            {/* Animated gradient border */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl p-[1px]">
              {!motionLite ? (
                <motion.div
                  className="absolute inset-[-50%] bg-gradient-conic from-primary via-primary/80 via-violet-500 via-orange-500 via-yellow-500 via-green-500 via-cyan-500 to-primary"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  style={{ opacity: 0.3 }}
                  aria-hidden
                />
              ) : (
                <div className={cn('absolute inset-0 rounded-3xl', TW_BRAND_PANEL_SHELL_SOFT)} aria-hidden />
              )}
            </div>

            {/* Content wrapper */}
            <div className="relative flex flex-col h-full rounded-3xl overflow-hidden">
              {/* Epic Header */}
              <motion.div 
                className="relative flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4"
                initial={false}
              >
                {/* Header background with animated gradient */}
                <div className={cn('absolute inset-0', TW_BRAND_CHAT_HEADER_BG)} />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                
                <div className="relative flex items-center gap-3">
                  {/* Animated avatar */}
                  <motion.div 
                    className="relative"
                    whileHover={{ scale: 1.1 }}
                  >
                    <motion.div
                      className={cn('absolute -inset-1 rounded-full blur-sm', TW_BRAND_AVATAR_HALO)}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <div
                      className={cn(
                        'relative h-11 w-11 overflow-hidden rounded-full p-0.5',
                        TW_BRAND_FACE_GRADIENT
                      )}
                    >
                      <div className="h-full w-full rounded-full overflow-hidden bg-background flex items-center justify-center">
                        <Image
                          src="/logo/chatbot.png"
                          alt="QRA"
                          width={44}
                          height={44}
                          className="object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <Brain className="h-6 w-6 text-primary hidden first:block" />
                      </div>
                    </div>
                    <motion.span 
                      className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-background"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </motion.div>
                  
                  <div>
                    <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold sm:text-base">
                      <span className={cn('truncate', TW_BRAND_HEADLINE_GRADIENT)}>
                        QRA
                      </span>
                      {!isMinimized && (
                        <Sparkles className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                      )}
                    </h3>
                    <motion.p
                      className="flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs"
                      key={isMinimized ? 'mini' : isLoading ? typingMessage : 'online'}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {isMinimized ? (
                        <span className="truncate text-primary/90">
                          Küçük mod — genişlet, devam edelim
                        </span>
                      ) : isLoading ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          >
                            <Zap className="h-3 w-3 text-amber-400" />
                          </motion.span>
                          <span className="text-foreground/80">{typingMessage}</span>
                        </>
                      ) : (
                        <>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          <span>Tatlı ama hızlı · Hazırım</span>
                        </>
                      )}
                    </motion.p>
                  </div>
                </div>
                
                <div className="relative flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={isMinimized ? 'Sohbeti genişlet — hadi devam' : 'Sohbeti küçült — minik mod'}
                    title={isMinimized ? 'Genişlet, konuşalım' : 'Küçült — kenarda dursun'}
                    type="button"
                    className="h-11 w-11 touch-manipulation rounded-xl transition-colors duration-200 hover:bg-white/10 sm:h-9 sm:w-9"
                    onClick={() => setIsMinimized(!isMinimized)}
                  >
                    {isMinimized ? (
                      <Maximize2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Minimize2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    aria-label="Sohbeti kapat — görüşürüz"
                    title="Kapat"
                    className="h-11 w-11 touch-manipulation rounded-xl transition-colors duration-200 hover:bg-red-500/20 hover:text-red-500 sm:h-9 sm:w-9"
                    onClick={closePanel}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>

              {/* Messages Area */}
              {!isMinimized && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                  {/* Floating particles in chat */}
                  <FloatingParticles enabled={!motionLite} />
                  
                  {/* Messages container - scrollable */}
                  <div
                    className="flex-1 space-y-4 overflow-y-auto overscroll-contain touch-pan-y p-4"
                    style={{ overflowY: 'auto' }}
                  >
                    {messages.map((message, index) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 20, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ 
                            type: 'spring',
                            stiffness: 300,
                            damping: 25,
                            delay: index === messages.length - 1 ? 0 : 0 
                          }}
                          className={`flex gap-3 ${
                            message.role === 'user' ? 'flex-row-reverse' : ''
                          }`}
                        >
                          {/* Avatar */}
                          <motion.div whileHover={{ scale: 1.1 }}>
                            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-offset-2 ring-offset-background ring-primary/20">
                              {message.role === 'assistant' ? (
                                <AvatarImage src="/logo/chatbot.png" alt="QRA" />
                              ) : (
                                <>
                                  <AvatarImage src={session?.user?.image || ''} />
                                  <AvatarFallback className={cn(TW_BRAND_FACE_GRADIENT, 'text-white')}>
                                    <User className="h-4 w-4" />
                                  </AvatarFallback>
                                </>
                              )}
                            </Avatar>
                          </motion.div>
                          
                          {/* Message bubble */}
                          <motion.div
                            whileHover={{ scale: 1.02 }}
                            className={`relative max-w-[80%] ${
                              message.role === 'user'
                                ? cn(TW_BRAND_USER_BUBBLE, 'rounded-2xl rounded-tr-sm')
                                : 'rounded-2xl rounded-tl-sm border border-border/50 bg-muted/80 backdrop-blur-sm'
                            } px-4 py-3 shadow-lg`}
                          >
                            {/* Shine effect for user messages */}
                            {message.role === 'user' && (
                              <motion.div
                                className="absolute inset-0 rounded-2xl rounded-tr-sm bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                initial={{ x: '-100%' }}
                                animate={{ x: '100%' }}
                                transition={{ duration: 1, delay: 0.5 }}
                              />
                            )}
                            
                            <p className="text-sm whitespace-pre-wrap relative">{message.content}</p>
                            <span className={`text-[10px] mt-1.5 block ${
                              message.role === 'user' ? 'text-white/70' : 'text-muted-foreground'
                            }`}>
                              {message.timestamp.toLocaleTimeString('tr-TR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </motion.div>
                        </motion.div>
                      ))}
                      
                      {/* Loading indicator */}
                      {isLoading && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex gap-3"
                        >
                          <Avatar className="h-9 w-9 ring-2 ring-offset-2 ring-offset-background ring-primary/20">
                            <AvatarImage src="/logo/chatbot.png" alt="QRA" />
                          </Avatar>
                          <div className="bg-muted/80 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3 border border-border/50">
                            <div className="flex items-center gap-2">
                              <motion.div className="flex gap-1">
                                {[0, 1, 2].map((i) => (
                                  <motion.span
                                    key={i}
                                    className={cn('h-2 w-2 rounded-full', TW_BRAND_DOT)}
                                    animate={{
                                      y: [0, -8, 0],
                                      scale: [1, 1.2, 1],
                                    }}
                                    transition={{
                                      duration: 0.6,
                                      repeat: Infinity,
                                      delay: i * 0.1,
                                    }}
                                  />
                                ))}
                              </motion.div>
                              <motion.span
                                className="text-xs text-muted-foreground"
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              >
                                Hmm, düşünüyorum…
                              </motion.span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Actions - Epic Cards */}
                    <AnimatePresence>
                      {messages.length <= 2 && !isLoading && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                          className="px-4 pb-3 shrink-0"
                        >
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                            Hadi başlayalım
                          </p>
                          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                            Aşağıdan birini seç veya aklına geleni yaz.
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {QUICK_ACTIONS.map((action, i) => (
                              <motion.button
                                key={action.label}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                whileHover={motionLite ? undefined : { scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="button"
                                onClick={() => sendMessage(action.message)}
                                className={`group relative overflow-hidden rounded-xl bg-gradient-to-br p-3 text-left text-white touch-manipulation transition-transform duration-200 ${action.color}`}
                              >
                                <motion.div
                                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                  initial={{ x: '-100%' }}
                                  whileHover={{ x: '100%' }}
                                  transition={{ duration: 0.5 }}
                                />
                                <action.icon className="h-4 w-4 mb-1 group-hover:scale-110 transition-transform" />
                                <span className="text-xs font-medium block">{action.label}</span>
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Epic Input Area */}
                    <div className="relative p-4 border-t border-border/30 shrink-0 bg-background/50 backdrop-blur-sm">
                      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                      
                      <div className="relative flex gap-2">
                        <div className="flex-1 relative group">
                          <motion.div
                            className={cn(
                              'absolute -inset-0.5 rounded-xl opacity-0 blur transition-opacity group-focus-within:opacity-100',
                              TW_BRAND_AURA_LINEAR
                            )}
                          />
                          <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Merhaba de… ya da merak ettiğini yaz"
                            disabled={isLoading}
                            rows={1}
                            className="relative min-h-[44px] w-full resize-none touch-manipulation rounded-xl border border-border/50 bg-muted/50 px-4 py-3 text-sm backdrop-blur-sm transition-[border-color,background-color] duration-200 focus:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                            style={{ maxHeight: '120px' }}
                          />
                        </div>
                        
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            type="button"
                            aria-label="Gönder"
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isLoading}
                            size="icon"
                            className={cn(
                              'h-11 w-11 touch-manipulation rounded-xl transition-[opacity,box-shadow] duration-200 disabled:opacity-50 disabled:shadow-none',
                              TW_BRAND_SEND_BTN
                            )}
                          >
                            <motion.div
                              animate={input.trim() ? { rotate: [0, -10, 10, 0] } : {}}
                              transition={{ duration: 0.3 }}
                            >
                              <Send className="h-4 w-4" />
                            </motion.div>
                          </Button>
                        </motion.div>
                      </div>
                      
                      <motion.p
                        className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <Zap className="h-3 w-3 text-amber-400" aria-hidden />
                        Groq ile güçlü · Seni dinliyorum
                        <Coffee className="h-3 w-3 text-orange-400" aria-hidden />
                      </motion.p>
                    </div>
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
