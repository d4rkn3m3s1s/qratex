# /admin/roadmap

**Amaç:** Platform operatörüne ürünün hangi yönlerde (sütun/"pillar") neyin yayında, neyin devam ettiğini ve neyin planlandığını gösteren salt-okunur bir yol haritası. İçerik repodaki statik `lib/data/product-roadmap.json` dosyasından, ADMIN'e özel bir GET ucuyla okunuyor.

**Genel puan: 4.3 / 10** · **Karar: birleştir.** Sayfa ekip modülüne (`/admin/ekip`) "Yol haritası / Girişimler" görünümü olarak, veritabanı destekli biçimde yeniden kurulmalı. Bugünkü statik JSON listesinin tek başına yaşatılmasını önermiyorum.

> Kısaca: Kod temiz ve küçük (152 satır sayfa + 31 satır route), teknik olarak çalışıyor. Ürün olarak ise bir yol haritası değil. Bütün maddeler "yayında", 5 aydır güncellenmemiş, maddelerin üçte biri admin için kırık link, düzenlenemiyor ve "yakın plan" vaadi boş.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Veri yükleniyor ve gösteriliyor. Ancak 16 maddenin 16'sı `shipped`, hiç planlı madde yok, 6 link admin için kırık, düzenleme yok. |
| UX | 4/10 | Hata durumu boş durum gibi görünüyor. Kullanıcıya dosya yolu ve `in_progress` gibi ham anahtarlar gösteriliyor. Zaman ekseni, ilerleme ve filtre yok. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` ve kart dili tutarlı ve temiz. Ama rozet varyantları birbirinden zor ayırt ediliyor ve 3 sütunluk liste, yol haritası değil "link dizini" gibi okunuyor. |
| Mimari | 4/10 | Kaynak, deploy gerektiren bir JSON dosyası. Şema doğrulaması yok (`as` cast). Mevcut `CompanyTask`/`FeatureFlag` verisiyle hiçbir bağı yok. |
| Performans | 8/10 | Tek, küçük bir istek. Tek israf, locale değişiminde gereksiz yeniden fetch. Her istekte `readFileSync` maliyeti önemsiz. |
| Erişilebilirlik + Mobil | 6/10 | Grid mobilde tek sütuna iniyor, başlıklar `h3`, linkler klavyeyle erişilebilir. Yükleniyor durumunda `aria-live`/`role="status"` yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (rol=ADMIN + gizli kapı çerezi) | ÇALIŞIYOR | `proxy.ts:60-89` | `/admin/*` sayfası için rol ve gate kontrolü yapılıyor. |
| 2 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/admin/roadmap/layout.tsx:4-6`, `messages/tr.json:159-160` | |
| 3 | Sidebar ve "Hızlı erişim" girişi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:162`, `app/admin/admin-utils.ts:94` | |
| 4 | Hero: eyebrow, başlık, ikon | ÇALIŞIYOR | `app/admin/roadmap/page.tsx:70-76` | |
| 5 | Hero açıklaması | KISMİ | `page.tsx:73`, `messages/tr.json:2716` | Son kullanıcıya `lib/data/product-roadmap.json` yolu gösteriliyor. Ters tırnaklar markdown olarak işlenmeyip düz metin basılıyor. "Yakın plan" vaadi veriyle karşılanmıyor (#15). |
| 6 | "Güncelleme" tarih rozeti | KISMİ | `page.tsx:76-82`, `lib/data/product-roadmap.json:3` | Çalışıyor ama `2026-05-12` gösteriyor: bugünden (2026-10-08) yaklaşık 5 ay geride. Geçersiz bir tarih dizesi gelirse `Intl.DateTimeFormat.format(Invalid Date)` `RangeError` fırlatır ve sayfa çöker. |
| 7 | Veri yükleme (fetch + iptal koruması) | ÇALIŞIYOR | `page.tsx:35-64` | `cancelled` bayrağı unmount yarışını önlüyor. |
| 8 | Yükleniyor durumu | KISMİ | `page.tsx:85-89` | Görsel spinner var. `role="status"`/`aria-live` ve iskelet yok, bu yüzden yerleşim zıplıyor. |
| 9 | Hata durumu | BOZUK (yanıltıcı) | `page.tsx:42-46, 52-56, 90-91` | Hata alınınca yalnızca toast çıkıyor, `payload=null` oluyor ve ekranda **"Henüz sütun veya madde tanımlı değil"** yazıyor. Hata ile boş veri ayırt edilemiyor, "Tekrar dene" yok. API'nin döndürdüğü `error` mesajı da yok sayılıyor. |
| 10 | Boş durum | ÇALIŞIYOR | `page.tsx:90-91` | |
| 11 | Açıklama (hint) paragrafı | KISMİ | `page.tsx:94`, `messages/tr.json:2720` | TR metin ham İngilizce anahtarlar içeriyor ("shipped (yayında), in_progress …"). "Ürün direksiyonu" ifadesi çeviri artığı. |
| 12 | Sütun (pillar) kartları, `lg:grid-cols-3` | ÇALIŞIYOR | `page.tsx:95-131` | |
| 13 | Sütun ID'sinin mono yazıyla gösterimi | ÇALIŞIYOR | `page.tsx:100` | Operatör için anlamsız teknik gürültü (`ops_trust`). |
| 14 | Madde durum rozetleri (3 durum) | KISMİ | `page.tsx:14-18, 112-114` | Kod 3 durumu destekliyor ama veride yalnızca `shipped` var. `secondary` ile `outline` varyantları renk/ikonla ayrışmıyor. |
| 15 | "Yakın plan" ve planlı maddeler | SAHTE | `lib/data/product-roadmap.json` (16/16 madde `"status": "shipped"`) | Açıklama (`tr.json:2716`) "teslim durumu ve yakın plan" diyor ama tek bir `planned` veya `in_progress` madde yok. Sayfa yol haritası değil, "teslim edilenler listesi". |
| 16 | Admin içi madde linkleri (9 admin hedefi) | ÇALIŞIYOR | `product-roadmap.json:18,26,34,50,58,123,140,148,156` | Hedef dizinlerin hepsi mevcut (`app/admin/*`). |
| 17 | Müşteri/bayi paneline giden madde linkleri (6 adet) | BOZUK | `product-roadmap.json:75,83,91,99,107,115` + `proxy.ts:60-70` | `/customer/*` ve `/dealer/*` için proxy `token.role !== requiredRole` kontrolü yapıp ADMIN'i `/admin`'e yönlendiriyor. Tıklayan admin hiçbir uyarı görmeden kendi dashboard'una düşüyor. |
| 18 | Kendine link veren madde ("Ürün yol haritası") | KISMİ | `product-roadmap.json:36-43` | Sayfa kendini "yayındaki özellik" olarak listeliyor ve tıklanınca aynı sayfaya dönüyor. |
| 19 | Çapa (anchor) linkleri `#core-web-vitals`, `#rum-web-vitals` | ÇALIŞIYOR | `app/admin/observability/page.tsx:218, 282` | `scroll-mt-24` mevcut. |
| 20 | `/admin/settings?tab=auth` derin linki | ÇALIŞIYOR | `app/admin/settings/settings-client.tsx:173, 282` | |
| 21 | TR/EN madde etiketi | ÇALIŞIYOR | `page.tsx:66` | |
| 22 | Locale değişiminde yeniden fetch | KISMİ | `page.tsx:64`, `lib/app-locale.tsx:57-60` | `t` locale'e bağlı olarak yeniden oluşuyor ve effect yeniden çalışıyor. Payload zaten iki dilli olduğu için bu istek gereksiz. |
| 23 | Alt kısayollar (Platform nabzı, Özellik bayrakları) | ÇALIŞIYOR | `page.tsx:134-147` | Rastgele seçilmiş iki link. "Özellik bayrakları" sayfası maddelerle ilişkilendirilmemiş. |
| 24 | `GET /api/admin/product-roadmap` (ADMIN, no-store) | ÇALIŞIYOR | `app/api/admin/product-roadmap/route.ts:13-31` | |
| 25 | API'nin gizli kapı koruması | KISMİ (sistemik) | `proxy.ts:105-119` | `/api/*` istekleri `authMiddleware`'e hiç girmiyor. Gate çerezi yalnızca `/admin` sayfa yolunda kontrol ediliyor, API yalnızca rol kontrolüne (`requireAuth`) dayanıyor. Bu sayfaya özgü değil; veri hassas olmadığı için burada etkisi düşük. |
| 26 | API hata mesajının kullanıcıya iletilmesi | KISMİ | `route.ts:23-28`, `page.tsx:42-43` | Route Türkçe ve açıklayıcı bir mesaj döndürüyor, istemci bunu atıp genel bir toast gösteriyor. EN kullanıcıya TR mesaj gidiyor (zaten gösterilmediği için şu an görünmüyor). |
| 27 | Payload şema doğrulaması | EKSİK | `route.ts:20` (`as ProductRoadmapPayload`), `lib/product-roadmap-types.ts` | Bozuk JSON durumu yakalanıyor, ama yanlış şekilli JSON (ör. `items` yok) `pillar.items.map` ile istemcide çöker. |
| 28 | Madde ekleme/düzenleme/durum değiştirme | EKSİK | Sayfada form/aksiyon yok, model yok | Her güncelleme için kod commit'i ve deploy gerekiyor. 5 aylık bayatlığın kök nedeni bu. |
| 29 | Filtre / arama / duruma göre gruplama | EKSİK | `page.tsx` | |
| 30 | Zaman ekseni, hedef tarih/çeyrek, sorumlu, ilerleme yüzdesi | EKSİK | `lib/product-roadmap-types.ts:5-9` | Tipte yalnızca `status/title/href` alanları var. |
| 31 | Changelog / "ne zaman yayınlandı" geçmişi | EKSİK | | |
| 32 | Dışa aktarım / paylaşılabilir görünüm | EKSİK | | Kardeş sayfa `/admin/api-catalog` JSON indirme sunuyor (`app/admin/api-catalog/page.tsx:66`), burada yok. |
| 33 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:95` (`grid gap-6 lg:grid-cols-3`), `:111` (`flex-wrap`) | |
| 34 | Klavye / ekran okuyucu erişilebilirliği | KISMİ | `page.tsx:85-89, 116-122` | Linkler odaklanabiliyor ama özel `focus-visible` halkası yok (yalnızca `hover:underline`). Yükleniyor durumu duyurulmuyor. `ArrowUpRight` ikonu `aria-hidden`, "aynı sekmede açılır" bilgisi açık. |
| 35 | Hareket / azaltılmış hareket | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:9, 35-42` | Hareket yalnızca hero'da var ve `useReducedMotion` gözetiliyor. Sayfa gövdesinde motion yok (yerinde). |

**Durum sayımı:** ÇALIŞIYOR 16 · KISMİ 10 · BOZUK 2 · SAHTE 1 · EKSİK 6 (toplam 35)

---

## Bulgular (önem sırasıyla)

### 1. Maddelerin üçte biri admin için kırık (proxy, müşteri/bayi paneline gitmeyi engelliyor)
- **Önem:** yüksek · **Kategori:** işlevsellik / bilgi mimarisi · **Efor:** S
- **Kanıt:** `lib/data/product-roadmap.json:75,83,91,99,107,115` (`/customer/spending-overview`, `/dealer/operations-brief`, `/customer/progress-hub`, `/dealer/growth-hub`, `/customer/discover`, `/dealer/discover`). `proxy.ts:60-70` rolü uymayanı kendi paneline yönlendiriyor: `ADMIN → '/admin'`.
- **Sorun:** "Müşteri ve bayi deneyimi" sütunundaki 7 maddenin 6'sı tıklanınca admini sessizce `/admin` dashboard'una atıyor. Kullanıcı ne olduğunu anlamıyor ve linkin bozuk olduğunu düşünüyor. Bu durum ana sütunlardan birini tümüyle işlevsiz bırakıyor.
- **Öneri:** Madde şemasına `panel: 'admin' | 'customer' | 'dealer'` ve `previewMode` alanları eklenmeli. Admin dışı hedefler için ya (a) link yerine "Müşteri paneli özelliği" etiketi ve ekran görüntüsü/açıklama gösterilmeli, ya da (b) varsa admin "kullanıcı olarak görüntüle" (impersonation/preview) akışına bağlanmalı. Kısa vadede bu maddelerde `href` render edilmemeli ve "Panel: Müşteri" rozeti gösterilmeli. Ayrıca bir CI testi, her `href`'in gerçek bir `app/**/page.tsx` dosyasına ve admin'in erişebileceği bir yola karşılık geldiğini doğrulamalı.

### 2. "Yol haritası" içerikte yok: 16/16 madde yayında, 5 aydır güncellenmemiş
- **Önem:** yüksek · **Kategori:** veri doğruluğu / ürün · **Efor:** M (içerik) / L (kalıcı çözüm)
- **Kanıt:** `lib/data/product-roadmap.json:3` (`"updated": "2026-05-12"`), bütün maddeler `"status": "shipped"`. Açıklama "teslim durumu ve yakın plan" diyor (`messages/tr.json:2716`). Git'te dosyanın son anlamlı değişikliği `d3f8550`/`18b7bb2`. Bu tarihten sonra yayına çıkan büyük işler (ekip modülü `/admin/ekip`, karakter rozeti, mini oyunlar, gelen kutusu `/admin/inbox`, stajyer e-postaları `/admin/intern-emails`, cron altyapısı) listede yok.
- **Sorun:** Operatör sayfaya güvenemez: "planlı" ve "devam eden" hiçbir şey yok, yayındakiler de eksik. Sayfa kendini de bir madde olarak listeliyor (`product-roadmap.json:36-43`), bu da içeriğin "doldurmak için" yazıldığını gösteriyor. Gerçek backlog başka yerlerde dağınık duruyor (`docs/BACKLOG-32-50.md`, `docs/YAPILACAKLAR-LISTESI.md`, `docs/TASK-LISTESI.md`, `docs/EXPERIMENT-BACKLOG.md`, `CompanyTask` kanbanı).
- **Öneri:** Asıl sorun kaynağın deploy gerektiren bir dosya olması. Bayatlık bu yapının kaçınılmaz sonucu. Yol haritası veritabanına taşınmalı (bkz. Yeniden tasarım vizyonu): `RoadmapInitiative` modeli + `CompanyTask` bağlantısı. Durum elle yazılmamalı; bağlı görevlerin `done` oranından türetilmeli. "Yayında" geçişi ise ilgili `FeatureFlag`'in açılmasıyla tetiklenebilir. Geçiş anında JSON tek seferlik seed olarak içeri alınmalı.

### 3. Hata durumu "boş" gibi görünüyor, kurtarma yolu yok
- **Önem:** orta · **Kategori:** UX / hata yönetimi · **Efor:** S
- **Kanıt:** `app/admin/roadmap/page.tsx:42-46, 52-56` hata halinde `setPayload(null)` yapıyor. `:90-91` `!payload?.pillars?.length` kontrolüyle boş durum metnini basıyor. `route.ts:23-28`'deki açıklayıcı `error` alanı okunmuyor.
- **Sorun:** 503/401/403 veya ağ hatası alındığında toast birkaç saniye görünüp kayboluyor, kalıcı ekranda "Henüz sütun veya madde tanımlı değil" yazıyor. Bu yanlış bir bilgi. Tekrar deneme butonu yok, oturum düşmüşse yeniden giriş yönlendirmesi de yok.
- **Öneri:** Durum makinesini açık hale getirmek gerekiyor: `status: 'loading' | 'error' | 'empty' | 'ready'`. Hata için ayrı bir `EmptyState` varyantı (ikon, sunucu mesajı, "Tekrar dene", 401'de "Yeniden giriş yap") kullanılmalı. Projede zaten kullanılan SWR/React Query desenine geçilirse `mutate()` ile yeniden deneme ve odaklanınca yeniden doğrulama hazır gelir.

### 4. Şema doğrulaması yok: bozuk veri istemciyi çökertebilir
- **Önem:** orta · **Kategori:** mimari / sağlamlık · **Efor:** S
- **Kanıt:** `app/api/admin/product-roadmap/route.ts:20` (`JSON.parse(raw) as ProductRoadmapPayload`). İstemci `page.tsx:47-51` yalnızca `json.pillars` varlığına bakıyor, `:103` `pillar.items.map` ve `:79` `df.format(new Date(payload.updated))`.
- **Sorun:** Elle düzenlenen bir JSON'da `items` unutulursa veya `updated: "Mayıs 2026"` yazılırsa istemci `TypeError`/`RangeError` ile çöker (sayfa `app/admin/error.tsx` sınırına düşer). Bilinmeyen bir `status` değeri `t('adminRoadmap.status.xyz')` ile ham anahtar basar.
- **Öneri:** `lib/product-roadmap-types.ts` tipleri bir Zod şemasından türetilmeli (`z.infer`). Route `safeParse` ile doğrulamalı ve hatada 500 + alan-düzeyi mesaj döndürmeli. JSON kalacaksa build öncesinde aynı şemayla doğrulayan bir test eklenmeli. Tarih alanı `z.string().date()` ile sınırlanmalı.

### 5. Kullanıcıya dönük metinde dil karışıklığı ve geliştirici sızıntısı
- **Önem:** orta · **Kategori:** UX / i18n · **Efor:** S
- **Kanıt:** `messages/tr.json:2716` (``İçerik `lib/data/product-roadmap.json` dosyasından okunur``, ters tırnaklar düz metin olarak render ediliyor: `admin-premium-hero.tsx:246`), `messages/tr.json:2720` ("shipped (yayında), in_progress (üzerinde çalışılıyor), planned (planlı)", "ürün direksiyonunu"), `page.tsx:100` (`ops_trust` gibi ham ID'ler).
- **Sorun:** Operatör paneli, iç dosya yollarını ve enum anahtarlarını arayüz metni olarak gösteriyor. Bu durum Stripe/Linear düzeyindeki "ürün" hissini bozuyor. Ayrıca rozetler zaten çevrilmiş etiket gösterdiği için açıklamadaki ham anahtarlar ile ekrandaki etiketler birbirini tutmuyor.
- **Öneri:** Açıklama "Ürünün yönleri, teslim durumu ve sıradaki işler" gibi bir metne çevrilmeli. Kaynak bilgisi (dosya veya DB) olacaksa küçük bir "Kaynak" tooltip'ine taşınmalı. Hint metni ham anahtar yerine görsel bir lejant (renkli nokta + çevrilmiş etiket) olmalı. Pillar ID'si yalnızca geliştirici modunda veya `title` attribute'unda kalmalı.

### 6. Durum rozetleri görsel olarak ayrışmıyor
- **Önem:** düşük · **Kategori:** görsel / erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:14-18` (`default` / `secondary` / `outline`), `:112`.
- **Sorun:** `secondary` ve `outline` varyantları birçok temada neredeyse aynı görünüyor. Durum yalnızca metinle ayrışıyor ve tarama hızı düşük. Veride şu an tek durum olduğu için bu sorun gizli kalıyor, ama planlı maddeler eklendiği anda ortaya çıkacak.
- **Öneri:** Durum başına semantik token (yeşil/tamamlandı, mavi/devam, nötr/planlı) + ikon (`CheckCircle2`, `CircleDashed`, `Circle`) kullanılmalı. Linear'daki gibi durum ikonu ve ilerleme halkası birleştirilebilir.

