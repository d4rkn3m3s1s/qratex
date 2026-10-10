'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QUEST_TYPE_LABELS, isKnownMechanic, isQuestType, type QuestFormValues } from './quest-form-model';

type QuestFormProps = {
  idPrefix: string;
  value: QuestFormValues;
  onChange: Dispatch<SetStateAction<QuestFormValues>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
  /** Yalnız düzenlemede gösterilir (yeni görev her zaman aktif oluşturulur). */
  showActiveToggle: boolean;
};

/**
 * Görev formu — MODÜL SEVİYESİNDE ayrı dosyada (P0-39 / P0-22). Eskiden
 * `AdminQuestsPage` gövdesinde `const QuestForm = () => …` olarak tanımlıydı;
 * her `setFormData` yeni bir bileşen tipi üretip input'u yeniden mount ediyor,
 * her tuş vuruşunda odak kayboluyordu.
 */
export function QuestForm({
  idPrefix,
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  saving,
  showActiveToggle,
}: QuestFormProps) {
  const set = <K extends keyof QuestFormValues>(key: K, v: QuestFormValues[K]) =>
    onChange((s) => ({ ...s, [key]: v }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Görev adı</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={50}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Örn: Günlük Geri Bildirim"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-description`}>Açıklama</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={200}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Görev açıklaması..."
        />
        <p className="qx-caption text-right text-fg-muted">{value.description.length}/200</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-type`}>Tür</Label>
          <Select value={value.type} onValueChange={(v) => isQuestType(v) && set('type', v)}>
            <SelectTrigger id={`${idPrefix}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(QUEST_TYPE_LABELS) as Array<keyof typeof QUEST_TYPE_LABELS>).map((k) => (
                <SelectItem key={k} value={k}>
                  {QUEST_TYPE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-target`}>Hedef</Label>
          <Input
            id={`${idPrefix}-target`}
            inputMode="numeric"
            value={value.target}
            onChange={(e) => set('target', e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-mechanic`}>Mekanik</Label>
          <Select value={value.requirementType} onValueChange={(v) => set('requirementType', v)}>
            <SelectTrigger id={`${idPrefix}-mechanic`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Manuel (elle ilerletilir)</SelectItem>
              <SelectItem value="visit_category">Ziyaret (otomatik — N farklı işletme)</SelectItem>
              {!isKnownMechanic(value.requirementType) ? (
                <SelectItem value={value.requirementType}>Mevcut mekanik: {value.requirementType}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        {value.requirementType === 'visit_category' && (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-category`}>Kategori (isteğe bağlı)</Label>
            <Input
              id={`${idPrefix}-category`}
              value={value.category}
              maxLength={60}
              onChange={(e) => set('category', e.target.value)}
              placeholder="cafe (boş = herhangi)"
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-reward`}>Ödül (puan)</Label>
          <Input
            id={`${idPrefix}-reward`}
            inputMode="numeric"
            value={value.reward}
            onChange={(e) => set('reward', e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-expires`}>Bitiş tarihi (isteğe bağlı)</Label>
          <Input
            id={`${idPrefix}-expires`}
            type="date"
            value={value.expiresAt}
            onChange={(e) => set('expiresAt', e.target.value)}
          />
        </div>
      </div>
      {showActiveToggle ? (
        <div className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}-active`}>Aktif</Label>
          <Switch id={`${idPrefix}-active`} checked={value.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          İptal
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
