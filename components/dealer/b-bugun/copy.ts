/**
 * Bayi "Bugün" metinleri (TR/EN). Uygulama dilini `useDsLocale()` ile izler. API metin
 * üretmez (kod + parametre döner); bütün kullanıcı metni burada. Paylaşılan
 * `messages/*.json` dosyalarına dokunulmaz (eşzamanlı düzenleme çakışması olmasın).
 */
import { useDsLocale, type DsLocale } from '@/components/ds/a11y/copy';
import type { Severity } from '@/components/ds/data/status-meta';
import type { Greeting, NextAction, NextActionKind, SetupStepKey, TodoPriority } from '@/lib/dealer-today/types';

type Copy = {
  pageTitle: string;
  eyebrow: string;
  greeting: Record<Greeting, string>;
  fallbackName: string;
  updatedAt: (time: string) => string;
  refresh: string;
  refreshing: string;
  scan: string;
  newQr: string;
  tabs: { today: string; weekly: string; aria: string };
  errorTitle: string;
  errorDesc: string;
  setup: {
    title: string;
    progress: (done: number, total: number) => string;
    desc: string;
    collapse: string;
    expand: string;
    optional: string;
    done: string;
    step: Record<SetupStepKey, { title: string; desc: string; cta: string }>;
    progressLabel: string;
  };
  metrics: {
    title: string;
    feedbackToday: string;
    consumptionsToday: string;
    avgRating: string;
    responseRate: string;
    vsYesterday: string;
    vsPrev7: string;
    last7: string;
    medianResponse: (d: string) => string;
    noResponseYet: string;
    sparkFeedback: (vals: string) => string;
    sparkConsumptions: (vals: string) => string;
    sparkRating: (vals: string) => string;
  };
  next: {
    title: string;
    desc: string;
    allClear: string;
    allClearDesc: string;
    open: string;
    title_: Record<NextActionKind, (a: NextAction) => string>;
    detail: Record<NextActionKind, (a: NextAction) => string>;
  };
  waiting: {
    title: string;
    desc: (total: number) => string;
    empty: string;
    emptyDesc: string;
    reply: string;
    seeAll: string;
    qr: string;
    consumption: string;
    stars: (n: number) => string;
    noText: string;
    overdue: string;
  };
  todos: {
    title: string;
    desc: (n: number) => string;
    empty: string;
    emptyDesc: string;
    complete: string;
    undo: string;
    completed: string;
    reopened: string;
    due: (d: string) => string;
    overdue: string;
    assignee: (n: string) => string;
    seeAll: string;
    suggestionsTitle: string;
    suggestionsDesc: string;
    add: string;
    dismiss: string;
    added: string;
    dismissed: string;
    duplicate: string;
    failed: string;
    fromRating: (n: number) => string;
    priority: Record<TodoPriority, string>;
  };
  ops: {
    title: string;
    desc: string;
    openTodos: string;
    overdueTodos: (n: number) => string;
    remedyAwaiting: string;
    remedyPending: (n: number) => string;
    incidents: string;
    activeQr: string;
    activeProducts: string;
    locations: (n: number) => string;
    dailyTitle: string;
    dailyFeedback: string;
    dailyConsumptions: string;
    day: string;
    avg: string;
    distributionTitle: string;
    positive: string;
    neutral: string;
    negative: string;
    noRatings: string;
    sources: (qr: number, cr: number) => string;
    severity: Record<Severity, string>;
  };
  weekly: {
    title: string;
    range: (from: string, to: string) => string;
    inProgress: string;
    prev: string;
    next: string;
    feedback: string;
    avgRating: string;
    negativeRate: string;
    responseRate: string;
    consumptions: string;
    vsPrevWeek: string;
    sources: (qr: number, cr: number) => string;
    themesTitle: string;
    themesDesc: string;
    themesEmpty: string;
    themeRow: (count: number, pos: number, neg: number) => string;
    themePrev: (n: number) => string;
    autoTitle: string;
    autoBadge: string;
    autoEmpty: string;
    addToTodos: string;
    aiTitle: string;
    aiBadge: string;
    aiDesc: string;
    aiGenerate: string;
    aiRegenerate: string;
    aiGenerating: string;
    aiUnavailable: string;
    aiFailed: string;
    aiGeneratedAt: (t: string) => string;
    archiveTitle: string;
    archiveDesc: string;
    archiveEmpty: string;
    archiveMore: string;
    csv: string;
    archiveOpen: string;
    archiveCols: { week: string; feedback: string; avg: string; negative: string; response: string; consumptions: string; brief: string };
    hasBrief: string;
    errorTitle: string;
  };
};

