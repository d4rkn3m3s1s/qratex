# /admin/badges

**Amaç:** Platform operatörünün rozet kataloğunu (normal rozetler + 43 dizi/karakter rozeti) listelediği, oluşturduğu, düzenlediği, renklendirdiği, gizlediği ve sildiği; her rozetin gerçekten kazanılabilir olup olmadığını (izlenebilirlik) gördüğü yönetim ekranı.

**Genel puan: 4.5 / 10** · **Karar: yeniden tasarla** (veri modeli + form sözleşmesi düzeltilmeli; görsel kabuk korunabilir ama bilgi mimarisi bir "katalog tablosu + detay çekmecesi"ne dönmeli)

Dosyalar: `app/admin/badges/page.tsx` (32 satır, `dynamic(..., { ssr:false })` kabuğu) → `app/admin/badges/badges-client.tsx` (1287 satır, tek bileşen). API: `app/api/gamification/badges/route.ts` (GET/POST), `app/api/gamification/badges/[id]/route.ts` (GET/PATCH/DELETE), `app/api/admin/assets/upload/route.ts` (POST). Yardımcılar: `lib/badge-trackability.ts`, `lib/badge-colors.ts`, `lib/admin-toast.ts`, `lib/badge-rarity-surfaces.ts`, `components/admin/admin-premium-hero.tsx`. Prisma: `Badge` (`prisma/schema.prisma:604-628`), `UserBadge` (`:630-643`), `AuditLog`.

---

## Puan kartı

