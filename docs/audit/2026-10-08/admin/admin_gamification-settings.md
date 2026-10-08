# /admin/gamification-settings

**Amaç:** Platform genelindeki oyunlaştırma ekonomisinin "ana düğmelerini" (global XP/puan çarpanı, günlük XP tavanı, seviye atlama ödülü, sezon adı/bitişi/aktifliği) tek bir tekil (singleton) `GamificationSettings` satırı üzerinden yönetmek.

**Genel puan:** 3.5 / 10

**Karar:** **yeniden tasarla** (ve kısmen **birleştir**) — 7 alandan yalnızca 2'si (XP ve puan çarpanı) sistemde gerçekten bir şey değiştiriyor, o da 20'den fazla puan kazanım yolundan yalnızca birinde (feedback). Kalan 5 alan (günlük XP tavanı, seviye ödülü, sezon adı, sezon bitişi, sezon aktif) hiçbir kod yolu tarafından okunmuyor: operatöre "ekonomiyi yönetiyorsun" hissi veren ama etkisi olmayan kontroller. Sayfa, `points-matrix` + `economy-sim` ile tek bir "Ekonomi Kontrol Merkezi"ne katılmalı; sezon kartı ya gerçek bir sezon motoruna bağlanmalı ya da kaldırılmalı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Kaydetme akışı çalışıyor ve sunucu clamp'liyor, ama alanların çoğu write-only (sahte), çarpanlar "global" etiketine rağmen tek yola uygulanıyor, yükleme hatası sayfayı çökertiyor, boş alan sessizce 0 yazıyor. |
| UX | 3/10 | Kirli durum, kaydedilmemiş değişiklik uyarısı, etki önizlemesi, onay, geçmiş yok; datetime alanı düzenlenirken saat dilimi kadar kayıyor; açıklamalar gerçekleşmeyen davranış vaat ediyor. |
| Görsel | 5/10 | Temiz shadcn kart ızgarası ama kardeş sayfaların (`AdminPremiumHero`, dirty rozet) dilinden kopuk; çift iç boşluk; hiyerarşi tüm alanları eşit ağırlıkta gösteriyor. |
| Mimari | 3/10 | `any` state, tekil satır için unique kısıt yok, GET yan etkili (create), API'de yönetici kapısı (gate) uygulanmıyor, ayar ile tüketici arasındaki sözleşme (hangi alan nerede kullanılıyor) kopuk. |
| Performans | 8/10 | Tek küçük GET/PATCH, tüketici tarafı `unstable_cache` 60 sn + tag invalidation; sorun yok. Ölü `framer-motion` importu dışında yük yok. |
| Erişilebilirlik + Mobil | 4/10 | `Label`'lar `htmlFor`/`id` ile bağlı değil, switch adsız, spinner'da `aria-live` yok; mobilde başlık+buton satırı sarılmıyor ve layout padding'ine ek `p-6` çift boşluk yaratıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi (ADMIN rolü + gizli kapı çerezi) | ÇALIŞIYOR | `proxy.ts:60-87` | `/admin/*` sayfası için rol ve `admin_gate` çerezi kontrol ediliyor. |
| 2 | API yetkilendirmesi (GET/PATCH) | KISMİ | `app/api/admin/gamification/settings/route.ts:20,47`; `proxy.ts:102-115` | Yalnız `requireAuth(['ADMIN'])`. `/api/*` için proxy gate çerezini kontrol etmiyor; `lib/` ve `app/api/` içinde `admin_gate` doğrulaması yok → kapı API'de by-pass edilebilir (sistemik). |
| 3 | Ayarların yüklenmesi (GET, yoksa varsayılanla oluştur) | ÇALIŞIYOR | `route.ts:23-35`; `page.tsx:20-36` | GET içinde `create` yan etkisi var; `findFirst` sırasız. |
| 4 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:60-66` | Yalnız ortalanmış spinner; iskelet yok, `role="status"`/`aria-live` yok. |
| 5 | Yükleme hata durumu | BOZUK | `page.tsx:28-35`, `page.tsx:97` | `data.success` false (403/500) veya `res.json()` patlarsa `settings` `null` kalır, `loading=false` olur ve `settings.xpMultiplier` okunurken TypeError → `app/admin/error.tsx` sınırına düşer. Yeniden dene butonu yok. |
| 6 | Başlık + açıklama | ÇALIŞIYOR | `page.tsx:71-74` | i18n'li; kardeş sayfalardaki `AdminPremiumHero` kullanılmıyor. |
| 7 | Kaydet (PATCH, tüm nesneyi gönderir) | ÇALIŞIYOR | `page.tsx:38-58`; `route.ts:44-86` | Sunucu cevabıyla state tazeleniyor. |
| 8 | Kaydetme göstergesi | KISMİ | `page.tsx:75-78`; `messages/tr.json` → `adminGamificationSettings.saving` | Buton disable + spinner var; "Kaydediliyor..." anahtarı tanımlı ama kullanılmıyor. |
| 9 | Başarı/hata bildirimi (toast) | KISMİ | `page.tsx:47-54`; `route.ts:40,89`; `lib/api-auth.ts:73` | Sunucu hata metinleri yalnız Türkçe ve `data.error` doğrudan gösteriliyor → EN arayüzde TR toast. |
| 10 | XP çarpanı (Global) | KISMİ | `page.tsx:92-100`; `lib/gamification-settings.ts:31`; `app/api/feedbacks/route.ts:318` | Yalnız feedback yolunda uygulanıyor. 0 girilirse helper `> 0` kontrolüyle 1'e çeviriyor (UI 0 gösterir, gerçek 1). Feedback cevabında kullanıcıya çarpılmamış `reward.xp` dönüyor (`feedbacks/route.ts:365`). |
| 11 | Puan çarpanı (Global) | KISMİ | `page.tsx:101-109`; `feedbacks/route.ts:316` | "Global" etiketi yanıltıcı: `creditPointsAndXp` kullanan ~24 dosyadan (oyunlar, spin, görev, streak, referral, sürpriz kutu, tüketim yorumu, turnuva…) yalnız `app/api/feedbacks/route.ts` çarpanı uyguluyor. 0 → etkisiz 1. |
| 12 | Günlük maksimum XP | SAHTE | `page.tsx:123-130`; `lib/gamification-settings.ts:26,33` | Helper okuyor ama hiçbir tüketici `dailyXpCap`'i kullanmıyor; XP hiç tavanlanmıyor (`feedbacks/route.ts:318`). Gerçek tavan `lib/points-caps.ts:13-14`'te sabit kodlu 500/2000 **puan** (XP değil). |
| 13 | Level-up puan ödülü (taban) | SAHTE | `page.tsx:131-138` | `levelUpRewardBase` repo genelinde yalnız bu sayfa ve route'ta geçiyor; `lib/points-wallet.ts:62-71` `isLevelUp` döndürür ama ödül vermez. |
| 14 | Sezon adı | SAHTE | `page.tsx:153-160` | `seasonName` hiçbir tüketici tarafından okunmuyor (grep: yalnız sayfa+route). |
| 15 | Sezon bitiş tarihi | BOZUK | `page.tsx:165-166`; `route.ts:62-64` | (a) Görüntüleme UTC'yi yerel gibi gösteriyor, `onChange` yerel string yazıyor, yeniden render bunu tekrar UTC'ye çevirip ekranda TR'de 3 saat geri kaydırıyor. (b) Alan temizlenince `''` → sunucu `current.seasonEndsAt`'a düşüyor: tarih **silinemiyor**. (c) Hiçbir tüketici okumuyor (write-only). |
| 16 | Sezon aktif anahtarı | SAHTE | `page.tsx:170-179`; `messages/tr.json` `isSeasonActiveDesc` | Açıklama "Kapalıysa sezon ödülleri ve sıralamaları dondurulur" diyor; `isSeasonActive` hiçbir yerde okunmuyor. |
| 17 | Sunucu tarafı doğrulama/clamp | ÇALIŞIYOR | `route.ts:12-16,56-64` | NaN/sonsuz reddi, aralık kısıtı, metin 120 karakter. |
| 18 | Boş sayı alanının işlenmesi | BOZUK | `page.tsx:98,107,128,136`; `route.ts:13` | `parseFloat('')`=NaN → `JSON.stringify` NaN'ı `null` yapar → `Number(null)=0` → clamp geçer → DB'ye **0** yazılır (fallback'e düşmez). Ayrıca kontrollü input'a `NaN` verilip React uyarısı üretilir. |
| 19 | Denetim kaydı (audit log) | KISMİ | `route.ts:73-83` | Yalnız 4 sayısal alan loglanıyor; sezon alanları yok. Hata `catch` ile yutuluyor (kayıt başarısız olsa da işlem başarılı). |
| 20 | Önbellek geçersizleştirme | ÇALIŞIYOR | `route.ts:85`; `lib/gamification-settings.ts:22-41` | `revalidateTag(..., 'max')` stale-while-revalidate: değişiklik bir sonraki istekte arka planda tazelenir. |
| 21 | i18n (TR/EN) | KISMİ | `messages/tr.json`/`en.json` `adminGamificationSettings` | Arayüz metinleri çift dilli; sunucu hataları TR-only; placeholder "Kış Sezonu 2024" eskimiş. |
| 22 | Mobil yerleşim | KISMİ | `page.tsx:69-70,81,151` | Kartlar `md` altı tek kolon (iyi); başlık satırı `flex justify-between` sarılmıyor; `p-6` layout padding'ine ekleniyor (`app/admin/layout.tsx:31-36`). Kaydet yalnız sayfa başında, mobilde yapışkan değil. |
| 23 | Form erişilebilirliği (label bağı) | EKSİK | `page.tsx:93-98,172-178` | `Label` ↔ `Input` arasında `htmlFor`/`id` yok; switch erişilebilir ada sahip değil; birim/aralık açıklaması (`aria-describedby`) yok. |
| 24 | Kirli durum / kaydedilmemiş değişiklik uyarısı | EKSİK | `page.tsx` tümü | Kardeş `points-matrix` sayfasında var (`app/admin/points-matrix/page.tsx:200,434,990`). |
| 25 | Değişiklik geçmişi / geri alma | EKSİK | — | Audit log yazılıyor ama sayfada gösterilmiyor; önceki değere dönüş yok. |
| 26 | Etki önizlemesi + onay (ekonomi kritik) | EKSİK | — | 100× çarpan tek tıkla canlıya çıkıyor; `economy-sim` ayrı sayfada ve bu çarpanları bilmiyor. |
| 27 | Eşzamanlı düzenleme koruması | EKSİK | `route.ts:68-70` | Sürüm/`updatedAt` kontrolü yok; iki admin son-yazan-kazanır. |
| 28 | Motion / mikro-etkileşim | KISMİ | `page.tsx:4` | `m as Motion` import edilmiş ama hiç kullanılmıyor (ölü import); `ShieldCheck` de kullanılmıyor (`page.tsx:5`). |
| 29 | Tekil satır bütünlüğü | KISMİ | `prisma/schema.prisma:544-554`; `route.ts:23`; `lib/gamification-settings.ts:27` | Unique/sabit id yok. Eşzamanlı ilk GET iki satır oluşturabilir; admin sırasız `findFirst` ile bir satırı, tüketici `updatedAt desc` ile başka satırı okuyabilir. Canlı DB'de çift satır olup olmadığı **doğrulanmadı** (DB'ye dokunulmadı). |

**Durum sayıları:** ÇALIŞIYOR 7 · KISMİ 10 · BOZUK 3 · SAHTE 4 · EKSİK 5 (toplam 29)

---

## Bulgular

### 1. Ayarların çoğu write-only: sayfa operatöre etkisi olmayan kontroller sunuyor
- **Önem:** kritik · **Kategori:** işlevsellik / ürün dürüstlüğü
- **Kanıt:** `levelUpRewardBase`, `seasonName`, `seasonEndsAt`, `isSeasonActive` repo genelinde yalnız `app/admin/gamification-settings/page.tsx` ve `app/api/admin/gamification/settings/route.ts` içinde geçiyor; `dailyXpCap` `lib/gamification-settings.ts:26,33`'te okunuyor ama `app/api/feedbacks/route.ts:303-346`'da kullanılmıyor. `isSeasonActiveDesc` metni "sezon ödülleri ve sıralamaları dondurulur" vaat ediyor.
- **Sorun:** Bir operatör sezonu "kapattığında" ya da günlük XP tavanını düşürdüğünde hiçbir şey olmuyor ve arayüz bunu başarılı bir kayıt olarak onaylıyor. Bu, kriz anında (ör. XP istismarı) admin'in yanlış güvenle hareket etmesine yol açar. `lib/gamification-settings.ts:3-4` yorumunda aynı "write-only" sorunu çarpanlar için tespit edilip yarım kapatılmış.
- **Profesyonel öneri:** Her ayar için "tüketici sözleşmesi" kur: `lib/gamification-settings.ts` tek tipli `getGamificationSettings()` döndürsün ve her alanın hangi motor tarafından okunduğu kodda belgelensin. Ardından alan alan karar ver: (a) `dailyXpCap` → `creditPointsAndXp` öncesi ortak bir `capXp(userId, xp, tx)` (points-caps desenindeki gibi `points_credited` event'lerinden XP toplamı) ile gerçekten uygula; (b) `levelUpRewardBase` → `lib/points-wallet.ts` `isLevelUp` döndüğünde aynı transaction içinde idempotent `level_up_reward` kredisi (ekonomi değişmezleri: tek seferlik, `points_credited` görünür); (c) sezon alanları → gerçek bir lig sezonu motoruna (`league-settings`) bağlanana kadar arayüzden kaldır. Bağlanmamış alan arayüzde kalacaksa açıkça "Henüz uygulanmıyor" rozetiyle disable gösterilmeli.
- **Efor:** L

### 2. "Global" çarpanlar yalnız feedback yolunda uygulanıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ekonomi
- **Kanıt:** `app/api/feedbacks/route.ts:303-318` tek tüketici; `creditPointsAndXp` kullanan diğer dosyalar (`app/api/customer/games/[game]/complete/route.ts`, `app/api/gamification/spin/route.ts`, `app/api/gamification/quests/[id]/claim/route.ts`, `app/api/streak/route.ts`, `app/api/referral/route.ts`, `app/api/surprise-box/[id]/open/route.ts`, `app/api/customer/consumptions/[id]/review/route.ts`, `lib/achievements.ts`, `lib/login-streak.ts` vb.) çarpanı uygulamıyor.
- **Sorun:** Etiket "XP Çarpanı (Global)" ve açıklama "global olarak artırın veya azaltın" diyor. Operatör 2× hafta sonu etkinliği açtığında kullanıcı oyun/görev/spin'de hiçbir fark görmez; ekonomi raporları ile beklenti ayrışır.
- **Profesyonel öneri:** Çarpanı tek bir kanaldan uygula: `lib/points-wallet.ts` `creditPointsAndXp`'ye `source` parametresi ekleyip çarpanı merkezi uygula ya da her kaynağı bir "kapsam" listesinde (`appliesTo: ['feedback','games','quests',...]`) admin'e seçtir. Admin ekranında her çarpanın yanında "Uygulandığı kaynaklar" çiplerini göster. Bonus/ödül tabloları (spin ödülleri, sabit görev ödülleri) çarpandan bilinçli muafsa bunu UI'da açıkça yaz.
- **Efor:** M

### 3. Yükleme hatası sayfayı çökertiyor
- **Önem:** yüksek · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:28-35` `data.success` false ise `settings` `null` kalıyor; `page.tsx:97` `settings.xpMultiplier` koşulsuz okunuyor.
- **Sorun:** 403 (token-replay, `lib/api-auth.ts:70-76`), 500 veya oturum düşmesinde kullanıcı toast yerine global hata ekranını görür; `res.ok` kontrolü yok, hata mesajı yok, yeniden dene yok.
- **Profesyonel öneri:** Veri katmanını `useSWR`/`useQuery` benzeri bir hook'a taşı (`{ data, error, isLoading, mutate }`); `error` durumunda kart içinde açıklayıcı bir boş durum + "Yeniden dene" butonu göster; `res.ok` ve şema doğrulaması (zod) ekle; `settings` tipini `GamificationSettings` Prisma tipinden türet (`any` kaldırılsın).
- **Efor:** S

