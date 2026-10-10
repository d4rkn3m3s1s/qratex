/**
 * Masa sinyali metinleri (TR/EN). Turist misafir için sayfada dil anahtarı vardır; iki dil de
 * küçük olduğu için istemci adasına birlikte gelir (ortak messages/*.json'a dokunulmaz).
 */
import type { ConcernReason, RequestType, SignalStage } from '@/lib/table-signal/kinds';

export type SignalLocale = 'tr' | 'en';

const tr = {
  pageTitle: 'Masa sinyali',
  eyebrow: 'Masadan ekibe',
  heading: 'Her şey yolunda mı?',
  lead: 'Tek dokunuşla işletmenin ekibine haber verin. Adınız istenmez.',
  languageToggle: 'English',
  languageToggleAria: 'Switch to English',

  tableLabel: 'Masa / bölüm',
  tablePlaceholder: 'ör. M7, Teras 2',
  tableChip: 'Masa {table}',
  tableChange: 'Değiştir',
  tableHint: 'Ekip sizi daha hızlı bulsun diye masa numaranızı yazın (isteğe bağlı).',

  okTitle: 'Her şey yolunda',
  okBody: 'Ekibe teşekkür iletin',
  concernTitle: 'Bir şey var',
  concernBody: 'Neyin ters gittiğini seçin',
  requestHeading: 'Ekibe seslenin',
  requestWaiter: 'Garson çağır',
  requestBill: 'Hesabı iste',
  requestsUnavailable: 'Bu işletme şu anda masadan istek almıyor; sorun bildirebilirsiniz.',

  sheetTitle: 'Ne oldu?',
  sheetDescription: 'Birden fazla seçebilirsiniz. Ekip doğrudan bu bilgiyle gelir.',
  reasonsLabel: 'Sorun',
  reasons: {
    slow_service: 'Servis yavaş',
    wrong_order: 'Sipariş yanlış',
    food_quality: 'Yemek / ürün kalitesi',
    cleanliness: 'Temizlik',
    noise: 'Gürültü / ortam',
    other: 'Diğer',
  } satisfies Record<ConcernReason, string>,
  noteLabel: 'Kısa not (isteğe bağlı)',
  notePlaceholder: 'ör. Çorba soğuk geldi',
  noteHint: 'Kişisel bilgi (ad, telefon) yazmayın. Notunuz yalnız bu işletmeyle paylaşılır.',
  noteCounter: '{count}/{max}',
  linkLabel: 'Hesabımla ilişkilendir',
  linkHint: 'Açarsanız işletme size uygulama üzerinden geri dönebilir. Kapalıysa anonim gider.',
  sheetSubmit: 'Ekibe gönder',
  sheetCancel: 'Vazgeç',
  reasonRequired: 'Lütfen en az bir sorun seçin ya da kısa bir not yazın.',

  sending: 'Gönderiliyor…',
  sentOkTitle: 'Teşekkürler!',
  sentOkBody: 'İletiniz işletmeye ulaştı.',
  sentConcernTitle: 'Ekibe iletildi',
  sentRequestTitle: 'Ekip haberdar',
  sentNoTracking: 'Ekip bildirim aldı. Masanıza gelecekler.',
  duplicateNote: 'Az önce bildirdiniz; ekip zaten haberdar. Yeni bir kayıt açılmadı.',
  stages: {
    sent: 'İletildi',
    seen: 'Ekip ilgileniyor',
    resolved: 'Çözüldü',
  } satisfies Record<SignalStage, string>,
  stageAria: 'Sinyal durumu: {stage}',
  stageLive: {
    sent: 'Sinyaliniz iletildi. Ekip gördüğünde burada güncellenecek.',
    seen: 'Ekip sinyalinizi gördü ve ilgileniyor.',
    resolved: 'Ekip sorunu çözüldü olarak işaretledi.',
  } satisfies Record<SignalStage, string>,
  checkedAt: 'Son kontrol {time}',
  trackingEnded: 'Takip süresi doldu. Hâlâ bir şey varsa yeniden bildirin.',
  stillIssue: 'Hâlâ sorun var',
  newSignal: 'Yeni sinyal',
  bridgeTitle: 'Deneyiminizi puanlayın',
  bridgeBody: 'Kısa bir değerlendirme yazın, {points} puan kazanın.',
  bridgeBodyNoPoints: 'Kısa bir değerlendirme yazarak işletmeye ayrıntı iletin.',
  bridgeCta: 'Değerlendirmeye geç',
  linkedNote: 'Hesabınızla ilişkilendirildi.',

  queuedTitle: 'Bağlantı zayıf',
  queuedBody: 'Sinyaliniz bu cihazda bekliyor. Bağlantı gelince kendiliğinden gönderilecek.',
  queuedRetry: 'Şimdi tekrar dene',
  queuedDiscard: 'Vazgeç',

  kioskReset: 'Ekran {seconds} sn içinde yenilenecek',

  errors: {
    MISSING_VENUE: 'Bu bağlantıda işletme bilgisi yok. Masadaki QR’ı yeniden okutun.',
    VENUE_NOT_FOUND: 'Bu işletme bulunamadı.',
    QR_INACTIVE: 'Bu QR artık kullanılmıyor. Ekipten güncel QR’ı isteyin.',
    FEATURE_DISABLED: 'Masa sinyali şu anda kapalı.',
    REQUESTS_UNAVAILABLE: 'Bu işletme şu anda masadan istek almıyor.',
    RATE_LIMITED: 'Az önce bildirdiniz; ekip haberdar. Biraz sonra tekrar deneyebilirsiniz.',
    VALIDATION: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.',
    SERVICE_UNAVAILABLE: 'Sistem şu an yanıt vermiyor. Birazdan tekrar deneyin.',
    generic: 'Gönderilemedi. Lütfen tekrar deneyin.',
  } as Record<string, string>,

  stateMissingTitle: 'Bağlantı eksik',
  stateMissingBody: 'Bu sayfa masadaki QR ile açılır. Lütfen QR’ı yeniden okutun.',
  stateNotFoundTitle: 'İşletme bulunamadı',
  stateNotFoundBody: 'Bu bağlantı geçerli bir işletmeye ait değil. Ekipten güncel QR’ı isteyin.',
  stateInactiveTitle: 'Bu QR kullanım dışı',
  stateInactiveBody: 'İşletme bu QR’ı kaldırmış ya da süresi dolmuş. Ekipten güncel QR’ı isteyin.',
  stateDisabledTitle: 'Masa sinyali kapalı',
  stateDisabledBody: 'Bu özellik şu anda kullanılamıyor. Deneyiminizi geri bildirim sayfasından iletebilirsiniz.',
  stateErrorTitle: 'Sayfa yüklenemedi',
  stateErrorBody: 'Bağlantı ya da sunucu kaynaklı bir sorun oluştu.',
  retry: 'Tekrar dene',
  scanCta: 'QR okut',
  homeCta: 'Ana sayfa',
  privacy: 'Adınız istenmez. Masa ve notunuz yalnız bu işletmeyle paylaşılır; hesabınızla ilişkilendirmek isteğe bağlıdır.',
};

