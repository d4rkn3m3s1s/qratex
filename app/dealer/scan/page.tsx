'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  Camera,
  CameraOff,
  User,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ShoppingBag,
  Plus,
  History,
  CreditCard,
  ArrowRight,
  X,
  RefreshCw,
  Volume2,
  VolumeX,
  FlipHorizontal,
  Flashlight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';

interface ScannedCard {
  id: string;
  token: string;
  status: string;
  customer: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    points: number;
    level: number;
  };
  recentConsumptions: any[];
  totalConsumptions: number;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  _count: { products: number };
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  category: {
    id: string;
    name: string;
    icon: string;
  };
}

export default function DealerScanPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scannedCard, setScannedCard] = useState<ScannedCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  
  // Consumption form
  const [showConsumptionForm, setShowConsumptionForm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
    
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchProducts(selectedCategory);
    } else {
      setProducts([]);
    }
  }, [selectedCategory]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/dealer/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchProducts = async (categoryId: string) => {
    try {
      const res = await fetch(`/api/dealer/products?categoryId=${categoryId}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 1000;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      console.log('Audio not available');
    }
  }, [soundEnabled]);

  const extractToken = (text: string): string => {
    // URL'den token çıkar: https://qratex.com/c/TOKEN veya /c/TOKEN
    const urlMatch = text.match(/\/c\/([A-Za-z0-9_-]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    // Düz token
    return text.trim();
  };

  const onScanSuccess = useCallback(async (decodedText: string) => {
    // Aynı kodu tekrar taramayı engelle
    if (lastScannedCode === decodedText) return;
    setLastScannedCode(decodedText);
    
    playBeep();
    
    const token = extractToken(decodedText);
    console.log('QR Scanned:', decodedText, '-> Token:', token);
    
    // Taramayı durdur ve işle
    await handleScan(token);
    
    // 3 saniye sonra tekrar taramaya izin ver
    setTimeout(() => setLastScannedCode(null), 3000);
  }, [lastScannedCode, playBeep]);

  const startCamera = async () => {
    try {
      // Dynamic import for html5-qrcode (client-side only)
      const { Html5Qrcode } = await import('html5-qrcode');
      
      if (!scannerContainerRef.current) {
        toast.error('Scanner container bulunamadı');
        return;
      }

      // Eğer önceki scanner varsa temizle
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch (e) {}
      }

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
      };

      await scanner.start(
        { facingMode },
        config,
        onScanSuccess,
        (errorMessage) => {
          // QR kodu bulunamadığında - sürekli çağrılır, ignore et
        }
      );

      setCameraActive(true);
      toast.success('Kamera aktif - QR kodu gösterin');
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Kamera izni verilmedi. Tarayıcı ayarlarından izin verin.');
      } else if (err.name === 'NotFoundError') {
        toast.error('Kamera bulunamadı');
      } else {
        toast.error('Kamera başlatılamadı: ' + (err.message || 'Bilinmeyen hata'));
      }
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (e) {
        console.error('Error stopping scanner:', e);
      }
    }
    setCameraActive(false);
    setLastScannedCode(null);
  };

  const switchCamera = async () => {
    await stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    // Kamera yeniden başlatılacak
    setTimeout(() => startCamera(), 500);
  };

  const handleScan = async (token: string) => {
    if (!token.trim()) {
      toast.error('Token gerekli');
      return;
    }

    setScanning(true);
    setError(null);
    setScannedCard(null);

    try {
      const res = await fetch(`/api/dealer/cards/scan/${encodeURIComponent(token.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Kart bulunamadı');
        if (data.code === 'CARD_NOT_ACTIVATED') {
          toast.error('Bu kart henüz aktive edilmemiş');
        } else if (data.code === 'CARD_BLOCKED') {
          toast.error('Bu kart bloklanmış');
        } else {
          toast.error(data.error);
        }
        return;
      }

      setScannedCard(data.card);
      toast.success(`${data.card.customer.name} bulundu!`);
      await stopCamera();
    } catch (err) {
      setError('Kart taranamadı');
      toast.error('Bir hata oluştu');
    } finally {
      setScanning(false);
    }
  };

  const handleManualScan = () => {
    // URL veya düz token destekle
    const token = extractToken(manualToken);
    handleScan(token);
  };

  const handleSubmitConsumption = async () => {
    if (!scannedCard) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/dealer/consumptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardToken: scannedCard.token,
          productId: selectedProduct || undefined,
          amount: amount ? parseFloat(amount) : undefined,
          note: note || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Tüketim kaydedilemedi');
        return;
      }

      toast.success('Tüketim kaydedildi!');
      setShowConsumptionForm(false);
      resetForm();
      
      // Kartı yeniden tara (güncel bilgi için)
      handleScan(scannedCard.token);
    } catch (err) {
      toast.error('Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory('');
    setSelectedProduct('');
    setAmount('');
    setNote('');
  };

  const resetScan = () => {
    setScannedCard(null);
    setManualToken('');
    setError(null);
    setLastScannedCode(null);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <ScanLine className="w-8 h-8" />
            Kart Tara
          </h1>
          <p className="text-white/70 mt-1">Müşteri kartındaki QR kodu kameraya gösterin</p>
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Scanner Section */}
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              QR Tarayıcı
            </CardTitle>
            <CardDescription>
              Müşteri kartındaki QR kodu kameraya gösterin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Camera Preview */}
            <div className="relative aspect-square bg-muted dark:bg-slate-900 rounded-xl overflow-hidden">
              <div 
                id="qr-reader" 
                ref={scannerContainerRef}
                className={`w-full h-full ${!cameraActive ? 'hidden' : ''}`}
                style={{ 
                  minHeight: '300px',
                }}
              />
              
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                  <CameraOff className="w-16 h-16 mb-4" />
                  <p>Kamera kapalı</p>
                  <p className="text-xs text-slate-600 mt-2">Taramak için kamerayı açın</p>
                </div>
              )}

              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Scan overlay animation */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="absolute inset-0 border-4 border-emerald-500/30"
                      animate={{ opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                </div>
              )}

              {scanning && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p>Kart doğrulanıyor...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Camera controls */}
            <div className="flex gap-2">
              {!cameraActive ? (
                <Button onClick={startCamera} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  <Camera className="w-4 h-4 mr-2" />
                  Kamerayı Aç
                </Button>
              ) : (
                <>
                  <Button onClick={stopCamera} variant="destructive" className="flex-1">
                    <CameraOff className="w-4 h-4 mr-2" />
                    Kapat
                  </Button>
                  <Button onClick={switchCamera} variant="outline" size="icon" title="Kamera değiştir">
                    <FlipHorizontal className="w-4 h-4" />
                  </Button>
                  <Button 
                    onClick={() => setSoundEnabled(!soundEnabled)} 
                    variant="outline" 
                    size="icon"
                    title={soundEnabled ? 'Sesi kapat' : 'Sesi aç'}
                  >
                    {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </Button>
                </>
              )}
            </div>

            {/* Status indicator */}
            {cameraActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
              >
                <motion.div 
                  className="w-3 h-3 rounded-full bg-emerald-500"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-sm text-emerald-400">Tarama aktif - QR kodu gösterin</span>
              </motion.div>
            )}

            {/* Manual input */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs text-muted-foreground">Manuel Token Girişi</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Kart token'ını girin..."
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualScan()}
                  className="text-sm"
                />
                <Button 
                  onClick={handleManualScan} 
                  disabled={scanning || !manualToken.trim()}
                  size="sm"
                >
                  {scanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Result Section */}
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Müşteri Bilgisi
            </CardTitle>
            <CardDescription>
              Taranan kartın müşteri bilgileri
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-center py-8"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button variant="outline" onClick={resetScan}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Tekrar Dene
                  </Button>
                </motion.div>
              ) : scannedCard ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-4"
                >
                  {/* Customer info */}
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        {scannedCard.customer.image ? (
                          <img 
                            src={scannedCard.customer.image} 
                            alt={scannedCard.customer.name} 
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <User className="w-7 h-7 text-emerald-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">{scannedCard.customer.name}</h3>
                        <p className="text-sm text-muted-foreground">{scannedCard.customer.email}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            Seviye {scannedCard.customer.level}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {scannedCard.customer.points} Puan
                          </Badge>
                        </div>
                      </div>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold">{scannedCard.totalConsumptions}</p>
                      <p className="text-xs text-muted-foreground">Toplam Tüketim</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold">{scannedCard.recentConsumptions.length}</p>
                      <p className="text-xs text-muted-foreground">Son 5 Tüketim</p>
                    </div>
                  </div>

                  {/* Recent consumptions */}
                  {scannedCard.recentConsumptions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Son Tüketimler</Label>
                      {scannedCard.recentConsumptions.slice(0, 3).map((consumption) => (
                        <div key={consumption.id} className="p-2 rounded-lg bg-muted/30 text-sm flex items-center justify-between">
                          <span>{consumption.product?.name || 'Ürün belirtilmemiş'}</span>
                          <span className="text-muted-foreground">
                            {formatRelativeTime(consumption.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600"
                      onClick={() => setShowConsumptionForm(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Tüketim Ekle
                    </Button>
                    <Button variant="outline" onClick={resetScan}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                    <CreditCard className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">
                    Müşteri kartını tarayın
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Kamerayı açıp QR kodu gösterin
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* Consumption Form Dialog */}
      <Dialog open={showConsumptionForm} onOpenChange={setShowConsumptionForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Tüketim Kaydı Ekle
            </DialogTitle>
            <DialogDescription>
              {scannedCard?.customer.name} için tüketim kaydı oluşturun
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Category selection */}
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        {cat.name}
                        <span className="text-muted-foreground">({cat._count.products})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product selection */}
            {selectedCategory && (
              <div className="space-y-2">
                <Label>Ürün</Label>
                <Select value={selectedProduct} onValueChange={(val) => {
                  setSelectedProduct(val);
                  const product = products.find(p => p.id === val);
                  if (product?.price) {
                    setAmount(product.price.toString());
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ürün seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <span className="flex items-center justify-between w-full">
                          <span>{product.name}</span>
                          {product.price && (
                            <span className="text-muted-foreground ml-2">
                              {formatCurrency(product.price)}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label>Tutar (TL) - Opsiyonel</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Not - Opsiyonel</Label>
              <Textarea
                placeholder="Ek not ekleyin..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsumptionForm(false)}>
              İptal
            </Button>
            <Button 
              onClick={handleSubmitConsumption} 
              disabled={submitting}
              className="bg-gradient-to-r from-emerald-600 to-teal-600"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Kaydet
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
