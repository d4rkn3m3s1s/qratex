/**
 * TEK NAVİGASYON KAYDI (yol haritası §4.3, bilgi mimarisi raporu §4.1).
 *
 * Sidebar, mobil alt sekme çubuğu, ⌘K paleti, menü görünürlük kataloğu
 * (`lib/visibility-controls.ts`), `next.config.js` yönlendirmeleri
 * (`lib/navigation/redirects.json`) ve dosya sistemiyle iki yönlü test
 * (`__tests__/menu-visibility-catalog.test.ts`) BU dosyadan türetilir.
 *
 * Bu dosya saf veridir: React, Prisma ya da `next/*` içe aktarmaz; hem sunucuda
 * (getShellConfig) hem istemcide hem de jest'te güvenle yüklenir. İkonlar dize
 * adıdır, bileşene `lib/navigation/icons.tsx` çevirir.
 *
 * ── Yeni sayfa eklerken ──
 * 1. Buraya bir satır ekle (`id` kalıcıdır; DB sıra/grup ayarları onu tutar).
 * 2. Eski bir URL'nin yerini alıyorsa `redirectFrom`'a yaz, sonra
 *    `UPDATE_NAV_REDIRECTS=1 npx jest __tests__/menu-visibility-catalog.test.ts`
 *    ile `redirects.json`'ı yenile. (Yönlendirme yalnız hedef sayfa VARSA ve eski
 *    sayfa emekli koçanına çevrildiyse ya da silindiyse etkinleşir — next.config.js.)
 * 3. Bayi/müşteri menüsünde admin'in gizleyebilmesi gerekiyorsa `menuKey` ver.
 *
 * Durumlar:
 *  - primary   → kabuğun üst düzeyi (sidebar öğesi / grup öğesi, mobil sekme)
 *  - secondary → bir primary'nin alt öğesi (sidebar'da iç içe, palette görünür)
 *  - child     → sekme ya da alt eylem sayfası; menüde değil, palette görünür
 *  - hidden    → erişilebilir ama menü/palette dışı (dinamik detay, eski yüzey)
 *  - deprecated→ emekli; yalnız yönlendirme kaynağı olarak anlamlı
 */

export type NavRole = 'customer' | 'dealer' | 'admin' | 'staff';
export type NavStatus = 'primary' | 'secondary' | 'child' | 'hidden' | 'deprecated';
export type NavEntity = 'user' | 'dealer' | 'product' | 'qr' | 'feedback' | 'card';
/** İstemcide sayaç rozeti için çözülen anahtar (veri istemci tarafında çekilir). */
export type NavBadgeKey = 'dealerInbox';

export type Bilingual = { tr: string; en: string };

/** `lib/navigation/icons.tsx` bu adların her birine bir lucide bileşeni bağlar. */
export const NAV_ICON_NAMES = [
  'Home',
  'Compass',
  'ScanLine',
  'Gamepad2',
  'Wallet',
  'User',
  'Target',
  'Users2',
  'Trophy',
  'CreditCard',
  'Gift',
  'Ticket',
  'History',
  'Heart',
  'Gauge',
  'Award',
  'Sparkles',
  'MessageSquare',
  'UserPlus',
  'Settings',
  'LayoutDashboard',
  'Inbox',
  'ClipboardCheck',
  'AlertTriangle',
  'ListChecks',
  'Users',
  'Megaphone',
  'BadgePercent',
  'ClipboardList',
  'BarChart3',
  'Grid3x3',
  'Lightbulb',
  'Scale',
  'TrendingUp',
  'Bot',
  'Store',
  'Receipt',
  'Package',
  'QrCode',
  'UsersRound',
  'MessageSquareQuote',
  'Workflow',
  'Reply',
  'Zap',
  'BellRing',
  'Radar',
  'HeartPulse',
  'PieChart',
  'Swords',
  'Coins',
  'Box',
  'CalendarDays',
  'MapPin',
  'Brain',
  'Wand2',
  'Eye',
  'ShieldCheck',
  'ScrollText',
  'Lock',
  'ServerCog',
  'ToggleLeft',
  'Plug',
  'Layers',
  'Activity',
  'Timer',
  'Palette',
  'Search',
  'FileText',
  'Navigation',
  'Mail',
  'GitBranch',
  'Building2',
  'Rocket',
  'Flag',
] as const;
export type NavIconName = (typeof NAV_ICON_NAMES)[number];

export interface NavRoute {
  /** Kalıcı kimlik — DB'deki sıra/grup özelleştirmesi bunu tutar. */
  id: string;
  role: NavRole;
  /** Uygulama yolu. Dinamik bölüm `[param]` biçiminde (ör. `/customer/places/[dealerId]`). */
  href: string;
  label: Bilingual;
  /** Eski `sidebarNav.<rol>.<anahtar>` i18n anahtarı (yalnız bilgi; etiket `label`'dan gelir). */
  labelKey?: string;
  description?: Bilingual;
  icon: NavIconName;
  /** Sidebar bölümü (rolün `NAV_GROUPS` kimliği). */
  group?: string;
  /** Üst rota kimliği (secondary / child için). */
  parent?: string;
  /** Birleştirilmiş sayfalarda `?tab=` değeri. */
  tab?: string;
  status: NavStatus;
  /**
   * Menü görünürlük anahtarı (admin ayarlar → modüller ekranındaki anahtar). Yalnız
   * bayi/müşteri. Var olan DB değerleri bozulmasın diye eski katalog anahtarı korunur.
   * Verilmezse öğe gizlenemez (ör. Ayarlar: abonelik/ödeme her zaman erişilebilir).
   */
  menuKey?: string;
  /** `MODULE_CATALOG` anahtarı — modül kapalıysa menüden de düşer (API kapısıyla aynı anahtar). */
  moduleKey?: string;
  /** Yalnız ekip rolü (adminTeamRole) atanmış kullanıcılar görür. */
  teamOnly?: boolean;
  /** ⌘K araması için TR/EN eş anlamlılar (eski sayfa adları dahil). */
  keywords?: string[];
  /** Bu yüzeyin yerini aldığı eski URL'ler (301/308 kaynağı). */
  redirectFrom?: string[];
  /** Eski sidebar sıra/grup kimlikleri (`key ?? href`) — DB ayar göçü için. */
  legacyIds?: string[];
  /** Global arama hedefi olduğu varlık türü. */
  entity?: NavEntity;
  /** Sayaç rozeti. */
  badge?: NavBadgeKey;
  /** Mobil alt sekme çubuğundaki sırası (1-5). */
  bottomTab?: number;
  /** Alt sekme çubuğunun ortasındaki vurgulu eylem (TARA). */
  bottomFab?: boolean;
}

export interface NavGroupDef {
  id: string;
  role: NavRole;
  label: Bilingual;
  icon: NavIconName;
}

/** Klavye/eylem kısayolu (⌘K paletinde "Kısayollar" bölümü). */
export interface NavShortcut {
  id: string;
  role: NavRole;
  label: Bilingual;
  icon: NavIconName;
  /** Ya bir rota… */
  href?: string;
  /** …ya da istemcide kabuğun bildiği bir eylem. */
  action?: 'open-assistant' | 'toggle-theme';
  /** Gösterilecek tuş ipucu (ör. "⌘J"). */
  hint?: string;
  keywords?: string[];
}

// ───────────────────────────── Gruplar ─────────────────────────────

