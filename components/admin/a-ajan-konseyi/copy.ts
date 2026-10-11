'use client';

/**
 * a-ajan-konseyi arayüz metinleri (TR/EN). Bileşenler `useAdminAjanKonseyiCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminAjanKonseyiText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  scopeNote: 'Kapsam, konseye verilen veri paketini belirler (bayi seçilirse yalnız o bayinin verisi).',
  legacyFormat: 'Eski biçim',
  publishActions: 'Aksiyonları bayi kuyruğuna yayınla',
  alreadyPublished: 'Bu bayiye zaten yayınlandı.',
  backToNew: 'Yeni oturuma dön',
  numbersOnly: 'Uzmanlara yalnız bu sayılar verildi; başka sayı kullanmaları istemde yasak.',
  noDataPack: 'Bu oturum veri paketi olmadan çalıştı (ayarlarda kapalıydı); tartışma nitel.',
  confidence: 'Güven (modelin kendi değerlendirmesi)',
  counterpoints: 'Karşı görüşler ve riskler',
  rounds: 'Tartışma turu',
  roundsHint: 'Sentezden önce kaç tur tartışılacağı. Fazla tur daha derin ama daha yavaş ve pahalıdır.',
  speakers: 'Konuşan uzmanlar',
  speakersHint: 'Kaptan her zaman açıktır (turları toparlar ve kararı yazar). En az bir uzman gerekir.',
  optional: '(isteğe bağlı)',
  lastSaved: 'Son kayıt',
  notConfigured: 'Yapılandırılmamış. Konsey oturumu başlatılamaz.',
  noSessions: 'Henüz tamamlanmış oturum yok.',
  noChanges: 'Ayarlar henüz değiştirilmedi.',
};

export type AdminAjanKonseyiCopy = Record<keyof typeof tr, string>;

const en: AdminAjanKonseyiCopy = {
  scopeNote: 'The scope sets which data pack the council gets (pick a dealer to send only that dealer\'s data).',
  legacyFormat: 'Legacy format',
  publishActions: 'Publish actions to the dealer queue',
  alreadyPublished: 'Already published to this dealer.',
  backToNew: 'Back to a new session',
  numbersOnly: 'The experts were given only these numbers; the prompt forbids them from using any others.',
  noDataPack: 'This session ran without a data pack (it was off in settings), so the discussion is qualitative.',
  confidence: 'Confidence (the model\'s own estimate)',
  counterpoints: 'Counterpoints and risks',
  rounds: 'Discussion rounds',
  roundsHint: 'How many rounds to discuss before the synthesis. More rounds go deeper but are slower and cost more.',
  speakers: 'Participating experts',
  speakersHint: 'The captain is always on (wraps up each round and writes the decision). At least one expert is required.',
  optional: '(optional)',
  lastSaved: 'Last saved',
  notConfigured: 'Not configured. Council sessions can\'t be started.',
  noSessions: 'No completed sessions yet.',
  noChanges: 'Settings haven\'t been changed yet.',
};

export function useAdminAjanKonseyiCopy(): AdminAjanKonseyiCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminAjanKonseyiText({ k }: { k: keyof AdminAjanKonseyiCopy }): string {
  return useAdminAjanKonseyiCopy()[k];
}
