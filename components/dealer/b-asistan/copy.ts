/**
 * AI Asistan metinleri (TR/EN). Uygulama dilini `useDsLocale()` ile izler. API metin üretmez
 * (kod + parametre döner; LLM yanıtı hariç); kullanıcıya görünen sabit metnin hepsi burada.
 * Paylaşılan `messages/*.json` dosyalarına dokunulmaz (eşzamanlı düzenleme çakışması olmasın).
 */
import { useDsLocale } from '@/components/ds/a11y/copy';
import { periodLabel, topicLabel } from '@/lib/dealer-assistant/labels';
import type { AssistantLocale, AssistantSuggestion, AssistantToolName } from '@/lib/dealer-assistant/types';

const num = (v: number | string, tag: string, digits = 1) =>
  typeof v === 'number' ? v.toLocaleString(tag, { maximumFractionDigits: digits }) : String(v);

function dayText(day: string | number, tag: string): string {
  const s = String(day);
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(tag, { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });
}

const TR = {
  locale: 'tr' as AssistantLocale,
  tag: 'tr-TR',
  title: 'AI Asistan',
  eyebrow: 'Yapay zekâ',
  description: 'İşletmenin verisine sor: sayılar sorgudan gelir, yorumlar kaynaklı gösterilir.',
  newChat: 'Yeni sohbet',
  conversations: 'Sohbetler',
  openConversations: 'Sohbet listesini aç',
  closeConversations: 'Sohbet listesini kapat',
  searchPlaceholder: 'Sohbetlerde ara',
  searchLabel: 'Sohbet başlıklarında ara',
  pinned: 'Sabitlenenler',
  today: 'Bugün',
  thisWeek: 'Bu hafta',
  older: 'Daha eski',
  untitled: 'Adsız sohbet',
  noConversations: 'Henüz sohbet yok',
  noConversationsDesc: 'İlk sorunu sorduğunda sohbetin burada saklanır.',
  noSearchResults: 'Aramayla eşleşen sohbet yok.',
  loadMore: 'Daha fazla yükle',
  listError: 'Sohbetler yüklenemedi.',
  rename: 'Yeniden adlandır',
  renameLabel: 'Sohbet başlığı',
  save: 'Kaydet',
  cancel: 'Vazgeç',
  pin: 'Sabitle',
  unpin: 'Sabitlemeyi kaldır',
  remove: 'Sil',
  removeTitle: 'Sohbet silinsin mi?',
  removeDesc: 'Sohbet listenden kaldırılır. Hemen ardından “Geri al” ile geri getirebilirsin.',
  removed: 'Sohbet silindi.',
  undo: 'Geri al',
  restored: 'Sohbet geri getirildi.',
  actionFailed: 'İşlem tamamlanamadı. Tekrar deneyin.',
  conversationActions: (title: string) => `“${title}” için işlemler`,
  welcomeTitle: 'Verine ne sormak istersin?',
  welcomeDesc: 'Asistan önce verini sorgular, sonra yanıtlar. Her sayı bir dayanak kartıyla, her alıntı kaynak yorumla gelir.',
  suggestionsLabel: 'Verine göre önerilen sorular',
  noDataTitle: 'Henüz soracak veri yok',
  noDataDesc: 'Asistan, müşterilerinden gelen geri bildirimlerle çalışır. QR kodunu paylaşıp ilk yorumları topladığında burada sorularını yanıtlar.',
  noDataCta: 'QR kodlarına git',
  composerLabel: 'Asistana sorunu yaz',
  composerPlaceholder: 'Örn. Bu ay en çok neden şikâyet edildi?',
  send: 'Gönder',
  stop: 'Durdur',
  periodLabel: 'Dönem',
  charCount: (n: number, max: number) => `${n.toLocaleString('tr-TR')} / ${max.toLocaleString('tr-TR')}`,
  enterHint: 'Enter gönderir, Shift+Enter yeni satır.',
  quota: (pct: number) => `Bugünkü AI kotasının %${pct} kadarı kullanıldı`,
  quotaExhausted: (time: string) => `Bugünkü AI kotası doldu. ${time} itibarıyla yenilenir.`,
  thinking: 'Verin inceleniyor…',
  toolRunning: {
    get_overview: 'Özet metrikler hesaplanıyor',
    get_topics: 'Konular çıkarılıyor',
    get_trend: 'Günlük eğilim okunuyor',
    get_locations: 'QR ve şubeler karşılaştırılıyor',
    get_busy_times: 'Yoğun saatler inceleniyor',
    search_feedback: 'Yorumlarda aranıyor',
    get_churn_risk: 'Kayıp riski değerlendiriliyor',
  } satisfies Record<AssistantToolName, string>,
  you: 'Sen',
  assistant: 'Asistan',
  stopped: 'Durduruldu, yanıt yarım kaldı.',
  failed: 'Gönderilemedi',
  retry: 'Yeniden dene',
  copy: 'Kopyala',
  copied: 'Yanıt kopyalandı.',
  regenerate: 'Yeniden üret',
  helpful: 'Faydalı',
  notHelpful: 'Faydasız',
  ratedThanks: 'Değerlendirmen kaydedildi.',
  sources: (n: number) => `Kaynak yorumlar (${n})`,
  openSource: (ref: string) => `${ref} kaynağını Gelen Kutusu'nda aç`,
  facts: 'Dayanak',
  basedOn: 'Bu yanıt şu sorgulara dayanır',
  openAnalytics: 'Analitikte aç',
  openInbox: 'Gelen Kutusu’nda gör',
  openRisk: 'Risk listesini aç',
  truncatedNote: 'Bu sohbetin en eski mesajları saklama sınırı nedeniyle gösterilmiyor.',
  loadConversationError: 'Sohbet yüklenemedi.',
  conversationMissing: 'Bu sohbet bulunamadı ya da silinmiş.',
  openFullPage: 'Tam sayfada aç',
  drawerTitle: 'AI Asistan',
  drawerDesc: 'İşletmenin verisi hakkında hızlı soru sor.',
  shortcut: '⌘J',
  status: {
    module_disabled: { title: 'AI Asistan kapalı', desc: 'Bu özellik yönetici tarafından geçici olarak kapatıldı.' },
    ai_disabled: { title: 'AI özellikleri kapalı', desc: 'İşletmen için AI özellikleri kapalı. AI ayarlarından açabilirsin.', cta: 'AI ayarlarını aç' },
    unconfigured: { title: 'AI şu anda kullanılamıyor', desc: 'AI sağlayıcısı yapılandırılmamış. Sorun sürerse destek ekibine yazın.' },
  },
  overviewError: 'Asistan durumu yüklenemedi.',
  errors: {
    AI_UNCONFIGURED: 'AI sağlayıcısı yapılandırılmamış.',
    AI_DISABLED: 'AI özellikleri bu işletme için kapalı.',
    AI_BUDGET_EXCEEDED: 'Bugünkü AI kotan doldu.',
    AI_RATE_LIMIT: 'Çok sık soru gönderdin. Biraz bekleyip tekrar dene.',
    RATE_LIMITED: 'Çok sık soru gönderdin. Biraz bekleyip tekrar dene.',
    INPUT_REJECTED: 'Bu soru güvenlik nedeniyle işlenemedi. Farklı ifade etmeyi dene.',
    PROVIDER_ERROR: 'AI şu anda yanıt veremedi.',
    EMPTY_ANSWER: 'Yanıt üretilemedi.',
    MODULE_DISABLED: 'Bu özellik yönetici tarafından geçici olarak kapatıldı.',
    NOT_FOUND: 'Sohbet bulunamadı.',
    NOTHING_TO_REGENERATE: 'Yeniden üretilecek soru yok.',
    CONFLICT: 'Sohbet başka bir sekmede güncellendi. Tekrar dene.',
    VALIDATION: 'Soru geçersiz. En az 2 karakter yaz.',
    NETWORK: 'Bağlantı kesildi. İnternetini kontrol edip tekrar dene.',
    INTERNAL: 'Beklenmeyen bir hata oluştu.',
  } as Record<string, string>,
  retryIn: (s: number) => `${s} sn sonra tekrar deneyebilirsin.`,
  fact: {
    feedback: 'Yorum',
    avgRating: 'Ort. puan',
    positive: 'Olumlu',
    replyRate: 'Yanıt oranı',
    nps: 'NPS',
    prev: (v: string) => `önceki: ${v}`,
    topics: 'Öne çıkan konular',
    mentions: (n: number) => `${n.toLocaleString('tr-TR')} kez`,
    analyzedBase: (n: number) => `${n.toLocaleString('tr-TR')} AI analizli yorumdan`,
    trend: 'Günlük eğilim',
    anomaly: (day: string) => `Olağan dışı gün: ${day}`,
    locations: 'QR / şube karşılaştırması',
    busiestDay: 'En yoğun gün',
    busiestHour: 'En yoğun saat',
    dip: 'Puanın düştüğü pencere',
    lowSample: 'Örneklem yetersiz',
    search: (q: string | null) => (q ? `“${q}” araması` : 'Yorum süzgeci'),
    matched: (n: number, r: number) => `${n.toLocaleString('tr-TR')} eşleşme · ${r} örnek`,
    method: { semantic: 'anlam araması', keyword: 'kelime araması', filter: 'süzgeç' } as Record<string, string>,
    churn: 'Kayıp riski',
    highRisk: 'Yüksek risk',
    urgent: 'Acil',
    analyzed: 'Analizli',
    weekdays: { mon: 'Pazartesi', tue: 'Salı', wed: 'Çarşamba', thu: 'Perşembe', fri: 'Cuma', sat: 'Cumartesi', sun: 'Pazar' } as Record<string, string>,
  },
  sentiment: { positive: 'Olumlu', neutral: 'Nötr', negative: 'Olumsuz' } as Record<string, string>,
  channel: { qr: 'QR', consumption: 'Ziyaret' } as Record<string, string>,
};