const tr: Copy = {
  pageTitle: 'Bugün',
  eyebrow: 'İşletme paneli · Bugün',
  greeting: { morning: 'Günaydın', afternoon: 'İyi günler', evening: 'İyi akşamlar', night: 'İyi geceler' },
  fallbackName: 'işletmen',
  updatedAt: (t) => `Son güncelleme ${t}`,
  refresh: 'Verileri yenile',
  refreshing: 'Güncelleniyor…',
  scan: 'Kart tara',
  newQr: 'QR oluştur',
  tabs: { today: 'Bugün', weekly: 'Haftalık rapor', aria: 'Bugün bölümleri' },
  errorTitle: 'Bugünün özeti yüklenemedi',
  errorDesc: 'Bağlantını kontrol edip yeniden dene. Sorun sürerse rakamlar sıfır gösterilmez; burada bilgi veririz.',
  setup: {
    title: 'Kurulumu tamamla',
    progress: (d, t) => `${d}/${t} adım tamam`,
    desc: 'İlk geri bildirimi almana birkaç adım kaldı. Bu kart kurulum bitince kendiliğinden kaybolur.',
    collapse: 'Kurulum adımlarını gizle',
    expand: 'Kurulum adımlarını göster',
    optional: 'önerilen',
    done: 'Tamam',
    progressLabel: 'Kurulum ilerlemesi',
    step: {
      profile: { title: 'İşletme profilin', desc: 'İşletme adın ve kısa açıklaman müşteri ekranlarında görünür.', cta: 'Profili düzenle' },
      location: { title: 'Konum', desc: 'Adresini ya da bir şubeni ekle; yakındaki müşteriler seni bulsun.', cta: 'Konum ekle' },
      qr: { title: 'İlk QR kodun', desc: 'Masaya ya da kasaya koyacağın QR kodunu oluştur.', cta: 'QR oluştur' },
      firstFeedback: { title: 'İlk geri bildirim', desc: 'QR kodunu görünür bir yere koy; ilk yorum gelince bu adım kendiliğinden tamamlanır.', cta: 'QR kodlarına git' },
      product: { title: 'Ürünlerin', desc: 'Ürün eklersen kasada tüketim kaydı ve ürün yorumları açılır.', cta: 'Ürün ekle' },
    },
  },
  metrics: {
    title: 'Bugünün özeti',
    feedbackToday: 'Bugün gelen geri bildirim',
    consumptionsToday: 'Bugünkü işlem',
    avgRating: 'Ortalama puan · 7 gün',
    responseRate: 'Yanıt oranı · 7 gün',
    vsYesterday: 'dün bu saate göre',
    vsPrev7: 'önceki 7 güne göre',
    last7: 'QR + tüketim yorumu, bugün dahil son 7 gün',
    medianResponse: (d) => `İlk yanıt süresi (medyan): ${d}`,
    noResponseYet: 'Bu dönemde yanıtlanan geri bildirim yok',
    sparkFeedback: (v) => `Son 7 gün geri bildirim: ${v}`,
    sparkConsumptions: (v) => `Son 7 gün işlem: ${v}`,
    sparkRating: (v) => `Son 7 gün günlük ortalama: ${v}`,
  },
  next: {
    title: 'Sıradaki adımlar',
    desc: 'Kayıtlarına göre önceliklendirildi.',
    allClear: 'Her şey yolunda',
    allClearDesc: 'Bekleyen acil bir iş yok. Yeni bir şey olursa burada görürsün.',
    open: 'Aç',
    title_: {
      unanswered_negative: (a) => (a.count === 1 ? '1 olumsuz geri bildirim yanıt bekliyor' : `${a.count} olumsuz geri bildirim yanıt bekliyor`),
      remedy_approval: (a) => (a.count === 1 ? '1 telafi teklifi onayını bekliyor' : `${a.count} telafi teklifi onayını bekliyor`),
      open_incidents: (a) => (a.count === 1 ? '1 açık vaka var' : `${a.count} açık vaka var`),
      overdue_todos: (a) => (a.count === 1 ? '1 yapılacağın süresi geçti' : `${a.count} yapılacağın süresi geçti`),
      rating_drop: () => 'Ortalama puanın düştü',
      weak_qr: (a) => `“${a.params.name ?? 'Bir QR noktası'}” düşük puan alıyor`,
      unanswered_recent: (a) => (a.count === 1 ? '1 geri bildirim yanıt bekliyor' : `${a.count} geri bildirim yanıt bekliyor`),
      quiet_week: () => 'Bu hafta hiç geri bildirim gelmedi',
    },
    detail: {
      unanswered_negative: (a) =>
        (a.params.oldestHours ?? 0) >= 24
          ? `En eskisi ${hoursText(a.params.oldestHours ?? 0, 'tr')} önce geldi. 24 saat içinde yanıt, müşteriyi geri kazanmanın en güçlü yolu.`
          : 'Erken yanıt müşteriyi geri kazanmanın en güçlü yolu.',
      remedy_approval: (a) =>
        (a.params.oldestHours ?? 0) > 0 ? `En eskisi ${hoursText(a.params.oldestHours ?? 0, 'tr')} bekliyor.` : 'Onaylarsan teklif müşteriye gider.',
      open_incidents: (a) => `En yüksek önem: ${SEVERITY_TR[a.params.maxSeverity ?? 'medium']}.`,
      overdue_todos: () => 'Tamamla ya da yeni bir tarih ver.',
      rating_drop: (a) => `Önceki 7 gün ${fmt1(a.params.from, 'tr')} → son 7 gün ${fmt1(a.params.to, 'tr')}.`,
      weak_qr: (a) => `Son 30 günde ${a.params.n ?? 0} değerlendirme, ortalama ${fmt1(a.params.avg, 'tr')}.`,
      unanswered_recent: () => 'Teşekkür etmek de sadakati artırır.',
      quiet_week: () => 'QR kodların görünür yerde mi? Masaya ve kasaya yerleştir.',
    },
  },
  waiting: {
    title: 'Yanıt bekleyenler',
    desc: (n) => (n === 0 ? 'Son 30 gün' : `Son 30 günde ${n} kayıt yanıt bekliyor · önce olumsuzlar`),
    empty: 'Yanıt bekleyen yok',
    emptyDesc: 'Son 30 günün bütün geri bildirimlerine yanıt verdin.',
    reply: 'Yanıtla',
    seeAll: 'Gelen kutusuna git',
    qr: 'QR',
    consumption: 'Tüketim',
    stars: (n) => `5 üzerinden ${n} yıldız`,
    noText: 'Yorum yazılmamış, yalnız puan',
    overdue: '24 saati geçti',
  },
  todos: {
    title: 'Yapılacaklar',
    desc: (n) => (n === 0 ? 'Açık iş yok' : `${n} açık iş`),
    empty: 'Listen boş',
    emptyDesc: 'Aşağıdaki önerilerden ekleyebilir ya da aksiyon sayfasından yeni iş açabilirsin.',
    complete: 'Tamamlandı olarak işaretle',
    undo: 'Geri al',
    completed: 'İş tamamlandı.',
    reopened: 'İş yeniden açıldı.',
    due: (d) => `Son tarih ${d}`,
    overdue: 'Süresi geçti',
    assignee: (n) => `Atanan: ${n}`,
    seeAll: 'Tüm işler',
    suggestionsTitle: 'Önerilen işler',
    suggestionsDesc: 'Son 14 günün yorumlarından AI analizinin çıkardığı, henüz listende olmayan öneriler.',
    add: 'Listeye ekle',
    dismiss: 'Yoksay',
    added: 'Yapılacaklara eklendi.',
    dismissed: 'Öneri yoksayıldı; bir daha önerilmeyecek.',
    duplicate: 'Bu öneri zaten listende.',
    failed: 'İşlem tamamlanamadı. Tekrar dene.',
    fromRating: (n) => `${n}★ yorumdan`,
    priority: { high: 'Yüksek', medium: 'Orta', low: 'Düşük' },
  },
  ops: {
    title: 'Operasyon özeti',
    desc: 'Son 7 gün, İstanbul saatiyle.',
    openTodos: 'Açık iş',
    overdueTodos: (n) => (n > 0 ? `${n} tanesinin süresi geçti` : 'Süresi geçen yok'),
    remedyAwaiting: 'Onay bekleyen telafi',
    remedyPending: (n) => `${n} teklif müşteride`,
    incidents: 'Açık vaka',
    activeQr: 'Aktif QR',
    activeProducts: 'Aktif ürün',
    locations: (n) => (n === 0 ? 'Şube kaydı yok' : `${n} şube`),
    dailyTitle: 'Günlük akış',
    dailyFeedback: 'Geri bildirim',
    dailyConsumptions: 'İşlem',
    day: 'Gün',
    avg: 'Ort. puan',
    distributionTitle: 'Puan dağılımı',
    positive: 'Olumlu (4-5★)',
    neutral: 'Nötr (3★)',
    negative: 'Olumsuz (1-2★)',
    noRatings: 'Son 7 günde değerlendirme yok.',
    sources: (qr, cr) => `${qr} QR geri bildirimi · ${cr} tüketim yorumu`,
    severity: { critical: 'Kritik', high: 'Yüksek', medium: 'Orta', low: 'Düşük', info: 'Bilgi' },
  },
  weekly: {
    title: 'Haftalık rapor',
    range: (a, b) => `${a} – ${b}`,
    inProgress: 'Hafta sürüyor',
    prev: 'Önceki hafta',
    next: 'Sonraki hafta',
    feedback: 'Geri bildirim',
    avgRating: 'Ortalama puan',
    negativeRate: 'Olumsuz oranı',
    responseRate: 'Yanıt oranı',
    consumptions: 'İşlem',
    vsPrevWeek: 'önceki haftaya göre',
    sources: (qr, cr) => `${qr} QR geri bildirimi · ${cr} tüketim yorumu`,
    themesTitle: 'Konuşulan konular',
    themesDesc: 'QR geri bildirimlerinin AI tema analizinden. Tüketim yorumlarında tema analizi yok.',
    themesEmpty: 'Bu hafta tema analizi yapılmış geri bildirim yok.',
    themeRow: (c, p, n) => `${c} kez · ${p} olumlu · ${n} olumsuz`,
    themePrev: (n) => `önceki hafta ${n}`,
    autoTitle: 'Haftanın önerisi',
    autoBadge: 'Otomatik · kural tabanlı',
    autoEmpty: 'Bu hafta için otomatik öneri üretilmedi.',
    addToTodos: 'Yapılacaklara ekle',
    aiTitle: 'AI yorumu',
    aiBadge: 'AI · yalnız bu sayıları yorumlar',
    aiDesc: 'İstersen AI bu haftanın sayılarını ve konularını kısa bir metinle yorumlasın. Yeni sayı üretmez.',
    aiGenerate: 'AI yorumu yaz',
    aiRegenerate: 'Yeniden yaz',
    aiGenerating: 'Yazılıyor…',
    aiUnavailable: 'AI özellikleri bu işletme için kapalı ya da yapılandırılmamış.',
    aiFailed: 'AI yorumu şu an yazılamadı.',
    aiGeneratedAt: (t) => `Yazıldı: ${t}`,
    archiveTitle: 'Arşiv',
    archiveDesc: 'Tamamlanmış haftalar, yeniden eskiye.',
    archiveEmpty: 'Arşivde hafta yok.',
    archiveMore: 'Daha eski haftalar',
    csv: 'CSV indir',
    archiveOpen: 'Bu haftayı aç',
    archiveCols: { week: 'Hafta', feedback: 'Geri bildirim', avg: 'Ort.', negative: 'Olumsuz', response: 'Yanıt', consumptions: 'İşlem', brief: 'Öneri' },
    hasBrief: 'Otomatik öneri var',
    errorTitle: 'Haftalık rapor yüklenemedi',
  },
};