### 4. Boş bırakılan sayı alanı sessizce 0 olarak kaydediliyor (ve UI ile gerçek ayrışıyor)
- **Önem:** yüksek · **Kategori:** veri bütünlüğü
- **Kanıt:** `page.tsx:98,107,128,136` `parseFloat/parseInt('')` → NaN; `JSON.stringify` NaN'ı `null` yapar; `route.ts:13` `Number(null)` = 0 → clamp aralığında → kaydedilir. `lib/gamification-settings.ts:31-33` 0 değerini 1/5000'e geri çevirir.
- **Sorun:** Operatör bir alanı temizleyip kaydederse DB'ye 0 yazılır, ekran "0" ve "Ayarlar kaydedildi" der; gerçekte çarpan 1 olarak uygulanır. Ayrıca 0 çarpanı "puan kazanımını durdur" anlamında kullanmak isteyen operatör de sessizce başarısız olur.
- **Profesyonel öneri:** Form state'ini string tut, zod şemasıyla istemci+sunucu ortak doğrulaması yap (`min`, `max`, `step`, zorunlu); geçersizken Kaydet disable + alan altı hata. Sunucuda `null`/boş değeri "değişmedi" olarak ele al (`v == null || v === '' → fallback`). 0'ın anlamına ürün kararı ver: "kazanımı dondur" desteklenecekse helper'daki `> 0` koruması kaldırılıp açık bir "ekonomi durdurma" anahtarı eklenmeli; desteklenmeyecekse min=0.1 olmalı.
- **Efor:** S

