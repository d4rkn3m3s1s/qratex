# /dealer/growth-hub

**Amaç:** Bayinin (işletme sahibi) büyümeyle ilgili ekranlara — İş sonuçları, Kampanyalar, ROI, Churn riski, Benchmark, Analitik — tek bir giriş noktasından ulaşması. Pratikte sayfa **veri içermeyen, statik bir kısayol (link) panosudur**: hiçbir API çağırmaz, hiçbir metrik göstermez, kişiselleştirme yapmaz.

**Genel puan: 4/10** · **Karar: birleştir** (bugünkü hâliyle kenar çubuğundaki "Analitik" grubunun birebir kopyası; ya kaldırılıp grup başlığına/Keşfet'e eritilmeli ya da gerçek verili bir "Büyüme kokpiti"ne dönüştürülerek /dealer/analytics + /dealer/discover + /dealer/experience-guide kısayol işlevini tek başına üstlenmeli)

> Kapsam: `app/dealer/growth-hub/page.tsx` (86 satır), `app/dealer/growth-hub/layout.tsx` (10 satır), `app/dealer/layout.tsx`, `app/dealer/loading.tsx`, `app/dealer/error.tsx`, `components/layout/dashboard-page-hero.tsx` → `components/admin/admin-premium-hero.tsx`, `components/ui/card.tsx`, `components/dashboard/sidebar.tsx` (bayi menüsü + görünürlük filtresi), `lib/visibility-controls.ts`, `lib/module-controls.ts`, `lib/module-gate.ts`, `proxy.ts` (rol kapısı), `messages/tr.json` + `messages/en.json` (`dealerGrowthHub.*`, `layoutMetadata.dealerGrowthHub*`, `sidebarNav.dealer.*`, `sidebarNavGroups.dealer.*`), kardeş hub sayfaları `app/dealer/discover/page.tsx`, `app/dealer/experience-guide/page.tsx`, `lib/data/product-roadmap.json`. Hedef sayfaların varlığı dosya düzeyinde doğrulandı (8/8 mevcut). Sayfa **hiçbir API ucu çağırmıyor ve hiçbir Prisma modeline dokunmuyor**; bu nedenle API/şema incelemesi yalnızca yeniden tasarım vizyonu için mevcut uçların envanteri amacıyla yapıldı (`app/api/dealer/roi`, `churn-risk`, `business-outcomes`, `benchmark`, `campaigns`, `analytics`, `operations-brief`, `next-best-actions`). Kod çalıştırılmadı; tüm tespitler okunarak yapıldı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Tüm linkler gerçek ve çalışan sayfalara gidiyor, kırık/sahte öğe yok; ama sayfa yalnızca yönlendirme yapıyor ve görünürlük/modül ayarlarını yok sayıyor. |
| UX | 3/10 | Kenar çubuğundaki "Analitik" grubunun aynısını tekrar ediyor; kullanıcıya "şu an ne durumdayım, ne yapmalıyım" sorusunun cevabını vermiyor, bir tık fazladan maliyet üretiyor. |
| Görsel | 5/10 | Ortak `DashboardPageHero` ve kart diliyle tutarlı, temiz; fakat altı eşit ağırlıklı kart hiyerarşi kurmuyor, iki ikon tekrar ediyor, alt "chip" linkleri yetim duruyor. |
| Mimari | 4/10 | Hub listesi sabit kodlu ve kenar çubuğu kataloğundan bağımsız; aynı menü üç ayrı yerde (sidebar, discover, growth-hub) elle tekrarlanıyor ve kaymaya başlamış (Segment Aksiyon eksik). |
| Performans | 8/10 | Veri çekmeyen hafif sayfa; tek eleştiri, hiçbir istemci durumu olmamasına rağmen `'use client'` olması (gereksiz hidrasyon). |
| Erişilebilirlik + mobil | 7/10 | Grid mobilde tek sütuna iniyor, global `:focus-visible` halkası var, hero azaltılmış hareketi destekliyor; ancak her kart linkinin erişilebilir adı başlık+açıklama+"Aç" birleşimi ve odak halkası köşeli `block` kapsayıcıya çiziliyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata'sı (başlık/açıklama, i18n) | ÇALIŞIYOR | `app/dealer/growth-hub/layout.tsx:4-6`, `messages/tr.json:19-20` | "Büyüme merkezi \| Bayi paneli" şablonuyla üretiliyor (`app/dealer/layout.tsx:16-20`). |
| 2 | Rol kapısı (yalnızca DEALER) | ÇALIŞIYOR | `proxy.ts:52`, `proxy.ts:124` | `/dealer/:path*` proxy'de rol kontrolünden geçiyor. Sayfa kendi başına ek yetki kontrolü yapmıyor (gerek de yok, veri yok). |
| 3 | Hero (eyebrow, başlık, alt başlık, ikon) | ÇALIŞIYOR | `page.tsx:24-30` | Ortak `DashboardPageHero` (`components/layout/dashboard-page-hero.tsx:9-13`). `chips`/`actions`/`aside` prop'ları kullanılmıyor — hero bilgi taşımıyor. |
| 4 | Hero azaltılmış hareket desteği | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:35`, `:73`, `:126` | `useReducedMotion` ile "breathe" animasyonu ve `animate-in` kapanıyor. |
| 5 | Giriş paragrafı | ÇALIŞIYOR | `page.tsx:32`, `messages/tr.json` `dealerGrowthHub.intro` | "Bu hub, büyüme ve performans ekranlarını tek yerde toplar." — alt başlığın tekrarı, bilgi değeri yok. |
| 6 | Kart: İş sonuçları → `/dealer/business-outcomes` | ÇALIŞIYOR | `page.tsx:11`, hedef `app/dealer/business-outcomes/page.tsx` | Statik açıklama: "KPI ve hedef takibi." |
| 7 | Kart: Kampanyalar → `/dealer/campaigns` | ÇALIŞIYOR | `page.tsx:12` | Aktif kampanya sayısı vb. gösterilmiyor. |
| 8 | Kart: ROI analizi → `/dealer/roi` | ÇALIŞIYOR | `page.tsx:13` | — |
| 9 | Kart: Churn riski → `/dealer/churn-risk` | ÇALIŞIYOR | `page.tsx:14` | Riskteki müşteri sayısı gösterilmiyor (en değerli sinyal). |
| 10 | Kart: Benchmark → `/dealer/benchmark` | ÇALIŞIYOR | `page.tsx:15` | — |
| 11 | Kart: Analitik → `/dealer/analytics` | ÇALIŞIYOR | `page.tsx:16` | — |
| 12 | Kart açıklamaları | KISMİ | `page.tsx:53-55`, `messages/tr.json` `dealerGrowthHub.desc.*` | Tek cümlelik sabit metin; canlı durum/sayı yok. `line-clamp-2` ile kesilebilir. |
| 13 | Kart içi "Aç" CTA metni | KISMİ | `page.tsx:59-63` | Ayrı bir aksiyon değil, tüm kart zaten link; ekran okuyucuya altı kez "Aç" okutuyor. |
| 14 | Hover/geçiş mikro-etkileşimi | ÇALIŞIYOR | `page.tsx:41-42`, `:50`, `:57` | Kenarlık rengi, başlık rengi, ok `translate-x-0.5`. Ölçülü ve yerinde. |
| 15 | Alt link: Operasyon özeti → `/dealer/operations-brief` | KISMİ | `page.tsx:71-76`; `components/dashboard/sidebar.tsx:229-231` | Hedef çalışıyor, fakat bu sayfa bilinçli olarak menüden çıkarılmış ("`operations_brief` menüden çıkarıldı"). Hub bir arka kapı olarak kalmış; ayrıca "büyüme" bağlamına ait değil. |
| 16 | Alt link: Keşfet → `/dealer/discover` | KISMİ | `page.tsx:77-82`; `components/dashboard/sidebar.tsx:229-231`; `app/dealer/discover/page.tsx:53` | Keşfet de menüden çıkarılmış; Keşfet sayfası da growth-hub'a geri link veriyor → hub ↔ hub döngüsü. |
| 17 | Duyarlı grid (1 / 2 / 3 sütun) | ÇALIŞIYOR | `page.tsx:34` | `sm:grid-cols-2 xl:grid-cols-3`; mobilde tek sütun, kartlar `h-full` ile eşit yükseklikte. |
| 18 | Menü/özellik/modül görünürlük filtresi | EKSİK | `page.tsx:35` (filtresiz `LINKS.map`) vs `components/dashboard/sidebar.tsx:439-456` | Admin `roi`/`benchmark`/`churn_risk` menüsünü kapatırsa kenar çubuğu gizliyor, hub göstermeye devam ediyor. |
| 19 | Segment Aksiyon Merkezi linki | EKSİK | `components/dashboard/sidebar.tsx:249` (aynı "Analitik" grubunda) vs `page.tsx:10-17` | Elle tutulan iki liste kaymış; segment aksiyonları büyüme işinin tam kalbinde olmasına rağmen hub'da yok. |
| 20 | Canlı KPI/durum rozetleri (risk sayısı, ROI, aktif kampanya) | EKSİK | `page.tsx` hiçbir `fetch`/SWR içermiyor | İlgili uçlar hazır: `app/api/dealer/churn-risk/route.ts:127`, `roi/route.ts:212`, `business-outcomes/route.ts:69`, `campaigns/route.ts:41`. |
| 21 | Dil/terim tutarlılığı (TR/EN) | KISMİ | `messages/tr.json` `dealerGrowthHub.links.churn`="Churn riski", `links.benchmark`="Benchmark", `intro`="Bu hub…"; `layoutMetadata.dealerGrowthHubDescription`="…kayıp riski, kıyaslama…" (`messages/tr.json:20`) | Aynı kavram aynı sayfanın meta etiketinde Türkçe ("kayıp riski", "kıyaslama"), gövdesinde İngilizce ("Churn", "Benchmark", "hub"). Kenar çubuğu ise "Churn Risk" (büyük R, İngilizce) diyor. |
| 22 | Klavye erişimi / odak görünürlüğü | ÇALIŞIYOR | `app/globals.css:131-133` | Global `:focus-visible` halkası `Link`'e uygulanıyor; ancak halka köşeli `block` kapsayıcıya çiziliyor, yuvarlak `Card` köşeleriyle örtüşmüyor (küçük görsel kusur). |
| 23 | Ekran okuyucu link adları | KISMİ | `page.tsx:38-64` | Link adı = başlık + açıklama + "Aç"; `aria-label`/`aria-describedby` ayrımı yok. Kart listesi `<ul>/<li>` değil (öğe sayısı duyurulmuyor). |
| 24 | İkon semantiği | KISMİ | `page.tsx:15-16` | Benchmark ve Analitik aynı `BarChart3` ikonunu kullanıyor; İş sonuçları `Target` ikonu kenar çubuğunda Segment Aksiyon'a da verilmiş (`sidebar.tsx:249-252`). |
| 25 | Kenar çubuğu girişi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:247` | "Analitik" grubunda, grubun kendi altı öğesiyle yan yana — tekrarın kaynağı. |
| 26 | Hub'ın admin tarafından kapatılabilmesi | KISMİ | `lib/visibility-controls.ts:45`, `lib/module-controls.ts:33` | Katalogda kayıtlı, kenar çubuğundan gizlenebiliyor; ancak sayfa kendi içinde kapalı modül kontrolü yapmıyor, doğrudan URL ile açılmaya devam ediyor (sistem genelindeki desen). |
| 27 | "Bugün ne yapmalıyım?" önceliklendirme / kişiselleştirme | EKSİK | `page.tsx` | Kartlar sabit sırada; bayinin durumuna göre (ör. riskte müşteri artışı) öne çıkarma yok. `app/api/dealer/next-best-actions/route.ts:81` bu iş için hazır bir kaynak. |
| 28 | Yükleniyor / hata sınırı | ÇALIŞIYOR | `app/dealer/loading.tsx:1`, `app/dealer/error.tsx` | Statik sayfa olduğundan yalnızca segment düzeyindeki ortak sınırlar devrede; sayfaya özgü boş/hata durumu gerekmiyor. |

**Durum özeti:** 28 özellik — 16 ÇALIŞIYOR, 8 KISMİ, 0 BOZUK, 0 SAHTE, 4 EKSİK.

---

## Bulgular

### 1. Sayfa, kenar çubuğundaki "Analitik" grubunun birebir kopyası — değer üretmeyen fazladan bir tık
- **Önem:** yüksek · **Kategori:** bilgi mimarisi / UX · **Efor:** M
- **Kanıt:** `components/dashboard/sidebar.tsx:245-252` ("3) Analitik (Büyüme Merkezi)" yorumu altında `analytics`, `growth_hub`, `churn_risk`, `segment_actions`, `roi`, `benchmark`, `business_outcomes`); `app/dealer/growth-hub/page.tsx:10-17` aynı altı hedefin beşini + analitiği listeliyor.
- **Sorun:** Bayi growth-hub'a kenar çubuğundaki "Analitik" grubundan ulaşıyor; açtığında aynı grubun öğelerini kart olarak görüyor. Hub hiçbir ek bağlam (sayı, trend, uyarı, öneri) vermediği için kullanıcıyı hedefe bir adım geç ulaştırıyor. Grup yorumunun kendisi bile grubun adını "Büyüme Merkezi" koyuyor — yani hub ile grup kavramsal olarak aynı şey. Medallia/Qualtrics/Square'de "hub" ekranları her zaman özet metrik + derin link birleşimidir; saf link listesi yalnızca kenar çubuğu olmayan mobil uygulamalarda anlam taşır.
- **Profesyonel öneri:** İki yoldan birini seçin, ikisini bir arada değil:
  1. **Kaldır/erit:** `growth_hub` menü öğesini kaldırın, kenar çubuğu grup başlığını ("Analitik" → "Büyüme") tıklanabilir yapıp mobil alt-çekmecede grup açılır listesi olarak sunun. Eski URL'yi `next.config` redirect ile `/dealer/analytics`'e (veya dönüştürülmüş kokpite) yönlendirin; `lib/data/product-roadmap.json:99` girdisini güncelleyin.
  2. **Dönüştür:** Sayfayı "Büyüme kokpiti"ne çevirin (bkz. Yeniden tasarım vizyonu): her kart kendi modülünün 1 ana metriğini + değişim yönünü + gerekirse uyarı rozetini göstersin; en üstte "Bu hafta öncelikli 3 aksiyon" şeridi olsun. Bu durumda kenar çubuğu grubundaki alt öğeler daraltılabilir.

### 2. Hub, admin'in menü/özellik/modül görünürlük ayarlarını yok sayıyor
- **Önem:** orta · **Kategori:** tutarlılık / yönetişim · **Efor:** S
- **Kanıt:** Kenar çubuğu her öğeyi `menuVisibility`, `featureVisibility` ve `moduleControls` ile süzüyor (`components/dashboard/sidebar.tsx:397-407`, `:439-456`); hub ise sabit `LINKS` dizisini filtresiz basıyor (`page.tsx:35`). `roi`, `benchmark`, `churn_risk`, `business_outcomes`, `campaigns`, `operations_brief` hepsi `lib/module-controls.ts:32-45` ve `lib/visibility-controls.ts:44-64` kataloglarında kapatılabilir modüller.
- **Sorun:** Admin, örneğin `benchmark`'ı bayilere kapattığında kenar çubuğundan kayboluyor ama growth-hub'da "Benchmark" kartı görünmeye devam ediyor; bayi tıklayınca sayfa (API düzeyinde de modül kapısı olmadığı için — `app/api/dealer/roi/route.ts:15-18` yalnızca `requireAuth`) normal şekilde açılıyor. Bu, "kapatılmış" özelliğin hub üzerinden sızması ve ürün tutarlılığının bozulması demek. Aynı sorun `discover` sayfasında da var.
- **Profesyonel öneri:** Kenar çubuğundaki görünürlük durumunu tek bir hook'a çıkarın (`useDealerNavVisibility()` — `/api/settings/visibility` yanıtını SWR ile paylaşan, sidebar'ın kullandığı filtre fonksiyonunu dışa aktaran). Hub, Keşfet ve deneyim rehberi bu hook'la kendi link listelerini süzsün. Daha kalıcı çözüm: bayi rotaları için sunucu tarafında `lib/module-gate.ts` üzerinden sayfa düzeyinde `notFound()`/"modül kapalı" ekranı ve ilgili API uçlarında modül kapısı — bu sayfanın kapsamını aşan sistem işi olarak ayrı ele alınmalı.