| Eksen | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme/filtre/renk/izlenebilirlik çalışıyor; ama "Puan Ödülü" alanı hiçbir yere yazılmıyor, kartta "puan" diye hedef sayı gösteriliyor, silme onaysız ve geri alınamaz, ikon yükleme Vercel'de çalışamaz. |
| UX | 4/10 | İki ayrı KPI şeridi birbirini tekrar ediyor, aksiyonlar yalnız hover'da görünüyor, 15+ alanlı tek uzun modal, hata ile "boş" durum ayrılmıyor, düzenlemeden kalan veri "Yeni Rozet" formuna sızıyor. |
| Görsel | 6/10 | Nadirlik paleti, neon/starfield efektleri ve canlı önizleme göz alıcı; ama bir yönetim aracı için fazla dekoratif, bilgi yoğunluğu düşük (kart başına ~350px yükseklik). |
| Mimari | 3/10 | 1287 satırlık tek dosya; ikon listesi `lib/badge-catalog.ts` ile ikinci doğruluk kaynağı; müşteri ve admin aynı GET ucunu paylaşıyor; ödül puanı kodda (metin tabloları), maliyet DB'de, form ise üçüncü bir "points" uyduruyor; sunucu tarafında şema doğrulaması yok. |
| Performans | 5/10 | Code-split ve stagger sınırı iyi; ama ~128 rozet × (12 pulse yıldız + 2 `blur-3xl` küre + 160px görsel) sanallaştırma olmadan çiziliyor, sayfalama yok (`take: 500` sessiz sınır). |
| Erişilebilirlik + mobil | 3/10 | Aksiyon butonları `opacity-0 group-hover` ile dokunmatikte/klavyede görünmez; ikon-only butonlarda `aria-label` yok; sekmeler `role="tab"` değil; form `Label`'ları input'lara bağlı değil. Azaltılmış hareket global olarak ele alınmış (artı). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa kabuğu: `next/dynamic` + `ssr:false` + iskelet | ÇALIŞIYOR | `app/admin/badges/page.tsx:11-28` | İskelet, client içindeki ikinci iskeletle (`badges-client.tsx:1032-1043`) art arda gösteriliyor → çift yüklenme flaşı. |
| 2 | Yetki: `/admin` rota koruması (rol + gizli kapı) | ÇALIŞIYOR | `proxy.ts:62-86` | Sayfanın kendisinde sunucu kontrolü yok; korumayı proxy + API yapıyor. |
| 3 | AdminPremiumHero başlığı | ÇALIŞIYOR | `badges-client.tsx:832-837` | Eyebrow "Gamification" İngilizce; geri kalan Türkçe. |
| 4 | KPI: Toplam Kazanım | ÇALIŞIYOR | `:495-501`, `:842-848`, API `_count.users` `route.ts:122-126,253` | Pasif rozetleri de sayar; tıklanamaz. |
| 5 | KPI: Tam izlenebilir | ÇALIŞIYOR | `:849-855`, `lib/badge-trackability.ts:72-77` | Tıklayınca filtreleme yok. |
| 6 | KPI: Yaklaşık | ÇALIŞIYOR | `:856-862` | Aynı. |
| 7 | KPI: Karakter (dizi) | ÇALIŞIYOR | `:863-869`, `route.ts:261-263` | Aynı. |
| 8 | KPI: İzlenemez ("ölü rozet") | ÇALIŞIYOR | `:870-876` | "düzelt!" diyor ama hangileri olduğunu filtreleyen bir yol yok. |
| 9 | Nadirlik istatistik kartları (Toplam + 4 nadirlik) | ÇALIŞIYOR | `:486-492`, `:880-919` | 4 numaralı şeritle aynı "Toplam" fikrini tekrarlıyor; sekmeden bağımsız sayıyor. |
| 10 | Ana sekme: Normal / Dizi rozetleri | ÇALIŞIYOR | `:280`, `:922-936`, `:476-477` | `role="tablist"/aria-selected` yok; etikette emoji. |
| 11 | Dizi alt-kategori çipleri (4 + "Gizemli") | ÇALIŞIYOR | `:464-470`, `:937-955`, `:479-481` | Liste `lib/character-categories` ile elle senkron (sabit dizi). |
| 12 | Dizi bilgi notu ("Silmek yerine pasif yapılabilir") | KISMİ | `:957-961` | Yanıltıcı: karakter motoru `isActive`'i hiç kontrol etmiyor (`lib/character-badges.ts:175-190, 434, 466-469`) → pasif dizi rozeti kullanıcılara verilmeye devam eder. |
| 13 | Arama | KISMİ | `:473` | Yalnız `name`; açıklama, id, sayaç türü, kategori aranmıyor; debounce yok (küçük liste, sorun değil). |
| 14 | Nadirlik filtresi | ÇALIŞIYOR | `:975-991`, `:474` | |
| 15 | Grid / Liste görünüm geçişi | ÇALIŞIYOR | `:992-1007`, `:1055-1065` | Tercih kalıcı değil; ikon-only butonlarda `aria-label`/`aria-pressed` yok. |
| 16 | "Yeni Rozet Oluştur" diyaloğu | KISMİ | `:1009-1028` | Açılırken `resetForm()` çağrılmıyor → önceki düzenlemeden kalan veri forma sızar (Bulgu 6). |
| 17 | Form: Rozet Adı | KISMİ | `:509-516` | İstemci ve sunucuda zorunluluk/uzunluk doğrulaması yok (`route.ts:314-318`). |
| 18 | Form: Açıklama | ÇALIŞIYOR | `:517-524` | Boş bırakılabilir. |
| 19 | Form: İkon dosya yükleme (SVG/PNG ≤2MB) | BOZUK (canlıda doğrulanmadı) | `:528-543`, `app/api/admin/assets/upload/route.ts:81-87` | Dosyayı `process.cwd()/public/images/uploads/` altına `writeFile` ile yazıyor; Vercel (`vercel.json`) serverless dosya sistemi salt-okunur ve çalışma zamanında yazılan dosya `public`'ten servis edilmez. Lokal geliştirmede çalışır. |
| 20 | Form: İkon arama | ÇALIŞIYOR | `:550-558` | |
| 21 | Form: İkon galerisi (82 sabit SVG) | ÇALIŞIYOR | `:184-271`, `:556-581` | 82 dosyanın hepsi diskte mevcut (doğrulandı). `lib/badge-catalog.ts` ile ikinci doğruluk kaynağı; seçim butonlarında `aria-pressed` yok. |
| 22 | Form: Kategori | KISMİ | `:170-180`, `:584-604` | Kategori sayfada hiçbir kartta gösterilmiyor ve filtrelenmiyor; API'nin kabul ettiği `dizi/sadakat/etkinlik/diger/custom` (`route.ts:14-33`) dropdown'da yok → bu kategorideki rozet düzenlenirken Select boş görünür. PATCH kategoriyi normalize etmiyor (`[id]/route.ts:70`), POST ediyor (`route.ts:311`). |
| 23 | Form: Nadirlik | ÇALIŞIYOR | `:605-625`, `route.ts:320`, `[id]/route.ts:71` | |
| 24 | Form: "Puan Ödülü" | SAHTE | `:628-635`; POST `route.ts:312-327`; PATCH `[id]/route.ts:64-81`; şema `schema.prisma:604-628` | `Badge` modelinde ödül puanı alanı yok; POST/PATCH `body.points`'i yazmıyor. Gerçek ödül `lib/badge-reward-points.ts:25-31` ile kod içindeki metin tablolarından gelir; admin'in oluşturduğu rozetin ödülü daima 0. Düzenle açılınca alan `targetValue` ile dolar (`route.ts:239` → `:448`). |
| 25 | Form: Puanla Açma Maliyeti (`pointCost`) | KISMİ | `:636-648`, `route.ts:322`, `[id]/route.ts:75` | Kaydediliyor; ama "tam sürpriz politikası" gereği müşteri yalnız kazandığı rozetleri görüyor (`route.ts:273-277`), satın alma butonu ise kazanılmamış dalda (`app/customer/badges/badges-client.tsx:491-497`) → UI'dan ulaşılamaz. Negatif değer engellenmiyor. |
| 26 | Form: Kazanma koşulu — sayaç türü | ÇALIŞIYOR | `:656-668`, `lib/badge-trackability.ts:41-69` | Mevcut rozetin tipi dropdown'da yoksa (ör. `character`, `long_feedback_count`) Select boş görünür; değer korunur. |
| 27 | Form: Hedef sayı | ÇALIŞIYOR | `:670-678`, `:329` | En az 1'e kırpılıyor. |
| 28 | Form: Seçilen tipin izlenebilirlik ipucu | ÇALIŞIYOR | `:681-690` | |
| 29 | Form: Vurgu rengi (picker + hex) | ÇALIŞIYOR | `:708-725`, `lib/badge-colors.ts:95-100` | Geçersiz hex sunucuda sessizce `null` olur, kullanıcıya hata verilmez. |
| 30 | Form: Arka plan rengi | KISMİ | `:726-743`, `lib/badge-colors.ts:126-128` | Vurgu rengi boşsa arka plan rengi yok sayılır (önizlemede de görünmez) — açıklama yok. |
| 31 | Form: "Sıfırla (nadirlik rengi)" | ÇALIŞIYOR | `:697-705` | |
| 32 | Form: Canlı önizleme | KISMİ | `:747-791` | Renk yoksa nadirlik paletini değil düz `muted` zemini gösterir (metin "nadirlik varsayılan rengi" diyor ama göstermiyor); müşteri kart bileşeninin kopyası, gerçek bileşen değil → kayma riski. |
| 33 | Form: Aktif anahtarı | KISMİ | `:794-800`, `lib/surprise-badges.ts:212-213` | Normal rozetlerde motor `isActive:true` filtreliyor (çalışır); karakter rozetlerinde etkisiz (Bulgu 4). |
| 34 | Form: "Müşteride Gizli (Sürpriz)" anahtarı | KISMİ | `:801-813`, `route.ts:273-277`, `[id]/unlock/route.ts:43` | Tam sürpriz politikası zaten tüm kazanılmamış rozetleri gizliyor; bayrak yalnızca userId'siz liste ve puanla açmayı etkiler. "sürpriz rozet! bildirimi" açıklaması bayrağa bağlı değil — motor her aktif rozet için aynı bildirimi atıyor (`lib/surprise-badges.ts:256-262`). |
| 35 | Form: İptal | ÇALIŞIYOR | `:815-821` | Formu sıfırlayan tek yol bu. |
| 36 | Oluştur (submit) | KISMİ | `:332-352` | Gönderim sırasında buton kilitlenmiyor/spinner yok → çift tık = iki rozet; doğrulama yok. |
| 37 | Düzenle diyaloğu | KISMİ | `:440-460`, `:1270-1283` | ESC/X/overlay ile kapanınca `resetForm` ve `setSelectedBadge(null)` çalışmıyor. |
| 38 | Güncelle (submit) | KISMİ | `:354-376`, `[id]/route.ts:72-74` | `requirement` `{type,value}` ile tamamen değiştirilir → mevcut `period`/`metadata` silinir; sunucu hata metni gösterilmez (`:371`); çift tık koruması yok. |
| 39 | Sil | BOZUK (tehlikeli) | `:378-393`, `:1117`, `:1242-1249`, `[id]/route.ts:126-127`, `schema.prisma:638` | Onay yok, geri alma yok; hard delete `UserBadge`'leri `onDelete: Cascade` ile siler → tüm kullanıcıların kazanımı kalıcı kaybolur. Dizi rozetlerinde de aktif. |
| 40 | Kart: "N kişi kazandı" | ÇALIŞIYOR | `:1224-1229`, `:1109-1112` | Kazananlar listesine bağlantı yok. |
| 41 | Kart: Yıldızlı "puan" rozeti | BOZUK | `:1218-1221`, `:1103-1106`, `route.ts:239` | `points` alanı API'de `targetValue` (hedef sayı) olarak üretiliyor; admin "10 puan" sanar, gerçekte "10 yorum" hedefidir. |
| 42 | Kart: izlenebilirlik rozeti | ÇALIŞIYOR | `:48-62`, `:1107`, `:1228` | |
| 43 | Kart: "Pasif" etiketi | KISMİ | `:1254-1260` | Yalnız grid görünümünde; liste görünümünde pasif rozet ayırt edilemez (`:1070-1121`). |
| 44 | Kart aksiyonları (Düzenle/Sil) | KISMİ | `:1113`, `:1232` | `opacity-0 group-hover:opacity-100` → dokunmatikte görünmez, klavye odağında görünmez (`focus-within` yok); ikon-only butonlarda `aria-label` yok. |
| 45 | Yükleniyor durumu | ÇALIŞIYOR | `:1032-1043` | Bkz. #1 çift iskelet. |
| 46 | Boş durum | KISMİ | `:1044-1053` | Filtre/arama sonucu boş ile katalog boş aynı mesaj ("Yeni bir rozet oluşturmaya başlayın"); "filtreleri temizle" yok. |
| 47 | Hata durumu | KISMİ | `:309-324` | `success:false` (401/500/503) sessizce yutulur → boş durum gösterilir; yeniden dene yok. |
| 48 | Toast bildirimleri | KISMİ | `lib/admin-toast.ts:150-154` | Önekler "Basarili: " / "Dikkat: " Türkçe karaktersiz; her mesaja önek eklemek de gürültü. |
| 49 | Giriş/stagger animasyonları | ÇALIŞIYOR | `:881-916`, `:1126-1132`; `components/providers.tsx:232` | `MotionConfig reducedMotion="user"` + `globals.css:801` ile azaltılmış hareket destekli. Sayfa kendi `LazyMotion`'ını sarıyor (`:830`) — global olduğu için gereksiz. |
| 50 | Koyu temada starfield + neon + efsanevi/epik pulse | ÇALIŞIYOR | `:1137-1203` | Yönetim aracında aşırı; kart başına 12 animasyonlu düğüm + 2 blur küresi. |
| 51 | Mobil yerleşim | KISMİ | `:841`, `:880`, `:964-1029` | Izgaralar kırılıyor; ama aksiyonlar mobilde yok, tek kolonda kart ~350px → 128 rozet çok uzun kaydırma; diyalog tam ekran değil. |
| 52 | Denetim kaydı (AuditLog CREATE/UPDATE/DELETE_BADGE) | ÇALIŞIYOR (yalnız sunucu) | `route.ts:331-340`, `[id]/route.ts:85-95,130-139` | Sayfada görünür bir değişiklik geçmişi yok. |
| 53 | Sıralama (ad, kazanım, oluşturma, nadirlik) | EKSİK | — | API `rarity desc` sözlük sırası "rare > legendary > epic > common" veriyor; yorumdaki "legendary first" yanlış (`route.ts:127-130`). |
| 54 | Toplu işlem (çoklu seç → pasifleştir/nadirlik/sil) | EKSİK | — | |
| 55 | Rozet detay / kazananlar / zaman serisi | EKSİK | — | |
| 56 | Sayfalama / sanallaştırma | EKSİK | `route.ts:131` (`take: 500`) | Sınır aşılırsa sessizce kesilir. |
| 57 | Kopyala (duplicate) / taslak / zamanlanmış yayın | EKSİK | — | |

