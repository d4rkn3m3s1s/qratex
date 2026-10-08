# /dealer/experience-guide

**Amaç:** Bayi paneli için statik bir "Deneyim rehberi". Üç sabit metin kartı (A: Tutarlı yerleşim, B: Operasyon önceliği, C: Ekip ve cihaz), bir "Günün sırası" notu ve dört kısayol linkinden (Büyüme merkezi, Keşfet, Operasyon özeti, İşletme ayarları) oluşuyor. Veri çekmiyor, API çağırmıyor, kullanıcıya göre değişmiyor.

**Genel puan: 2.5/10** · **Karar: KALDIR** (rota `/dealer`'a 301 ile yönlendirilsin; içindeki tek değerli fikir olan "vardiya rutini", aşağıda anlatıldığı gibi dashboard'a ve bağlama duyarlı bir yardım çekmecesine taşınsın)

> Kapsam notu: Sayfa tek dosya (`app/dealer/experience-guide/page.tsx`, 123 satır). Bağlı layout `app/dealer/layout.tsx`. İçe aktardığı bileşenler: `components/layout/dashboard-page-hero.tsx` → `components/admin/admin-premium-hero.tsx`, `lib/app-locale.tsx` (`useAppT`), `lib/utils` (`cn`). Metinler `messages/tr.json:2966-2994` ve `messages/en.json:2966-2994` içinde. **Hiçbir API ucu, server action, SWR/fetch çağrısı ya da Prisma modeli kullanılmıyor.** Bu nedenle IDOR, N+1, yarış koşulu gibi veri katmanı riskleri bu sayfa için yok. Tarayıcıda çalıştırılmadı (kural gereği dev server açılmadı). Görsel tespitler kod okunarak yapıldı ve gerektiğinde "doğrulanmadı" diye işaretlendi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Linkler çalışıyor ama sayfanın kendisine hiçbir yerden ulaşılamıyor. İçerik de eyleme dönük değil, kısmen yanlış (Keşfet'i birincil gezinme gibi anlatıyor, oysa Keşfet sidebar'da yok). |
| UX | 2/10 | "Rehber" adı veriliyor ama ne bir görev, ne bir arama, ne de bağlam sunuyor. Üç paragraf soyut tavsiye ve dört link'ten ibaret. Kullanıcının o andaki sorusuna cevap vermiyor. |
| Görsel | 5/10 | Ortak hero gramerine uyuyor ve amber vurgusu tutarlı. Ama aynı bilgi üç kez kodlanmış (A rozeti + ikon + "ADIM A"), birbiriyle yarışan iki dekoratif dikey çizgi var ve tıklanamayan kartlar hover'da tıklanabilir gibi davranıyor. |
| Mimari | 4/10 | Temiz ve küçük, ama tamamen statik bir içerik için `'use client'` + framer-motion kullanılıyor. Metadata layout'u yok (`layoutMetadata.dealerExperienceGuide` anahtarı tanımlı ama kullanılmıyor). Admin'in yönettiği içerik sistemi (`experience-pulse`) varken metin sabit kodlanmış. |
| Performans | 7/10 | Veri yok ve yük çok hafif. Ama RSC olabilecekken client bundle gönderiliyor, PWA da bu chunk'ı önbelleğe alıyor (`public/sw.js`). |
| Erişilebilirlik + Mobil | 5/10 | Başlık hiyerarşisi (h1 hero → h2 kartlar) doğru, dekoratif öğeler `aria-hidden`, MotionConfig `reducedMotion="user"` global. Ama sıralı adımlar `<ol>` değil, `div` ile kurulmuş. 10–11px mono etiketler var, iç linklerde dış-link ikonu (`ArrowUpRight`) kullanılıyor ve md+ ekranlarda taşan dekoratif çizgi olası fazladan kaydırma alanı yaratıyor (doğrulanmadı). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota erişimi / yetki (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-73` (`'/dealer': 'DEALER'`), `proxy.ts:124` matcher | Yalnızca DEALER rolü girebiliyor. Kart C'de anlatılan personel (STAFF) bu rehberi göremiyor (`/staff`'a yönlendiriliyor). |
| 2 | Sayfaya gezinme (giriş noktası) | EKSİK / BOZUK | `components/dashboard/sidebar.tsx:235-271` (listede yok), `app/dealer/discover/page.tsx:33` (`'experience_guide'` tipi tanımlı) ama `SECTIONS` (`:36-77`) içinde link yok; `grep "experience-guide"` uygulama kodunda (app/components/lib) 0 sonuç veriyor | **Tam yetim sayfa:** hiçbir sidebar öğesi, hub ya da link buraya çıkmıyor. Sistem denetimindeki "Keşfet'ten link var" tespiti (`docs/audit/2026-10-08/sistem/bilgi-mimarisi-navigasyon.md:153`) kodla uyuşmuyor: Keşfet'te yalnızca tip üyesi var, link yok. |
| 3 | Sekme başlığı / metadata | EKSİK | `app/dealer/experience-guide/` içinde `layout.tsx` yok; `messages/tr.json:11-12` `layoutMetadata.dealerExperienceGuide(+Description)` tanımlı ama hiçbir yerde okunmuyor. Örnek doğru kullanım: `app/dealer/discover/layout.tsx` | Tarayıcı sekmesinde yalnızca "Bayi paneli" yazıyor (`app/dealer/layout.tsx:13-22` varsayılan başlık). |
| 4 | Arka plan degrade katmanı (üst) | ÇALIŞIYOR | `page.tsx:35-38` | Dekoratif, `aria-hidden`. |
| 5 | Ortadaki dikey dekoratif çizgi (md+) | KISMİ | `page.tsx:39-42` (`left-1/2 top-32 h-[120%]`) | Tek sütunlu yerleşimin tam ortasından geçiyor ve hero ile kartların arkasında anlamsız kalıyor. Kapsayıcının %120'si yüksekliğinde ve `top-32` ofsetli olduğu için, `main` (`overflow-y-auto`, `app/dealer/layout.tsx:39`) içinde içerik bittikten sonra boş kaydırma alanı oluşturması olası (**doğrulanmadı**, tarayıcıda ölçülmedi). |
| 6 | Hero (eyebrow "Yardım", başlık, alt başlık, `Radio` ikonu) | ÇALIŞIYOR | `page.tsx:45-50`, `components/admin/admin-premium-hero.tsx:150-215` | Ortak gramer. Hero `useReducedMotion` ile animasyonu kesiyor (`admin-premium-hero.tsx:35,126,207`). Ama `Radio` (yayın) ikonu "rehber" anlamını taşımıyor. |
| 7 | Hero aside: "Günün sırası" notu | KISMİ | `page.tsx:51-60`, `messages/tr.json:2970-2971` | Metin ("Önce düzeni hatırla, sonra operasyonu kilitle…") soyut ve somut bir eyleme bağlanmıyor. 11px mono gövde metni okunmayı zorlaştırıyor. |
| 8 | Sol amber dikey "ray" (md+) | ÇALIŞIYOR | `page.tsx:64` | Dekoratif. #5'teki ortadaki çizgiyle görsel olarak yarışıyor. |
| 9 | Adım kartı A: "Tutarlı yerleşim" | SAHTE (içerik) | `page.tsx:66-102`, `messages/tr.json:2975-2977` | Kullanıcıya değil, geliştiriciye yönelik bir tasarım sistemi notu ("Üst kahraman ve kartlar … aynı grameri kullanır"). "Yeni sayfalar Keşfet ve Büyüme merkezinden açılır" iddiası da yanlış: Keşfet sidebar'da yok (`sidebar.tsx:235-271`). |
| 10 | Adım kartı B: "Operasyon önceliği" | KISMİ | `messages/tr.json:2979-2981` | "Geri bildirim gelen kutusu" adı geçiyor ama kart linksiz. Kısayol şeridinde de `/dealer/feedbacks` yok (`page.tsx:16-21`). |
| 11 | Adım kartı C: "Ekip ve cihaz" | KISMİ | `messages/tr.json:2983-2985` | "Personel ekranı" ve "mobil tarama" anılıyor ama `/dealer/team` ya da `/dealer/scan` linki yok. Oturum güvenliği tavsiyesi ürün içinde hiçbir ayara (aktif oturumlar, çıkış) bağlanmıyor. |
| 12 | Kart üçlü kodlama (A rozeti + ikon + "ADIM A") | KISMİ | `page.tsx:81-92` | Aynı bilgi üç kez tekrarlanıyor. Görsel gürültü. |
| 13 | Kart hover efekti (gölge + amber kenarlık) | BOZUK (affordance) | `page.tsx:77` (`hover:shadow-md hover:border-amber-500/30`) | Kart tıklanamıyor ama hover'da tıklanabilir gibi görünüyor. Yanıltıcı ipucu. |
| 14 | Kartların görünüme girince belirmesi (whileInView) | ÇALIŞIYOR | `page.tsx:23-28, 69-73` | Ölçülü (0.4s, kademeli 70ms, `once:true`). Global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) transform'u kapatıyor, opaklık kalıyor. Uygun. |
| 15 | Kısayol şeridi başlığı ("Kısayol şeridi") | ÇALIŞIYOR | `page.tsx:106` | Kullanıcıya iç jargon gibi geliyor. |
| 16 | Kısayol: Büyüme merkezi → `/dealer/growth-hub` | ÇALIŞIYOR | `page.tsx:17` | Hedef de bir link hub'ı (`app/dealer/growth-hub/page.tsx:10-17`), yani hub'dan hub'a gidiliyor. |
| 17 | Kısayol: Keşfet → `/dealer/discover` | ÇALIŞIYOR | `page.tsx:18` | Hedef sidebar'da olmayan bir link hub'ı. Bu rehbere geri link de vermiyor. |
| 18 | Kısayol: Operasyon özeti → `/dealer/operations-brief` | ÇALIŞIYOR | `page.tsx:19` | Hedef sidebar'da yok, yalnızca hub'lardan erişiliyor. |
| 19 | Kısayol: İşletme ayarları → `/dealer/settings` | ÇALIŞIYOR | `page.tsx:20` | EN'deki `linkSettings` "Venue settings" iken müşteri tarafındaki eşi "Accessibility & theme settings". Anlam farklı ama doğru. |
| 20 | Kısayol etiketlerinde `truncate` | KISMİ | `page.tsx:114` | Dar ekranlarda (`sm:grid-cols-2`) uzun etiketler açıklama ya da tooltip olmadan kesiliyor. |
| 21 | Kısayol ikonu `ArrowUpRight` | KISMİ | `page.tsx:115` | Bu ikon konvansiyonel olarak "dış bağlantı / yeni sekme" anlamına geliyor, oysa linkler iç gezinme. Diğer hub'lar `ChevronRight` kullanıyor (`app/dealer/discover/page.tsx:110`), yani tutarsız. |
| 22 | i18n (TR/EN) | ÇALIŞIYOR | `messages/tr.json:2966-2994`, `messages/en.json:2966-2994` | İki dil eksiksiz. `openAction` anahtarı (`tr.json:2993`) ölü, sayfada kullanılmıyor. |
| 23 | Yükleniyor / hata durumları | ÇALIŞIYOR (genel) | `app/dealer/loading.tsx`, `app/dealer/error.tsx` | Sayfa veri çekmediği için kendine özel bir durum gerekmiyor. Segment geneli devrede. |
| 24 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:73` (`md:ml-6`), `:107` (`sm:grid-cols-2 lg:grid-cols-4`) | Tek sütuna düzgün iniyor. Dekoratif çizgiler `md` altında gizli. |
| 25 | Klavye / odak | KISMİ | `page.tsx:109-116` | Linkler native `<Link>`, odaklanabiliyor. Ama özel `focus-visible` halkası yok, yalnızca tarayıcı varsayılanı var. Hover'da olan amber vurgunun odak karşılığı da yok. |
| 26 | Semantik yapı (sıralı adımlar) | EKSİK | `page.tsx:63-103` | "Adım A/B/C" sıralı bir süreç ama `<ol>/<li>` yerine `div` kullanılıyor. Ekran okuyucu sırayı ve toplam adım sayısını duyuramıyor. |
| 27 | Kişiselleştirme / ilerleme takibi | EKSİK | — | Hangi adımın bugün yapıldığı, kurulumun durumu ya da bekleyen iş sayısı gösterilmiyor. |
| 28 | Arama / SSS / destek iletişimi | EKSİK | — | Bir "rehber"den beklenen temel yardım öğelerinin hiçbiri yok. |
| 29 | Analitik (görüntülenme olayı) | EKSİK | — | Sayfanın kullanılıp kullanılmadığı ölçülmüyor. Kardeş `experience-pulse` uç noktası `analyticsEvent` yazıyor (`app/api/dealer/experience-pulse/route.ts:36-40`). |

**Sayım:** ÇALIŞIYOR 13 · KISMİ 9 · BOZUK 2 (#2 erişim, #13 affordance) · SAHTE 1 (#9, kullanıcıya hitap etmeyen/yanlış içerik) · EKSİK 5 (#3, #26, #27, #28, #29) → toplam 29 (not: #2 hem EKSİK hem BOZUK sayılabilir, sayımda BOZUK'a yazıldı).

---

## Bulgular

### 1. Sayfa tamamen yetim: hiçbir giriş noktası yok
- **Önem:** Yüksek · **Kategori:** Bilgi mimarisi / işlevsellik · **Efor:** S
- **Kanıt:** `components/dashboard/sidebar.tsx:235-271` (dealer menüsünde yok); `app/dealer/discover/page.tsx:33` (`'experience_guide'` yalnızca `DealerLabelKey` tipinde, `SECTIONS` `:36-77`'de link yok); `lib/visibility-controls.ts:42+` (`DEALER_MENU_CATALOG`'da yok); uygulama kodunda `experience-guide` geçen tek yer PWA önbellek listesi (`public/sw.js`).
- **Sorun:** Bir bayinin bu sayfayı bulmasının tek yolu URL'yi bilmesi. Sayfa üretimde yayında ve PWA tarafından önbelleğe alınıyor, ama işlevsel olarak ölü. Sistem denetimi raporundaki "Keşfet'ten link var" ifadesi de yanlış: yalnızca tip üyesi kalmış, link silinmiş.
- **Öneri:** Rehberi menüye eklemek doğru yol değil. Karar, sayfayı emekliye ayırmak olmalı: `next.config` `redirects()` ile `/dealer/experience-guide` → `/dealer` (301), `app/dealer/discover/page.tsx:33`'teki ölü tip üyesini ve `sidebarNav.dealer.experience_guide` / `layoutMetadata.dealerExperienceGuide*` / `dealerExperienceGuide.*` çeviri anahtarlarını temizlemek. Yardım ihtiyacı ise bulgu 3'teki bağlamsal yardım çekmecesiyle karşılanmalı.

### 2. İçerik kullanıcıya değil geliştiriciye hitap ediyor ve kısmen yanlış
- **Önem:** Yüksek · **Kategori:** İçerik / UX · **Efor:** S
- **Kanıt:** `messages/tr.json:2975-2977` ("Üst kahraman ve kartlar tüm modüllerde aynı grameri kullanır; yeni sayfalar Keşfet ve Büyüme merkezinden açılır."); `sidebar.tsx:235-271` (Keşfet sidebar'da yok, Büyüme merkezi `:247`'de var).
- **Sorun:** Kart A bir tasarım sistemi notu. Restoran sahibi için "kahraman", "gramer" anlamsız. "Yeni sayfalar Keşfet'ten açılır" yönlendirmesi de kullanıcıyı menüde olmayan bir hub'a gönderiyor. Kart B ve C eylem önerdiği halde (gelen kutusu, personel ekranı, çıkış yapma) bir linke ya da ayara bağlanmıyor. Yani rehber, söylediği şeyi yaptırmıyor.
- **Öneri:** Sayfa korunacaksa (önerilmiyor) her adım bir "yap" eylemine dönüşmeli: "Bekleyen 7 geri bildirimi aç" → `/dealer/feedbacks?status=open`, "2 personelin PIN'i yok" → `/dealer/team`, "Paylaşılan cihazlarda açık oturumlar" → `/dealer/settings#sessions`. Metin teknik jargon içermemeli. Tercihen içerik CMS'den gelmeli (bulgu 5).

### 3. "Rehber" vaadini karşılayan hiçbir yardım işlevi yok
- **Önem:** Orta · **Kategori:** Eksik özellik / UX · **Efor:** L
- **Kanıt:** `page.tsx:30-123`: yalnızca statik metin ve 4 link var. Arama, SSS, video, destek iletişimi ya da bağlama duyarlı ipucu yok.
- **Sorun:** Medallia, Toast ve Square gibi ürünler yardımı ayrı bir "rehber sayfası" olarak değil, kullanıcının o an bulunduğu ekrana gömülü sunuyor: "?" butonu → yan çekmece (ilgili makaleler + arama + destek), ilk kullanımda ürün turu, boş durumlarda öğretici ipuçları. Ayrı bir rehber sayfası kullanıcının görev akışını bölüyor ve zaten yetim olduğu için kimse görmüyor.
- **Öneri:** `components/help/help-drawer.tsx`: `DashboardHeader`'a bir "Yardım" (?) düğmesi eklenmeli. Bu düğme `usePathname()` ile o sayfanın yardım içeriğini (rota → makale eşlemesi, `lib/help-content.ts` ya da admin tarafından yönetilen `Settings` anahtarı) yan çekmecede açmalı. Çekmecede şunlar olmalı: (a) bu sayfada ne yapılır (3 madde), (b) sık sorulan 3 soru, (c) "Turu başlat" (mevcut `OnboardingSheet` altyapısıyla), (d) destek iletişimi (e-posta adresi metin olarak) ve (e) ⌘K komut paletine "yardım:" önekiyle arama. Bir `help_open` analitik olayı da eklenmeli.

### 4. Tıklanamayan kartlar hover'da tıklanabilir görünüyor; aynı bilgi üç kez kodlanmış
- **Önem:** Orta · **Kategori:** Görsel / affordance · **Efor:** S
- **Kanıt:** `page.tsx:77` (`hover:shadow-md hover:border-amber-500/30` bir `div` üzerinde), `page.tsx:82-91` (A rozeti + ikon kutusu + "ADIM A" etiketi).
- **Sorun:** Kullanıcı kartın üzerine gelince yükselme ve kenarlık vurgusu görüyor, tıklıyor, hiçbir şey olmuyor. Adım kimliği de üç ayrı öğede tekrarlandığı için asıl başlık (h2) görsel olarak ikinci plana itiliyor.
- **Öneri:** Kart ya bütünüyle bir eylem linki olmalı (`<Link>` + odak halkası + "Git" fiil etiketi, mevcut ama kullanılmayan `openAction` anahtarı burada anlamlı olurdu) ya da hover efekti kaldırılmalı. Kimlik tek bir numaralı rozete indirilmeli, ikon başlığın yanına alınmalı.

### 5. Admin'in yönettiği içerik altyapısı varken metin sabit kodlanmış; "Vardiya ritmi" ekranı ise kayıp
- **Önem:** Orta · **Kategori:** Mimari / sistem tutarlılığı · **Efor:** M
- **Kanıt:** `lib/experience-pulse-settings.ts:36-39` (`dealer: pulseFaceSchema`: başlık, alt başlık, rozet, avantaj maddeleri, CTA), `app/api/dealer/experience-pulse/route.ts:14-40` (DEALER için içerik döndürüyor, `analyticsEvent` yazıyor, `dealer_shift_pulse` modül kapısı var), `messages/tr.json:2570` (`shift_pulse: "Vardiya ritmi"`), `messages/tr.json` `adminExperiencePulse.subtitle` ("bayi Vardiya ritmi ekranlarında gösterilen içerik"). `grep "api/dealer/experience-pulse"` istemci tarafında **0 tüketici** buluyor.
- **Sorun:** Admin, `/admin/experience-pulse` stüdyosunda bayi "Vardiya ritmi" vitrinini düzenleyebiliyor, kaydı denetim günlüğüne düşüyor. Ama bu içeriği gösteren bir bayi ekranı yok. Aynı anda bu rehber "Günün sırası" adında, benzer amaçlı ama sabit kodlu bir içerik gösteriyor. İki yarım sistem birbirini tamamlamıyor.
- **Öneri:** Rehber kaldırılırken "Günün sırası / Vardiya ritmi" kavramı tek bir yerde toplanmalı: bayi dashboard'una (`app/dealer/dealer-dashboard-client.tsx`) `ShiftPulseCard` eklenmeli. Bu kart `/api/dealer/experience-pulse` içeriğini (admin yönetimli başlık + maddeler + CTA) gösterip altına kişiye özel canlı sayaçlar koymalı (bulgu 2'deki "bekleyen geri bildirim", "açık telafi", "bugünkü tarama"). `dealer_shift_pulse` modül kapısı zaten var, kart da ona bağlanmalı.

### 6. Statik içerik için gereksiz client bileşeni; metadata layout'u eksik
- **Önem:** Düşük · **Kategori:** Mimari / performans / SEO-UX · **Efor:** S
- **Kanıt:** `page.tsx:1` (`'use client'`), `page.tsx:4` (`m as Motion`); `messages/tr.json:11-12` (kullanılmayan metadata anahtarları); `app/dealer/discover/layout.tsx` (doğru desen); `public/sw.js` (chunk önbelleğe alınıyor).
- **Sorun:** Sayfada hiç state ya da etkileşim yok. Tek client gerekçesi `whileInView` belirme animasyonu. Sekme başlığı da "Bayi paneli" olarak kalıyor, sayfa adı görünmüyor.
- **Öneri:** Sayfa korunursa server component'e çevrilmeli (`getServerLocale()` + `t()`), animasyon yalnızca küçük bir client sarmalayıcıda kalmalı. `segmentLayoutMetadata('layoutMetadata.dealerExperienceGuide', …)` ile `layout.tsx` eklenmeli. Kaldırılırsa bu maddeye gerek kalmaz.

### 7. Dekoratif çizgiler: anlamsız ortadaki çizgi ve olası fazladan kaydırma
- **Önem:** Düşük · **Kategori:** Görsel / yerleşim · **Efor:** S
- **Kanıt:** `page.tsx:39-42` (`absolute left-1/2 top-32 h-[120%] … md:block`), `page.tsx:64` (sol ray), `app/dealer/layout.tsx:39` (`main` `overflow-y-auto`).
- **Sorun:** İki dikey çizgi (sol ray ve tam orta) birbiriyle yarışıyor. Ortadaki çizgi tek sütunlu içerikte hiçbir şeyi bölmüyor, yarı saydam kartların (`from-background/95`) arkasından sızıyor. Kapsayıcıdan `0.2·H + 128px` taşıdığı için kaydırma kapsayıcısında içerik sonrası boş alan üretmesi olası (**doğrulanmadı**, kod okumasıyla çıkarıldı).
- **Öneri:** Ortadaki çizgi kaldırılmalı. Sol ray, adımları bağlayan gerçek bir zaman çizelgesi düğümüne (numara noktası ↔ çizgi) dönüştürülmeli ya da o da kaldırılmalı. Dekor kapsayıcıya `overflow-hidden` ile sınırlanmalı.

### 8. Erişilebilirlik: sıralı adımlar liste değil, küçük mono metin, yanlış ikon semantiği
- **Önem:** Düşük · **Kategori:** Erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:63-103` (`div` dizisi), `page.tsx:53-57, 90, 106` (`text-[10px]`/`text-[11px]` mono, uppercase, geniş tracking), `page.tsx:115` (`ArrowUpRight`), `page.tsx:109-116` (özel `focus-visible` yok).
- **Sorun:** Ekran okuyucu "3 öğeli liste, 1." bilgisini veremiyor. 10px büyük harf mono metin düşük görmeli kullanıcılar için zor. Dış-link ikonu iç gezinmede yanlış beklenti yaratıyor. Hover'daki amber vurgunun klavye odağında karşılığı yok.
- **Öneri:** `<ol>` + `<li>` + `aria-label`; etiketler en az 12px; `ChevronRight` (diğer hub'larla tutarlı); `focus-visible:ring-2 ring-amber-500/50`.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Bağlama duyarlı yardım çekmecesi** (Square Dashboard "Help", Toast "Toast Central" yan paneli): bulunulan ekrana göre makale, arama ve destek.
2. **Kişiselleştirilmiş günlük kontrol listesi / açılış-kapanış rutini** (Toast "Shift review", Square "Setup guide" ilerleme çubuğu): canlı sayaçlarla "bugün yapılacaklar" ve tamamlandı işaretleme.
3. **Etkileşimli ürün turu / özellik keşfi** (Medallia, Qualtrics guided tours): yeni modüller için tek seferlik ipucu balonları ve yeniden başlatılabilir tur.
4. **Arama edilebilir bilgi bankası + SSS** (Google Business Profile Help, Yelp for Business Support): komut paletinden "yardım:" araması.
5. **Destek kanalı ve durum bilgisi:** destek e-postası/telefonu (metin olarak), sistem durumu, "geri bildirim gönder".
6. **"Yenilikler" (changelog) akışı:** yeni özellikleri bayiye duyuran, okundu takibi olan bir kanal (Square "What's new").

---

## Yeniden tasarım vizyonu

Hedef ayrı bir rehber sayfası değil, **yardımın panelin içine gömülmesi**. Önerilen üç parça:

**1. Dashboard'da "Vardiya ritmi" kartı** (`/dealer`, mevcut `/api/dealer/experience-pulse` + yeni hafif bir sayaç ucu)
- Yerleşim: dashboard'un üst bandında, KPI'ların yanında kompakt bir kart. Solda admin yönetimli başlık ve "günün notu", sağda 3–4 canlı satır: "Yanıt bekleyen geri bildirim: 7 → Aç", "Açık telafi: 2 → Aç", "Bugünkü tarama: 41", "Açık cihaz oturumu: 3 → Yönet".
- Veri/API: `GET /api/dealer/shift-pulse` (yeni). Mevcut sayımları (`Feedback` açık durum, telafi kuyruğu, bugünkü `Consumption`) tek sorguda toplayıp Upstash Redis'te 60 sn önbelleğe almalı ve oturumdaki `dealerId`'ye göre filtrelemeli (IDOR'a karşı istemciden kimlik almamalı). İçerik kısmı mevcut `experience-pulse` ucundan gelmeli. Modül kapısı: `dealer_shift_pulse`.
- Motion: sayaçlarda yalnızca değer değiştiğinde 150 ms'lik sayı geçişi ve tamamlanan satırda tek seferlik check animasyonu. Sürekli dönen ya da nefes alan efekt yok. 3B kullanılmamalı: bilgi yoğun bir operasyon kartında 3B dikkat dağıtır, değer katmaz.

**2. Bağlamsal yardım çekmecesi** (`DashboardHeader` → "?" düğmesi → sağdan `Sheet`)
- İçerik: rota → yardım makalesi eşlemesi (önce `lib/help-content.ts` içinde TR/EN statik, sonra admin yönetimli `Settings` anahtarı). Bölümler: "Bu ekranda", "Sık sorulanlar", "Turu başlat", "Destek".
- Motion: standart sheet kayması (200 ms). `reducedMotion` global olarak zaten kapsanıyor.
- Analitik: `help_open { route }` ve `help_article_click`. Hangi ekranların en çok yardım istediği, ürün kararlarına veri sağlar.

**3. Rota temizliği**
- `/dealer/experience-guide` → 301 `/dealer`. Ölü i18n anahtarları ve `discover/page.tsx:33`'teki tip üyesi silinmeli. PWA önbellek listesi bir sonraki build'de kendiliğinden temizlenir.

---

## Çakışmalar / birleştirme önerisi

| Çakışan sayfa | İlişki | Öneri |
|---|---|---|
| `/dealer/discover` | Kısayol hub'ı. Bu rehber de bir kısayol hub'ı (4 link) ve bunlardan biri Keşfet'in kendisi. İkisi de sidebar'da yok. | İkisi de emekliye ayrılmalı (sistem denetimiyle uyumlu: `docs/audit/2026-10-08/sistem/bilgi-mimarisi-navigasyon.md:153, 499`). |
| `/dealer/growth-hub` | Link hub'ı (`app/dealer/growth-hub/page.tsx:10-17`). Rehber oraya da link veriyor, yani hub'dan hub'a gezinme oluşuyor. | Rehberin bu linki kendi kaldırılmasıyla birlikte düşer. Growth hub'ın kaderi kendi raporunda değerlendirilmeli. |
| `/dealer/onboarding` | "Nasıl başlarım" rehberliğinin gerçek, veri destekli sürümü (adım tamamlama + ilerleme, `app/dealer/onboarding/page.tsx:25-40`). | Kurulum rehberliği orada kalmalı. Bu sayfanın "rehber" rolü onboarding ve yardım çekmecesi tarafından karşılanmalı. |
| `/admin/experience-pulse` + `/api/dealer/experience-pulse` | Bayi "Vardiya ritmi" içeriğini yönetiyor ama bayi tarafında gösteren ekran yok. Rehberin "Günün sırası" bölümü aynı amacı sabit metinle yapıyor. | "Günün sırası" bayi dashboard'undaki `ShiftPulseCard`'a taşınmalı ve admin içeriğine bağlanmalı (bulgu 5). |

**Son karar: KALDIR.** Sayfanın benzersiz bir işlevi yok, erişilemiyor ve içeriği kullanıcıya hitap etmiyor. Tek değerli fikri olan vardiya rutini, dashboard kartı ve bağlamsal yardım çekmecesi olarak yeniden doğmalı.