export const NAV_GROUPS: NavGroupDef[] = [
  // Bayi — 9 blok (§4.3): Bugün · Gelen Kutusu · Müşteriler · Pazarlama · Analitik · AI Asistan · İşletme · Otomasyon · Ayarlar
  { id: 'marketing', role: 'dealer', label: { tr: 'Pazarlama', en: 'Marketing' }, icon: 'Megaphone' },
  { id: 'analytics', role: 'dealer', label: { tr: 'Analitik', en: 'Analytics' }, icon: 'BarChart3' },
  { id: 'business', role: 'dealer', label: { tr: 'İşletme', en: 'Business' }, icon: 'Store' },
  { id: 'automation', role: 'dealer', label: { tr: 'Otomasyon', en: 'Automation' }, icon: 'Workflow' },
  // Admin — 10 alan (§4.3)
  { id: 'overview', role: 'admin', label: { tr: 'Genel Bakış', en: 'Overview' }, icon: 'LayoutDashboard' },
  { id: 'people', role: 'admin', label: { tr: 'Müşteriler ve Bayiler', en: 'Customers & dealers' }, icon: 'Users' },
  { id: 'economy', role: 'admin', label: { tr: 'Ekonomi ve Oyun', en: 'Economy & games' }, icon: 'Coins' },
  { id: 'campaigns', role: 'admin', label: { tr: 'Kampanyalar', en: 'Campaigns' }, icon: 'Megaphone' },
  { id: 'ai', role: 'admin', label: { tr: 'Yapay Zekâ', en: 'AI' }, icon: 'Brain' },
  { id: 'trust', role: 'admin', label: { tr: 'Güven ve Uyum', en: 'Trust & compliance' }, icon: 'ShieldCheck' },
  { id: 'platform', role: 'admin', label: { tr: 'Platform', en: 'Platform' }, icon: 'ServerCog' },
  { id: 'content', role: 'admin', label: { tr: 'İçerik ve Görünüm', en: 'Content & appearance' }, icon: 'Palette' },
  { id: 'team', role: 'admin', label: { tr: 'Ekip ve İletişim', en: 'Team & communication' }, icon: 'Mail' },
  { id: 'system', role: 'admin', label: { tr: 'Sistem', en: 'System' }, icon: 'Settings' },
];

// ───────────────────────────── Rotalar ─────────────────────────────