**Durum sayımı:** ÇALIŞIYOR 29 · KISMİ 19 · BOZUK 3 · SAHTE 1 · EKSİK 5 (toplam 57)

---

## Bulgular

### 1. [KRİTİK · Veri bütünlüğü] Silme onaysız, geri alınamaz ve tüm kullanıcıların kazanımlarını kaskadla siler
- **Kanıt:** `badges-client.tsx:378-393` (doğrudan `fetch DELETE`), `:1117`, `:1246`; `app/api/gamification/badges/[id]/route.ts:127` (`prisma.badge.delete`); `prisma/schema.prisma:638` (`UserBadge.badge … onDelete: Cascade`).
- **Sorun:** Çöp kutusu ikonuna tek tık → onay diyaloğu yok → rozet ve ona ait tüm `UserBadge` satırları kalıcı silinir. Kullanıcılar koleksiyonlarından rozet kaybeder; ödül puanı ise önceden kredilenmiş olarak kalır (ekonomi tutarsızlığı: puan var, rozet yok). Dizi rozetinde silme sonrası `ensureCharacterBadgeRecord` (`lib/character-badges.ts:109-125`) rozeti katalogdan yeniden yaratır — admin'in özelleştirmeleri (renk, açıklama) de kaybolur. Sayfanın kendi notu (`:959`) bile "silmek yerine pasif yap" diyor, ama buton dizi sekmesinde de aktif.
- **Öneri:** Silmeyi "arşivle" (soft delete: `archivedAt DateTime?`) olarak yeniden tanımla; kazanımı olan rozette hard delete'i API'de 409 ile reddet. UI'da `AlertDialog` ile "Bu rozeti N kullanıcı kazanmış; arşivlemek yeni kazanımları durdurur, mevcutları korur" metni + rozet adını yazarak onay (Stripe/Linear deseni). Karakter rozetleri (`CHARACTER_PROFILES`) için silmeyi tamamen kapat. Arşivlenen rozet için 10 sn "Geri al" toast'ı.
- **Efor:** M

### 2. [YÜKSEK · İşlevsellik/Veri] "Puan Ödülü" alanı sahte; kartlarda "puan" diye hedef sayı gösteriliyor
- **Kanıt:** Form `badges-client.tsx:628-635`; POST `route.ts:312-327` ve PATCH `[id]/route.ts:64-81` `points` yazmıyor; şemada alan yok `schema.prisma:604-628`; GET `route.ts:239` `points: targetValue`; kart `:1218-1221`, `:1103-1106`; gerçek ödül `lib/badge-reward-points.ts:25-31` (kod içi metin tabloları).
- **Sorun:** Admin 500 girer, kaydeder; değer hiçbir yere gitmez. Düzenle açılınca alan hedef sayıyla (ör. 10) dolar. Kartın yıldızlı rozeti de bu hedef sayıyı "puan" gibi sunar. Aynı yanlış alan müşteri sayfasında "+{points} puan" olarak gösteriliyor (`app/customer/badges/badges-client.tsx:492`) → müşteri gerçek ödülden farklı bir sayı görüyor. Admin panelinden oluşturulan her rozetin gerçek ödülü 0.
- **Öneri:** Üç kavramı ayır ve adlandır: `rewardPoints` (kazanınca yatan), `pointCost` (satın alma), `targetValue` (koşul). `Badge`'e `rewardPoints Int?` ekle; `badgeRewardPoints()` önce DB değerini, yoksa metin tablosunu okusun (geriye dönük). Ekonomi invaryantları gereği kredi yolu değişmez (aynı tx, `points_credited` olayı). API yanıtında `points` alanını kaldırıp `rewardPoints` + `targetValue` döndür; admin kartında "🎯 10 yorum · ⭐ +150 puan" gibi iki ayrı chip. Müşteri sayfasını da aynı alana bağla.
- **Efor:** M

### 3. [YÜKSEK · Güvenlik/Gizlilik] Sayfanın kullandığı GET ucu başka kullanıcıların rozet ve puan bilgisini kimlik doğrulamasız döndürüyor (IDOR)
- **Kanıt:** `app/api/gamification/badges/route.ts:81-87` (`userId` parametresi oturumla eşleştirilmeden kullanılıyor), `:147-183`, `:286-291` (`userProgress`, `userPoints` yanıtta); `proxy.ts:105-118` (`/api/*` için oturum kontrolü yok).
- **Sorun:** `GET /api/gamification/badges?userId=<herhangi bir id>` oturumsuz bile o kullanıcının kazandığı rozetleri, puan bakiyesini, seviyesini, yorum ve görev sayısını döndürür. Ayrıca `GET /api/gamification/badges/[id]` (`[id]/route.ts:13-34`) oturumsuz ve gizli/karakter rozetinin ham kaydını verir (sürpriz bozulur).
- **Öneri:** `userId !== 'me'` ise yalnız ADMIN'e izin ver; aksi halde 403. Admin yönetim listesini ayrı bir uca taşı (`/api/admin/badges`, `requireAuth(['ADMIN'])`) — müşteri ucu ile admin ucu tek dosyada `adminManage` bayrağıyla dallanmamalı. Tekil GET'i ADMIN'e kısıtla ya da `hiddenUntilEarned`/karakter rozetlerinde 404 dön.
- **Efor:** S

### 4. [YÜKSEK · İşlevsellik] Dizi (karakter) rozetini "Pasif" yapmak hiçbir şeyi durdurmuyor
- **Kanıt:** UI notu `badges-client.tsx:957-961`; seçim havuzu `lib/character-badges.ts:175-190` (yalnız sahip olunanlar çıkarılıyor), atama `:434-469` — `isActive` hiçbir yerde okunmuyor; `ensureCharacterBadgeRecord` `:109-125` yalnız var olup olmadığına bakıyor. Normal motor ise filtreliyor: `lib/surprise-badges.ts:212-213`.
- **Sorun:** Admin bir karakteri pasif yapınca kullanıcıya verilmeye devam eder; arayüz tersini vaat ediyor.
- **Öneri:** `pickCharacterInCategory`'de aday listesini DB'deki `isActive:true` karakter id'leriyle kesiştir (Redis'te kısa TTL'li set olarak önbelleklenebilir; yazma sonrası `PATCH` bu anahtarı invalidate etsin). Tüm karakterler pasifse kategori "tükendi" sayılsın. Admin kartında "Pasif — yeni kazanım durdu" açıklaması.
- **Efor:** S

