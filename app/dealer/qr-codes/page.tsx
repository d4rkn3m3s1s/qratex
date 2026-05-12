'use client';

import { useState, useEffect } from 'react';
import { useAppT } from '@/lib/app-locale';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import JSZip from 'jszip';
import {
  QrCode,
  Plus,
  Search,
  Edit,
  Trash2,
  Download,
  Palette,
  Copy,
  ExternalLink,
  Eye,
  MoreVertical,
  Star,
  MessageSquare,
  Calendar,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  Share2,
  Zap,
  TrendingUp,
  Activity,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Ban,
} from 'lucide-react';
import { BRAND_PRIMARY_HEX, HEX_BLACK, HEX_WHITE, QR_PRESET_DISPLAY_HEX } from '@/lib/brand-colors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';
import { formatDate } from '@/lib/utils';
import QRCodeLib from 'qrcode';

interface QRCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  scanCount: number;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}

// Animated Counter
const AnimatedNumber = ({ value }: { value: number }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const stepValue = value / steps;
    let current = 0;
    
    if (value === 0) {
      setCount(0);
      return;
    }
    
    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return <span>{count}</span>;
};

export default function DealerQRCodesPage() {
  const t = useAppT();
  const [qrCodes, setQRCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedQR, setSelectedQR] = useState<QRCode | null>(null);
  const [qrPreview, setQrPreview] = useState<string>('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [qrFgColor, setQrFgColor] = useState<string>(HEX_BLACK);
  const downloadQR = async (code: string, format: 'png' | 'svg' = 'png') => {
    const url = `${window.location.origin}/feedback/${code}`;
    if (format === 'svg') {
      const svgStr = await QRCodeLib.toString(url, { type: 'svg', width: 400, margin: 2, color: { dark: qrFgColor, light: qrBgColor } });
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `qr-${code}.svg`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } else {
      const dataUrl = await QRCodeLib.toDataURL(url, { width: 800, margin: 2, color: { dark: qrFgColor, light: qrBgColor } });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qr-${code}.png`;
      a.click();
    }
    toast.success(t('dealerQrCodes.downloadedFormat').replace('{format}', format.toUpperCase()));
  };
  const [qrBgColor, setQrBgColor] = useState<string>(HEX_WHITE);
  const [qrFrame, setQrFrame] = useState<'none' | 'rounded' | 'circle' | 'badge'>('none');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });

  const pageSize = 12;

  useEffect(() => {
    fetchQRCodes(page);
  }, [page]);

  const fetchQRCodes = async (p = 1) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/qr-codes?page=${p}&pageSize=${pageSize}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || t('dealerQrCodes.loadFailed'));
      }

      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : [];
      setQRCodes(list);
      setTotalPages(data?.totalPages ?? 1);
      setTotal(data?.total ?? list.length);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('dealerQrCodes.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const generateQRImage = async (code: string) => {
    try {
      const url = `${window.location.origin}/feedback/${code}`;
      const qrDataUrl = await QRCodeLib.toDataURL(url, {
        width: 400,
        margin: 2,
        color: {
          dark: qrFgColor,
          light: qrBgColor,
        },
      });
      return qrDataUrl;
    } catch (error) {
      console.error('QR generation error:', error);
      return '';
    }
  };

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error(t('dealerQrCodes.fillRequiredFields'));
      return;
    }
    
    try {
      const res = await fetch('/api/qr-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success(t('dealerQrCodes.created'));
        setCreateDialogOpen(false);
        resetForm();
        fetchQRCodes(page);
      } else {
        toast.error(data.error || t('dealerQrCodes.createFailed'));
      }
    } catch (error) {
      toast.error(t('dealerQrCodes.genericError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('dealerQrCodes.confirmDelete'))) return;
    
    try {
      const res = await fetch(`/api/qr-codes/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success(t('dealerQrCodes.deleted'));
        fetchQRCodes(page);
      } else {
        toast.error(t('dealerQrCodes.deleteFailed'));
      }
    } catch (error) {
      toast.error(t('dealerQrCodes.genericError'));
    }
  };

  const handleRevoke = async (qr: QRCode) => {
    if (!confirm(t('dealerQrCodes.confirmRevoke'))) return;
    try {
      const res = await fetch(`/api/qr-codes/${qr.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoke: true }),
      });
      if (res.ok) {
        toast.success(t('dealerQrCodes.revoked'));
        fetchQRCodes(page);
      } else {
        const d = await res.json();
        toast.error(d.error || t('dealerQrCodes.revokeFailed'));
      }
    } catch {
      toast.error(t('dealerQrCodes.genericError'));
    }
  };

  const handleRotate = async (qr: QRCode) => {
    if (!confirm(t('dealerQrCodes.confirmRotate'))) return;
    try {
      const res = await fetch(`/api/qr-codes/${qr.id}/rotate`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(t('dealerQrCodes.rotated'));
        fetchQRCodes(page);
      } else {
        toast.error(data.error || t('dealerQrCodes.rotateFailed'));
      }
    } catch {
      toast.error(t('dealerQrCodes.genericError'));
    }
  };

  const handleCopyLink = async (code: string) => {
    const url = `${window.location.origin}/feedback/${code}`;
    await navigator.clipboard.writeText(url);
    toast.success(t('dealerQrCodes.linkCopied'));
  };

  const handleDownloadQR = async (qr: QRCode) => {
    const qrImage = await generateQRImage(qr.code);
    const link = document.createElement('a');
    link.download = `qr-${qr.name}.png`;
    link.href = qrImage;
    link.click();
    toast.success(t('dealerQrCodes.singleDownloadSuccess'));
  };

  const handlePreviewQR = async (qr: QRCode) => {
    const qrImage = await generateQRImage(qr.code);
    setQrPreview(qrImage);
    setSelectedQR(qr);
    setPreviewDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      isActive: true,
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllOnPage = () => {
    if (selectedIds.size === filteredQRCodes.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredQRCodes.map((q) => q.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const runBulk = async (action: 'activate' | 'deactivate' | 'delete') => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (action === 'delete' && !confirm(t('dealerQrCodes.bulkDeleteConfirm').replace('{count}', String(ids.length)))) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/qr-codes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('dealerQrCodes.bulkUpdated').replace('{count}', String(data.count)));
        clearSelection();
        fetchQRCodes(page);
      } else {
        toast.error(data.error || t('dealerQrCodes.bulkFailed'));
      }
    } catch {
      toast.error(t('dealerQrCodes.connectionError'));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDownloadZip = async () => {
    const toExport = qrCodes.filter((q) => selectedIds.has(q.id));
    if (!toExport.length) return;
    setBulkLoading(true);
    try {
      const zip = new JSZip();
      for (const qr of toExport) {
        const url = `${window.location.origin}/feedback/${qr.code}`;
        const dataUrl = await QRCodeLib.toDataURL(url, { width: 400, margin: 2, color: { dark: qrFgColor, light: qrBgColor } });
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        zip.file(`qr-${qr.name.replace(/[^a-z0-9-_]/gi, '_')}-${qr.code}.png`, base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qr-kodlari-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(t('dealerQrCodes.zipDownloaded').replace('{count}', String(toExport.length)));
      clearSelection();
    } catch (e) {
      toast.error(t('dealerQrCodes.zipFailed'));
    } finally {
      setBulkLoading(false);
    }
  };

  const filteredQRCodes = qrCodes.filter((qr) =>
    qr.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedOnPage = filteredQRCodes.filter((q) => selectedIds.has(q.id));

  const stats = {
    total,
    active: qrCodes.filter(q => q.isActive).length,
    totalScans: qrCodes.reduce((acc, q) => acc + q.scanCount, 0),
  };

  return (
    <div className="space-y-6 pb-8">
      <DashboardPageHero
        eyebrow={t('dealerQrCodes.eyebrow')}
        title={t('dealerQrCodes.title')}
        description={t('dealerQrCodes.description')}
        icon={<QrCode className="h-7 w-7" aria-hidden />}
        tone="auto"
        actions={
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="gap-2 shadow-md">
                  <Plus className="h-5 w-5" />
                  {t('dealerQrCodes.newQr')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className="rounded-lg bg-primary/15 p-2 text-primary">
                      <QrCode className="h-5 w-5" aria-hidden />
                    </div>
                    {t('dealerQrCodes.createTitle')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('dealerQrCodes.createDescription')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('dealerQrCodes.nameRequired')}</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('dealerQrCodes.namePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('dealerQrCodes.descriptionLabel')}</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder={t('dealerQrCodes.descriptionPlaceholder')}
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleCreate}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t('common.create')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { labelKey: 'dealerQrCodes.statTotalQr', value: stats.total, icon: QrCode, iconBox: 'bg-primary/10', iconColor: 'text-primary', gradient: 'from-primary to-primary/80' },
          { labelKey: 'dealerQrCodes.statActive', value: stats.active, icon: CheckCircle2, iconBox: 'bg-emerald-500/10', iconColor: 'text-emerald-500', gradient: 'from-emerald-500 to-teal-600' },
          { labelKey: 'dealerQrCodes.statTotalScans', value: stats.totalScans, icon: Eye, iconBox: 'bg-blue-500/10', iconColor: 'text-blue-500', gradient: 'from-blue-500 to-cyan-600' },
        ].map((stat, index) => (
          <motion.div
            key={stat.labelKey}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="relative overflow-hidden border-border/60 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2.5 ${stat.iconBox}`}>
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold"><AnimatedNumber value={stat.value} /></p>
                    <p className="text-xs text-muted-foreground">{t(stat.labelKey)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('dealerQrCodes.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background/50"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 flex flex-wrap items-center gap-3">
            <span className="font-medium">{t('dealerQrCodes.selectedCount').replace('{count}', String(selectedIds.size))}</span>
            <Button variant="outline" size="sm" onClick={clearSelection} disabled={bulkLoading}>
              {t('dealerQrCodes.clearSelection')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => runBulk('activate')} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {t('dealerQrCodes.bulkActivate')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => runBulk('deactivate')} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
              {t('dealerQrCodes.bulkDeactivate')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkDownloadZip} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              {t('dealerQrCodes.downloadZip')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => runBulk('delete')} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              {t('dealerQrCodes.bulkDelete')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* QR Codes Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="border-border/60 bg-card/50">
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-40 bg-muted rounded-xl" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredQRCodes.length === 0 ? (
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
                <QrCode className="h-12 w-12 text-primary" aria-hidden />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('dealerQrCodes.emptyTitle')}</h3>
              <p className="text-muted-foreground mb-6">{t('dealerQrCodes.emptyDescription')}</p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('dealerQrCodes.ctaFirstQr')}
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Checkbox
              checked={selectedIds.size > 0 && selectedOnPage.length === filteredQRCodes.length}
              onCheckedChange={selectAllOnPage}
            />
            <span className="text-sm text-muted-foreground">{t('dealerQrCodes.selectPage')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredQRCodes.map((qr, index) => (
              <motion.div
                key={qr.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                layout
              >
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm group hover:shadow-xl transition-all overflow-hidden">
                  <CardContent className="p-0">
                    {/* QR Preview Area */}
                    <div 
                      className="relative h-44 bg-gradient-to-br from-slate-100 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-center cursor-pointer overflow-hidden"
                      onClick={() => handlePreviewQR(qr)}
                    >
                      <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(qr.id)}
                          onCheckedChange={() => toggleSelect(qr.id)}
                        />
                      </div>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 flex items-center justify-center">
                        <div className="bg-white/90 dark:bg-black/80 rounded-full p-3">
                          <Eye className="h-6 w-6 text-foreground dark:text-white" />
                        </div>
                      </div>
                      <QrCode className="h-24 w-24 text-gray-800 dark:text-white group-hover:scale-95 transition-transform" />
                      
                      {/* Status Badge - P2-32 lifecycle */}
                      <div className="absolute top-3 right-3">
                        {qr.revokedAt ? (
                          <Badge className="bg-amber-600/90 text-white border-0">{t('dealerQrCodes.badgeRevoked')}</Badge>
                        ) : qr.expiresAt && new Date(qr.expiresAt) < new Date() ? (
                          <Badge className="bg-destructive text-destructive-foreground border-0">{t('dealerQrCodes.badgeExpired')}</Badge>
                        ) : qr.isActive ? (
                          <Badge className="bg-emerald-500/90 text-white border-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 animate-pulse" />
                            {t('dealerQrCodes.badgeActive')}
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-500/90 text-white border-0">{t('dealerQrCodes.badgeInactive')}</Badge>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-5 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold text-lg truncate">{qr.name}</h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handlePreviewQR(qr)}>
                                <Eye className="h-4 w-4 mr-2" />
                                {t('dealerQrCodes.menuPreview')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`/feedback/${qr.code}`, '_blank')}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                {t('dealerQrCodes.menuOpenPage')}
                              </DropdownMenuItem>
                              {!qr.revokedAt && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleRotate(qr)}>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    {t('dealerQrCodes.menuRotate')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-amber-600 focus:text-amber-600"
                                    onClick={() => handleRevoke(qr)}
                                  >
                                    <Ban className="h-4 w-4 mr-2" />
                                    {t('dealerQrCodes.menuRevoke')}
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(qr.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('dealerQrCodes.menuDelete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-sm text-muted-foreground">{t('dealerQrCodes.codeLabel')} {qr.code}</p>
                      </div>

                      {/* Stats Row */}
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{qr.scanCount}</span>
                          <span>{t('dealerQrCodes.scansSuffix')}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleCopyLink(qr.code)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {t('dealerQrCodes.copy')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleDownloadQR(qr)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('dealerQrCodes.download')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t('dealerQrCodes.paginationPrevious')}
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {t('dealerQrCodes.paginationPage')
              .replace('{page}', String(page))
              .replace('{totalPages}', String(totalPages))
              .replace('{total}', String(total))}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            {t('dealerQrCodes.paginationNext')}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* QR Preview Dialog */}
      <AnimatePresence>
        {previewDialogOpen && selectedQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setPreviewDialogOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="border-0 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="relative border-b border-border bg-muted/40 p-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-4 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setPreviewDialogOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>

                  <div>
                    <h2 className="text-xl font-bold text-foreground">{selectedQR.name}</h2>
                    <p className="text-sm text-muted-foreground">{t('dealerQrCodes.codeLabel')} {selectedQR.code}</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="p-8 flex justify-center" style={{ backgroundColor: qrBgColor }}>
                  {qrPreview && (
                    <motion.img 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      src={qrPreview} 
                      alt={t('dealerQrCodes.previewAlt')} 
                      className={`shadow-lg max-w-[250px] ${qrFrame === "rounded" ? "border-4 border-primary rounded-2xl" : qrFrame === "circle" ? "border-4 border-amber-500 rounded-full" : qrFrame === "badge" ? "border-[6px] border-double border-emerald-500 rounded-xl" : "rounded-xl"}`} 
                    />
                  )}
                </div>

                {/* Color Customization */}
                <div className="px-6 pt-4 pb-2 bg-card">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Palette className="h-3 w-3" /> {t('dealerQrCodes.colorsTitle')}
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">{t('dealerQrCodes.foreground')}</label>
                      <input type="color" value={qrFgColor} onChange={async (e) => {
                        setQrFgColor(e.target.value);
                        if (selectedQR) {
                          const url = `${window.location.origin}/feedback/${selectedQR.code}`;
                          const preview = await QRCodeLib.toDataURL(url, { width: 400, margin: 2, color: { dark: e.target.value, light: qrBgColor } });
                          setQrPreview(preview);
                        }
                      }} className="w-8 h-8 rounded cursor-pointer border-0" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">{t('dealerQrCodes.background')}</label>
                      <input type="color" value={qrBgColor} onChange={async (e) => {
                        setQrBgColor(e.target.value);
                        if (selectedQR) {
                          const url = `${window.location.origin}/feedback/${selectedQR.code}`;
                          const preview = await QRCodeLib.toDataURL(url, { width: 400, margin: 2, color: { dark: qrFgColor, light: e.target.value } });
                          setQrPreview(preview);
                        }
                      }} className="w-8 h-8 rounded cursor-pointer border-0" />
                    </div>
                  </div>
                  {/* Quick Color Presets */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-muted-foreground">{t('dealerQrCodes.presetQuickLabel')}</span>
                    {[
                      { fg: HEX_BLACK, bg: HEX_WHITE, labelKey: 'dealerQrCodes.presetClassic' },
                      { fg: BRAND_PRIMARY_HEX, bg: QR_PRESET_DISPLAY_HEX.violet50, labelKey: 'dealerQrCodes.presetPurple' },
                      { fg: QR_PRESET_DISPLAY_HEX.sky700, bg: QR_PRESET_DISPLAY_HEX.sky50, labelKey: 'dealerQrCodes.presetBlue' },
                      { fg: QR_PRESET_DISPLAY_HEX.red700, bg: QR_PRESET_DISPLAY_HEX.red50, labelKey: 'dealerQrCodes.presetRed' },
                      { fg: HEX_WHITE, bg: HEX_BLACK, labelKey: 'dealerQrCodes.presetInverted' },
                    ].map((preset) => (
                      <button key={preset.labelKey} onClick={async () => {
                        setQrFgColor(preset.fg);
                        setQrBgColor(preset.bg);
                        if (selectedQR) {
                          const url = `${window.location.origin}/feedback/${selectedQR.code}`;
                          const preview = await QRCodeLib.toDataURL(url, { width: 400, margin: 2, color: { dark: preset.fg, light: preset.bg } });
                          setQrPreview(preview);
                        }
                      }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium hover:bg-muted transition-colors"
                        title={t(preset.labelKey)}
                      >
                        <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: preset.fg }} />
                        <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: preset.bg }} />
                        {t(preset.labelKey)}
                      </button>
                    ))}
                  </div>
                  {/* Frame Templates */}
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs font-medium text-muted-foreground mb-2">{t('dealerQrCodes.frameTemplates')}</p>
                    <div className="flex gap-2">
                      {[
                        { id: 'none', labelKey: 'dealerQrCodes.frameNone', style: 'border-0' },
                        { id: 'rounded', labelKey: 'dealerQrCodes.frameSoft', style: 'border-4 border-primary rounded-2xl' },
                        { id: 'circle', labelKey: 'dealerQrCodes.frameCircle', style: 'border-4 border-amber-500 rounded-full' },
                        { id: 'badge', labelKey: 'dealerQrCodes.frameBadge', style: 'border-[6px] border-double border-emerald-500 rounded-xl' },
                      ].map((frame) => (
                        <button key={frame.id} onClick={() => setQrFrame(frame.id as any)}
                          className={`flex-1 p-2 rounded-lg border-2 text-center text-[10px] font-medium transition-all ${qrFrame === frame.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                        >
                          <div className={`w-10 h-10 mx-auto mb-1 bg-muted/50 ${frame.style}`} />
                          {t(frame.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Info & Actions */}
                <CardContent className="p-6 space-y-4 bg-card">
                  <div className="flex items-center justify-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">{selectedQR.scanCount}</span>
                      <span className="text-muted-foreground">{t('dealerQrCodes.scansSuffix')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" aria-hidden />
                      <span className="text-muted-foreground">{formatDate(selectedQR.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleCopyLink(selectedQR.code)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('dealerQrCodes.linkButton')}
                    </Button>
                    <Button 
                      variant="outline"
                      className="flex-1"
                      onClick={() => downloadQR(selectedQR.code, 'png')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      PNG
                    </Button>
                    <Button className="flex-1" onClick={() => downloadQR(selectedQR.code, 'svg')}>
                      <Download className="h-4 w-4 mr-2" />
                      SVG
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => window.open(`/feedback/${selectedQR.code}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('dealerQrCodes.openFeedbackPage')}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
