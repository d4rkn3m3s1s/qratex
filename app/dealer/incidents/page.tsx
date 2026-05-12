'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Plus,
  Loader2,
  Clock,
  User,
  Calendar,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/admin-toast';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface IncidentItem {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  thresholdValue: number | null;
  dueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string | null; email: string } | null;
}

export default function DealerIncidentsPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [items, setItems] = useState<IncidentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createSending, setCreateSending] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('nps_drop');
  const [formSeverity, setFormSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('pageSize', '20');
      const res = await fetch(`/api/dealer/incidents?${params}`);
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch {
      toast.error(t('dealerIncidents.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [page, statusFilter, t]);

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      toast.error(t('dealerIncidents.toastTitleRequired'));
      return;
    }
    setCreateSending(true);
    try {
      const res = await fetch('/api/dealer/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          severity: formSeverity,
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        toast.success(t('dealerIncidents.toastCreated'));
        setCreateOpen(false);
        setFormTitle('');
        setFormDescription('');
        fetchIncidents();
      } else {
        toast.error(data.error || t('dealerIncidents.toastCreateFailed'));
      }
    } catch {
      toast.error(t('dealerIncidents.toastConnectionError'));
    } finally {
      setCreateSending(false);
    }
  };

  const severityColor: Record<string, string> = {
    low: 'bg-slate-500/20 text-slate-600',
    medium: 'bg-amber-500/20 text-amber-600',
    high: 'bg-orange-500/20 text-orange-600',
    critical: 'bg-red-500/20 text-red-600',
  };
  const statusLabels: Record<string, string> = {
    open: t('dealerIncidents.status.open'),
    assigned: t('dealerIncidents.status.assigned'),
    in_progress: t('dealerIncidents.status.in_progress'),
    resolved: t('dealerIncidents.status.resolved'),
  };
  const severityLabels: Record<string, string> = {
    low: t('dealerIncidents.severity.low'),
    medium: t('dealerIncidents.severity.medium'),
    high: t('dealerIncidents.severity.high'),
    critical: t('dealerIncidents.severity.critical'),
  };
  const typeLabels: Record<string, string> = {
    nps_drop: t('dealerIncidents.type.nps_drop'),
    rating_drop: t('dealerIncidents.type.rating_drop'),
    complaint_spike: t('dealerIncidents.type.complaint_spike'),
    other: t('dealerIncidents.type.other'),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
            <AlertTriangle className="h-7 w-7 shrink-0 text-amber-500" />
            {t('dealerIncidents.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5 text-pretty leading-relaxed">
            {t('dealerIncidents.description')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0 touch-manipulation w-full sm:w-auto">
          <Plus className="h-4 w-4 shrink-0" />
          {t('dealerIncidents.newIncident')}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t('dealerIncidents.listTitle')}</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] border-border/70 bg-background/80 text-foreground dark:bg-white/15 dark:border-white/30 dark:text-white">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="open">{t('dealerIncidents.status.open')}</SelectItem>
                <SelectItem value="assigned">{t('dealerIncidents.status.assigned')}</SelectItem>
                <SelectItem value="in_progress">{t('dealerIncidents.status.in_progress')}</SelectItem>
                <SelectItem value="resolved">{t('dealerIncidents.status.resolved')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <InlineLoadingStatus className="py-12" label={t('dealerIncidents.loadingLabel')} />
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('dealerIncidents.emptyTitle')}</p>
              <Button variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}>
                {t('dealerIncidents.createFirst')}
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center gap-3 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {typeLabels[item.type] ?? item.type}
                      </Badge>
                      <Badge className={severityColor[item.severity] ?? 'bg-muted'}>
                        {severityLabels[item.severity] ?? item.severity}
                      </Badge>
                      <Badge variant="secondary">{statusLabels[item.status] ?? item.status}</Badge>
                      {item.assignedTo && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.assignedTo.name || item.assignedTo.email}
                        </span>
                      )}
                      {item.dueAt && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(item.dueAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR')}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.resolvedAt && (
                    <Badge className="bg-emerald-500/20 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t('dealerIncidents.resolvedBadge')}
                    </Badge>
                  )}
                </motion.li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('dealerIncidents.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('dealerIncidents.pageIndicator')
                  .replace('{page}', String(page))
                  .replace('{totalPages}', String(totalPages))
                  .replace('{total}', String(total))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('dealerIncidents.next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dealerIncidents.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dealerIncidents.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('dealerIncidents.labelTitle')}</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={t('dealerIncidents.placeholderTitle')}
              />
            </div>
            <div>
              <Label>{t('dealerIncidents.labelDescription')}</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t('dealerIncidents.placeholderDetail')}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('dealerIncidents.labelType')}</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nps_drop">{t('dealerIncidents.type.nps_drop')}</SelectItem>
                    <SelectItem value="rating_drop">{t('dealerIncidents.type.rating_drop')}</SelectItem>
                    <SelectItem value="complaint_spike">{t('dealerIncidents.type.complaint_spike')}</SelectItem>
                    <SelectItem value="other">{t('dealerIncidents.type.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('dealerIncidents.labelSeverity')}</Label>
                <Select value={formSeverity} onValueChange={(v: 'low' | 'medium' | 'high' | 'critical') => setFormSeverity(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('dealerIncidents.severity.low')}</SelectItem>
                    <SelectItem value="medium">{t('dealerIncidents.severity.medium')}</SelectItem>
                    <SelectItem value="high">{t('dealerIncidents.severity.high')}</SelectItem>
                    <SelectItem value="critical">{t('dealerIncidents.severity.critical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={createSending}>
              {createSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('dealerIncidents.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
