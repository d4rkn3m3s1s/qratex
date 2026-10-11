# Bilgi Mimarisi ve Navigasyon Denetimi — Sistem Geneli

**Tarih:** 2026-10-08 · **Dal:** `feat/moment-engine` · **Kapsam:** Admin (73 sayfa), Bayi (43 sayfa), Müşteri (58 sayfa), Personel (2), kamu/auth rotaları; sidebar motoru, menü katalogları, görünürlük/sıra/grup yönetimi, global arama, derin linkler.
**Yöntem:** Salt okunur inceleme. `app/**/page.tsx` envanteri ile `components/dashboard/sidebar.tsx` menü dizileri betikle karşılaştırıldı (`comm`); tüm statik iç linkler (`app`, `components`, `lib`) çıkarılıp gerçek rotalara karşı doğrulandı; her şüpheli bulgu ilgili dosya okunarak teyit edildi. Kod, veritabanı, build ve test çalıştırılmadı.

---

## 1. Özet

**Puan: 4 / 10**

Sidebar motorunun kendisi sağlam bir temele sahip: rol bazlı menü dizileri, katlanabilir gruplar, admin tarafından yönetilebilen sıra (`sidebarNavOrder`), grup ataması (`sidebarNavGroups`) ve menü/özellik/modül görünürlüğü üç katmanlı olarak birbirini bozmadan çalışıyor. i18n kapsaması da tam: 128 menü etiketinin tamamı `tr.json` ve `en.json` içinde mevcut.

Asıl sorun, bu motorun üzerine oturan **bilgi mimarisinin** organik olarak büyümüş olması:

- **Admin menüsü 68 düz öğeden oluşuyor, grup desteği hiç yok.** Bunun nedeni teknik bir eksik değil: admin rolü bilinçli olarak grup sisteminin dışında tutulmuş (`NAV_GROUPS_BY_ROLE.admin = []`).
- **Menü tanımı en az 7 ayrı, elle tutulan listeye dağılmış durumda.** Bunlar birbirinden kopmuş: bayi ve müşteri görünürlük kataloğunda 8 öğe eksik, 5 öğe ise artık menüde olmayan "hayalet" anahtar. Bu kopmayı yakalaması gereken `verify:menu` testi zaten kırık.
- **14 menü dışı birincil sayfa var; 8'ine hiçbir yerden link verilmiyor (tam yetim)**, 4'üne yalnızca hub sayfalarından, 2'sine ise yalnızca dolaylı linklerden ulaşılıyor. Tam yetimler arasında doğum günü/VIP salonu, favoriler, anlamsal arama yapan "Veriye Sor", haftalık özet arşivi, konsey geçmişi ve klan savaşları gibi değerli özellikler bulunuyor.
- **Ölçülmüş kırık linkler ve sessizce bozulan derin linkler var.** İki iç link 404 veriyor. NextAuth'un `error`/`verify` sayfaları yok. 25 yerde var olmayan `/auth/signin` sayfasına yönlendirme yapılıyor. Global aramanın 5 sonuç türünden 4'ü filtre uygulanmamış bir sayfaya iniyor. Müşteri tarafında 5 farklı "İşletmeye git" butonu aynı genel listeye düşüyor, çünkü işletme detay sayfası hiç yok.
- **Aynı işi yapan sayfa kümeleri oluşmuş:**
  - müşteride 6 ayrı "kendi analizim" sayfası,
  - bayide 4 ayrı "özet/brifing" yüzeyi ve 4 ayrı "müşteri elde tutma" sayfası,
  - admin'de 5 AI sayfası ve 3 güven sayfası,
  - menü yönetimi için 4 ayrı ekran,
  - 5 adet "link listesi" (hub) sayfası.

Hedef olarak tek bir **navigasyon kaydı** (registry) öneriyorum: sidebar, görünürlük kataloğu, komut paleti, Qra bilgi tabanı ve testler bu kayıttan türetilir; menü sunucuda çözülür. Sayfalar da sadeleşir: admin 68 öğeden 11 grupta yaklaşık 46 öğeye, bayi 32'den 7 grupta 20'ye, müşteri 28'den 7 ana hedefe (ve mobil alt sekme çubuğuna) iner.

---

## 2. Mevcut Durum Haritası

### 2.1 Navigasyon motoru: parçalar ve veri akışı

```
app/{admin,dealer,customer}/layout.tsx  (RSC)
  └─ <Sidebar role=…>  components/dashboard/sidebar.tsx  ('use client')
       ├─ adminNavItems / dealerNavItems / customerNavItems   (kodda sabit diziler, :158 / :233 / :277)
       ├─ customerNavGroups / dealerNavGroups; admin: []       (:130-150)
       ├─ useEffect → GET /api/settings/sidebar-order   → settings.sidebarNavOrder      (DB, cache yok)
       ├─ useEffect → GET /api/settings/sidebar-groups  → settings.sidebarNavGroups     (DB, cache yok; admin=null)
       └─ useEffect → GET /api/settings/visibility      → 3× settings.findUnique         (DB, cache yok; admin hariç)
  └─ <DashboardHeader showSearch>  components/dashboard/header.tsx
       └─ Ctrl/⌘+K → GET /api/search  (yalnız veri: kullanıcı/geri bildirim/ürün/QR — sayfa araması yok)
```

Menüyü yöneten admin ekranları: `/admin/sidebar-order` (sıra), `/admin/menu-groups` (grup, yalnızca bayi ve müşteri), `/admin/settings` → "modules" sekmesi (menü/özellik/modül görünürlüğü; `settings-client.tsx` 2073 satır), `/admin/modules` (modül genel görünümü), `/admin/features` (FeatureFlag; bkz. B6).

### 2.2 Sayfaları elle listeleyen yerler (tek kaynak yok)

| # | Dosya | Ne listeliyor |
|---|---|---|
| 1 | `components/dashboard/sidebar.tsx:158-316` | Üç rolün menü öğeleri |
| 2 | `lib/visibility-controls.ts:42-104` | Bayi ve müşteri menü görünürlük kataloğu |
| 3 | `lib/module-controls.ts` (42 `detailHref`) | Modül → sayfa eşlemesi |
| 4 | `lib/qra-knowledge-base.ts:20-` | Qra sohbet botunun müşteri site haritası (19 yol) |
| 5 | `app/customer/discover/page.tsx:29-62` | Müşteri "Keşfet" hub'ı |
| 6 | `app/dealer/discover/page.tsx:40-75`, `app/dealer/growth-hub/page.tsx:10-17`, `app/dealer/experience-guide/page.tsx:16-21` | Bayi hub'ları |
| 7 | `app/admin/ecosystem/page.tsx:15-21` | Admin hub'ı |
| (+) | `components/onboarding/onboarding-sheet.tsx`, `messages/*.json › sidebarNav.*` | Onboarding linkleri, etiketler |

### 2.3 Menü ile sayfa envanterinin karşılaştırması (betikle ölçüldü)

- **Menüde olup sayfası olmayan link:** 0. Sidebar dizilerindeki 128 `href`'in tamamının bir `page.tsx` dosyası var.
- **Sayfası olup menüde olmayan rota:** 46. Bunların büyük kısmı meşru alt sayfa: 21 oyun, dinamik detay sayfaları, `create`, `templates` gibi. Gerçek yetimler aşağıda B3'te.

