'use client';

import { useEffect, useMemo, useState } from 'react';
import { useController } from 'react-hook-form';
import { ImageOff, Loader2, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntityEditorSheet, Field, MoneyField, SelectField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import { PhotoPicker, type PickedPhoto } from '@/components/ds/a11y';
import { PRODUCT_DESCRIPTION_MAX, PRODUCT_NAME_MAX, productFormSchema, type ProductFormValues } from '@/lib/dealer/catalog/schemas';
import type { CatalogCategoryDto, CatalogProductDto } from '@/lib/dealer/catalog/types';
import { catalogApi, useInvalidateCatalog } from './api';
import { useProductsCopy } from './copy';

const EMPTY: ProductFormValues = { name: '', categoryId: '', priceMinor: null, description: null, image: null };

function ImageField({ enabled }: { enabled: boolean }) {
  const { field } = useController<ProductFormValues, 'image'>({ name: 'image' });
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = useProductsCopy().editor;

  const onPick = async (next: PickedPhoto[]) => {
    setPicked(next);
    setError(null);
    const file = next[0]?.file;
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await catalogApi.uploadImage(file);
      field.onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : c.uploadFailed);
    } finally {
      setUploading(false);
      setPicked([]);
    }
  };

  if (!enabled && !field.value) return null;
  return (
    <Field label={c.image} kind="labelledby" optional error={error ?? undefined} description={enabled ? c.imageHint : undefined}>
      {(a11y) => (
        <div className="space-y-3" aria-labelledby={a11y['aria-labelledby']} role="group">
          {field.value ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- R2 alanı, küçük önizleme */}
              <img src={field.value} alt={c.imageAlt} className="h-20 w-28 rounded-control border border-subtle object-cover" />
              <Button type="button" variant="outline" className="min-h-11" onClick={() => field.onChange(null)}>
                <ImageOff className="mr-1.5 h-4 w-4" aria-hidden /> {c.removeImage}
              </Button>
            </div>
          ) : null}
          {enabled ? (
            uploading ? (
              <p className="qx-small flex items-center gap-2 text-fg-muted" role="status">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> {c.uploading}
              </p>
            ) : (
              <PhotoPicker value={picked} onChange={(n) => void onPick(n)} maxFiles={1} sources="auto" onError={setError} aria-label={c.pickImage} />
            )
          ) : (
            <p className="qx-caption text-fg-muted">{c.uploadOff}</p>
          )}
        </div>
      )}
    </Field>
  );
}

/**
 * Ürün oluştur / düzenle çekmecesi (tek form; eski sayfadaki iki kopya form birleşti — Bulgu 11).
 * Paylaşılan zod şeması sınırları önceden gösterir, Enter ile gönderilir, sunucu hatası alana
 * düşer; düzenlemede `baseUpdatedAt` ile eşzamanlı değişiklik 409 olarak yakalanır.
 */
export function ProductEditor({
  open,
  onOpenChange,
  product,
  categories,
  imageUploadEnabled,
  defaultCategoryId,
  onNeedCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: CatalogProductDto | null;
  categories: CatalogCategoryDto[];
  imageUploadEnabled: boolean;
  defaultCategoryId: string | null;
  onNeedCategory: () => void;
}) {
  const invalidate = useInvalidateCatalog();
  const copy = useProductsCopy();
  const c = copy.editor;
  const form = useZodForm(productFormSchema, { defaultValues: EMPTY });
  const mode = product ? 'edit' : 'create';

  useEffect(() => {
    if (!open) return;
    form.reset(
      product
        ? {
            name: product.name,
            categoryId: product.category.id,
            priceMinor: product.priceMinor,
            description: product.description,
            image: product.image,
          }
        : { ...EMPTY, categoryId: defaultCategoryId ?? '' }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta / kayıt değişince
  }, [open, product?.id, product?.updatedAt]);

  const options = useMemo(() => {
    const active = categories.filter((x) => x.isActive);
    const opts = active.map((x) => ({ value: x.id, label: `${x.icon} ${x.name}${x.isGlobal ? c.systemSuffix : ''}` }));
    // Ürünün kategorisi arşivdeyse seçim boş görünmesin (envanter #25).
    if (product && !active.some((x) => x.id === product.category.id)) {
      opts.unshift({ value: product.category.id, label: `${product.category.icon} ${product.category.name}${copy.common.archivedSuffix}` });
    }
    return opts;
  }, [categories, product, c, copy]);

  const noCategory = options.length === 0;

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      entityLabel={c.entity}
      form={form}
      width="lg"
      onSubmit={async (v) => {
        const body = {
          name: v.name,
          categoryId: v.categoryId,
          priceMinor: v.priceMinor,
          description: v.description?.trim() ? v.description : null,
          image: v.image,
        };
        const res = product
          ? await catalogApi.updateProduct(product.id, { ...body, baseUpdatedAt: product.updatedAt })
          : await catalogApi.createProduct(body);
        return res.product;
      }}
      onSaved={(saved) => invalidate((saved as CatalogProductDto | undefined)?.id)}
    >
      <div className="space-y-5">
        <TextField control={form.control} name="name" label={c.name} required maxLength={PRODUCT_NAME_MAX} autoComplete="off" />
        {noCategory ? (
          <div className="rounded-control border border-dashed border-strong p-4">
            <p className="qx-small text-fg">{c.needCategory}</p>
            <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={onNeedCategory}>
              <Tags className="mr-1.5 h-4 w-4" aria-hidden /> {c.createCategory}
            </Button>
          </div>
        ) : (
          <SelectField control={form.control} name="categoryId" label={c.category} required options={options} placeholder={c.categoryPlaceholder} />
        )}
        <MoneyField
          control={form.control}
          name="priceMinor"
          label={c.price}
          optional
          description={c.priceHint}
        />
        <TextareaField
          control={form.control}
          name="description"
          label={c.description}
          optional
          emptyAsNull
          maxLength={PRODUCT_DESCRIPTION_MAX}
          rows={3}
        />
        <ImageField enabled={imageUploadEnabled} />
      </div>
    </EntityEditorSheet>
  );
}