### 5. [YÜKSEK · İşlevsellik/Altyapı] İkon yükleme üretimde çalışamaz (salt-okunur dosya sistemi)
- **Kanıt:** `app/api/admin/assets/upload/route.ts:81-87` (`mkdir` + `writeFile` → `public/images/uploads/badges`), `vercel.json` (Vercel, `fra1`). Canlıda çalıştırılarak **doğrulanmadı**; Vercel Functions'ta `/var/task` salt-okunurdur ve çalışma zamanında yazılan dosya statik `public` servisine girmez.
- **Sorun:** Admin "Dosya Seç" ile yükleme yaptığında 500 ("Dosya yüklenemedi") ya da en iyi ihtimalle 404 veren bir yol alır. Projede zaten R2 altyapısı var (`lib/r2-storage.ts`).
- **Öneri:** Yükleme ucunu R2'ye taşı (mevcut magic-byte/SVG-script/EXIF denetimleri korunarak), dönen HTTPS URL'yi `Badge.icon`'a yaz; `next.config` `images.remotePatterns`'a R2 alan adını ekle. Ayrıca ikonu sunucu tarafında 512×512'ye normalize et. Yükleme sırasında ilerleme (`lib/upload-with-progress.ts` zaten var).
- **Efor:** S-M

### 6. [ORTA · Hata] Düzenleme diyaloğu ESC/X ile kapatılınca form kirli kalıyor ve "Yeni Rozet" formuna sızıyor
- **Kanıt:** `badges-client.tsx:1270` (`onOpenChange={setEditDialogOpen}` — sıfırlama yok), `:1009-1015` (Create `DialogTrigger` açılışta `resetForm` çağırmıyor), sıfırlama yalnız İptal'de `:815-819` ve başarıda `:343`, `:368`.
- **Sorun:** Admin rozet A'yı düzenlemeye açıp ESC ile kapatır, sonra "Yeni Rozet Oluştur"a basar → form A'nın adı, ikonu, rengi, koşuluyla dolu açılır → farkında olmadan kopya rozet oluşturulur.
- **Öneri:** Form durumunu diyalog örneğine bağla: `react-hook-form` + `zod` şeması, diyalog her açılışta `reset(defaults | badge)`; `onOpenChange(false)` her durumda sıfırlasın. Daha iyisi Create/Edit tek bir `BadgeEditor` (sağ çekmece) bileşeni, `key={badge?.id ?? 'new'}` ile.
- **Efor:** S

### 7. [ORTA · Veri bütünlüğü] Sunucuda doğrulama yok; çift tıklama çift rozet yaratıyor; güncelleme koşul metadata'sını siliyor
- **Kanıt:** POST `route.ts:310-327` (ad/açıklama/ikon/nadirlik/pointCost doğrulanmıyor); PATCH `[id]/route.ts:66-80` (`requirement` ham nesne olarak yazılıyor, `normalizeRequirement` kullanılmıyor; `rarity` serbest metin); istemci `:332-352` (submit kilidi yok); `buildPayload` `:327-330` yalnız `{type,value}` gönderiyor.
- **Sorun:** Boş adlı rozet, negatif `pointCost`, tanımsız nadirlik (`'foo'` → GET'te `'FOO'` → `rarityConfig['FOO']` undefined → `:1067-1068` sayfa çöker) API ile mümkün. Ağ yavaşken "Oluştur"a iki kez basmak iki kayıt üretir. Mevcut `period`/`metadata` alanları her düzenlemede kaybolur.
- **Öneri:** Paylaşılan `lib/schemas/badge.ts` zod şeması (istemci formu ve iki route aynı şemayı kullansın): `name` 2-60, `rarity` enum, `pointCost`/`rewardPoints` ≥0 int, `requirement.type` ∈ izinli tipler, `color` hex. PATCH'te `requirement`'ı mevcut değerle birleştir (`{...old, type, value}`). Submit sırasında buton `disabled` + spinner; POST'a `Idempotency-Key` başlığı (Redis'te 60 sn) ile çift kayıt engeli.
- **Efor:** M

### 8. [ORTA · Erişilebilirlik/Mobil] Düzenle/Sil butonları yalnız fareyle görünür
- **Kanıt:** `badges-client.tsx:1113` (`opacity-0 group-hover:opacity-100`), `:1232`; ikon-only butonlar `:1114-1119`, `:1242-1249`, `:993-1006` — `aria-label` yok; sekmeler `:924-935` `role="tab"` değil; `Label`'lar `htmlFor` olmadan `:510`, `:518`, `:585`…
- **Sorun:** Telefonda ve tablette aksiyonlar hiç görünmez (ilk dokunuş da göstermeyebilir); klavyeyle Tab'la gelinen buton görünmez ama odaklıdır; ekran okuyucu "düğme" der, ne yaptığını söylemez.
- **Öneri:** Aksiyonları her zaman görünür bir `DropdownMenu` (⋯) içine al, `group-focus-within:opacity-100` ekle; kartın kendisini tıklanabilir yapıp detay çekmecesini açtır. Tüm ikon-only butonlara `aria-label`, görünüm geçişine `aria-pressed`, sekmelere Radix `Tabs` kullan; form alanlarına `id`/`htmlFor`.
- **Efor:** S

### 9. [ORTA · UX/Bilgi mimarisi] İki KPI şeridi tekrar ediyor ve hiçbiri eyleme dönüşmüyor
- **Kanıt:** Sağlık şeridi `:841-877` (5 kart), nadirlik şeridi `:880-919` (5 kart); filtrelemeye bağlantı yok.
- **Sorun:** 10 kart, ilk ekranın yarısını kaplıyor; "İzlenemez — düzelt!" dediği rozetleri bulmanın yolu yok. Sayılar seçili sekmeden (Normal/Dizi) bağımsız.
- **Öneri:** Tek, kompakt bir "durum çubuğu": her segment (Tam / Yaklaşık / Karakter / İzlenemez / Pasif) bir filtre çipi olarak tıklanabilir, sayıları aktif sekmeye göre güncellenir. Nadirlik dağılımını tek yatay yığılmış çubuğa indir. Asıl ekran alanını listeye ver.
- **Efor:** S

### 10. [ORTA · Hata yönetimi] API hatası "rozet yok" gibi görünüyor
- **Kanıt:** `badges-client.tsx:313-318` (`data.success` false ise hiçbir şey yapılmıyor), `:1044-1053` (boş durum); `:371` (PATCH hata gövdesi okunmuyor).
- **Sorun:** Oturum düşerse ya da DB 503 dönerse admin "Rozet bulunamadı — yeni bir rozet oluşturmaya başlayın" görür; yanlış teşhis ve tekrar oluşturma riski.
- **Öneri:** Üç durumlu veri katmanı (`loading | error | ready`) — SWR/React Query ile; hata kartı + "Yeniden dene"; boş durumda "Filtre sonucu boş → Filtreleri temizle" ile "Katalog boş → İlk rozeti oluştur" ayrımı.
- **Efor:** S

### 11. [ORTA · Mimari] 1287 satırlık tek dosya; ikon kataloğu ve kategori listeleri ikinci doğruluk kaynağı
- **Kanıt:** `badges-client.tsx:184-269` (82 elle yazılmış yol) vs `lib/badge-catalog.ts` (85 kayıt, aynı yollar); dizi alt-kategorileri `:464-470` vs `lib/character-categories`; kategori listesi `:170-180` vs `route.ts:14-50`; kullanılmayan importlar `SlidersHorizontal, Gauge, Save, FlaskConical, History, BarChart3` (`:35-40`, her biri dosyada 1 kez geçiyor) — kaldırılan "algoritma motoru"nun kalıntısı.
- **Sorun:** Yeni ikon eklenince iki yerin güncellenmesi gerekir; dosya adı yazım hataları (`KATALİZÇR.svg`, `CHANDLER BİİG.svg`, `SAM WİNCHESTR.svg`) iki yerde kopyalanmış durumda. Test edilebilirlik sıfır.
- **Öneri:** `components/admin/badges/` altına böl: `BadgeTable`, `BadgeCard`, `BadgeEditorSheet`, `IconPicker`, `ColorField`, `RequirementField`, `BadgeHealthBar`. İkon listesini `lib/badge-catalog.ts`'ten türet (veya `/api/admin/badges/icons` R2 listesi). Kategori ve alt-kategori sabitlerini tek `lib/badge-taxonomy.ts`'ten import et.
- **Efor:** M