| Rol | Sayfa | Menü öğesi | Grup |
|---|---|---|---|
| Admin | 73 | 68 (düz) | 0 |
| Bayi | 43 | 32 | 4 (+3 grupsuz) |
| Müşteri | 58 (21'i oyun) | 28 | 6 (+4 grupsuz) |

---

## 3. Bulgular (önem sırasıyla)

### B1 — [YÜKSEK] Admin menüsü 68 düz öğe; grup desteği bilinçli olarak kapalı

**Kanıt**
- `components/dashboard/sidebar.tsx:146-150`: `NAV_GROUPS_BY_ROLE = { admin: [], … }`
- `sidebar.tsx:158-228`: 68 öğenin hiçbirinde `groupKey` yok.
- `sidebar.tsx:363-367`: "Admin menüsünde grup yok", grup override'ı admin için hiç çekilmiyor.
- `lib/sidebar-groups-settings.ts:14`: `SidebarGroupRole = 'dealer' | 'customer'`
- `app/api/settings/sidebar-groups/route.ts`: `roleToGroupRole` admin için `null` döndürüyor.
- `app/admin/menu-groups/page.tsx:22-25`: katalogda yalnızca bayi ve müşteri var.

**Sorun**
- Admin, en çok ekranı olan rol olmasına rağmen tek bir uzun liste görüyor. Aynı alana ait öğeler birbirinden kopuk duruyor: AI öğeleri 29-35. sıralarda, oyunlaştırma ayarları 8-10, 50-52 ve 56-58. sıralara dağılmış, güven öğeleri 19-20, 48-49 ve 61. sıralarda.
- Dar ekranda bu liste yaklaşık 3.000 px kaydırma demek.
- Aynı ikon tekrar tekrar kullanılıyor (B10). Bu yüzden daraltılmış modda öğeler birbirinden ayırt edilemiyor.

**Öneri**
- Admin'i grup sistemine dahil et:
  - `NAV_GROUPS_BY_ROLE.admin` için 11 grup tanımla (bkz. §4.3).
  - `SidebarGroupRole` tipini `'admin'` ile genişlet.
  - `/api/settings/sidebar-groups` ve `/admin/menu-groups` ekranını admin'e aç.
- Grup başlığı render mantığı zaten rolden bağımsız (`navBlocks`, `sidebar.tsx:464-504`). Bu nedenle değişiklik veri düzeyinde kalır.
- Admin için "son kullanılanlar" (5 öğe, kullanıcı başına `localStorage`) ve sabitlenmiş favoriler bloğunu menünün en üstüne ekle. 68 öğeli bir yüzeyde asıl hız kazancı buradan gelir.

**Efor:** M

---

### B2 — [YÜKSEK] Menü tanımı 7 ayrı listeye dağılmış; katalog ile sidebar birbirinden kopmuş; koruma testi kırık

**Kanıt (betikle ölçüldü)**

Sidebar'da olup görünürlük kataloğunda olmayan öğeler (`lib/visibility-controls.ts:42-104`). Admin bu öğeleri gizleyemiyor:
- Bayi: `billing`, `customers`, `onboarding`
- Müşteri: `category_leaderboard`, `games_hub`, `my_year`, `referral`, `team`

Katalogda olup sidebar'da olmayan "hayalet" anahtarlar. Bunları açıp kapatmanın hiçbir etkisi yok:
- Bayi: `action_items`, `discover`, `operations_brief`
- Müşteri: `discover`, `experiences`, `scan`

Diğer kanıtlar:
- `__tests__/menu-visibility-catalog.test.ts:46-66` "katalogdaki her anahtar sidebar'da olmalı" diye doğruluyor. Hayalet anahtarlar yüzünden bu test şu an başarısız. Önceden kırık olduğu biliniyordu; kırıklığın nedeni bu kopma. `package.json:15`'teki `verify:menu` bu yüzden koruma işlevi görmüyor.
- `lib/visibility-controls.ts:4-8` ve `docs/admin-menu-visibility.md`, yeni menü öğesi eklerken 4 dosyanın elle güncellenmesini istiyor. Kopmanın yapısal nedeni bu.
- `lib/qra-knowledge-base.ts`: Qra botu 19 müşteri yolu biliyor. Menüdeki `games`, `event`, `referral`, `trends`, `ai-insights`, `journey-score`, `progress-hub`, `my-year`, `campaigns`, `category-leaderboard` yollarından haberi yok. Oysa sidebar yorumu (`sidebar.tsx:274-276`) "Keşfet → chat bot" kararını belgeliyor; yani botun Keşfet'in yerini alması bekleniyordu.

**Sorun**
- Admin'in menüyü yönetme sözü (görünürlük ekranı) 8 öğede tutulmuyor, 6 düğme ise hiçbir şey yapmıyor.
- Sohbet botu kullanıcıyı menünün üçte birine yönlendiremiyor.
- Her yeni sayfa bu kopmayı büyütüyor.

**Öneri**
- Tek bir navigasyon kaydı oluştur: `lib/navigation/registry.ts` (§4.1). Sidebar dizileri, `*_MENU_CATALOG`, Qra site haritası, hub sayfaları ve komut paleti bu kayıttan **türetilsin**.
- `verify:menu` testini kayıt ile dosya sistemi arasında iki yönlü kontrole çevir:
  - her `page.tsx` kayıtta ya birincil, ya alt sayfa, ya da açıkça gizli/emekli olarak bulunmalı;
  - kayıttaki her `href`'in bir `page.tsx` dosyası olmalı;
  - her `labelKey` iki dilde de bulunmalı.
- Testi CI'da zorunlu yap.
- DB'deki eski `menuVisibility` anahtarları için bir göç tablosu (eski anahtar → yeni anahtar) tut.

**Efor:** M

---

### B3 — [YÜKSEK] 14 menü dışı sayfa (8 tam yetim); aralarında puan ve sadakat değeri taşıyan özellikler var

Aşağıdaki sayfaların hiçbiri menüde yok. "Gelen link" sütunu, iç link taramasında (`app`, `components`, `lib`) bulunan statik linkleri gösteriyor. "Yok" yazanlar tam yetim; diğerlerine yalnızca hub sayfasından ya da dolaylı bir linkten ulaşılıyor.

| Sayfa | Ne yapıyor | Gelen link | Değerlendirme |
|---|---|---|---|
| `/customer/lounge` | VIP kademe ve **doğum günü bonusu** talep etme (`app/customer/lounge/page.tsx:12-30`, `/api/birthday`) | Yok | Sadakat özelliği tamamen gömülü. Ödüller'e "VIP" sekmesi olarak taşı. |
| `/customer/favorites` | Favori işletmeler | Yok (dashboard'da yalnızca favori widget'ı var) | Keşfet'e "Favoriler" sekmesi olarak taşı. |
| `/customer/experiences` | Deneyim paylaşımı ve iyileştirme talebi | Yalnızca `/customer/discover` (o da yetim) | Ürün kararı gerekli: "Yorumlarım"a birleştir ya da emekliye ayır. |
| `/customer/discover` | Link hub'ı | Yok | Emekliye ayır, 301 yönlendir. |
| `/dealer/ask-analytics` | **Anlamsal arama (embedding) + topraklanmış LLM** ile "veriye sor" (`app/api/dealer/ask-analytics/route.ts:13-18`) | Yok | Sidebar yorumu (`sidebar.tsx:230-232`) "AI sohbete birleşir" diyor, ama birleştirme yapılmamış: `app/api/dealer/ai-chat/route.ts` içinde embedding veya semantic kullanımı yok. Platformun en güçlü AI yeteneği ulaşılamaz durumda. |
| `/dealer/weekly-brief` | Haftalık AI özet arşivi (`app/dealer/weekly-brief/page.tsx`; route yorumu: "önceden yalnızca yazılıyordu… panelde görünmüyordu") | Yok | Görünür kılmak için yazılan sayfa da görünmüyor. |
| `/dealer/action-items` | AI aksiyon motoru (öneri → sahip → takip) | 6 sayfadan link var (`copilot/page.tsx:155,432,457`, `benchmark/page.tsx:271,537`, `ai-insights-client.tsx:1835`) ama menüde yok | Çekirdek iş akışı yalnızca dolaylı yoldan erişilebilir. |
| `/dealer/operations-brief` | Operasyon özeti | Yalnızca hub'lardan (`growth-hub`, `discover`, `experience-guide`) | Bkz. B5 (kopya). |
| `/dealer/discover`, `/dealer/experience-guide` | Link hub'ı, rehber | Birbirlerinden ve `growth-hub`'dan | Emekliye ayır. |
| `/admin/agent-council/history`, `/admin/agent-council/agents` | Konsey geçmişi, ajan ağırlıkları | Yok (`app/admin/agent-council/page.tsx` içinde link yok; `layout.tsx` yalnızca `children` döndürüyor) | Konsey sayfasına sekme olarak ekle. |
| `/admin/squads/battles` | Klan savaşları yönetimi | Yok (`app/admin/squads/page.tsx` içinde "battles" geçmiyor) | Klanlar sayfasına sekme olarak ekle. |
| `/admin/modules/ai-tones` | AI üslup yönetimi | Yalnızca `app/admin/ai-settings/page.tsx:365` (düz `<a>`) | AI Ayarları'na sekme olarak ekle. |

Kabul edilebilir alt sayfalar: oyunlar (21'i de `lib/minigame-config.ts` kaydında, hub'dan erişilir), `/customer/scan` (6 CTA ve dashboard hızlı eylemi var; bkz. B12), `/customer/ekip/departmanlar` ve `/admin/ekip/departmanlar` (`components/team/team-board.tsx:698`), `/dealer/settings/auto-replies`, `/dealer/remedy-automation/templates`, survey ve campaign detayları.

**Öneri**
- Kayıtta her rotaya bir `status` alanı ver: `primary | secondary | child | hidden | deprecated`. Test, status'u olmayan sayfaya izin vermesin.
- Değer taşıyan yetimleri §4'teki hedef konumlara sekme olarak bağla.
- Hub'ları 301 yönlendirmesiyle emekliye ayır.
- Emekliye ayırmadan önce PostHog `$pageview` verisini kontrol et (`components/analytics/posthog-provider.tsx:41` SPA pageview gönderiyor). Böylece gerçek kullanım ölçülmüş olur.

**Efor:** M

---

### B4 — [YÜKSEK] Kırık linkler ve sessizce bozulan derin linkler

**a) 404 veren iç linkler (betikle bulundu, okunarak teyit edildi)**
- `app/dealer/ai-settings/page.tsx:542` → `/dealer/ai-learning` diye bir sayfa yok. Bayinin AI ayarlarındaki "Öğrenme" kartı 404'e gidiyor.
- `app/admin/squads/battles/page.tsx:253` → `` `/admin/squads/battles/${battle.id}` `` için dinamik sayfa yok (`app/admin/squads/battles/` altında yalnızca `page.tsx` var).

**b) Kimlik doğrulama akışında var olmayan sayfalar**
- `lib/auth.ts:66-67` NextAuth için `error: '/auth/error'` ve `verifyRequest: '/auth/verify'` tanımlıyor. `app/(auth)/auth/` altında bu iki sayfa yok (mevcut olanlar: complete, forgot-password, login, magic, register, reset-password, verify-email). `lib/auth.ts:42,49`'daki Google/GitHub OAuth hataları (ör. `OAuthAccountNotLinked`) kullanıcıyı 404'e düşürür.
- 25 dosyada `redirect('/auth/signin')` var: `app/admin/fraud-prevention/page.tsx:15`, `app/admin/insights/page.tsx:59` ve 21 oyun sayfası (`app/customer/games/*/page.tsx:12`). Bu sayfa yok; doğrusu `/auth/login`. Proxy oturumsuz isteği önce yakaladığı için pratikte nadiren tetiklenir, ama oturum geçersizken 404 üretir.

**c) Global arama sonuçları yanlış yere iniyor** (`app/api/search/route.ts`)

| Sonuç türü | Gidilen yer | Sorun |
|---|---|---|
| Ürün (admin) | `/admin/feedbacks?search=` (`:120-122`) | Ürün sonucu geri bildirim listesine iniyor. |
| QR (admin dahil) | Her zaman `/dealer/qr-codes?search=` (`:153`) | Admin için bu rota `proxy.ts:61-70` tarafından `/admin`'e yönlendiriliyor; admin aradığını bulamıyor. |
| Kullanıcı (admin) | `/admin/users?id=` (`:165`) | |
| Ürün (bayi) | `/dealer/products?search=` | |
| Ürün (müşteri) | `/customer/consumptions?search=` | |

Hedef sayfalardan `app/admin/users`, `app/dealer/products`, `app/customer/consumptions` ve `app/dealer/qr-codes` **hiç `searchParams` veya `useSearchParams` okumuyor** (grep ile doğrulandı). Yalnızca üç feedbacks sayfası `search` parametresini okuyor. Sonuç: arama sonucuna tıklayan kullanıcı filtrelenmemiş bir listeye iniyor.

**d) Müşterinin "İşletmeye git" linkleri boşa düşüyor**
- Şu 5 giriş noktası parametreyle `/customer/nearby`'ye link veriyor:
  - `components/customer/dashboard/customer-dashboard.tsx:851` ("Sayfasına Git")
  - `customer-dashboard.tsx:943` ("Ziyaret Et")
  - `components/customer/business-of-month-badge.tsx:49`
  - `components/customer/recommendations-section.tsx:64`
  - `app/customer/favorites/page.tsx:161` (`?dealerId=`)