const CUSTOMER: NavRoute[] = [
  {
    id: 'customer.home',
    role: 'customer',
    href: '/customer',
    label: { tr: 'Ana Sayfa', en: 'Home' },
    labelKey: 'dashboard',
    icon: 'Home',
    status: 'primary',
    menuKey: 'dashboard',
    bottomTab: 1,
    legacyIds: ['dashboard', '/customer'],
    keywords: ['bakiye', 'seri', 'günlük hedef', 'çark', 'özet', 'dashboard', 'home'],
    redirectFrom: ['/customer/discover'],
  },
  {
    id: 'customer.places',
    role: 'customer',
    href: '/customer/places',
    label: { tr: 'Keşfet', en: 'Explore' },
    icon: 'Compass',
    status: 'primary',
    menuKey: 'nearby',
    moduleKey: 'discovery',
    bottomTab: 2,
    legacyIds: ['nearby', '/customer/nearby', 'category_leaderboard', 'campaigns', 'event_center'],
    keywords: [
      'yakınımda', 'mekan', 'mekân', 'harita', 'kaydettiklerim', 'favoriler', 'fırsatlar', 'kampanya',
      'etkinlik', 'happy hour', 'en iyiler', 'kategori liderliği', 'nearby', 'favorites', 'deals',
    ],
    redirectFrom: [
      '/customer/nearby',
      '/customer/favorites',
      '/customer/campaigns',
      '/customer/event',
      '/customer/category-leaderboard',
      '/customer/experiences',
    ],
  },
  {
    id: 'customer.places.detail',
    role: 'customer',
    href: '/customer/places/[dealerId]',
    label: { tr: 'Mekân detayı', en: 'Place details' },
    icon: 'MapPin',
    parent: 'customer.places',
    status: 'hidden',
    entity: 'dealer',
  },
  {
    id: 'customer.scan',
    role: 'customer',
    href: '/customer/scan',
    label: { tr: 'Tara', en: 'Scan' },
    icon: 'ScanLine',
    status: 'primary',
    bottomTab: 3,
    bottomFab: true,
    keywords: ['qr', 'kod okut', 'puan kazan', 'kart aktivasyonu', 'scan'],
  },
  {
    id: 'customer.games',
    role: 'customer',
    href: '/customer/games',
    label: { tr: 'Oyna', en: 'Play' },
    labelKey: 'games_hub',
    icon: 'Gamepad2',
    status: 'primary',
    menuKey: 'games_hub',
    bottomTab: 4,
    legacyIds: ['games_hub', '/customer/games'],
    keywords: ['oyunlar', 'mini oyun', 'turnuva', 'games'],
  },
  {
    id: 'customer.games.game',
    role: 'customer',
    href: '/customer/games/[game]',
    label: { tr: 'Oyun', en: 'Game' },
    icon: 'Gamepad2',
    parent: 'customer.games',
    status: 'hidden',
  },
  {
    id: 'customer.quests',
    role: 'customer',
    href: '/customer/quests',
    label: { tr: 'Görevler', en: 'Quests' },
    labelKey: 'quests',
    icon: 'Target',
    parent: 'customer.games',
    status: 'secondary',
    menuKey: 'quests',
    moduleKey: 'quests',
    legacyIds: ['quests'],
    keywords: ['günlük görev', 'haftalık görev', 'quest'],
  },
  {
    id: 'customer.squads',
    role: 'customer',
    href: '/customer/squads',
    label: { tr: 'Klan', en: 'Squad' },
    labelKey: 'squads',
    icon: 'Users2',
    parent: 'customer.games',
    status: 'secondary',
    menuKey: 'squads',
    moduleKey: 'squads',
    legacyIds: ['squads'],
    keywords: ['takım', 'klan savaşı', 'squad'],
  },
  {
    id: 'customer.leaderboard',
    role: 'customer',
    href: '/customer/leaderboard',
    label: { tr: 'Lig', en: 'League' },
    labelKey: 'leaderboard',
    icon: 'Trophy',
    parent: 'customer.games',
    status: 'secondary',
    menuKey: 'leaderboard',
    legacyIds: ['leaderboard'],
    keywords: ['liderlik', 'sıralama', 'leaderboard'],
  },
  {
    id: 'customer.wallet',
    role: 'customer',
    href: '/customer/wallet',
    label: { tr: 'Cüzdan', en: 'Wallet' },
    icon: 'Wallet',
    status: 'primary',
    menuKey: 'wallet',
    bottomTab: 5,
    keywords: ['puan', 'bakiye', 'kart', 'wallet'],
  },
  {
    id: 'customer.wallet.card',
    role: 'customer',
    href: '/customer/wallet/card',
    label: { tr: 'Kartım', en: 'My card' },
    labelKey: 'my_card',
    icon: 'CreditCard',
    parent: 'customer.wallet',
    status: 'secondary',
    menuKey: 'my_card',
    legacyIds: ['my_card', '/customer/my-card'],
    keywords: ['statü', 'lounge', 'vip', 'kasada göster', 'card'],
    redirectFrom: ['/customer/my-card', '/customer/lounge'],
  },
  {
    id: 'customer.wallet.rewards',
    role: 'customer',
    href: '/customer/wallet/rewards',
    label: { tr: 'Ödüller', en: 'Rewards' },
    labelKey: 'rewards',
    icon: 'Gift',
    parent: 'customer.wallet',
    status: 'secondary',
    menuKey: 'rewards',
    moduleKey: 'rewards',
    legacyIds: ['rewards', 'shop'],
    keywords: ['mağaza', 'kozmetik', 'avatar', 'çerçeve', 'shop'],
    redirectFrom: ['/customer/rewards', '/customer/shop'],
  },
  {
    id: 'customer.wallet.owned',
    role: 'customer',
    href: '/customer/wallet/owned',
    label: { tr: 'Ödüllerim', en: 'My rewards' },
    icon: 'Ticket',
    parent: 'customer.wallet',
    status: 'secondary',
    menuKey: 'surprise_boxes',
    legacyIds: ['surprise_boxes'],
    keywords: ['kupon', 'kod', 'sürpriz kutu', 'telafi kuponu', 'pass', 'coupons'],
    redirectFrom: ['/customer/surprise-boxes'],
  },
  {
    id: 'customer.wallet.activity',
    role: 'customer',
    href: '/customer/wallet/activity',
    label: { tr: 'Hareketler', en: 'Activity' },
    labelKey: 'consumptions',
    icon: 'History',
    parent: 'customer.wallet',
    status: 'secondary',
    menuKey: 'consumptions',
    legacyIds: ['consumptions', 'spending_overview'],
    keywords: ['tüketimler', 'harcama özeti', 'puan geçmişi', 'defter', 'consumptions', 'spending'],
    redirectFrom: ['/customer/consumptions', '/customer/spending-overview'],
  },
  {
    id: 'customer.wallet.donate',
    role: 'customer',
    href: '/customer/wallet/donate',
    label: { tr: 'Bağış', en: 'Donate' },
    labelKey: 'donations',
    icon: 'Heart',
    parent: 'customer.wallet',
    status: 'secondary',
    menuKey: 'donations',
    moduleKey: 'donations',
    legacyIds: ['donations'],
    keywords: ['sosyal sorumluluk', 'bağışlar', 'donations'],
    redirectFrom: ['/customer/donations'],
  },
  {
    id: 'customer.me',
    role: 'customer',
    href: '/customer/me',
    label: { tr: 'Ben', en: 'Me' },
    icon: 'User',
    status: 'primary',
    menuKey: 'me',
    keywords: ['profil', 'hesabım', 'profile'],
  },
  {
    id: 'customer.me.progress',
    role: 'customer',
    href: '/customer/me/progress',
    label: { tr: 'İlerleme', en: 'Progress' },
    labelKey: 'progress_hub',
    icon: 'Gauge',
    parent: 'customer.me',
    status: 'secondary',
    menuKey: 'progress_hub',
    legacyIds: ['progress_hub', 'journey_score', 'analytics', 'trends'],
    keywords: ['seviye', 'xp', 'yolculuk skoru', 'kişisel analitik', 'trendler', 'progress'],
    redirectFrom: ['/customer/progress-hub', '/customer/journey-score', '/customer/trends', '/customer/analytics'],
  },
  {
    id: 'customer.me.badges',
    role: 'customer',
    href: '/customer/me/badges',
    label: { tr: 'Rozetler', en: 'Badges' },
    labelKey: 'badges',
    icon: 'Award',
    parent: 'customer.me',
    status: 'secondary',
    menuKey: 'badges',
    legacyIds: ['badges'],
    keywords: ['karakter rozeti', 'koleksiyon', 'badges'],
    redirectFrom: ['/customer/badges'],
  },
  {
    id: 'customer.me.year',
    role: 'customer',
    href: '/customer/me/year',
    label: { tr: 'Yılım', en: 'My year' },
    labelKey: 'my_year',
    icon: 'Sparkles',
    parent: 'customer.me',
    status: 'secondary',
    menuKey: 'my_year',
    legacyIds: ['my_year'],
    keywords: ['benim yılım', 'yıl özeti', 'wrapped'],
    redirectFrom: ['/customer/my-year'],
  },
  {
    id: 'customer.me.voices',
    role: 'customer',
    href: '/customer/me/voices',
    label: { tr: 'Seslerim', en: 'My voice' },
    labelKey: 'feedbacks',
    icon: 'MessageSquare',
    parent: 'customer.me',
    status: 'secondary',
    menuKey: 'feedbacks',
    legacyIds: ['feedbacks', 'remedy', 'ai_insights'],
    keywords: ['geri bildirimlerim', 'yorumlarım', 'telafi teklifleri', 'ai analiz', 'sesin', 'feedback'],
    redirectFrom: ['/customer/feedbacks', '/customer/remedy', '/customer/ai-insights'],
  },
  {
    id: 'customer.me.invite',
    role: 'customer',
    href: '/customer/me/invite',
    label: { tr: 'Davet', en: 'Invite' },
    labelKey: 'referral',
    icon: 'UserPlus',
    parent: 'customer.me',
    status: 'secondary',
    menuKey: 'referral',
    legacyIds: ['referral'],
    keywords: ['arkadaşını davet et', 'referans', 'referral'],
    redirectFrom: ['/customer/referral'],
  },
  {
    id: 'customer.me.settings',
    role: 'customer',
    href: '/customer/me/settings',
    label: { tr: 'Ayarlar', en: 'Settings' },
    labelKey: 'settings',
    icon: 'Settings',
    parent: 'customer.me',
    status: 'secondary',
    menuKey: 'settings',
    legacyIds: ['settings'],
    keywords: ['gizlilik', 'çerez', 'bildirim', 'dil', 'tema', 'hesap', 'kvkk', 'privacy'],
    redirectFrom: ['/customer/settings'],
  },
  {
    id: 'customer.team',
    role: 'customer',
    href: '/customer/ekip',
    label: { tr: 'Ekip', en: 'Team' },
    labelKey: 'team',
    icon: 'Users2',
    parent: 'customer.me',
    status: 'secondary',
    teamOnly: true,
    legacyIds: ['team'],
    keywords: ['ekip yönetimi', 'pano', 'görev', 'kanban', 'team'],
  },
  {
    id: 'customer.team.departments',
    role: 'customer',
    href: '/customer/ekip/departmanlar',
    label: { tr: 'Departmanlar', en: 'Departments' },
    icon: 'Building2',
    parent: 'customer.team',
    status: 'child',
    teamOnly: true,
  },
  // Derin linkler (bildirim, e-posta) — menüde yok; yüzey ajanları detay çekmecesine bağlar.
  {
    id: 'customer.consumption.detail',
    role: 'customer',
    href: '/customer/consumptions/[id]',
    label: { tr: 'Tüketim yorumu', en: 'Consumption review' },
    icon: 'Receipt',
    parent: 'customer.me.voices',
    status: 'hidden',
  },
  {
    id: 'customer.feedback.journey',
    role: 'customer',
    href: '/customer/feedbacks/[id]/journey',
    label: { tr: 'Geri bildirim yolculuğu', en: 'Feedback journey' },
    icon: 'MessageSquare',
    parent: 'customer.me.voices',
    status: 'hidden',
    entity: 'feedback',
  },
  {
    id: 'customer.remedy.offer',
    role: 'customer',
    href: '/customer/remedy/[offerId]',
    label: { tr: 'Telafi teklifi', en: 'Remedy offer' },
    icon: 'Gift',
    parent: 'customer.me.voices',
    status: 'hidden',
  },
];

