'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Ban,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Loader2,
  Package,
  User,
  Calendar,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Trash2,
  UserPlus,
  UserMinus,
  Edit2,
  QrCode,
  ExternalLink,
  Copy,
  Link2,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  KanbanSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/admin-toast';
import { BRAND_CARD_QR_DARK_HEX, HEX_WHITE } from '@/lib/brand-colors';
import { formatDate, getCardStatusLabel, getCardStatusColor } from '@/lib/utils';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

// QR Code domain
const QR_DOMAIN = 'https://demoqratex.vercel.app';

const cardToasts = {
  success: (message: string) => toast.success(message),
  info: (message: string) => toast(message),
  warn: (message: string) => toast.error(message),
};

interface PhysicalCard {
  id: string;
  token: string;
  status: 'UNUSED' | 'ACTIVATED' | 'BLOCKED';
  batchId: string | null;
  activatedAt: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  _count: {
    consumptions: number;
  };
}

interface CardBatch {
  id: string;
  name: string;
  quantity: number;
  prefix: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  stats: {
    UNUSED: number;
    ACTIVATED: number;
    BLOCKED: number;
  };
}

interface CustomerOption {
  id: string;
  name: string;
  email: string;
}

export default function AdminCardsPage() {
  const { data: session } = useSession();
  const [cards, setCards] = useState<PhysicalCard[]>([]);
  const [batches, setBatches] = useState<CardBatch[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    UNUSED: 0,
    ACTIVATED: 0,
    BLOCKED: 0,
    total: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [batchFilter, setBatchFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const cardsFetchRef = useRef<AbortController | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');

  // Generate dialog
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    quantity: 100,
    batchName: '',
    prefix: '',
  });
  const [generating, setGenerating] = useState(false);

  // Card detail dialog
  const [selectedCard, setSelectedCard] = useState<PhysicalCard | null>(null);
  const [showCardDetail, setShowCardDetail] = useState(false);
  const [cardQrCode, setCardQrCode] = useState<string | null>(null);

  // Assign card dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assigningCard, setAssigningCard] = useState<PhysicalCard | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingCard, setDeletingCard] = useState<PhysicalCard | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Unassign confirmation
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [unassigningCard, setUnassigningCard] = useState<PhysicalCard | null>(null);
  const [unassigning, setUnassigning] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(searchQuery.trim()), 300);
    return () => clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced]);

  useEffect(() => {
    void fetchBatches();
    void fetchCustomers();
  }, []);

  const fetchCards = useCallback(async () => {
    cardsFetchRef.current?.abort();
    const ac = new AbortController();
    cardsFetchRef.current = ac;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', '20');
      if (statusFilter) params.set('status', statusFilter);
      if (batchFilter) params.set('batchId', batchFilter);
      if (searchDebounced) params.set('search', searchDebounced);

      const res = await fetch(`/api/admin/cards?${params}`, { signal: ac.signal });
      const data = await res.json();

      if (cardsFetchRef.current !== ac) return;
      if (data.success) {
        setCards(data.items);
        setStats(data.stats);
        setTotalPages(data.pagination?.totalPages ?? 1);
        setTotalItems(data.pagination?.total ?? data.items?.length ?? 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (cardsFetchRef.current !== ac) return;
      cardToasts.warn('Kart listesi getirilemedi.');
    } finally {
      if (cardsFetchRef.current === ac) {
        cardsFetchRef.current = null;
        setLoading(false);
      }
    }
  }, [statusFilter, batchFilter, page, searchDebounced]);

  useEffect(() => {
    void fetchCards();
    return () => {
      cardsFetchRef.current?.abort();
    };
  }, [fetchCards]);

  const fetchBatches = async () => {
    try {
      const res = await fetch('/api/admin/cards/batches');
      const data = await res.json();
      if (data.success) {
        setBatches(data.batches);
      }
    } catch (err) {
      console.error('Error fetching batches:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/admin/users?role=CUSTOMER&pageSize=100');
      const data = await res.json();
      if (data.items) {
        setCustomers(data.items.map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const handleGenerate = async () => {
    if (!generateForm.batchName || generateForm.quantity < 1) {
      cardToasts.warn('Batch adi ve miktar zorunludur.');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/admin/cards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateForm),
      });

      const data = await res.json();

      if (!res.ok) {
        cardToasts.warn(data.error ?? 'Kart uretimi tamamlanamadi.');
        return;
      }

      cardToasts.success(data.message ?? `${generateForm.quantity} kart uretildi.`);
      setShowGenerateDialog(false);
      setGenerateForm({ quantity: 100, batchName: '', prefix: '' });
      fetchCards();
      fetchBatches();
    } catch (err) {
      cardToasts.warn('Kartlar olusturulamadi.');
    } finally {
      setGenerating(false);
    }
  };

  const handleBlockCard = async (card: PhysicalCard, block: boolean) => {
    try {
      const res = await fetch(`/api/admin/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: block ? 'BLOCKED' : card.customer ? 'ACTIVATED' : 'UNUSED',
          blockReason: block ? 'Admin tarafından bloklandı' : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        cardToasts.warn(data.error ?? 'Kart durumu guncellenemedi.');
        return;
      }

      cardToasts.success(data.message ?? 'Kart durumu guncellendi.');
      fetchCards();
    } catch (err) {
      cardToasts.warn('Islem tamamlanamadi.');
    }
  };

  const handleAssignCard = async () => {
    if (!assigningCard || !selectedCustomerId) {
      cardToasts.warn('Musteri secmeden atama yapilamaz.');
      return;
    }

    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/cards/${assigningCard.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selectedCustomerId }),
      });

      const data = await res.json();

      if (!res.ok) {
        cardToasts.warn(data.error ?? 'Kart atamasi tamamlanamadi.');
        return;
      }

      cardToasts.success('Kart musteriye atandi.');
      setShowAssignDialog(false);
      setAssigningCard(null);
      setSelectedCustomerId('');
      fetchCards();
    } catch (err) {
      cardToasts.warn('Atama islemi basarisiz oldu.');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignCard = async () => {
    if (!unassigningCard) return;

    setUnassigning(true);
    try {
      const res = await fetch(`/api/admin/cards/${unassigningCard.id}/unassign`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        cardToasts.warn(data.error ?? 'Musteriden kaldirma islemi tamamlanamadi.');
        return;
      }

      cardToasts.success('Kart musteriden kaldirildi.');
      setShowUnassignDialog(false);
      setUnassigningCard(null);
      fetchCards();
    } catch (err) {
      cardToasts.warn('Islem tamamlanamadi.');
    } finally {
      setUnassigning(false);
    }
  };

  const handleDeleteCard = async () => {
    if (!deletingCard) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/cards/${deletingCard.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        cardToasts.warn(data.error ?? 'Kart silme islemi tamamlanamadi.');
        return;
      }

      cardToasts.success('Kart silindi.');
      setShowDeleteDialog(false);
      setDeletingCard(null);
      fetchCards();
    } catch (err) {
      cardToasts.warn('Silme islemi basarisiz oldu.');
    } finally {
      setDeleting(false);
    }
  };

  const openCardDetail = async (card: PhysicalCard) => {
    setSelectedCard(card);
    setShowCardDetail(true);
    
    // Generate QR code
    try {
      // PERF: qrcode lib'i ilk bundle'dan çıkar — üretim anında dynamic import.
      const QRCode = (await import('qrcode')).default;
      const url = `${QR_DOMAIN}/c/${card.token}`;
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 256,
        margin: 2,
        color: { dark: BRAND_CARD_QR_DARK_HEX, light: HEX_WHITE },
        errorCorrectionLevel: 'H',
      });
      setCardQrCode(qrDataUrl);
    } catch (err) {
      console.error('QR generation error:', err);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    cardToasts.info('Token panoya kopyalandi.');
  };

  const copyUrl = (token: string) => {
    navigator.clipboard.writeText(`${QR_DOMAIN}/c/${token}`);
    cardToasts.info('Aktivasyon URL panoya kopyalandi.');
  };

  const filteredCards = cards.filter((card) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      card.token.toLowerCase().includes(query) ||
      card.customer?.name.toLowerCase().includes(query) ||
      card.customer?.email.toLowerCase().includes(query)
    );
  });

  const kanbanColumns = {
    UNUSED: filteredCards.filter((c) => c.status === 'UNUSED'),
    ACTIVATED: filteredCards.filter((c) => c.status === 'ACTIVATED'),
    BLOCKED: filteredCards.filter((c) => c.status === 'BLOCKED'),
  };

  return (
    <div className="space-y-6 pb-8">
      <AdminPremiumHero
        eyebrow="Canlı kart operasyon merkezi"
        title="Fiziksel Kartlar"
        description="Kart üretimi, müşteri atama, blok yönetimi ve yaşam döngüsü aksiyonlarını tek panelden yönetin. Hızlı, güvenli ve tam kontrol sizde."
        icon={<CreditCard className="text-white" />}
        chips={
          <>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background/85 border border-border/70 text-foreground dark:bg-white/20 dark:border-white/30 dark:text-cyan-50">Canlı durum</span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background/85 border border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-emerald-50">Mobil uyumlu</span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background/85 border border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-amber-50">Hızlı aksiyonlar</span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-background/85 border border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-sky-50">Kanban + Liste</span>
          </>
        }
        aside={
          <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch gap-2 md:min-w-[260px]">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-background/85 border border-border/70 px-3 py-2 text-center shadow-sm dark:bg-white/15 dark:border-white/25">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground dark:text-white/80">Toplam</p>
                <p className="text-xl font-bold text-foreground dark:text-white tabular-nums">{stats.total}</p>
              </div>
              <div className="rounded-xl bg-background/85 border border-border/70 px-3 py-2 text-center shadow-sm dark:bg-white/15 dark:border-white/25">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground dark:text-white/80">Aktif</p>
                <p className="text-xl font-bold text-foreground dark:text-white tabular-nums">{stats.ACTIVATED}</p>
              </div>
            </div>
            <Button
              size="lg"
              className="bg-white text-emerald-900 hover:bg-white/95 gap-2 shadow-xl font-semibold"
              onClick={() => setShowGenerateDialog(true)}
            >
              <Plus className="h-5 w-5" />
              Kart Üret
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam', value: stats.total, icon: CreditCard, color: 'from-sky-600 to-cyan-700' },
          { label: 'Aktive Edilmemiş', value: stats.UNUSED, icon: Package, color: 'from-slate-500 to-slate-600' },
          { label: 'Aktif', value: stats.ACTIVATED, icon: CheckCircle2, color: 'from-emerald-500 to-green-600' },
          { label: 'Bloklu', value: stats.BLOCKED, icon: Ban, color: 'from-red-500 to-red-700' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border border-border/60 bg-card/70 backdrop-blur-sm overflow-hidden group hover:scale-[1.02] transition-all shadow-sm hover:shadow-lg">
              <CardContent className="p-4 relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                <div className="flex items-center gap-3 relative z-10">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.color}`}>
                    <stat.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Batches */}
      {batches.length > 0 && (
      <Card className="border border-border/60 bg-card/70 backdrop-blur-sm shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Son Üretimler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {batches.slice(0, 6).map((batch) => (
                <div
                  key={batch.id} 
                  className={`p-4 rounded-xl bg-muted/40 hover:bg-muted/70 transition-all cursor-pointer border ${batchFilter === batch.id ? 'border-sky-500 shadow-md shadow-sky-500/10' : 'border-border/60'}`}
                  onClick={() => setBatchFilter(batchFilter === batch.id ? '' : batch.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium truncate">{batch.name}</span>
                    <Badge variant="outline">{batch.quantity} kart</Badge>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-muted-foreground">{batch.stats.UNUSED} boş</span>
                    <span className="text-emerald-500">{batch.stats.ACTIVATED} aktif</span>
                    <span className="text-red-500">{batch.stats.BLOCKED} bloklu</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border border-border/60 bg-card/70 backdrop-blur-sm shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{totalItems}</span> kart bulundu
            </p>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border bg-background p-1">
                <Button
                  size="sm"
                  variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                  className="h-8 px-3"
                  onClick={() => setViewMode('kanban')}
                >
                  <KanbanSquare className="h-4 w-4 mr-1.5" />
                  Kanban
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  className="h-8 px-3"
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList className="h-4 w-4 mr-1.5" />
                  Liste
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Sayfa {page} / {Math.max(1, totalPages)}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Token veya müşteri ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Durum filtrele" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="UNUSED">Aktive Edilmemiş</SelectItem>
                <SelectItem value="ACTIVATED">Aktif</SelectItem>
                <SelectItem value="BLOCKED">Bloklu</SelectItem>
              </SelectContent>
            </Select>
            <Select value={batchFilter || 'all'} onValueChange={(v) => setBatchFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Batch filtrele" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setStatusFilter('');
                setBatchFilter('');
                setSearchQuery('');
                setSearchDebounced('');
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Sıfırla
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards Table */}
      <Card className="border border-border/60 bg-card/70 backdrop-blur-sm shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Kart bulunamadı</p>
            </div>
          ) : viewMode === 'kanban' ? (
            <div className="p-3 md:p-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
              {([
                { key: 'UNUSED', title: 'Aktive Edilmemiş', tone: 'from-slate-500/10 to-slate-600/5' },
                { key: 'ACTIVATED', title: 'Aktif', tone: 'from-emerald-500/10 to-green-600/5' },
                { key: 'BLOCKED', title: 'Bloklu', tone: 'from-red-500/10 to-red-700/5' },
              ] as const).map((col) => {
                const colCards = kanbanColumns[col.key];
                return (
                  <div key={col.key} className={`rounded-xl border bg-gradient-to-br ${col.tone} p-3`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">{col.title}</h3>
                      <Badge variant="secondary">{colCards.length}</Badge>
                    </div>
                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                      {colCards.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                          Bu kolonda kart yok
                        </div>
                      ) : (
                        colCards.map((card) => (
                          <div key={card.id} className="rounded-lg border bg-card p-3 space-y-2 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <code className="text-[11px] bg-muted px-2 py-1 rounded truncate max-w-[170px]">
                                {card.token}
                              </code>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToken(card.token)}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {card.customer ? `${card.customer.name} · ${card.customer.email}` : 'Atanmamış'}
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span>Tüketim: <strong>{card._count.consumptions}</strong></span>
                              <span>{formatDate(card.createdAt)}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => openCardDetail(card)}>
                                <Eye className="h-4 w-4 mr-1" /> Detay
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" className="flex-1">
                                    <MoreVertical className="h-4 w-4 mr-1" /> İşlemler
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => copyUrl(card.token)}>
                                    <Link2 className="h-4 w-4 mr-2" />
                                    URL Kopyala
                                  </DropdownMenuItem>
                                  {!card.customer && card.status === 'UNUSED' && (
                                    <DropdownMenuItem onClick={() => { setAssigningCard(card); setShowAssignDialog(true); }} className="text-blue-500">
                                      <UserPlus className="h-4 w-4 mr-2" />
                                      Müşteriye Ata
                                    </DropdownMenuItem>
                                  )}
                                  {card.customer && (
                                    <DropdownMenuItem onClick={() => { setUnassigningCard(card); setShowUnassignDialog(true); }} className="text-orange-500">
                                      <UserMinus className="h-4 w-4 mr-2" />
                                      Müşteriden Kaldır
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  {card.status !== 'BLOCKED' ? (
                                    <DropdownMenuItem className="text-amber-500" onClick={() => handleBlockCard(card, true)}>
                                      <Ban className="h-4 w-4 mr-2" />
                                      Blokla
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem className="text-emerald-500" onClick={() => handleBlockCard(card, false)}>
                                      <CheckCircle2 className="h-4 w-4 mr-2" />
                                      Blok Kaldır
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-red-500" onClick={() => { setDeletingCard(card); setShowDeleteDialog(true); }}>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Sil
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="grid grid-cols-1 gap-3 p-3 md:hidden">
                {filteredCards.map((card) => (
                  <div key={card.id} className="rounded-xl border border-border/70 bg-card/90 p-3 space-y-2 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={getCardStatusColor(card.status)}>{getCardStatusLabel(card.status)}</Badge>
                      <code className="text-[11px] bg-muted px-2 py-1 rounded max-w-[180px] truncate">{card.token}</code>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {card.customer ? `${card.customer.name} · ${card.customer.email}` : 'Atanmamış'}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span>Tüketim: <strong>{card._count.consumptions}</strong></span>
                      <span>{formatDate(card.createdAt)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openCardDetail(card)}>
                        <Eye className="h-4 w-4 mr-1" /> Detay
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => copyUrl(card.token)}>
                        <Copy className="h-4 w-4 mr-1" /> URL
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Müşteri</TableHead>
                      <TableHead>Tüketim</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCards.map((card) => (
                      <TableRow key={card.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {card.token.length > 20 ? `${card.token.slice(0, 20)}...` : card.token}
                            </code>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyToken(card.token)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getCardStatusColor(card.status)}>
                            {getCardStatusLabel(card.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {card.customer ? (
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                {card.customer.image ? (
                                  <img src={card.customer.image} alt={card.customer.name || 'Müşteri'} className="w-full h-full rounded-full" />
                                ) : (
                                  <User className="w-4 h-4 text-primary" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{card.customer.name}</p>
                                <p className="text-xs text-muted-foreground">{card.customer.email}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Atanmamış</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{card._count.consumptions}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(card.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openCardDetail(card)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Detay & QR
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyUrl(card.token)}>
                            <Link2 className="h-4 w-4 mr-2" />
                            URL Kopyala
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          
                          {/* Assign/Unassign */}
                          {!card.customer && card.status === 'UNUSED' && (
                            <DropdownMenuItem 
                              onClick={() => { setAssigningCard(card); setShowAssignDialog(true); }}
                              className="text-blue-500"
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Müşteriye Ata
                            </DropdownMenuItem>
                          )}
                          {card.customer && (
                            <DropdownMenuItem 
                              onClick={() => { setUnassigningCard(card); setShowUnassignDialog(true); }}
                              className="text-orange-500"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Müşteriden Kaldır
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuSeparator />
                          
                          {/* Block/Unblock */}
                          {card.status !== 'BLOCKED' ? (
                            <DropdownMenuItem 
                              className="text-amber-500"
                              onClick={() => handleBlockCard(card, true)}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Blokla
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem 
                              className="text-emerald-500"
                              onClick={() => handleBlockCard(card, false)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Blok Kaldır
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuSeparator />
                          
                          {/* Delete */}
                          <DropdownMenuItem 
                            className="text-red-500"
                            onClick={() => { setDeletingCard(card); setShowDeleteDialog(true); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Sayfa <span className="font-semibold text-foreground">{page}</span> / {Math.max(1, totalPages)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Önceki
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sonraki
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-500" />
              Toplu Kart Üret
            </DialogTitle>
            <DialogDescription>
              Yeni fiziksel kartlar için benzersiz token'lar oluşturun
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Batch Adı *</Label>
              <Input
                placeholder="Örn: Ocak 2024 - Pilot"
                value={generateForm.batchName}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, batchName: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Kart Sayısı *</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={generateForm.quantity}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
              />
              <p className="text-xs text-muted-foreground">Tek seferde en fazla 10.000 kart</p>
            </div>

            <div className="space-y-2">
              <Label>Token Prefix (Opsiyonel)</Label>
              <Input
                placeholder="Örn: QRX"
                maxLength={10}
                value={generateForm.prefix}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, prefix: e.target.value.toUpperCase() }))}
              />
              <p className="text-xs text-muted-foreground">Token başına eklenecek prefix</p>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                <p className="text-sm text-amber-500">
                  Bu işlem geri alınamaz. QR URL: {QR_DOMAIN}/c/[token]
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              İptal
            </Button>
            <Button 
              onClick={handleGenerate}
              disabled={generating || !generateForm.batchName}
              className="bg-gradient-to-r from-sky-700 to-cyan-700"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Üretiliyor...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {generateForm.quantity} Kart Üret
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Detail Dialog */}
      <Dialog open={showCardDetail} onOpenChange={setShowCardDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Kart Detayı
            </DialogTitle>
          </DialogHeader>
          {selectedCard && (
            <div className="space-y-4">
              {/* QR Code */}
              {cardQrCode && (
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-cyan-500 rounded-2xl blur-xl opacity-30" />
                    <div className="relative bg-white p-4 rounded-2xl shadow-lg">
                      <img src={cardQrCode} alt="QR Code" className="w-48 h-48" />
                    </div>
                  </div>
                </div>
              )}

              {/* Token */}
              <div className="p-4 rounded-xl bg-muted/50">
                <Label className="text-xs text-muted-foreground">Token</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-sm break-all">{selectedCard.token}</code>
                  <Button size="icon" variant="ghost" onClick={() => copyToken(selectedCard.token)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* URL */}
              <div className="p-4 rounded-xl bg-muted/50">
                <Label className="text-xs text-muted-foreground">Aktivasyon URL</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-sm break-all text-primary">
                    {QR_DOMAIN}/c/{selectedCard.token}
                  </code>
                  <Button size="icon" variant="ghost" onClick={() => copyUrl(selectedCard.token)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Durum</Label>
                  <Badge className={`mt-1 ${getCardStatusColor(selectedCard.status)}`}>
                    {getCardStatusLabel(selectedCard.status)}
                  </Badge>
                </div>
                <div className="p-4 rounded-xl bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Tüketim Sayısı</Label>
                  <p className="mt-1 font-medium">{selectedCard._count.consumptions}</p>
                </div>
              </div>

              {selectedCard.customer && (
                <div className="p-4 rounded-xl bg-muted/50">
                  <Label className="text-xs text-muted-foreground">Müşteri</Label>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{selectedCard.customer.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedCard.customer.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedCard.blockReason && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <Label className="text-xs text-red-500">Blok Sebebi</Label>
                  <p className="mt-1 text-sm">{selectedCard.blockReason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Card Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-500" />
              Kartı Müşteriye Ata
            </DialogTitle>
            <DialogDescription>
              Bu kartı bir müşteriye atayarak aktive edin
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Kart Token</p>
              <code className="text-sm">{assigningCard?.token.slice(0, 30)}...</code>
            </div>
            
            <div className="space-y-2">
              <Label>Müşteri Seç</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Müşteri seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>{customer.name}</span>
                        <span className="text-muted-foreground">({customer.email})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              İptal
            </Button>
            <Button 
              onClick={handleAssignCard}
              disabled={assigning || !selectedCustomerId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {assigning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Ata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unassign Confirmation */}
      <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kartı Müşteriden Kaldır</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kart <strong>{unassigningCard?.customer?.name}</strong> müşterisinden kaldırılacak. 
              Kart tekrar "Aktive Edilmemiş" durumuna geçecek ve başka müşteriye atanabilecek.
              Tüketim geçmişi korunacaktır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnassignCard}
              disabled={unassigning}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {unassigning && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kartı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kart kalıcı olarak silinecek. Bu işlem geri alınamaz.
              {deletingCard?._count?.consumptions && deletingCard._count.consumptions > 0 && (
                <span className="block mt-2 text-red-500">
                  ⚠️ Bu kartın {deletingCard._count.consumptions} tüketim kaydı var!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCard}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
