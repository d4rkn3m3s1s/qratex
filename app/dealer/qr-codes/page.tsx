'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
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

export default function DealerQRCodesPage() {
  const { data: session } = useSession();
  const [qrCodes, setQRCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedQR, setSelectedQR] = useState<QRCode | null>(null);
  const [qrPreview, setQrPreview] = useState<string>('');
  
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
        width: 300,
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
    try {
      const res = await fetch('/api/qr-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('QR kod oluşturuldu');
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
    toast.success('Link kopyalandı');
  };

  const handleDownloadQR = async (qr: QRCode) => {
    const qrImage = await generateQRImage(qr.code);
    const link = document.createElement('a');
    link.download = `qr-${qr.name}.png`;
    link.href = qrImage;
    link.click();
    toast.success('QR kod indirildi');
  };

  const handlePreviewQR = async (qr: QRCode) => {
    const qrImage = await generateQRImage(qr.code);
    setQrPreview(qrImage);
    setSelectedQR(qr);
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
    <div className="space-y-6">
      <DashboardHeader
        title="QR Kodlarım"
        description="Geri bildirim toplamak için QR kodlarınızı yönetin"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <QrCode className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Toplam QR</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <QrCode className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalScans}</p>
                <p className="text-xs text-muted-foreground">Tarama</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="QR kod ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni QR Kod
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni QR Kod Oluştur</DialogTitle>
              <DialogDescription>
                Müşterilerinizden geri bildirim toplamak için QR kod oluşturun
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>QR Kod Adı</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Örn: Ana Giriş Masası"
                />
              </div>
              <div className="space-y-2">
                <Label>İşletme Adı</Label>
                <Input
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="Örn: Cafe Merkez"
                />
              </div>
              <div className="space-y-2">
                <Label>Açıklama (Opsiyonel)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="QR kod açıklaması..."
                />
              </div>
              <div className="space-y-2">
                <Label>Konum (Opsiyonel)</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Örn: İstanbul, Kadıköy"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  İptal
                </Button>
                <Button onClick={handleCreate}>Oluştur</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* QR Codes Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-32 bg-muted rounded-lg" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredQRCodes.length === 0 ? (
        <Card glass>
          <CardContent className="p-8 text-center">
            <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Henüz QR kod oluşturmadınız</p>
            <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              İlk QR Kodunuzu Oluşturun
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQRCodes.map((qr, index) => (
            <motion.div
              key={qr.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card glass hover className="group">
                <CardContent className="p-6 space-y-4">
                  {/* QR Preview */}
                  <div 
                    className="h-32 bg-white rounded-lg flex items-center justify-center cursor-pointer"
                    onClick={() => handlePreviewQR(qr)}
                  >
                    <QrCode className="h-20 w-20 text-gray-800" />
                  </div>

                  {/* Info */}
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{qr.name}</h3>
                      <Badge variant={qr.isActive ? 'default' : 'secondary'}>
                        {qr.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{qr.businessName}</p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      <Eye className="h-4 w-4 inline mr-1" />
                      {qr.scanCount} tarama
                    </span>
                    <span className="text-muted-foreground">
                      {formatDate(qr.createdAt)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => window.open(`/feedback/${qr.code}`, '_blank')}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Önizle
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => handleDelete(qr.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* QR Preview Dialog */}
      <Dialog open={!!qrPreview} onOpenChange={() => setQrPreview('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedQR?.name}</DialogTitle>
            <DialogDescription>{selectedQR?.businessName}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center p-4">
            {qrPreview && (
              <img src={qrPreview} alt="QR Code" className="rounded-lg shadow-lg" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => selectedQR && handleCopyLink(selectedQR.code)}>
              <Copy className="h-4 w-4 mr-2" />
              Link Kopyala
            </Button>
            <Button onClick={() => selectedQR && handleDownloadQR(selectedQR)}>
              <Download className="h-4 w-4 mr-2" />
              İndir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



