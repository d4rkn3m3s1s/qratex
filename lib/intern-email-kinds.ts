/**
 * Stajyer/genel mail ŞABLON TÜRLERİ — client-safe sabitler (prisma/server importu YOK).
 * Hem server render'ı (lib/intern-task-emails.ts) hem admin UI (client) buradan okur.
 */

/**
 * Şablon türü — mailin görsel kimliğini ve içerik bölümlerini belirler.
 *  - task     : görev ataması (departman rozeti + "son teslim" kartı) — VARSAYILAN.
 *  - general  : serbest/normal yazışma (rozet yok, son teslim yok, sade profesyonel).
 *  - welcome  : hoş geldin / duyuru (kutlama tonu).
 *  - reminder : hatırlatma / teşekkür (dikkat çekici üst şerit).
 *  - minimal  : sadece logo + içerik (en sade taban).
 */
export type InternEmailKind = 'task' | 'general' | 'welcome' | 'reminder' | 'minimal';

export const INTERN_EMAIL_KINDS: { value: InternEmailKind; label: string; emoji: string; hint: string }[] = [
  { value: 'task', label: 'Görev', emoji: '🎯', hint: 'Departman rozeti + son teslim kartı' },
  { value: 'general', label: 'Genel / Serbest', emoji: '✉️', hint: 'Normal yazışma, sade profesyonel' },
  { value: 'welcome', label: 'Hoş geldin / Duyuru', emoji: '🎉', hint: 'Kutlama tonu, karşılama' },
  { value: 'reminder', label: 'Hatırlatma / Teşekkür', emoji: '🔔', hint: 'Dikkat çekici üst şerit' },
  { value: 'minimal', label: 'Minimal', emoji: '⚪', hint: 'Sadece logo + içerik' },
];

export function isInternEmailKind(v: unknown): v is InternEmailKind {
  return v === 'task' || v === 'general' || v === 'welcome' || v === 'reminder' || v === 'minimal';
}

/** Mailde kullanılabilecek {{değişken}}'ler (UI ipucu + doldurma). Client-safe. */
export const MAIL_VARIABLES: { token: string; label: string }[] = [
  { token: '{{isim}}', label: 'Alıcı adı' },
  { token: '{{departman}}', label: 'Departman' },
  { token: '{{email}}', label: 'E-posta' },
  { token: '{{deadline}}', label: 'Son teslim' },
  { token: '{{konu}}', label: 'Konu' },
];