const DEALER: NavRoute[] = [
  {
    id: 'dealer.today',
    role: 'dealer',
    href: '/dealer',
    label: { tr: 'Bugün', en: 'Today' },
    labelKey: 'dashboard',
    icon: 'LayoutDashboard',
    status: 'primary',
    menuKey: 'dashboard',
    legacyIds: ['dashboard', '/dealer', 'onboarding', 'copilot', 'operations_brief'],
    keywords: [
      'dashboard', 'copilot', 'operasyon özeti', 'haftalık rapor', 'kurulum', 'onboarding', 'yapılacaklar',
      'deneyim rehberi', 'today',
    ],
    redirectFrom: [
      '/dealer/copilot',
      '/dealer/operations-brief',
      '/dealer/weekly-brief',
      '/dealer/onboarding',
      '/dealer/experience-guide',
      '/dealer/discover',
    ],
  },
  {
    id: 'dealer.inbox',
    role: 'dealer',
    href: '/dealer/inbox',
    label: { tr: 'Gelen Kutusu', en: 'Inbox' },
    icon: 'Inbox',
    status: 'primary',
    menuKey: 'feedbacks',
    badge: 'dealerInbox',
    legacyIds: ['feedbacks', 'reviews'],
    keywords: ['geri bildirimler', 'yorumlar', 'tüketim yorumları', 'qr geri bildirim', 'feedback', 'reviews'],
    redirectFrom: ['/dealer/feedbacks', '/dealer/reviews'],
  },
  {
    id: 'dealer.inbox.remedy',
    role: 'dealer',
    href: '/dealer/inbox/remedy',
    label: { tr: 'Telafi onayı', en: 'Remedy approvals' },
    icon: 'ClipboardCheck',
    parent: 'dealer.inbox',
    status: 'secondary',
    menuKey: 'remedy_queue',
    moduleKey: 'remedy_offers',
    legacyIds: ['remedy_queue'],
    keywords: ['telafi merkezi', 'telafi kuyruğu', 'remedy'],
    redirectFrom: ['/dealer/remedy-queue'],
  },
  {
    id: 'dealer.inbox.incidents',
    role: 'dealer',
    href: '/dealer/inbox/incidents',
    label: { tr: 'Vakalar', en: 'Incidents' },
    icon: 'AlertTriangle',
    parent: 'dealer.inbox',
    status: 'secondary',
    menuKey: 'incidents',
    moduleKey: 'incidents',
    legacyIds: ['incidents'],
    keywords: ['olaylar', 'masa sinyali', 'incidents'],
    redirectFrom: ['/dealer/incidents'],
  },
  {
    id: 'dealer.inbox.assigned',
    role: 'dealer',
    href: '/dealer/inbox/assigned',
    label: { tr: 'Bana atananlar', en: 'Assigned to me' },
    icon: 'ListChecks',
    parent: 'dealer.inbox',
    status: 'secondary',
    menuKey: 'action_items',
    legacyIds: ['action_items'],
    keywords: ['aksiyonlar', 'aksiyon kalemleri', 'görevler', 'action items'],
    redirectFrom: ['/dealer/action-items'],
  },
  {
    id: 'dealer.customers',
    role: 'dealer',
    href: '/dealer/customers',
    label: { tr: 'Müşteriler', en: 'Customers' },
    labelKey: 'customers',
    icon: 'Users',
    status: 'primary',
    menuKey: 'customers',
    legacyIds: ['customers', 'churn_risk', 'radar', 'segment_actions'],
    keywords: ['risk', 'churn', 'kayıp riski', 'segmentler', 'segment aksiyon', 'geri kazanım', 'radar', 'müşteri 360'],
    redirectFrom: ['/dealer/churn-risk', '/dealer/radar', '/dealer/segment-actions'],
  },
  {
    id: 'dealer.campaigns',
    role: 'dealer',
    href: '/dealer/campaigns',
    label: { tr: 'Kampanyalar', en: 'Campaigns' },
    labelKey: 'campaigns',
    icon: 'Megaphone',
    group: 'marketing',
    status: 'primary',
    menuKey: 'campaigns',
    moduleKey: 'campaigns',
    legacyIds: ['campaigns'],
    keywords: ['segment önerileri', 'campaigns'],
  },
  {
    id: 'dealer.campaigns.performance',
    role: 'dealer',
    href: '/dealer/campaigns/[id]/performance',
    label: { tr: 'Kampanya performansı', en: 'Campaign performance' },
    icon: 'TrendingUp',
    parent: 'dealer.campaigns',
    status: 'hidden',
  },
  {
    id: 'dealer.offers',
    role: 'dealer',
    href: '/dealer/offers',
    label: { tr: 'Teklifler', en: 'Offers' },
    icon: 'BadgePercent',
    group: 'marketing',
    status: 'primary',
    menuKey: 'offers',
    keywords: ['flash teklif', 'happy hour', 'telafi şablonları', 'offers'],
  },
  {
    id: 'dealer.surveys',
    role: 'dealer',
    href: '/dealer/surveys',
    label: { tr: 'Anketler', en: 'Surveys' },
    labelKey: 'surveys',
    icon: 'ClipboardList',
    group: 'marketing',
    status: 'primary',
    menuKey: 'surveys',
    moduleKey: 'dealer_surveys',
    legacyIds: ['surveys'],
    keywords: ['anket', 'surveys'],
  },
  {
    id: 'dealer.surveys.create',
    role: 'dealer',
    href: '/dealer/surveys/create',
    label: { tr: 'Yeni anket', en: 'New survey' },
    icon: 'ClipboardList',
    parent: 'dealer.surveys',
    status: 'child',
    moduleKey: 'dealer_surveys',
    keywords: ['anket oluştur', 'create survey'],
  },
  {
    id: 'dealer.surveys.results',
    role: 'dealer',
    href: '/dealer/surveys/[id]/results',
    label: { tr: 'Anket sonuçları', en: 'Survey results' },
    icon: 'BarChart3',
    parent: 'dealer.surveys',
    status: 'hidden',
  },
  {
    id: 'dealer.analytics',
    role: 'dealer',
    href: '/dealer/analytics',
    label: { tr: 'Genel analitik', en: 'Analytics overview' },
    labelKey: 'analytics',
    icon: 'BarChart3',
    group: 'analytics',
    status: 'primary',
    menuKey: 'analytics',
    legacyIds: ['analytics', 'growth_hub'],
    keywords: ['büyüme merkezi', 'growth hub', 'analytics'],
    redirectFrom: ['/dealer/growth-hub'],
  },
  {
    id: 'dealer.analytics.heatmap',
    role: 'dealer',
    href: '/dealer/analytics/heatmap',
    label: { tr: 'Yoğunluk', en: 'Heatmap' },
    labelKey: 'heatmap',
    icon: 'Grid3x3',
    group: 'analytics',
    status: 'primary',
    menuKey: 'heatmap',
    moduleKey: 'heatmap',
    legacyIds: ['heatmap'],
    keywords: ['ısı haritası', 'saat', 'heatmap'],
    redirectFrom: ['/dealer/heatmap'],
  },
  {
    id: 'dealer.analytics.insights',
    role: 'dealer',
    href: '/dealer/analytics/insights',
    label: { tr: 'İçgörüler', en: 'Insights' },
    labelKey: 'ai_insights',
    icon: 'Lightbulb',
    group: 'analytics',
    status: 'primary',
    menuKey: 'ai_insights',
    moduleKey: 'ai_features',
    legacyIds: ['ai_insights'],
    keywords: ['ai içgörüler', 'ai insights'],
    redirectFrom: ['/dealer/ai-insights'],
  },
  {
    id: 'dealer.analytics.benchmark',
    role: 'dealer',
    href: '/dealer/analytics/benchmark',
    label: { tr: 'Kıyas', en: 'Benchmark' },
    labelKey: 'benchmark',
    icon: 'Scale',
    group: 'analytics',
    status: 'primary',
    menuKey: 'benchmark',
    moduleKey: 'benchmark',
    legacyIds: ['benchmark'],
    keywords: ['sektör kıyası', 'benchmark'],
    redirectFrom: ['/dealer/benchmark'],
  },
  {
    id: 'dealer.analytics.impact',
    role: 'dealer',
    href: '/dealer/analytics/impact',
    label: { tr: 'Etki', en: 'Impact' },
    icon: 'TrendingUp',
    group: 'analytics',
    status: 'primary',
    menuKey: 'roi',
    legacyIds: ['roi', 'business_outcomes'],
    keywords: ['roi', 'iş sonuçları', 'yatırım getirisi', 'business outcomes'],
    redirectFrom: ['/dealer/roi', '/dealer/business-outcomes'],
  },
  {
    id: 'dealer.assistant',
    role: 'dealer',
    href: '/dealer/assistant',
    label: { tr: 'AI Asistan', en: 'AI Assistant' },
    icon: 'Bot',
    status: 'primary',
    menuKey: 'ai_chat',
    moduleKey: 'ai_features',
    legacyIds: ['ai_chat'],
    keywords: ['ai sohbet', 'veriye sor', 'asistan', 'chat', 'ask analytics'],
    redirectFrom: ['/dealer/ai-chat', '/dealer/ask-analytics'],
  },
  {
    id: 'dealer.scan',
    role: 'dealer',
    href: '/dealer/scan',
    label: { tr: 'Kasa · Kart tara', en: 'Checkout · Scan card' },
    labelKey: 'scan_card',
    icon: 'ScanLine',
    group: 'business',
    status: 'primary',
    menuKey: 'scan',
    legacyIds: ['scan'],
    keywords: ['kasa', 'kart tara', 'qr okut', 'tüketim ekle', 'scan'],
  },
  {
    id: 'dealer.consumptions',
    role: 'dealer',
    href: '/dealer/consumptions',
    label: { tr: 'Tüketimler', en: 'Consumptions' },
    labelKey: 'consumptions',
    icon: 'Receipt',
    group: 'business',
    status: 'primary',
    menuKey: 'consumptions',
    legacyIds: ['consumptions'],
    keywords: ['tüketim kayıtları', 'consumptions'],
  },
  {
    id: 'dealer.products',
    role: 'dealer',
    href: '/dealer/products',
    label: { tr: 'Ürünler', en: 'Products' },
    labelKey: 'products',
    icon: 'Package',
    group: 'business',
    status: 'primary',
    menuKey: 'products',
    legacyIds: ['products'],
    keywords: ['menü', 'ürünlerim', 'products'],
    entity: 'product',
  },
  {
    id: 'dealer.qr',
    role: 'dealer',
    href: '/dealer/qr-codes',
    label: { tr: 'QR kodlar ve şubeler', en: 'QR codes & branches' },
    labelKey: 'qr_codes',
    icon: 'QrCode',
    group: 'business',
    status: 'primary',
    menuKey: 'qr_codes',
    legacyIds: ['qr_codes'],
    keywords: ['qr kod', 'şube', 'masa', 'qr codes'],
    entity: 'qr',
  },
  {
    id: 'dealer.team',
    role: 'dealer',
    href: '/dealer/team',
    label: { tr: 'Ekip', en: 'Team' },
    labelKey: 'team',
    icon: 'UsersRound',
    group: 'business',
    status: 'primary',
    menuKey: 'team',
    moduleKey: 'staff_management',
    legacyIds: ['team'],
    keywords: ['personel', 'vardiya', 'saha akışı', 'checklist', 'staff'],
  },
  {
    id: 'dealer.voc',
    role: 'dealer',
    href: '/dealer/voc-wall',
    label: { tr: 'VoC duvarı', en: 'VoC wall' },
    labelKey: 'voc_wall',
    icon: 'MessageSquareQuote',
    group: 'business',
    status: 'primary',
    menuKey: 'voc_wall',
    moduleKey: 'voc_wall',
    legacyIds: ['voc_wall'],
    keywords: ['müşteri sesi', 'mağaza ekranı', 'voc'],
  },
  {
    id: 'dealer.automation.replies',
    role: 'dealer',
    href: '/dealer/automation/replies',
    label: { tr: 'Otomatik yanıtlar', en: 'Auto replies' },
    icon: 'Reply',
    group: 'automation',
    status: 'primary',
    menuKey: 'auto_replies',
    keywords: ['yanıt şablonu', 'auto replies'],
    redirectFrom: ['/dealer/settings/auto-replies'],
  },
  {
    id: 'dealer.automation.remedy',
    role: 'dealer',
    href: '/dealer/automation/remedy',
    label: { tr: 'Telafi otomasyonu', en: 'Remedy automation' },
    labelKey: 'remedy_automation',
    icon: 'Zap',
    group: 'automation',
    status: 'primary',
    menuKey: 'remedy_automation',
    moduleKey: 'remedy_offers',
    legacyIds: ['remedy_automation'],
    keywords: ['telafi şablonları', 'remedy automation'],
    redirectFrom: ['/dealer/remedy-automation', '/dealer/remedy-automation/templates'],
  },
  {
    id: 'dealer.automation.alerts',
    role: 'dealer',
    href: '/dealer/automation/alerts',
    label: { tr: 'Uyarı kuralları', en: 'Alert rules' },
    icon: 'BellRing',
    group: 'automation',
    status: 'primary',
    menuKey: 'alerts',
    keywords: ['eşik', 'uyarı', 'vaka eşiği', 'alerts'],
  },
  {
    id: 'dealer.settings',
    role: 'dealer',
    href: '/dealer/settings',
    label: { tr: 'Ayarlar', en: 'Settings' },
    labelKey: 'settings',
    icon: 'Settings',
    status: 'primary',
    // menuKey YOK: abonelik/ödeme ve hesap güvenliği her zaman erişilebilir olmalı.
    legacyIds: ['settings', 'ai_settings', 'billing'],
    keywords: ['işletme', 'hesabım', 'bildirimler', 'güvenlik', 'ai ayarları', 'abonelik', 'fatura', 'ödeme', 'billing'],
    redirectFrom: ['/dealer/ai-settings', '/dealer/billing'],
  },
  // §6.2 "PARÇALA": içerik Teklifler/Kampanyalar/Gelen Kutusu/Bugün'e dağıtılana dek URL'den erişilir.
  {
    id: 'dealer.innovation',
    role: 'dealer',
    href: '/dealer/innovation',
    label: { tr: 'İnovasyon', en: 'Innovation' },
    labelKey: 'innovation_hub',
    icon: 'Lightbulb',
    status: 'hidden',
    legacyIds: ['innovation_hub'],
  },
];