### 12. [ORTA · Ürün tutarlılığı] "Puanla Açma Maliyeti" ve "Müşteride Gizli" alanlarının gerçek etkisi arayüzün vaadinden çok dar
- **Kanıt:** Tam sürpriz politikası `route.ts:267-277`; müşteri satın alma butonu yalnız kazanılmamış dalda `app/customer/badges/badges-client.tsx:491-497` (o dala hiç rozet düşmez); gizli bayrağın etkileri `route.ts:277`, `[id]/unlock/route.ts:43`; bildirim bayraktan bağımsız `lib/surprise-badges.ts:256-262`.
- **Sorun:** Admin bir rozete 1000 puan maliyet koyar; müşteri o rozeti hiç göremediği için satın alamaz. "Gizli" anahtarı açık/kapalı fark etmeksizin müşteri deneyimi aynı. Form alanları ürün politikasıyla çelişiyor.
- **Öneri:** Ürün kararı netleşmeli: ya (a) "mağaza rozetleri" diye ayrı bir görünürlük sınıfı (`visibility: 'surprise' | 'store' | 'public'`) tanımlanıp müşteri ucu buna göre filtreler, ya da (b) iki alan da formdan kaldırılır. Formda politika özeti: "Bu rozet müşteride: kazanılana kadar görünmez · satın alınamaz".
- **Efor:** M

### 13. [DÜŞÜK · Performans] Kart başına ağır dekor, sanallaştırma yok
- **Kanıt:** `:1138-1152` (12 `animate-pulse` yıldız/kart), `:1163-1164` (2 × `blur-3xl` küre/kart), `:1155-1160` (pulse katmanı), `:1170-1177` (160px görsel); ~85 katalog + 43 karakter rozeti; `route.ts:131` `take: 500`.
- **Sorun:** Koyu temada ~1500 sürekli animasyonlu düğüm ve ~250 büyük blur katmanı; düşük güçlü dizüstünde kaydırma ve INP maliyeti (ölçülmedi). Sayfalama yok.
- **Öneri:** Varsayılan görünümü yoğun tablo yap; dekoratif efektleri yalnız detay çekmecesindeki tek "önizleme" kartına taşı. Grid görünümünde `content-visibility:auto` veya `@tanstack/react-virtual`. API'de cursor sayfalama + sunucu tarafı arama/filtre.
- **Efor:** M

### 14. [DÜŞÜK · Dil/Tutarlılık] TR/EN karışıklığı ve Türkçe karaktersiz toast önekleri
- **Kanıt:** `lib/admin-toast.ts:152-154` ("Basarili: ", "Dikkat: "); `:833` "Gamification"; emoji'li sekme ve etiketler `:928`, `:934`, `:755`, `:804`; API yorumu ile davranış uyumsuz `route.ts:128` ("legendary first" — sözlük sırası `rare` önce).
- **Öneri:** Toast öneklerini kaldır (sonner zaten ikonla durum gösteriyor) ya da "Başarılı"; admin metinlerini i18n anahtarlarına taşı (müşteri sayfası zaten `t()` kullanıyor); nadirlik sıralamasını `CASE` ile ya da bir `rarityRank Int` sütunuyla yap.
- **Efor:** S

### 15. [DÜŞÜK · UX] Önizleme nadirlik paletini göstermiyor; arka plan rengi vurgu olmadan sessizce yok sayılıyor
- **Kanıt:** `:757-763` (renk yoksa `muted` zemin), `:786-788`; `lib/badge-colors.ts:126-128`.
- **Öneri:** Önizlemede müşteri tarafının gerçek kart bileşenini (`components/badges/...`) paylaşılan prop'larla render et; renk yoksa `rarityConfig` paletini uygula; yalnız arka plan seçilince "Vurgu rengi olmadan arka plan uygulanmaz" uyarısı ya da vurguyu arka plandan türet.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Yoğun tablo görünümü + sütun sıralama + sunucu tarafı arama/sayfalama** (Stripe Products/Linear list): ad, nadirlik, koşul, ödül, kazanım, son kazanım tarihi, durum sütunları; URL'de kalıcı filtre durumu (`?tab=series&rarity=EPIC&q=`).
2. **Rozet detay çekmecesi**: kazanım zaman serisi (PostHog trend), son kazananlar listesi (kullanıcıya bağlantı), koşula ne kadar kullanıcının yaklaştığı ("%80'e gelmiş 214 kullanıcı") — rozet dengelemesi için temel.
3. **Değişiklik geçmişi / denetim izi** (Stripe "Events", Linear "Activity"): `AuditLog` zaten yazılıyor ama UI'da yok; diff görünümü + "bu sürüme geri dön".
4. **Toplu işlem ve kopyala**: çoklu seçim → pasifleştir/nadirlik değiştir/arşivle; "Rozeti çoğalt" ile varyant üretimi.
5. **Simülasyon / dry-run**: "Bu koşulu kaydedersem bugün kaç kullanıcı anında kazanır ve toplam kaç puan basılır?" — ekonomi invaryantları açısından kritik (puan basan her yol önceden ölçülmeli).
6. **Manuel ver/geri al + test kullanıcısında önizleme** (Retool aksiyon deseni): seçili rozeti belirli bir kullanıcıya ver, reveal animasyonunu test hesabında tetikle (şu an `/admin/users` bulk ve `/admin/character-test` dağınık).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Rozet kataloğu bir ürün kataloğudur." Admin ilk bakışta sağlıksız rozetleri (izlenemez, hiç kazanılmamış, aşırı kolay kazanılan) görür, tek tıkla filtreler, sağdan açılan çekmecede rozeti düzenler ve kaydetmeden önce etkisini (kaç kişi hemen kazanır, kaç puan basılır) görür. Yıkıcı işlemler yoktur; arşivleme vardır.

