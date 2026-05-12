'use client';

import Link from 'next/link';
import { Activity, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import { getSentimentColor, getRoleColor, getRoleLabel } from '../admin-utils';
import type { TimelineItem } from '../types';

export function TimelineSection({ items }: { items: TimelineItem[] }) {
    return (
        <section className="space-y-3 sm:space-y-5">
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 flex items-center justify-center shadow-inner">
                    <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Son yapılanlar</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Son kayıtlar ve geri bildirimler, kronolojik</p>
                </div>
            </div>
            <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
                <CardContent className="p-0">
                    {items.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-14 px-4 text-center">Henüz aktivite yok</p>
                    ) : (
                        <ul className="relative max-h-[520px] overflow-y-auto">
                            <div className="absolute left-[29px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-primary/30 via-border to-primary/20 rounded-full" aria-hidden />
                            {items.map((item) => (
                                <li key={item.id} className="relative flex gap-0 px-5 py-4 hover:bg-muted/50 transition-colors">
                                    <div className={`absolute left-5 top-[2.25rem] w-3 h-3 rounded-full border-2 border-background shadow-sm z-10 ${item.type === 'user' ? 'bg-blue-500' : 'bg-green-500'}`} style={{ transform: 'translateX(-50%)' }} />
                                    <div className="flex-1 pl-6">
                                        {item.type === 'user' && item.user ? (
                                            <div className="flex items-start gap-4">
                                                <Avatar className="h-11 w-11 shrink-0 ring-2 ring-blue-500/20">
                                                    <AvatarImage src={item.user.image || ''} />
                                                    <AvatarFallback className="text-sm bg-blue-500/10 text-blue-700 dark:text-blue-300">{getInitials(item.user.name || item.user.email)}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-foreground">Yeni kullanıcı kaydı</p>
                                                    <p className="text-sm mt-0.5 text-foreground">{item.user.name || 'İsimsiz'}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{item.user.email}</p>
                                                    <div className="flex flex-wrap gap-2 mt-2 items-center">
                                                        <Badge variant={getRoleColor(item.user.role) as 'default' | 'secondary' | 'destructive'} className="text-[10px]">{getRoleLabel(item.user.role)}</Badge>
                                                        <span className="text-xs text-muted-foreground">{formatRelativeTime(item.time)}</span>
                                                        <span className="text-xs text-muted-foreground">·</span>
                                                        <span className="text-xs text-muted-foreground">{new Date(item.time).toLocaleString('tr-TR')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : item.type === 'feedback' && item.feedback ? (
                                            <div className="flex gap-4">
                                                <div className="w-11 h-11 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0 ring-2 ring-green-500/20">
                                                    <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium line-clamp-2 text-foreground">{item.feedback.text || 'Yorum yok'}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {item.feedback.userName} · {item.feedback.businessName}
                                                        {item.feedback.productName ? ` · ${item.feedback.productName}` : ''}
                                                    </p>
                                                    <div className="flex flex-wrap gap-2 mt-2 items-center">
                                                        <span className="text-amber-500 text-xs" aria-label={`${item.feedback.rating} yıldız`}>{'★'.repeat(item.feedback.rating)}{'☆'.repeat(5 - item.feedback.rating)}</span>
                                                        <Badge variant={getSentimentColor(item.feedback.sentiment) as 'success' | 'destructive' | 'secondary'} className="text-[10px]">
                                                            {item.feedback.sentiment === 'positive' ? 'Olumlu' : item.feedback.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                                                        </Badge>
                                                        {item.feedback.type === 'consumption' && (
                                                            <Badge variant="outline" className="text-[10px]">Tüketim</Badge>
                                                        )}
                                                        <span className="text-xs text-muted-foreground">{formatRelativeTime(item.time)}</span>
                                                        <span className="text-xs text-muted-foreground">·</span>
                                                        <span className="text-xs text-muted-foreground">{new Date(item.time).toLocaleString('tr-TR')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
            <div className="mt-2 flex justify-end gap-2">
                <Link href="/admin/users">
                    <Button variant="outline" size="sm">Tüm kullanıcılar →</Button>
                </Link>
                <Link href="/admin/feedbacks">
                    <Button variant="outline" size="sm">Tüm geri bildirimler →</Button>
                </Link>
            </div>
        </section>
    );
}