### 7. Locale değişiminde gereksiz yeniden istek
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `page.tsx:64` (`[t]` bağımlılığı), `lib/app-locale.tsx:59` (`useMemo(..., [locale])`).
- **Sorun:** Payload iki dilli (`{tr,en}`) olduğu için dil değişince veri değişmiyor, ama istek yeniden atılıyor. `loading` true'ya dönmediğinden görsel bir sorun yok, sadece israf.
- **Öneri:** Fetch effect'i `[]` bağımlılığıyla çalışmalı. Toast metni çağrı anında `tRef.current` ile alınabilir. Daha iyisi, SWR anahtarı `'/api/admin/product-roadmap'` ile kullanılmalı.

### 8. `/api/admin/*` uçları gizli kapı çerezini zorunlu tutmuyor (sistemik)
- **Önem:** düşük (bu sayfa için) / orta (sistem için) · **Kategori:** güvenlik · **Efor:** M (sistem çapında)
- **Kanıt:** `proxy.ts:105-119`. `/api/` yolları `authMiddleware`'e girmeden `NextResponse.next()` ile geçiyor. Gate kontrolü `proxy.ts:79` yalnızca `pathname.startsWith('/admin')` sayfa yolları için çalışıyor. `route.ts:14` yalnızca `requireAuth(['ADMIN'])` kullanıyor.
- **Sorun:** Admin gizli kapısının amacı "rolü yanlışlıkla ADMIN yapılan biri bile panele giremesin". API katmanında bu ikinci faktör yok: rolü ADMIN olan ama gate cevabını bilmeyen biri tüm `/api/admin/*` uçlarını doğrudan çağırabilir. Roadmap verisi hassas değil, ama aynı açık ekonomi/kullanıcı uçlarında da var (bu raporun kapsamı dışında, **doğrulanmadı**: tek tek uçların ek kontrol yapıp yapmadığına bakmadım).
- **Öneri:** `requireAuth(['ADMIN'])` içinde gate çerezinin `gateCookieBelongsTo` ile doğrulanması merkezileştirilmeli (Node runtime'da HMAC doğrulaması). Sonra tek bir yerden tüm admin API'leri korunur. Bu karar sistem genelinde verilmeli.

### 9. Erişilebilirlik ayrıntıları
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:85-89` (yükleniyor durumunda `role="status"` yok), `:116-118` (link için `focus-visible` stili yok), `:104-110` (madde kutusu `hover:bg-muted/25` alıyor ama tıklanabilir alan yalnızca metin linki).
- **Sorun:** Ekran okuyucu yüklenme ve hata durumlarını duyurmuyor. Hover tüm kutuyu vurguladığı halde kutunun tamamı tıklanabilir değil, bu da beklenti uyumsuzluğu yaratıyor.
- **Öneri:** Kutunun tamamı link yapılmalı (`<Link className="block …">`), `focus-visible:ring-2` eklenmeli, yükleniyor/hata kabına `role="status" aria-live="polite"` verilmeli. Grid'in maddeleri `ul/li` olarak işaretlenmeli ki ekran okuyucu "7 maddeden 3." diye okuyabilsin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Düzenlenebilir, veritabanı kaynaklı yol haritası.** Linear "Projects/Initiatives" ve Productboard'da durum, hedef tarih, sorumlu ve öncelik doğrudan arayüzden değiştiriliyor. Burada her değişiklik kod deploy'u gerektiriyor (`route.ts:18`).
2. **Zaman ekseni / Now-Next-Later görünümü ve ilerleme.** Linear'ın timeline görünümü, hedef çeyrek ve bağlı issue'lardan hesaplanan ilerleme yüzdesi. Mevcut tipte bu alanlar yok (`lib/product-roadmap-types.ts:5-9`).
3. **Görev ve özellik bayrağı bağlantısı.** Her girişim `CompanyTask` kayıtlarını (`prisma/schema.prisma:2860`) ve yayına çıkışı yöneten `FeatureFlag`'i (`prisma/schema.prisma:974`) göstermeli. PostHog'da feature flag ile rollout yüzdesi aynı kartta görünüyor.
4. **Etki ölçümü.** "Yayında" bir maddenin yanında kullanım/benimseme metriği (PostHog funnel, platform-pulse serisi) gösterilmeli. Bugün "yayında" demek yalnızca "kod var" anlamına geliyor.
5. **Changelog / sürüm notları.** Yayına çıkan maddelerin tarihli akışı ve isteğe bağlı olarak müşteri/bayi paneline "Yenilikler" duyurusu (Stripe changelog, Linear "Now" deseni).
6. **Filtre, arama, gruplama ve dışa aktarım.** Durum/panel/sütun filtresi, metin araması, CSV/Markdown dışa aktarım ve paylaşılabilir salt-okunur link.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya 5 saniyede cevap alabilmeli: *Şu an ne üzerinde çalışılıyor? Sırada ne var? Son yayına çıkanlar gerçekten kullanılıyor mu?* Sayfa elle bakımı yapılan bir vitrin olmamalı. Ekip modülündeki gerçek işin yukarıdan görünümü olmalı ve kendiliğinden güncel kalmalı.

**Yerleşim:**
- **Üst şerit (hero yerine kompakt başlık):** "Şimdi / Sırada / Sonra" sayaçları, son güncelleme zamanı ve kim güncelledi, "Girişim ekle" butonu. Görsel yük ilk ekranda sayıların ve listelerin üzerinde olmalı. Mevcut büyük hero bu sayfa türü için fazla yer kaplıyor.
- **Görünüm seçici (sekme):** `Pano` (Now / Next / Later kolonları, sürükle-bırak ile durum değişimi, ekip kanbanındaki mobil kanban deseni yeniden kullanılabilir) · `Zaman ekseni` (çeyrek bazlı yatay şerit, hedef tarih ve gecikme işareti) · `Yayınlananlar` (tarihli changelog akışı).
- **Girişim kartı:** başlık (TR/EN), sütun/tema etiketi, panel rozeti (Admin/Müşteri/Bayi), sorumlu avatarı, hedef çeyrek, bağlı görevlerden hesaplanan ilerleme halkası, bağlı `FeatureFlag` durumu (kapalı / %x rollout / açık), yayındaysa son 7 gün benimseme mini sparkline'ı.
- **Sağ çekmece (Sheet) detay:** açıklama, bağlı görev listesi (`/admin/ekip`'e derin link), karar notları, değişiklik geçmişi (`TaskActivity` deseniyle).
- **Filtre çubuğu:** durum, tema, panel, sorumlu, metin araması. Seçimler URL query'sine yazılmalı ki görünüm paylaşılabilsin.

**Motion / 3B:** 3B gereksiz. Ölçülü framer-motion (`m as Motion`) yeterli: kart durum değiştirince `layout` animasyonu (kolonlar arası kayma), ilerleme halkasında 300 ms'lik dolum, çekmece için standart slide. Hepsi `useReducedMotion` ile kapatılabilir olmalı. Sayfa bir çalışma aracı, gösteri sayfası değil.

**Veri / API değişiklikleri:**
- Prisma: `RoadmapInitiative { id, slug, titleTr, titleEn, descriptionTr?, descriptionEn?, theme, panel, status (later|next|now|shipped|dropped), targetQuarter?, ownerId?, featureFlagKey?, href?, shippedAt?, sortOrder, createdAt, updatedAt }`. `CompanyTask`'a isteğe bağlı `initiativeId` eklenmeli.
- API: `GET/POST /api/admin/roadmap/initiatives`, `PATCH/DELETE /api/admin/roadmap/initiatives/[id]`. Hepsi Zod doğrulamalı ve `AuditLog`'a yazmalı. İlerleme, `groupBy` ile tek sorguda hesaplanmalı (N+1 olmadan). Kısa TTL'li Upstash cache uygun.
- Göç: mevcut `lib/data/product-roadmap.json` tek seferlik seed olarak içe alınmalı, ardından JSON ve `GET /api/admin/product-roadmap` kaldırılmalı (`lib/data/admin-api-catalog.json:583-587` girişi de güncellenmeli).
- **Build-time DB fail-safe:** Sayfa istemci tarafında veri çektiği için statik üretim riski yok. Sunucu bileşenine taşınırsa helper'lar try/catch ve varsayılan değerle yazılmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ekip` (İç Ekip Yönetim Modülü):** Asıl çakışma burada. Gerçek iş takibi (kanban, onay akışı, bağımlılık, şablonlar) `CompanyTask` üzerinden ekip modülünde yapılıyor. Roadmap sayfası bunun "yukarı seviye" (girişim/epic) görünümü olmalı. **Öneri:** Roadmap, ekip modülünün içinde "Yol haritası" sekmesi olsun. `/admin/roadmap` bu sekmeye yönlenen bir kısayol olarak kalabilir.
- **`/admin/features` (Özellik bayrakları):** Sayfanın alt kısayolu (`page.tsx:141-146`) bu sayfaya bağlanıyor ama veri olarak ilişki yok. Girişim ile `FeatureFlag.key` bağlantısı kurularak "yayına çıkış" ile "yayında" durumu tek bir kaynaktan beslenmeli.
- **`/admin/platform-pulse`, `/admin/design-language`, `/admin/accessibility`, `/admin/observability`, `/admin/api-catalog`, `/admin/ecosystem`:** Roadmap maddelerinin çoğu bu sayfalara link veren bir "admin sayfa dizini" işlevi görüyor. Aynı dizin zaten `app/admin/admin-utils.ts:92-101` (`HIZLI_ERISIM`) ve sidebar'da var, yani roadmap bu açıdan kopya. Birleştirmeden sonra roadmap'te "sayfa listesi" maddeleri olmamalı. Yalnızca gerçek girişimler kalmalı.
- **`docs/BACKLOG-32-50.md`, `docs/YAPILACAKLAR-LISTESI.md`, `docs/TASK-LISTESI.md`, `docs/EXPERIMENT-BACKLOG.md`:** Bunlar repo içindeki dağınık backlog kaynakları. DB tabanlı roadmap kurulduğunda tek doğruluk kaynağı orası olmalı, bu dosyalar arşivlenmeli veya roadmap'e aktarılmalı.
- **`/admin/innovation`:** Fikir/öneri toplama sayfası. Doğal akış "Fikir → Girişim (roadmap) → Görevler (ekip)" olmalı. İnovasyon kaydından "Yol haritasına taşı" aksiyonu eklenmesi önerilir. Bu iki sayfanın veri modeli bu raporda **doğrulanmadı**.

---

## Doğrulama (şüpheci inceleme)

### 1. Roadmap'teki müşteri/bayi panel linkleri admini sessizce /admin'e yönlendiriyor — **DOĞRULANDI** (önem derecesi düşürülmeli: güvenlik değil, işlev/UX hatası)

- Kanıt: `lib/data/product-roadmap.json:75,83,91,99,107,115` altı madde `/customer/*` ve `/dealer/*` hedefliyor. `app/admin/roadmap/page.tsx:115-122` her `href`'i koşulsuz `<Link>` olarak render ediyor. `proxy.ts:124` matcher `/customer/:path*` ve `/dealer/:path*` yollarını kapsıyor; `proxy.ts:60-70` `pathname.startsWith('/customer')` ve `token.role ('ADMIN') !== 'CUSTOMER'` olduğunda `roleRedirects.ADMIN = '/admin'` adresine yönlendiriyor. Admin için istisna/impersonation yolu yok.
- Hedef sayfalar gerçekten var (`app/customer/spending-overview`, `app/dealer/operations-brief`, `app/customer/progress-hub`, `app/dealer/growth-hub`, `app/customer/discover`, `app/dealer/discover` altında `page.tsx` mevcut). Yani link kırık değil, rol kapısı nedeniyle erişilemiyor.
- Yeniden üretim: ADMIN olarak gate'i geç, `/admin/roadmap`'te "Müşteri harcama ve ziyaret özeti" linkine tıkla. İstek `/customer/spending-overview`'a gider, proxy 307 ile `/admin`'e atar. Kullanıcıya hiçbir açıklama gösterilmez.
- Not: Veri sızıntısı veya yetki aşımı yok. "KRİTİK/YÜKSEK" değil, ORTA/DÜŞÜK işlev hatası. Çözüm: bu maddelerde `href` yerine "Müşteri paneli" / "Bayi paneli" rozeti ve tıklanamaz metin göster; ya da (tercihen) admin önizleme modu varsa ona bağla. Rapordaki DB tabanlı girişim modelinde `panel` alanı bunu zaten çözer.

### 2. Admin API uçları gizli kapı (gate) çerezini kontrol etmiyor — **DOĞRULANDI** (sistemik, YÜKSEK; roadmap ucu için etkisi düşük)

- Kanıt: `proxy.ts:105-119` tüm `/api/*` isteklerini `authMiddleware`'e hiç sokmadan `NextResponse.next()` ile geçiriyor; gate kontrolü yalnızca `proxy.ts:79` içinde ve sadece `pathname.startsWith('/admin')` sayfa yolları için çalışıyor. `lib/api-auth.ts:52-80` `requireAuth` yalnızca oturum + rol + token-replay kontrolü yapıyor, `admin_gate` çerezine bakmıyor. `verifyGateCookie` (`lib/admin-gate.ts:55`) kod tabanında testler dışında hiçbir yerde çağrılmıyor (grep: yalnız `__tests__/lib/admin-gate.test.ts`).
- İddiadaki "diğer uçlar kendi içinde ek kontrol yapıyor mu?" sorusunun cevabı: yapmıyor ve durum iddiadan daha kötü. `app/api/admin/settings/admin-gate/route.ts:19-27` GET ucu, gate çerezi istemeden yalnızca `requireAuth(['ADMIN'])` ile gizli **cevabın kendisini** döndürüyor (`answer: gate.answer`). Aynı dosyanın `PUT` ucu (`:34-64`) de çerezsiz cevabı değiştirebiliyor.
- Yeniden üretim (kapının tamamen aşılması): Rolü ADMIN yapılmış ama cevabı bilmeyen kullanıcı, oturum çereziyle `GET /api/admin/settings/admin-gate` çağırır → yanıtta `answer` gelir → `POST /api/admin/gate` `{answer}` ile HMAC çerezini alır → `/admin` paneline tam erişir. Ara adıma gerek bile yok: `/api/admin/*` uçlarının hepsi (kullanıcılar, ayarlar, puan vb.) zaten doğrudan çağrılabiliyor.
- Roadmap özelinde: `app/api/admin/product-roadmap/route.ts:14` yalnız repo içindeki statik JSON'u döndürüyor; bu ucun kendisi hassas değil. Bulgu, bu sayfanın değil `proxy.ts` / `requireAuth` katmanının sistemik bir açığı olarak takip edilmeli.
- Önerilen çözüm: `requireAuth` içine (ya da yeni `requireAdmin()` yardımcısına) `allowedRoles` ADMIN içeriyorsa ve kullanıcı ADMIN ise `cookies().get('admin_gate')` + `verifyGateCookie(cookie, userId, gate.answer)` kontrolü eklenmeli (gate config Redis'te kısa TTL ile cache'lenebilir; token-replay'deki sıcak katman deseni). Muafiyet yalnız `GET/POST /api/admin/gate` için olmalı. Ek olarak `GET /api/admin/settings/admin-gate` cevabı hiç döndürmemeli (yalnız soru + "cevap ayarlı" bayrağı) ve `PUT` yeni cevabın yanında mevcut cevabın tekrar girilmesini istemeli. Alternatif/ek savunma: `proxy.ts`'te `/api/admin/*` için de edge'de `gateCookieBelongsTo` ön kontrolü.

## Uygulama (Dalga 2)

/admin/roadmap **emekliye ayrıldı**: `app/admin/roadmap/page.tsx` sorgu parametrelerini koruyarak `/admin/ekip?tab=initiatives` adresine `permanentRedirect` yapar; `layout.tsx`, `/api/admin/product-roadmap`, `lib/data/product-roadmap.json`, `lib/product-roadmap-types.ts` silindi. Yerine veritabanı destekli **Girişimler** (`components/team/initiatives/*`, `/api/admin/team/initiatives`, mevcut CompanyTask üzerinde — şema değişikliği yok).

Özellik envanteri yeni durumları:
- 1, 4, 7, 10, 12, 21, 33, 35: **ÇALIŞIYOR** (Girişimler sekmesindeki karşılıkları).
- 9 Hata durumu (BOZUK): **ÇALIŞIYOR** — QueryState hata + yeniden dene.
- 13 Sütun ID mono: **KALDIRILDI** (operatör için anlamsız).
- 15 Sabit "shipped" maddeler (SAHTE): **KALDIRILDI** — gerçek kayıtlar.
- 16-20 Statik madde linkleri (17 BOZUK): **KALDIRILDI** — girişimler bağlı görevlere bağlanır.
- 23 Alt kısayollar, 24 eski GET uç: **KALDIRILDI** → `/api/admin/team/initiatives` (zod).
- 27 Şema doğrulama, 28 Ekle/düzenle/aşama değiştir, 29 Aşamaya göre gruplama, 30 Hedef tarih/sorumlu/ilerleme (EKSİK): **ÇALIŞIYOR**.
- 31 Changelog: **ÇALIŞIYOR** — görev etkinlik geçmişi.
- 32 Dışa aktarım: **EKSİK (kalan)** — Girişimler'de CSV yok.

Kapanan bulgular (9): 9, 15, 17, 27-31 + statik JSON'un kaldırılması.

**Mimari:** Tek paylaşılan çalışma alanı `components/team/team-workspace.tsx` (+ `board/`, `task-detail/`, `departments/`, `dialogs/`, `initiatives/`, `lib/`) iki panelde de kullanılır; sayfalar sunucu bileşeni, ilk boyama verisi `lib/team/page-bootstrap.ts` + `lib/team/meta.ts` ile sunucuda yüklenir. teamOnly erişim (`lib/team/access.ts` requireTeamViewer, `capabilitiesFor` yetenekleri) korunur; yazma uçları `defineRoute` (rol + zod + rate limit). Test: `__tests__/team/meta.test.ts` (2/2).

**Kalanlar:**
- Eski monolit bileşenler (`components/team/team-board.tsx`, `task-detail-sheet.tsx`, `team-departments.tsx`, `team-activity.tsx`, `team-performance.tsx`, `team-files.tsx`, `ai-qa-dialog.tsx`, `ai-summary-dialog.tsx`, `automations-dialog.tsx`, `tags-dialog.tsx`, `templates-dialog.tsx`) hiçbir rotadan import edilmiyor (ölü kod); silme bu oturumda izin sınırına takıldı, sonraki temizlikte kaldırılmalı.
- Canlı tarayıcı doğrulaması yapılmadı (dev server yasak); tip denetimi temiz.