**Yerleşim:**
- Üstte ince başlık (hero küçültülmüş) + birincil CTA "Yeni rozet".
- **Sağlık çubuğu:** tek satır segmentli çip grubu — `Tümü 128 · Tam 61 · Yaklaşık 9 · Karakter 43 · İzlenemez 3 · Pasif 5 · Hiç kazanılmamış 22`; her çip filtre.
- **Araç çubuğu:** Normal/Dizi segment kontrolü (Radix Tabs), arama (ad+açıklama+tip), nadirlik/kategori/durum çoklu filtre, sıralama, görünüm (Tablo | Galeri). Durum URL'de.
- **Ana alan (varsayılan Tablo):** 56px satırlar: ikon (40px), ad + açıklama, nadirlik chip, koşul ("🎯 Toplam yorum ≥ 10"), ödül ("+150"), maliyet, kazanım sayısı + mini sparkline (son 30 gün), izlenebilirlik, durum, ⋯ menü. Çoklu seçim + yapışkan toplu işlem çubuğu.
- **Galeri görünümü:** mevcut kartların sadeleştirilmiş hâli (dekor yalnız hover'da, starfield yok).
- **Detay/Editör çekmecesi (Sheet, mobilde tam ekran):** sekmeler `Genel` (ad, açıklama, ikon seçici + R2 yükleme), `Kazanım` (koşul, hedef, simülasyon sonucu), `Ödül & Ekonomi` (rewardPoints, pointCost, görünürlük sınıfı), `Görünüm` (renk + gerçek müşteri kart önizlemesi, açık/koyu tema yan yana), `Etkinlik` (kazanım grafiği, son kazananlar, audit diff). Kaydet çubuğu "kaydedilmemiş değişiklikler" durumunu gösterir.

**Motion / 3D (ölçülü):** Liste için yalnız 150ms opaklık geçişi; satır ekleme/kaldırma `layout` animasyonu. Çekmece kayarak açılır. Tek "an": Görünüm sekmesindeki önizleme kartında efsanevi/epik rozet için mevcut parıltı efekti ve isteğe bağlı "Reveal'i önizle" butonu (müşterideki açılış animasyonunun aynısı — ayrı bir bileşen çağrısı, admin'e özgü yeni 3B yok). Sayfa geneline sürekli animasyon (pulse, starfield) konmaz; `MotionConfig reducedMotion="user"` korunur.

**Veri / API değişiklikleri:**
- Yeni `app/api/admin/badges/route.ts` (GET liste: cursor sayfalama, `q`, `rarity[]`, `status`, `trackability`, `sort`; POST) ve `[id]/route.ts` (PATCH, POST `archive`/`restore`), hepsi `requireAuth(['ADMIN'])` + paylaşılan zod şeması. Müşteri ucu `/api/gamification/badges` yalnız `me` ile çalışır.
- Şema: `Badge.rewardPoints Int?`, `Badge.archivedAt DateTime?`, `Badge.visibility String @default("surprise")`, isteğe bağlı `rarityRank Int`. `badgeRewardPoints()` önce DB'yi okur, metin tablolarına düşer (geriye dönük). Göç canlı Neon'da `prisma db push`/migration ile planlı yapılmalı.
- `GET /api/admin/badges/[id]/stats`: 30 günlük kazanım serisi, son 20 kazanan, eşiğe yakın kullanıcı sayısı (tek `GROUP BY` sorgusu; Upstash'te 5 dk cache).
- `POST /api/admin/badges/simulate`: verilen `{type, value, rewardPoints}` için anında kazanacak kullanıcı sayısı ve toplam puan — `lib/surprise-badges.ts` sayaçlarını salt-okunur kullanır.
- Karakter motoru: aday havuzunu `isActive && !archivedAt` ile kesiştir.
- İkon yükleme: R2.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/users` (rozet ver):** `app/admin/users/users-client.tsx:328-338, 391-395` aynı GET ucunu `admin=1` olmadan kullanıyor → karakter rozetleri orada atanamıyor ve aynı IDOR yüzeyine bağlı. Manuel ver/geri al işlemi bu sayfanın detay çekmecesine taşınmalı ("Kazananlar" sekmesi + "Kullanıcıya ver"); `/admin/users` yalnızca kullanıcının rozetlerini salt-okunur göstermeli.
- **`/admin/character-thresholds`** (kategori eşikleri) ve **`/admin/character-test`** (reveal testi): ikisi de dizi rozetlerinin parçası. "Dizi Rozetleri" sekmesinin içine alt sekmeler olarak (`Karakterler · Eşikler · Test`) birleştirilmesi önerilir; ayrı kenar çubuğu girdileri (`components/dashboard/sidebar.tsx:166, 210`) tek "Rozetler" girdisine iner.
- **`/admin/gamification-settings`** ve **`/admin/rewards`:** farklı amaçlar (genel oyunlaştırma ayarları, ödül mağazası) — birleştirme gerekmez, ama `pointCost`/mağaza kararı (Bulgu 12) `rewards` sayfasıyla birlikte verilmeli; "puanla satın alınabilir rozet" bir ödül mağazası kalemi olarak orada yönetilebilir.
- Sayfa kaldırılmamalı: rozet kataloğunun tek yönetim yeri; ancak yukarıdaki yeniden tasarımla "Rozetler" alanının merkezi olmalı.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur; kod değiştirilmedi, veritabanına/sunucuya dokunulmadı. Her karar ilgili çağıran ve çağrılan kod baştan okunarak verildi.

### 1. Rozet silme onaysız hard delete ve tüm kullanıcı kazanımlarını kaskadla siliyor — **DOĞRULANDI** (önem: YÜKSEK)
- `app/admin/badges/badges-client.tsx:378-393` `handleDelete` doğrudan `DELETE` atıyor; dosyada `confirm`/`AlertDialog`/silme hedefi state'i yok (grep boş). Çağrı noktaları `:1117` (liste) ve `:1246` (galeri), sekmeden bağımsız, yani Dizi sekmesinde de aktif.
- `app/api/gamification/badges/[id]/route.ts:127` `prisma.badge.delete`; `prisma/schema.prisma:638` `UserBadge.badge ... onDelete: Cascade`. Audit kaydı (`:130-139`) yalnız Badge satırını saklıyor, silinen `UserBadge` satırlarını saklamıyor, dolayısıyla kazanımlar geri getirilemez.
- **Denetçinin atladığı ve etkiyi büyüten nokta:** karakter rozetinde silmenin ardından `lib/character-badges.ts:109-126` `ensureCharacterBadgeRecord` kaydı katalogdan yeniden yaratıyor. `pickCharacterInCategory` (`:175-190`) adayları DB'den değil katalogdan (`lib/character-categories.ts:234-239`) aldığı için, karakteri kaybetmiş kullanıcıda aynı karakter tekrar "alınmamış" görünüyor. Atama tx'indeki `takenNow` sayımı da (`:448-450`) düştüğü için eşik yeniden "hazır" oluyor. Yeniden atamada `creditBadgeRewardInTx(... justCreated: true)` (`:475-481`) ödül puanını **ikinci kez** basıyor. Bu, puan ekonomisinin "tek seferlik kredi" invaryantını admin eylemiyle deliyor.
- **Yeniden üretim:** Admin, Dizi sekmesinde N kullanıcının sahip olduğu bir karakter rozetinin çöp kutusuna bir kez tıklar. Onay sorulmaz ve N kullanıcının koleksiyonundan rozet kalıcı olarak silinir. Bu kullanıcılardan biri `/api/customer/character` reveal'ini (`route.ts:146`) tetiklediğinde aynı karakteri katalog varsayılanlarıyla yeniden kazanır ve ödül puanını ikinci kez alır.
- Öneri, raporun ana bölümündeki yaklaşımla aynı: hard delete yerine `archivedAt`/`isActive=false` ile arşivleme, gerçek silme yalnız `earnedCount===0` iken ve adı yazdırarak onaylatan bir dialogla yapılmalı. Karakter rozetinde silme API'de tamamen reddedilmeli.

### 2. Puan Ödülü formu hiçbir yere yazılmıyor; API 'points' alanı aslında targetValue — **DOĞRULANDI** (önem: YÜKSEK, veri bütünlüğü ve yanıltıcı arayüz)
- `prisma/schema.prisma:604-628` Badge modelinde ödül alanı yok.
- `badges-client.tsx:327-330` `buildPayload` her zaman `requirement` nesnesini gönderiyor. Bu yüzden `route.ts:312` ve `[id]/route.ts:72-74` içindeki `body.points` yedek kolu **hiçbir zaman** çalışmıyor; formdaki "Puan Ödülü" (`:628-635`) tamamen ölü bir alan.
- GET `route.ts:239` `points: targetValue` döndürüyor. Admin kartı `:1105`/`:1220` ve düzenleme formu `:448` bu değeri "ödül" diye gösteriyor; müşteri kartı `app/customer/badges/badges-client.tsx:492` `+{badge.points} puan` yazıyor.
- Gerçek ödül `lib/badge-reward-points.ts:25-31`'de badgeId ile `EMOJI_BADGE_TEXTS`/karakter metin tablolarından geliyor (`lib/emoji-badge-texts.ts:200-203`). Admin'in oluşturduğu rozetlerin cuid id'si bu tablolarda olmadığından ödülleri 0.
- **Yeniden üretim:** Admin "Puan Ödülü=500", koşul "feedback_count ≥ 10" ile bir rozet oluşturur. Kayıtta 500 hiçbir yerde yok. Kart "★10" gösterir. Kazanan müşteri kartta "+10 puan" görür ama hesabına 0 puan yatar.

### 3. GET /api/gamification/badges?userId=<id> oturumsuz başka kullanıcının verisini döndürüyor — **DOĞRULANDI**, önem iddia edilenden düşük (ORTA)
- `route.ts:81-87` `userIdParam` oturumla eşleştirilmiyor. `proxy.ts:105-118` `/api/*` için oturum zorunlu tutmuyor, yalnız başlık ekliyor. `:147-183` hedef kullanıcının `UserBadge`'lerini ve sayaçlarını okuyor. `:276` yalnız **kazanılmış** rozetleri döndürüyor (earnedAt zaman damgasıyla, `hiddenUntilEarned` sürpriz rozetler dahil). `:287-291` `userProgress` + `userPoints` dönüyor.
- **Somut senaryo:** Oturumsuz saldırgan `GET /api/leaderboard?category=badges` çağırır. Bu uç oturum istemiyor ve `app/api/leaderboard/route.ts:112` `id` döndürüyor. Gelen id ile `GET /api/gamification/badges?userId=<id>` çağrılınca kullanıcının kazandığı rozetler, kazanma zamanları ve `questsCompleted` sayısı açığa çıkar.
- **Önemi neden düşük:** puan, seviye ve feedback sayısı zaten aynı leaderboard ucunda ad ve görselle birlikte herkese açık (`leaderboard/route.ts:112-120`). Ek sızıntı, rozet listesi/zamanları ile görev sayısından ibaret. Karakter rozetleri müşteri modunda zaten hariç (`:114-118`).
- Alt iddia `GET /api/gamification/badges/[id]` (`[id]/route.ts:13-34`) oturumsuz ve ham kayıt veriyor; bu doğru. Ancak dönen şey kullanıcı verisi değil, katalog tanımı (ad/açıklama/ikon/`requirement`/kazanan sayısı). Etkisi "sürpriz bozma" seviyesinde (ORTA-DÜŞÜK).
- Düzeltme: `userId` yalnız `me` veya ADMIN için kabul edilmeli. Meşru tüketici olan `app/admin/users/users-client.tsx:393` admin oturumuyla zaten çalışır.

### 4. Karakter (dizi) rozetinde isActive=false kazanımı durdurmuyor — **DOĞRULANDI** (önem: YÜKSEK, admin kontrolü fiilen yok)
- `lib/character-badges.ts:175-190` aday havuzu `charactersInCategory` (`lib/character-categories.ts:234-239`, statik `CHARACTER_PROFILES`). DB'deki `Badge.isActive` hiç okunmuyor. `lib/character-badges.ts` içinde `isActive` yalnız `:121`'de, yeni kayıt yaratırken `true` olarak geçiyor. Atama tx'i (`:436-483`) ve `revealReadyCategoryBadge` (`:411-416`) de bakmıyor. Çağıran `app/api/customer/character/route.ts` da filtre uygulamıyor (`isActive` grep sonucu boş).
- UI notu `badges-client.tsx:957-961` ("Silmek yerine pasif yapılabilir") admin'i yanlış güvenceye itiyor ve 1. bulgudaki tehlikeli silmeye tek "güvenli" alternatif olarak işlevsiz bir seçeneği sunuyor.
- **Yeniden üretim:** Admin bir karakteri Dizi sekmesinden "Pasif" yapar. Kategorisi eşiğe ulaşan müşteri reveal'de bu karakteri yine kazanır ve ödül puanı yine yatar.

### 5. Rozet ikon yükleme Vercel serverless'ta public/ altına writeFile yapıyor — **DOĞRULANDI** (kod ve platform davranışı; canlıda çalıştırılmadı)
- `app/api/admin/assets/upload/route.ts:81-85` `process.cwd()/public/images/uploads/<folder>` altına `mkdir` + `writeFile` yapıyor. `vercel.json` dağıtımın Vercel'de (`framework: nextjs`, `regions: fra1`) olduğunu gösteriyor.
- Vercel Functions'ta `/tmp` dışındaki dosya sistemi salt okunur, bu yüzden `mkdir`/`writeFile` EROFS hatası verir. Hata `:89-91` catch'inde "Dosya yüklenemedi" ile 500'e dönüşür. Yazma başarılı olsa bile `public/` build anında CDN'e alındığı için dosya servis edilmez.
- Projede `lib/r2-storage.ts` hazır duruyor (inbox ekleri R2'de), dolayısıyla çözüm altyapısı mevcut: yüklemeyi R2'ye yapıp HTTPS URL döndürmek ve `next.config` `images.remotePatterns`'a R2 alanını eklemek yeterli.
- **Yeniden üretim (beklenen):** Canlıda admin, rozet formunda bir PNG seçer, toast'ta "Dosya yüklenemedi" görür ve sunucu logunda EROFS çıkar. Bu adım canlıda çalıştırılarak doğrulanmadı. Karar, kod ve belgelenmiş platform kısıtına dayanıyor.

### Özet
| # | İddia | Karar | Not |
|---|---|---|---|
| 1 | Onaysız hard delete + kaskad | Doğrulandı | Ek bulgu: karakter rozetinde silme, yeniden kazanım ve **çift ödül puanı** yolunu açıyor |
| 2 | Puan Ödülü ölü alan, `points`=targetValue | Doğrulandı | Müşteriye yanlış "+N puan" vaadi |
| 3 | `?userId=` IDOR | Doğrulandı (önem ORTA) | id'ler herkese açık leaderboard'dan alınabiliyor; puan/seviye zaten açık, ek sızıntı rozet listesi ve zamanları |
| 4 | Dizi rozetinde isActive etkisiz | Doğrulandı | UI notu yanıltıcı |
| 5 | public/ altına writeFile | Doğrulandı (canlıda denenmedi) | R2 altyapısı hazır |

---

## Uygulama (Dalga 2)

**Yeni yapı:** `/admin/badges` = **Katalog · Eşikler · Test lab** (SectionTabs, `?tab=`). `/admin/character-thresholds` → `?tab=esikler`, `/admin/character-test` → `?tab=test` kalıcı yönlenir (sorgu korunur). Sunucu önce (`app/admin/badges/page.tsx`: `requireAuth` + katalog/sağlık sayıları/eşikler sunucuda, istemci `initialData`), istemci adası `components/admin/a-rozetler/**`, Test lab `next/dynamic` ile yalnız sekmesi açılınca yüklenir. BFF: `app/api/admin/badges/**` (hepsi `defineRoute`, ADMIN + DB rolü + zod + hız sınırı). Sunucu çekirdeği: `lib/admin-badges/{contract,server,thresholds.server,lab.server}.ts`. Testler: `__tests__/admin/a-rozetler/*` (26 test).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa kabuğu | ÇALIŞIYOR | `ssr:false` kabuk + çift iskelet kaldırıldı; sunucu bileşeni + tek Suspense iskeleti. |
| 2 | Yetki | ÇALIŞIYOR | Sayfada da `requireAuth(['ADMIN'])` (DB rolü); BFF'ler `defineRoute`. |
| 3 | Hero başlığı | ÇALIŞIYOR | QDL `PageHeader` (ops kaydı), tam Türkçe. |
| 4 | KPI: Toplam kazanım | ÇALIŞIYOR | Toplam + son 30 gün özet satırı. |
| 5–8 | KPI: Tam/Yaklaşık/Karakter/İzlenemez | ÇALIŞIYOR | Tek sağlık şeridi; her kutu `health=` süzgeci uygular; sayılar aktif sekmeye (Normal/Dizi) göre. |
| 9 | Nadirlik istatistik kartları | KALDIRILDI | Tekrar eden ikinci şerit; nadirlik süzgeci + sütun + sıralama yeterli (Bulgu 9). |
| 10 | Normal / Dizi sekmesi | ÇALIŞIYOR | Radix `SectionTabs` (`role=tab`), emoji yok. |
| 11 | Dizi alt-kategori | ÇALIŞIYOR | `lib/character-categories`'den türer, süzgeç. |
| 12 | "Pasif yapılabilir" notu | ÇALIŞIYOR | Pasifleştirme motorda gerçekten uygulanır (`inactiveCharacterIds`). |
| 13 | Arama | ÇALIŞIYOR | Ad + açıklama + kimlik + koşul etiketi + dizi adı; sunucuda, Türkçe harf duyarsız. |
| 14 | Nadirlik filtresi | ÇALIŞIYOR | URL'de kalıcı. |
| 15 | Grid/Liste geçişi | KALDIRILDI | Yoğun tablo + mobilde otomatik kart; dekoratif galeri ops yüzeyinde gereksiz (Bulgu 13). |
| 16 | Yeni rozet diyaloğu | ÇALIŞIYOR | `EntityEditorSheet`; her açılışta `reset` → kalıntı sızmaz (Bulgu 6). |
| 17 | Ad | ÇALIŞIYOR | zod 2–60 (istemci + sunucu aynı şema). |
| 18 | Açıklama | ÇALIŞIYOR | ≤ 300. |
| 19 | İkon yükleme | ÇALIŞIYOR | Ortak R2 yükleme ucu (HTTPS URL), hata görünür. |
| 20–21 | İkon arama + galeri | ÇALIŞIYOR | Galeri `lib/badge-catalog.ts`'ten türer; `role=option`/`aria-selected`. |
| 22 | Kategori | ÇALIŞIYOR | Tek taksonomi (`BADGE_CATEGORIES`), PATCH de doğrular; detayda gösterilir. |
| 23 | Nadirlik | ÇALIŞIYOR | Enum; geçersiz değer 400 (çökme yolu kapandı). |
| 24 | "Puan Ödülü" (SAHTE) | KALDIRILDI | Sahte alan çıktı; gerçek ödül (`badgeRewardPoints`) tablo/detayda salt-okunur. Düzenlenebilir ödül için ŞEMA İSTEĞİ. |
| 25 | Puanla açma maliyeti | KALDIRILDI | Satın alma 410 (tam sürpriz); eski değer detayda "kullanılmıyor". |
| 26–28 | Koşul türü/hedef/ipucu | ÇALIŞIYOR | Düzenlemede birleştirilir (`period/metadata` korunur, Bulgu 7). |
| 29–31 | Vurgu/arka plan/sıfırla | ÇALIŞIYOR | Hex alan hatası; arka plan vurgu olmadan uygulanmaz uyarısı. |
| 32 | Canlı önizleme | ÇALIŞIYOR | DS `BadgeGlyph` + `RarityBadge` (müşteri kitiyle aynı primitif). |
| 33 | Aktif anahtarı | ÇALIŞIYOR | Karakter rozetlerinde de etkili. |
| 34 | "Müşteride gizli" anahtarı | KALDIRILDI | Tam sürpriz politikasında etkisizdi; formda politika özeti. |
| 35 | İptal | ÇALIŞIYOR | Kirli formda kapatma onayı. |
| 36 | Oluştur | ÇALIŞIYOR | Gönderim kilidi + `Idempotency-Key`. |
| 37 | Düzenle | ÇALIŞIYOR | Ayrıntı çekmecesinden; her açılışta sıfırlanır. |
| 38 | Güncelle | ÇALIŞIYOR | zod, koşul birleştirme, sunucu hataları alanlara. |
| 39 | Sil (tehlikeli) | ÇALIŞIYOR | Silme yok → arşiv; `dryRun` etki, kazanan varsa 409 + adı yazarak onay; karakterde engelli; geri al (pasif döner). |
| 40 | "N kişi kazandı" | ÇALIŞIYOR | Detayda son 20 kazanan → Kullanıcı 360. |
| 41 | Yıldızlı "puan" (BOZUK) | ÇALIŞIYOR | Ayrı sütunlar: Koşul (hedef) · Ödül (gerçek puan). |
| 42 | İzlenebilirlik rozeti | ÇALIŞIYOR | `StatusBadge` (ikon + metin). |
| 43 | Pasif etiketi | ÇALIŞIYOR | Durum sütunu her görünümde. |
| 44 | Kart aksiyonları (hover) | ÇALIŞIYOR | Satır → ayrıntı çekmecesi; aksiyonlar görünür düğmeler (≥ 44px). |
| 45 | Yükleniyor | ÇALIŞIYOR | QueryState/DataTable iskeleti. |
| 46 | Boş durum | ÇALIŞIYOR | Filtre boşu (Filtreleri temizle) ile katalog boşu ayrı. |
| 47 | Hata durumu | ÇALIŞIYOR | Görünür hata + Tekrar dene. |
| 48 | Toast'lar | ÇALIŞIYOR | `sonner`, Türkçe, öneksiz. |
| 49 | Stagger | KALDIRILDI | Ops kaydında yoğun tabloda stagger yok (§4.2). |
| 50 | Starfield/neon/pulse | KALDIRILDI | Ops yüzeyinde sürekli animasyon yasak; 3B yalnız Test lab önizlemesinde. |
| 51 | Mobil | ÇALIŞIYOR | Mobil kart tablo, tam ekran çekmece, ≥ 44px hedefler. |
| 52 | Denetim kaydı | ÇALIŞIYOR | Yazmayla aynı tx; detayda "Değişiklik geçmişi". |
| 53 | Sıralama | ÇALIŞIYOR | Ad, nadirlik (anlamlı sıra), kazanım, son kazanım. |
| 54 | Toplu işlem | ÇALIŞIYOR | Etkinleştir/pasifleştir/arşivle (karakter/arşiv atlanır, denetimli). |
| 55 | Detay / kazananlar / seri | ÇALIŞIYOR | 30 günlük İstanbul günü sparkline, kazananlar, geçmiş. |
| 56 | Sayfalama | ÇALIŞIYOR | Sunucu sayfalama. |
| 57 | Kopyala / taslak / zamanlı yayın | ÇALIŞIYOR (çoğalt) | Çoğalt pasif kopya üretir; taslak/zamanlı yayın şema ister (kalan). |

### Kapanan bulgular (15/15)
1 arşiv + onay + karakter engeli · 2 sahte ödül alanı kaldırıldı, hedef/ödül ayrı · 3 admin ayrı BFF; `GET /api/gamification/badges/[id]` yalnız ADMIN · 4 karakter pasifleştirme `pickCharacterInCategory` + ilerleme havuzundan dışlar · 5 R2 yükleme · 6 form her açılışta sıfırlanır · 7 zod + idempotency + koşul birleştirme (eski POST/PATCH da aynı servise bağlandı) · 8 görünür aksiyonlar, aria, sekmeler · 9 tek, tıklanabilir sağlık şeridi · 10 hata ≠ boş · 11 bileşen klasörü, tek doğruluk kaynakları, ölü `badges/algorithm` uçları silindi · 12 pointCost/gizli alanlar kaldırıldı, politika metni · 13 dekor yok, sayfalama · 14 Türkçe, nadirlik sırası · 15 BadgeGlyph önizleme, arka plan uyarısı.

### Eksik özelliklerden uygulananlar
Yoğun tablo + sıralama + sunucu arama/sayfalama + URL durumu; detay çekmecesi; denetim izi UI; toplu işlem + çoğalt; manuel ver (gerekçeli, puan basmaz, denetimli); Test lab'da 3B rozet anı önizlemesi.

### Kalanlar
- Simülasyon ("bu koşulla kaç kişi anında kazanır"): sayaçlar kullanıcı başına ayrı sorgu; toplu hesap için sayaç tabloları gerekir. Sahte sayı gösterilmedi.
- Rozeti kullanıcıdan geri alma: ürün kararı + ödül iadesi kuralı gerekli.
- Taslak / zamanlanmış yayın: şema gerekir.
- Görsel doğrulama headless tezgâhta yapılmadı (dev server/build bu görevde yasak).

### ŞEMA İSTEKLERİ
- `Badge.rewardPoints Int?` — panelden düzenlenebilir ödül puanı (`badgeRewardPoints()` önce DB'yi, yoksa metin tablosunu okur).
- İsteğe bağlı `Badge.publishAt DateTime?` — taslak ve zamanlanmış yayın.
