# /admin/league-settings

**Amaç:** Platform operatörünün 7 sabit ligin (BASLANGIC → ZENOR) görünen adını, puan eşiklerini (min/max) ve Tailwind gradyanını düzenleyip `Settings` tablosundaki `league_rules` anahtarına kaydetmesi. Kaydedilen kurallar sözde "leaderboard ve müşteri paneli" lig hesabını yönetir.

**Genel puan: 3.9 / 10** · **Karar: yeniden tasarla** (orta vadede "Oyunlaştırma" ayar merkezine taşınmalı; bkz. son bölüm)

> Özet: Sayfa küçük ve okunaklı, sunucu tarafında yetki ve denetim günlüğü (audit log) doğru yazılmış. Asıl sorun şu: sayfa, verdiği sözü tutmuyor. Müşteri paneli, ödül ekranı ve leaderboard'un üst başlığı admin ayarını hiç okumuyor, sabit `DEFAULT_LEAGUE_RULES` ile çalışıyor. Gradyan alanını hiçbir tüketici kullanmıyor. Sunucu doğrulaması `z.unknown()`. GET başarısız olduğunda "Kaydet" butonu kendiliğinden etkin kalıyor ve canlı ayarı varsayılanlarla ezebiliyor. En yüksek puanlı kullanıcılar ise (100.000 puan üstü ya da eşikler arasındaki boşluğa düşenler) "Başlangıç" ligine düşüyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Kaydetme çalışıyor ama etkisi yalnızca `/api/leaderboard` satırlarına ulaşıyor. Gradyan alanı sahte, hata yolunda veri ezme riski var, eşik doğrulaması yok. |
| UX | 4/10 | Lig yelpazesini bir bütün olarak gösteren bir görünüm yok: boşluk ve çakışma uyarısı, etki önizlemesi, geri alma ve kaydedilmemiş değişiklik uyarısı eksik. Operatör 7 kutuyu kafasında birleştirmek zorunda. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ve shadcn kartlarıyla tutarlı. Ancak her kart aynı ağırlıkta, lig kimliği (gradyan ya da rozet) kartta hiç gösterilmiyor ve hiyerarşi düz. |
| Mimari | 3/10 | Varsayılan kurallar üç ayrı yerde tutuluyor ve birbiriyle çelişiyor. İstemci tarafındaki yardımcılar DB'yi bypass ediyor. Cache instance-içi bellekte duruyor, şema `z.unknown()`. |
| Performans | 7/10 | Tek GET ve tek PUT var, 60 sn bellek cache'i kullanılıyor. Sayfada ağır bileşen yok. Sadece Redis yerine instance-içi cache kullanıldığı için bayatlama yaşanıyor. |
| Erişilebilirlik + mobil | 4/10 | `Label` ile `Input` birbirine bağlı değil (`htmlFor`/`id` yok). Yükleme ve hata için `aria-live` yok. Metinler i18n'siz, sabit Türkçe. Mobil grid düzgün katlanıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlığı ve açıklaması | KISMİ | `app/admin/league-settings/page.tsx:109-112` | Açıklama "Leaderboard ve müşteri paneli bu ayarları kullanır" diyor. Müşteri paneli kullanmıyor (bkz. B2), yani metin yanlış bilgi veriyor. |
| 2 | "Yenile" butonu | KISMİ | `page.tsx:115-123` | Yeniden çekiyor, ama kaydedilmemiş düzenlemeleri onay sormadan siliyor. Spinner `loading` durumuna bağlı. |
| 3 | "Kaydet" butonu | KISMİ | `page.tsx:124-131`, `61-79` | Başarılı yolda çalışıyor. GET hata verdiğinde `isDirty` kendiliğinden `true` olduğu için etkin kalıyor (bkz. B1). |
| 4 | "Değiştirildi / Güncel" rozeti | KISMİ | `page.tsx:49`, `141` | `initialSignature` başlangıçta `''`, `JSON.stringify([])` ise `'[]'`. Hata durumunda düzenleme yapılmamışken bile "Değiştirildi" gösteriyor. |
| 5 | İlk yükleme durumu | ÇALIŞIYOR | `page.tsx:81-94` | Düz "Yükleniyor..." metni. İskelet ve `aria-busy` yok. |
| 6 | Hata durumu | BOZUK | `page.tsx:38-40`, `105` | Yalnızca toast gösteriliyor. Ardından sayfa sabit varsayılanları **düzenlenebilir halde** gösteriyor. Hata bandı ve "tekrar dene" butonu yok. |
| 7 | İstemci tarafı yedek (fallback) kurallar | BOZUK | `page.tsx:27-35` ve `96-104` (iki kopya) | Değerler `DEFAULT_LEAGUE_RULES` (`lib/league-rules-core.ts:168-176`) ile çelişiyor: 5001-7499, 10001-11999 vb. aralıklarda boşluklar var. Aynı dizi dosyada iki kez yazılmış. |
| 8 | Lig kartları ızgarası | ÇALIŞIYOR | `page.tsx:148-195` | 1/2/3/4 sütunlu responsive grid. |
| 9 | Lig anahtarı (key) gösterimi | ÇALIŞIYOR | `page.tsx:153` | Salt okunur. |
| 10 | "İsim" alanı | KISMİ | `page.tsx:157-162` | Kaydediliyor ama yalnızca `/api/leaderboard` yanıtındaki `league` adına yansıyor. Uzunluk sınırı yok (istemcide de sunucuda da). |
| 11 | "Min puan" alanı | KISMİ | `page.tsx:166-172`, `55` | Alan temizlenemiyor (boş değer hemen `0` oluyor). Çakışma, boşluk ve sıralama doğrulaması yok. |
| 12 | "Max puan" alanı | KISMİ | `page.tsx:175-181` | `min > max` kabul ediliyor, bu durumda lig ulaşılamaz hale geliyor. En üst ligin max değeri bir "tavan" yaratıyor (bkz. B3). |
| 13 | "Gradient (Tailwind)" alanı | SAHTE | `page.tsx:185-190`. Tüketiciler: `components/customer/dashboard/customer-dashboard.tsx:1326-1328` `DEFAULT_LEAGUE_RULES` okuyor, `app/api/leaderboard/route.ts` gradyan döndürmüyor | DB'deki gradyanı hiçbir ekran okumuyor. Okusa bile Tailwind JIT, kaynakta geçmeyen serbest sınıfları üretmez (`tailwind.config.ts:11` safelist'te gradyan yok). |
| 14 | GET `/api/admin/settings/leagues` (ADMIN yetkisi) | ÇALIŞIYOR | `app/api/admin/settings/leagues/route.ts:18-34` | `requireAuth(['ADMIN'])` ve `PRIVATE_NO_STORE_HEADERS` kullanılıyor. |
| 15 | PUT, upsert ve denetim günlüğü | ÇALIŞIYOR | `route.ts:52-79` | `oldData`/`newData` ile `UPDATE_LEAGUE_RULES` yazılıyor. Transaction yok: upsert başarılı olup audit başarısız olursa günlük eksik kalır. |
| 16 | Sunucu doğrulaması | BOZUK | `lib/validations-admin.ts:96-98` (`rules: z.unknown()`), `lib/league-rules-core.ts:192-211` | Normalize işlemi sadece tip düzeltiyor. Aynı key'den iki tane, tek elemanlı liste, çakışan veya boşluklu aralıklar, `min > max` gibi tüm durumlar kabul ediliyor. |
| 17 | Kayıt sonrası sıralama | ÇALIŞIYOR | `league-rules-core.ts:210` | Sunucu `minPoints`'e göre sıralayıp geri döndürüyor, istemci yanıttaki sırayı kullanıyor (`page.tsx:71`). |
| 18 | Cache geçersizleştirme | KISMİ | `lib/league-rules.ts:26-47`, `route.ts:80` | Bellek cache'i yalnızca PUT'u karşılayan instance'ta temizleniyor. Diğer serverless instance'lar en fazla 60 sn eski kuralla yanıt veriyor. |
| 19 | Rota koruması (proxy, rol ve gate cookie) | ÇALIŞIYOR | `proxy.ts:51`, `79-84` | Layout'ta rol kontrolü yok, koruma proxy'ye bırakılmış. Proje deseniyle tutarlı. |
| 20 | Menü girişi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:215`, `app/admin/admin-utils.ts:110` | Menü etiketi i18n'li, sayfa içeriği değil. |
| 21 | Kaydet/hata toast'ları | KISMİ | `page.tsx:39,70,73,75`, `lib/admin-toast.ts` | Önek "Basarili: " Türkçe karakter içermiyor (paylaşılan yardımcı). Hata mesajı alana özgü değil. |
| 22 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:148`, `app/admin/layout.tsx:33-38` | Tek sütuna iniyor. Hero'daki iki buton dar ekranda yan yana sığıyor. |
| 23 | Form erişilebilirliği (label ile input ilişkisi) | KISMİ | `page.tsx:157,166,175,185` | `Label` bileşenlerinde `htmlFor` yok, `Input`'larda `id` yok. Ekran okuyucu alan adını duyurmaz. |
| 24 | i18n (EN dil desteği) | EKSİK | Sayfanın tamamı sabit TR. `messages/en.json:2518` yalnızca menü etiketini içeriyor | |
| 25 | Aralık doğrulaması ve görsel lig şeridi | EKSİK | — | Boşluk ve çakışma uyarısı yok. |
| 26 | Etki önizlemesi (hangi ligde kaç kullanıcı var, kaç kişi lig değiştirecek) | EKSİK | — | |
| 27 | Değişiklik geçmişi ve geri alma | EKSİK | — | Audit log yazılıyor ama sayfada gösterilmiyor. |
| 28 | Kaydedilmemiş değişiklik koruması (beforeunload, yenilemeden önce onay) | EKSİK | — | |
| 29 | "Varsayılana sıfırla" | EKSİK | — | |
| 30 | Eşzamanlı düzenleme koruması (sürüm/ETag) | EKSİK | `route.ts:56` | Son yazan kazanıyor. |

