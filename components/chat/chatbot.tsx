'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Merhaba! ✨ Ben QRA, senin süper güçlü AI asistanınım! Sana nasıl yardımcı olabilirim?',
  timestamp: new Date(),
};

const QUICK_ACTIONS = [
  { label: 'Platform hakkında', message: 'QRATEX nedir ve nasıl çalışır?', icon: Rocket, color: 'from-violet-500 to-purple-500' },
  { label: 'Puan sistemi', message: 'Puan ve rozet sistemi nasıl çalışıyor?', icon: Star, color: 'from-amber-500 to-orange-500' },
  { label: 'QR Kodlar', message: 'QR kod nasıl oluşturabilirim?', icon: Zap, color: 'from-cyan-500 to-blue-500' },
  { label: 'Yardım', message: 'Bana yardım eder misin?', icon: Heart, color: 'from-pink-500 to-rose-500' },
];

const TYPING_MESSAGES = [
  'Düşünüyorum... 🧠',
  'Harika bir cevap hazırlıyorum... ✨',
  'Neredeyse hazır... 🚀',
  'Biraz sabır... 💫',
];

// Floating particles component
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
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

// Glowing orb for FAB
const GlowingOrb = ({ isHovered }: { isHovered: boolean }) => (
  <>
    <motion.div
      className="absolute inset-0 rounded-full bg-gradient-to-r from-primary via-purple-500 to-pink-500"
      animate={{
        scale: isHovered ? [1, 1.2, 1] : 1,
        opacity: isHovered ? [0.5, 0.8, 0.5] : 0.5,
      }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
    <motion.div
      className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary via-purple-500 to-pink-500 blur-lg"
      animate={{
        scale: [1, 1.1, 1],
        opacity: [0.3, 0.5, 0.3],
      }}
      transition={{ duration: 2, repeat: Infinity }}
    />
  </>
);

export function Chatbot() {
  const { data: session } = useSession();
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
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

      const data = await response.json();

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
        content: '❌ Bağlantı hatası. Lütfen tekrar deneyin.',
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
            className="fixed bottom-6 right-6 z-[9999]"
          >
            <motion.button
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
              className="relative h-16 w-16 rounded-full shadow-2xl flex items-center justify-center group"
            >
              {/* Glow effects */}
              <GlowingOrb isHovered={isHovered} />
              
              {/* Main button */}
              <motion.div
                className="relative z-10 h-14 w-14 rounded-full bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center overflow-hidden shadow-inner"
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
                    className="absolute right-full mr-3 px-3 py-2 bg-background/90 backdrop-blur-sm border border-border rounded-xl shadow-lg whitespace-nowrap"
                  >
                    <div className="flex items-center gap-2">
                      <Wand2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">AI Asistan</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Sohbet etmek için tıkla!</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Orbiting particles */}
            {isHovered && (
              <>
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-gradient-to-r from-primary to-purple-500"
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
            className={`fixed bottom-6 right-6 z-[9999] flex flex-col overflow-hidden ${
              isMinimized ? 'w-80 h-16' : 'w-[400px] h-[550px] sm:w-[420px] sm:h-[600px]'
            }`}
          >
            {/* Glassmorphism container */}
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl" />
            
            {/* Animated gradient border */}
            <div className="absolute inset-0 rounded-3xl p-[1px] overflow-hidden">
              <motion.div
                className="absolute inset-[-50%] bg-gradient-conic from-primary via-purple-500 via-pink-500 via-orange-500 via-yellow-500 via-green-500 via-cyan-500 to-primary"
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                style={{ opacity: 0.3 }}
              />
            </div>

            {/* Content wrapper */}
            <div className="relative flex flex-col h-full rounded-3xl overflow-hidden">
              {/* Epic Header */}
              <motion.div 
                className="relative flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4"
                initial={false}
              >
                {/* Header background with animated gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20" />
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
                      className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary to-purple-500 blur-sm"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <div className="relative h-11 w-11 rounded-full overflow-hidden bg-gradient-to-br from-primary to-purple-600 p-0.5">
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
                    <h3 className="font-bold text-sm sm:text-base flex items-center gap-1.5">
                      QRA Asistan
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                    </h3>
                    <motion.p 
                      className="text-xs text-muted-foreground flex items-center gap-1"
                      key={isLoading ? typingMessage : 'online'}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {isLoading ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          >
                            <Zap className="h-3 w-3 text-yellow-500" />
                          </motion.span>
                          {typingMessage}
                        </>
                      ) : (
                        <>
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          Süper güçlerle donatılmış
                        </>
                      )}
                    </motion.p>
                  </div>
                </div>
                
                <div className="relative flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl hover:bg-white/10"
                    onClick={() => setIsMinimized(!isMinimized)}
                  >
                    {isMinimized ? (
                      <Maximize2 className="h-4 w-4" />
                    ) : (
                      <Minimize2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl hover:bg-red-500/20 hover:text-red-500"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>

              {/* Messages Area */}
              {!isMinimized && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                  {/* Floating particles in chat */}
                  <FloatingParticles />
                  
                  {/* Messages container - scrollable */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ overflowY: 'auto' }}>
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
                                  <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white">
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
                                ? 'bg-gradient-to-br from-primary to-purple-600 text-white rounded-2xl rounded-tr-sm'
                                : 'bg-muted/80 backdrop-blur-sm rounded-2xl rounded-tl-sm border border-border/50'
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
                                    className="h-2 w-2 bg-gradient-to-r from-primary to-purple-500 rounded-full"
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
                                AI düşünüyor...
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
                          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                            <Lightbulb className="h-3 w-3" />
                            Hızlı başlangıç
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {QUICK_ACTIONS.map((action, i) => (
                              <motion.button
                                key={action.label}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                whileHover={{ scale: 1.03, y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => sendMessage(action.message)}
                                className={`relative p-3 rounded-xl bg-gradient-to-br ${action.color} text-white text-left overflow-hidden group`}
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
                            className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 opacity-0 group-focus-within:opacity-100 blur transition-opacity"
                          />
                          <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Mesajını yaz... ✨"
                            disabled={isLoading}
                            rows={1}
                            className="relative w-full px-4 py-3 bg-muted/50 backdrop-blur-sm border border-border/50 rounded-xl text-sm resize-none focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                            style={{ minHeight: '44px', maxHeight: '120px' }}
                          />
                        </div>
                        
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isLoading}
                            size="icon"
                            className="h-11 w-11 rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none"
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
                        className="text-[10px] text-muted-foreground text-center mt-3 flex items-center justify-center gap-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <Zap className="h-3 w-3 text-yellow-500" />
                        Powered by Groq AI
                        <Coffee className="h-3 w-3 text-orange-500" />
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
