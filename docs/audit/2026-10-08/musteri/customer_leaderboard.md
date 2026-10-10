# /customer/leaderboard

**Amaç:** Müşterinin diğer müşterilerle puan, geri bildirim, rozet ve davet metriklerinde haftalık, aylık ve tüm zamanlar bazında kıyaslandığı genel sıralama ekranı. Sidebar'da "Oyunlar" grubu altında "Liderlik" adıyla yer alıyor (`components/dashboard/sidebar.tsx:313`). Müşteri ana sayfasındaki ilk-5 widget'ının "Tümü" bağlantısı da buraya geliyor (`components/customer/dashboard/customer-dashboard.tsx:1136`).

**Genel puan: 3.6 / 10** · **Karar: yeniden inşa** (sayfa kavramı doğru ve kalmalı; ama veri katmanı (API), gizlilik/fraud kuralları ve sayfanın durum yönetimi baştan yazılmalı. Görsel iskelet, yani podyum ve satırlar, büyük ölçüde korunabilir.)

> Kısa hüküm: Ekran görsel olarak "oyunlaştırılmış" duruyor (podyum, taç, parıltı). Ancak arkasındaki sayılar çoğu sekmede gerçeği yansıtmıyor:
> - Haftalık ve aylık "puan", gerçek puan defterinden (`points_credited`) değil, "geri bildirim başına 50 ya da 100" diye uydurulmuş bir formülden geliyor.
> - Geri bildirim, rozet ve davet kategorilerinde dönem sekmeleri hiçbir şeyi değiştirmiyor.
> - "Sıralaman" kartı haftalık sekmede tüm zamanlar sırasını gösterebiliyor.
> - En ağır sorun gizlilikle ilgili: Ayarlardaki **"Liderlik Tablosunda Göster" anahtarı hiçbir yerde okunmuyor**. Uç **oturum gerektirmiyor**; tam isimler, kullanıcı ID'leri, profil fotoğrafları ve dahili fraud bayrağı (`needsReview`) herkese açık dönüyor. `shadow_ban` durumundaki kullanıcılar da sıralamada kalıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Tüm zamanlar puan sıralaması doğru. Diğer 11 kombinasyonun (4 kategori × 3 dönem) çoğunda veri ya yanlış ya da dönemden bağımsız. 1-2 kişilik listeler hiç görünmüyor. Davet sayısı puan kategorisinde hep 0. |
| UX | 4/10 | Podyum ve "Sen" vurgusu iyi bir başlangıç. Ama kullanıcı ilk 50'de değilse kendi satırını göremiyor. Satırlar tıklanmıyor ama hover'da "tıklanabilir" gibi kalkıyor. Mobilde liste ekranın çok altına itiliyor. Hata, boş durum gibi sunuluyor. |
| Görsel | 6/10 | Podyum hiyerarşisi (2-1-3, taç, parıltı) duygusal olarak doğru. Satırlarda 4-10 için rastgele renk paleti, her satırda bir lig progress bar'ı ve üçlü istatistik görsel gürültü yaratıyor. Lig "ikonları" gerçek arma değil, sıradan avatar SVG'leri. |
| Mimari | 3/10 | 427 satırlık API'de dört kopya eşleme bloğu var. Dönem semantiği kategoriye göre farklı. Puan, gerçek defter yerine yaklaşık formülle hesaplanıyor. Sayfa `useEffect` + `fetch` ile istek iptali ve `res.ok` kontrolü olmadan çalışıyor. Gizlilik tercihi ve fraud durumu uca bağlanmamış. |
| Performans | 4/10 | Haftalık ve aylık yol, her istekte cache'siz `groupBy` + 5000'lik `IN` listesi + ham SQL + 3 ek sorgu çalıştırıyor. Ana sayfa bu ucu 60 sn'de bir otomatik yeniden çağırıyor. Puan dışı kategoriler 5000 kullanıcıyı `limit` başına ayrı cache girdisinde tutuyor. |
| Erişilebilirlik + Mobil | 4/10 | Avatar `img`'lerinde `alt` yok. Kategori düğmelerinde `aria-pressed`, aç/kapa düğmesinde `aria-expanded` yok. Podyumun DOM sırası 2-1-3. Açık temada `text-yellow-500` kontrastı düşük. 360 px genişlikte satırlarda isim alanı çok daralıyor. Sistem düzeyinde azaltılmış hareket desteği global `MotionConfig` sayesinde kısmen var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Segment metadata'sı (sekme başlığı) | ÇALIŞIYOR | `app/customer/leaderboard/layout.tsx:4-6` | `segmentLayoutMetadata` ile i18n'li. |
| 2 | Masaüstü başlık (`DashboardPageHeading`) | ÇALIŞIYOR | `page.tsx:144-147`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex`; mobil kartla birlikte bilinçli bir desen, çift h1 sorunu yok. |
| 3 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:149-152` | Mobilde dikey alan harcıyor (bkz. B12). |
| 4 | Banner: kullanıcı avatarı | KISMİ | `page.tsx:166-171` | Oturumdaki görsel kullanılıyor. Listede aynı kullanıcı görseli yoksa rastgele avatarla, banner'da baş harflerle görünüyor (#41 ile tutarsız). Kuşanılmış çerçeve kozmetiği (`equippedFrame`) kullanılmıyor. |
| 5 | Banner: ad | ÇALIŞIYOR | `page.tsx:177` | — |
| 6 | Banner: seviye rozeti | KISMİ | `page.tsx:181`, `lib/auth.ts:212-276` | `session.user.level` yalnızca girişte doluyor ve bayatlıyor (B9). |
| 7 | Banner: lig rozeti | KISMİ | `page.tsx:99,185`, `lib/utils.ts:142-144` | `DEFAULT_LEAGUE_RULES` kullanılıyor. Admin lig kurallarını değiştirdiyse API'nin (`getLeagueRules`) döndürdüğü ligle çelişiyor. Puan da bayat. |
| 8 | Banner: "Sıralaman #N" | BOZUK | `page.tsx:197`, `route.ts:355-381` | Haftalık/aylık sekmede kullanıcı listede değilse **tüm zamanlar** puanına göre sıra hesaplanıyor. Puan dışı kategorilerde 5000'in dışındaysa "#?" görünüyor (B5). |
| 9 | İlk 10 ise alev animasyonu | ÇALIŞIYOR | `page.tsx:198-205` | Sonsuz döngü. Sistem azaltılmış hareket ayarında `MotionConfig reducedMotion="user"` transform'u kapatıyor (`components/providers.tsx:231`). |
| 10 | "/ N kişi" toplam kullanıcı | KISMİ | `page.tsx:207`, `route.ts:401` | "kişi" sabit TR. Puanı 0 olanlar dahil tüm müşterileri sayıyor; haftalık sıralamanın paydası değil. |
| 11 | Banner: toplam puan | KISMİ | `page.tsx:217`, `lib/auth.ts:241,275` | JWT yalnız girişte ve `update({points})` çağrısında yenileniyor; bu çağrıyı yapan tek yer bağış akışı (`app/customer/donations/donations-client.tsx:236`). Kullanıcı oyun oynayıp puan kazandıktan sonra bu sayfada eski puanı görür. |
| 12 | Banner: dönem · kategori etiketi (sm+) | KISMİ | `page.tsx:224-229`, `route.ts:85-90,159,414` | Etiketler API'den sabit TR geliyor ("Bu Hafta", "Geri Bildirim"); EN kullanıcı Türkçe görür. |
| 13 | Kategori panelini aç/kapa | KISMİ | `page.tsx:238-250` | Çalışıyor ama `aria-expanded` / `aria-controls` yok. Tercih hatırlanmıyor, varsayılan açık. |
| 14 | Kategori seçimi (4 kart) | KISMİ | `page.tsx:253-276` | Seçim çalışıyor. `aria-pressed` yok, URL'e yazılmıyor, hızlı geçişte yarış koşulu var (B7). |
| 15 | Kategori: Puan | KISMİ | `route.ts:166-349` | Tüm zamanlar doğru. Haftalık/aylık sahte formül (#20). Açıklama metni "Tüm puan kazanımları topluca değerlendirilir" diyor (`messages/tr.json` `categoryPointsDesc`); bu da yanlış. |
| 16 | Kategori: Geri Bildirim | KISMİ | `route.ts:41-42,29` | Dönemi yok sayıyor. `_count.feedbacks` soft-delete edilmiş (`deletedAt`) ve `trustFlagged` geri bildirimleri de sayıyor. |
| 17 | Kategori: Rozet | KISMİ | `route.ts:43-44` | Dönemi yok sayıyor. |
| 18 | Kategori: Davet | KISMİ | `route.ts:45`, `prisma/schema.prisma` `model Referral.status` | `PENDING` ve `EXPIRED` davetler de sayılıyor; sahte kayıtla şişirilebilir. Dönemi yok sayıyor. |
| 19 | Dönem sekmeleri (Haftalık / Aylık / Tüm Zamanlar) | BOZUK | `page.tsx:282-296`, `route.ts:102-164` | Puan dışı 3 kategoride `period` hiç kullanılmıyor. Sekme değişince aynı liste yeniden yükleniyor ama etiket "Bu Hafta" ↔ "Bu Ay" diye değişiyor (B4). |
| 20 | Haftalık/aylık puan hesabı | SAHTE | `route.ts:296-308` | `length(text) > 50 ? 100 : 50`. Gerçek ödül matrisi, VIP/sezon/global çarpanlar, günlük/haftalık tavan (`app/api/feedbacks/route.ts:282-336`), oyun/rozet/giriş serisi/davet puanları yok sayılıyor. Silinmiş ve trust bayraklı geri bildirimler dahil (B3). |
| 21 | Dönemde hiç geri bildirim yoksa geri dönüş listesi | SAHTE | `route.ts:233-275` | Tüm zamanlar puan listesi "Bu Hafta" etiketiyle gösteriliyor; kullanıcıya haftanın liderleri gibi sunuluyor. |
| 22 | Veri çekme ve durum yönetimi | BOZUK | `page.tsx:67-97` | `res.ok` kontrolü yok, `AbortController` yok, istek sıra koruması yok. Hata ya da 403/500/503'te önceki sekmenin verisi yeni sekmenin başlığı altında kalıyor (B7). |
| 23 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:299-309` | Her sekme değişiminde tüm içerik iskelete dönüyor ve önceki veri bekletilmiyor; titreşim yaratıyor. |
| 24 | Hata durumu | EKSİK | `page.tsx:92-94` | Yalnızca `console.error`. Kullanıcıya mesaj ya da yeniden dene düğmesi yok. |
| 25 | Boş durum | KISMİ | `page.tsx:633-643` | Yalnızca `length === 0` iken çıkıyor. Hata ya da modül kapalı (`assertModuleEnabled('rewards')`, `route.ts:76-77`) durumunda da aynı "henüz veri yok" anlatımı veriliyor (ilk yüklemede hata olursa liste boş kalır). |
| 26 | Podyum (ilk 3) | ÇALIŞIYOR | `page.tsx:313-497` | Yalnızca liste ≥3 iken render ediliyor. |
| 27 | 1 ya da 2 kişilik liste | BOZUK | `page.tsx:313,510,633` | Podyum gizli, `slice(3)` boş, boş durum da çıkmıyor (`length !== 0`). Ekranda yalnızca "Sıralama · 2 Oyuncu" başlığı görünüyor, hiçbir kişi yok (B6). |
| 28 | Podyum mikro-animasyonları (taç sallanması, parıltı, nabız) | ÇALIŞIYOR | `page.tsx:383-410` | 3 ayrı sonsuz döngü. OS azaltılmış hareket ayarında transform kapanıyor. Uygulama içi "Animasyonları azalt" sınıfı (`app/globals.css:825-831`) yalnızca CSS animasyonlarını durduruyor; framer'ın JS döngülerine etkisi doğrulanmadı. |
| 29 | Podyum skor + geri bildirim/rozet sayıları | ÇALIŞIYOR | `page.tsx:351-367,417-433,472-488` | Davet sayısı podyumda yok, satırlarda var; tutarsız. |
| 30 | 1. için lig rozeti ("Lv. X · Lig") | KISMİ | `page.tsx:435-438` | "Lv." sabit kodlu (i18n anahtarı `lvlShort` var ama kullanılmamış). Lig ikonu gerçek arma değil (#36). |
| 31 | Podyumda "bu sensin" vurgusu | EKSİK | `page.tsx:326-494` | `isCurrentUser` yalnızca satırlarda kullanılıyor. Podyumdaki kullanıcı kendini işaretli göremiyor. |
| 32 | 4-50 arası liste satırları | ÇALIŞIYOR | `page.tsx:509-629` | — |
| 33 | 4-10 için sıra rengi paleti | ÇALIŞIYOR | `page.tsx:512-523` | 7 farklı keyfi gradyan; anlam taşımıyor (B13). |
| 34 | "Sen" rozeti + halka vurgusu | ÇALIŞIYOR | `page.tsx:533,559-576` | Kullanıcı ilk 50'de değilse hiçbir yerde görünmüyor (#42). |
| 35 | Satır seviye rozeti | ÇALIŞIYOR | `page.tsx:579-582` | — |
| 36 | Satır lig adı + ikon (sm+) | KISMİ | `page.tsx:583-586`, `lib/league-avatars.ts:7-15` | İkonlar sıradan avatar SVG'leri; KOR ligi için "BAYİ AVATAR", ETERON için "CAT" gibi yer tutucular. `hidden sm:inline flex` sınıf çakışması: sm üstünde `inline` kazanıyor, ikon ve metin hizalanmıyor. |
| 37 | Satır lig ilerleme çubuğu + "X için N puan" | KISMİ | `page.tsx:588-595` | Toplam puana göre hesaplanıyor, liste ise dönem puanı gösteriyor; aynı satırda iki farklı puan kavramı var. Başkalarının lig ilerlemesi bu ekranda gürültü. EN cümle yapısı bozuk ("Vetra for 1,234 points"). |
| 38 | Satır üçlü istatistik (geri bildirim/rozet/davet, md+) | BOZUK | `page.tsx:599-615`, `route.ts:197-213,255-274,326-346` | Puan kategorisinin üç yolu da `referralCount` döndürmüyor; davet sütunu Puan kategorisinde **her zaman 0**. |
| 39 | Satır skor + birim | ÇALIŞIYOR | `page.tsx:618-624` | Skor ikonu her kategoride sarı. |
| 40 | "N Oyuncu" sayaç rozeti | KISMİ | `page.tsx:504-506` | Liste uzunluğunu (en fazla 50) gösteriyor; katılımcı toplamı değil. |
| 41 | Görseli olmayanlara varsayılan avatar | SAHTE | `page.tsx:81-85` | Avatar kullanıcıya değil **satır indeksine** göre seçiliyor. Aynı kişi sekme değiştikçe farklı yüzle görünüyor, kimlik algısı bozuluyor. |
| 42 | İlk 50 dışındaysan kendi satırın (yapışkan "sen") | EKSİK | `route.ts:353-394,409` | API `currentUser` döndürüyor ama sayfa bunu hiç okumuyor. |
| 43 | Sayfalama / "daha fazla" / sıramın etrafını göster | EKSİK | `page.tsx:74` (`limit=50`) | — |
| 44 | Satıra tıklayıp profil / kıyas görme | EKSİK | `page.tsx:526-535` | `whileHover` ile kalkıyor ama tıklanamıyor; yanlış affordance. |
| 45 | "Liderlik Tablosunda Göster" gizlilik tercihine uyma | BOZUK | `app/customer/settings/page.tsx:1013-1019`, `app/api/customer/settings/route.ts:55,163,196`, `route.ts` (okunmuyor) | Tercih `Settings.user_settings_<id>` içine kaydediliyor ama leaderboard ucu onu hiç okumuyor (B1). |
| 46 | Fraud/şüpheli kullanıcıların sıralamadan çıkarılması | EKSİK | `route.ts:131,192,253,324`, `prisma/schema.prisma` `User.fraudStatus` | `needsReview` hesaplanıyor ama filtrelenmiyor, yalnızca yanıta ekleniyor. `fraudStatus: 'shadow_ban'` hiç kontrol edilmiyor (B2). |
| 47 | API kimlik doğrulaması | BOZUK | `route.ts:78` (oturum opsiyonel), `proxy.ts:105-118` (`/api/*` için auth yok) | Oturumsuz biri ilk 100 müşterinin adını, ID'sini, görselini ve puanını çekebiliyor (B1). |
| 48 | `needsReview` alanının istemciye sızması | BOZUK | `route.ts:137,212,273,345` | Dahili fraud sinyali herkese açık yanıtta; UI'da kullanılmıyor bile. |
| 49 | Modül kapısı (`rewards`) | KISMİ | `route.ts:76-77` | Sunucuda çalışıyor. Sayfa ise 403'ü "veri yok" olarak gösteriyor. Menü görünürlük kapısı (`assertMenuItemVisible('leaderboard', …)`) yok, oysa menü anahtarı tanımlı (`lib/visibility-controls.ts:101`). |
| 50 | Sıra değişim göstergesi (▲3 / ▼1) | EKSİK | — | Önceki dönem anlık görüntüsü tutulmuyor. |
| 51 | Dönem sonu geri sayımı + ilk N ödülü / terfi-düşme bölgesi | EKSİK | — | Haftalık lig hissi yok. |
| 52 | Arkadaş / ekip (squad) sıralaması | EKSİK | `lib/qra-knowledge-base.ts:31` | AI asistanın bilgi tabanı bu sayfayı "Genel ve **klan** sıralaması" diye tanıtıyor; sayfada klan sıralaması yok. Asistan kullanıcıyı yanıltıyor. |
| 53 | Seçili kategori/dönemin URL'de tutulması | EKSİK | `page.tsx:57-58` | Yenileyince ya da paylaşınca kayboluyor. |
| 54 | Canlı / periyodik yenileme | EKSİK | `page.tsx:67-69` | Yalnızca sekme değişiminde yenileniyor. |
| 55 | i18n kapsamı | KISMİ | `page.tsx:207,437`, `route.ts:85-90,159,414`, `lib/utils.ts:74` | Sabit "kişi", "Lv.", API etiketleri ve her zaman `tr-TR` sayı biçimi. "Siz" (resmi) ve "Rekabet et" (samimi) hitapları karışık. |
| 56 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:231`, `app/globals.css:825-831` | OS tercihi transform döngülerini durduruyor. Opaklık döngüsü (`page.tsx:405`) ve uygulama içi tercih için framer tarafı doğrulanmadı. |
| 57 | Eşit skorda kararlı sıralama (tie-break) | BOZUK | `route.ts:128,321` | `sort((a,b)=>b.score-a.score)` ikincil anahtar içermiyor. Eşit skorlu kullanıcılar istekten isteğe yer değiştirebilir ve farklı sıra numarası alır. |

**Durum dağılımı (tablodan sayıldı):** ÇALIŞIYOR 14 · KISMİ 20 · BOZUK 9 · SAHTE 3 · EKSİK 11 = 57 kalem.

---

## Bulgular (önem sırasıyla)

### B1 · KRİTİK · Güvenlik/Gizlilik (KVKK): Opt-out yok sayılıyor ve uç herkese açık
- **Kanıt:**
  - `app/customer/settings/page.tsx:1013-1019`: "Liderlik Tablosunda Göster" anahtarı.
  - `app/api/customer/settings/route.ts:55,163,196`: Tercih `Settings` tablosuna yazılıyor.
  - `app/api/leaderboard/route.ts`: Dosyanın tamamında `showLeaderboard` ya da `user_settings_` okuması yok.
  - `route.ts:78`: Oturum zorunlu değil.
  - `proxy.ts:105-118`: `/api/*` istekleri yalnızca güvenlik başlıklarıyla geçiyor, auth yok.
  - `app/api/cron/cache-warm/route.ts:51`: Uç bilinçli olarak oturumsuz çağrılıyor.
- **Sorun:** Kullanıcı ayarlardan "liderlik tablosunda görünme" dese bile adı, fotoğrafı ve puanı listede kalıyor. Ayar ekranı kullanıcıya **yanlış bir güvence** veriyor. Ayrıca `GET /api/leaderboard?limit=100&category=…` ile oturum açmamış herhangi biri ilk 100 müşterinin tam adını (`User.name`, genellikle ad soyad), kalıcı kullanıcı ID'sini (cuid), OAuth profil fotoğraf URL'sini ve toplam müşteri sayısını alabiliyor. Bu, KVKK açısından "açık rıza dışı ifşa"ya ve iş verisi sızıntısına girer.
- **Öneri:**
  1. Ucu oturum zorunlu yap (`401`). Cache ısıtmayı HTTP üzerinden değil, doğrudan `getAlltimePointsRanking()` çağıran bir iç fonksiyonla yap.
  2. Görünürlük tercihini `User` modelinde birinci sınıf bir kolona taşı (`leaderboardVisible Boolean @default(true)`, indeksli). Tüm sıralama sorgularına `where: { leaderboardVisible: true }` ekle. JSON `Settings` satırı her sorguda okunamaz, filtrelenemez.
  3. Görünmez olmayı seçen kullanıcı kendi sırasını yine görmeli ("Gizli moddasın, sıran #14"), ama başkalarına görünmemeli.
  4. İsimleri varsayılan olarak maskele ("Furkan U."). Tam ad yerine bir `displayName/nickname` alanı ekle.
  5. Yanıttan `id`'yi çıkar ya da opak bir anahtar ver; `isCurrentUser` sunucuda hesaplanıyor zaten.
- **Efor:** M

### B2 · KRİTİK · Güvenlik/Veri bütünlüğü: Fraud bayrağı sızıyor, shadow-ban'lılar sıralanıyor
- **Kanıt:** `route.ts:131-138,192,212,253,273,324,345` (`needsReview` her satıra ekleniyor); `lib/points-velocity.ts:41-69`; `prisma/schema.prisma` `User.fraudStatus` ("clean" / "flagged" / "shadow_ban"); sıralama sorgularında `fraudStatus` filtresi yok (`route.ts:48,65,236,280`).
- **Sorun:** (a) Dahili "24 saatte 500+ puan → şüpheli" sinyali tüm müşterilere, hatta oturumsuz istemcilere açık. Kötü niyetli biri kendi hesabının eşiğe takılıp takılmadığını ölçerek fraud motorunu kalibre edebilir. (b) Fraud motorunun `shadow_ban` verdiği kullanıcılar zirvede kalmaya devam ediyor. Bu hem dürüst oyuncuları demotive eder hem de shadow-ban'ın amacını (sessiz izolasyon) boşa çıkarır.
- **Öneri:** `needsReview`'i istemci yanıtından tamamen çıkar; yalnızca admin ucunda kullan. Sıralama sorgularına `fraudStatus: 'clean'` (ya da `not: 'shadow_ban'`) filtresi ekle. Shadow-ban'lı kullanıcıya kendi görünümünde sırasını "normal" göstermek için ayrı bir yol yaz; shadow-ban'ın anlamı da budur. Velocity şüphelileri için "inceleme altında" durumunu sunucuda tut ve listeden çıkar.
- **Efor:** S

### B3 · KRİTİK · Veri bütünlüğü: Haftalık/aylık "puan" sahte formülle hesaplanıyor ve manipüle edilebiliyor
- **Kanıt:** `route.ts:296-308` (`SUM(CASE WHEN length("text") > 50 THEN 100 ELSE 50 END)`), `route.ts:217-224` (`deletedAt`/`trustFlagged` filtresi yok); gerçek kredi akışı `app/api/feedbacks/route.ts:282-336` (matris + VIP + sezon + global çarpan + tavan + `points_credited` olayı); doğru defter kullanımına örnek `app/api/customer/my-year/route.ts:65-70`.
- **Sorun:** Varsayılan sekme (Haftalık · Puan) gerçek puan defterini yansıtmıyor:
  - Oyunlar, rozet ödülleri, giriş serisi, davet, doğum günü ve sezon etkinlikleri hiç sayılmıyor.
  - Günlük/haftalık tavana takılıp cüzdana 0 puan yazılan geri bildirimler, leaderboard'a yine 50/100 puan olarak ekleniyor. Spam yorumla zirveye tırmanmak mümkün.
  - Admin'in sildiği ya da trust motorunun bayrakladığı yorumlar da sayılıyor.
  - Kategori açıklaması "Tüm puan kazanımları topluca değerlendirilir" diyor; ekranda yazan bu sözle çelişiyor.
- **Öneri:** Dönem puanını tek kaynak olan `AnalyticsEvent(event='points_credited')` defterinden `SUM((data->>'points')::int) GROUP BY "userId"` ile hesapla. Bu, [[points-economy-invariants]] ilkesiyle de uyumlu. Daha iyisi, kalıcı bir `LeaderboardPeriodScore(userId, periodKey, category, score)` tablosu: `creditPointsAndXp` içinde aynı transaction'da `upsert … increment` yapılır, okuma O(limit) olur. `(event, createdAt, userId)` indeksinin varlığı doğrulanmalı.
- **Efor:** M (defter sorgusu) / L (materyalize tablo)

### B4 · YÜKSEK · İşlevsellik: Puan dışı kategorilerde dönem sekmeleri etkisiz
- **Kanıt:** `route.ts:102-164` bloğu `period` ya da `startDate` kullanmıyor; yalnızca `periodLabel` döndürüyor (`route.ts:159`).
- **Sorun:** "Haftalık · Geri Bildirim" ile "Tüm Zamanlar · Geri Bildirim" aynı listeyi gösteriyor, ama etiket "Bu Hafta" diyor. 12 kombinasyonun 6'sı yanıltıcı. Yeni kullanıcı için "bu hafta kazanabilirim" motivasyonunu (Duolingo liglerinin temel mekaniği) öldürüyor.
- **Öneri:** Her kategori için dönem filtreli sayım yaz: `feedback.groupBy` (`createdAt ≥ start`, `deletedAt: null`, `trustFlagged: false`), `userBadge.groupBy` (`earnedAt ≥ start`), `referral.groupBy` (`status: 'COMPLETED'`, `completedAt ≥ start`). Ya da B3'teki materyalize tabloya kategori kolonunu ekle. Bir kategori için dönem anlamlı değilse UI sekmeleri devre dışı bırakmalı ve bunu açıkça söylemeli.
- **Efor:** M

### B5 · YÜKSEK · Veri doğruluğu: "Sıralaman" kartı yanlış sırayı gösteriyor
- **Kanıt:** `route.ts:358-381`: Kullanıcı top-N'de değilse `points: { gt: currentUser.points }` ile, yani **tüm zamanlar** puanıyla sayım yapılıyor. Puan dışı kategoride `findIndex` yalnızca ilk 5000'de arıyor (`route.ts:142-145`) → null → "#?" (`page.tsx:197`). Aynı değer ana sayfa widget'ında da kullanılıyor (`customer-dashboard.tsx:264-266`).
- **Sorun:** Haftalık sekmede 51. sıradaki biri "#3" ya da "#900" görebilir; sayı dönemle ilgisiz. Puanı 0 olan ve listede olmayan kullanıcı, her kategoride tüm zamanlar puan sırasını görüyor. Bu, oyunlaştırmanın en güvenilmesi gereken sayısı.
- **Öneri:** Sırayı listeyle aynı metrik ve aynı dönem üzerinden hesapla (`COUNT(*) WHERE score > myScore` + tie-break kuralı). API yanıtını `{ me: { rank, score, gapToNext, gapToTopN } }` biçiminde tekleştir. 0 skorda "henüz sıralamada değilsin + ilk adım CTA" göster.
- **Efor:** M

### B6 · YÜKSEK · İşlevsellik: 1-2 kişilik sıralamada kimse görünmüyor
- **Kanıt:** `page.tsx:313` (`length >= 3` ise podyum), `page.tsx:510` (`slice(3)`), `page.tsx:633` (boş durum yalnızca `length === 0`).
- **Sorun:** Yeni bir pilotta, hafta başında ya da az kullanıcılı bir kategoride ekran "Sıralama · 2 Oyuncu" yazıp hiçbir satır göstermiyor. Tam da büyümenin en kırılgan anında kullanıcıya bozuk görünüyor.
- **Öneri:** Podyumu 1-3 kişiye uyarlanabilir yap (boş podyum basamağı "Bu yer boş, ilk sen ol" CTA'sı olsun). Listeyi `slice(Math.min(3, len))` ile başlat.
- **Efor:** S

### B7 · YÜKSEK · Hata yönetimi: Yarış koşulu ve bayat veri
- **Kanıt:** `page.tsx:67-97`: `AbortController` ya da istek kimliği yok, `res.ok` kontrolü yok, `data.success === false` dalı sessiz.
- **Sorun:** Tüm zamanlar yolu cache'li ve hızlı, haftalık yol cache'siz ve yavaş. "Haftalık → Tüm Zamanlar" hızlı geçişinde geç gelen haftalık yanıt, Tüm Zamanlar sekmesinin üstüne yazılabilir. API 500/503/403 döndürürse önceki kategorinin listesi yeni kategori başlığı altında kalıyor. Kullanıcıya hata hiç söylenmiyor.
- **Öneri:** TanStack Query zaten provider'da var (`components/providers.tsx:205-217`). `useQuery({ queryKey: ['leaderboard', period, category], placeholderData: keepPreviousData })` ile otomatik iptal, cache, `isError` + "Yeniden dene", arka planda yenileme ve sekmeler arası anında geri dönüş elde edilir. Elle yazılmış `useEffect` kaldırılmalı.
- **Efor:** S

### B8 · YÜKSEK · Veri bütünlüğü: Davet ve geri bildirim sayımları şişirilebilir; davet sütunu Puan'da hep 0
- **Kanıt:** `route.ts:29` (`_count: { feedbacks, badges, referralsMade }` filtresiz); `Referral.status` PENDING/COMPLETED/EXPIRED; Puan yolları `referralCount` döndürmüyor (`route.ts:197-213,255-274,326-346`) ama satır onu gösteriyor (`page.tsx:611`).
- **Sorun:** Davet liderliğinde, hiç tamamlanmamış sahte kayıtlar da sayılıyor; bu bir fraud vektörü. Geri bildirim liderliğinde silinmiş ve trust bayraklı yorumlar sayılıyor. Puan kategorisinde her satırda "davet: 0" yazıyor; yanlış bilgi.
- **Öneri:** `_count: { select: { referralsMade: { where: { status: 'COMPLETED' } }, feedbacks: { where: { deletedAt: null, trustFlagged: false } } } }` (Prisma filtered relation count) kullan. Satır eşlemesini tek bir `toLeaderboardRow()` yardımcısında birleştir; dört kopya bloğun (`route.ts:106-127,194-214,255-275,326-347`) birbirinden ayrışması tam olarak bu hataya yol açtı.
- **Efor:** S

### B9 · ORTA · Veri doğruluğu: Banner puan/seviye/lig bayat ve farklı kurallarla hesaplanıyor
- **Kanıt:** `page.tsx:99,181,217`; `lib/auth.ts:212-276` (puan ve seviye yalnızca girişte ve `update` tetikleyicisinde yazılıyor); `lib/utils.ts:142-144` (`DEFAULT_LEAGUE_RULES`); API ise `getLeagueRules()` kullanıyor (`route.ts:79`).
- **Sorun:** Oyun ya da geri bildirimle puan kazanan kullanıcı burada giriş anındaki puanını görüyor. Admin lig eşiklerini değiştirdiyse banner'daki lig ile listedeki lig farklı çıkıyor.
- **Öneri:** Banner verisini API'nin `me` nesnesinden al (bkz. B5): canlı puan, sunucu kurallarıyla lig, ilerleme ve bir sonraki lig. Oturumdaki puan sayıları UI'da kaynak olarak kullanılmamalı.
- **Efor:** S

### B10 · ORTA · Performans: Cache'siz ağır haftalık yol ve 60 sn'lik otomatik çağrı
- **Kanıt:** `route.ts:217-308` (cache'siz `groupBy` + `findMany IN (≤5000)` + `$queryRaw IN (≤5000)`), `route.ts:360-380` (kullanıcı başına 2 ek sorgu), `route.ts:401` (her istekte `count`); `customer-dashboard.tsx:170,193` (`refetchInterval: 60_000` → açık her ana sayfa sekmesi dakikada bir bu ucu tetikliyor); `route.ts:38-59` (`limit` cache anahtarında ama fonksiyonda kullanılmıyor; aynı 5000 satır `limit=5` ve `limit=50` için iki kez cache'leniyor, üstelik 2 MB veri cache sınırına yakın olabilir, doğrulanmadı).
- **Sorun:** Haftalık sekme varsayılan ve en ağır yol. Kullanıcı sayısı büyüdükçe 5000 parametreli `IN` sorguları Neon pooler'da hem gecikme hem de bağlantı baskısı yaratır. Puan dışı kategoride 5000 kullanıcı belleğe çekilip JS'te sıralanıyor.
- **Öneri:** Sıralama gövdesini (kullanıcıdan bağımsız) `(category, periodKey)` anahtarıyla Upstash Redis'e 60 sn yaz. Mümkünse Redis Sorted Set (`ZINCRBY lb:points:2026-W41 <pts> <userId>` puan kredisinde, `ZREVRANGE` + `ZREVRANK` okumada) kullan: O(log n) sıra, B5'in de doğal çözümü. Kişisel kısım (`me`) ayrı ve hafif kalsın. Ana sayfa widget'ı `refetchInterval`'ı leaderboard için 5 dk'ya çıkarsın ya da ayrı bir query olsun.
- **Efor:** M (Redis cache) / L (ZSET mimarisi)

### B11 · ORTA · Erişilebilirlik: Görsel ve kontrol semantiği eksik
- **Kanıt:** `page.tsx:167,340,399,461,554` (`AvatarImage`'de `alt` yok; `components/ui/avatar.tsx:22-34` varsayılan bir `alt` vermiyor); `page.tsx:238-250` (`aria-expanded` yok); `page.tsx:258-273` (`aria-pressed` yok); `page.tsx:326-494` (DOM sırası 2→1→3); `page.tsx:419,435` (`text-yellow-500` açık zeminde ≈2:1 kontrast, WCAG AA 4.5:1'in altında); `page.tsx:590` (`text-[10px]`).
- **Sorun:** Ekran okuyucu podyumu "2., 1., 3." sırasıyla ve isimsiz görsellerle okuyor. Kategori seçiminin durumu duyurulmuyor. Altın renkli skorlar açık temada okunması zor.
- **Öneri:** Podyumu görsel olarak 2-1-3 tutup DOM'da 1-2-3 sırala (CSS `order` ya da grid alanları). Her kişi için `aria-label="1. sıra, Ayşe K., 12.400 puan"` ver. Kategori seçimini `role="radiogroup"` ile yap. Altın rengi için açık temada `amber-700`, koyu temada `yellow-400` token'ı kullan. En küçük metin 12 px olsun.
- **Efor:** S

### B12 · ORTA · UX/Mobil: Asıl içerik kaydırmanın altında, satırlar sıkışık
- **Kanıt:** Mobil sıra: başlık kartı (`page.tsx:149`) → banner (`155-234`) → varsayılan **açık** 4 kategori kartı, tek sütun (`252-277`) → sekmeler (`282`) → podyum (`mb-12`). Satır yapısı: 48 px sıra + 56 px avatar + 3×16 px boşluk + `pl-4 border-l` puan sütunu (`page.tsx:541-624`).
- **Sorun:** 360-390 px bir telefonda podyum ilk ekranın altında kalıyor. Kategori kartlarının uzun açıklamaları her ziyarette tekrar okunuyor. Satırlarda isim alanı ~60-90 px'e düşüyor ve isimler kesiliyor. Her satırdaki lig progress bar'ı dikey yükseklik ekliyor.
- **Öneri:** Kategoriyi yatay kaydırılabilir bir segmented chip'e indir (açıklama tooltip ya da `?` bottom-sheet'te). Dönem ve kategoriyi tek bir yapışkan filtre çubuğunda birleştir. Mobil satırı 40 px sıra + 40 px avatar + isim + skor olarak sadeleştir; lig ve progress'i satır detayına taşı.
- **Efor:** M

### B13 · DÜŞÜK · Görsel: Keyfi renk paleti ve yer tutucu lig ikonları
- **Kanıt:** `page.tsx:512-520` (4-10 için 7 farklı gradyan); `lib/league-avatars.ts:7-15` ("BAYİ AVATAR ERKEK 1", "CAT", "EMOJİ1" lig ikonu olarak kullanılıyor).
- **Sorun:** Renkler bir anlam (lig, bölge) taşımıyor, yalnızca gürültü. Lig kimliği, ki bu karakter rozeti sisteminde güçlü bir dil, burada rastgele avatar SVG'leriyle temsil ediliyor.
- **Öneri:** Satır rengini kullanıcının **ligine** bağla (`league-rules-core` içindeki `gradient` alanı zaten var). İlk 10 için tek bir "terfi bölgesi" vurgusu yeterli. Her lig için gerçek bir arma seti çizilmeli (karakter rozeti diliyle uyumlu, 7 adet SVG).
- **Efor:** M (tasarım varlığı)

### B14 · DÜŞÜK · i18n/Dil: TR sabitleri ve hitap karışıklığı
- **Kanıt:** `page.tsx:207` ("kişi"), `page.tsx:437` ("Lv."), `route.ts:85-90,159,414` (TR etiketler), `lib/utils.ts:74` (`tr-TR` sabit), `messages/tr.json` `customerLeaderboard.you: "Siz"` ve `description: "Rekabet et…"`.
- **Öneri:** Etiketleri API'den değil istemcideki i18n anahtarlarından üret (API yalnızca `period`/`category` anahtarı döndürsün). Sayı biçimini locale'e bağla. Müşteri tarafında tek bir hitap seç (samimi "sen" marka diline daha uygun).
- **Efor:** S

### B15 · DÜŞÜK · Ürün tutarlılığı: AI asistanı var olmayan bir özelliği vaat ediyor
- **Kanıt:** `lib/qra-knowledge-base.ts:31`: `purpose: 'Genel ve klan sıralaması'`; sayfada squad/klan sekmesi yok. Squad sıralaması ayrı sayfada (`app/customer/squads/page.tsx:151`).
- **Öneri:** Ya bilgi tabanı düzeltilmeli ya da sayfaya bir "Ekipler" sekmesi eklenmeli (bkz. birleştirme önerisi).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Haftalık lig + terfi/düşme bölgeleri (Duolingo):** Kullanıcı on binlerce kişiyle değil, benzer seviyedeki 30 kişilik bir "kohort" ile yarışır. İlk 7 terfi, son 5 düşme bölgesi olur. Geri sayım ("Lig 2 gün 4 saat sonra bitiyor") ve hafta sonu sonuç ekranı vardır. Qratex'te lig kavramı zaten var (`league-rules-core`) ama puan eşiği olarak; rekabetçi bir kohort değil.
2. **"Ben" odaklı görünüm (Strava, Duolingo):** Kendi satırın yapışkan (sticky) durur. Üstündeki 2 ve altındaki 2 kişi gösterilir. "Bir üstüne geçmek için 140 puan: 1 yorum + 1 oyun" gibi somut bir sonraki adım önerilir.
3. **Sıra değişim göstergesi ve bildirim:** ▲/▼ okları ve "Ayşe seni geçti" push bildirimi. Push merkezi zaten var (session-2026-08-08).
4. **Arkadaş/ekip sıralaması:** Davet edilenler ve squad üyeleriyle küçük grup rekabeti. Global listeye göre çok daha motive edicidir.
5. **Dönem sonu ödülleri ve geçmiş:** "Geçen haftanın şampiyonları", kazanılan ödüllerin gösterimi, kişisel en iyi sıra (Spotify Wrapped / My Year ile köprü: `app/customer/my-year`).
6. **Profil önizleme ve kıyas kartı:** Bir satıra dokunulunca rozet vitrini, lig, favori kategori ve "sen vs o" karşılaştırması. Paylaşılabilir "Bu hafta #3'üm" kartı (Starbucks / Revolut tarzı sosyal kanıt).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Bu hafta nerede duruyorum ve yükselmek için bir sonraki somut adımım ne?" sorusu 2 saniyede cevaplanmalı. Global liste ikincil olmalı; birincil olan kullanıcının kendi ligi ve kendi konumu.

**Yerleşim (mobil öncelikli):**
1. **Hero ("Senin haftan"):** Lig arması (gerçek, lig rengine boyalı), ligin adı, geri sayım, büyük sıra rakamı ve ▲ değişimi. Altında "#11 → #10 için 140 puan" ilerleme çizgisi ve 1-2 aksiyon çipi ("Bir oyun oyna +40", "QR okut"). Tüm veri `me` nesnesinden gelir.
2. **Yapışkan filtre çubuğu:** `[Ligim | Arkadaşlar | Ekipler | Genel]` segmenti + kategori chip'i (Puan/Yorum/Rozet/Davet) + dönem (Hafta/Ay/Tümü). URL'de tutulur (`?scope=league&cat=points&period=week`).
3. **Podyum (1-3):** Mevcut 2-1-3 yerleşim korunur ama boş basamaklar CTA olur; "sen" vurgusu podyumda da görünür.
4. **Bölgeli liste:** Terfi bölgesi (yeşil şerit), güvenli bölge, düşme bölgesi (kırmızı şerit). Satır sade: sıra, avatar (+ kozmetik çerçeve), maskeli isim, ▲▼, skor. Satıra dokununca profil önizleme sheet'i açılır.
5. **Yapışkan "sen" satırı:** Liste dışındayken altta sabit durur; dokununca listede kendi konumuna kayar.

**Motion / 3D (ölçülü):**
- Sonsuz döngüleri (taç sallanması, nabız, parıltı, alev) kaldır. Yerine **olay temelli** animasyonlar koy: sayfaya ilk girişte sıra sayacının eski değerden yeni değere `animate` ile sayması, sıra yükselmişse tek seferlik konfeti (`ConfettiProvider` mevcut), satırların `layout` animasyonuyla yer değiştirmesi (sıra değişimini görselleştirir).
- Hafta sonu sonuç ekranında, lig terfisi için mevcut three.js sürpriz kutusu / karakter rozeti reveal diline uyumlu kısa bir **arma reveal** sahnesi kullanılabilir. Bu, liste ekranında değil, yalnızca terfi anında ve tam ekran modalda olmalı.
- Tüm animasyonlar `useReducedMotion()` ve `html.reduce-animations` sınıfına birlikte bağlanmalı.

**Veri / API değişiklikleri:**
- `GET /api/leaderboard` → oturum zorunlu. Parametreler zod ile doğrulanır (`period ∈ {week, month, all}`, `category ∈ {points, feedbacks, badges, referrals}`, `scope ∈ {league, friends, squads, global}`). Yanıt şekli `{ rows, me: { rank, score, delta, gapToNext, zone }, period: { key, endsAt } }`. `id` yerine opak anahtar, `name` maskeli, `needsReview` yok.
- **Skor kaynağı:** Puan kredisi anında (`creditPointsAndXp`) aynı transaction'da `LeaderboardPeriodScore` upsert'i + Redis ZSET `ZINCRBY`. Okuma `ZREVRANGE` / `ZREVRANK`. Gece cron'u ZSET'i DB'den yeniden kurar (kaynak doğruluk DB, sıcak katman Redis; mevcut token-replay deseninin aynısı).
- **Filtreler:** `leaderboardVisible = true`, `fraudStatus = 'clean'`, `role = 'CUSTOMER'`, yorumlarda `deletedAt IS NULL AND trustFlagged = false`, davetlerde `status = 'COMPLETED'`.
- **Tie-break:** `score DESC, scoreReachedAt ASC` (skora önce ulaşan önde).
- **Haftalık kohort lig:** Pazartesi 00:00 UTC'de cron, aktif kullanıcıları lig + seviyeye göre 30'luk gruplara atar (`LeagueCohort`, `LeagueCohortMember`). Pazar kapanışında terfi/düşme ve ödül puanı escrow'suz, tek seferlik ve atomik kredi olarak yazılır (`points_credited` kaydıyla).
- **İstemci:** `useQuery` + `keepPreviousData`. `refetchInterval` yalnızca sekme görünürken ve 2 dk.

---

## Çakışmalar / birleştirme önerisi

Aynı "kim önde?" sorusu şu an altı ayrı yüzeyde, farklı formüllerle cevaplanıyor:

| Yüzey | Kanıt | İlişki |
|---|---|---|
| `/customer/leaderboard` (bu sayfa) | — | Global müşteri sıralaması. |
| Ana sayfa ilk-5 widget'ı | `components/customer/dashboard/customer-dashboard.tsx:170,1136-1141` | Aynı API, aynı yanlış `userRank` (B5). |
| Bağış liderliği | `customer-dashboard.tsx:703` (`/customer/donations?tab=leaderboard`) | Ayrı bir "Liderlik" girişi; isim çakışması. |
| Squad sıralaması | `app/customer/squads/page.tsx:12,151` (`SquadLeaderboard`) | Ekip bazlı; bu sayfanın bir sekmesi olabilir. |
| Oyun turnuvası sıralaması | `components/customer/games/game-tournament.tsx`, `app/api/customer/tournament/route.ts` | Oyun içi; bağlamında kalmalı. |
| `/customer/category-leaderboard` | `components/dashboard/sidebar.tsx:297` | İşletme sıralaması; isim benzer ama amacı farklı (keşif). |

**Öneri:**
- `/customer/leaderboard` tek **"Sıralamalar"** merkezine dönüşmeli. Sekmeleri: Ligim (varsayılan), Arkadaşlar, Ekipler (squad sıralaması buraya taşınır, squad sayfası buraya derin bağlantı verir), Genel (bugünkü sayfa), Bağışçılar (bağış liderliği buraya taşınır, bağış sayfasında yalnızca kısa bir özet kalır).
- Ana sayfa widget'ı aynı `me` + ilk-3 verisini kullanan hafif bir özet olarak kalmalı.
- Oyun turnuvası oyun bağlamında kalmalı ama "Sıralamalar" merkezinde bir kartla temsil edilmeli.
- `/customer/category-leaderboard` bu sayfayla **birleştirilmemeli**. O bir işletme keşif yüzeyi; adı "En İyi İşletmeler" olarak keşif tarafına taşınmalı, "leaderboard" adlandırması iki kavramı karıştırıyor.
- AI bilgi tabanı (`lib/qra-knowledge-base.ts:31`) birleşik yapıya göre güncellenmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia kod okunarak çürütülmeye çalışıldı. DB, build, test çalıştırılmadı; yalnızca kaynak okundu.

### 1. Gizlilik tercihi (`showLeaderboard`) yok sayılıyor + oturumsuz PII ifşası: **DOĞRULANDI**
- Tercih yalnızca `Settings` tablosuna `user_settings_<id>` anahtarıyla JSON olarak yazılıyor (`app/api/customer/settings/route.ts:55,163,196-205`). Depoda `showLeaderboard` okuyan başka hiçbir kod yok (grep: yalnızca settings route + settings sayfası, `app/customer/settings/page.tsx:1017-1018`). `app/api/leaderboard/route.ts` bu ayarı hiç okumuyor.
- Oturum zorunlu değil: `proxy.ts:105-118` `/api/*` isteklerini yalnızca güvenlik/CORS başlığı ekleyip geçiriyor; route `getServerSession` sonucunu sadece `isCurrentUser` için kullanıyor (`route.ts:78,136,211`). `assertModuleEnabled('rewards')` (`lib/module-gate.ts:92-125`) yalnızca modül açık/kapalı kontrolü yapıyor, kimlik doğrulamıyor. `app/api/cron/cache-warm/route.ts:51` bu ucu oturumsuz çağırıyor; yani oturumsuz erişim fiilen kullanılan bir yol.
- **Yeniden üretim:** Müşteri A ayarlardan "Liderlik Tablosunda Göster"i kapatır → kayıt başarılı. Oturumsuz `GET /api/leaderboard?period=alltime&limit=100` → A'nın `id`, `name` (tam ad), `image` URL'si, `points`, `level` ve rozet/yorum sayıları yanıtta. Ayar sayfası kullanıcıya gerçekte uygulanmayan bir gizlilik vaadi veriyor; KVKK açısından en ciddi bulgu bu.

### 2. `needsReview` herkese açık yanıtta; shadow_ban kullanıcıları sıralanıyor: **DOĞRULANDI (kısmen; shadow_ban alt iddiası çürütüldü)**
- `needsReview` gerçekten her satırda (`route.ts:137,212,273,345`) ve uç oturumsuz erişilebilir (bkz. 1). Kaynak `lib/points-velocity.ts:8,40-68`: 24 saatte `points_credited` toplamı ≥ 500. İstemci bu alanı hiç kullanmıyor (`app/customer/leaderboard/page.tsx` ve `customer-dashboard.tsx` içinde `needsReview` yok); yani alan saf sızıntı. Somut etki: adı açık bir kullanıcıya dışarıdan "şüpheli" etiketi okunabiliyor (itibar/kişisel veri) ve kötü niyetli kullanıcı kendi satırını izleyerek eşiğin altında kalacak hızı kolayca ayarlayabiliyor. Eşik sabit ve küçük bir sinyal olduğu için şiddet YÜKSEK değil ORTA.
- **shadow_ban kısmı çürütüldü:** `User.fraudStatus='shadow_ban'` yazan tek kod `lib/fraud/engine.ts:52-67` (`checkFraudulentActivity`), fakat bu fonksiyon depoda hiçbir yerden çağrılmıyor (grep: tanım dışında referans yok; `shouldApplyReward` da çağrılmıyor). `app/api/admin/bootstrap/route.ts:332,363` yalnızca `'flagged'` yazıyor. Dolayısıyla şu an shadow_ban'lı müşteri üretilemiyor; filtre eksikliği bugün kullanıcıyı etkilemiyor. Yine de fraud motoru bağlandığında aynı gün devreye girecek bir boşluk; sıralama sorgularına `fraudStatus: 'clean'` filtresi eklenmesi önleyici olarak doğru.

### 3. Haftalık/aylık puan sıralaması sahte formülle hesaplanıyor ve şişirilebiliyor: **DOĞRULANDI**
- `route.ts:299-307`: skor `SUM(CASE WHEN length("text") > 50 THEN 100 ELSE 50 END)`. Gerçek kredi ise `app/api/feedbacks/route.ts:283-336`: admin puan matrisi (`getFeedbackReward`, `lib/points-rules.ts:268-271`, eşik `trim().length >= threshold`), VIP + sezon + global çarpan zinciri ve son olarak günlük 500 / haftalık 2000 tavanı (`lib/points-caps.ts:13-14,57-65`). Leaderboard SQL'i bunların hiçbirini uygulamıyor; ayrıca `deletedAt IS NULL` ve `trustFlagged = false` filtresi yok (şema: `prisma/schema.prisma` Feedback modelinde `deletedAt`, `trustFlagged` alanları mevcut). Oyun/rozet/davet/doğum günü puanları hiç sayılmıyor; dönem içinde yorum yazmayan ama başka yoldan puan kazanan kullanıcı listeye hiç giremiyor (`route.ts:217-231`).
- **Yeniden üretim:** Bir kullanıcı haftalık 2000 tavanını doldurduktan sonra farklı QR'lara (genel 20/dk + QR başı limit, `feedbacks/route.ts:171,221`) 51+ karakterlik yorumlar göndermeye devam eder; her biri cüzdana 0 puan yazar (`capped <= 0`) ama haftalık sıralamaya +100 ekler. Admin bu yorumları soft-delete etse ya da trust motoru işaretlese bile skor düşmez.

### 4. Kişisel sıra (`userRank`) dönemden bağımsız yanlış hesaplanıyor: **DOĞRULANDI**
- `route.ts:355-381`: kullanıcı dönem listesinde yoksa sıra `points > currentUser.points` olan tüm müşterilerin sayısıyla, yani **tüm zamanlar** puanıyla hesaplanıyor; `period` hiç dikkate alınmıyor. Liste ise `period=weekly` varsayılanıyla dönem skoruna göre (`route.ts:81`).
- Ana sayfa widget'ı `/api/leaderboard?limit=5` çağırıyor (`customer-dashboard.tsx:170`) → varsayılan weekly. İlk 5'te olmayan kullanıcı için `userRank` tüm zamanlar sırası ve yanına `user.points` (tüm zamanlar puanı) ekleniyor (`customer-dashboard.tsx:262-271`); diğer satırlar haftalık puan gösteriyor. Sayfada da `#{userRank}` aynı değerden (`app/customer/leaderboard/page.tsx:87,197`).
- **Yeniden üretim:** Tüm zamanlarda 3. olan ama bu hafta hiç yorum yazmamış kullanıcı haftalık sekmede "#3" görür, oysa haftalık listede yoktur; tersine, bu hafta 6. olan yeni kullanıcı widget'ta tüm zamanlar sırası olan "#240" görür. (Puan dışı kategorilerde ve alltime'da sıra doğru: `route.ts:142-145`, `375-381`.)

### 5. Davet liderliği tamamlanmamış/sahte davetlerle şişirilebilir: **ÇÜRÜTÜLDÜ**
- `Referral` kaydı oluşturan yalnızca iki yol var ve ikisi de kaydı doğrudan `status: 'COMPLETED'` ile yazıyor: `app/api/auth/register/route.ts:112-121` ve `app/api/referral/route.ts:203-212`. Depoda `PENDING` veya `EXPIRED` yazan hiçbir kod yok (grep). Dolayısıyla `_count.referralsMade` (`route.ts:29,45`) bugün fiilen yalnızca COMPLETED kayıtları sayıyor; status filtresinin eksikliği kullanıcıyı etkileyen bir senaryo üretmiyor. Filtre yine de ileride PENDING akışı eklenirse diye savunmacı olarak eklenebilir.
- Yan not (iddianın kendisi değil, ayrıca ele alınmalı): kayıt yolu (`register/route.ts:101-107`) yalnızca `isActive` ve `maxUsage` kontrol ediyor; `app/api/referral/route.ts:164-183` içindeki ömür boyu / aylık davet limitlerini uygulamıyor ve referans, e-posta doğrulanmadan COMPLETED sayılıyor. Yani davet sayısını şişirme riski status filtresinden değil, kayıt akışındaki bu farklılıktan kaynaklanıyor; bu, puan ekonomisi denetiminde ayrı bir bulgu olarak doğrulanmalı.


---

## Uygulama (Dalga 2)

**Hedef rota:** `/customer/leaderboard` (Oyna → Lig). Sayfa baştan yazıldı: sunucu bileşeni (`app/customer/leaderboard/page.tsx`) kimliği ve rolü DB'den doğrular (`requireAuth(['CUSTOMER'])`), `rewards` modül kapısını ve `leaderboard` menü görünürlüğünü sunucuda uygular, ilk sıralamayı sunucuda hesaplayıp istemci adasına (`components/customer/m-lig/**`) verir. Sonraki dönem/tür/sayfa değişimleri yeni BFF ucu `GET /api/customer/league` (`defineRoute`: yalnız CUSTOMER, `rewards` modülü, `read` rate limit, zod sorgu, zarf v2) üzerinden TanStack Query ile gelir. Hesap tek modülde: `lib/league-board/` (`periods.ts` İstanbul dönemleri, `ranking.ts` saf sıralama çekirdeği, `server.ts` SQL + önbellek + DTO, `types.ts` sözleşme). Sayfa artık eski `/api/leaderboard` ucunu kullanmıyor.

**Dönemler:** Bu hafta (İstanbul Pazartesi 00:00 → Pazartesi), Sezon N (8 haftalık, çapa 2026-01-05; yol haritası F4.4 ile uyumlu), Tüm zamanlar. "Aylık" sekmesi sezona dönüştü; eski `?period=monthly` bağlantısı sezona, `weekly`/`alltime` yeni değerlere eşlenir.

**Skor kaynakları (tek metrik, döneme uyar):** Puan → `points_credited` defteri (iade `squad_escrow_refund`, `admin_adjust`, `opening_balance`, `demo_seed`, `reversal` sayılmaz); tüm zamanlarda güncel bakiye. Yorum → `deletedAt IS NULL AND trustFlagged = false`. Rozet → `UserBadge.earnedAt`. Davet → yalnız `COMPLETED`, `completedAt`. Başkalarının listesine yalnız `role=CUSTOMER`, `fraudStatus='clean'`, demo olmayan, anonimleştirilmemiş ve askıda olmayan hesaplar girer. Tie-break: skor ↓, skora önce ulaşan (son katkı anı; tüm zamanlarda hesap açılışı) ↑, id ↑.

**Gizlilik:** "Sıralamada görün" kapalıysa oyuncu başkalarının listesinde yoktur; tercih sayfadan da değiştirilebilir (aynı `preferences.showLeaderboard` alanı, `PATCH /api/customer/settings`). İzleyici kendi tercihini önbelleksiz okur, kendini her zaman görür ("Gizli" rozeti). Tercihler okunamazsa liste verilmez (fail-closed). Yanıtta ham id yok (HMAC anahtar), başkalarının adı maskeli ("Ayşe K."), `needsReview`/fraud sinyali yok. İnceleme/gölge hesabı kendi görünümünde normal sırasıyla yer alır.

**Doğrulama:** `__tests__/lib/league-board.test.ts` (23 test: İstanbul dönemleri, tie-break, gizli oyuncu, izleyici ekleme, sınır dışı, SQL filtreleri, sızıntı yok, fail-closed, sayfalama), `__tests__/api/customer-league.test.ts` (6 test: 401, rol, varsayılanlar, zod 400, modül/menü 403, görünür 500), `__tests__/customer/league-board-render.test.ts` (3 SSR testi: tek h1, podyum DOM sırası 1-2-3, "sen" ve gizli rozeti, boş durum CTA'sı, 2 kişilik podyum). Görünüm 390 px'te Playwright ekran görüntüsüyle kontrol edildi (yatay taşma yok).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Segment metadata | ÇALIŞIYOR | Sayfa `generateMetadata` TR/EN ("Lig"), `noindex`. |
| 2 | Masaüstü başlık | ÇALIŞIYOR | QDL `PageHeader`: her boyutta tek `h1`. |
| 3 | Mobil başlık kartı | KALDIRILDI | Tek `PageHeader` mobilde de görünüyor; ikinci kart dikey alan harcıyordu (B12). |
| 4 | Banner: kullanıcı avatarı | KALDIRILDI | Kahraman lig odaklı (amblem); avatarın kendi satırında. Kuşanılmış çerçeveler sonsuz CSS animasyonu olduğundan listede kullanılmadı (motion politikası). |
| 5 | Banner: ad | KALDIRILDI | Ad kendi satırında ve yapışkan "sen" çubuğunda; kahramanda tekrar gürültüydü. |
| 6 | Banner: seviye | ÇALIŞIYOR | DB'den (`me.level`), bayat JWT değil. |
| 7 | Banner: lig rozeti | ÇALIŞIYOR | Sunucu kuralları (`getLeagueRules`), `LeagueEmblem`; son lig açık uçlu (100.000 üstü Başlangıç'a düşmüyor). |
| 8 | "Sıralaman #N" | ÇALIŞIYOR | Listeyle aynı metrik/dönem/tie-break; sınır dışında "15.000+" (uydurma yok). |
| 9 | İlk 10 alev animasyonu | KALDIRILDI | Sonsuz döngü; yerine sıra sayacı (değişimde sayar) + son ziyaretten beri ▲/▼ çipi. |
| 10 | "/ N kişi" | ÇALIŞIYOR | Dönemde skoru olan görünür oyuncu sayısı, i18n ("oyuncu"/"players"). |
| 11 | Banner: toplam puan | ÇALIŞIYOR | Güncel bakiye DB'den ("Bakiye 4.000 puan"). |
| 12 | Dönem · kategori etiketi | ÇALIŞIYOR | Etiketler istemcide TR/EN; API yalnız anahtar döndürür. |
| 13 | Kategori panelini aç/kapa | KALDIRILDI | Kategoriler yatay çip; seçili türün nasıl sayıldığı tek satırda. |
| 14 | Kategori seçimi | ÇALIŞIYOR | `ChoiceChips` radiogroup (ok tuşları), URL'de `?cat=`, istek iptali. |
| 15 | Kategori: Puan | ÇALIŞIYOR | Defterden; açıklama metni gerçeği söylüyor. |
| 16 | Kategori: Geri Bildirim | ÇALIŞIYOR | Dönem filtreli; silinen/bayraklı sayılmaz. |
| 17 | Kategori: Rozet | ÇALIŞIYOR | Dönem filtreli (`earnedAt`). |
| 18 | Kategori: Davet | ÇALIŞIYOR | Yalnız COMPLETED, dönem filtreli (artık PENDING akışı var; filtre gerçekten gerekiyordu). |
| 19 | Dönem sekmeleri | ÇALIŞIYOR | Hafta · Sezon N · Tüm zamanlar; dört türde de etkili. |
| 20 | Haftalık/aylık puan hesabı | ÇALIŞIYOR | Sahte `length(text)` formülü yok; `points_credited` toplamı. |
| 21 | Boş dönemde geri dönüş listesi | KALDIRILDI | Tüm zamanlar listesi "Bu hafta" diye sunulmuyor; dürüst boş durum + gerçek CTA. |
| 22 | Veri çekme ve durum | ÇALIŞIYOR | TanStack Query: iptal, `keepPreviousData`, hata görünür, 5xx'te 2 deneme. |
| 23 | Yükleniyor iskeleti | ÇALIŞIYOR | Yalnız sunucu verisi yoksa; filtre değişiminde önceki veri korunur (titreme yok), "Güncelleniyor" göstergesi. |
| 24 | Hata durumu | ÇALIŞIYOR | `QueryState` → `ErrorState` + "Tekrar dene"; veri varken hata bandı. |
| 25 | Boş durum | ÇALIŞIYOR | Hata, modül kapalı ve yetkisiz durumlarından ayrı. |
| 26 | Podyum | ÇALIŞIYOR | 1–3 kişide de görünür. |
| 27 | 1–2 kişilik liste | ÇALIŞIYOR | Boş basamak "Bu basamak boş. İlk sen ol."; liste `rank > 3` ile başlar. |
| 28 | Podyum mikro-animasyonları | KALDIRILDI | Üç sonsuz döngü kaldırıldı; yalnız kullanıcı seçimi değişince bütçeli giriş (ilk sunucu render'ı opaklık 0 ile gelmez). |
| 29 | Podyum skor + sayılar | ÇALIŞIYOR | Seçili türün skoru + birimi; tutarsız ikincil sayılar kaldırıldı. |
| 30 | 1. için lig rozeti | ÇALIŞIYOR | Her basamakta `LeagueEmblem`; sabit "Lv." yok. |
| 31 | Podyumda "bu sensin" | ÇALIŞIYOR | Halka + "Sen". |
| 32 | Liste satırları | ÇALIŞIYOR | 25'lik sayfalar. |
| 33 | 4–10 renk paleti | KALDIRILDI | Anlamsız gradyanlar yerine ilk 10 sıra numarası marka renginde. |
| 34 | "Sen" rozeti + vurgu | ÇALIŞIYOR | Satır `bg-brand-subtle`; hangi sayfada olursa olsun bulunur. |
| 35 | Satır seviye | ÇALIŞIYOR | "Sv. N". |
| 36 | Satır lig adı + ikon | ÇALIŞIYOR | Gerçek DS amblemi (yer tutucu avatar SVG'leri değil), mobilde de görünür, hizalama düzgün. |
| 37 | Satır lig ilerleme çubuğu | KALDIRILDI | Başkalarının lig ilerlemesi gürültüydü ve iki puan kavramını karıştırıyordu; kendi ilerlemen kahramanda. |
| 38 | Satır üçlü istatistik | KALDIRILDI | Satır tek metrik gösterir ("davet: 0" yanlışı yapısal olarak kapandı). |
| 39 | Satır skor + birim | ÇALIŞIYOR | Tür birimi (puan/yorum/rozet/davet). |
| 40 | "N Oyuncu" sayacı | ÇALIŞIYOR | Gerçek katılımcı toplamı kahramanda ("/ 13 oyuncu"). |
| 41 | Varsayılan avatar | ÇALIŞIYOR | Baş harfler; halka rengi kişiye bağlı (opak anahtardan), satır sırasına değil. |
| 42 | Kendi satırın (yapışkan "sen") | ÇALIŞIYOR | Kahraman ve satırın ekranda değilken alt çubuk; "Sırama git" gerekirse sayfayı açar, kaydırır, odaklar. |
| 43 | Sayfalama | ÇALIŞIYOR | Önceki/Sonraki + "Sayfa X / Y", URL'de `?page=`. |
| 44 | Satıra tıklayıp profil | KALDIRILDI | Yanlış affordance (hover kalkması) kaldırıldı; başkasının profil önizlemesi gizlilik ilkesiyle çelişir ve herkese açık profil sözleşmesi yok. |
| 45 | Gizlilik tercihine uyma | ÇALIŞIYOR | Uygulanıyor + sayfadan değiştirilebiliyor; fail-closed. |
| 46 | Fraud/şüpheli hariç tutma | ÇALIŞIYOR | `fraudStatus='clean'` + demo/anonim/askı filtresi; izleyici kendini normal görür. |
| 47 | API kimlik doğrulaması | ÇALIŞIYOR | Yalnız CUSTOMER, rol DB'den. |
| 48 | `needsReview` sızıntısı | ÇALIŞIYOR | Yeni sözleşmede hiç yok (testle doğrulanıyor). |
| 49 | Modül kapısı | ÇALIŞIYOR | `rewards` + menü görünürlüğü hem sayfada hem uçta; kapalıyken `moduleDisabled` durumu, "veri yok" değil. |
| 50 | Sıra değişim göstergesi | ÇALIŞIYOR | Kendi sıran için "son ziyaretinden beri ▲/▼" (tarayıcıya özel kolaylık). Başkalarının okları için dönem anlık görüntüsü gerekir (ŞEMA İSTEĞİ 3). |
| 51 | Dönem sonu geri sayımı / ödül / bölge | ÇALIŞIYOR (geri sayım) · KALDIRILDI (bölge/ödül) | Hafta ve sezon sayacı `CountdownChip` (İstanbul). Terfi/düşme bölgesi ve dönem ödülü gerçek bir ödül/kohort olmadan sahte olurdu (ŞEMA İSTEĞİ 3, F4.4). |
| 52 | Arkadaş/ekip sıralaması | KALDIRILDI | Klan sıralaması Oyna → Klan'da; AI bilgi tabanı düzeltildi (B15). |
| 53 | Seçimin URL'de tutulması | ÇALIŞIYOR | `?period=&cat=&page=` (history.replaceState; sunucu bileşeni gereksiz yeniden çalışmaz). |
| 54 | Periyodik yenileme | ÇALIŞIYOR | Görünürken 2 dk'da bir + odakta; dönem bitince yeniden çeker. |
| 55 | i18n | ÇALIŞIYOR | Yüzeye özel TR/EN metinler, samimi "sen" hitabı, sayı biçimi dile göre. |
| 56 | Azaltılmış hareket | ÇALIŞIYOR | Sonsuz döngü yok; sayaç, kaydırma ve girişler `lib/motion` politikasına bağlı (OS + uygulama ayarı). |
| 57 | Eşit skorda kararlı sıralama | ÇALIŞIYOR | skor ↓, önce ulaşan ↑, id ↑ (SQL ve bellekte aynı). |

**Sonuç:** 57 kalemin 44'ü ÇALIŞIYOR, 12'si gerekçeyle KALDIRILDI. 51. kalem kısmen çalışıyor, kısmen kaldırıldı. BOZUK, SAHTE ve EKSİK kalem kalmadı.

**Eksik özelliklerden eklenenler:** "Ben" odaklı görünüm (yapışkan satır, bir üstteki oyuncuyu geçmek için gereken fark, ilk 10'a kalan fark, tür başına somut CTA), kendi sıra değişimin, geçen haftanın ilk üçü (tamamlanmış hafta, 1 saat önbellek), sezonluk sıralama, sayfadan gizlilik anahtarı.

### Kapanan bulgular (15/15)

- **B1** kapandı: oturum + CUSTOMER rolü zorunlu, gizlilik tercihi uygulanıyor ve okunamazsa fail-closed, maskeli ad, opak anahtar, kendi gizli sıranı görme.
- **B2** kapandı: fraud sinyali yanıtta yok; `fraudStatus ≠ clean` başkalarının listesinde yok, izleyici kendi görünümünde normal.
- **B3** bu yüzey için kapandı: puan defterden. Eski `/api/leaderboard` ana sayfa widget'ı için hâlâ duruyor (bkz. Kalanlar).
- **B4** kapandı: dört türde de dönem filtresi.
- **B5** kapandı: kendi sıran aynı metrik/dönem/tie-break; sıfır skorda dürüst "henüz sıralamada değilsin" + CTA.
- **B6** kapandı: 1–2 kişilik podyum ve boş basamak.
- **B7** kapandı: TanStack Query, iptal, hata durumu, önceki veriyi koruma.
- **B8** kapandı: COMPLETED davet, silinmemiş/bayraksız yorum, satır tek metrik.
- **B9** kapandı: puan/seviye/lig sunucunun `me` nesnesinden, admin lig kurallarıyla.
- **B10** bu yüzey için kapandı: kullanıcıdan bağımsız sıralı liste `(tür, dönem anahtarı)` ile 60 sn önbellekte (tamamlanmış hafta 1 saat), kişisel kısım bellekte; istek başına en fazla 2–3 hafif sorgu. Redis ZSET mimarisine gerek görülmedi.
- **B11** kapandı: dekoratif avatar `alt=""` + satır `aria-label`, radiogroup çipler, podyum DOM sırası 1-2-3, token renkleri (ham sarı yok), en küçük metin `qx-caption`, dokunma hedefleri ≥ 44px.
- **B12** kapandı: yapışkan filtre çubuğu, sade satır (sıra · avatar · ad · lig · skor).
- **B13** kapandı: keyfi palet ve yer tutucu lig ikonları yerine DS `LeagueEmblem`.
- **B14** kapandı: etiketler istemcide i18n, tek hitap ("sen"), dile göre sayı biçimi.
- **B15** kapandı: `lib/qra-knowledge-base.ts` girişi gerçeğe göre güncellendi.

### Kalanlar

- **Ana sayfa ilk-5 widget'ı** (`components/customer/dashboard/customer-dashboard.tsx`) hâlâ eski `/api/leaderboard` ucunu çağırıyor. O uçta haftalık "puan" eski formülle hesaplanıyor ve widget 60 sn'de bir yeniden çağırıyor. Uç ve widget ana sayfa yüzeyinin sahipliğinde. Öneri: widget `buildLeagueBoard` ya da `GET /api/customer/league?page=1` ile beslenmeli (`me` + `podium` aynı sözleşmede hazır); ardından `/api/leaderboard` ve `app/api/cron/cache-warm` girdisi emekliye ayrılmalı.
- **Başkalarının ▲/▼ okları, haftalık kohort ligi, terfi/düşme bölgeleri ve dönem sonu ödülleri** kalıcı anlık görüntü ve kohort tabloları gerektiriyor (ŞEMA İSTEĞİ 3; F4.4 kapsamı).
- **Lig bakiyeye göre** hesaplanıyor (sistemin geri kalanı ve An Motoru ile tutarlı). F4.4'te sezon XP'ye geçilince `resolveLeague` girdisi değişmeli. Sezon tanımı `lib/league-board/periods.ts → seasonWindow` olarak hazır; An Motoru `currentLeagueSeasonKey()` buradan beslenebilir.
- **Kozmetik avatar çerçeveleri** listede gösterilmiyor: mevcut çerçeveler sonsuz CSS animasyonu (motion politikası). Statik çerçeve varyantı yapılınca eklenebilir.

### Şema istekleri

1. `User.leaderboardVisible Boolean @default(true)` (+ indeks): tercih bugün `Settings` JSON'unda; sıralama bunu 60 sn önbellekli JSON yol sorgusuyla okuyor. Kolon olunca doğrudan SQL filtresi olur ve başkalarına yansıma gecikmesi kalkar.
2. `User.displayName String?` (takma ad): bugün ad, soyadın baş harfiyle maskeleniyor; kullanıcının seçtiği görünen ad daha iyi bir gizlilik seçeneği olur.
3. `LeaderboardSnapshot(periodKey, category, userId, rank, score)` ve F4.4 için `LeagueCohort` / `LeagueCohortMember`: herkes için sıra değişim okları, dönem sonu sonuç ekranı, kohort ligi ve terfi/düşme ödülleri (ödüller `mintPoints` ile, tek-kez anahtarlı).