- `app/customer/nearby/page.tsx` ne `focus` ne `dealerId` parametresini okuyor (`useSearchParams` yok). Kullanıcı vaat edilen işletme yerine genel listeye düşüyor.
- Daha temel sorun: müşteri bilgi mimarisinde **işletme detay sayfası hiç yok**. "Sayfasına git" etiketi, var olmayan bir varlık sayfasını vaat ediyor.

**Öneri**
- **a ve b:** Linkleri düzelt. `/auth/error` ve `/auth/verify` sayfalarını oluştur (hata kodunu Türkçe açıklayan ve girişe dönüş butonu olan sayfalar). `/auth/signin` için `next.config.js`'e kalıcı redirect ekle ve 25 çağrıyı `/auth/login`'e çevir.
- **c:** Arama sonuç tiplerini kayıttaki "varlık rotaları" ile eşle. Örneğin `entity: 'product', role: 'ADMIN'` için geçerli hedef yoksa sonucu hiç gösterme. Hedef sayfalarda URL'den state'e senkronizasyon ekle: `?search=` filtreyi doldursun, `?id=` ilgili satırın detay çekmecesini açsın. Bunu tek bir `useUrlFilterState()` hook'uyla standardize et.
- **d:** `/customer/places/[dealerId]` işletme detay sayfasını oluştur: profil, harita, aktif fırsatlar, favori butonu, son yorumlar ve "Telafi tekliflerim". Beş giriş noktasını buraya bağla. `nearby` içinde `?focus=` ile harita odağı ayrıca desteklenebilir.

**Efor:** a/b S · c M · d L

---

### B5 — [YÜKSEK] Aynı işi yapan sayfa kümeleri

Her küme için veri kaynağı okunarak doğrulandı.

**K1 — Müşteri: 6 ayrı "kendi analizim" sayfası (menüde 5'i "Analizler" grubunda, 1'i "Trend" grubunda)**

| Sayfa | API | Topladığı veri |
|---|---|---|
| `/customer/analytics` | `api/customer/analytics` (390 satır) | Tüketim aggregate/count, ConsumptionReview, rozet, streak, VIP |
| `/customer/progress-hub` | `api/customer/stats` (185) | Tüketim, ConsumptionReview, Feedback, rozet, görev |
| `/customer/spending-overview` | `api/customer/spending-overview` (120) | Tüketim aggregate/groupBy, ConsumptionReview |
| `/customer/my-year` | `api/customer/my-year` (131) | Tüketim, Feedback, rozet, streak, klan |
| `/customer/journey-score` | `api/customer/journey-score` (50) | **Yalnızca Feedback** |
| `/customer/ai-insights` | `api/customer/ai-insights` (200) | Feedback'lerin AI alanları |
| `/customer/trends` | `api/customer/trends` (341) | Feedback + ConsumptionReview birleşik |

Ek sorun, **metrik tutarsızlığı**: `app/api/customer/journey-score/route.ts:20-24` yalnızca `prisma.feedback` okuyor; trends ise iki yorum türünü birleştiriyor (`trends/route.ts:116`). Sadece tüketim yorumu yazan bir müşterinin "Yolculuk Skoru" 0 çıkarken trends sayfası aktivite gösterir.

**K2 — Bayi: 4 ayrı "özet/brifing" yüzeyi**
- `/dealer/copilot` (`copilot-summary/route.ts:1-4`: "haftalık özet + istatistik + günlük trend + next-best-actions")
- `/dealer/operations-brief` (`operations-brief` + `ai-proactive-analysis`: son 7 gün)
- `/dealer/weekly-brief` (DealerWeeklyBrief arşivi)
- `/dealer/innovation` içindeki haftalık özet bölümü (`app/dealer/innovation/page.tsx:46,75`)
- Ayrıca `/dealer/ai-insights` (2613 satır).

Bunların dördü de "son 7 günde ne oldu, ne yapmalıyım" sorusuna cevap veriyor.

**K3 — Bayi: 4 ayrı "müşteri elde tutma" sayfası, üç farklı gruba dağılmış**
- `/dealer/customers` (İşletme grubu)
- `/dealer/churn-risk` (Analitik grubu; Feedback.churnRisk)
- `/dealer/segment-actions` (Analitik grubu; CLV segmentleri)
- `/dealer/radar` (**Sistem** grubu; `app/dealer/radar/page.tsx:14` `DealerWinBackPage`: 30 gündür gelmeyen müşteriler)

Hepsi aynı sorunun farklı açılarını gösteriyor: hangi müşteriyi kaybediyorum ve ne yapmalıyım.

**K4 — Bayi: iki ayrı geri bildirim kutusu**
- `app/dealer/feedbacks/page.tsx:324-325` hem `/api/feedbacks` hem `/api/dealer/reviews` verisini çekip yanıtlatıyor.
- `app/dealer/reviews/page.tsx:68,137` `/api/dealer/reviews` listesini aynı reply endpoint'iyle yanıtlatıyor; tek farkı AI yanıt önerisi (`:111`).

**K5 — Bayi: iki ayrı AI sohbet**
- `/dealer/ai-chat` ile yetim `/dealer/ask-analytics` (bkz. B3).

**K6 — Bayi: analitik parçaları**
- `/dealer/analytics`, `/dealer/heatmap` (Sistem grubunda; `/api/dealer/benchmark` verisini de çekiyor), `/dealer/benchmark`, `/dealer/roi`, `/dealer/business-outcomes`.
- `business-outcomes` (`route.ts:1-4`: "tekrar ziyaret, şikâyet düşüşü, gelir etkisi") ile `roi` aynı "etki" sorusunu yanıtlıyor.

**K7 — Admin: 5 AI sayfası ve 2 alt yüzey**
- `ai-dashboard` (`/api/ai/analyze?action=insights|usage_stats`)
- `ai-settings` (`/api/ai/analyze?action=get_settings|update_settings`); bu iki sayfa aynı endpoint ve aynı bootstrap eylemlerini kullanıyor.
- `ai-detailed` (`/api/ai/detailed`), `ai-learning`, `ai-quality`
- `modules/ai-tones` (yetim), `qra-chat-logs`, `agent-council` (+2 yetim alt sayfa)

**K8 — Admin: güven ve uyum**
- `trust-command` (`trust-overview/route.ts:25-56`: audit + suspiciousActivity + remedy onay kuyruğu), `fraud-prevention` (suspiciousActivity listesi) ve `audit` aynı veriyi üç ayrı yerde gösteriyor.
- `compliance` (`app/admin/compliance/page.tsx:82,121` KVKK taleplerini listeliyor ve işliyor) ile `privacy-requests` **aynı kuyruğu** iki yerde yönetiyor.

**K9 — Admin: diğer çift sayfalar**
- `/admin/innovation` (`page.tsx:57,102` segment önerilerini listeliyor ve onaylıyor) ile `/admin/innovation/segment-proposals` aynı akış. İkincisi menüde ayrı öğe ve `/admin/segments` ile de örtüşüyor.
- `seasonal-campaigns` ve `seasonal-concepts`.
- Oyunlaştırma ekonomisi 7 sayfaya dağılmış: `points-matrix`, `league-settings`, `gamification-settings`, `character-thresholds`, `character-test`, `economy-sim`, `ab-testing`.

**K10 — Menü yönetimi 4 ekranda**
- `/admin/sidebar-order`, `/admin/menu-groups`, `/admin/settings` → modules sekmesi (görünürlük), `/admin/modules`.
- Bir öğeyi "taşı, yeniden adlandır, gizle" işlemi üç ayrı ekran ve üç ayrı kaydet butonu gerektiriyor.

**K11 — 5 link listesi (hub) sayfası**
- `/customer/discover`, `/dealer/discover`, `/dealer/growth-hub`, `/dealer/experience-guide`, `/admin/ecosystem`.
- `growth-hub` menüde "Analitik" grubunun içinde duruyor ve **grubun diğer öğelerine** link veriyor (`growth-hub/page.tsx:10-17`). Grup başlığının yaptığı işi tekrarlıyor.
- Hub sayfaları menünün yetersiz kaldığının belirtisi. Çözüm daha çok hub değil; komut paleti ve iyi gruplama.

**Öneri:** Kümeleri sekmeli tek sayfalara dönüştür (§4). Uygulama deseni:
- Paylaşılan bir `<SectionTabs>` bileşeni, sekme durumunu URL'de tutar (`?tab=`), böylece derin link ve geri tuşu çalışır.
- Her sekme mevcut sayfanın client bileşenini lazy (`next/dynamic`) yükler. Bu, mevcut "code-split" desenine uyar.
- Eski URL'ler `next.config.js` içinde `redirects()` ile `…?tab=x`'e 301 yönlendirilir.
- Metrik tutarlılığı için müşteri tarafında tek bir `lib/customer-metrics.ts` oluştur. "Yorum" tanımı Feedback + ConsumptionReview olsun; tüm "İçgörülerim" sekmeleri bu tanımı kullansın.

**Efor:** L (kümeler ayrı ayrı S-M, toplamda L)

---

### B6 — [ORTA] `/admin/features` ekranı hiçbir davranışı değiştirmiyor; dashboard ise onu öne çıkarıyor

**Kanıt**
- `app/api/admin/features/route.ts:43-158` `prisma.featureFlag` üzerinde CRUD yapıyor.
- Uygulamanın geri kalanında FeatureFlag yalnızca **sayılıyor**: `app/api/admin/modules/overview/route.ts:37`, `app/api/admin/tech-summary/route.ts:19-20`. Bir de inngest temizlik işi var. Hiçbir sayfa veya API bir bayrağın açık olup olmadığını okumuyor.
- Gerçek aç/kapa mekanizması ayrı bir yerde: `moduleControls` + `featureVisibility` (`lib/module-gate.ts`, `/admin/settings` modules sekmesi).
- `app/admin/admin-dashboard-client.tsx:569` "Özellik bayrakları — X açık / Y kapalı" kartını öne çıkarıyor.
- `/admin/tech/add` (`page.tsx:58,95,126`) özellik, webhook ve API anahtarı oluşturmayı ayrı sayfalarının kopyası olarak sunuyor.

**Sorun:** Admin'e iki ayrı "özellik kapat" yüzeyi sunuluyor ve bunlardan biri etkisiz. Bir olay sırasında yanlış düğmeye basılması ciddi bir risk.

