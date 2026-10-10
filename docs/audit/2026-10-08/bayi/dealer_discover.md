# /dealer/discover

**Amaç:** Bayi panelindeki modüllere (müşteri sesi, büyüme, operasyon) gruplanmış, statik bir kısayol/modül haritası sunmak. Veri çekmez, API çağırmaz; yalnızca 22 iç bağlantı listeler.
**Genel puan:** 4.5/10
**Karar:** **birleştir** (Büyüme Merkezi `/dealer/growth-hub` ve yetim `/dealer/experience-guide` ile birlikte, `dealerNavItems` tek kaynağından türetilen bir "Tüm modüller / Komut paleti" deneyimine dönüştürülmeli; mevcut haliyle elle yazılmış üçüncü bir menü kopyası.)

İncelenen dosyalar: `app/dealer/discover/page.tsx` (119 satır), `app/dealer/discover/layout.tsx`, `app/dealer/layout.tsx`, `components/layout/dashboard-page-hero.tsx` → `components/admin/admin-premium-hero.tsx`, `components/ui/card.tsx`, `components/dashboard/sidebar.tsx`, `lib/visibility-controls.ts`, `lib/module-gate.ts`, `proxy.ts`, `messages/tr.json`, `messages/en.json`, `app/dealer/growth-hub/page.tsx`, `app/dealer/experience-guide/page.tsx`, `app/dealer/dealer-dashboard-client.tsx`, `app/api/search/route.ts`.

