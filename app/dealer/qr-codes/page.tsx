'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  QrCode,
  Plus,
  Search,
  Edit,
  Trash2,
  Download,
  Copy,
  ExternalLink,
  Eye,
  MoreVertical,
  Star,
  MessageSquare,
  Calendar,
  MapPin,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  Share2,
  Zap,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import QRCodeLib from 'qrcode';

interface QRCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  businessName: string;
  location: string | null;
  isActive: boolean;
  scanCount: number;
  createdAt: string;
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
  const { data: session } = useSession();
  const [qrCodes, setQRCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedQR, setSelectedQR] = useState<QRCode | null>(null);
  const [qrPreview, setQrPreview] = useState<string>('');
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    businessName: '',
    location: '',
    isActive: true,
  });

  useEffect(() => {
    fetchQRCodes();
  }, []);

  const fetchQRCodes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/qr-codes');
      const data = await res.json();
      
      if (data.success) {
        setQRCodes(data.data);
      }
    } catch (error) {
      toast.error('QR kodlar yüklenemedi');
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
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      return qrDataUrl;
    } catch (error) {
      console.error('QR generation error:', error);
      return '';
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.businessName) {
      toast.error('Lütfen zorunlu alanları doldurun');
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
        toast.success('QR kod oluşturuldu!');
        setCreateDialogOpen(false);
        resetForm();
        fetchQRCodes();
      } else {
        toast.error(data.error || 'QR kod oluşturulamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu QR kodu silmek istediğinizden emin misiniz?')) return;
    
    try {
      const res = await fetch(`/api/qr-codes/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success('QR kod silindi');
        fetchQRCodes();
      } else {
        toast.error('QR kod silinemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleCopyLink = async (code: string) => {
    const url = `${window.location.origin}/feedback/${code}`;
    await navigator.clipboard.writeText(url);
    toast.success('Link panoya kopyalandı!');
  };

  const handleDownloadQR = async (qr: QRCode) => {
    const qrImage = await generateQRImage(qr.code);
    const link = document.createElement('a');
    link.download = `qr-${qr.name}.png`;
    link.href = qrImage;
    link.click();
    toast.success('QR kod indirildi!');
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
      businessName: session?.user?.name || '',
      location: '',
      isActive: true,
    });
  };

  const filteredQRCodes = qrCodes.filter((qr) =>
    qr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    qr.businessName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: qrCodes.length,
    active: qrCodes.filter(q => q.isActive).length,
    totalScans: qrCodes.reduce((acc, q) => acc + q.scanCount, 0),
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-black/20 rounded-full blur-3xl" />
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 bg-white/30 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <QrCode className="w-8 h-8" />
                QR Kodlarım
              </h1>
              <p className="text-white/70 mt-1">Geri bildirim toplamak için QR kodlarınızı yönetin</p>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-white text-purple-600 hover:bg-white/90 gap-2 shadow-lg">
                  <Plus className="h-5 w-5" />
                  Yeni QR Kod
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
                      <QrCode className="h-5 w-5 text-white" />
                    </div>
                    Yeni QR Kod Oluştur
                  </DialogTitle>
                  <DialogDescription>
                    Müşterilerinizden geri bildirim toplamak için QR kod oluşturun
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>QR Kod Adı *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Örn: Ana Giriş Masası"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>İşletme Adı *</Label>
                    <Input
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      placeholder="Örn: Cafe Merkez"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Açıklama</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="QR kod açıklaması..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Konum</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Örn: İstanbul, Kadıköy"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    İptal
                  </Button>
                  <Button onClick={handleCreate} className="bg-gradient-to-r from-violet-600 to-fuchsia-600">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Oluştur
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Toplam QR', value: stats.total, icon: QrCode, color: 'violet', gradient: 'from-violet-500 to-purple-600' },
          { label: 'Aktif', value: stats.active, icon: CheckCircle2, color: 'emerald', gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Toplam Tarama', value: stats.totalScans, icon: Eye, color: 'blue', gradient: 'from-blue-500 to-cyan-600' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-${stat.color}-500/10`}>
                    <stat.icon className={`h-5 w-5 text-${stat.color}-500`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold"><AnimatedNumber value={stat.value} /></p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="QR kod veya işletme ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background/50"
            />
          </div>
        </CardContent>
      </Card>

      {/* QR Codes Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="border-0 bg-card/50">
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
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                <QrCode className="h-12 w-12 text-violet-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Henüz QR kod yok</h3>
              <p className="text-muted-foreground mb-6">İlk QR kodunuzu oluşturarak müşteri geri bildirimi toplamaya başlayın</p>
              <Button onClick={() => setCreateDialogOpen(true)} className="bg-gradient-to-r from-violet-600 to-fuchsia-600">
                <Plus className="h-4 w-4 mr-2" />
                İlk QR Kodunuzu Oluşturun
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      ) : (
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
                <Card className="border-0 bg-card/50 backdrop-blur-sm group hover:shadow-xl transition-all overflow-hidden">
                  <CardContent className="p-0">
                    {/* QR Preview Area */}
                    <div 
                      className="relative h-44 bg-gradient-to-br from-slate-100 to-white dark:from-slate-800 dark:to-slate-900 flex items-center justify-center cursor-pointer overflow-hidden"
                      onClick={() => handlePreviewQR(qr)}
                    >
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 flex items-center justify-center">
                        <div className="bg-white/90 dark:bg-black/80 rounded-full p-3">
                          <Eye className="h-6 w-6" />
                        </div>
                      </div>
                      <QrCode className="h-24 w-24 text-gray-800 dark:text-white group-hover:scale-95 transition-transform" />
                      
                      {/* Status Badge */}
                      <div className="absolute top-3 right-3">
                        <Badge className={qr.isActive 
                          ? 'bg-emerald-500/90 text-white border-0' 
                          : 'bg-gray-500/90 text-white border-0'
                        }>
                          {qr.isActive ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 animate-pulse" />
                              Aktif
                            </>
                          ) : 'Pasif'}
                        </Badge>
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
                                Önizle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`/feedback/${qr.code}`, '_blank')}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Sayfayı Aç
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(qr.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Sil
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-sm text-muted-foreground">{qr.businessName}</p>
                      </div>

                      {/* Stats Row */}
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">{qr.scanCount}</span>
                          <span>tarama</span>
                        </div>
                        {qr.location && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="h-4 w-4 text-rose-500" />
                            <span className="truncate max-w-[100px]">{qr.location}</span>
                          </div>
                        )}
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
                          Kopyala
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleDownloadQR(qr)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          İndir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
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
                <div className="relative p-6 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-white/20"
                    onClick={() => setPreviewDialogOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  
                  <div className="text-white">
                    <h2 className="text-xl font-bold">{selectedQR.name}</h2>
                    <p className="text-white/70">{selectedQR.businessName}</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="p-8 flex justify-center bg-white">
                  {qrPreview && (
                    <motion.img 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      src={qrPreview} 
                      alt="QR Code" 
                      className="rounded-xl shadow-lg max-w-[250px]" 
                    />
                  )}
                </div>

                {/* Info & Actions */}
                <CardContent className="p-6 space-y-4 bg-card">
                  <div className="flex items-center justify-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">{selectedQR.scanCount}</span>
                      <span className="text-muted-foreground">tarama</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-violet-500" />
                      <span className="text-muted-foreground">{formatDate(selectedQR.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleCopyLink(selectedQR.code)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Link Kopyala
                    </Button>
                    <Button 
                      className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600"
                      onClick={() => handleDownloadQR(selectedQR)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      İndir
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => window.open(`/feedback/${selectedQR.code}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Geri Bildirim Sayfasını Aç
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