const STAFF: NavRoute[] = [
  {
    id: 'staff.today',
    role: 'staff',
    href: '/staff',
    label: { tr: 'Bugün', en: 'Today' },
    icon: 'LayoutDashboard',
    status: 'primary',
    keywords: ['vardiya', 'görevler', 'checklist', 'izin', 'eğitim'],
  },
  {
    id: 'staff.field',
    role: 'staff',
    href: '/staff/field',
    label: { tr: 'Saha bildirimi', en: 'Field report' },
    icon: 'Flag',
    status: 'primary',
    keywords: ['saha', 'bildirim', 'field'],
  },
];

const ADMIN: NavRoute[] = [
  // 1) Genel Bakış
  {
    id: 'admin.command',
    role: 'admin',
    href: '/admin',
    label: { tr: 'Komuta Merkezi', en: 'Command center' },
    labelKey: 'dashboard',
    icon: 'LayoutDashboard',
    group: 'overview',
    status: 'primary',
    legacyIds: ['dashboard', 'ecosystem', 'platform_pulse', '/admin'],
    keywords: ['dashboard', 'platform nabzı', 'ekosistem', 'deneyim nabzı'],
    redirectFrom: ['/admin/ecosystem', '/admin/platform-pulse', '/admin/experience-pulse'],
  },
  {
    id: 'admin.analytics',
    role: 'admin',
    href: '/admin/analytics',
    label: { tr: 'Analitik', en: 'Analytics' },
    labelKey: 'analytics',
    icon: 'BarChart3',
    group: 'overview',
    status: 'primary',
    legacyIds: ['/admin/analytics'],
    keywords: ['sektör kırılımı', 'global benchmark', 'içgörüler', 'insights'],
    redirectFrom: ['/admin/insights'],
  },
  // 2) Müşteriler ve Bayiler
  {
    id: 'admin.users',
    role: 'admin',
    href: '/admin/users',
    label: { tr: 'Kullanıcılar', en: 'Users' },
    labelKey: 'users',
    icon: 'Users',
    group: 'people',
    status: 'primary',
    entity: 'user',
    keywords: ['müşteri', 'bayi', 'kullanıcı 360', 'users'],
  },
  {
    id: 'admin.users.detail',
    role: 'admin',
    href: '/admin/users/[id]',
    label: { tr: 'Kullanıcı 360', en: 'User 360' },
    icon: 'User',
    parent: 'admin.users',
    status: 'hidden',
    entity: 'user',
  },
  {
    id: 'admin.dealers-health',
    role: 'admin',
    href: '/admin/dealers-health',
    label: { tr: 'Bayi Sağlığı', en: 'Dealer health' },
    labelKey: 'dealers_health',
    icon: 'HeartPulse',
    group: 'people',
    status: 'primary',
    legacyIds: ['/admin/playbooks'],
    keywords: ['playbook', 'churn', 'sağlık skoru'],
    redirectFrom: ['/admin/playbooks'],
  },
  {
    id: 'admin.segments',
    role: 'admin',
    href: '/admin/segments',
    label: { tr: 'Segmentler', en: 'Segments' },
    labelKey: 'segments',
    icon: 'PieChart',
    group: 'people',
    status: 'primary',
    keywords: ['segment önerileri', 'onay kuyruğu'],
    redirectFrom: ['/admin/innovation/segment-proposals'],
  },
  {
    id: 'admin.squads',
    role: 'admin',
    href: '/admin/squads',
    label: { tr: 'Klanlar', en: 'Squads' },
    labelKey: 'squads',
    icon: 'Swords',
    group: 'people',
    status: 'primary',
    keywords: ['klan savaşları', 'battles'],
    redirectFrom: ['/admin/squads/battles'],
  },
  {
    id: 'admin.cards',
    role: 'admin',
    href: '/admin/cards',
    label: { tr: 'Kartlar', en: 'Cards' },
    labelKey: 'cards',
    icon: 'CreditCard',
    group: 'people',
    status: 'primary',
    entity: 'card',
    keywords: ['kart token', 'fiziksel kart'],
  },
  {
    id: 'admin.feedbacks',
    role: 'admin',
    href: '/admin/feedbacks',
    label: { tr: 'Geri Bildirimler', en: 'Feedback' },
    labelKey: 'feedbacks',
    icon: 'MessageSquare',
    group: 'people',
    status: 'primary',
    entity: 'feedback',
    keywords: ['yorumlar', 'feedbacks'],
  },
  {
    id: 'admin.referrals',
    role: 'admin',
    href: '/admin/referrals',
    label: { tr: 'Davet Programı', en: 'Referral program' },
    labelKey: 'referrals',
    icon: 'UserPlus',
    group: 'people',
    status: 'primary',
    keywords: ['referans', 'davet kademesi', 'referrals'],
  },
  // 3) Ekonomi ve Oyun
  {
    id: 'admin.economy',
    role: 'admin',
    href: '/admin/economy',
    label: { tr: 'Ekonomi Stüdyosu', en: 'Economy studio' },
    icon: 'Coins',
    group: 'economy',
    status: 'primary',
    keywords: ['puan matrisi', 'çarpan', 'tavan', 'ligler', 'simülasyon', 'oyunlaştırma ayarları', 'economy'],
    redirectFrom: ['/admin/points-matrix', '/admin/gamification-settings', '/admin/economy-sim', '/admin/league-settings'],
  },
  {
    id: 'admin.quests',
    role: 'admin',
    href: '/admin/quests',
    label: { tr: 'Görevler', en: 'Quests' },
    labelKey: 'quests',
    icon: 'Target',
    group: 'economy',
    status: 'primary',
  },
  {
    id: 'admin.games',
    role: 'admin',
    href: '/admin/games',
    label: { tr: 'Oyunlar', en: 'Games' },
    labelKey: 'mini_games',
    icon: 'Gamepad2',
    group: 'economy',
    status: 'primary',
    keywords: ['mini oyunlar', 'turnuva'],
  },
  {
    id: 'admin.badges',
    role: 'admin',
    href: '/admin/badges',
    label: { tr: 'Rozetler', en: 'Badges' },
    labelKey: 'badges',
    icon: 'Award',
    group: 'economy',
    status: 'primary',
    keywords: ['karakter rozeti', 'eşikler', 'test lab'],
    redirectFrom: ['/admin/character-thresholds', '/admin/character-test'],
  },
  {
    id: 'admin.rewards',
    role: 'admin',
    href: '/admin/rewards',
    label: { tr: 'Mağaza ve Ödüller', en: 'Store & rewards' },
    labelKey: 'rewards',
    icon: 'Gift',
    group: 'economy',
    status: 'primary',
    keywords: ['avatar dükkanı', 'kozmetik', 'talepler', 'shop'],
    redirectFrom: ['/admin/shop'],
  },
  // 4) Kampanyalar
  {
    id: 'admin.campaigns-calendar',
    role: 'admin',
    href: '/admin/campaigns-calendar',
    label: { tr: 'Kampanya Takvimi', en: 'Campaign calendar' },
    icon: 'CalendarDays',
    group: 'campaigns',
    status: 'primary',
    keywords: ['sezonluk kampanya', 'konsept', 'takvim', 'seasonal'],
    redirectFrom: ['/admin/seasonal-campaigns', '/admin/seasonal-concepts'],
  },
  {
    id: 'admin.surprise-boxes',
    role: 'admin',
    href: '/admin/surprise-boxes',
    label: { tr: 'Sürpriz Kutular', en: 'Surprise boxes' },
    labelKey: 'surprise_send',
    icon: 'Box',
    group: 'campaigns',
    status: 'primary',
  },
  {
    id: 'admin.coupons',
    role: 'admin',
    href: '/admin/coupons',
    label: { tr: 'Kuponlar', en: 'Coupons' },
    labelKey: 'coupons',
    icon: 'Ticket',
    group: 'campaigns',
    status: 'primary',
  },
  {
    id: 'admin.discovery',
    role: 'admin',
    href: '/admin/discovery',
    label: { tr: 'Keşif ve Sponsorlu', en: 'Discovery & sponsored' },
    labelKey: 'discovery',
    icon: 'MapPin',
    group: 'campaigns',
    status: 'primary',
    keywords: ['sponsor', 'keşif'],
  },
  {
    id: 'admin.donations',
    role: 'admin',
    href: '/admin/donations',
    label: { tr: 'Bağışlar', en: 'Donations' },
    labelKey: 'donations',
    icon: 'Heart',
    group: 'campaigns',
    status: 'primary',
  },
  // 5) Yapay Zekâ
  {
    id: 'admin.ai',
    role: 'admin',
    href: '/admin/ai',
    label: { tr: 'AI Operasyon', en: 'AI operations' },
    labelKey: 'ai_control',
    icon: 'Brain',
    group: 'ai',
    status: 'primary',
    keywords: ['ai dashboard', 'ai detay', 'kullanım', 'bütçe'],
    redirectFrom: ['/admin/ai-dashboard', '/admin/ai-detailed'],
  },
  {
    id: 'admin.ai.quality',
    role: 'admin',
    href: '/admin/ai/quality',
    label: { tr: 'AI Kalite', en: 'AI quality' },
    labelKey: 'ai_quality',
    icon: 'Eye',
    group: 'ai',
    status: 'primary',
    keywords: ['qra sohbet kayıtları', 'chat logs'],
    redirectFrom: ['/admin/ai-quality', '/admin/qra-chat-logs'],
  },
  {
    id: 'admin.ai.studio',
    role: 'admin',
    href: '/admin/ai/studio',
    label: { tr: 'Prompt ve Model Stüdyosu', en: 'Prompt & model studio' },
    icon: 'Wand2',
    group: 'ai',
    status: 'primary',
    keywords: ['prompt', 'model', 'üslup', 'ai öğrenme', 'ai ayarları', 'tones'],
    redirectFrom: ['/admin/ai-learning', '/admin/ai-settings', '/admin/modules/ai-tones'],
  },
  {
    id: 'admin.agent-council',
    role: 'admin',
    href: '/admin/agent-council',
    label: { tr: 'Ajan Konseyi', en: 'Agent council' },
    labelKey: 'grok_council',
    icon: 'Bot',
    group: 'ai',
    status: 'primary',
    keywords: ['konsey geçmişi', 'ajanlar'],
    redirectFrom: ['/admin/agent-council/history', '/admin/agent-council/agents'],
  },
  // 6) Güven ve Uyum
  {
    id: 'admin.trust',
    role: 'admin',
    href: '/admin/trust',
    label: { tr: 'Güven Merkezi', en: 'Trust center' },
    labelKey: 'trust_command',
    icon: 'ShieldCheck',
    group: 'trust',
    status: 'primary',
    keywords: ['fraud', 'sahtekârlık', 'vaka kuyruğu', 'trust command'],
    redirectFrom: ['/admin/trust-command', '/admin/fraud-prevention'],
  },
  {
    id: 'admin.audit',
    role: 'admin',
    href: '/admin/audit',
    label: { tr: 'Denetim Günlüğü', en: 'Audit log' },
    labelKey: 'audit',
    icon: 'ScrollText',
    group: 'trust',
    status: 'primary',
    keywords: ['audit', 'geri alma'],
  },
  {
    id: 'admin.privacy',
    role: 'admin',
    href: '/admin/privacy',
    label: { tr: 'KVKK', en: 'Privacy (KVKK)' },
    labelKey: 'privacy_requests',
    icon: 'Lock',
    group: 'trust',
    status: 'primary',
    keywords: ['dsr', 'veri talepleri', 'envanter', 'saklama', 'uyum', '5651', 'compliance'],
    redirectFrom: ['/admin/privacy-requests', '/admin/compliance'],
  },
  // 7) Platform
  {
    id: 'admin.features',
    role: 'admin',
    href: '/admin/features',
    label: { tr: 'Özellik ve Deney', en: 'Features & experiments' },
    labelKey: 'features',
    icon: 'ToggleLeft',
    group: 'platform',
    status: 'primary',
    keywords: ['modüller', 'a/b test', 'feature flag', 'deney'],
    redirectFrom: ['/admin/modules', '/admin/ab-testing'],
  },
  {
    id: 'admin.integrations',
    role: 'admin',
    href: '/admin/integrations',
    label: { tr: 'Entegrasyonlar', en: 'Integrations' },
    icon: 'Plug',
    group: 'platform',
    status: 'primary',
    keywords: ['api anahtarları', 'webhook', 'partnerler', 'api kataloğu', 'teknoloji ekle'],
    redirectFrom: ['/admin/api-keys', '/admin/partners', '/admin/webhooks', '/admin/api-catalog', '/admin/tech/add'],
  },
  {
    id: 'admin.pricing',
    role: 'admin',
    href: '/admin/pricing',
    label: { tr: 'Fiyatlandırma', en: 'Pricing' },
    labelKey: 'pricing',
    icon: 'Layers',
    group: 'platform',
    status: 'primary',
    keywords: ['plan', 'abonelik'],
  },
  {
    id: 'admin.observability',
    role: 'admin',
    href: '/admin/observability',
    label: { tr: 'Gözlemlenebilirlik', en: 'Observability' },
    labelKey: 'observability',
    icon: 'Activity',
    group: 'platform',
    status: 'primary',
    keywords: ['sağlık', 'izleme', 'health'],
  },
  {
    id: 'admin.jobs',
    role: 'admin',
    href: '/admin/jobs',
    label: { tr: 'Arka Plan İşleri', en: 'Background jobs' },
    icon: 'Timer',
    group: 'platform',
    status: 'primary',
    keywords: ['cron', 'jobrun', 'zamanlanmış iş'],
  },
  // 8) İçerik ve Görünüm
  {
    id: 'admin.seo',
    role: 'admin',
    href: '/admin/seo',
    label: { tr: 'SEO', en: 'SEO' },
    labelKey: 'seo',
    icon: 'Search',
    group: 'content',
    status: 'primary',
  },
  {
    id: 'admin.pages',
    role: 'admin',
    href: '/admin/pages',
    label: { tr: 'Sayfalar', en: 'Pages' },
    labelKey: 'pages',
    icon: 'FileText',
    group: 'content',
    status: 'primary',
    keywords: ['cms', 'blog'],
  },
  {
    id: 'admin.design-system',
    role: 'admin',
    href: '/admin/design-system',
    label: { tr: 'Tasarım Sistemi', en: 'Design system' },
    icon: 'Palette',
    group: 'content',
    status: 'primary',
    keywords: ['temalar', 'tasarım dili', 'erişilebilirlik', 'token', 'themes'],
    redirectFrom: ['/admin/themes', '/admin/design-language', '/admin/accessibility'],
  },
  {
    id: 'admin.navigation',
    role: 'admin',
    href: '/admin/navigation',
    label: { tr: 'Navigasyon Stüdyosu', en: 'Navigation studio' },
    icon: 'Navigation',
    group: 'content',
    status: 'primary',
    keywords: ['menü sırası', 'menü grupları', 'görünürlük', 'sidebar'],
    redirectFrom: ['/admin/menu-groups', '/admin/sidebar-order'],
  },
  // 9) Ekip ve İletişim
  {
    id: 'admin.team',
    role: 'admin',
    href: '/admin/ekip',
    label: { tr: 'Ekip', en: 'Team' },
    labelKey: 'team',
    icon: 'Users2',
    group: 'team',
    status: 'primary',
    legacyIds: ['team'],
    keywords: ['pano', 'kanban', 'görevler', 'ekip yönetimi'],
  },
  {
    id: 'admin.team.departments',
    role: 'admin',
    href: '/admin/ekip/departmanlar',
    label: { tr: 'Departmanlar', en: 'Departments' },
    icon: 'Building2',
    parent: 'admin.team',
    status: 'secondary',
  },
  {
    id: 'admin.roadmap',
    role: 'admin',
    href: '/admin/roadmap',
    label: { tr: 'Girişimler', en: 'Initiatives' },
    labelKey: 'roadmap',
    icon: 'GitBranch',
    parent: 'admin.team',
    status: 'secondary',
    legacyIds: ['roadmap'],
    keywords: ['yol haritası', 'roadmap'],
  },
  {
    id: 'admin.inbox',
    role: 'admin',
    href: '/admin/inbox',
    label: { tr: 'Gelen Kutusu', en: 'Inbox' },
    labelKey: 'inbox',
    icon: 'Inbox',
    group: 'team',
    status: 'primary',
    keywords: ['e-posta', 'mail', 'imap'],
  },
  {
    id: 'admin.intern-emails',
    role: 'admin',
    href: '/admin/intern-emails',
    label: { tr: 'Stajyer Mailleri', en: 'Intern emails' },
    labelKey: 'intern_emails',
    icon: 'Mail',
    group: 'team',
    status: 'primary',
    keywords: ['stajyer', 'görev maili'],
  },
  // 10) Sistem
  {
    id: 'admin.settings',
    role: 'admin',
    href: '/admin/settings',
    label: { tr: 'Ayarlar', en: 'Settings' },
    labelKey: 'settings',
    icon: 'Settings',
    group: 'system',
    status: 'primary',
    legacyIds: ['settings'],
    keywords: ['genel', 'kimlik', 'güvenlik', 'bakım', 'görünürlük'],
  },
  {
    // Kapı ekranı: menüdeki kamuflajlı etiket ve ikon KORUNUR (proje kuralı). Arama
    // anahtar kelimesi bilerek verilmez.
    id: 'admin.gate-settings',
    role: 'admin',
    href: '/admin/gate-settings',
    label: { tr: 'Gizli Kapı', en: 'Secret Gate' },
    labelKey: 'gate_settings',
    icon: 'Rocket',
    group: 'system',
    status: 'primary',
  },
  // §6.3: içerik Bayi Sağlığı/Segmentler/Özellik'e dağıtılana dek URL'den erişilir.
  {
    id: 'admin.innovation',
    role: 'admin',
    href: '/admin/innovation',
    label: { tr: 'İnovasyon', en: 'Innovation' },
    labelKey: 'innovation_platform',
    icon: 'Radar',
    status: 'hidden',
  },
];

