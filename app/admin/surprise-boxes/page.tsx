'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Send,
  Users,
  Mail,
  Sparkles,
  Loader2,
  Gift,
  RefreshCw,
  Ticket,
  Coins,
  Inbox,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

type SendMode = 'email' | 'userId' | 'random';

interface SentBox {
  id: string;
  title: string;
  message: string | null;
  couponCode: string | null;
  points: number;
  openedAt: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
  sentBy: { id: string; name: string | null } | null;
}

export default function AdminSurpriseBoxesPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [points, setPoints] = useState(0);
  const [sendMode, setSendMode] = useState<SendMode>('email');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [randomCount, setRandomCount] = useState(10);
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<SentBox[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const fetchRecent = useCallback(async () => {
    try {
      setLoadingRecent(true);
      const res = await fetch('/api/admin/surprise-box', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.data) setRecent(data.data);
    } catch {
      toast.error('Liste alınamadı');
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  const stats = useMemo(() => {
    const slice = recent.slice(0, 50);
    const opened = slice.filter((b) => b.openedAt).length;
    return {
      listed: slice.length,
      opened,
      pending: slice.length - opened,
    };
  }, [recent]);

  const handleSend = async () => {
    if (!title.trim()) {
      toast.error('Başlık girin');
      return;
    }
    if (sendMode === 'email' && !email.trim()) {
      toast.error('E-posta girin');
      return;
    }
    if (sendMode === 'userId' && !userId.trim()) {
      toast.error('Kullanıcı ID girin');
      return;
    }
    if (sendMode === 'random' && (randomCount < 1 || randomCount > 500)) {
      toast.error('Rastgele sayı 1–500 arası olmalı');
      return;
    }

    setSending(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        message: message.trim() || undefined,
        couponCode: couponCode.trim() || undefined,
        points: Number(points) || 0,
      };
      if (sendMode === 'email') body.email = email.trim().toLowerCase();
      if (sendMode === 'userId') body.userId = userId.trim();
      if (sendMode === 'random') body.randomCount = randomCount;

      const res = await fetch('/api/admin/surprise-box/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error ?? 'Gönderilemedi');
        return;
      }

      toast.success(`${data.data.count} kullanıcıya sürpriz kutu gönderildi`);
      setTitle('');
      setMessage('');
      setCouponCode('');
      setPoints(0);
      setEmail('');
      setUserId('');
      setRandomCount(10);
      fetchRecent();
    } catch {
      toast.error('Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <AdminPremiumHero
        eyebrow="Müşteri ödül merkezi"
        title="Sürpriz kutular"
        description="Müşterilere e-posta, kullanıcı ID veya rastgele seçimle sürpriz kutu gönderin. Puan ve kupon ekleyebilirsiniz; gönderimler burada listelenir."
        icon={<Gift className="text-white" />}
        chips={
          <>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background/85 border border-border/70 text-foreground dark:bg-white/20 dark:border-white/30 dark:text-cyan-50">Tekil veya toplu</span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background/85 border border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-emerald-50">Kupon + puan</span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background/85 border border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-amber-50">Son gönderimler</span>
          </>
        }
        aside={
          <div className="flex flex-wrap items-stretch gap-2 lg:flex-col xl:flex-row">
            <div className="grid grid-cols-3 gap-2 min-w-0 flex-1 lg:max-w-sm">
              <div className="rounded-xl bg-background/85 border border-border/70 px-2 py-2 text-center shadow-sm dark:bg-white/15 dark:border-white/25">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground dark:text-white/80">Liste</p>
                <p className="text-lg font-bold text-foreground dark:text-white tabular-nums">{stats.listed}</p>
              </div>
              <div className="rounded-xl bg-background/85 border border-border/70 px-2 py-2 text-center shadow-sm dark:bg-white/15 dark:border-white/25">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground dark:text-white/80">Açıldı</p>
                <p className="text-lg font-bold text-foreground dark:text-white tabular-nums">{stats.opened}</p>
              </div>
              <div className="rounded-xl bg-background/85 border border-border/70 px-2 py-2 text-center shadow-sm dark:bg-white/15 dark:border-white/25">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground dark:text-white/80">Bekleyen</p>
                <p className="text-lg font-bold text-foreground dark:text-white tabular-nums">{stats.pending}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:bg-white/15 dark:text-white dark:border-white/30 dark:hover:bg-white/25"
              onClick={() => fetchRecent()}
              disabled={loadingRecent}
            >
              {loadingRecent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Yenile</span>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="xl:col-span-3"
        >
          <Card className="border border-border/60 bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-sky-600 to-cyan-700 shadow-sm">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Yeni gönderim</CardTitle>
                  <CardDescription>
                    Başlık zorunlu; mesaj, kupon ve puan isteğe bağlı. Hedefi seçip gönderin.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="sb-title">Başlık *</Label>
                <Input
                  id="sb-title"
                  placeholder="Örn: Sürpriz ödülünüz hazır"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sb-message">Mesaj (isteğe bağlı)</Label>
                <Textarea
                  id="sb-message"
                  placeholder="Kutu açıldığında görünecek metin"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="resize-none min-h-[88px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sb-coupon" className="flex items-center gap-2">
                    <Ticket className="h-3.5 w-3.5 text-sky-600" />
                    Kupon kodu
                  </Label>
                  <Input
                    id="sb-coupon"
                    placeholder="Örn: SURPRIZ20"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sb-points" className="flex items-center gap-2">
                    <Coins className="h-3.5 w-3.5 text-emerald-600" />
                    Puan
                  </Label>
                  <Input
                    id="sb-points"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={points || ''}
                    onChange={(e) => setPoints(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <Label className="text-foreground">Gönderim hedefi</Label>
                <Select value={sendMode} onValueChange={(v) => setSendMode(v as SendMode)}>
                  <SelectTrigger className="bg-background/80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <span className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-sky-600" /> E-posta (tek kullanıcı)
                      </span>
                    </SelectItem>
                    <SelectItem value="userId">
                      <span className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-600" /> Kullanıcı ID (tek)
                      </span>
                    </SelectItem>
                    <SelectItem value="random">
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600" /> Rastgele N müşteri
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {sendMode === 'email' && (
                  <Input
                    type="email"
                    placeholder="musteri@ornek.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/80"
                  />
                )}
                {sendMode === 'userId' && (
                  <Input
                    placeholder="Kullanıcı ID (cuid)"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="bg-background/80 font-mono text-sm"
                  />
                )}
                {sendMode === 'random' && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      placeholder="Kaç kişiye (1–500)"
                      value={randomCount}
                      onChange={(e) => setRandomCount(Number(e.target.value) || 10)}
                      className="bg-background/80"
                    />
                    <p className="text-xs text-muted-foreground">Güvenlik için üst sınır 500.</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-gradient-to-r from-sky-700 to-cyan-700 text-white shadow-md hover:opacity-95"
                  onClick={handleSend}
                  disabled={sending}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Gönder
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="xl:col-span-2 space-y-4"
        >
          <Card className="border border-border/60 bg-card/70 backdrop-blur-sm shadow-sm h-full flex flex-col">
            <CardHeader className="border-b border-border/60 bg-muted/30 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 shadow-sm shrink-0">
                    <Inbox className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Box className="h-5 w-5 text-sky-600 shrink-0" />
                      Son gönderimler
                    </CardTitle>
                    <CardDescription className="mt-1">
                      En fazla 50 kayıt; açılış durumu rozetle gösterilir.
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 flex-1 flex flex-col min-h-0">
              {loadingRecent ? (
                <div className="flex flex-1 items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
                </div>
              ) : recent.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-dashed border-border/80 bg-muted/20">
                  <Gift className="h-10 w-10 text-muted-foreground mb-3 opacity-80" />
                  <p className="text-sm font-medium text-foreground">Henüz kutu yok</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    İlk gönderiminizden sonra kayıtlar burada görünecek.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2 max-h-[min(520px,55vh)] overflow-y-auto pr-1 -mr-1">
                  {recent.slice(0, 50).map((box, i) => (
                    <motion.li
                      key={box.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="rounded-xl border border-border/60 bg-background/60 p-3 shadow-sm hover:border-sky-500/25 hover:bg-background/90 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-foreground truncate">{box.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {box.user?.name ?? box.user?.email}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {formatDistanceToNow(new Date(box.createdAt), {
                              addSuffix: true,
                              locale: tr,
                            })}
                            {box.sentBy?.name && (
                              <span className="hidden sm:inline"> · {box.sentBy.name}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {box.openedAt ? (
                            <Badge className="bg-emerald-600/90 hover:bg-emerald-600 text-white border-0 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" />
                              Açıldı
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Bekliyor
                            </Badge>
                          )}
                          {box.points > 0 && (
                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              +{box.points} puan
                            </span>
                          )}
                          {box.couponCode && (
                            <code className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 max-w-[7rem] truncate">
                              {box.couponCode}
                            </code>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