const en: Copy = {
  pageTitle: 'Today',
  eyebrow: 'Business panel · Today',
  greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good night' },
  fallbackName: 'there',
  updatedAt: (t) => `Updated ${t}`,
  refresh: 'Refresh data',
  refreshing: 'Updating…',
  scan: 'Scan card',
  newQr: 'Create QR',
  tabs: { today: 'Today', weekly: 'Weekly report', aria: 'Today sections' },
  errorTitle: 'Today’s summary could not be loaded',
  errorDesc: 'Check your connection and try again. We never show zeros instead of an error.',
  setup: {
    title: 'Finish setting up',
    progress: (d, t) => `${d}/${t} steps done`,
    desc: 'A few steps to your first feedback. This card disappears once setup is complete.',
    collapse: 'Hide setup steps',
    expand: 'Show setup steps',
    optional: 'suggested',
    done: 'Done',
    progressLabel: 'Setup progress',
    step: {
      profile: { title: 'Business profile', desc: 'Your business name and short description appear on customer screens.', cta: 'Edit profile' },
      location: { title: 'Location', desc: 'Add your address or a branch so nearby customers can find you.', cta: 'Add location' },
      qr: { title: 'Your first QR code', desc: 'Create the QR code for your tables or counter.', cta: 'Create QR' },
      firstFeedback: { title: 'First feedback', desc: 'Place your QR code where people see it; this step completes when the first review arrives.', cta: 'Go to QR codes' },
      product: { title: 'Your products', desc: 'Products enable counter transactions and product reviews.', cta: 'Add product' },
    },
  },
  metrics: {
    title: 'Today at a glance',
    feedbackToday: 'Feedback today',
    consumptionsToday: 'Transactions today',
    avgRating: 'Average rating · 7 days',
    responseRate: 'Response rate · 7 days',
    vsYesterday: 'vs. yesterday at this time',
    vsPrev7: 'vs. previous 7 days',
    last7: 'QR + transaction reviews, last 7 days incl. today',
    medianResponse: (d) => `First response time (median): ${d}`,
    noResponseYet: 'No replied feedback in this period',
    sparkFeedback: (v) => `Feedback over the last 7 days: ${v}`,
    sparkConsumptions: (v) => `Transactions over the last 7 days: ${v}`,
    sparkRating: (v) => `Daily average over the last 7 days: ${v}`,
  },
  next: {
    title: 'Next steps',
    desc: 'Prioritised from your records.',
    allClear: 'All clear',
    allClearDesc: 'Nothing urgent is waiting. New items will show up here.',
    open: 'Open',
    title_: {
      unanswered_negative: (a) => `${a.count} negative ${a.count === 1 ? 'review needs' : 'reviews need'} a reply`,
      remedy_approval: (a) => `${a.count} remedy ${a.count === 1 ? 'offer awaits' : 'offers await'} your approval`,
      open_incidents: (a) => `${a.count} open ${a.count === 1 ? 'case' : 'cases'}`,
      overdue_todos: (a) => `${a.count} ${a.count === 1 ? 'task is' : 'tasks are'} overdue`,
      rating_drop: () => 'Your average rating dropped',
      weak_qr: (a) => `“${a.params.name ?? 'A QR spot'}” is rated low`,
      unanswered_recent: (a) => `${a.count} ${a.count === 1 ? 'review needs' : 'reviews need'} a reply`,
      quiet_week: () => 'No feedback this week',
    },
    detail: {
      unanswered_negative: (a) =>
        (a.params.oldestHours ?? 0) >= 24
          ? `The oldest arrived ${hoursText(a.params.oldestHours ?? 0, 'en')} ago. Replying within 24 hours wins customers back.`
          : 'An early reply is the best way to win the customer back.',
      remedy_approval: (a) =>
        (a.params.oldestHours ?? 0) > 0 ? `The oldest has waited ${hoursText(a.params.oldestHours ?? 0, 'en')}.` : 'Approve to send it to the customer.',
      open_incidents: (a) => `Highest severity: ${SEVERITY_EN[a.params.maxSeverity ?? 'medium']}.`,
      overdue_todos: () => 'Complete them or set a new date.',
      rating_drop: (a) => `Previous 7 days ${fmt1(a.params.from, 'en')} → last 7 days ${fmt1(a.params.to, 'en')}.`,
      weak_qr: (a) => `${a.params.n ?? 0} reviews in 30 days, average ${fmt1(a.params.avg, 'en')}.`,
      unanswered_recent: () => 'A quick thank-you builds loyalty too.',
      quiet_week: () => 'Are your QR codes visible? Place them on tables and at the counter.',
    },
  },
  waiting: {
    title: 'Awaiting reply',
    desc: (n) => (n === 0 ? 'Last 30 days' : `${n} awaiting a reply in the last 30 days · negatives first`),
    empty: 'Nothing awaiting a reply',
    emptyDesc: 'You replied to every review from the last 30 days.',
    reply: 'Reply',
    seeAll: 'Go to inbox',
    qr: 'QR',
    consumption: 'Transaction',
    stars: (n) => `${n} out of 5 stars`,
    noText: 'Rating only, no comment',
    overdue: 'Over 24 hours',
  },
  todos: {
    title: 'To-dos',
    desc: (n) => (n === 0 ? 'No open tasks' : `${n} open ${n === 1 ? 'task' : 'tasks'}`),
    empty: 'Your list is empty',
    emptyDesc: 'Add from the suggestions below or open a task on the actions page.',
    complete: 'Mark as done',
    undo: 'Undo',
    completed: 'Task completed.',
    reopened: 'Task reopened.',
    due: (d) => `Due ${d}`,
    overdue: 'Overdue',
    assignee: (n) => `Assigned: ${n}`,
    seeAll: 'All tasks',
    suggestionsTitle: 'Suggested tasks',
    suggestionsDesc: 'Suggestions from the AI analysis of the last 14 days of reviews that are not on your list yet.',
    add: 'Add to list',
    dismiss: 'Dismiss',
    added: 'Added to your to-dos.',
    dismissed: 'Suggestion dismissed; it won’t be suggested again.',
    duplicate: 'This suggestion is already on your list.',
    failed: 'Could not complete. Try again.',
    fromRating: (n) => `from a ${n}★ review`,
    priority: { high: 'High', medium: 'Medium', low: 'Low' },
  },
  ops: {
    title: 'Operations summary',
    desc: 'Last 7 days, Istanbul time.',
    openTodos: 'Open tasks',
    overdueTodos: (n) => (n > 0 ? `${n} overdue` : 'None overdue'),
    remedyAwaiting: 'Remedies awaiting approval',
    remedyPending: (n) => `${n} offers with customers`,
    incidents: 'Open cases',
    activeQr: 'Active QR codes',
    activeProducts: 'Active products',
    locations: (n) => (n === 0 ? 'No branches' : `${n} ${n === 1 ? 'branch' : 'branches'}`),
    dailyTitle: 'Daily flow',
    dailyFeedback: 'Feedback',
    dailyConsumptions: 'Transactions',
    day: 'Day',
    avg: 'Avg. rating',
    distributionTitle: 'Rating mix',
    positive: 'Positive (4-5★)',
    neutral: 'Neutral (3★)',
    negative: 'Negative (1-2★)',
    noRatings: 'No ratings in the last 7 days.',
    sources: (qr, cr) => `${qr} QR feedback · ${cr} transaction reviews`,
    severity: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' },
  },
  weekly: {
    title: 'Weekly report',
    range: (a, b) => `${a} – ${b}`,
    inProgress: 'Week in progress',
    prev: 'Previous week',
    next: 'Next week',
    feedback: 'Feedback',
    avgRating: 'Average rating',
    negativeRate: 'Negative share',
    responseRate: 'Response rate',
    consumptions: 'Transactions',
    vsPrevWeek: 'vs. previous week',
    sources: (qr, cr) => `${qr} QR feedback · ${cr} transaction reviews`,
    themesTitle: 'Topics people talked about',
    themesDesc: 'From the AI theme analysis of QR feedback. Transaction reviews have no theme analysis.',
    themesEmpty: 'No theme-analysed feedback this week.',
    themeRow: (c, p, n) => `${c} mentions · ${p} positive · ${n} negative`,
    themePrev: (n) => `previous week ${n}`,
    autoTitle: 'Suggestion of the week',
    autoBadge: 'Automatic · rule-based',
    autoEmpty: 'No automatic suggestion was generated for this week.',
    addToTodos: 'Add to to-dos',
    aiTitle: 'AI commentary',
    aiBadge: 'AI · only interprets these numbers',
    aiDesc: 'Let AI interpret this week’s numbers and topics in a short text. It does not create new numbers.',
    aiGenerate: 'Write AI commentary',
    aiRegenerate: 'Rewrite',
    aiGenerating: 'Writing…',
    aiUnavailable: 'AI features are off or not configured for this business.',
    aiFailed: 'AI commentary could not be written right now.',
    aiGeneratedAt: (t) => `Written: ${t}`,
    archiveTitle: 'Archive',
    archiveDesc: 'Completed weeks, newest first.',
    archiveEmpty: 'No weeks in the archive.',
    archiveMore: 'Older weeks',
    csv: 'Download CSV',
    archiveOpen: 'Open this week',
    archiveCols: { week: 'Week', feedback: 'Feedback', avg: 'Avg.', negative: 'Negative', response: 'Response', consumptions: 'Transactions', brief: 'Suggestion' },
    hasBrief: 'Automatic suggestion available',
    errorTitle: 'The weekly report could not be loaded',
  },
};

const SEVERITY_TR: Record<Severity, string> = tr.ops.severity;
const SEVERITY_EN: Record<Severity, string> = en.ops.severity;

function fmt1(n: number | undefined, locale: DsLocale): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function hoursText(h: number, locale: DsLocale): string {
  if (h < 1) return locale === 'en' ? 'less than an hour' : '1 saatten az';
  if (h < 48) return locale === 'en' ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${h} saat`;
  const d = Math.floor(h / 24);
  return locale === 'en' ? `${d} days` : `${d} gün`;
}

const COPY: Record<DsLocale, Copy> = { tr, en };

export type TodayCopy = Copy;

export function useTodayCopy(): { copy: TodayCopy; locale: DsLocale; tag: string } {
  const locale = useDsLocale();
  return { copy: COPY[locale], locale, tag: locale === 'en' ? 'en-US' : 'tr-TR' };
}

export function getTodayCopy(locale: DsLocale = 'tr'): TodayCopy {
  return COPY[locale];
}