**Öneri**
- İki seçenek var: (a) FeatureFlag'i kaldır ve tek "Modüller & görünürlük" ekranında birleştir; (b) FeatureFlag'i `lib/module-gate.ts`'e bağlayıp kademeli dağıtım (yüzde veya rol) için gerçekten kullan.
- Karar verilene kadar ekrana "bu bayraklar henüz çalışma zamanına bağlı değil" uyarısı koy ve dashboard kartını kaldır.
- `/admin/tech/add` sayfasını kaldırıp ilgili sayfalara yönlendir. Hedef sayfalarda oluşturma butonu olduğu doğrulanmadı; geçişte kontrol edilmeli.

**Efor:** S (uyarı ve kaldırma) / M (bağlama)

---

### B7 — [ORTA] Sidebar içeriği her render'da baştan kuruluyor; uzun menüde kaydırma konumu kayboluyor

**Kanıt**
- `components/dashboard/sidebar.tsx:508`: `const SidebarContent = ({ mobile }) => (…)` bileşeni `Sidebar` fonksiyonunun **içinde** tanımlanıyor.
- `:732` ve `:749` bunu `<SidebarContent />` olarak kullanıyor.

**Sorun**
- React her render'da yeni bir bileşen tipi gördüğü için `<nav className="overflow-y-auto">` alt ağacını unmount edip yeniden mount ediyor. Render'ı tetikleyen durumlar şunlar:
  - `pathname` değişimi (her menü tıklaması),
  - grup açıp kapama,
  - üç fetch'in her birinin dönüşü.
- Bunun sonucunda menü kaydırması en üste sıfırlanıyor. 68 öğeli admin menüsünde 50. öğeye tıklayan kullanıcı menünün başına atılıyor.
- Logo `Image` bileşenleri (`priority`) ve Avatar da her seferinde yeniden mount ediliyor.
- Bu bulgu React'ın tip kimliği kuralından kesin olarak çıkıyor, ancak tarayıcıda gözlenmedi.

**Öneri**
- `SidebarContent`'i modül düzeyinde ayrı bir bileşen yap ve gerekli değerleri prop olarak geçir: `navBlocks`, `isCollapsed`, `mobile`, `pathname`, `onNavigate`.
- Aktif öğe görünür alanda değilse `scrollIntoView({ block: 'nearest' })` ile görünür yap.

**Efor:** S

---

### B8 — [ORTA] Menü istemcide üç ağ isteğiyle çözülüyor: gizli öğeler kısa süre görünüyor, panel açılışı başına 5 önbelleksiz DB sorgusu yapılıyor

**Kanıt**
- `sidebar.tsx:327-330`: başlangıç durumları `menuVisibility = {}` ve `sidebarOrder = null`.
- `:444`: `menuVisibility[key] !== false` olduğu için ilk render'da **her şey görünür** ve kod sırasında.
- `:346-428`: üç `fetch` çağrısı `no-store` ile yapılıyor.
- `app/api/settings/visibility/route.ts:33-41`: 3× `settings.findUnique`.
- `app/api/settings/sidebar-order/route.ts:23` ve `sidebar-groups/route.ts`: 1'er sorgu.
- Hiçbirinde Redis veya `unstable_cache` yok. Oysa `lib/module-gate.ts` aynı ayarları 60 saniyelik `unstable_cache` ile okuyor.

**Sorun**
- Admin'in gizlediği öğe her panel açılışında bir an görünüp kayboluyor ve sıra yeniden düzenleniyor (layout kayması).
- Her bayi veya müşteri oturum açılışı Neon'a 5 ek sorgu gönderiyor.

**Öneri**
- Menüyü **sunucuda çöz.** `app/{role}/layout.tsx` (RSC) içinde `getResolvedNav(role, session)` çağrılsın. Bu fonksiyon:
  - kaydı ve tek bir `unstable_cache` ile etiketlenmiş ayar okumasını (`tag: 'nav-settings'`; admin kaydederken `revalidateTag`) birleştirir,
  - görünürlük, modül, sıra, grup ve teamOnly filtrelerini uygular,
  - serileştirilebilir bir `NavModel` döndürür (ikonlar string anahtar olarak).
- Client `Sidebar` yalnızca bu modeli render eder. Rozet sayısı (`notification-badges`) tek istisna olarak istemcide kalabilir.
- Böylece kayma ve istemci tarafı istekler ortadan kalkar; DB maliyeti çağrı başına değil, 60 saniyede bir olur.

**Efor:** M

---

### B9 — [ORTA] Gruplama mantıksız: "Sistem" grubu çöplüğe dönmüş, bazı öğeler yanlış grupta, adlandırma çakışıyor

**Kanıt**
- Bayi "Sistem" grubunda (`sidebar.tsx:261-269`) 9 öğe var: olaylar, AI sohbet, copilot, VoC duvarı, AI içgörüleri, **müşteri radarı**, **ısı haritası**, AI ayarları, faturalama. Bunların yalnızca ikisi (AI ayarları ve faturalama) gerçekten "sistem" işi.
- Bayi "Geri bildirimlerim" grubunda `consumptions` (tüketim kayıtları) var (`:258`). Bu bir satış verisi.
- Bayi grup etiketi "Geri bildirimlerim" (`messages/tr.json › sidebarNavGroups.dealer.feedback`) müşterinin sesiyle yazılmış; bayi açısından doğrusu "Müşteri geri bildirimleri".
- Müşteri tarafında "Kampanyalar & Davet" (`:298`) "Trend Analiz" grubunda duruyor. İçeriği ise mutlu saat fırsatları (`app/customer/campaigns/page.tsx` → `/api/happy-hour`).
- Müşteride iki liderlik tablosu var: "En İyi İşletmeler" (`category_leaderboard`, Trend grubu) ve "Liderlik" (kullanıcılar, QGameX grubu). Adlar benziyor, kavramlar farklı.
- Admin "Global Benchmarks" etiketi `/admin/insights` URL'ine gidiyor (`:173`). Sistemde "insights" adı üç farklı anlamda kullanılıyor: bayi ve müşteri `ai-insights` (AI duygu analizi), admin `insights` (sektör karşılaştırması).
- `team` anahtarı üç rolde üç farklı anlama geliyor: admin ve müşteride iç ekip modülü (`/admin/ekip`, `/customer/ekip`), bayide işletme personeli (`/dealer/team`).

**Öneri**
- Grupları kullanıcının "işi" (job-to-be-done) etrafında yeniden kur (§4.2).
- URL'leri anlamla hizala: `/admin/insights` → `/admin/benchmarks`, `/dealer/team` → `/dealer/staff`; eski URL'ler 301 ile yönlendirilsin.
- Kayıtta her öğeye `description` ve `keywords` alanı ekle. Bu alanlar komut paletinde ve tooltip'te kullanılır, adlandırma belirsizliğini azaltır.

**Efor:** S (taşıma) + M (URL yönlendirmeleri)

---

### B10 — [ORTA] Erişilebilirlik: daraltılmış menüde linklerin adı yok, aktif sayfa bildirilmiyor, ikonlar tekrarlanıyor

**Kanıt**
- `sidebar.tsx:600-634`: `showLabels=false` iken `<Link>` içinde yalnızca `<item.icon>` var. `aria-label`, `title` ya da Tooltip yok. `:650`'deki yorum "ikon tooltip" diyor ama tooltip uygulanmamış.
- Aktif link `aria-current="page"` almıyor.
- Çıkış butonunda (`:708-715`) `aria-label` yok.
- Tekrarlanan ikonlar (betikle sayıldı):
  - Admin'de 10 ikon tekrarlanıyor: `Activity`×3, `Shield`×3, `Users2`×3, `Eye`×2, `Heart`×2, `Layers`×2, `LayoutTemplate`×2, `Share2`×2, `SlidersHorizontal`×2, `Trophy`×2.
  - Bayide 5, müşteride 4 tekrar var.

**Sorun:** Daraltılmış modda ekran okuyucu her linki adsız okuyor. Görsel olarak da aynı ikonlu öğeler ayırt edilemiyor.

**Öneri**
- Daraltılmış modda shadcn `Tooltip` kullan ve `aria-label={item.label}` ekle.
- Aktif öğeye `aria-current="page"` ver.
- Çıkış butonuna etiket ekle.
- Kayıtta ikon benzersizliğini grup içinde test et.

**Efor:** S

---

### B11 — [ORTA] Görünürlük ile erişim aynı şey değil: menüden gizlenen sayfa URL'den açılıyor

**Kanıt**
- Sidebar filtresi yalnızca render düzeyinde (`sidebar.tsx:438-456`).
- `lib/module-gate.ts` yalnızca API route'larında kullanılıyor (grep: ~24 route). `app/**/page.tsx` veya `layout.tsx` içinde kullanımı yok; tek istisna `app/(public)/page.tsx`.
- Rol dışında sayfa düzeyinde bir guard yok (`proxy.ts:50-73` yalnızca rol önekini kontrol ediyor).

**Sorun**
- Admin bir modülü müşteriden gizlediğinde sayfa bookmark, bildirim veya Qra yanıtı üzerinden açılmaya devam ediyor. Bazı modüllerde API 403 döndüğü için kullanıcı kırık bir sayfa görüyor; bazılarında ise API korunmadığı için sayfa tamamen çalışıyor.
- Modül gate'i olan API listesi ile menü öğeleri eşleştirilmediği için hangisinin hangisi olduğu tam doğrulanmadı.

**Öneri**
- Kayıtta her rotanın `moduleKey`'i olsun.
- Rol layout'unda (veya bir route segment `layout.tsx`'inde) `assertRouteVisible(routeId)` çağrısı yapılsın. Rota kapalıysa kullanıcıya "Bu özellik şu anda kullanılamıyor" boş durumunu (ana sayfaya dönüş butonuyla) göster; 404 gösterme.
- Proxy Edge'de çalıştığı ve Prisma kullanamadığı için kontrol RSC katmanında yapılmalı.

**Efor:** M

---

### B12 — [DÜŞÜK] Diğer bulgular