export const NAV_ROUTES: readonly NavRoute[] = [...CUSTOMER, ...DEALER, ...STAFF, ...ADMIN];

// ───────────────────────────── Kısayollar ─────────────────────────────

export const NAV_SHORTCUTS: NavShortcut[] = [
  { id: 'sc.customer.scan', role: 'customer', label: { tr: 'QR okut, puan kazan', en: 'Scan a QR, earn points' }, icon: 'ScanLine', href: '/customer/scan', keywords: ['tara', 'qr'] },
  { id: 'sc.customer.card', role: 'customer', label: { tr: 'Kartımı kasada göster', en: 'Show my card at checkout' }, icon: 'CreditCard', href: '/customer/wallet/card', keywords: ['kart', 'kasa'] },
  { id: 'sc.dealer.scan', role: 'dealer', label: { tr: 'Kart tara', en: 'Scan a card' }, icon: 'ScanLine', href: '/dealer/scan', keywords: ['kasa', 'tara'] },
  { id: 'sc.dealer.survey', role: 'dealer', label: { tr: 'Yeni anket oluştur', en: 'Create a survey' }, icon: 'ClipboardList', href: '/dealer/surveys/create', keywords: ['anket'] },
  { id: 'sc.dealer.assistant', role: 'dealer', label: { tr: 'AI asistanı aç', en: 'Open AI assistant' }, icon: 'Bot', action: 'open-assistant', hint: '⌘J', keywords: ['asistan', 'sor', 'ai'] },
  { id: 'sc.theme', role: 'customer', label: { tr: 'Açık/koyu temayı değiştir', en: 'Toggle light/dark theme' }, icon: 'Palette', action: 'toggle-theme', keywords: ['tema', 'karanlık', 'dark'] },
  { id: 'sc.theme.dealer', role: 'dealer', label: { tr: 'Açık/koyu temayı değiştir', en: 'Toggle light/dark theme' }, icon: 'Palette', action: 'toggle-theme', keywords: ['tema', 'karanlık', 'dark'] },
  { id: 'sc.theme.admin', role: 'admin', label: { tr: 'Açık/koyu temayı değiştir', en: 'Toggle light/dark theme' }, icon: 'Palette', action: 'toggle-theme', keywords: ['tema', 'karanlık', 'dark'] },
];