export type SignalCopy = typeof tr;

const en: SignalCopy = {
  pageTitle: 'Table signal',
  eyebrow: 'From your table to the team',
  heading: 'Is everything OK?',
  lead: 'Let the team know with one tap. No name needed.',
  languageToggle: 'Türkçe',
  languageToggleAria: 'Türkçeye geç',

  tableLabel: 'Table / area',
  tablePlaceholder: 'e.g. T7, Terrace 2',
  tableChip: 'Table {table}',
  tableChange: 'Change',
  tableHint: 'Add your table number so the team can find you faster (optional).',

  okTitle: 'All good',
  okBody: 'Send the team a thank-you',
  concernTitle: 'Something’s wrong',
  concernBody: 'Tell us what went wrong',
  requestHeading: 'Call the team',
  requestWaiter: 'Call a waiter',
  requestBill: 'Ask for the bill',
  requestsUnavailable: 'This venue isn’t taking table requests right now; you can still report an issue.',

  sheetTitle: 'What happened?',
  sheetDescription: 'Pick one or more. The team comes prepared.',
  reasonsLabel: 'Issue',
  reasons: {
    slow_service: 'Slow service',
    wrong_order: 'Wrong order',
    food_quality: 'Food / product quality',
    cleanliness: 'Cleanliness',
    noise: 'Noise / atmosphere',
    other: 'Other',
  },
  noteLabel: 'Short note (optional)',
  notePlaceholder: 'e.g. The soup was cold',
  noteHint: 'Don’t include personal details (name, phone). Your note is shared only with this venue.',
  noteCounter: '{count}/{max}',
  linkLabel: 'Link to my account',
  linkHint: 'If on, the venue can follow up with you in the app. Off means anonymous.',
  sheetSubmit: 'Send to the team',
  sheetCancel: 'Cancel',
  reasonRequired: 'Please pick at least one issue or write a short note.',

  sending: 'Sending…',
  sentOkTitle: 'Thank you!',
  sentOkBody: 'Your message reached the venue.',
  sentConcernTitle: 'Sent to the team',
  sentRequestTitle: 'The team knows',
  sentNoTracking: 'The team has been notified and will come to your table.',
  duplicateNote: 'You just reported this; the team already knows. No new ticket was opened.',
  stages: {
    sent: 'Sent',
    seen: 'Team on it',
    resolved: 'Resolved',
  },
  stageAria: 'Signal status: {stage}',
  stageLive: {
    sent: 'Your signal was sent. This updates when the team sees it.',
    seen: 'The team has seen your signal and is on it.',
    resolved: 'The team marked the issue as resolved.',
  },
  checkedAt: 'Last checked {time}',
  trackingEnded: 'Tracking has ended. If something’s still wrong, report again.',
  stillIssue: 'Still an issue',
  newSignal: 'New signal',
  bridgeTitle: 'Rate your experience',
  bridgeBody: 'Write a short review and earn {points} points.',
  bridgeBodyNoPoints: 'Write a short review to give the venue more detail.',
  bridgeCta: 'Write a review',
  linkedNote: 'Linked to your account.',

  queuedTitle: 'Weak connection',
  queuedBody: 'Your signal is waiting on this device and will be sent automatically when you’re back online.',
  queuedRetry: 'Try now',
  queuedDiscard: 'Discard',

  kioskReset: 'Screen resets in {seconds}s',

  errors: {
    MISSING_VENUE: 'This link has no venue. Please scan the table QR again.',
    VENUE_NOT_FOUND: 'Venue not found.',
    QR_INACTIVE: 'This QR is no longer in use. Ask the team for the current one.',
    FEATURE_DISABLED: 'Table signals are turned off right now.',
    REQUESTS_UNAVAILABLE: 'This venue isn’t taking table requests right now.',
    RATE_LIMITED: 'You just reported this; the team knows. Try again in a bit.',
    VALIDATION: 'Some details are invalid. Please check and try again.',
    SERVICE_UNAVAILABLE: 'The service isn’t responding. Please try again shortly.',
    generic: 'Couldn’t send. Please try again.',
  },

  stateMissingTitle: 'Link incomplete',
  stateMissingBody: 'This page opens from the table QR. Please scan it again.',
  stateNotFoundTitle: 'Venue not found',
  stateNotFoundBody: 'This link doesn’t belong to a valid venue. Ask the team for the current QR.',
  stateInactiveTitle: 'This QR is out of use',
  stateInactiveBody: 'The venue removed this QR or it expired. Ask the team for the current one.',
  stateDisabledTitle: 'Table signals are off',
  stateDisabledBody: 'This feature isn’t available right now. You can still leave feedback on the review page.',
  stateErrorTitle: 'Page couldn’t load',
  stateErrorBody: 'A connection or server problem occurred.',
  retry: 'Try again',
  scanCta: 'Scan a QR',
  homeCta: 'Home',
  privacy: 'No name needed. Your table and note are shared only with this venue; linking your account is optional.',
};

export function getSignalCopy(locale: SignalLocale): SignalCopy {
  return locale === 'en' ? en : tr;
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type { RequestType };