**Durum dağılımı:** ÇALIŞIYOR 10 · KISMİ 10 · BOZUK 3 · SAHTE 1 · EKSİK 6 (toplam 30)

---

## Bulgular

### B1 — GET başarısız olursa "Kaydet" kendiliğinden etkin kalıyor ve canlı ayarı ezebiliyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü
- **Kanıt:** `page.tsx:19` (`initialSignature = ''`), `page.tsx:38-41` (catch bloğu `rules` ve `initialSignature`'ı set etmiyor), `page.tsx:49` (`isDirty = '' !== '[]'`, yani `true`), `page.tsx:105` (boş `rules` için düzenlenebilir sabit varsayılanlar gösteriliyor), `page.tsx:51-58` (`updateRule` boş diziye indeksle yazıyor), `lib/league-rules-core.ts:193` ve `195-210`.
- **Sorun:** Geçici bir ağ veya DB hatasından sonra sayfa, sanki gerçek veriymiş gibi (ve `DEFAULT_LEAGUE_RULES`'tan farklı, boşluklu) 7 kart gösteriyor, rozet de "Değiştirildi" diyor. Operatörün önünde iki tehlikeli yol var:
  1. Hiçbir şey düzenlemeden "Kaydet"e basarsa `rules: []` gidiyor. Normalize bunu `DEFAULT_LEAGUE_RULES` olarak kaydediyor ve özelleştirilmiş canlı ayar sessizce sıfırlanıyor.
  2. Bir kartı düzenlerse `next[index] = {name: 'X'}` seyrek bir dizi oluşturuyor, JSON'da `[null, {"name":"X"}]` olarak gidiyor. Normalize null'ı atlayıp **tek elemanlı** bir liste kaydediyor (örn. sadece KOR 3000–5000). `getLeagueMetaFromRules` eşleşme bulamayınca `list[0]` döndürdüğü için bütün kullanıcılar aynı lige düşüyor.
- **Profesyonel öneri:** Yükleme, hata ve hazır durumlarını ayrı bir durum makinesiyle modelleyin (`status: 'loading' | 'error' | 'ready'`). Hata durumunda formu hiç render etmeyin; yerine "Kurallar okunamadı, tekrar dene" bandı gösterin. `isDirty` yalnızca `status === 'ready'` iken hesaplansın. Sunucuda ise doğrulamayı sertleştirin (B4): tam 7 benzersiz key şart koşulsun, eksik veya fazla eleman 400 dönsün. Böylece istemci hatası DB'ye ulaşamaz. Sayfadaki iki sabit varsayılan dizisi silinsin.
- **Efor:** S

### B2 — Müşteri paneli, ödül ekranı ve leaderboard başlığı admin ayarını hiç okumuyor
- **Önem:** yüksek · **Kategori:** işlevsellik / veri tutarlılığı
- **Kanıt:** `lib/utils.ts:141-164`: `getLeague`, `getLeagueMeta`, `getLeagueProgress` ve `getNextLeagueMeta` hep `DEFAULT_LEAGUE_RULES` kullanıyor. Tüketiciler:
  - `components/customer/dashboard/customer-dashboard.tsx:420-423` (lig adı, ilerleme ve sonraki lig) ve `1326` ("Tüm ligler" listesi)
  - `app/customer/rewards/page.tsx:241` (sürpriz yumurta lig teması)
  - `app/customer/leaderboard/page.tsx:99` (kullanıcının kendi lig etiketi)

  Yalnızca `app/api/leaderboard/route.ts:79` ve `108-123` DB kurallarını kullanıyor. Sayfa açıklaması (`page.tsx:111`, `144`) tersini iddia ediyor.
- **Sorun:** Admin "Kor" ligini 4000'den başlatırsa leaderboard satırında kullanıcı "Başlangıç" görünüyor, aynı kullanıcının dashboard'unda "Kor" yazıyor. Operatör değişikliğin etkisini doğrulayamıyor, kullanıcı da çelişkili statü görüyor. Sayfanın varlık sebebinin yarısı bu yüzden işlemiyor.
- **Profesyonel öneri:** Lig kurallarını tek kaynaklı hale getirin. (a) `getLeagueRules()` sonucunu dashboard ve ödül API yanıtlarına `league: { key, name, minPoints, maxPoints, next, progress }` olarak ekleyin; istemci hesap yapmasın, sunucunun verdiğini göstersin. (b) İstemcide liste gerekiyorsa küçük, herkese açık bir `GET /api/league-rules` ucu yazın (public cache + `revalidateTag('league-rules')`) ve `useLeagueRules()` SWR hook'u ile okuyun. `lib/utils.ts` içindeki `DEFAULT_LEAGUE_RULES`'a bağlı yardımcıları kaldırın ya da kurallar parametresi zorunlu olacak şekilde değiştirin, böylece derleyici kalan yanlış kullanımları yakalasın.
- **Efor:** M

### B3 — Tavanın üstü ve boşluklar kullanıcıyı "Başlangıç"a düşürüyor
- **Önem:** yüksek · **Kategori:** hata / veri bütünlüğü
- **Kanıt:** `lib/league-rules-core.ts:213-217`: `find(p >= min && p <= max) ?? list[0]`. Varsayılan ZENOR max değeri 100000 (`:175`). İlerleme hesabı `:230` satırında `maxPoints >= 100000` ile özel durum olarak ele alınıyor.
- **Sorun:** 100.001 puana ulaşan en sadık kullanıcı leaderboard'da "Başlangıç" ligi olarak görünüyor. Admin ZENOR max'ını 60.000'e indirirse bu durum 60.001'den itibaren yaşanıyor. Sayfadaki yedek değerlerdeki boşluklar (örn. 5001–7499) da aynı sonucu doğuruyor. Kötü durumda en değerli kullanıcı segmenti toplu halde "düşürülüyor".
- **Profesyonel öneri:** Lig modelini "max'lı aralık" yerine **yalnızca eşik** olarak yeniden tanımlayın: her lig bir `minPoints` taşısın, max bir sonraki ligin min değerinden türesin, son lig sınırsız olsun. Arama `findLast(r => p >= r.minPoints)` olsun. Bu yaklaşım boşluk ve çakışmayı veri modelinde imkânsız kılar, UI'da da max alanı kalkar (bkz. vizyon). İlerleme hesabındaki `>= 100000` sihirli sayısı "son lig mi?" kontrolüne dönüşsün.
- **Efor:** S–M (core, admin UI ve leaderboard birlikte güncellenmeli)

### B4 — Sunucu doğrulaması `z.unknown()`; geçersiz yapılandırmalar kabul ediliyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü
- **Kanıt:** `lib/validations-admin.ts:96-98`, `lib/league-rules-core.ts:192-211` (tekrarlanan key, tek eleman, `min > max`, çakışma, sınırsız `name`/`gradient` uzunluğu kabul ediliyor), `route.ts:43` (`request.json()` bozuk JSON'da 400 yerine 500 döndürüyor).
- **Sorun:** Yetkili bir admin bile yazım hatasıyla (örn. min 30000, max 3000) bir ligi ulaşılamaz hale getirebiliyor. İki kart aynı key'e sahip olabiliyor ve `getNextLeagueMetaFromRules` (`:219-225`) `findIndex` ile ilkini bulduğu için ilerleme zinciri bozuluyor. Hata mesajı alana özgü olmadığı için operatör neyi düzelteceğini bilemiyor.
- **Profesyonel öneri:** Şöyle bir Zod şeması yazın: `z.array(ruleSchema).length(7)`, `superRefine` ile key'ler benzersiz ve 7 geçerli key'i birebir kapsıyor, `min` değerleri kesin artan ve ilki 0, `name` için `trim().min(1).max(32)`. Hata yanıtı `{ path: ['rules', i, 'minPoints'], message }` döndürsün, istemci bunu ilgili kartın altında satır içi hata olarak göstersin. Aynı şema istemcide de çalışsın (paylaşılan modül) ki "Kaydet" geçersiz durumda zaten devre dışı olsun.
- **Efor:** S

### B5 — "Gradient (Tailwind)" alanı hiçbir şeyi değiştirmiyor
- **Önem:** orta · **Kategori:** sahte özellik / UX
- **Kanıt:** `page.tsx:184-191`. DB'deki gradyan değerini hiçbir tüketici okumuyor: `customer-dashboard.tsx:1326-1328` sabit varsayılanı kullanıyor, `app/api/leaderboard/route.ts` yanıtında `gradient` alanı yok. Ayrıca serbest metin Tailwind sınıfları JIT tarafından üretilmez (`tailwind.config.ts:11` safelist yalnızca z-index içeriyor). Lig görselleri zaten `lib/league-egg-themes.ts` ve `lib/league-avatars.ts` içinde key'e göre sabit.
- **Sorun:** Operatöre çalışmayan bir kontrol sunuluyor. Geliştirici olmayan biri için "from-amber-700 to-orange-500" yazmak zaten uygun bir arayüz değil.
- **Profesyonel öneri:** Ya kaldırın (lig kimliği key'e bağlı tema dosyalarından geliyor), ya da gerçekten ayarlanabilir olsun diye **önceden tanımlı, safelist'e eklenmiş bir palet seçicisi** (8–10 swatch) yapın. Seçilen değeri tüketicilere API üzerinden iletin. Serbest metin sınıf girişi olmasın.
- **Efor:** S (kaldırma) / M (palet + uçtan uca bağlama)

### B6 — Lig, harcanabilir bakiyeden (`User.points`) hesaplanıyor; ödül almak kullanıcının ligini düşürüyor
- **Önem:** orta · **Kategori:** ürün mantığı
- **Kanıt:** `app/api/leaderboard/route.ts:108` (`user.points`), `lib/points-wallet.ts:90-97` (ödül ve harcamada `points: { decrement }`), `customer-dashboard.tsx:417` ve `1094` (aynı değer "XP" etiketiyle gösteriliyor).
- **Sorun:** Bir kullanıcı 6.000 puanını ödüle çevirdiğinde "Veyra"dan "Başlangıç"a düşüyor. Bu durum oyunlaştırma ile ekonomi arasında çatışma yaratıyor: ödül kullanmak cezalandırılmış oluyor. Aynı ekranda değerin "XP" olarak etiketlenmesi kafa karışıklığını artırıyor. Bu sayfa, operatöre eşiklerin **hangi metriğe** uygulandığını hiç söylemiyor.
- **Profesyonel öneri:** Lig metriğini açıkça seçilebilir yapın (`metric: 'lifetimePoints' | 'points' | 'xp'`) ve varsayılanı **kümülatif kazanılmış puan** olsun. Şemada `UserVIPStatus.lifetimePoints` (`prisma/schema.prisma:1798`) zaten var, ya da `PointsLedger` toplamından türetilebilir. Bu sayfada metrik, kartların üstünde net bir etiketle gösterilsin. Değişiklik ekonomi tarafını etkilediği için hafıza notundaki "points economy invariants" kurallarıyla birlikte değerlendirilmeli. Bu öneri ürün kararı gerektiriyor; doğrulanmadı, varsayım değil öneri olarak sunuluyor.
- **Efor:** M–L

### B7 — Varsayılan kurallar için üç ayrı, çelişkili kaynak var
- **Önem:** orta · **Kategori:** mimari
- **Kanıt:** `page.tsx:27-35`, `page.tsx:96-104` ve `lib/league-rules-core.ts:168-176`. Sayfa kopyalarında VEYRA 7500, SAVASCI 12000, ETERON 18000, VETRA 25000, ZENOR 50000; core'da 5001, 10001, 15001, 21001, 30001.
- **Sorun:** Aynı kavram için farklı sayılar ortaya çıkıyor. B1 yolunda operatör yanlış değerleri görüp kaydedebiliyor. Bakım sırasında biri güncellenip diğerleri unutuluyor.
- **Profesyonel öneri:** Sayfadaki iki dizi silinsin. Gerekirse yalnızca `DEFAULT_LEAGUE_RULES` import edilsin, o da sadece "Varsayılana sıfırla" aksiyonu için.
- **Efor:** S

### B8 — Cache yalnızca tek instance'ta temizleniyor; değişiklikler serverless ortamda 60 sn'ye kadar tutarsız
- **Önem:** düşük · **Kategori:** mimari / performans
- **Kanıt:** `lib/league-rules.ts:26-27` (modül değişkeni), `:30-32`, `route.ts:80`.
- **Sorun:** Kayıttan hemen sonra leaderboard'u açan operatör, isteği başka bir instance karşılarsa eski lig adlarını görüyor ve "kaydetmedi mi?" diye düşünüyor.
- **Profesyonel öneri:** Projede zaten kullanılan Upstash katmanına taşıyın: kurallar `unstable_cache` + `revalidateTag('league-rules')` ya da Redis anahtarı ile tutulsun, PUT bu etiketi veya anahtarı geçersiz kılsın. Bellek cache'i en fazla birkaç saniyelik sıcak katman olarak kalabilir.
- **Efor:** S

### B9 — Kaydedilmemiş değişiklik koruması yok; eşzamanlı düzenlemede son yazan kazanıyor
- **Önem:** düşük · **Kategori:** UX / veri bütünlüğü
- **Kanıt:** `page.tsx:117` ("Yenile" onay sormadan state'i eziyor), `beforeunload` dinleyicisi yok, `route.ts:52-67` (sürüm kontrolü yok, `updatedAt` karşılaştırılmıyor).
- **Profesyonel öneri:** GET yanıtına `updatedAt` eklensin, PUT bu değeri `If-Match` benzeri bir alanla göndersin, uyuşmazlıkta 409 dönsün ve UI "Başka biri değiştirdi, farkları gör" göstersin. Dirty durumdayken "Yenile" sayfa içi bir onay iletişim kutusu açsın, `beforeunload` ile sekme kapatma uyarısı eklensin.
- **Efor:** S

### B10 — Erişilebilirlik ve dil
- **Önem:** düşük · **Kategori:** erişilebilirlik / i18n
- **Kanıt:** `page.tsx:157,166,175,185` (`Label` ile `Input` arasında ilişki yok), `page.tsx:90` (yükleme için `aria-live` yok), sayfanın tamamında sabit TR metinler (`messages/en.json` içinde sayfa anahtarı yok), `lib/admin-toast.ts` önekleri "Basarili"/"Dikkat" (Türkçe karakter eksik).
- **Profesyonel öneri:** Her alan için `useId()` ile `id`/`htmlFor` eşlemesi yapılsın. Satır içi doğrulama hataları `aria-describedby` ile bağlansın, `aria-invalid` eklensin. Sayfa metinleri diğer admin sayfalarının kullandığı i18n anahtar yapısına alınsın. Paylaşılan toast önekleri "Başarılı: " olarak düzeltilsin (bu tüm admin sayfalarını etkiler).
- **Efor:** S

### B11 — Upsert ile audit log aynı transaction'da değil
- **Önem:** düşük · **Kategori:** gözlemlenebilirlik
- **Kanıt:** `route.ts:52-79`.
- **Sorun:** Audit yazımı başarısız olursa ayar değişmiş ama izi kalmamış oluyor. İstemci 500 aldığı için "kaydedilmedi" sanıyor, oysa kaydedilmiş durumda.
- **Profesyonel öneri:** `findUnique`, `upsert` ve `auditLog.create` işlemleri `prisma.$transaction` içine alınsın.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Etki önizlemesi (impact preview):** Stripe'ın fiyat değişikliğinde "etkilenen abonelikler" gösterimine benzer şekilde, kaydetmeden önce "Bu değişiklikle 1.240 kullanıcı lig değiştirecek: 830 yükselme, 410 düşme" özeti. Ayrıca her ligin anlık kullanıcı sayısını ve dağılım histogramını göstermeli (PostHog cohort görünümü gibi).
2. **Sürüm geçmişi ve tek tıkla geri alma:** Audit log zaten `oldData`/`newData` tutuyor. Linear'ın "activity" paneli gibi kim, ne zaman, hangi farkla değiştirdi bilgisi gösterilmeli; "bu sürüme dön" aksiyonu olmalı.
3. **Görsel eşik şeridi (range ruler):** 0'dan sonsuza uzanan tek bir yatay eksende 7 segment, sürüklenebilir eşik tutamaçları ve boşluk/çakışma vurgusu. Retool'daki "slider + number input" ikilisi gibi.
4. **Zamanlanmış yayın ve duyuru:** Eşik değişikliğinin ileri bir tarihte (sezon başında) yürürlüğe girmesi ve kullanıcılara bildirim veya push gitmesi (projede push merkezi mevcut).
5. **Lig metriği seçimi:** Kümülatif puan, bakiye veya XP; bkz. B6.
6. **Varsayılana sıfırla ve dışa/içe aktar (JSON):** Ortamlar arası taşıma ve güvenli deneme için.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında tek bakışta şunları görmeli: "Ligler hangi metriğe göre, hangi eşiklerle çalışıyor; bugün kim nerede; değişirsem ne olur?" Düzenleme, sonucunu kaydetmeden önce gösteren, geri alınabilir ve tutarsız bir duruma izin vermeyen bir akışa dönüşmeli.

**Yerleşim (masaüstü):**
1. **Üst şerit (hero yerine kompakt başlık):** Başlık, metrik rozeti ("Kümülatif kazanılmış puan"), son değişiklik ("Furkan · 3 gün önce · Geçmişi gör"). Sağda "Varsayılana sıfırla", "Değişiklikleri at" ve birincil "Önizle ve kaydet" butonları.
2. **Lig şeridi (ana görsel):** Tam genişlikte yatay eksen, 7 renkli segment. Her segmentin altında lig adı ve kullanıcı sayısı yer alır. Eşikler arasındaki tutamaçlar sürüklenebilir ve klavyeyle oklarla ±100, Shift+ok ile ±1000 hareket eder. Segment genişliği ölçeğe göre değil kullanıcı dağılımına göre seçilebilir ("Ölçek: Puan / Kullanıcı").
3. **Lig tablosu:** Satır başına lig rozeti (key'e bağlı mevcut tema ya da avatar), ad, başlangıç eşiği (tek alan), türetilmiş "ile … arası" sütunu (salt okunur), kullanıcı sayısı ve "değişim" sütunu (önizlemede +/−). Max alanı kaldırılır (B3).
4. **Sağ kenar paneli (önizleme):** Kaydetmeden önce yükselme/düşme sayıları, örnek kullanıcılar ve "kullanıcılara bildirim gönder" anahtarı.

**Mobil:** Şerit dikey listeye döner. Her lig satırında yalnızca eşik alanı ve kullanıcı sayısı kalır. Kaydet butonu güvenli alan dolgulu, yapışkan bir alt çubukta durur.

**Motion/3D (ölçülü):** 3D'ye gerek yok; bu bir operasyon ekranı. Global LazyMotion (`m as Motion`) ile yalnızca şunlar yapılmalı: eşik sürüklenirken segment genişliklerinde `layout` animasyonu, önizleme sayılarında kısa bir sayaç geçişi, kayıt sonrası değişen satırlarda 600 ms'lik vurgu. `useReducedMotion` açıkken hepsi anlık geçişe dönmeli. Hero'nun "nefes alan" arka planı bu sayfada gereksiz, kompakt başlık yeterli.

**Veri/API değişiklikleri:**
- `lib/league-rules-core.ts`: Model `{ key, name, minPoints }[]` (sıralı, ilk 0, son sınırsız) olmalı ve `metric` alanı eklenmeli. `getLeagueMetaFromRules` → `findLast`. Eski DB değerini okuyan bir geçiş normalizer'ı da yazılmalı.
- `GET /api/admin/settings/leagues` → `{ rules, metric, updatedAt, distribution: { [key]: count } }`. Dağılım tek bir `GROUP BY CASE` sorgusuyla hesaplanmalı, N+1 olmamalı, Redis'te 5 dk cache'lenmeli.
- `POST /api/admin/settings/leagues/preview` → gövdedeki taslak kurallarla `{ promoted, demoted, perLeague }` döndürmeli (salt okunur SQL).
- `PUT` → sıkı Zod şeması, `updatedAt` ile iyimser kilit, `$transaction`, `revalidateTag('league-rules')` ve Redis anahtarının silinmesi. İsteğe bağlı olarak `effectiveAt` (zamanlanmış) ve `notifyUsers` alanları.
- Herkese açık `GET /api/league-rules` (cache'li) ve `useLeagueRules()` hook'u eklenmeli. `lib/utils.ts` içindeki `DEFAULT_LEAGUE_RULES`'a bağlı yardımcılar kaldırılmalı (B2).
- `GET /api/admin/settings/leagues/history` → `auditLog` içinden `action = 'UPDATE_LEAGUE_RULES'` kayıtları, sayfalı; "bu sürüme dön" aksiyonu PUT'u yeniden kullanmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/gamification-settings`** (XP çarpanı, puan çarpanı, günlük XP tavanı, sezon; `app/api/admin/gamification/settings/route.ts`) ve **`/admin/points-matrix`**, **`/admin/character-thresholds`** aynı alanı farklı açılardan yönetiyor: kullanıcının ilerleme ekonomisi. Lig eşikleri doğrudan bu çarpanlara bağlı. Örneğin puan çarpanı iki katına çıkınca ligler fiilen yarı yarıya kolaylaşıyor, ama operatör ikisini ayrı sayfalarda, birbirinden habersiz değiştiriyor.
- **`/admin/surprise-boxes`** ve `lib/surprise-box-config.ts:19-27` lig key'ine bağlı ödül aralıklarını kodda sabit tutuyor. Bu yapılandırma da mantıken "lig başına ayar" ve bu sayfanın tablosunda bir sütun olabilir.
- **`/admin/segments`** içinde VIP kavramı ve `UserVIPStatus` (`prisma/schema.prisma:1793-1802`) ikinci bir "kademe" sistemi. Kullanıcıya iki farklı statü merdiveni sunulup sunulmadığı ürün kararı olarak netleştirilmeli (doğrulanmadı; yalnızca şema ve menü üzerinden görüldü).
- **Öneri:** Sayfa kaldırılmamalı. Ancak "Oyunlaştırma" başlığı altında sekmeli tek bir ayar merkezine taşınmalı: *Ligler · XP ve Çarpanlar · Puan Matrisi · Karakter Eşikleri · Lig Ödülleri*. Ortak "etki önizlemesi" ve "değişiklik geçmişi" altyapısı bu sekmelerin hepsinde yeniden kullanılmalı. Kısa vadede B1, B2, B3, B4 ve B7 bu sayfada hemen düzeltilmeli (toplam efor yaklaşık M).

---

## Doğrulama (şüpheci inceleme)

> Not: İddialarda `lib/league-rules-core.ts` için verilen satır numaraları (175, 192-217) dosyayla uyuşmuyor; dosya yalnızca 95 satır. Aşağıda gerçek satırlar kullanıldı. İçerik iddiaları satır kaymasından bağımsız olarak kontrol edildi.

### 1. GET hatası sonrası Kaydet canlı lig ayarını varsayılanlarla ya da tek elemanlı listeyle eziyor: **DOĞRULANDI**
- Kanıt: `app/admin/league-settings/page.tsx:16,19` (başlangıç `rules=[]`, `initialSignature=''`), `:38-41` (catch yalnızca toast atıyor, state'e dokunmuyor), `:49` (`'' !== '[]'` olduğu için `isDirty=true`), `:81` (yükleme ekranı yalnızca `loading && rules.length===0` iken; hata sonrası `loading=false` olduğundan ana form çiziliyor), `:105` (`displayRules = defaults`), `:126` (Kaydet etkin), `:51-58` (`[...[]]` üzerine `next[index]=…` seyrek dizi üretir). Sunucu tarafı: `app/api/admin/settings/leagues/route.ts:50` → `lib/league-rules-core.ts:54` (boş dizi → `DEFAULT_LEAGUE_RULES`), `:58` (null atlanır), `:60-61` (key yoksa `DEFAULT_LEAGUE_RULES[i].key`), `:77` (eşleşme yoksa `list[0]`).
- Yeniden üretim: (a) GET geçici bir DB/Neon hatasıyla 500 döner, ekranda varsayılan değerler ve "Değiştirildi" rozeti görünür; admin "Kaydet"e basar, `{rules: []}` gider ve DB'deki özel kurallar `DEFAULT_LEAGUE_RULES` ile ezilir. (b) Aynı durumda admin 2. karttaki (KOR) ismi düzenler: istek `{"rules":[null,{"name":"Korx"}]}` olur, `normalize` yalnızca `[{key:'KOR', 3000-5000}]` kaydeder. `/api/leaderboard` artık her kullanıcıya KOR döndürür (eşleşmeyenler `list[0]`=KOR). Ek olarak bu durumda input'lar `defaults`'tan okunduğu için admin yazdığını ekranda bile göremez.
- Sınır: Oturum düşmüşse (401) PUT de 401 alır, yani gerçekçi tetik geçici 5xx veya ağ hatasıdır. Admin eylemi gerekir ama ekran onu yanıltıcı biçimde buna yönlendiriyor. Ayrıca `audit_log` eski değeri tuttuğu için geri dönüş mümkün, ancak bunun için UI yok.

### 2. 100000 puan üstü ve eşik boşluğundaki kullanıcılar Başlangıç ligine düşüyor: **DOĞRULANDI**
- Kanıt: `lib/league-rules-core.ts:77` (`find(p>=min && p<=max) ?? list[0]`), `:36` (varsayılan ZENOR `maxPoints: 100000`), `:71` (min'e göre sıralı, `list[0]` = en düşük lig). Kullanım: `app/api/leaderboard/route.ts:108,195,256,327,382`; istemci tarafında `lib/utils.ts:143,147` aynı fonksiyonu varsayılanlarla çağırıyor.
- Yeniden üretim: `points = 100001` olan bir kullanıcı, varsayılan kurallarla bile leaderboard'da ve müşteri dashboard'unda "Başlangıç" görünür; `getNextLeagueMetaFromRules` ona "Kor"u bir sonraki lig olarak gösterir (`:84-85`). Admin ZENOR max'ını örneğin 60000'e indirirse 60001+ puanlı bütün kullanıcılar aynı anda Başlangıç'a düşer. Admin iki lig arasında boşluk bırakırsa da (örneğin KOR max 5000, VEYRA min 7500) 5001-7499 aralığındakiler Başlangıç'a düşer. Sayfanın kendi yedek listesi (`page.tsx:27-35`) zaten böyle boşluklar içeriyor.
- Sınır: Canlıda 100000 puanı aşan kullanıcı olup olmadığı DB'ye dokunulmadığı için doğrulanmadı. Kod davranışı ise kesin.

### 3. PUT şeması `z.unknown()`; geçersiz lig yapılandırması doğrulanmadan kaydediliyor: **DOĞRULANDI** (güvenlik değil, veri bütünlüğü)
- Kanıt: `lib/validations-admin.ts:96-98` (`rules: z.unknown()`), `lib/league-rules-core.ts:53-72` (normalize yalnızca tip ve negatif kırpması yapıyor; tekrarlanan key, eleman sayısı, `min>max`, çakışma veya boşluk, uzunluk kontrolü yok). İstemci de kontrol etmiyor (`page.tsx:51-58`).
- Yeniden üretim (yalnızca UI ile): Admin KOR için min=5000, max=500 girip kaydeder. İstek 200 döner, KOR ulaşılamaz olur ve 3000-5000 arasındaki kullanıcılar `list[0]` = Başlangıç'a düşer. API'ye doğrudan istekle tekrarlanan key gönderilirse (`[{key:'KOR',…},{key:'KOR',…}]`), `getNextLeagueMetaFromRules` `findIndex` ile ilk KOR'u bulduğu için (`:83`) ikinci KOR'daki kullanıcıya "sonraki lig" yanlış hesaplanır.
- Sınır: Yalnızca ADMIN rolü (`route.ts:39`, `requireAuth(['ADMIN'])`) ve admin gizli kapısı arkasında. Saldırgan senaryosu yok; risk, operatör hatasının sessizce kalıcı hale gelmesi. Sınırsız `name`/`gradient` uzunluğu düşük önemde. Safelist dışındaki Tailwind sınıfı ise yalnızca kozmetik bir sorun.

### 4. Admin lig ayarı müşteri panelinde uygulanmıyor (sessiz veri tutarsızlığı): **DOĞRULANDI** (yalnızca admin varsayılandan saptığında)
- Kanıt: `lib/utils.ts:142-164` (`getLeague*` yardımcılarının hepsi sabit `DEFAULT_LEAGUE_RULES` ile çalışıyor), `components/customer/dashboard/customer-dashboard.tsx:419-422` (lig, ilerleme ve sonraki lig) ve `:1326` ("Tüm ligler" listesi `DEFAULT_LEAGUE_RULES.map`), `app/customer/rewards/page.tsx:241`, `app/customer/leaderboard/page.tsx:99` (başlıktaki kendi ligin). Buna karşılık leaderboard satırları `app/api/leaderboard/route.ts:79` üzerinden DB kurallarını (`getLeagueRules`) kullanıyor.
- Yeniden üretim: Admin VEYRA min değerini 8000 yapıp kaydeder. 6000 puanlı bir kullanıcı leaderboard satırında "Kor", aynı sayfanın başlığında ve dashboard'da "Veyra" görür; dashboard'daki "Tüm ligler" eşikleri de eski değerleri gösterir. Sayfanın kendi açıklaması (`page.tsx:111`, "müşteri paneli bu ayarları kullanır") bu yüzden yanlış.
- Sınır: Ayar hiç değiştirilmediyse (DB'de kayıt yok veya kayıt varsayılanlara eşit) tutarsızlık oluşmaz. Hata, ilk özelleştirmede ortaya çıkar.
