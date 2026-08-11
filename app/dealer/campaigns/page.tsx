'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Megaphone, Plus, Trash2, Send, Loader2, Users,
  CheckCircle, Clock, Edit, X, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

interface CampaignItem {
  id: string;
  title: string;
  message: string;
  targetSegment: string;
  channel: string;
  status: string;
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
  playbookSourceId?: string | null;
}

const SEGMENTS: Record<string, { labelKey: string; color: string }> = {
  all: { labelKey: 'dealerCampaigns.segmentAll', color: 'bg-blue-500/15 text-blue-600' },
  vip: { labelKey: 'dealerCampaigns.segmentVip', color: 'bg-amber-500/15 text-amber-600' },
  loyal: { labelKey: 'dealerCampaigns.segmentLoyal', color: 'bg-emerald-500/15 text-emerald-600' },
  active: { labelKey: 'dealerCampaigns.segmentActive', color: 'bg-cyan-500/15 text-cyan-600' },
  risk: { labelKey: 'dealerCampaigns.segmentRisk', color: 'bg-red-500/15 text-red-600' },
};

const STATUS_BADGES: Record<string, { labelKey: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { labelKey: 'dealerCampaigns.statusDraft', variant: 'outline' },
  sent: { labelKey: 'dealerCampaigns.statusSent', variant: 'default' },
  scheduled: { labelKey: 'dealerCampaigns.statusScheduled', variant: 'secondary' },
};

export default function DealerCampaignsPage() {
  const t = useAppT();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState('all');
  const [channel, setChannel] = useState('notification');

  const { data, isLoading, isError, error, refetch } = useQuery<{ success: boolean; campaigns: CampaignItem[] }>({
    queryKey: ['dealer', 'campaigns'],
    queryFn: async () => {
      const r = await fetch('/api/dealer/campaigns');
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; campaigns?: CampaignItem[]; error?: string };
      if (!r.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : t('dealerCampaigns.loadError'));
      }
      if (!j.success) {
        throw new Error(typeof j.error === 'string' ? j.error : t('dealerCampaigns.loadError'));
      }
      return j as { success: boolean; campaigns: CampaignItem[] };
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/dealer/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, targetSegment: segment, channel }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer', 'campaigns'] });
      setDialogOpen(false);
      resetForm();
      toast.success(t('dealerCampaigns.toastCreated'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/dealer/campaigns/${id}/send`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d as { sentCount: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dealer', 'campaigns'] });
      toast.success(t('dealerCampaigns.sentToCustomers').replace('{count}', String(data.sentCount)));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/dealer/campaigns/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(t('dealerCampaigns.deleteFailed'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer', 'campaigns'] });
      toast.success(t('dealerCampaigns.toastDeleted'));
    },
  });

  function resetForm() {
    setTitle('');
    setMessage('');
    setSegment('all');
    setChannel('notification');
  }

  const campaigns = data?.campaigns ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
            <Megaphone className="h-6 w-6 shrink-0 text-blue-500" />
            {t('dealerCampaigns.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 text-pretty leading-relaxed">{t('dealerCampaigns.description')}</p>
          <p className="text-xs text-muted-foreground/90 mt-2 text-pretty leading-relaxed border-l-2 border-primary/30 pl-3">
            {t('dealerCampaigns.playbookWhereHint')}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl shrink-0 touch-manipulation w-full sm:w-auto">
          <Plus className="h-4 w-4 shrink-0" /> {t('dealerCampaigns.newCampaign')}
        </Button>
      </div>

      {isLoading ? (
        <InlineLoadingStatus className="py-16" label={t('dealerCampaigns.loading')} />
      ) : isError ? (
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-destructive font-medium">{error instanceof Error ? error.message : t('dealerCampaigns.loadError')}</p>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => void refetch()}>
              {t('dealerCampaigns.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-lg font-medium text-muted-foreground">{t('dealerCampaigns.emptyTitle')}</p>
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="mt-4 rounded-xl gap-2">
              <Plus className="h-4 w-4" /> {t('dealerCampaigns.emptyCta')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {campaigns.map((c, i) => {
              const seg = SEGMENTS[c.targetSegment] || SEGMENTS.all;
              const st = STATUS_BADGES[c.status] || STATUS_BADGES.draft;
              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ delay: Math.min(i, 10) * 0.03 }} layout>
                  <Card className="rounded-2xl">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start gap-4">
                        <div className={`p-2.5 rounded-xl shrink-0 ${seg.color.split(' ')[0]}`}>
                          <Megaphone className={`h-5 w-5 ${seg.color.split(' ')[1]}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{c.title}</h3>
                            {c.playbookSourceId ? (
                              <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
                                {t('dealerCampaigns.badgeFromPlaybook')}
                              </Badge>
                            ) : null}
                            <Badge variant={st.variant} className="text-xs">{t(st.labelKey)}</Badge>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${seg.color}`}>{t(seg.labelKey)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.message}</p>
                          {c.status === 'sent' && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-emerald-500" />
                              {t('dealerCampaigns.sentToCustomers').replace('{count}', String(c.sentCount))}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" className="rounded-xl gap-1" asChild>
                            <Link href={`/dealer/campaigns/${c.id}/performance`}>
                              <BarChart3 className="h-3.5 w-3.5" />
                              {t('dealerCampaigns.performance')}
                            </Link>
                          </Button>
                          {c.status === 'draft' && (
                            <Button
                              size="sm"
                              className="gap-1.5 rounded-xl"
                              onClick={() => sendMutation.mutate(c.id)}
                              disabled={sendMutation.isPending}
                            >
                              {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              {t('dealerCampaigns.send')}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-blue-500" /> {t('dealerCampaigns.dialogTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('dealerCampaigns.labelTitle')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('dealerCampaigns.placeholderTitle')} className="mt-1" />
            </div>
            <div>
              <Label>{t('dealerCampaigns.labelMessage')}</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('dealerCampaigns.placeholderMessage')} rows={3} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('dealerCampaigns.labelSegment')}</Label>
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEGMENTS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{t(v.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('dealerCampaigns.labelChannel')}</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notification">{t('dealerCampaigns.channelNotification')}</SelectItem>
                    <SelectItem value="email">{t('dealerCampaigns.channelEmail')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !title.trim() || !message.trim()} className="gap-2">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