### 5. API uçları yönetici gizli kapısını uygulamıyor
- **Önem:** yüksek · **Kategori:** güvenlik (sistemik)
- **Kanıt:** `proxy.ts:102-115` `/api/*` isteklerini `authMiddleware`'e sokmadan geçiriyor; gate kontrolü (`proxy.ts:79-87`) yalnız sayfa yollarında. `route.ts:20,47` yalnız `requireAuth(['ADMIN'])`; `lib/` ve `app/api/` içinde `admin_gate` doğrulaması yok.
- **Sorun:** Kapının amacı "rolü kazara/kötü niyetle ADMIN yapılmış hesap bile gizli cevabı bilmeden panele giremez" (`proxy.ts:76-78`). Bu sayfanın PATCH ucu ekonomi-kritik çarpanları değiştirebiliyor ve gate çerezi olmadan doğrudan çağrılabilir. Sorun yalnız bu sayfaya özgü değil, tüm `/api/admin/*` için geçerli.
- **Profesyonel öneri:** `requireAuth(['ADMIN'])` içine (ya da `requireAdmin()` yardımcısına) `gateCookieBelongsTo(cookies().get('admin_gate'), userId)` kontrolü ekle; `/api/admin/*` için proxy'de de edge doğrulaması yap. Ekonomi-kritik PATCH'ler için ek olarak yeniden kimlik doğrulama (step-up) düşün.
- **Efor:** M