### 3. Aynı navigasyon üç ayrı yerde elle tekrarlanıyor ve kaymaya başlamış
- **Önem:** orta · **Kategori:** mimari / bakım · **Efor:** M
- **Kanıt:** `components/dashboard/sidebar.tsx:233-271` (`dealerNavItems`), `app/dealer/discover/page.tsx:36-77` (`SECTIONS`), `app/dealer/growth-hub/page.tsx:10-17` (`LINKS`), `app/dealer/experience-guide/page.tsx:16-21` (`shortcuts`). `lib/visibility-controls.ts:4-8` "tek doğruluk kaynağı kataloglardır" diyor ama hub/discover kataloğu kullanmıyor.
- **Sorun:** Segment Aksiyon Merkezi kenar çubuğunun "Analitik" grubunda var (`sidebar.tsx:249`) ama hub'da yok; ikonlar ve etiketler üç yerde farklı (hub "ROI analizi", sidebar "ROI"; hub `Target` = İş sonuçları, sidebar `Target` = hem Segment Aksiyon hem İş sonuçları). Her yeni modülde dört dosyanın elle güncellenmesi gerekiyor; zaten unutulmuş.
- **Profesyonel öneri:** `dealerNavItems`'ı (href, key, ikon, groupKey, featureKey/moduleKey) `lib/dealer-nav-catalog.ts` gibi paylaşılan bir modüle taşıyın; hub kartları `groupKey === 'analytics'` öğelerinden türetilsin, açıklama metinleri `sidebarNav.dealerDesc.<key>` altında tek yerde tutulsun. Böylece hub, discover ve sidebar aynı kaynaktan beslenir ve görünürlük filtresi (Bulgu 2) bedavaya gelir.

