'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  MoreVertical,
  Layers,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  icon: string;
  order: number;
  _count: { products: number };
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image: string | null;
  isActive: boolean;
  category: {
    id: string;
    name: string;
    icon: string;
  };
}

export default function DealerProductsPage() {
  const { data: session } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', icon: '🍽️' });
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, prodRes] = await Promise.all([
        fetch('/api/dealer/categories'),
        fetch('/api/dealer/products'),
      ]);
      
      const catData = await catRes.json();
      const prodData = await prodRes.json();

      if (catData.success) setCategories(catData.categories);
      if (prodData.success) setProducts(prodData.products);
    } catch (err) {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name) {
      toast.error('Kategori adı gerekli');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/dealer/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success('Kategori oluşturuldu');
      setShowCategoryDialog(false);
      setCategoryForm({ name: '', icon: '🍽️' });
      fetchData();
    } catch (err) {
      toast.error('Kategori oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!productForm.name || !productForm.categoryId) {
      toast.error('Ürün adı ve kategori gerekli');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/dealer/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...productForm,
          price: productForm.price ? parseFloat(productForm.price) : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success('Ürün oluşturuldu');
      setShowProductDialog(false);
      setProductForm({ name: '', description: '', price: '', categoryId: '' });
      fetchData();
    } catch (err) {
      toast.error('Ürün oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === 'all' || product.category.id === selectedCategory;
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const emojiOptions = ['🍽️', '🥤', '☕', '🍰', '🍕', '🍔', '🍣', '🥗', '🍿', '🍦', '🥐', '🍜'];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Package className="w-8 h-8" />
              Ürünlerim
            </h1>
            <p className="text-white/70 mt-1">Kategori ve ürün yönetimi</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={() => setShowCategoryDialog(true)}
            >
              <Layers className="h-4 w-4 mr-2" />
              Kategori Ekle
            </Button>
            <Button 
              className="bg-white text-rose-600 hover:bg-white/90"
              onClick={() => setShowProductDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ürün Ekle
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10">
                <Layers className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-muted-foreground">Kategori</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-pink-500/10">
                <Package className="h-5 w-5 text-pink-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{products.length}</p>
                <p className="text-xs text-muted-foreground">Ürün</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full sm:w-auto">
              <TabsList className="w-full sm:w-auto overflow-x-auto">
                <TabsTrigger value="all">Tümü</TabsTrigger>
                {categories.map((cat) => (
                  <TabsTrigger key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Products Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
              <Package className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Ürün bulunamadı</h3>
            <p className="text-muted-foreground mb-6">
              Henüz ürün eklememişsiniz veya filtreye uygun ürün yok
            </p>
            <Button onClick={() => setShowProductDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              İlk Ürününüzü Ekleyin
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filteredProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="border-0 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center text-2xl">
                          {product.category.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold">{product.name}</h3>
                          <p className="text-sm text-muted-foreground">{product.category.name}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Düzenle
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {product.description && (
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    {product.price && (
                      <div className="mt-3 flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold text-emerald-500">
                          {formatCurrency(product.price)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Kategori</DialogTitle>
            <DialogDescription>
              Ürünlerinizi gruplamak için kategori oluşturun
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Kategori Adı *</Label>
              <Input
                placeholder="Örn: Ana Yemekler"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>İkon</Label>
              <div className="flex flex-wrap gap-2">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setCategoryForm(prev => ({ ...prev, icon: emoji }))}
                    className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                      categoryForm.icon === emoji 
                        ? 'bg-primary text-primary-foreground scale-110' 
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
              İptal
            </Button>
            <Button onClick={handleCreateCategory} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Ürün</DialogTitle>
            <DialogDescription>
              Menünüze yeni ürün ekleyin
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Ürün Adı *</Label>
              <Input
                placeholder="Örn: Klasik Burger"
                value={productForm.name}
                onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Kategori *</Label>
              <Select 
                value={productForm.categoryId} 
                onValueChange={(val) => setProductForm(prev => ({ ...prev, categoryId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea
                placeholder="Ürün açıklaması..."
                value={productForm.description}
                onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Fiyat (TL)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={productForm.price}
                onChange={(e) => setProductForm(prev => ({ ...prev, price: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductDialog(false)}>
              İptal
            </Button>
            <Button onClick={handleCreateProduct} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