1. **Aktif durum hatası.** `sidebar.tsx:593-594` öneke göre eşleştiriyor; `/admin/innovation/segment-proposals` açıkken hem "İnovasyon" (`:181`) hem "Segment Önerileri" (`:182`) aktif görünüyor. Betikle taranan tüm menüde tek çakışma bu.
2. **Grup etiketi override'ı i18n'i eziyor.** `sidebar.tsx:471-472` ve `lib/sidebar-groups-settings.ts:17`'de override düz metin. Admin bir grup adını Türkçe değiştirince EN kullanıcı da Türkçe görüyor. Override `{ tr, en }` biçiminde tutulmalı.
3. **Sıra ve grup etkileşimi.** Grubun konumu, grubun "ilk öğesinin sırası" ile belirleniyor (`:464-466`). `/admin/sidebar-order` ekranı ise öğeleri düz liste olarak gösteriyor (`app/admin/sidebar-order/page.tsx:147`). Admin tek bir öğeyi sürükleyince bütün grup yer değiştirebiliyor ve ekran bunu önizlemiyor. Ayrıca sürükleme yalnızca HTML5 drag ile çalışıyor: klavye ve dokunmatik desteği yok (`:150-160`).
4. **Proxy'de ölü kod.** `proxy.ts:55`'teki `'/staff'` eşlemesi ve `:90-92`'deki "STAFF `/` → `/staff`" yönlendirmesi hiç çalışmıyor, çünkü `matcher` (`:124`) `/staff` ve `/` yollarını kapsamıyor. Personel koruması `app/staff/layout.tsx` içinde ayrıca yapıldığı için güvenlik açığı yok. Ancak personel kök adrese gelirse paneline yönlendirilmiyor.
5. **Müşteride mobil birincil eylem yok.** Müşteri panelinde (PWA) "QR tara" menüde bulunmuyor (`lib/visibility-controls.ts:82` katalogda var, sidebar'da yok). Mobilde menü sol alttaki yuvarlak bir butonla açılan bir çekmece (`sidebar.tsx:738-746`). Uygulamanın asıl döngüsü olan tara → puan kazan → yorum yap için kalıcı bir alt gezinme yok.
6. **Bayi onboarding'i hep görünür.** `/dealer/onboarding` tamamlansa bile menünün ikinci öğesi olarak kalıyor (`sidebar.tsx:236`; koşul yok).
7. **Statik doküman sayfaları operasyon menüsünde.** `/admin/design-language` ve `/admin/accessibility` API çağırmıyor, rehber içerik gösteriyor (`app/admin/accessibility/page.tsx:3-5` dış linkler). Günlük menüde yer kaplıyorlar.

---

## 4. Hedef Bilgi Mimarisi

### 4.1 Mimari: tek navigasyon kaydı ve sunucuda çözülen menü

```ts
// lib/navigation/registry.ts  (tek doğruluk kaynağı; client'a yalnız serileştirilebilir alanlar gider)
export type NavRoute = {
  id: string;                 // 'customer.insights' — kalıcı kimlik (DB order/visibility bunu tutar)
  role: 'admin' | 'dealer' | 'customer' | 'staff';
  href: string;               // '/customer/insights'
  labelKey: string;           // sidebarNav.customer.insights
  descriptionKey?: string;    // komut paleti + tooltip
  icon: IconName;             // string anahtar → client'ta ikon haritası
  group?: string;             // rol grubu
  parent?: string;            // sekme/alt sayfa ise üst rota id
  tab?: string;               // ?tab= değeri (birleştirilmiş sayfalar)
  status: 'primary' | 'secondary' | 'child' | 'hidden' | 'deprecated';
  moduleKey?: string;         // module-gate + görünürlük
  teamOnly?: boolean;
  keywords?: string[];        // TR+EN arama eş anlamlıları
  redirectFrom?: string[];    // eski URL'ler → next.config redirects üretimi
  entity?: 'user' | 'product' | 'qr' | 'feedback' | 'dealer'; // global arama hedefi
};
```

Bu kayıttan türetilecekler:
- sidebar `NavModel` (sunucuda filtrelenir; B8),
- `MENU_CATALOG_BY_ROLE` (B2),
- Qra bilgi tabanı site haritası (B2),
- komut paleti (B13),
- `next.config.js` yönlendirmeleri (`redirectFrom`),
- arama sonuç hedefleri (B4c),
- sayfa düzeyinde `assertRouteVisible` (B11),
- dosya sistemiyle iki yönlü kontrol yapan test (B3).

Menüyü yöneten dört ekran (K10) tek bir **`/admin/navigation`** ekranında birleşir. Bu ekranda rol sekmesi seçilir ve sol tarafta grup ağacı gösterilir: öğeler sürükle-bırak ve klavyeyle taşınır, satır içinde görünürlük anahtarı vardır, grup adları TR/EN olarak düzenlenir. Sağ tarafta seçilen rolün **canlı sidebar önizlemesi** görünür. Kaydetme tek bir `PUT /api/admin/settings/navigation` çağrısıyla yapılır, `revalidateTag('nav-settings')` tetiklenir ve audit log yazılır.

**B13 — Komut paleti (yeni):** Ctrl/⌘+K şu an yalnızca veri araması açıyor (`header.tsx:208-226`). Bunu shadcn `Command` (cmdk) tabanlı bir palete dönüştür:
- "Sayfalar" bölümü: kayıttan, rol ve görünürlüğe göre filtrelenmiş, `keywords` ile TR/EN eşleşmesi yapan.
- "Eylemler" bölümü: Kart tara, Yeni kampanya, Yeni anket gibi.
- "Veriler" bölümü: mevcut `/api/search` sonuçları.

Hub sayfalarının (K11) ihtiyacını bu palet karşılar. Ayrıca 68 öğeli admin menüsünde en hızlı gezinme yolu olur.

### 4.2 Bayi — hedef (32 menü öğesi → 7 grup / yaklaşık 20 öğe)

| Grup | Öğe (hedef) | Kaynak sayfalar |
|---|---|---|
| — | **Bugün** `/dealer` | dashboard + `copilot` (next-best-actions) + `operations-brief` + `weekly-brief` (sekme: Bugün · Haftalık özet · Arşiv) + `onboarding` (tamamlanana kadar kontrol listesi widget'ı) |
| — | **Aksiyonlar** `/dealer/action-items` | (menüye geri alınır; AI önerilerinin tek iniş noktası) |
| Geri Bildirim | Gelen kutusu | `feedbacks` + `reviews` (AI yanıt önerisi buraya taşınır) |
| | Telafi | `remedy-queue` · `remedy-automation` · `/templates` (sekmeler) |
| | Anketler | `surveys` (+create, results) |
| | VoC duvarı | `voc-wall` |
| | Olaylar | `incidents` |
| Müşteriler | Müşteriler | `customers` (Liste) · `churn-risk` + `radar` (sekme: **Risk & Geri kazan**) · `segment-actions` (sekme: Segmentler) |
| Büyüme | Kampanyalar | `campaigns` (+performance) |
| | İnovasyon | `innovation` (haftalık özet bölümü "Bugün"e taşınır) |
| Analitik | Performans | `analytics` · `heatmap` · `benchmark` (sekmeler) |
| | Etki & ROI | `roi` + `business-outcomes` |
| | AI içgörüleri | `ai-insights` |
| | AI asistan | `ai-chat` + `ask-analytics` (tek sohbet; RAG motoru `ask-analytics` endpoint'i) |
| İşletme | Kart tara | `scan` (ayrıca header'da kalıcı "Tara" butonu) |
| | Ürünler · QR kodlar · Tüketim kayıtları · Personel | `products`, `qr-codes`, `consumptions` (Geri Bildirim'den taşınır), `team` → `/dealer/staff` |
| — | **Ayarlar** | `settings` (+auto-replies) · `ai-settings` (sekme) · `billing` (sekme "Abonelik") |
| Emekli | — | `discover`, `growth-hub`, `experience-guide` → 301 `/dealer` |

### 4.3 Admin — hedef (68 düz öğe → 11 grup / yaklaşık 46 öğe)

| Grup | Öğeler (hedef) | Birleşen / taşınan |
|---|---|---|
| Genel Bakış | Kontrol paneli · Platform nabzı | `ecosystem` → dashboard kartı |
| Kullanıcılar & Bayiler | Kullanıcılar · Kartlar · Bayi sağlığı · Davet programı | `users` (`?id=` desteği), `cards`, `dealers-health`, `referrals` |
| Geri Bildirim & İletişim | Geri bildirimler · Gelen kutusu · Stajyer mailleri · Qra sohbet günlüğü | `qra-chat-logs` AI grubundan taşınır |
| Oyunlaştırma | Rozetler · Karakter rozeti (Eşikler · Test) · Görevler · Mini oyunlar · Klanlar (Klanlar · Savaşlar) | `character-thresholds` + `character-test`; `squads` + `squads/battles` (yetim) |
| Ödül & Ekonomi | Ödüller · Kuponlar · Sürpriz kutular · Avatar dükkânı · **Ekonomi ayarları** (Puan matrisi · Ligler · Genel · Simülasyon) | `points-matrix` + `league-settings` + `gamification-settings` + `economy-sim` |
| Kampanya & Keşif | Sezonsal kampanyalar (Kampanyalar · Konseptler) · Ritim stüdyosu · Keşif içerikleri · Bağışlar | `seasonal-concepts` → sekme; `discovery`, `experience-pulse`, `donations` |
| Büyüme & Analitik | Platform analitiği · Sektör karşılaştırma · Segmentler (Segmentler · Öneriler) · Deneyler (A/B) · Playbook'lar · İnovasyon | `insights` → `/admin/benchmarks`; `innovation/segment-proposals` → Segmentler sekmesi |
| AI | AI merkezi (Genel · Derin analiz) · Öğrenme · Kalite · Ajan konseyi (Çalıştır · Geçmiş · Ajanlar) · AI ayarları (Modüller · Üsluplar) | `ai-detailed` → sekme; `agent-council/history`, `/agents` (yetim) → sekme; `modules/ai-tones` → sekme |
| Güven & Uyum | Güven merkezi (Özet · Şüpheli aktivite) · KVKK & 5651 (Uyum · Talepler) · Denetim günlüğü | `fraud-prevention` → sekme; `privacy-requests` → sekme |
| Ticari & Site | Fiyatlandırma · Partnerler · Sayfalar · SEO · Temalar | `pricing`, `partners`, `pages`, `seo`, `themes` |
| Sistem & Geliştirici | Ayarlar · **Modüller & görünürlük** · **Navigasyon** · Gözlemlenebilirlik · Webhook'lar · API anahtarları · API kataloğu · Ekip · Yol haritası · Güvenlik kapısı · Rehberler (Tasarım dili · Erişilebilirlik) | `modules` + settings→modules sekmesi + `features` kararı (B6); `sidebar-order` + `menu-groups` → Navigasyon; `tech/add` kaldırılır; `design-language` + `accessibility` → "Rehberler" (secondary) |

Not: "Güvenlik kapısı" öğesi için mevcut kamuflaj kuralı (bkz. proje notu "admin gate") geçerli kalmalı. Etiket kayıtta nötr bir adla tutulmalı.

### 4.4 Müşteri — hedef (28 menü öğesi → 7 ana hedef + mobil alt sekme çubuğu)

Mobil alt sekme çubuğu (PWA, `lg:hidden`): **Ana sayfa · Keşfet · [TARA] (ortada, vurgulu) · Ödüller · Ben**. Masaüstünde aynı hedefler sidebar'ın üst düzeyi olur.

| Hedef | Sekmeler / alt sayfalar | Kaynak sayfalar |
|---|---|---|
| **Ana sayfa** `/customer` | Bugün akışı, hızlı eylemler | dashboard |
| **Tara** `/customer/scan` | — | `scan` (menüye birincil eylem olarak döner) |
| **Cüzdan** `/customer/wallet` | Kartım · Harcamalar (Liste · Özet) | `my-card`, `consumptions` (+`[id]`), `spending-overview` → "Özet" sekmesi |
| **Keşfet** `/customer/places` | Yakınımda · Favoriler · En iyi işletmeler · Fırsatlar · **İşletme detayı** `/customer/places/[dealerId]` (yeni) | `nearby`, `favorites` (yetim), `category-leaderboard`, `campaigns` (happy hour); `trends` içindeki öneriler bölümü; `discover` → 301 |
| **Ödüller** `/customer/rewards` | Ödüller · Mağaza · Sürpriz kutular · Görevler · Rozetler · Davet · Bağış · **VIP & Doğum günü** | `rewards`, `shop`, `surprise-boxes`, `quests`, `badges`, `referral`, `donations`, `lounge` (yetim) |
| **Oyun** `/customer/games` | Oyunlar (21 oyun) · Etkinlik · Klanlar · Liderlik | `games/*`, `event`, `squads`, `leaderboard` |
| **Ben** `/customer/me` | **İçgörülerim** (İlerleme · Analitik · Deneyim skoru · AI duygu · Yılım) · Yorumlarım (Yorumlar · Telafi teklifleri · yolculuk) · Ayarlar | `progress-hub`, `analytics`, `journey-score`, `ai-insights`, `my-year`, `trends` (kişisel bölümler) → tek sayfa; `feedbacks` (+journey), `remedy` (+`[offerId]`), `experiences` (karar: "Yorumlarım"a "Deneyim paylaş" eylemi ya da emekli); `settings` |
| **Ekip** (teamOnly) | Pano · Departmanlar | `ekip`, `ekip/departmanlar` |

### 4.5 Sayfa sayfa karar tablosu (toplam)

| Karar | Admin | Bayi | Müşteri |
|---|---|---|---|
| Bağımsız sayfa olarak kalır (menüde veya grup altında) | 54 | 21 | 20 (`experiences` karara bağlı, dahil) |
| Sekmeye dönüşür (URL 301 → `?tab=`) | 16 | 14 | 12 |
| Alt sayfa (değişmez) | 1 (`ekip/departmanlar`) | 5 (create, results, performance, templates, auto-replies) | 25 (21 oyun + 3 dinamik + `ekip/departmanlar`) |
| Emekli / kaldırılır | 2 (`tech/add`, `ecosystem` → dashboard kartı) | 3 hub | 1 hub (`discover`) |
| **Toplam** | **73** | **43** | **58** |
| Yeni sayfa | `/admin/navigation` | — | `/customer/places/[dealerId]`, `/customer/me` (İçgörülerim) |

Sekmeye dönüşenler:
- **Admin (16):** seasonal-concepts, fraud-prevention, privacy-requests, innovation/segment-proposals, ai-detailed, modules/ai-tones, agent-council/history, agent-council/agents, squads/battles, character-test, league-settings, gamification-settings, economy-sim, sidebar-order, menu-groups, features.
- **Bayi (14):** copilot, operations-brief, weekly-brief, reviews, remedy-automation, radar, churn-risk, segment-actions, heatmap, benchmark, business-outcomes, ask-analytics, ai-settings, billing.
- **Müşteri (12):** progress-hub, analytics, journey-score, ai-insights, my-year, trends, spending-overview, favorites, category-leaderboard, campaigns, lounge, remedy.

Sayılar §4.2-4.4 tablolarından türetildi. Kesinleşmeleri için önce PostHog kullanım verisine bakılmalı.

---

## 5. Adım Adım Geçiş Planı

**Faz 0 — Hızlı düzeltmeler (1-2 gün, S).** Bilgi mimarisini değiştirmeden kullanıcıya görünen kırıklıkları kapatır.
1. `/dealer/ai-learning` linkini kaldır ya da `/dealer/ai-insights`'a yönlendir.
2. Klan savaşı "Detaylar" linkini kaldır ya da detay çekmecesine çevir.
3. `/auth/error` ve `/auth/verify` sayfalarını oluştur. `/auth/signin` → `/auth/login` için kalıcı redirect ekle ve 25 çağrıyı düzelt.
4. `SidebarContent` bileşenini modül düzeyine taşı (B7).
5. Daraltılmış menüye Tooltip ve `aria-label` ekle; `aria-current`'i uygula (B10).
6. Önek eşleşmesindeki aktif durum hatasını düzelt: en uzun eşleşen `href` kazansın (B12.1).
7. Admin arama sonuçlarında QR ve ürün hedeflerini düzelt ya da gizle (B4c).
8. Yetim sayfaları en azından bir yerden bağla: `lounge` → Ödüller sayfasında kart, `favorites` → dashboard'daki favoriler widget'ında "Tümü", `weekly-brief` → copilot, `ask-analytics` → ai-chat'te "Veriye sor" modu, konsey alt sayfaları → konsey sayfası başlığı, `squads/battles` → klanlar sayfası.
9. `/admin/features` ekranına "çalışma zamanına bağlı değil" uyarısı koy.

**Faz 1 — Navigasyon kaydı ve koruma testi (3-4 gün, M).**
1. `lib/navigation/registry.ts` dosyasını oluştur. Mevcut üç diziyi ve iki kataloğu bire bir bu kayda taşı; davranış değişmesin.
2. `adminNavItems/dealerNavItems/customerNavItems` ile `*_MENU_CATALOG` dizilerini kayıttan türet. Hayalet anahtarları sil, eksik 8 anahtarı ekle.
3. `verify:menu` testini dosya sistemi ile kayıt arasında iki yönlü kontrol yapacak şekilde yeniden yaz; CI'da zorunlu yap.
4. Qra site haritasını kayıttan üret.

**Faz 2 — Sunucuda menü, admin grupları ve komut paleti (4-5 gün, M).**
1. `getResolvedNav()` fonksiyonunu RSC layout'a ekle; cache tag'i bağla. Üç istemci fetch'ini kaldır (B8).
2. Admin için 11 grubu tanımla; grup tipini ve API'yi admin'e aç (B1).
3. ⌘K komut paletini kur: sayfalar, eylemler ve veriler (B13).
4. `/admin/navigation` birleşik editörünü yap; eski iki ekranı 301 ile yönlendir (K10). Grup etiketlerini `{tr,en}` yap (B12.2).

**Faz 3 — Küme birleştirmeleri (2-3 hafta, L).** Her küme ayrı bir PR olarak çıkar. Her PR'da:
- `<SectionTabs>` ile sekmeli sayfa,
- kayıtta `redirectFrom`,
- `next.config.js`'te 301,
- PostHog'da eski ve yeni URL için pageview karşılaştırması.

Önerilen sıra (önce değer ve risk azaltma):
1. Admin Güven & Uyum: `fraud-prevention` → `trust-command`, `privacy-requests` → `compliance`. Aynı kuyruğun iki yerde işlenmesi riskini kaldırır.
2. Bayi Müşteriler: `radar` + `churn-risk` + `segment-actions` + `customers`.
3. Bayi Bugün: `copilot` + `operations-brief` + `weekly-brief` + onboarding widget'ı; `action-items` menüye girer.
4. Bayi Gelen kutusu (`feedbacks` + `reviews`) ve AI asistan (`ai-chat` + `ask-analytics`).
5. Müşteri İçgörülerim: 6 sayfa, ortak `lib/customer-metrics.ts` ile (K1 metrik tutarlılığı).
6. Admin AI, Oyunlaştırma/Ekonomi ve Kampanya kümeleri.
7. Hub sayfalarının emekliye ayrılması.

**Faz 4 — Müşteri mobil yapısı ve varlık sayfası (1-2 hafta, L).**
1. `/customer/places/[dealerId]` işletme detay sayfasını yap; 5 giriş noktasını bağla (B4d).
2. Mobil alt sekme çubuğunu ekle (Tara ortada); sol alttaki menü butonunu "Ben" sekmesine taşı.
3. Cüzdan, Keşfet, Ödüller ve Ben hedeflerine URL yönlendirmeleri ekle.

**Faz 5 — Erişim tutarlılığı ve izleme (3-4 gün, M).**
1. `assertRouteVisible(routeId)` ile sayfa düzeyinde modül ve görünürlük kontrolü; kapalı rotada "özellik kullanılamıyor" boş durumu (B11).
2. Arama hedef sayfalarına `useUrlFilterState()` ekle (`?search=`, `?id=`) (B4c).
3. PostHog'da "navigasyon kaynağı" özelliği ekle (sidebar / palet / alt çubuk / derin link). Yeni yapının benimsenmesi buradan ölçülür.

**Başarı ölçütleri**
- Admin'de hedef sayfaya ulaşma süresi: palet ve gruplar ile 3 saniyenin altına iner.
- Yetim sayfa sayısı 0 olur; test bunu garanti eder.
- Kırık iç link sayısı 0 olur; link taraması CI'a eklenir.
- Panel açılışında menü için istemcide 0 istek yapılır.
- Müşteri "İşletmeye git" tıklamalarının %100'ü doğru işletmeye iner.

---

## Uygulama sonrası durum

**Yeniden denetim tarihi:** 2026-10-11 · **Dal:** `feat/platform-overhaul`

**Yöntem:** Her bulgu şimdiki koda karşı yeniden ölçüldü:
- kayıt dökümü,
- canlı ve emekli koçanı ayrımıyla sayfa envanteri,
- iç bağlantı taraması,
- yönlendirmelerin etkin olup olmadığı.

Bu ölçümler betikle yapıldı; her şüpheli nokta ilgili dosya okunarak teyit edildi.

**Temel alınan altyapı (iki dalgadan):**
- `fc16832f`: tek navigasyon kaydı, sunucuda çözülen kabuk, mobil alt sekme ve ⌘K paleti.
- `2e6d708e`: Navigasyon Stüdyosu.
- Yüzey ajanlarının birleştirmeleri ve emekli koçanları.

Bu turun düzeltmeleri `197cbc51` ve `4d32ce1c` commit'lerinde.

### Önce / sonra (ölçülen)

| Ölçüt | 2026-10-08 | Şimdi |
|---|---|---|
| Menü tanımının elle tutulan kopyası | 7 liste | 1 kayıt (`lib/navigation/registry.ts`); sidebar, alt sekme, ⌘K, görünürlük kataloğu, yönlendirmeler ve **Qra site haritası** buradan türetilir |
| Admin menüsü | 68 düz öğe, 0 grup | 40 birincil öğe, 10 grup, ayrıca palet |
| Bayi menüsü | 32 öğe | 22 birincil + 3 alt öğe, 9 blok |
| Müşteri menüsü | 28 öğe | 6 birincil + 15 alt öğe; mobil alt sekme (Ana Sayfa · Keşfet · TARA · Oyna · Cüzdan) |
| Panel sayfaları, canlı / emekli koçanı | 73 / 43 / 58 canlı | admin 45/43 · bayi 29/30 · müşteri 23/44 · personel 1/1 |
| Kayıtta olmayan (yetim) sayfa | 14 (8'i tam yetim) | 0 (test zorunlu) |
| 404 veren iç bağlantı | 2 + 25 `/auth/signin` | 0 (CI'da tarama) |
| Emekli koçanına inen yeni kod bağlantısı | — | 0 (bu turda 41'i düzeltildi; CI'da tarama) |
| Panel açılışında menü için istemci isteği | 3 istek, 5 önbelleksiz sorgu | 0 (RSC'de tek sorgu, 5 dk önbellek, etiketle tazeleme) |
| `verify:menu` | Kırık, CI'da yok | 5 suite / 74 test; CI `lint` işinde zorunlu |

### Bulgu bulgu

**B1 — Admin menüsü 68 düz öğe, grup yok: KAPANDI**
- `NAV_GROUPS`, admin için 10 alan tanımlıyor: Genel Bakış, Müşteriler ve Bayiler, Ekonomi ve Oyun, Kampanyalar, Yapay Zekâ, Güven ve Uyum, Platform, İçerik ve Görünüm, Ekip ve İletişim, Sistem.
- `SidebarGroupRole` admin'i kapsıyor; Stüdyo admin gruplarını yönetiyor.
- Bu turda ⌘K'ya "Son kullanılanlar" eklendi (`components/dashboard/header.tsx`):
  - rol başına son 5 sayfa;
  - yalnız sorgu boşken görünür (`idleOnly`);
  - tarayıcıda tutulur, okuma/yazma try/catch içinde.
- Test: `navigation-shell` → "admin… 10 alan grup olarak gelir".

**B2 — 7 ayrı liste, katalog kopuk, koruma testi kırık: KAPANDI**

Kayıt tek kaynak; `MENU_CATALOG_BY_ROLE` kayıttan türetiliyor (iki yönlü test). Bu turda:
1. **Qra bilgi tabanı kayıttan türetiliyor.** Eski 19 yolun 14'ü emekli URL'ydi. Qra, "Çerçeve Dükkanı", "Sürpriz Kutularım", "Kupon Kullan" gibi artık var olmayan sekmeleri öneriyordu. Şimdi menü yolunu ("Cüzdan › Ödüller") ve `QRA_PURPOSE[id]` amaç metnini kullanıyor. İki yönlü test: `__tests__/lib/qra-knowledge-base.test.ts`.
2. **`verify:menu` 5 suite'e genişletildi** ve `.github/workflows/ci.yml` içinde zorunlu oldu.
3. **Bir dalga regresyonu yakalandı.** "Dosya sistemi ↔ kayıt" testi, kayıtta olmayan `/admin/account-security` sayfasını buldu. Sayfa kayda `child` olarak eklendi; palette "Hesap güvenliği" adıyla çıkıyor.
4. **`lib/module-controls.ts` içindeki 28 `detailHref` emekli URL gösteriyordu.** Hepsi kanonik yollara çevrildi; bağlantı taraması bunu koruyor.
5. **`docs/admin-menu-visibility.md` güncellendi.** Yeni menü öğesi için 4 dosyanın elle güncellenmesini isteyen liste kaldırıldı; yerine kayıt akışı yazıldı.

**B3 — 14 menü dışı sayfa (8 yetim): KAPANDI**

Yetimler bağlandı:

| Eski sayfa | Yeni yeri |
|---|---|
| Lounge | Cüzdan › Kartım (statü) |
| Favoriler | Keşfet › Kaydettiklerim |
| Experiences | Mekân detayı |
| Ask-analytics + ai-chat | `/dealer/assistant` |
| Weekly-brief | Bugün › Haftalık |
| Action-items | Gelen Kutusu › Bana atananlar |
| Konsey alt sayfaları, klan savaşları, AI üslupları | İlgili sayfada sekme |
| Hub sayfaları | Emekli |

- "Panel dizinindeki her page.tsx kayıtta" testi 4 rolde de geçiyor.
- Bu turda iki **dalga regresyonu** kapandı: personel menüsündeki "Saha bildirimi" ve admin menüsündeki "Girişimler" emekli koçanına iniyordu. Her tıklama bir yönlendirme turu yapıyor, öğe de hiç "aktif" görünmüyordu.
  - İkisi `deprecated` yapıldı; anahtar kelimeleri üst sayfaya taşındı.
  - Yeni test: "menü/palet rotası emekli koçanı değil".

**B4a — 404 veren iç bağlantılar: KAPANDI**
- `/dealer/ai-learning` ve `/admin/squads/battles/${id}` bağlantıları artık yok. Klan savaşı detayı `?battle=` ile açılan çekmecede.
- Kodun tamamında 404 veren panel/auth bağlantısı: **0**.
- `__tests__/architecture/nav-links.test.ts`, `app`/`components`/`lib` altındaki her tırnaklı ya da şablon yolu sayfa envanterine karşı çözüyor.

**B4b — `/auth/error`, `/auth/verify`, `/auth/signin`: KAPANDI**
- Üç sayfa da var.
- `/auth/signin`, `callbackUrl`'i güvenli hâle getirip `/auth/login`'e yönlendiriyor.
- Dalgalarla eklenen 8 sayfa hâlâ `/auth/signin`'e gönderiyordu (çift tur); hepsi `/auth/login`'e çevrildi.

**B4c — Global arama yanlış yere iniyor: KAPANDI (bu tur)**

Kök neden üç parçalıydı:
- hedefler sabit "liste + `?search=`" biçimindeydi;
- müşteri hedefleri `search` değil `q` parametresini okuyordu;
- admin ürün sonucu geri bildirim listesine, admin QR sonucu ise proxy'nin admin'e kapattığı `/dealer/qr-codes`'a gidiyordu.

Yeni `lib/navigation/search-targets.ts` her sonucu kendi kaydına indiriyor:

| Sonuç | İniş yeri |
|---|---|
| Kullanıcı | Kullanıcı 360 (`/admin/users/[id]`) |
| Geri bildirim (admin / bayi) | Gelen kutusu detay çekmecesi (`?id=qr:<id>` / `qr-<id>`) |
| Geri bildirim (müşteri) | Seslerim (`?id=fb-<id>`) |
| QR (admin) | Bayinin sağlık çekmecesi (`?dealer=`) |
| Ürün ve QR (bayi) | Bayinin katalog ve QR araması (`?q=`) |
| Ürün (müşteri) | Müşterinin o ürünü içeren ziyaretleri (`?tab=visits&q=`) |

- Rolün yüzeyi olmayan sonuç türü hiç sorgulanmıyor (ör. admin için ürün).
- Müşteri ürün araması yalnız müşterinin kendi tükettiği ürünleri döndürüyor. Önceden tüm platform kataloğu dönüyor, sonuç da boş bir listeye iniyordu.
- Test: `navigation-search-targets` (hedef canlı bir sayfa, koçan değil).

**B4d — "İşletmeye git" boşa düşüyor: KAPANDI**
- `/customer/places/[dealerId]` mekân detayı var.
- Ana sayfa, Ayın İşletmesi, öneriler, Seslerim, Tara, Yılım ve paylaşım kartları doğrudan buraya bağlanıyor.
- Eski `?focus=` ve `?dealerId=` adreslerini koçan mekân detayına çeviriyor.

**B5 — Aynı işi yapan sayfa kümeleri (K1–K11): KAPANDI**

Kümeler sekmeli tek yüzeylerde birleşti:
- Müşteri: Ben › İlerleme / Rozetler / Yılım / Seslerim; Cüzdan; Keşfet.
- Bayi: Bugün, Gelen Kutusu, Müşteriler, Analitik, Asistan, Otomasyon.
- Admin: Güven, KVKK, AI, Ekonomi, Kampanya Takvimi, Entegrasyonlar, Navigasyon.

K1 metrik tutarlılığı sağlandı: İlerleme, Yılım ve Seslerim sunucuları Feedback ile ConsumptionReview'ı birlikte okuyor. 95 eski URL'nin tamamında sayfa dosyası artık bir emekli koçanı.

Bu turda bir **kök hata** bulundu ve düzeltildi:
- `next.config` kenar yönlendirmesi "koçansa etkinleştir" kuralıyla çalışıyordu ve 22 eski URL'de koçanı eziyordu. Bu yüzden sekme ve parametre eşlemesi kayboluyordu:

  | Eski URL | Gitmesi gereken | Gittiği yer |
  |---|---|---|
  | `/customer/favorites` | Kaydettiklerim | Yakınımda |
  | `/customer/campaigns` | Fırsatlar | Yakınımda |
  | `/dealer/weekly-brief` | Haftalık sekmesi | Sekmesiz sayfa |
  | `?dealerId=` | Mekân detayı | Liste |

- Ayrıca koçan sezgisi TypeScript jeneriğini (`Promise<Record<…>>`) JSX sanıyordu; bu yüzden 73 koçanı "canlı sayfa" sayıyordu.
- **Yeni kural:** kenar yönlendirmesi yalnız eski dosya **silinmişse** devreye girer. Koçan varsa eşlemeyi koçan yapar.
- Test: "yönlendirme kaynağı ve emekli rota sayfaları yalnız emekli koçanı". Birleştirilen bir yüzeyin canlı kopyası kalırsa test düşer.

**B6 — `/admin/features` etkisiz: KAPANDI**
- FeatureFlag artık modül kapısının kademeli açılış kuralı olarak kullanılıyor (`lib/admin-flags/rollout.server.ts` → `assertModuleEnabled`).
- `/admin/modules` ve `/admin/ab-testing`, "Özellik ve Deney" ekranında birleşti.
- `tech/add` emekli; `?type=` parametresi webhook ya da anahtar diyaloğunu açıyor.

**B7 — `SidebarContent` her render'da yeniden kuruluyor: KAPANDI**
- `SidebarContent` artık modül düzeyinde bir bileşen (`components/dashboard/sidebar.tsx`).
- Bu turda öneri tamamlandı: derin bir sayfaya doğrudan gelindiğinde etkin öğe `scrollIntoView({ block: 'nearest' })` ile görünür alana alınıyor.

**B8 — Menü istemcide 3 istekle çözülüyor: KAPANDI**
- Menü RSC'de `getShellConfig(role)` ile çözülüyor:
  - tek `findMany`;
  - `unstable_cache`, 300 sn;
  - `NAV_SETTINGS_TAG` ve modül kapısı etiketiyle tazeleme;
  - DB hatasında varsayılan menü.
- İstemcide yalnız bayi gelen kutusu sayaç rozeti kaldı.
- Bu turda artık çağıranı olmayan üç eski okuma ucu (`/api/settings/{sidebar-order,sidebar-groups,visibility}`) 410 ile emekli edildi.

**B9 — Gruplama ve adlandırma: KAPANDI**
- Bayi menüsü 9 iş bloğunda: Bugün · Gelen Kutusu · Müşteriler · Pazarlama · Analitik · AI Asistan · İşletme · Otomasyon · Ayarlar.
- Tüketimler İşletme'ye; radar ve churn Müşteriler'e taşındı.
- "insights" adının üç anlamda kullanılması bitti: `/admin/insights` → Analitik › Sektörler; bayide `analytics/insights`; müşteride ai-insights → Seslerim.
- Her rotada TR/EN etiket ve anahtar kelimeler var.
- `/dealer/team` URL'si bilinçli olarak korundu: etiketi "Ekip", İşletme bloğunda duruyor ve farklı bir rolün panelinde.

**B10 — Erişilebilirlik: KAPANDI**
- Daraltılmış menüde `aria-label` ve Tooltip var.
- Etkin öğede `aria-current="page"`, grup ve alt listelerde `aria-expanded` var.
- Çıkış düğmesinin etiketi var.
- Bu turda ikon tekilliği test edildi ve bir çakışma giderildi (müşteride Klan ile Ekip aynı `Users2` ikonunu kullanıyordu).
- Test: "menü öğelerinin ikonları tekil" (4 rol).

**B11 — Görünürlük ile erişim aynı değil: KAPANDI (bu tur)**
- Kabuk yapılandırması artık bir `gate` taşıyor:
  - rolün kayıttaki tüm desenleri açık ya da kapalı olarak işaretli;
  - yola en özgül eşleşen desen karar veriyor. Örneğin "Genel analitik" gizliyken, kendi anahtarı açık olan `/dealer/analytics/heatmap` açık kalıyor.
- Müşteri ve bayi kabuğu `<RouteGate>` ile sarıldı. Kapalı bir bölüm URL'den açılınca yarım çalışan ekran (API 403) yerine "Bu bölüm şu anda kullanılamıyor" durumu ve ana sayfa düğmesi gösteriliyor.
- Ana sayfa ve Ayarlar hiçbir ayarla kapatılamaz; hesap, abonelik ve KVKK erişimi her zaman açık kalır.
- Veri güvenliği API modül kapısında kalıyor; bu katman yalnız kullanıcıya tutarlı bir sonuç göstermek için var.
- Test: `navigation-shell` → "sayfa kapısı (B11)".

**B12 — Diğer bulgular: hepsi KAPANDI**
1. **Önek çakışması:** `matchActiveHref` en uzun öneki seçiyor; kök yalnız tam eşleşmede aktif (test var).
2. **Grup etiketi i18n'i eziyor:** Override `{tr,en}` biçiminde; eski düz metin de okunuyor (test var).
3. **Sıra/grup etkileşimi, klavye desteği yok:** Navigasyon Stüdyosu gerçek menü ağacını gösteriyor ve kabuğun kendi çözücüsüyle canlı önizleme yapıyor. Yukarı/aşağı düğmeleri ve grup seçimi klavyeyle çalışıyor; sürüm kilidi var.
4. **Proxy'de `/staff` ölü kodu:** Proxy artık `/staff` yolunu eşliyor; ölü kök yönlendirmesi kaldırıldı (`0ca4bb3e`).
5. **Müşteride mobil birincil eylem yok:** Alt sekme çubuğunun ortasında TARA var; ⌘K'da "QR okut" kısayolu var.
6. **Bayi onboarding'i hep görünür:** `/dealer/onboarding` emekli; kurulum kartı Bugün sayfasında.
7. **Statik doküman sayfaları menüde:** Tasarım dili, erişilebilirlik ve temalar "Tasarım Sistemi"nde birleşti.

**B13 — Komut paleti: KAPANDI**
- Palette üç bölüm var:
  - Kısayollar;
  - Sayfalar: kayıttan gelir; rol, görünürlük ve ekip süzgeçlerinden geçer; Türkçe aksandan bağımsız eşleşir;
  - Veriler.
- Bu turda "Son kullanılanlar" eklendi ve veri sonuçları artık kendi kaydına iniyor (bkz. B4c).

**Faz 5.3 — Navigasyon kaynağı ölçümü: KAPANDI (bu tur)**
- Yeni PostHog olayı: `nav_click` (`lib/navigation/track.ts`).
- Kaynaklar: sidebar, alt sekme, palet, son kullanılanlar, kısayol. Sidebar ve alt sekme tıklamaları `NavClickTracker` ile, yüzey bileşenlerine dokunmadan, yakalama aşamasında ölçülüyor.
- Olay rızaya bağlı; sorgu dizesi gönderilmiyor.

### Bu turda bulunan dalga regresyonları (hepsi kapandı)

1. **Kenar yönlendirmesi koçanı eziyordu.** 22 eski URL sekmesiz ya da bağlamsız bir hedefe iniyordu; koçan sezgisi de yanlıştı (bkz. B5).
2. **Menüde emekli koçanına inen öğeler vardı:** personel "Saha bildirimi" ve admin "Girişimler".
3. **`/admin/account-security` kayıtta yoktu;** bu yüzden `verify:menu` kırıktı.
4. **41 kod bağlantısı emekli koçanına gidiyordu** (her tıklamada ek bir tur):
   - 15 tüketim / geri bildirim / telafi derin bağlantısı (yeni `lib/navigation/deep-links.ts` ile düzeltildi);
   - 28 modül `detailHref`;
   - bayi churn bildirimindeki `ctaPath`;
   - segment kararı bildirimi;
   - keşif modül kapısı anahtarı.
5. **Qra yanlış yönlendiriyordu:** 14 emekli yol ve artık olmayan sekme adları öneriyordu.
6. **Global aramanın müşteri hedefleri parametreyi okumuyordu** (`search` gönderiliyor, `q` bekleniyordu).
7. **Çağıranı olmayan üç navigasyon ayarı okuma ucu açık duruyordu.**

### Kalan maddeler (sahibi bu boyutun dışında)

- **Bayi segment kampanya önerisi akışı sahipsiz.**
  - `POST /api/dealer/innovation/segment-proposals` ve `/[id]/send` uçlarını çağıran bir bayi ekranı yok.
  - Admin'deki Segmentler › Öneriler kuyruğu yalnız eski kayıtları onaylayabiliyor.
  - Onay bildirimi Teklifler sayfasına iniyor. Oradaki "taşındı" notu "Pazarlama › Kampanyalar" diyor, ama Kampanyalar bu taslakları göstermiyor.
  - Ürün kararı gerekiyor: akışı Kampanyalar'a bağlamak ya da emekliye ayırmak. Sahibi: bayi pazarlama yüzeyi.
- **Çağıranı olmayan eski müşteri uçları.**
  - Uçlar: `/api/customer/{analytics,stats,spending-overview,my-year,ai-insights,trends}` ve `/api/customer/redeem-coupon`.
  - Hiçbiri UI'dan çağrılmıyor. Kupon artık sürpriz kutuyla dağıtılıyor ve kasada gösteriliyor (`lib/admin-coupons/contract.ts`).
  - Navigasyonu etkilemiyorlar; emekliye ayırma kararı API yüzeyinin sahibinde (mimari-api).
- **Kenar yönlendirmesi şu an hiçbir eşlemede etkin değil.**
  - 95 eski URL'nin hepsinde koçan dosyası var, bu yüzden eski bağlantılar bir RSC turuyla yönlendiriliyor.
  - Bu bilinçli bir tercih: sekme ve parametre eşlemesi korunuyor.
  - Eski bağlantı trafiği bittiğinde koçanlar silinebilir; o zaman kenar 308'i kendiliğinden devreye girer. Trafiğin bittiğine karar vermek için PostHog `$pageview` verisi gerekiyor.
- **Bilinçli olarak yapılmayan küçük işler:**
  - `/dealer/team` → `/dealer/staff` URL değişikliği;
  - kullanıcı başına sabitlenmiş menü favorileri. "Son kullanılanlar" ve palet bu ihtiyacı karşılıyor.

### Yeni puan: **9.5 / 10**

**Neden yükseldi:**
- Raporun 13 bulgusunun tamamı ve geçiş planının beş fazı kapandı.
- Menü, alt sekme, palet, görünürlük kataloğu, yönlendirmeler ve Qra tek kayıttan türetiliyor.
- Menü sunucuda çözülüyor; görünürlük kararı sayfa düzeyinde de uygulanıyor.
- Kırılmaların geri gelmesini engelleyen korkuluklar CI'da:
  - kayıt ↔ dosya sistemi ve yetim sayfa;
  - 404 veren ya da emekli koçanına inen iç bağlantı;
  - birleştirilen bir yüzeyin canlı kopyası;
  - ikon tekilliği;
  - Qra ↔ kayıt;
  - arama iniş adresleri.

**Neden 10 değil:** Yarım puan, bu boyutun yetkisi dışında kalan iki sahipsiz akış için düşüldü: bayi segment önerisi akışı ve çağıranı olmayan eski müşteri uçları. İkisi de navigasyondan erişilemiyor; ürün ya da API kararı bekliyor.