export type AssistantCopy = typeof TR;

const EN: AssistantCopy = {
  ...TR,
  locale: 'en',
  tag: 'en-US',
  title: 'AI Assistant',
  eyebrow: 'AI',
  description: 'Ask your business data: numbers come from queries, quotes come with sources.',
  newChat: 'New chat',
  conversations: 'Chats',
  openConversations: 'Open chat list',
  closeConversations: 'Close chat list',
  searchPlaceholder: 'Search chats',
  searchLabel: 'Search chat titles',
  pinned: 'Pinned',
  today: 'Today',
  thisWeek: 'This week',
  older: 'Older',
  untitled: 'Untitled chat',
  noConversations: 'No chats yet',
  noConversationsDesc: 'Your chat is saved here once you ask your first question.',
  noSearchResults: 'No chats match your search.',
  loadMore: 'Load more',
  listError: 'Chats could not be loaded.',
  rename: 'Rename',
  renameLabel: 'Chat title',
  save: 'Save',
  cancel: 'Cancel',
  pin: 'Pin',
  unpin: 'Unpin',
  remove: 'Delete',
  removeTitle: 'Delete this chat?',
  removeDesc: 'The chat is removed from your list. You can bring it back right away with “Undo”.',
  removed: 'Chat deleted.',
  undo: 'Undo',
  restored: 'Chat restored.',
  actionFailed: 'The action could not be completed. Try again.',
  conversationActions: (title: string) => `Actions for “${title}”`,
  welcomeTitle: 'What would you like to ask your data?',
  welcomeDesc: 'The assistant queries your data first, then answers. Every number comes with a fact card, every quote with its source review.',
  suggestionsLabel: 'Questions suggested from your data',
  noDataTitle: 'No data to ask about yet',
  noDataDesc: 'The assistant works with feedback from your customers. Share your QR code and collect your first reviews to start asking.',
  noDataCta: 'Go to QR codes',
  composerLabel: 'Type your question for the assistant',
  composerPlaceholder: 'E.g. What did customers complain about most this month?',
  send: 'Send',
  stop: 'Stop',
  periodLabel: 'Period',
  charCount: (n: number, max: number) => `${n.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`,
  enterHint: 'Enter sends, Shift+Enter adds a line.',
  quota: (pct: number) => `${pct}% of today's AI quota used`,
  quotaExhausted: (time: string) => `Today's AI quota is used up. It resets at ${time}.`,
  thinking: 'Looking at your data…',
  toolRunning: {
    get_overview: 'Calculating summary metrics',
    get_topics: 'Extracting topics',
    get_trend: 'Reading the daily trend',
    get_locations: 'Comparing QR codes and branches',
    get_busy_times: 'Checking busy hours',
    search_feedback: 'Searching reviews',
    get_churn_risk: 'Assessing churn risk',
  },
  you: 'You',
  assistant: 'Assistant',
  stopped: 'Stopped, the answer is incomplete.',
  failed: 'Not sent',
  retry: 'Retry',
  copy: 'Copy',
  copied: 'Answer copied.',
  regenerate: 'Regenerate',
  helpful: 'Helpful',
  notHelpful: 'Not helpful',
  ratedThanks: 'Your rating was saved.',
  sources: (n: number) => `Source reviews (${n})`,
  openSource: (ref: string) => `Open source ${ref} in the Inbox`,
  facts: 'Evidence',
  basedOn: 'This answer is based on these queries',
  openAnalytics: 'Open in Analytics',
  openInbox: 'View in Inbox',
  openRisk: 'Open risk list',
  truncatedNote: 'The oldest messages of this chat are hidden due to the storage limit.',
  loadConversationError: 'The chat could not be loaded.',
  conversationMissing: 'This chat was not found or has been deleted.',
  openFullPage: 'Open full page',
  drawerTitle: 'AI Assistant',
  drawerDesc: 'Ask a quick question about your business data.',
  status: {
    module_disabled: { title: 'AI Assistant is off', desc: 'This feature has been temporarily disabled by an administrator.' },
    ai_disabled: { title: 'AI features are off', desc: 'AI features are turned off for your business. You can turn them on in AI settings.', cta: 'Open AI settings' },
    unconfigured: { title: 'AI is unavailable', desc: 'No AI provider is configured. If this persists, contact support.' },
  },
  overviewError: 'Assistant status could not be loaded.',
  errors: {
    AI_UNCONFIGURED: 'No AI provider is configured.',
    AI_DISABLED: 'AI features are turned off for this business.',
    AI_BUDGET_EXCEEDED: "Today's AI quota is used up.",
    AI_RATE_LIMIT: 'Too many questions. Wait a moment and try again.',
    RATE_LIMITED: 'Too many questions. Wait a moment and try again.',
    INPUT_REJECTED: 'This question could not be processed for security reasons. Try rephrasing.',
    PROVIDER_ERROR: 'The AI could not answer right now.',
    EMPTY_ANSWER: 'No answer was produced.',
    MODULE_DISABLED: 'This feature has been temporarily disabled by an administrator.',
    NOT_FOUND: 'Chat not found.',
    NOTHING_TO_REGENERATE: 'There is no question to regenerate.',
    CONFLICT: 'The chat was updated in another tab. Try again.',
    VALIDATION: 'Invalid question. Type at least 2 characters.',
    NETWORK: 'Connection lost. Check your internet and try again.',
    INTERNAL: 'An unexpected error occurred.',
  },
  retryIn: (s: number) => `You can try again in ${s}s.`,
  fact: {
    ...TR.fact,
    feedback: 'Reviews',
    avgRating: 'Avg. rating',
    positive: 'Positive',
    replyRate: 'Reply rate',
    prev: (v: string) => `previous: ${v}`,
    topics: 'Top topics',
    mentions: (n: number) => `${n.toLocaleString('en-US')} mentions`,
    analyzedBase: (n: number) => `from ${n.toLocaleString('en-US')} AI-analyzed reviews`,
    trend: 'Daily trend',
    anomaly: (day: string) => `Unusual day: ${day}`,
    locations: 'QR / branch comparison',
    busiestDay: 'Busiest day',
    busiestHour: 'Busiest hour',
    dip: 'Low-rating window',
    lowSample: 'Sample too small',
    search: (q: string | null) => (q ? `Search “${q}”` : 'Review filter'),
    matched: (n: number, r: number) => `${n.toLocaleString('en-US')} matches · ${r} shown`,
    method: { semantic: 'semantic search', keyword: 'keyword search', filter: 'filter' },
    churn: 'Churn risk',
    highRisk: 'High risk',
    urgent: 'Urgent',
    analyzed: 'Analyzed',
    weekdays: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
  },
  sentiment: { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' },
  channel: { qr: 'QR', consumption: 'Visit' },
};

export function useAssistantCopy(): AssistantCopy {
  return useDsLocale() === 'en' ? EN : TR;
}

/** Öneri → (görünen çip metni, gönderilecek soru). */
export function suggestionText(s: AssistantSuggestion, copy: AssistantCopy): string {
  const p = s.params;
  const tag = copy.tag;
  const topic = typeof p.topic === 'string' ? topicLabel(p.topic, copy.locale) : '';
  const per = periodLabel(s.period, copy.locale).toLocaleLowerCase(tag);
  if (copy.locale === 'en') {
    switch (s.kind) {
      case 'rating_drop': return `My average rating fell from ${num(p.from, tag)} to ${num(p.to, tag)}. Why?`;
      case 'rating_rise': return `My average rating rose from ${num(p.from, tag)} to ${num(p.to, tag)}. What drove it?`;
      case 'negative_spike': return `Why did negative reviews spike on ${dayText(p.day, tag)}?`;
      case 'rising_topic': return `Complaints about “${topic}” are rising. What are customers saying?`;
      case 'fix_topic': return `What should I fix first about “${topic}”?`;
      case 'churn': return `${num(p.count, tag, 0)} reviews show high churn risk. What do they have in common?`;
      case 'weak_location': return `Why does “${p.name}” score lower than my other locations?`;
      case 'busy_dip': return 'When does my rating drop during the week?';
      case 'priorities': return `What should I prioritize this week based on the ${per}?`;
      case 'strengths': return `What do customers love about “${topic}”?`;
    }
  }
  switch (s.kind) {
    case 'rating_drop': return `Ortalama puanım düştü (${num(p.from, tag)} → ${num(p.to, tag)}). Neden?`;
    case 'rating_rise': return `Ortalama puanım yükseldi (${num(p.from, tag)} → ${num(p.to, tag)}). Ne iyi gitti?`;
    case 'negative_spike': return `${dayText(p.day, tag)} günü olumsuz yorumlar neden arttı?`;
    case 'rising_topic': return `“${topic}” şikâyetleri artıyor. Müşteriler ne diyor?`;
    case 'fix_topic': return `“${topic}” konusunda önce neyi düzeltmeliyim?`;
    case 'churn': return `${num(p.count, tag, 0)} yorumda kayıp riski yüksek. Ortak noktaları ne?`;
    case 'weak_location': return `“${p.name}” neden diğer noktalarımdan düşük puan alıyor?`;
    case 'busy_dip': return 'Haftanın hangi saatlerinde puanım düşüyor?';
    case 'priorities': return `${periodLabel(s.period, 'tr')} verisine göre bu hafta neye öncelik vermeliyim?`;
    case 'strengths': return `Müşteriler “${topic}” konusunda en çok neyi seviyor?`;
  }
  return '';
}

export function errorText(code: string | null | undefined, copy: AssistantCopy): string {
  return (code && copy.errors[code]) || copy.errors.INTERNAL;
}