// ───────────────────────────── Yardımcılar ─────────────────────────────

/** Sidebar'ın üst düzeyinde gösterilebilen durumlar. */
export const MENU_STATUSES: ReadonlySet<NavStatus> = new Set(['primary', 'secondary']);
/** ⌘K paletinde aranabilen durumlar. */
export const PALETTE_STATUSES: ReadonlySet<NavStatus> = new Set(['primary', 'secondary', 'child']);

export function routesForRole(role: NavRole): NavRoute[] {
  return NAV_ROUTES.filter((r) => r.role === role);
}

export function groupsForRole(role: NavRole): NavGroupDef[] {
  return NAV_GROUPS.filter((g) => g.role === role);
}

export function shortcutsForRole(role: NavRole): NavShortcut[] {
  return NAV_SHORTCUTS.filter((s) => s.role === role);
}

export function getRoute(id: string): NavRoute | undefined {
  return NAV_ROUTES.find((r) => r.id === id);
}

/** Kayıttaki bir rotanın yolunu döndürür; kayıt dışı kimlik geliştirme hatasıdır. */
export function routeHref(id: string): string {
  const r = getRoute(id);
  if (!r) throw new Error(`[navigation] bilinmeyen rota kimliği: ${id}`);
  return r.href;
}

export function isDynamicHref(href: string): boolean {
  return href.includes('[');
}

