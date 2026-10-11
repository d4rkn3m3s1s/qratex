'use client';

/**
 * a-iletisim arayüz metinleri (TR/EN). Bileşenler `useAdminIletisimCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminIletisimText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  unread: 'okunmamış',
  pendingFetch: 'Çekilmeyi bekleyen mailler var; tekrar senkronlayın.',
  notRead: 'Okunmadı.',
  retentionNote: 'Süresi dolan mailler ve ekleri her gün otomatik silinir. Gmail\'deki kopyalar etkilenmez.',
  newTab: '(yeni sekmede açılır)',
  yourReply: 'Yanıtınız',
  replyHint: 'Ctrl + Enter ile gönder. Konu ve konuşma başlıkları otomatik eklenir.',
  quoteOriginal: 'Orijinal maili alıntıla',
  recipients: 'Alıcılar',
  testSends: 'Test gönderimleri',
  sendHistory: 'Gönderim geçmişi',
  alreadyReceived: 'Daha önce almış',
  lastFailed: 'Son denemesi hatalı',
  bulkSend: 'Toplu gönderim',
  templateType: 'Şablon türü',
  greetingName: 'Alıcı adı (hitap)',
  content: 'İçerik',
  unsavedChanges: 'Kaydedilmemiş değişiklikler var',
  searchTemplates: 'Şablonlarda ara',
  preview: 'Önizleme',
  unsavedSendNote: 'Kaydedilmemiş değişiklikler var. Gönderim, kayıtlı hâli kullanır.',
  fmtLabel: 'Biçim:',
  fmtHeading: '1. Başlık',
  fmtNumbered: 'numaralı bölüm ·',
  fmtItem: 'madde',
  fmtOr: 'ya da',
  fmtListTail: 'liste · boş satır = yeni paragraf.',
};

export type AdminIletisimCopy = Record<keyof typeof tr, string>;

const en: AdminIletisimCopy = {
  unread: 'unread',
  pendingFetch: 'Some emails are still waiting to be fetched; sync again.',
  notRead: 'Not read.',
  retentionNote: 'Expired emails and their attachments are deleted automatically every day. Copies in Gmail aren\'t affected.',
  newTab: '(opens in a new tab)',
  yourReply: 'Your reply',
  replyHint: 'Press Ctrl + Enter to send. Subject and thread headers are added automatically.',
  quoteOriginal: 'Quote the original email',
  recipients: 'Recipients',
  testSends: 'Test sends',
  sendHistory: 'Send history',
  alreadyReceived: 'Already received',
  lastFailed: 'Last attempt failed',
  bulkSend: 'Bulk send',
  templateType: 'Template type',
  greetingName: 'Recipient name (greeting)',
  content: 'Content',
  unsavedChanges: 'You have unsaved changes',
  searchTemplates: 'Search templates',
  preview: 'Preview',
  unsavedSendNote: 'You have unsaved changes. Sending uses the saved version.',
  fmtLabel: 'Format:',
  fmtHeading: '1. Heading',
  fmtNumbered: 'numbered section ·',
  fmtItem: 'item',
  fmtOr: 'or',
  fmtListTail: 'list · blank line = new paragraph.',
};

export function useAdminIletisimCopy(): AdminIletisimCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminIletisimText({ k }: { k: keyof AdminIletisimCopy }): string {
  return useAdminIletisimCopy()[k];
}
