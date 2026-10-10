'use client';

import { useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import Image from 'next/image';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { REWARD_TYPE_LABELS, isImageIcon, isRewardType, type RewardFormValues } from './reward-form-model';

type RewardFormProps = {
  idPrefix: string;
  value: RewardFormValues;
  onChange: Dispatch<SetStateAction<RewardFormValues>>;
  onSubmit: () => void;
  onCancel: () => void;
  onUploadIcon: (file: File) => void;
  iconUploading: boolean;
  submitLabel: string;
  saving: boolean;
};

/**
 * Ödül formu — MODÜL SEVİYESİNDE ayrı dosyada (P0-39 / P0-22). Eskiden sayfa
 * gövdesinde `const RewardForm = () => …` idi; her tuş vuruşunda input yeniden
 * mount olup odak kayboluyordu.
 */
export function RewardForm({
  idPrefix,
  value,
  onChange,
  onSubmit,
  onCancel,
  onUploadIcon,
  iconUploading,
  submitLabel,
  saving,
}: RewardFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof RewardFormValues>(key: K, v: RewardFormValues[K]) =>
    onChange((s) => ({ ...s, [key]: v }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Ödül adı</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={50}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Örn: Premium Üyelik"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Açıklama</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={200}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Ödül açıklaması..."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-icon`}>İkon (emoji ya da görsel adresi)</Label>
        <Input
          id={`${idPrefix}-icon`}
          value={value.icon}
          onChange={(e) => set('icon', e.target.value)}
          placeholder="🎁 ya da yüklenen görsel adresi"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id={`${idPrefix}-file`}
            type="file"
            accept=".svg,.png,image/svg+xml,image/png"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadIcon(file);
              e.currentTarget.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={iconUploading}
            onClick={() => fileRef.current?.click()}
          >
            {iconUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            {iconUploading ? 'Yükleniyor…' : 'Görsel yükle'}
          </Button>
          <span className="qx-caption text-fg-muted">SVG ya da PNG, en fazla 2 MB.</span>
        </div>
        {isImageIcon(value.icon) && (
          <div className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1">
            <Image src={value.icon} alt="Yüklenen ödül görseli" width={28} height={28} className="rounded-sm" />
            <span className="truncate text-xs text-muted-foreground">{value.icon}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-type`}>Tür</Label>
          <Select value={value.type} onValueChange={(v) => isRewardType(v) && set('type', v)}>
            <SelectTrigger id={`${idPrefix}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REWARD_TYPE_LABELS) as Array<keyof typeof REWARD_TYPE_LABELS>).map((k) => (
                <SelectItem key={k} value={k}>
                  {REWARD_TYPE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-cost`}>Puan maliyeti</Label>
          <Input
            id={`${idPrefix}-cost`}
            inputMode="numeric"
            value={value.cost}
            onChange={(e) => set('cost', e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-stock`}>Stok (sınırsız için -1)</Label>
        <Input
          id={`${idPrefix}-stock`}
          inputMode="numeric"
          value={value.stock}
          onChange={(e) => set('stock', e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, ''))}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-active`}>Aktif</Label>
        <Switch id={`${idPrefix}-active`} checked={value.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          İptal
        </Button>
        <Button type="submit" disabled={saving || iconUploading}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