/** `/customer/places/[dealerId]` → `/customer/places/abc` eşleşir. */
export function hrefPatternMatches(pattern: string, path: string): boolean {
  if (!isDynamicHref(pattern)) return pattern === path;
  const re = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => (/^\[\.\.\..+\]$/.test(seg) ? '.+' : /^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|\\]/g, '\\$&')))
        .join('/') +
      '$'
  );
  return re.test(path);
}

/**
 * DB'de saklanan bir menü kimliğini (yeni kimlik, eski `key`, eski `href` ya da
 * yönlendirilen eski URL) kayıt kimliğine çevirir. Çözülemezse `null`.
 */
export function resolveRouteId(role: NavRole, raw: string): string | null {
  if (!raw) return null;
  const list = routesForRole(role);
  const direct = list.find((r) => r.id === raw);
  if (direct) return direct.id;
  const legacy = list.find((r) => r.legacyIds?.includes(raw));
  if (legacy) return legacy.id;
  const byHref = list.find((r) => r.href === raw);
  if (byHref) return byHref.id;
  const byRedirect = list.find((r) => r.redirectFrom?.includes(raw));
  if (byRedirect) return byRedirect.id;
  return null;
}

/** Aktif rota: tam eşleşme ya da en uzun önek (B12.1 — iki öğenin birden aktif görünmesi biter). */
export function matchActiveHref(pathname: string, hrefs: readonly string[], rootHref?: string): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (isDynamicHref(href)) continue;
    const exact = pathname === href;
    const prefix = href !== rootHref && pathname.startsWith(href.endsWith('/') ? href : `${href}/`);
    if (exact || prefix) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}

/** `{ source, destination }` listesi — `redirects.json` ile bire bir aynı olmalı (test). */
export function deriveRedirects(): { source: string; destination: string }[] {
  const out: { source: string; destination: string }[] = [];
  for (const r of NAV_ROUTES) {
    for (const source of r.redirectFrom ?? []) {
      out.push({ source, destination: r.tab ? `${r.href}?tab=${r.tab}` : r.href });
    }
  }
  return out.sort((a, b) => a.source.localeCompare(b.source));
}
