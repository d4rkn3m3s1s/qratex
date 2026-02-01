'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
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
import { toast } from 'sonner';
import { formatDate, getCardStatusLabel, getCardStatusColor } from '@/lib/utils';

// QR Code domain
const QR_DOMAIN = 'https://demoqratex.vercel.app';

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
  const [page, setPage] = useState(1);

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
    fetchCards();
    fetchBatches();
    fetchCustomers();
  }, [statusFilter, batchFilter, page]);

  const fetchCards = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', '20');
      if (statusFilter) params.set('status', statusFilter);
      if (batchFilter) params.set('batchId', batchFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/admin/cards?${params}`);
      const data = await res.json();

      if (data.success) {
        setCards(data.items);
        setStats(data.stats);
      }
    } catch (err) {
      toast.error('Kartlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

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
      toast.error('Batch adı ve miktar gerekli');
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
        toast.error(data.error);
        return;
      }

      toast.success(data.message);
      setShowGenerateDialog(false);
      setGenerateForm({ quantity: 100, batchName: '', prefix: '' });
      fetchCards();
      fetchBatches();
    } catch (err) {
      toast.error('Kartlar oluşturulamadı');
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
        toast.error(data.error);
        return;
      }

      toast.success(data.message);
      fetchCards();
    } catch (err) {
      toast.error('İşlem başarısız');
    }
  };

  const handleAssignCard = async () => {
    if (!assigningCard || !selectedCustomerId) {
      toast.error('Müşteri seçin');
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
        toast.error(data.error);
        return;
      }

      toast.success('Kart müşteriye atandı!');
      setShowAssignDialog(false);
      setAssigningCard(null);
      setSelectedCustomerId('');
      fetchCards();
    } catch (err) {
      toast.error('Atama başarısız');
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
        toast.error(data.error);
        return;
      }

      toast.success('Kart müşteriden kaldırıldı!');
      setShowUnassignDialog(false);
      setUnassigningCard(null);
      fetchCards();
    } catch (err) {
      toast.error('İşlem başarısız');
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
        toast.error(data.error);
        return;
      }

      toast.success('Kart silindi!');
      setShowDeleteDialog(false);
      setDeletingCard(null);
      fetchCards();
    } catch (err) {
      toast.error('Silme başarısız');
    } finally {
      setDeleting(false);
    }
  };

  const openCardDetail = async (card: PhysicalCard) => {
    setSelectedCard(card);
    setShowCardDetail(true);
    
    // Generate QR code
    try {
      const url = `${QR_DOMAIN}/c/${card.token}`;
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 256,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });
      setCardQrCode(qrDataUrl);
    } catch (err) {
      console.error('QR generation error:', err);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success('Token kopyalandı!');
  };

  const copyUrl = (token: string) => {
    navigator.clipboard.writeText(`${QR_DOMAIN}/c/${token}`);
    toast.success('URL kopyalandı!');
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

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <CreditCard className="w-8 h-8" />
              Fiziksel Kartlar
            </h1>
            <p className="text-white/70 mt-1">Kart üretimi, atama ve yönetimi</p>
          </div>
          <Button 
            size="lg" 
            className="bg-white text-purple-600 hover:bg-white/90 gap-2 shadow-lg"
            onClick={() => setShowGenerateDialog(true)}
          >
            <Plus className="h-5 w-5" />
            Kart Üret
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam', value: stats.total, icon: CreditCard, color: 'from-violet-500 to-purple-600' },
          { label: 'Aktive Edilmemiş', value: stats.UNUSED, icon: Package, color: 'from-slate-500 to-slate-600' },
          { label: 'Aktif', value: stats.ACTIVATED, icon: CheckCircle2, color: 'from-emerald-500 to-green-600' },
          { label: 'Bloklu', value: stats.BLOCKED, icon: Ban, color: 'from-red-500 to-rose-600' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden group hover:scale-105 transition-transform">
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
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Son Üretimler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {batches.slice(0, 6).map((batch) => (
                <div 
                  key={batch.id} 
                  className={`p-4 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer border-2 ${batchFilter === batch.id ? 'border-purple-500' : 'border-transparent'}`}
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
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
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
            <Button variant="outline" onClick={() => { setStatusFilter(''); setBatchFilter(''); setSearchQuery(''); }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Sıfırla
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards Table */}
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
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
          ) : (
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
                              <img src={card.customer.image} alt="" className="w-full h-full rounded-full" />
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
          )}
        </CardContent>
      </Card>

      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
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
              className="bg-gradient-to-r from-violet-600 to-fuchsia-600"
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
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-2xl blur-xl opacity-30" />
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