**API / Prisma:** Sayfa hiçbir `fetch`, SWR, server action veya Prisma modeli kullanmıyor (`page.tsx:1-119`). Tek sunucu tarafı iş, `layout.tsx:3-5` içindeki `segmentLayoutMetadata` ile metadata üretimi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | 22 bağlantının hepsi var olan sayfalara gidiyor, ama admin tarafından kapatılmış modülleri filtrelemiyor ve 14 bayi modülünü hiç kapsamıyor. |
| UX | 4/10 | "Keşfet" adı keşif vaat ediyor ama yalnızca açıklamasız etiket listesi veriyor; gruplama kenar menüsüyle çelişiyor ve sayfanın kendisi menüden erişilemiyor. |
| Görsel | 5/10 | Ortak `DashboardPageHero` ile tutarlı, fakat gövde ikonsuz, düz metin listesi; görsel hiyerarşi ve tarama kolaylığı zayıf (aynı ailedeki Büyüme Merkezi ikon+açıklama kullanıyor). |
| Mimari | 3/10 | Navigasyonun üçüncü, elle bakımı yapılan kopyası (`sidebar.tsx`, `visibility-controls.ts` ve burası); şimdiden kaymış, ölü tip üyeleri var. |
| Performans | 7/10 | Veri yok, hafif; ancak 22 `Link` varsayılan prefetch ile çalışıyor (panelin geri kalanı bilinçli olarak `prefetch={false}` kullanıyor) ve sayfa gereksiz yere `'use client'`. |
| Erişilebilirlik + mobil | 6/10 | Global `:focus-visible` halkası var; ama başlık hiyerarşisi h1→h3 atlıyor, listeler `<nav>/<ul>` semantiği taşımıyor, mobilde 22 satırlık tek sütun ve ~40px dokunma hedefi. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero (eyebrow, başlık, alt metin, pusula ikonu, `tone="auto"`) | ÇALIŞIYOR | `page.tsx:84-90`; `admin-premium-hero.tsx:160-227` | Azaltılmış hareket desteği hero içinde var (`useReducedMotion`, `admin-premium-hero.tsx:35,73,162`). |
| 2 | Sayfa metadata'sı (başlık/açıklama, TR/EN) | ÇALIŞIYOR | `layout.tsx:3-5`; `tr.json:21-22`, `en.json:21-22` | |
| 3 | Rol koruması (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-76` | Statik sayfa; veri sızıntısı riski yok. |
| 4 | Kart: "Müşteri sesi" (başlık + açıklama) | ÇALIŞIYOR | `page.tsx:37-48, 94-98`; `tr.json:2670-2671` | |
| 5 | Bağlantı: Geri Bildirimler → `/dealer/feedbacks` | ÇALIŞIYOR | `page.tsx:41` | Hedef sayfa mevcut. |
| 6 | Bağlantı: Yorumlar → `/dealer/reviews` | ÇALIŞIYOR | `page.tsx:42` | |
| 7 | Bağlantı: Telafi merkezi → `/dealer/remedy-queue` | ÇALIŞIYOR | `page.tsx:43` | Modül kapalıysa bile gösteriliyor (bkz. B2). |
| 8 | Bağlantı: VoC Wall → `/dealer/voc-wall` | ÇALIŞIYOR | `page.tsx:44` | Kenar menüsünde "Sistem" grubunda (`sidebar.tsx:263`). |
| 9 | Bağlantı: Isı Haritası → `/dealer/heatmap` | ÇALIŞIYOR | `page.tsx:45` | |
| 10 | Bağlantı: Müşteri Radarı → `/dealer/radar` | ÇALIŞIYOR | `page.tsx:46` | |
| 11 | Kart: "Büyüme" | ÇALIŞIYOR | `page.tsx:49-61`; `tr.json:2672-2673` | Açıklama "anket" diyor; kenar menüsü anketi "Geri bildirimlerim" altına koyuyor. |
| 12 | Bağlantı: Büyüme merkezi → `/dealer/growth-hub` | ÇALIŞIYOR | `page.tsx:53` | Hub'dan hub'a bağlantı; Büyüme Merkezi de buraya geri bağlanıyor (`growth-hub/page.tsx:78`), döngü. |
| 13 | Bağlantı: Kampanyalar → `/dealer/campaigns` | ÇALIŞIYOR | `page.tsx:54` | |
| 14 | Bağlantı: Anketler → `/dealer/surveys` | ÇALIŞIYOR | `page.tsx:55` | `dealer_surveys` modülü kapalıyken de görünür. |
| 15 | Bağlantı: Churn Risk → `/dealer/churn-risk` | ÇALIŞIYOR | `page.tsx:56` | TR arayüzde İngilizce etiket. |
| 16 | Bağlantı: ROI → `/dealer/roi` | ÇALIŞIYOR | `page.tsx:57` | |
| 17 | Bağlantı: Benchmark → `/dealer/benchmark` | ÇALIŞIYOR | `page.tsx:58` | TR arayüzde İngilizce etiket. |
| 18 | Bağlantı: İş Sonuçları → `/dealer/business-outcomes` | ÇALIŞIYOR | `page.tsx:59` | |
| 19 | Kart: "Operasyon" | ÇALIŞIYOR | `page.tsx:62-76`; `tr.json:2674-2675` | 9 bağlantı ile en uzun kart; kart yükseklikleri dengesiz. |
| 20 | Bağlantı: Kart Tara → `/dealer/scan` | ÇALIŞIYOR | `page.tsx:66` | |
| 21 | Bağlantı: Ürünlerim → `/dealer/products` | ÇALIŞIYOR | `page.tsx:67` | |
| 22 | Bağlantı: QR Kodlar → `/dealer/qr-codes` | ÇALIŞIYOR | `page.tsx:68` | |
| 23 | Bağlantı: Tüketim kayıtları → `/dealer/consumptions` | ÇALIŞIYOR | `page.tsx:69` | Kenar menüsünde "Geri bildirimlerim" grubunda (`sidebar.tsx:257`). |
| 24 | Bağlantı: Olaylar → `/dealer/incidents` | ÇALIŞIYOR | `page.tsx:70` | |
| 25 | Bağlantı: Aksiyonlar → `/dealer/action-items` | ÇALIŞIYOR | `page.tsx:71` | Kenar menüsünden bilinçli olarak çıkarılmış (`sidebar.tsx:230-232`); bu sayfa tek giriş noktası. |
| 26 | Bağlantı: Analitik → `/dealer/analytics` | ÇALIŞIYOR | `page.tsx:72` | Kenar menüsünde "Analitik" grubunda (`sidebar.tsx:246`). |
| 27 | Bağlantı: Operasyon özeti → `/dealer/operations-brief` | ÇALIŞIYOR | `page.tsx:73` | Kenar menüsünden çıkarılmış; yalnız burada ve Büyüme Merkezi'nde. |
| 28 | Bağlantı: İnovasyon → `/dealer/innovation` | ÇALIŞIYOR | `page.tsx:74` | `dealer_innovation` modülü kapalıyken de görünür. |
| 29 | Duyarlı ızgara (mobil 1 sütun, `lg` 3 sütun) | ÇALIŞIYOR | `page.tsx:92` | `md` kırılımı yok; tablette de tek sütun, uzun liste. |
| 30 | Çok dillilik (TR/EN) | KISMİ | `page.tsx:80,109`; `tr.json` `sidebarNav.dealer` | Tüm anahtarlar iki dilde mevcut; ancak TR'de "VoC Wall", "Churn Risk", "Benchmark", "ROI" İngilizce kalıyor. |
| 31 | Klavye odağı | ÇALIŞIYOR | `app/globals.css:131-133` | Global `:focus-visible` halkası bağlantılara uygulanıyor. |
| 32 | Yükleniyor / hata sınırları | ÇALIŞIYOR | `app/dealer/loading.tsx`, `app/dealer/error.tsx` | Sayfa statik; özel boş/hata durumu gerekmiyor. |
| 33 | Admin modül / menü / özellik görünürlüğüne uyum | BOZUK | Kenar menüsü filtreler (`sidebar.tsx:439-456`); bu sayfada filtre yok (`page.tsx:93-115`) | Admin'in kapattığı modüller (telafi, anket, inovasyon) burada görünür ve tıklanabilir. |
| 34 | Sayfanın kendi `discover` görünürlük anahtarı | BOZUK | `visibility-controls.ts:73`; `sidebar.tsx:233-271` (öğe yok) | Admin anahtarı kapatsa da açsa da bir şey değişmez: menüde öğe yok, sayfada kontrol yok. |
| 35 | Kenar menüsünden erişim | EKSİK | `sidebar.tsx:230-232` ("`discover` (Keşfet) … menüden çıkarıldı") | Gelen bağlantılar yalnız `growth-hub/page.tsx:78` ve yetim `experience-guide/page.tsx:18`. |
| 36 | Tüm bayi modüllerini kapsama | KISMİ | `page.tsx:36-77` ve `sidebar.tsx:233-271` karşılaştırması | 14 sayfa yok: AI Sohbet, Copilot, AI İçgörüler, AI Ayarları, Müşteriler, Personel, Segment Aksiyon, Telafi otomasyonu, Faturalama, Ayarlar, Kurulum, Deneyim rehberi, Haftalık özet, Veriye Sor. |
| 37 | Bağlantı başına açıklama ("bu modül ne işe yarar") | EKSİK | `page.tsx:109` yalnız etiket | Büyüme Merkezi aynı desende açıklama veriyor (`growth-hub/page.tsx:54-56`). |
| 38 | Bağlantı ikonları | EKSİK | `page.tsx:101-111` | Yalnız sağda ortak `ChevronRight`; kenar menüsündeki ikon dili yeniden kullanılmıyor. |
| 39 | Sayfa içi arama / filtre | EKSİK | `page.tsx` tamamı | Header araması sayfa/modül aramıyor, yalnız kullanıcı/geri bildirim/ürün/QR (`app/api/search/route.ts:31-34`). |
| 40 | Canlı sayaç / bekleyen iş rozeti | EKSİK | `page.tsx` tamamı | Kenar menüsü `/api/dealer/notification-badges` çekiyor (`sidebar.tsx:396-398`); burada kullanılmıyor. |
| 41 | Kişiselleştirme (son kullanılanlar, sabitleme, kurulum durumu) | EKSİK | `page.tsx` tamamı | |
| 42 | Bağlantı prefetch davranışı | KISMİ | `page.tsx:101-108` (prefetch belirtilmemiş) vs `sidebar.tsx:516,601`, `dealer-dashboard-client.tsx:382…` (`prefetch={false}`) | Üretimde görünür 22 bağlantı için otomatik prefetch, panelin genel tercihine aykırı. |

**Sayım:** 42 özellik · ÇALIŞIYOR 31 · KISMİ 3 · BOZUK 2 · SAHTE 0 · EKSİK 6

---

## Bulgular

### B1 — Yüksek · Mimari / Bilgi mimarisi · Navigasyonun elle yazılmış üçüncü kopyası, kenar menüsüyle çelişiyor
- **Kanıt:** `page.tsx:10-77` (sabit `SECTIONS` dizisi); `components/dashboard/sidebar.tsx:233-271` (`dealerNavItems`); `lib/visibility-controls.ts:43-76` (`DEALER_MENU_CATALOG`). `visibility-controls.ts:5-9` yeni menü öğesi için yalnızca katalog ve kenar menüsünü güncellemeyi söylüyor; bu sayfa o kontrol listesinde yok.
- **Sorun:** Üç ayrı kaynak var ve şimdiden kaymış durumda:
  - Gruplama çelişiyor: VoC Wall, Isı Haritası, Radar burada "Müşteri sesi" (`page.tsx:44-46`), menüde "Sistem" (`sidebar.tsx:263-265`). Analitik burada "Operasyon" (`page.tsx:72`), menüde "Analitik" (`sidebar.tsx:246`). Tüketimler burada "Operasyon" (`page.tsx:69`), menüde "Geri bildirimlerim" (`sidebar.tsx:257`). Anketler burada "Büyüme" (`page.tsx:55`), menüde "Geri bildirimlerim" (`sidebar.tsx:258`). Kampanyalar burada "Büyüme" (`page.tsx:54`), menüde "İşletme" (`sidebar.tsx:240`).
  - Kapsam eksik: 14 modül hiç yok (envanter #36).
  - Admin'in `/admin/sidebar-order` ve `/admin/menu-groups` ile yaptığı sıralama ve grup düzenlemeleri bu sayfaya hiç yansımıyor.
  Aynı modülü iki yerde iki farklı kategoride görmek, bayi sahibinde ürünün zihinsel modelini bozuyor. "Bu nerede?" sorusunun iki cevabı oluyor.
- **Profesyonel öneri:** Navigasyon tanımını tek bir paylaşılan modüle taşıyın (ör. `lib/nav/dealer-nav.ts`). Bu modül her öğe için `key, href, icon, groupKey, featureKey, moduleKey, descriptionKey, keywords[]` alanlarını taşısın. Kenar menüsü, Keşfet ve bir komut paleti bu tanımdan türesin. Grup override'ları `/api/settings/sidebar-groups` üzerinden aynı şekilde uygulanabilir. Keşfet'teki sabit `SECTIONS` dizisi kaldırılıp `groupBy(groupKey)` ile üretilmeli. Kayma riskine karşı `__tests__` altına "her `DEALER_MENU_CATALOG` anahtarı paylaşılan nav'da var" testi eklenmeli.
- **Efor:** M

### B2 — Yüksek · Yetki / Ürün yönetişimi · Admin'in kapattığı modüller Keşfet'te görünüyor ve çalışıyor
- **Kanıt:** Kenar menüsü her öğeyi `menuVisibility`, `featureVisibility` ve `moduleControls` ile filtreliyor (`sidebar.tsx:439-456`). Keşfet hiçbirini okumuyor (`page.tsx:93-115`). Etkilenen öğeler: Telafi merkezi `featureKey: 'remedy_offers'` (`sidebar.tsx:255`), Anketler `dealer_surveys` (`sidebar.tsx:258`), İnovasyon `dealer_innovation` (`sidebar.tsx:241`). Sunucu tarafında `assertModuleEnabled` / `assertMenuItemVisible` (`lib/module-gate.ts:92,132`) bayi API'lerinde yalnızca 5 rotada kullanılıyor: campaigns, campaigns/send, iki remedy, experience-pulse. `app/api/dealer/surveys`, `innovation`, `remedy-queue` ve `voc-wall` için kapı yok (grep ile doğrulandı).
- **Sorun:** Admin bir modülü platform genelinde kapattığında (ör. anketler pilotu durduruldu ya da telafi akışında bir sorun var) kenar menüsünden gizleniyor, ama Keşfet aynı modüle tıklanabilir bir giriş sunmaya devam ediyor. Sayfalar ve API'ler de çalışıyor. Bu, admin "kill switch"inin sessizce delinmesi demek. Kök neden sistem genelinde (doğrudan URL ile de erişilebiliyor), ama Keşfet bunu keşfedilebilir hale getiriyor.
- **Profesyonel öneri:** (1) Kısa vade: Keşfet aynı `/api/settings/visibility` verisini kullanıp kenar menüsüyle aynı filtre fonksiyonundan geçsin. Bu filtre, `sidebar.tsx:440-456` içindeki mantığın `lib/nav/is-nav-item-visible.ts` gibi saf bir yardımcıya çıkarılmış hali olmalı. (2) Doğru çözüm: sayfa seviyesinde bir `app/dealer/<modül>/layout.tsx` sunucu kapısı ve ilgili API rotalarında `assertModuleEnabled(moduleKey)`. Kapalı modüle gelen kullanıcı "Bu modül şu anda kullanılamıyor" boş durumunu görmeli.
- **Efor:** S (Keşfet filtresi) / M (sunucu tarafı kapılar)

### B3 — Orta · UX · "Keşfet" keşif sağlamıyor: açıklamasız, ikonsuz, jargonlu etiket listesi
- **Kanıt:** Her satır yalnız `t('sidebarNav.dealer.<key>')` etiketi ve bir ok gösteriyor (`page.tsx:109-110`). TR etiketleri: "VoC Wall", "Churn Risk", "Benchmark", "ROI" (`messages/tr.json` → `sidebarNav.dealer`). Aynı ailedeki Büyüme Merkezi ikon ve açıklama kullanıyor (`growth-hub/page.tsx:44-56`).
- **Sorun:** Bir kafe sahibi "VoC Wall", "Radar" veya "Benchmark"ın ne işe yaradığını etiketten anlayamaz. Sayfa, kenar menüsünün daha az bilgi içeren bir kopyası. Keşif sayfasının değeri "bu araç bana ne kazandırır, ne zaman kullanırım" sorusunu yanıtlamaktan geliyor; Square App Marketplace ve Google Business Profile'daki modül kartları bunu yapıyor.
- **Profesyonel öneri:** Her modül için `dealerModules.<key>.{title, oneLiner, whenToUse}` i18n anahtarları tanımlayın. TR terimlerini yerelleştirin ("Müşteri Sesi Duvarı", "Kayıp Riski", "Sektör Kıyası"; parantez içinde orijinal terim kalabilir). Kartı ikon, tek satır değer önerisi ve isteğe bağlı durum çipiyle ("Kurulmadı", "3 bekleyen", "Yeni") yeniden kurun.
- **Efor:** M

### B4 — Orta · Bilgi mimarisi · Sayfa yetim kalmış ve kenar menüsünden çıkarılan işlevlerin tek kapısı olmuş
- **Kanıt:** `sidebar.tsx:230-232`: "`discover` (Keşfet), `ask_analytics`, `action_items`, `operations_brief` menüden çıkarıldı". Gelen bağlantılar: `growth-hub/page.tsx:78` ve `experience-guide/page.tsx:18`. `experience-guide` sayfasına ise kod tabanında hiçbir gelen bağlantı yok (grep). Aksiyonlar (`page.tsx:71`) ve Operasyon özeti (`page.tsx:73`) yalnızca bu yetim sayfa (ve Büyüme Merkezi) üzerinden erişilebilir.
- **Sorun:** Menüden çıkarma kararı verilmiş, ama sayfalar silinmemiş; Keşfet onları gizli bir arka kapıdan sunmaya devam ediyor. Sonuçta ne tam görünürler ne tam kaldırılmışlar: kullanıcıların çoğu bulamıyor, bakım yükü sürüyor. Aksiyonlar sayfası ekip için görev akışı içeriyorsa, iki tık derinliğe gömülmesi operasyonel bir kayıp.
- **Profesyonel öneri:** Her "çıkarılmış" sayfa için ürün kararını netleştirin. Ya birleştirin (Aksiyonlar → Dashboard'daki "Bugün yapılacaklar" kartı ya da Geri Bildirimler'de bir sekme; Operasyon özeti → Haftalık özet) ya da yönlendirme (`redirect()`) ile kaldırın. Keşfet'i "gizli sayfa deposu" olmaktan çıkarın.
- **Efor:** M

### B5 — Orta · Çakışma · Büyüme bölümü `/dealer/growth-hub` ile neredeyse birebir aynı ve iki hub birbirine bağlanıyor
- **Kanıt:** `growth-hub/page.tsx:10-17`: business-outcomes, campaigns, roi, churn-risk, benchmark, analytics. `page.tsx:52-59`: growth-hub, campaigns, surveys, churn-risk, roi, benchmark, business-outcomes. Karşılıklı bağlantı: `page.tsx:53` ↔ `growth-hub/page.tsx:78`. Üçüncü hub: `experience-guide/page.tsx:16-21`.
- **Sorun:** Üç "hub" sayfası aynı hedeflere farklı kümeleme ve farklı görsel dille yönlendiriyor. Kullanıcı "hub → hub → hub" döngüsüne girebiliyor ve hiçbiri veri göstermiyor. Bu, menü ağırlığını azaltmak yerine gezinme derinliğini artırıyor.
- **Profesyonel öneri:** Tek bir "Modül haritası" sayfasında birleştirin ve Büyüme Merkezi'ni, adının vaat ettiği gibi veri taşıyan bir büyüme panosuna dönüştürün (kampanya dönüşümü, kayıp riski sayısı ve ROI özeti küçük KPI kartları olarak). Deneyim rehberini onboarding akışına (`/dealer/onboarding`) taşıyın.
- **Efor:** M

### B6 — Düşük · Performans · 22 bağlantı varsayılan prefetch ile; sayfa gereksiz yere istemci bileşeni
- **Kanıt:** `page.tsx:101-108` içinde `Link` için `prefetch` belirtilmemiş. Panelin geri kalanı bilinçli olarak `prefetch={false}` kullanıyor: `sidebar.tsx:516,601` ve `app/dealer` altında 14 kullanım (ör. `dealer-dashboard-client.tsx:382,390`). `page.tsx:1` `'use client'`, yalnızca `useAppT` için.
- **Sorun:** Üretimde görünür alana giren her bağlantı için otomatik RSC prefetch isteği gidiyor; mobil ağda bu 22 istek demek. Sayfa tamamen statik olduğu halde istemci paketi ve hidrasyon taşıyor.
- **Profesyonel öneri:** Ya `prefetch={false}` (panel geneliyle tutarlı) ya da yalnızca hover/odak anında prefetch kullanın. Sayfayı Server Component'e çevirin: `getServerLocale()` + `t()` (`i18n/request`) ile metinler sunucuda çözülsün. Görünürlük filtresi eklenirse sunucuda `getModuleControls()` (`lib/module-gate.ts:45`, Redis/unstable_cache'li) ile yapılsın.
- **Efor:** S

### B7 — Düşük · Mimari / Ölü kod · Kullanılmayan tip üyeleri ve etkisiz görünürlük anahtarı
- **Kanıt:** `page.tsx:33-34`: `DealerLabelKey` içinde `'experience_guide'` ve `'shift_pulse'` var ama `SECTIONS` içinde kullanılmıyor. `shift_pulse` için bir rota yok; yalnızca `dealer_shift_pulse` modül anahtarı `app/api/dealer/experience-pulse/route.ts:20` içinde geçiyor. `visibility-controls.ts:73`: `discover` menü anahtarı katalogda var, ama hiçbir yerde okunmuyor (envanter #34).
- **Sorun:** Admin panelinde "Keşfet" menü görünürlüğünü değiştirmek hiçbir etki yaratmıyor. Bu, admine yanlış bir kontrol hissi veriyor. Ölü tip üyeleri, yarım kalmış bir "Vardiya ritmi" özelliğine işaret ediyor (doğrulanmadı: sayfası hiç yazılmamış olabilir).
- **Profesyonel öneri:** Paylaşılan nav modülüne geçişte bu union'ı (B1) kaldırın. `discover` anahtarı için iki seçenek var: sayfada gerçekten uygulayın (kapalıysa `notFound()` / yönlendirme) ya da katalogdan çıkarın.
- **Efor:** S

### B8 — Düşük · Erişilebilirlik / Mobil · Başlık hiyerarşisi, liste semantiği ve dokunma hedefleri
- **Kanıt:** Hero `<h1>` (`admin-premium-hero.tsx:227`), kart başlığı `<h3>` (`components/ui/card.tsx:44`); arada `<h2>` yok. Bağlantılar düz `div` içinde (`page.tsx:99-112`); `<nav aria-label>` ya da `<ul>/<li>` yok. Satır yüksekliği `py-2.5` + `text-sm` ≈ 40px (`page.tsx:105`). Izgara `lg` altında tek sütun (`page.tsx:92`).
- **Sorun:** Ekran okuyucu kullanıcıları başlık atlaması görüyor ve "liste, 6 öğe" bilgisini alamıyor. Mobilde 22 satırlık, ikonsuz tek sütun uzun ve taranması zor; dokunma hedefi 44px önerisinin altında. Tablette (`md`) de tek sütun kalıyor.
- **Profesyonel öneri:** Her bölümü `<section aria-labelledby>` + `<h2>` + `<ul role="list">` olarak işaretleyin, satırları `min-h-11` yapın, `md:grid-cols-2` ekleyin. Mobilde bölümleri akordeon ya da yapışkan bölüm sekmeleriyle sunun ve en üste arama kutusu koyun.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Komut paleti / modül araması (⌘K):** Square Dashboard ve Toast'ta tüm araçlar ve ayarlar tek arama kutusundan açılıyor. Qratex header araması sayfa/modül aramıyor (`app/api/search/route.ts:31-34`). Keşfet'in asıl yerini bu almalı.
2. **Modül başına değer önerisi ve "ne zaman kullanılır" açıklaması:** Square App Marketplace ve Google Business Profile kartlarında her araç bir cümleyle anlatılıyor. Burada yok (B3).
3. **Kurulum ve aktivasyon durumu:** Google Business Profile'daki "Profilinizi tamamlayın" ilerlemesi ve Yelp for Business'taki eksik adımlar gibi, her modül için "Kurulmadı / Aktif / Veri bekleniyor" durumu ve önerilen bir sonraki adım.
4. **Canlı sayaçlar ve bekleyen işler:** Medallia ve Qualtrics ana gezinmede "yanıt bekleyen 7 geri bildirim" ya da "SLA'yı aşan 2 vaka" gösteriyor. Veri hazır, ama burada kullanılmıyor (`/api/dealer/notification-badges`, `sidebar.tsx:396-398`).
5. **Kişiselleştirme:** Son kullanılanlar, sabitlenmiş modüller ve role göre önerilen modüller (Toast'ta yönetici ve personel farklı başlangıç görür).
6. **Plan ve modül kilidi bilgisi:** Kapalı ya da üst planda olan modüller gizlenmek yerine kilitli ve "neden" açıklamalı gösterilmeli (Square ve Toast'taki upgrade kartları). Bayi plan kısıtlarının bu sayfaya bağlanması doğrulanmadı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Keşfet" ayrı bir statik sayfa olmaktan çıkıp iki katmanlı bir deneyime dönüşür:
1. **Her yerde ⌘K Komut Paleti** (header'daki arama kutusuna entegre): modül adı, eş anlamlı kelime ("kayıp" → Churn Risk, "telafi" → Telafi merkezi) ve son kullanılanlar. Görünürlük filtresi uygulanmış tek nav kaynağından beslenir.
2. **"Tüm modüller" sayfası** (bugünkü Keşfet'in yerine, Büyüme Merkezi ve Deneyim Rehberi ile birleşmiş): bayinin işletme yolculuğuna göre gruplanmış (Dinle → Çöz → Büyüt → Yönet) kart ızgarası. Bu gruplar kenar menüsüyle **aynı**, tek kaynaktan türetilir.

**Yerleşim:**
- Üstte kompakt hero ve arama/filtre kutusu, yanında "Sadece aktif olanlar" anahtarı.
- Hemen altında "Sizin için önerilen" şeridi: kurulmamış ama işletme tipine uygun 2–3 modül (ör. QR var ama kampanya yok → Kampanyalar).
- Bölümler: `<section>` + `<h2>`, `sm:grid-cols-2 xl:grid-cols-3` kart ızgarası. Her kartta ikon (kenar menüsüyle aynı), başlık, tek satır değer önerisi, durum çipi (Aktif / Kurulmadı / 3 bekleyen / Kilitli) ve birincil eylem ("Aç" ya da "Kur").
- Mobilde arama yapışkan üstte, bölümler yatay kaydırılabilir sekme çipleriyle; kartlar tam genişlikte, en az 44px dokunma hedefiyle.

**Motion / 3D:** Bu bir gezinme yüzeyi; 3D ya da ağır animasyon yersiz. Ölçülü `m as Motion` kullanımı yeterli:
- Kart ızgarasında ilk girişte 20–30ms aralıklı, 150ms süreli opacity/y-4px stagger.
- Filtre değişiminde `layout` animasyonu ile kartların yeniden dizilmesi.
- Durum çipindeki sayaç değişiminde tek seferlik hafif bir vurgu.
- `useReducedMotion()` açıksa tümü kapalı.
Hero'nun mevcut "breathe" animasyonu korunabilir; zaten reduced-motion'a uyuyor.

**Veri / API değişiklikleri:**
- `lib/nav/dealer-nav.ts`: tek kaynak (`key, href, icon, groupKey, featureKey, moduleKey, descriptionKey, keywords`). `sidebar.tsx`, `visibility-controls.ts` (katalog buradan türetilir), Keşfet ve komut paleti bunu kullanır.
- `lib/nav/is-nav-item-visible.ts`: `sidebar.tsx:440-456` içindeki filtre mantığının saf fonksiyon hali. Hem sunucuda (`getModuleControls`) hem istemcide kullanılır.
- `GET /api/dealer/module-status` (Redis'te 60 sn önbellekli): her modül için `{ configured: boolean, pendingCount?: number, lastUsedAt?: string }`. Örnekler: QR sayısı > 0, aktif kampanya var mı, `notification-badges` sayıları. Tek bir `Promise.all` içinde `count()` sorgularıyla, N+1 olmadan. Son kullanılanlar istemci tarafında `localStorage` ile tutulabilir.
- Sayfa Server Component olur; yalnızca arama/filtre ve durum çipleri küçük bir istemci adası olarak kalır.
- Kapalı modüller için sayfa seviyesinde sunucu kapısı ve API'lerde `assertModuleEnabled` (B2).

---

## Çakışmalar / birleştirme önerisi

| Sayfa | Çakışma | Öneri |
|---|---|---|
| `/dealer/growth-hub` | Büyüme bölümündeki 7 bağlantının 5'i aynı (`growth-hub/page.tsx:10-17` vs `page.tsx:52-59`); iki sayfa birbirine bağlanıyor. | Bağlantı listesini "Tüm modüller"e taşıyın; Büyüme Merkezi'ni KPI içeren gerçek bir büyüme panosuna dönüştürün ya da kaldırın. |
| `/dealer/experience-guide` | Üçüncü bir kısayol hub'ı (`experience-guide/page.tsx:16-21`); gelen bağlantısı yok (yetim). | Onboarding akışına (`/dealer/onboarding`) adım içeriği olarak taşıyın; rotayı yönlendirin. |
| Kenar menüsü (`components/dashboard/sidebar.tsx`) | Aynı modüllerin farklı gruplanmış kopyası (B1). | Tek nav kaynağı; Keşfet bu kaynağın "genişletilmiş görünümü" olsun. |
| `/dealer/action-items`, `/dealer/operations-brief` | Menüden çıkarılmış, yalnız Keşfet ve Büyüme Merkezi üzerinden erişilebilir (B4). | Ürün kararı: Dashboard / Geri Bildirimler / Haftalık özet içine birleştirin ya da yönlendirerek kaldırın. |

**Sonuç:** `/dealer/discover` kendi başına korunmaya değer bir sayfa değil. İçeriği tek nav kaynağından üretilen bir "Tüm modüller" görünümü ve ⌘K komut paleti ile **birleştirilmeli**. Büyüme Merkezi ve Deneyim Rehberi de aynı konsolidasyona dahil edilmeli.

---

## Doğrulama (şüpheci inceleme)

### 1. "Keşfet, admin modül kill-switch'ini atlıyor: kapatılan modüller görünür ve işler" — **DOĞRULANDI** (önem: ORTA; KRİTİK/YÜKSEK değil)

Çürütme denemesi ve kanıt:

- **Keşfet filtresiz:** `app/dealer/discover/page.tsx:36-77` sabit `SECTIONS` dizisi, `:93-115` hiçbir görünürlük/modül kontrolü olmadan render ediyor; sayfa `/api/settings/visibility` çağırmıyor.
- **Kenar menüsü filtreli:** `components/dashboard/sidebar.tsx:397` `/api/settings/visibility` çekiyor, `:440-456` `menuVisibility` + `featureVisibility` + `moduleControls` ile süzüyor. İlgili öğeler: `remedy_queue` → `featureKey/moduleKey: 'remedy_offers'` (`:256`), `surveys` → `dealer_surveys` (`:259`), `innovation_hub` → `dealer_innovation` (`:242`), `voc_wall` → anahtar `voc_wall` (`:264`, `lib/module-controls.ts:36`). (Not: iddiadaki satır numaraları birer kaymış; içerik doğru.)
- **Sayfa seviyesinde kapı yok:** `app/dealer/layout.tsx:25-51`, `app/dealer/{remedy-queue,surveys,innovation,voc-wall}/layout.tsx` yalnızca metadata üretiyor. `proxy.ts:50-76` sadece rol kontrolü yapıyor; modül/görünürlük denetimi yok.
- **API kapısı yok:** `assertModuleEnabled`/`assertMenuItemVisible` `app/api/dealer` altında yalnızca 5 dosyada: `campaigns/route.ts`, `campaigns/[id]/send/route.ts`, `consumption-reviews/[id]/remedy/route.ts`, `feedbacks/[id]/remedy/route.ts`, `experience-pulse/route.ts`. `app/api/dealer/surveys/*`, `innovation/*`, `remedy-queue/route.ts`, `remedy-offers/[id]/route.ts`, `voc-wall/route.ts` kapısız (dosya listesiyle doğrulandı).
- **Ek bulgu (iddiayı güçlendiriyor):** `remedy_offers` modülü `lib/module-controls.ts:46`'da `severity: 'important'`. Kapatıldığında Keşfet → Telafi Kuyruğu → `app/dealer/remedy-queue/page.tsx:52` `POST /api/dealer/remedy-offers/{id}` hâlâ `publish`/`reject` yapabiliyor (`app/api/dealer/remedy-offers/[id]/route.ts:19-80`, modül kontrolü yok). Yani kill-switch yalnız *yeni* telafi oluşturmayı (`feedbacks/[id]/remedy`, `consumption-reviews/[id]/remedy`) durduruyor, kuyruktaki teklifleri yayınlamayı durdurmuyor.
- **Ek nüans:** Kapılı rotalarda bile `assertModuleEnabled` `role` verilmeden çağrılıyor (`lib/module-gate.ts:95-101`); dealer-kapsamlı modülde yalnız global `moduleControls` uygulanıyor, `featureVisibility.dealer` uygulanmıyor. Yani "rol bazında kapatma" sunucuda hiçbir yerde zorlanmıyor, sadece menüde.

Yeniden üretim:
1. Admin `/admin/modules`'ta `remedy_offers` (veya `dealer_surveys` / `dealer_innovation` / `voc_wall`) modülünü kapatır.
2. Bayi kenar menüsünde ilgili öğe kaybolur (`sidebar.tsx:451-454`).
3. Bayi Büyüme Merkezi (`app/dealer/growth-hub/page.tsx:78`) veya Deneyim Rehberi (`app/dealer/experience-guide/page.tsx:18`) üzerinden `/dealer/discover`'a gelir; "Telafi Kuyruğu" bağlantısı görünür.
4. Tıklar; `GET /api/dealer/remedy-queue` veri döner, "Yayınla" ile `POST /api/dealer/remedy-offers/{id}` başarıyla teklifi müşteriye yayınlar.

Önem gerekçesi: Rol kapısı (`proxy.ts`) ve sahiplik kontrolü (`remedy-offers/[id]/route.ts:52`) çalıştığı için başka bayinin verisine erişim veya yetki yükseltme yok; güvenlik açığı değil. Etki, admin'in kill-switch'ine güvenilememesi (yönetişim/operasyonel bütünlük) ve kapalı telafi modülünde yine de teklif yayınlanabilmesi. Bu yüzden ORTA olarak sınıflanmalı. Kök neden Keşfet değil, sistem genelinde sunucu tarafı modül kapısının eksikliği; Keşfet yalnızca bunu görünür kılıyor.

Öneri (ürün seviyesi):
- **Tek kaynak:** Bayi menü öğelerini (`key/href/featureKey/moduleKey`) `lib/` altında paylaşılan bir `dealerNavCatalog`'a taşıyın; hem kenar menüsü hem Keşfet aynı `isNavItemEnabled(item, visibility)` yüklemini kullansın. Keşfet bir Server Component olup görünürlüğü sunucuda (`getVisibilitySettings`/`getModuleControls`, zaten 60 sn önbellekli) çözsün; kapalı modüller listede hiç render edilmesin.
- **Sayfa kapısı:** `app/dealer/<modül>/layout.tsx` içinde (zaten var olan segment layout'ları) sunucu tarafı `requireModule('remedy_offers', 'dealer')` çağrısı; kapalıysa "Bu modül yönetici tarafından kapatıldı" boş-durum ekranı veya `/dealer`'a yönlendirme.
- **API kapısı:** Katalogdaki her dealer modülü için rota → modül eşlemesi tanımlayın ve `assertModuleEnabled(key, { role: 'dealer', ... })` ile `featureVisibility.dealer`'ı da zorlayın. Öncelik: `remedy-offers/[id]` (yayın), `remedy-queue`, `surveys/*`, `innovation/*` (özellikle `segment-proposals/[id]/send` gibi dışarıya gönderim yapan uçlar), `voc-wall`.
- **Regresyon testi:** Katalogdaki her `scope: 'dealer'` modülü için "kapalıyken API 403 döner" tablo-güdümlü bir test; yeni modül eklendiğinde kapı unutulmasın.


---

## Uygulama (Dalga 2)

**Karar uygulandı: KALDIR → ⌘K paleti + Bugün.** `app/dealer/discover/page.tsx` artık `/dealer` adresine 308 ile yönlendiren emekli koçanı; sorgu korunuyor. `app/dealer/discover/layout.tsx` silindi.

Elle yazılmış üçüncü menü kopyası (`SECTIONS`) ortadan kalktı. Modül keşfi tek navigasyon kaydından (`lib/navigation/registry.ts`, `keywords` ile) türeyen ⌘K paletinin işi; o kayıt navigasyon ajanında. Kayıtta `dealer.today.redirectFrom` zaten `/dealer/discover` içeriyor. Bugün sayfası kendi bağlantılarını yalnız var olan ve kapatılamayan çekirdek rotalara veriyor; admin'in kapattığı modüllere "arka kapı" üretmiyor.

### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | KALDIRILDI | Sayfa emekli. |
| 2 | KALDIRILDI | Sayfa emekli. |
| 3 | ÇALIŞIYOR | Rol koruması (yönlendirme dahil). |
| 4–28 | KALDIRILDI | 22 statik bağlantı ve 3 bölüm kartı. Hepsi menüde ve ⌘K paletinde tek kaynaktan. Telafi, aksiyon ve operasyon özeti için Bugün'de bağlamlı girişler var (sıradaki adımlar, sayaçlar). |
| 29 | KALDIRILDI | Izgara. |
| 30 | KALDIRILDI | TR'de İngilizce etiket sorunu sayfayla gitti. |
| 31 | ÇALIŞIYOR | Bugün'de odak halkası ve klavye. |
| 32 | ÇALIŞIYOR | Segment durumları. |
| 33 | KALDIRILDI | Kill-switch'i delen liste ortadan kalktı. Kök neden (sunucu tarafı modül kapısı) ilgili modüllerin uçlarında; sahiplik dışı. |
| 34 | KALDIRILDI | `discover` görünürlük anahtarı artık tüketicisiz (katalog sahibine bildirildi). |
| 35 | KALDIRILDI | Menü girişi gerekmiyor. |
| 36 | KALAN | Tüm modüllerin kapsanması ⌘K paletinde (navigasyon sahibi). |
| 37 | KALAN | Modül açıklamaları (`registry.description`) navigasyon sahibinde. |
| 38 | KALAN | İkonlar kayıt defterinde (navigasyon sahibi). |
| 39 | KALAN | Modül araması: ⌘K paleti. |
| 40 | ÇALIŞIYOR | Bekleyen iş sayaçları Bugün'de: yanıt bekleyen, onay bekleyen telafi, açık vaka, açık iş. |
| 41 | KALAN | Son kullanılanlar / sabitleme (palet). |
| 42 | KALDIRILDI | 22 prefetch'li bağlantı yok. Bugün'ün kendi bağlantıları `prefetch={false}`; yalnız 4 metrik kutusu DS `MetricTile` varsayılanını kullanıyor. |

### Kapanan bulgular
- **B1, B3, B4, B5, B6, B7, B8:** Sayfa ve kopya menü kaldırıldı; döngüsel hub bağlantıları bitti.
- **B2:** Bu yüzeyden kaynaklanan sızıntı kapandı. Sistem genelinde sunucu tarafı modül kapısı kalan, sahiplik dışı.

### Kalanlar
- ⌘K paletinin modül açıklaması / durum çipleri (navigasyon).
- Modül API kapıları: `remedy-offers/[id]`, `surveys/*`, `innovation/*`, `voc-wall` (ilgili yüzey sahipleri).
