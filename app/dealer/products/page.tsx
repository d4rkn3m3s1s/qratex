'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { m as Motion, AnimatePresence } from 'framer-motion';
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
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
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
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_BG_SOFT_BR } from '@/lib/tw-brand-classes';
import { cn, formatCurrency } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';

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
  const t = useAppT();
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

  // Düzenleme / silme
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
  });
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

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
      toast.error(t('dealerProducts.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name) {
      toast.error(t('dealerProducts.categoryNameRequired'));
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

      toast.success(t('dealerProducts.categoryCreated'));
      setShowCategoryDialog(false);
      setCategoryForm({ name: '', icon: '🍽️' });
      fetchData();
    } catch (err) {
      toast.error(t('dealerProducts.categoryCreateError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!productForm.name || !productForm.categoryId) {
      toast.error(t('dealerProducts.productNameCategoryRequired'));
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

      toast.success(t('dealerProducts.productCreated'));
      setShowProductDialog(false);
      setProductForm({ name: '', description: '', price: '', categoryId: '' });
      fetchData();
    } catch (err) {
      toast.error(t('dealerProducts.productCreateError'));
    } finally {
      setSubmitting(false);
    }
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      description: product.description ?? '',
      price: product.price != null ? String(product.price) : '',
      categoryId: product.category.id,
    });
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    if (!editForm.name || !editForm.categoryId) {
      toast.error(t('dealerProducts.productNameCategoryRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/dealer/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          price: editForm.price ? parseFloat(editForm.price) : null,
          categoryId: editForm.categoryId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success(t('dealerProducts.productUpdated'));
      setEditingProduct(null);
      fetchData();
    } catch (err) {
      toast.error(t('dealerProducts.productUpdateError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dealer/products/${deletingProduct.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      toast.success(t('dealerProducts.productDeleted'));
      setDeletingProduct(null);
      fetchData();
    } catch (err) {
      toast.error(t('dealerProducts.productDeleteError'));
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
      <DashboardPageHero
        eyebrow={t('dealerProducts.eyebrow')}
        title={t('dealerProducts.title')}
        description={t('dealerProducts.description')}
        icon={<Package className="h-7 w-7" aria-hidden />}
        tone="auto"
        actions={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowCategoryDialog(true)}
              className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <Layers className="h-4 w-4 mr-2" />
              {t('dealerProducts.addCategory')}
            </Button>
            <Button type="button" onClick={() => setShowProductDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('dealerProducts.addProduct')}
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-muted-foreground">{t('dealerProducts.category')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-500/10">
                <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{products.length}</p>
                <p className="text-xs text-muted-foreground">{t('dealerProducts.product')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('dealerProducts.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full sm:w-auto">
              <TabsList className="w-full sm:w-auto overflow-x-auto">
                <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
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
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
              <Package className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{t('dealerProducts.notFoundTitle')}</h3>
            <p className="text-muted-foreground mb-2">
              {t('dealerProducts.notFoundDescription')}
            </p>
            <p className="text-sm text-muted-foreground mb-6">{t('dealerProducts.notFoundHint')}</p>
            <Button onClick={() => setShowProductDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('dealerProducts.addFirstProduct')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filteredProducts.map((product, index) => (
              <Motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: Math.min(index, 10) * 0.05 }}
              >
                <Card className="border-border/60 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-12 w-12 items-center justify-center rounded-xl text-2xl',
                            TW_BRAND_BG_SOFT_BR
                          )}
                        >
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
                          <DropdownMenuItem onClick={() => openEditProduct(product)}>
                            <Edit className="h-4 w-4 mr-2" />
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeletingProduct(product)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('common.delete')}
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
              </Motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dealerProducts.newCategory')}</DialogTitle>
            <DialogDescription>
              {t('dealerProducts.newCategoryDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dealerProducts.categoryNameRequiredLabel')}</Label>
              <Input
                placeholder={t('dealerProducts.categoryNamePlaceholder')}
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('dealerProducts.icon')}</Label>
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateCategory} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dealerProducts.newProduct')}</DialogTitle>
            <DialogDescription>
              {t('dealerProducts.newProductDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dealerProducts.productNameRequiredLabel')}</Label>
              <Input
                placeholder={t('dealerProducts.productNamePlaceholder')}
                value={productForm.name}
                onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('dealerProducts.categoryRequiredLabel')}</Label>
              <Select 
                value={productForm.categoryId} 
                onValueChange={(val) => setProductForm(prev => ({ ...prev, categoryId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('dealerProducts.selectCategoryPlaceholder')} />
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
              <Label>{t('dealerProducts.productDescription')}</Label>
              <Textarea
                placeholder={t('dealerProducts.productDescriptionPlaceholder')}
                value={productForm.description}
                onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('dealerProducts.price')}</Label>
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateProduct} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dealerProducts.editProduct')}</DialogTitle>
            <DialogDescription>{t('dealerProducts.editProductDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dealerProducts.productNameRequiredLabel')}</Label>
              <Input
                placeholder={t('dealerProducts.productNamePlaceholder')}
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('dealerProducts.categoryRequiredLabel')}</Label>
              <Select
                value={editForm.categoryId}
                onValueChange={(val) => setEditForm((prev) => ({ ...prev, categoryId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('dealerProducts.selectCategoryPlaceholder')} />
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
              <Label>{t('dealerProducts.productDescription')}</Label>
              <Textarea
                placeholder={t('dealerProducts.productDescriptionPlaceholder')}
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('dealerProducts.price')}</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={editForm.price}
                onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduct(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpdateProduct} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Product Confirm */}
      <Dialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('dealerProducts.deleteProductTitle')}</DialogTitle>
            <DialogDescription>
              {t('dealerProducts.deleteProductConfirm')}
              {deletingProduct ? ` "${deletingProduct.name}"` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingProduct(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteProduct} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
