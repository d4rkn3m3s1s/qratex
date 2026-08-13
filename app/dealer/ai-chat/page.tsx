'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { m as Motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Send, Plus, Loader2, MessageSquare, Sparkles,
    ChevronRight, Bot, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { tr, enUS } from 'date-fns/locale';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
}

interface Conversation {
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
}

const SUGGESTION_KEYS = [
    'dealerAiChat.suggestion1',
    'dealerAiChat.suggestion2',
    'dealerAiChat.suggestion3',
    'dealerAiChat.suggestion4',
    'dealerAiChat.suggestion5',
    'dealerAiChat.suggestion6',
] as const;

export default function DealerAIChatPage() {
    const t = useAppT();
    const { locale } = useAppLocale();
    const dateFnsLocale = locale === 'en' ? enUS : tr;
    const queryClient = useQueryClient();
    const [input, setInput] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { data: convList } = useQuery<{ success: boolean; conversations: Conversation[] }>({
        queryKey: ['dealer', 'ai-conversations'],
        queryFn: async () => { const r = await fetch('/api/dealer/ai-chat'); return r.json(); },
        staleTime: 30_000,
    });

    const sendMutation = useMutation({
        mutationFn: async (question: string) => {
            const r = await fetch('/api/dealer/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, conversationId: activeId }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || t('dealerAiChat.requestFailed'));
            return d as { answer: string; conversationId: string };
        },
        onSuccess: (data) => {
            setMessages((prev) => [...prev, { role: 'assistant', content: data.answer, timestamp: new Date().toISOString() }]);
            if (!activeId) setActiveId(data.conversationId);
            queryClient.invalidateQueries({ queryKey: ['dealer', 'ai-conversations'] });
        },
        onError: (err: Error) => {
            setMessages((prev) => [...prev, { role: 'assistant', content: `${t('dealerAiChat.errorSend')}: ${err.message}` }]);
        },
    });

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    function handleSend(text?: string) {
        const q = (text || input).trim();
        if (!q || sendMutation.isPending) return;
        setMessages((prev) => [...prev, { role: 'user', content: q, timestamp: new Date().toISOString() }]);
        setInput('');
        sendMutation.mutate(q);
    }

    function startNewChat() {
        setActiveId(null);
        setMessages([]);
        setInput('');
    }

    async function loadConversation(conv: Conversation) {
        setActiveId(conv.id);
        // We don't have a GET-by-id endpoint, so we just set the ID
        // Messages will accumulate from new sends
        setMessages([]);
    }

    const conversations = convList?.conversations ?? [];

    return (
        <div className="flex h-[calc(100vh-5rem)] gap-0 overflow-hidden rounded-2xl border bg-card">
            {/* Sidebar */}
            <AnimatePresence>
                {sidebarOpen && (
                    <Motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 280, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-r flex flex-col shrink-0 overflow-hidden"
                    >
                        <div className="p-3 border-b">
                            <Button onClick={startNewChat} className="w-full gap-2 rounded-xl" size="sm">
                                <Plus className="h-4 w-4" /> {t('dealerAiChat.newChat')}
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <div className="p-2 space-y-1">
                                {conversations.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => loadConversation(c)}
                                        className={`w-full text-left p-2.5 rounded-xl text-sm transition-colors hover:bg-muted/50 ${activeId === c.id ? 'bg-muted' : ''}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="truncate font-medium">{c.title || t('dealerAiChat.defaultTitle')}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground/70 ml-5">
                                            {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true, locale: dateFnsLocale })}
                                        </span>
                                    </button>
                                ))}
                                {conversations.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-8">{t('dealerAiChat.noChatsYet')}</p>
                                )}
                            </div>
                        </div>
                    </Motion.div>
                )}
            </AnimatePresence>

            {/* Chat area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 touch-manipulation" onClick={() => setSidebarOpen(!sidebarOpen)}>
                        <ChevronRight className={`h-4 w-4 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
                    </Button>
                    <Brain className="h-5 w-5 shrink-0 text-primary" />
                    <h1 className="font-semibold text-base sm:text-lg text-balance truncate">{t('dealerAiChat.headerTitle')}</h1>
                    <Badge variant="secondary" className="text-xs ml-auto">{t('dealerAiChat.headerBadge')}</Badge>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                            <Motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Sparkles className="h-10 w-10 text-primary" />
                                </div>
                            </Motion.div>
                            <div>
                                <h2 className="text-xl font-bold">{t('dealerAiChat.greetingTitle')}</h2>
                                <p className="text-muted-foreground mt-1 text-sm max-w-md">
                                    {t('dealerAiChat.greetingSubtitle')}
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                                {SUGGESTION_KEYS.slice(0, 4).map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => handleSend(t(key))}
                                        className="text-left text-xs p-3 rounded-xl border hover:bg-muted/50 transition-colors"
                                    >
                                        <Sparkles className="h-3 w-3 text-primary inline mr-1.5" />
                                        {t(key)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <Motion.div
                                key={i}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 }}
                                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                        <Bot className="h-4 w-4 text-primary" />
                                    </div>
                                )}
                                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/50'
                                    }`}>
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                </div>
                                {msg.role === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-primary" />
                                    </div>
                                )}
                            </Motion.div>
                        ))
                    )}
                    {sendMutation.isPending && (
                        <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                <Bot className="h-4 w-4 text-primary" />
                            </div>
                            <div className="bg-muted/50 rounded-2xl px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('dealerAiChat.thinking')}
                                </div>
                            </div>
                        </Motion.div>
                    )}
                </div>

                {/* Input */}
                <div className="border-t p-4 shrink-0">
                    <div className="flex gap-3 items-end">
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t('dealerAiChat.inputPlaceholder')}
                            rows={1}
                            className="resize-none min-h-[44px] max-h-32 rounded-xl"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                            }}
                        />
                        <Button
                            onClick={() => handleSend()}
                            disabled={!input.trim() || sendMutation.isPending}
                            size="icon"
                            className="rounded-xl h-11 w-11 shrink-0"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