### 4. Menüden bilinçli olarak çıkarılmış sayfalara arka kapı + hub ↔ hub döngüsü
- **Önem:** orta · **Kategori:** bilgi mimarisi · **Efor:** S
- **Kanıt:** `components/dashboard/sidebar.tsx:229-231` ("`discover` (Keşfet) … `operations_brief` menüden çıkarıldı"); `page.tsx:70-83` her ikisine de link veriyor. `app/dealer/discover/page.tsx:53` growth-hub'a, `app/dealer/experience-guide/page.tsx:17-19` hem growth-hub'a hem discover'a hem operations-brief'e link veriyor.
- **Sorun:** Ürün kararı bu ekranları menüden çıkarmak yönünde alınmış, ama hub'ların içindeki elle yazılmış linkler bu kararı delmiş. Kullanıcı discover → growth-hub → discover arasında içeriksiz bir döngüye girebiliyor. "Operasyon özeti" büyüme bağlamına da ait değil; sayfanın altında bağlamsız iki "chip" olarak yetim duruyor.
- **Profesyonel öneri:** Menüden çıkarılan ekranlar için tek bir karar verin: ya gerçekten emekliye ayırın (redirect + roadmap güncelleme), ya da içerikleri bir kokpit bölümüne taşıyın (ör. operations-brief'in "bugün" özeti → dealer dashboard'a). Hub'lar arası çapraz linkleri kaldırın; "Keşfet" türü site haritası gerekiyorsa global komut paleti (Cmd+K, `DashboardHeader showSearch` zaten var — `app/dealer/layout.tsx:36`) bu işi üstlensin.