### 6. Sezon bitiş tarihi alanı düzenlenirken kayıyor ve temizlenemiyor
- **Önem:** orta · **Kategori:** hata / UX
- **Kanıt:** `page.tsx:165-166`: görüntüleme `new Date(x).toISOString().slice(0,16)` (UTC), `onChange` yerel `datetime-local` string yazıyor; `route.ts:62-64`: boş string → `current.seasonEndsAt`'a düşüyor.
- **Sorun:** Türkiye'de (UTC+3) kullanıcı 23:59 seçtiği an state `"…T23:59"` olur, yeniden render bunu yerel saat olarak parse edip UTC'ye çevirir → kutu 20:59 gösterir; her düzenlemede 3 saat geri kayar. Kaydedilen değer sunucuda sunucu saat diliminde yorumlanır (Vercel çalışma zamanı TZ'si **doğrulanmadı**). Tarih silinmek istendiğinde eski değer geri gelir.
- **Profesyonel öneri:** Tarih/saat için tek kural: istemci yerel girdiyi `new Date(local).toISOString()` ile UTC ISO'ya çevirip gönderir; görüntülemede `date-fns-tz`/`Intl` ile yerel biçime döndürülür; saat dilimi etiketi ("Europe/Istanbul") alan altında gösterilir. Sunucuda `seasonEndsAt: null` açıkça "temizle" olarak kabul edilmeli. (Alan şu an hiçbir yerde okunmadığı için bu düzeltme Bulgu 1 kararından sonra yapılmalı.)
- **Efor:** S

### 7. Ekonomi-kritik değişiklik için önizleme, onay, kirli durum ve geçmiş yok
- **Önem:** orta · **Kategori:** UX / operasyonel güvenlik
- **Kanıt:** `page.tsx:38-58` doğrudan PATCH; `route.ts:56-57` çarpan üst sınırı 100; `route.ts:73-83` audit log var ama sayfada gösterilmiyor; kardeş `points-matrix` dirty takibi yapıyor (`app/admin/points-matrix/page.tsx:200,434`).
- **Sorun:** 1.0 → 10.0 yazım hatası tek tıkla canlıya çıkar; operatör neyi değiştirdiğini (diff), kimin en son değiştirdiğini ve önceki değeri göremez; sekme kapatılırsa değişiklikler sessizce kaybolur.
- **Profesyonel öneri:** Stripe/PostHog tarzı "değişiklikleri gözden geçir" akışı: Kaydet → eski/yeni diff'li onay paneli + tahmini etki ("son 7 gün verisine göre günlük basılan puan ~X → ~Y", `economy-sim` uç noktası çarpanı parametre alacak şekilde genişletilir); eşik üstü değişikliklerde (ör. çarpan > 3) açık onay metni yazdırma. Sayfanın altında `AuditLog` (`entity='GamificationSettings'`) zaman çizelgesi + "Bu sürüme geri dön". `beforeunload` + dirty rozet + sticky alt kaydetme çubuğu.
- **Efor:** M

### 8. Tekil ayar satırı modelde garanti değil; admin ve tüketici farklı satırı okuyabilir
- **Önem:** orta · **Kategori:** mimari / veri bütünlüğü
- **Kanıt:** `prisma/schema.prisma:544-554` unique/sabit id yok; `route.ts:23-35` sırasız `findFirst` + yoksa `create` (GET'te yan etki); `lib/gamification-settings.ts:25-28` `orderBy: { updatedAt: 'desc' }`.
- **Sorun:** İlk kurulumda eşzamanlı iki GET iki satır yaratabilir; sonrasında admin sırasız ilk satırı düzenlerken tüketici başka satırı okuyabilir. Ayrıca eşzamanlı iki admin son-yazan-kazanır.
- **Profesyonel öneri:** `id String @id @default("singleton")` ya da `key String @unique` ile tekil satırı şemada zorunlu kıl; GET salt-okur olsun (yoksa varsayılanları döndürsün), yazma `upsert` ile yapılsın; PATCH `If-Match`/`updatedAt` ile iyimser kilit (çakışmada 409 + "başkası değiştirdi, yenile"). Migration öncesi canlıda çift satır olup olmadığı kontrol edilmeli (bu denetimde **doğrulanmadı**).
- **Efor:** S

### 9. XP hiç tavanlanmıyor; çarpan üst sınırı 100×
- **Önem:** orta · **Kategori:** ekonomi
- **Kanıt:** `feedbacks/route.ts:318` `xpToCredit` tavana girmiyor (yalnız puan `capFeedbackPoints` ile kısılıyor, `lib/points-caps.ts:57-65`); `route.ts:56` xp çarpanı 0-100.
- **Sorun:** "Günlük Maksimum XP" alanı varken XP tavansız; 100× çarpan seviye enflasyonu yaratabilir. Sayfadaki "Suistimali önlemek için" açıklaması gerçeği yansıtmıyor.
- **Profesyonel öneri:** Bulgu 1(a)'daki `capXp` ile `dailyXpCap`'i uygula; üst sınırı ürün kararıyla makul bir değere (ör. 5×) indir ve üstü için onay iste; sabit kodlu `DAILY_FEEDBACK_POINTS_CAP`/`WEEKLY_FEEDBACK_POINTS_CAP` (`lib/points-caps.ts:13-14`) değerlerini bu sayfaya (veya `points-matrix`'e) yönetilebilir alan olarak taşı — operatörün gerçekte ihtiyaç duyduğu tavan budur.
- **Efor:** M

### 10. Dil karışıklığı ve eksik i18n
- **Önem:** düşük · **Kategori:** i18n
- **Kanıt:** `route.ts:40,89` ve `lib/api-auth.ts:73` TR-only hata metinleri, `page.tsx:51` doğrudan gösteriyor; `adminGamificationSettings.saving` tanımlı ama kullanılmıyor; placeholder "Kış Sezonu 2024".
- **Profesyonel öneri:** API'ler hata kodu (`{ code: 'SETTINGS_SAVE_FAILED' }`) döndürsün, istemci kodu çevirsin; kullanılmayan anahtarı ya kullan (buton metni) ya sil.
- **Efor:** S

### 11. Erişilebilirlik ve mobil yerleşim
- **Önem:** düşük · **Kategori:** a11y / mobil
- **Kanıt:** `page.tsx:93-98,102-108,124-137,154-167` `Label` ile `Input` bağsız; `page.tsx:175` switch adsız; `page.tsx:62-64` spinner'da durum duyurusu yok; `page.tsx:69-70` `p-6` + sarılmayan başlık satırı.
- **Profesyonel öneri:** Her alana `id` + `htmlFor`, birim/aralık için `aria-describedby` yardımcı metin ("0.1–5×, varsayılan 1.0"); switch'e `aria-labelledby`; yükleme için iskelet + `role="status"`. Başlık satırı `flex-wrap gap-3`; dış `p-6` kaldırılıp layout padding'ine güvenilsin; mobilde Kaydet sticky alt çubuğa taşınsın (`env(safe-area-inset-bottom)` ile).
- **Efor:** S

### 12. Ölü kod ve tip kaçakları
- **Önem:** düşük · **Kategori:** kod kalitesi
- **Kanıt:** `page.tsx:4` kullanılmayan `m as Motion`; `page.tsx:5` kullanılmayan `ShieldCheck`; `page.tsx:18` `useState<any>`; `page.tsx:20-22` `fetchSettings` effect bağımlılığı dışında tanımlı; girinti karışık (`page.tsx:31-58`).
- **Profesyonel öneri:** Ölü importları sil, tipli state, veri katmanını hook'a al (Bulgu 3 ile birlikte).
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Değişiklik gözden geçirme + onay akışı** (Stripe'ın "Review changes" diff paneli): eski→yeni değerler, etki tahmini, kritik eşiklerde açık onay.
2. **Ayar geçmişi ve geri alma** (PostHog feature flag history, Linear audit): `AuditLog` zaman çizelgesi, kim/ne zaman/ne değişti, tek tıkla önceki sürüme dönüş.
3. **Zamanlanmış/geçici değişiklik**: "2× XP, Cuma 18:00 – Pazar 23:59" gibi başlangıç-bitişli çarpan (bugün `seasonal-campaigns` ayrı yürüyor); otomatik geri dönüş.
4. **Etki/sağlık göstergesi**: son 24 saat/7 gün basılan puan ve XP, tavana takılan kullanıcı oranı, çarpanın uygulandığı kaynak dağılımı (`points_credited` event'lerinden).
5. **Kapsam seçimi**: çarpanın uygulanacağı kaynaklar (feedback, oyunlar, görevler, spin…) ve segment (yeni kullanıcı, VIP) — PostHog release condition mantığı.
6. **Ortam/sandbox önizleme**: `economy-sim` ile canlıya çıkmadan "bu ayarlarla 30 günlük simülasyon".

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında önce "ekonominin şu anki nabzını" görür, ardından yalnızca **gerçekten etkisi olan** düğmeleri, her birinin nereye uygulandığını bilerek, etkisini önizleyerek ve geri alınabilir biçimde değiştirir.

**Yerleşim (masaüstü):**
- Üst: `AdminPremiumHero` (kardeş sayfalarla tutarlı) + sağda durum rozeti ("Güncel" / "3 değişiklik kaydedilmedi").
- Satır 1 — **Nabız şeridi**: 4 KPI kutusu (bugün basılan puan, bugün kazanılan XP, tavana takılan kullanıcı %, aktif çarpan/kampanya). Veri: yeni `GET /api/admin/gamification/pulse` (Redis 60 sn cache, `points_credited` toplamları).
- Satır 2 — **Çarpanlar kartı**: her çarpan için slider + sayı girişi (0.1–5×), altında "Uygulandığı kaynaklar" çipleri ve "Son değişiklik: Furkan, 2 gün önce".
- Satır 3 — **Tavanlar kartı**: günlük/haftalık puan tavanı (bugün `lib/points-caps.ts`'te sabit), günlük XP tavanı — hepsi gerçekten uygulanan değerler.
- Satır 4 — **Sezon**: ya `league-settings` sezon motoruna bağlanmış gerçek bir sezon kartı (aktif sezon, kalan süre, sezon sonu ödül dağıtımı önizlemesi) ya da tamamen kaldırılmış.
- Alt: **Geçmiş** zaman çizelgesi (audit log) + "Geri al".
- Yapışkan alt çubuk: "Değişiklikleri gözden geçir" → diff + etki tahmini içeren yan panel (Sheet) → "Canlıya al".

**Mobil:** Tek kolon, KPI şeridi yatay kaydırmalı, sticky alt kaydetme çubuğu (safe-area dahil), diff paneli tam ekran sheet.

**Motion/3D:** 3D gereksiz — bu bir operasyon ekranı. Ölçülü motion yerinde: kirli alanların sol kenarında ince vurgu çizgisi `Motion` ile belirip kaybolur; KPI sayıları değişimde kısa sayaç animasyonu; diff panelinde eski→yeni değer geçişi. Tümü `useReducedMotion` ile kapatılabilir olmalı. Şu anki ölü `Motion` importu ya bu amaçla kullanılmalı ya silinmeli.

**Veri/API değişiklikleri:**
- Şema: `GamificationSettings` tekil anahtar (`id @default("singleton")`), `dailyPointsCap`, `weeklyPointsCap`, opsiyonel `multiplierScopes Json`, `version Int` (iyimser kilit).
- `GET` salt-okur, `PUT` tam doğrulamalı (zod paylaşımlı şema `lib/schemas/gamification-settings.ts`), `If-Match` ile 409.
- `lib/gamification-settings.ts` → tek `getGamificationSettings()`; `creditPointsAndXp` merkezi çarpan + XP tavanı uygulasın; `lib/points-caps.ts` sabitleri ayardan okusun.
- `GET /api/admin/gamification/pulse` ve `POST /api/admin/economy-sim` çarpan/tavan parametresi alacak şekilde genişletilsin.
- Audit log tüm alanları (sezon dahil) diff olarak yazsın; `GET /api/admin/audit?entity=GamificationSettings` sayfada gösterilsin.
- Tüm `/api/admin/*` için gate çerezi doğrulaması (Bulgu 5).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/points-matrix`**: Kaynak başına puan/XP değerleri, spin günlük limiti burada (`app/admin/points-matrix/page.tsx:45,835`). Global çarpan ve tavanlar ile aynı zihinsel modele ait; operatör iki sayfa arasında gidip gelmek zorunda. **Öneri:** "Ekonomi" başlığı altında sekmeli tek sayfa: *Kurallar* (points-matrix) · *Çarpanlar & Tavanlar* (bu sayfa) · *Simülasyon* (economy-sim) · *Geçmiş*.
- **`/admin/economy-sim`**: Ayrı sayfa; bu sayfadaki çarpanları bilmiyor. Sekme olarak birleşip mevcut/taslak ayarlarla çalışmalı.
- **`/admin/seasonal-campaigns`** (ve `seasonal-concepts`): Zaman pencereli çarpan zaten orada (`app/admin/seasonal-campaigns/page.tsx:18,34`) ve gerçekten uygulanıyor (`lib/seasonal-campaign-live`). Bu sayfanın "Sezon Yönetimi" kartı ile kavramsal çakışma ("sezon" kelimesi iki farklı şey) — kart kaldırılmalı ya da lig sezonu olarak yeniden adlandırılıp `league-settings`'e taşınmalı.
- **`/admin/league-settings`**: "Sezon sıralamaları dondurulur" vaadinin doğal sahibi burası; sezon yaşam döngüsü (başlat/bitir/ödül dağıt) burada tasarlanmalı.

Sonuç: Sayfa tek başına korunmaya değer değil; çarpan+tavan çekirdeği "Ekonomi" sayfasına sekme olarak taşınmalı, sezon kartı kaldırılmalı veya lig modülüne devredilmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia, kod baştan okunarak çürütülmeye çalışıldı (salt okunur; DB/komut çalıştırılmadı).

### 1. Ekonomi ayarlarının çoğu write-only — **DOĞRULANDI**
- `levelUpRewardBase`, `seasonName`, `seasonEndsAt`, `isSeasonActive` alanları uygulama kodunda yalnızca `app/admin/gamification-settings/page.tsx` ve `app/api/admin/gamification/settings/route.ts` içinde geçiyor (geri kalan tek eşleşme `generated-prisma-client/index.d.ts`). `prisma.gamificationSettings` okuyan tek tüketici `lib/gamification-settings.ts:25`, o da yalnız `xpMultiplier/pointMultiplier/dailyXpCap` seçiyor.
- `dailyXpCap` `lib/gamification-settings.ts:33`'te döndürülüyor ama tek çağıran `app/api/feedbacks/route.ts:305` bunu kullanmıyor: `xpToCredit = Math.floor(reward.xp * gamiSettings.xpMultiplier)` (`feedbacks/route.ts:318`) tavansız. Kodda `capFeedbackPoints` yalnız puanı kısıyor (`:317`), XP'yi değil.
- `messages/tr.json:4050` "Kapalıysa sezon ödülleri ve sıralamaları dondurulur" vaat ediyor; bunu yapan kod yok.
- **Yeniden üretim:** Admin "Sezon Aktif" anahtarını kapatıp veya "Günlük Maksimum XP"yi 10 yapıp kaydeder → "kaydedildi" toast'ı gelir → müşteri aynı gün art arda geri bildirim bırakır → XP ve sıralama aynen artmaya devam eder.

### 2. Global çarpanlar yalnız feedback yolunda uygulanıyor — **DOĞRULANDI**
- `getGamificationMultipliers` / `lib/gamification-settings` import eden tek dosya `app/api/feedbacks/route.ts:303`. `creditPointsAndXp` kullanan 24 dosyanın (oyunlar, spin, görev ödülü, streak, referral, sürpriz kutu, tüketim değerlendirme, `lib/achievements.ts`, `lib/login-streak.ts`, `lib/visit-missions.ts` vb.) hiçbiri çarpanı uygulamıyor.
- Not: Bazı yolların (iade, cüzdan/escrow transferi, admin manuel düzeltme — `lib/points-wallet.ts`, `app/api/admin/users/route.ts`) çarpanı **almaması doğru**; düzeltme "her yere uygula" değil, kazanç (earn) kaynaklarını açıkça etiketleyip çarpanın kapsamını UI'da göstermek olmalı. Etiket "XP Çarpanı (Global)" (`messages/tr.json:4038`) ve açıklama "global olarak" (`:4037`) bu kapsamı yanlış anlatıyor.
- **Yeniden üretim:** `pointMultiplier=2` kaydet → oyun tamamla / çark çevir / görev ödülü al → kazanılan puan değişmez; yalnız geri bildirim ödülü 2× olur.

### 3. Yükleme hatasında sayfa TypeError ile çöküyor — **DOĞRULANDI** (ufak düzeltmeyle)
- `page.tsx:28-30`: `data.success` yoksa `settings` `null` kalır, `finally` `loading=false` yapar (`:34`); `page.tsx:97` `settings.xpMultiplier` koşulsuz okunur → `TypeError: Cannot read properties of null`. `res.json()` hata verirse (HTML 502 vb.) `catch` toast atar ama yine aynı render'a düşer.
- 403 üretilebilir: `lib/api-auth.ts:66-76` token-replay ihlalinde `{ error }` döner (success yok); `route.ts:38-40` 500'de de `success` yok.
- Düzeltme: "yeniden dene yok" kısmı tam doğru değil — `app/admin/error.tsx` `reset` ile "Tekrar Dene" butonu sunuyor. Ama kullanıcı sayfa bağlamını kaybedip genel hata ekranına düşüyor, Sentry'ye gürültü gidiyor ve hatanın nedeni (403 oturum ihlali vs 500) gösterilmiyor.
- **Yeniden üretim:** Admin oturumu açıkken IP/UA değişir (mobil ağ geçişi) → GET 403 → sayfa "Bir hata oluştu" ekranına düşer.

### 4. Boş alan DB'ye 0 olarak yazılıyor, UI ile etkin değer ayrışıyor — **DOĞRULANDI**
- Zincir doğrulandı: alan temizlenir → `parseFloat('')`/`parseInt('')` = `NaN` (`page.tsx:98,107,128,136`) → `JSON.stringify` NaN'ı `null` yapar → `route.ts:13` `Number(null)` = `0` → `Number.isFinite(0)` true, `clampNum` min 0 → DB'ye `0` yazılır; yanıt `saved` ile ekranda `0` görünür (`route.ts:86`, `page.tsx:49`).
- Etkin değer: `lib/gamification-settings.ts:31-33` `0`'ı çarpanda `1`'e, tavanda `5000`'e çevirir. Yani ekranda "0×" ve "kaydedildi", gerçekte 1×. Aynı ayrışma admin bilinçli olarak `0` girdiğinde de var (API 0'ı geçerli kabul ediyor, helper yok sayıyor) — "puan kazanımını geçici kapat" amacıyla 0 giren operatör hiçbir etki görmez.
- Ekonomik etkisi sınırlı (fallback güvenli tarafta: 1×), ama audit log'a da `0` yazılıyor (`route.ts:80`) → kayıt gerçekle çelişir. Ek gözlem (iddia dışı): `seasonEndsAt` alanı temizlenince `route.ts:62-64` eski değere geri döner, tarih UI'dan silinemez.

### 5. Admin API uçlarında gizli kapı (admin_gate) by-pass edilebilir — **DOĞRULANDI**
- `proxy.ts:105-119`: `/api/*` istekleri `authMiddleware`'e hiç girmiyor; gate kontrolü yalnız `proxy.ts:79-87` (sayfa yolları `/admin*`). `admin_gate` / `gateCookieBelongsTo` aramasında `app/api` ve `lib` altında doğrulama yapan tek yer yok (yalnız cookie'yi **üreten** `app/api/admin/gate/route.ts:68`). `route.ts:20,47` yalnız `requireAuth(['ADMIN'])`.
- **Yeniden üretim:** Rolü ADMIN yapılmış ama gate cevabını bilmeyen hesap giriş yapar → proxy onu `/admin-gate`'e yönlendirir (bu sayfa ADMIN'e açık, aynı origin) → tarayıcı konsolundan `fetch('/api/admin/gamification/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pointMultiplier:100,xpMultiplier:100})})` → `requireAuth` geçer (aynı tarayıcı, token-replay tetiklenmez) → global çarpan 100× olur. Tüm `/api/admin/*` için sistemik.
- Ek ve daha ağır gözlem (iddia dışı, okunarak doğrulandı): sayfa tarafındaki gate de sahte cookie ile aşılabiliyor. `lib/admin-gate-edge.ts:14-22` HMAC'i **doğrulamıyor**, yalnız `"<userId>.<64 hex>"` biçimine bakıyor; kullanıcı kendi `userId`'sini bildiği için `document.cookie = "admin_gate=<userId>." + "0".repeat(64)` ile proxy kontrolü geçilir. Dosyadaki "cookie'yi elde etmenin TEK yolu doğru cevabı vermek" varsayımı yanlış. Gerçek doğrulayıcı `verifyGateCookie` (`lib/admin-gate.ts:55`) tanımlı ama projede hiçbir yerden çağrılmıyor.
- **Öneri:** Gate doğrulamasını Node runtime'da gerçek HMAC ile yapan tek yardımcı (`requireAdminGate()` → `requireAuth(['ADMIN'])` sonrasında `lib/admin-gate.ts` ile imza + cevap sürümü kontrolü) yazılıp tüm `/api/admin/*` uçlarına zorunlu kılınmalı; proxy'de ise Web Crypto (`crypto.subtle`, edge'de async mevcut) ile HMAC doğrulanmalı. Gate cevabı değişince eski cookie'lerin geçersizleşmesi için imzaya cevap sürümü dahil edilmeli.