### 5. Hiçbir canlı veri yok — "büyüme merkezi" büyümeyi göstermiyor
- **Önem:** orta · **Kategori:** ürün değeri · **Efor:** L
- **Kanıt:** `page.tsx` içinde `fetch`/`useSWR`/server action yok; kart açıklamaları sabit i18n metinleri (`messages/tr.json` `dealerGrowthHub.desc.*`). Mevcut veri kaynakları: `app/api/dealer/churn-risk/route.ts:127` (Redis önbellekli), `app/api/dealer/roi/route.ts:36`, `:212` (Redis önbellekli), `app/api/dealer/business-outcomes/route.ts:69`, `app/api/dealer/campaigns/route.ts:41`, `app/api/dealer/next-best-actions/route.ts:81`.
- **Sorun:** Bir işletme sahibi bu sayfaya "işim büyüyor mu?" sorusuyla gelir. Cevap için her alt sayfayı tek tek açması gerekiyor; 6 sayfa = 6 ayrı ağır yükleme (ör. analytics route'u 400+ satır, `roi` 13 Prisma çağrısı — `roi/route.ts:31` yorumu). Toast/Square/Google Business Profile'ın "Home/Insights" ekranları tam olarak bu özet katmanını sağlar.
- **Profesyonel öneri:** Yeni, hafif bir özet ucu: `GET /api/dealer/growth-summary` — mevcut Redis anahtarlarını (`dealer-roi:${id}`, churn cache anahtarı vb.) okuyup yoksa yalnızca 4–6 hafif `count/aggregate` sorgusu çalıştıran, `PRIVATE_NO_STORE_HEADERS` + 5 dk Redis TTL'li, `requireAuth(['DEALER'])` ile `session.user.id`'ye kilitli bir uç. Dönen alanlar: `churnAtRisk {count, delta}`, `roi {value, deltaPct}`, `activeCampaigns`, `outcomesProgressPct`, `benchmarkPercentile`, `topActions[3]`. Kartlar bu metrikle render edilsin, ölçüm yoksa "Henüz veri yok — kur" boş durumu gösterilsin. DB hatasında kart metriksiz ama link olarak çalışmaya devam etmeli (graceful degradation).

### 6. Terim ve dil tutarsızlığı (TR panelde İngilizce terimler, meta ile gövde çelişiyor)
- **Önem:** düşük · **Kategori:** i18n / içerik · **Efor:** S
- **Kanıt:** `messages/tr.json:20` meta açıklama "kayıp riski, kıyaslama"; gövde `dealerGrowthHub.links.churn` = "Churn riski", `links.benchmark` = "Benchmark", `intro` = "Bu hub…", `subtitle` = "…churn araçlarına…"; kenar çubuğu `sidebarNav.dealer.churn_risk` = "Churn Risk".
- **Sorun:** Hedef kitle restoran/kafe sahibi; "churn", "benchmark", "hub" terimleri bu kitle için bilinmeyen jargon ve aynı kavram aynı sayfada iki farklı adla geçiyor.
- **Profesyonel öneri:** Bayi paneli için bir terim sözlüğü belirleyin (Churn → "Kaybedilme riski", Benchmark → "Sektör kıyası", Hub → "Merkez", ROI → "Getiri (ROI)") ve `dealerGrowthHub`, `sidebarNav.dealer`, `layoutMetadata` anahtarlarını aynı sözlükle hizalayın. İngilizce kısaltma ancak parantez içinde kalsın.

### 7. Erişilebilirlik: kart linkinin erişilebilir adı gürültülü, liste semantiği yok
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:38-64` — `Link` tüm `Card`'ı sarıyor; içindeki başlık, açıklama ve "Aç" metni birleşerek link adını oluşturuyor. Kartlar `<div className="grid">` içinde, `<ul>/<li>` değil. Odak halkası `Link`'in `block` dikdörtgenine çiziliyor (`app/globals.css:131-133`), `Card` ise yuvarlak köşeli.
- **Sorun:** Ekran okuyucu her kartta "İş sonuçları KPI ve hedef takibi. Aç, link" okuyor; "Aç" altı kez tekrar ediyor. Liste olmadığı için "6 öğeli liste" bilgisi duyurulmuyor. Klavye odağında halka kart köşelerinden taşıyor.
- **Profesyonel öneri:** Grid'i `<ul role="list">` + `<li>` yapın; `Link`'e `aria-describedby` ile açıklamayı bağlayın, "Aç" metnini `aria-hidden` yapın (veya kaldırın — ok ikonu zaten aynı işi görüyor). `Link`'e `rounded-xl focus-visible:ring-offset-2` ekleyerek halkayı kart şekline oturtun.

### 8. Gereksiz istemci bileşeni ve tekrar eden ikonlar
- **Önem:** düşük · **Kategori:** performans / görsel · **Efor:** S
- **Kanıt:** `page.tsx:1` `'use client'` — sayfada state/effect/handler yok, yalnızca `useAppT`. `page.tsx:15-16` iki kartta aynı `BarChart3` ikonu.
- **Sorun:** Sayfa tamamen statik olduğu hâlde tüm ağaç hidrasyona giriyor (hero da istemci bileşeni olduğu için kazanç sınırlı, ama kart grid'i sunucuda render edilebilir). Aynı ikon iki farklı modülü temsil ediyor, görsel tarama hızını düşürüyor.
- **Profesyonel öneri:** Kokpite dönüştürülürse sayfa sunucu bileşeni olsun (`t` sunucu çevirisi `@/i18n/request` zaten var — `app/dealer/layout.tsx:11`), metrik kartları `Suspense` sınırlarıyla akış hâlinde gelsin. Her modüle özgü ikon atayın (Benchmark → `Scale`/`Trophy`, Analitik → `LineChart`).

> Kritik/yüksek önemde güvenlik veya veri bütünlüğü hatası **bulunmadı**: sayfa veri okumuyor/yazmıyor, IDOR yüzeyi yok, sonsuz render/yarış koşulu yok, `any` kaçağı yok, tüm hedef linkler mevcut (8/8 doğrulandı).

---

## Eksik özellikler (kıyas ürünlerle)

1. **Özet metrik kartları (KPI tiles) + trend oku** — Square Dashboard "Overview", Toast "Home", Google Business Profile "Performance" kartları her modülün tek ana sayısını ve önceki dönemle farkını gösterir. Hub'da hiçbir sayı yok.
2. **Önceliklendirilmiş aksiyon şeridi ("Bugün yapılacaklar")** — Medallia "Action Planning", Qualtrics "Recommended Actions": risk sinyalinden türeyen ilk 3 aksiyon, sahibine atama butonuyla. Kaynak hazır: `app/api/dealer/next-best-actions/route.ts`, `app/api/dealer/action-items`.
3. **Hedef (goal) ilerlemesi** — Qualtrics/Medallia'da NPS/CSAT hedefine ilerleme halkası; `business-outcomes` verisi hub'da tek bir ilerleme çubuğuyla temsil edilebilir.
4. **Dönem seçici ve karşılaştırma** — 7g/30g/90g, "geçen dönemle kıyasla" (Yelp for Business, Square). Hub'da dönem kavramı yok.
5. **Uyarı/anomali rozeti** — Riskteki müşteri sayısı eşik aşınca Churn kartında kırmızı rozet; kampanya bitiş tarihi yaklaşınca kampanya kartında uyarı (Toast'un "Needs attention" bandı).
6. **Kişiselleştirilebilir/sabitlenebilir kartlar ve haftalık e-posta özeti** — kullanıcı en çok baktığı 3 metriği sabitler; aynı özet `weekly-brief` (`app/api/dealer/weekly-brief`) ile e-postaya bağlanır.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** İşletme sahibi sayfayı açtığında 5 saniyede şu üç sorunun cevabını almalı: *"Bu ay büyüyor muyum?"*, *"Nerede kan kaybediyorum?"*, *"Şimdi ne yapmalıyım?"*. Linkler ikincil hâle gelir; her kart, ilgili derin ekrana giden bir "özet penceresi"dir.

**Yerleşim (masaüstü → mobil tek sütun):**
1. **Kompakt hero** — mevcut `DashboardPageHero`, `chips` prop'u ile dönem seçici (7g/30g/90g) ve `aside` ile tek bir "Büyüme skoru" (ROI + elde tutma + memnuniyet bileşik puanı, 0–100) gösterir. Açıklama paragrafı (`page.tsx:32`) kaldırılır.
2. **"Şimdi yapılacaklar" şeridi** — `next-best-actions`'tan en fazla 3 kart: başlık, etkilenen müşteri sayısı, tahmini etki, tek birincil buton ("Kampanya başlat", "Telafi gönder", "Segmente mesaj"). Veri yoksa şerit hiç render edilmez.
3. **Metrik kartları grid'i (2×3)** — her kart: modül adı (Türkçe terim sözlüğüyle), büyük sayı, delta oku (yeşil/kırmızı + metin "geçen 30 güne göre +%12" — renk tek başına anlam taşımaz), 7 günlük mini sparkline, uyarı rozeti. Sıralama sabit değil, "dikkat gerektiren" kartlar öne çıkar (ör. churn delta pozitifse ilk sıra). Kartlar paylaşılan nav kataloğundan ve görünürlük filtresinden türetilir (Bulgu 2–3).
4. **Alt bölüm: "Daha fazla araç"** — Segment Aksiyon, Analitik gibi metriksiz kalan modüller kompakt satır linkleri olarak; Keşfet/Operasyon özeti chip'leri kaldırılır.

**Motion / 3D:** 3D gerekmez — bu bir karar ekranı, gösteri değil. Ölçülü motion: metrik sayıları ilk yüklemede 400 ms'lik count-up (`m as Motion` + `useReducedMotion` ile kapatılabilir), kart grid'i 40 ms stagger ile fade-up (global LazyMotion zaten var), sparkline çizgisi `pathLength` ile 600 ms çizilir. Delta değiştiğinde yalnızca sayı yumuşak geçiş yapar; sürekli nefes/parıltı animasyonu eklenmemeli. `prefers-reduced-motion`'da tüm giriş animasyonları atlanır, değerler doğrudan görünür.

**Veri / API değişiklikleri:**
- Yeni `GET /api/dealer/growth-summary` (bkz. Bulgu 5): `requireAuth(['DEALER'])`, `dealerId = session.user.id` (query parametresi kabul etmez → IDOR yüzeyi yok), mevcut Redis anahtarlarını yeniden kullanır, eksikse hafif aggregate sorguları `Promise.all` ile çalıştırır, sonucu `growth-summary:${dealerId}:${range}` anahtarıyla 5 dk önbelleğe alır, her alt metrik için bağımsız `try/catch` (bir kaynak çökse de diğer kartlar gelir).
- Sayfa sunucu bileşeni olur; metrik grid'i `Suspense` + iskelet kartlarla akış hâlinde render edilir; dönem seçici URL arama parametresi (`?range=30d`) ile paylaşılabilir hâle gelir.
- `lib/dealer-nav-catalog.ts`: sidebar, hub ve (varsa) komut paleti için tek kaynak; görünürlük süzgeci tek fonksiyon.
- Uzun vadede: bayi rotalarına `lib/module-gate.ts` tabanlı sunucu tarafı modül kapısı (sistem işi).

---

## Çakışmalar / birleştirme önerisi

| Sayfa | Çakışma | Öneri |
|---|---|---|
| Kenar çubuğu "Analitik" grubu (`components/dashboard/sidebar.tsx:245-252`) | Hub'ın içeriği grubun birebir kopyası; grup yorumu bile "Büyüme Merkezi" diyor. | Hub kokpite dönüşmezse kaldırılmalı, grup başlığı onun yerini almalı. |
| `/dealer/discover` (`app/dealer/discover/page.tsx:49-61`) | "Büyüme" bölümü aynı linkleri (growth-hub dahil) tekrar ediyor; menüden çıkarılmış. | Discover emekliye ayrılıp header araması/komut paletine devredilmeli; growth-hub'a geri link kaldırılmalı. |
| `/dealer/experience-guide` (`app/dealer/experience-guide/page.tsx:16-21`) | Growth-hub, discover, operations-brief'e kısayol veren üçüncü bir hub. | Rehber içeriği onboarding'e (`/dealer/onboarding`) taşınmalı, kısayol bloğu kaldırılmalı. |
| `/dealer/analytics` | Hub'daki "Analitik" kartı; kokpit vizyonunda trafik/dönüşüm özetinin doğal evi. | Kokpit yapılmazsa `/dealer/growth-hub` → `/dealer/analytics` redirect'i en düşük maliyetli birleştirme. |
| `/dealer/operations-brief`, dealer dashboard (`/dealer`) | Hub alt chip'i operasyon özetine gidiyor; dashboard da günlük özet işlevi taşıyor. | Operasyon özeti dashboard'a eritilmeli; büyüme kokpiti "dönemsel/stratejik", dashboard "bugün/operasyonel" olarak ayrışmalı. |

**Sonuç:** Bugünkü hâliyle sayfa, sistemdeki "hub enflasyonu"nun (growth-hub, discover, experience-guide, progress-hub benzeri sayfalar) bir örneği. En hızlı kazanım: sayfayı kaldırıp redirect vermek (S). En yüksek ürün değeri: sayfayı paylaşılan nav kataloğu + tek özet API ile gerçek bir "Büyüme kokpiti"ne dönüştürüp discover/experience-guide'ı emekliye ayırmak (L).


---

## Uygulama (Dalga 2)

**Karar uygulandı: KALDIR → Analitik.** `app/dealer/growth-hub/page.tsx` artık `/dealer/analytics` adresine 308 ile yönlendiren emekli koçanı; sorgu korunuyor (kayıt defterinde `dealer.analytics.redirectFrom` ile uyumlu). `app/dealer/growth-hub/layout.tsx` silindi.

Statik kısayol panosu yerine:
- "Şimdi ne yapmalıyım?" sorusunu Bugün'deki **Sıradaki adımlar** yanıtlıyor (kural tabanlı, gerçek sayılarla, önceliklendirilmiş).
- "İşim nasıl gidiyor?" sorusunu Bugün metrikleri ve **Haftalık rapor** yanıtlıyor (önceki haftaya göre delta).
- Dönemsel/stratejik kırılım **Analitik**'te kalıyor.

### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | KALDIRILDI | Sayfa emekli; metadata Analitik'te. |
| 2 | ÇALIŞIYOR | Rol kapısı (yönlendirme dahil). |
| 3 | KALDIRILDI | Bilgi taşımayan hero. |
| 4 | KALDIRILDI | Sayfa emekli. |
| 5 | KALDIRILDI | Tekrar eden giriş paragrafı. |
| 6 | KALDIRILDI | Statik kart; menü / ⌘K ve Analitik altında. |
| 7 | KALDIRILDI | Statik kart; menü / ⌘K ve Analitik altında. |
| 8 | KALDIRILDI | Statik kart; menü / ⌘K ve Analitik altında. |
| 9 | KALDIRILDI | Statik kart; menü / ⌘K ve Analitik altında. |
| 10 | KALDIRILDI | Statik kart; menü / ⌘K ve Analitik altında. |
| 11 | KALDIRILDI | Statik kart; menü / ⌘K ve Analitik altında. |
| 12 | KALDIRILDI | Sabit açıklamalar. |
| 13 | KALDIRILDI | Tekrarlanan "Aç". |
| 14 | KALDIRILDI | Sayfa emekli. |
| 15 | KALDIRILDI | Operasyon özetine arka kapı; Bugün'e birleşti. |
| 16 | KALDIRILDI | Hub ↔ hub döngüsü bitti. |
| 17 | KALDIRILDI | Sayfa emekli. |
| 18 | KALDIRILDI | Filtresiz liste yok; menü görünürlüğü kabukta sunucuda çözülüyor. |
| 19 | KALDIRILDI | Kopya liste yok. |
| 20 | ÇALIŞIYOR (kısmen) | Canlı sayılar Bugün'de: geri bildirim, işlem, ortalama puan, yanıt oranı, telafi, vaka, iş. ROI / kayıp riski / kampanya özeti Analitik → Etki ve Müşteriler → Risk'te. |
| 21 | KALDIRILDI | Jargon sorunu sayfayla gitti. |
| 22 | ÇALIŞIYOR | Bugün'de odak halkaları. |
| 23 | KALDIRILDI | Sayfa emekli. |
| 24 | KALDIRILDI | Sayfa emekli. |
| 25 | KALDIRILDI | `growth_hub` menü öğesi artık tüketicisiz (navigasyon / katalog sahibine bildirildi). |
| 26 | KALDIRILDI | `growth_hub` modül anahtarı tüketicisiz. |
| 27 | ÇALIŞIYOR | "Bugün ne yapmalıyım?" Bugün → Sıradaki adımlar (deterministik, testli). |
| 28 | ÇALIŞIYOR | Segment durumları. |

### Kapanan bulgular
- **1, 3, 4, 6, 7, 8:** Kopya hub ve dil/erişilebilirlik sorunları sayfayla gitti.
- **2:** Kill-switch sızıntısı kapandı.
- **5 (kısmi):** Canlı özet Bugün'de. Büyümeye özgü ROI / kayıp riski kartları Analitik / Müşteriler yüzeylerinin işi.

### Kalanlar
- Büyüme KPI'larının (ROI, kayıp riski, kampanya dönüşümü) Analitik genel bakışta birleşik gösterimi (Analitik sahibi).
- `growth_hub` katalog anahtarlarının temizliği.
