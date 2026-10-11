# /admin/settings

**Amaç:** Platform operatörünün "tek yerden ayar" ekranı olarak tasarlanmış: kendi profili/şifresi, site kimliği, görünüm (landing arka plan efekti), kimlik doğrulama anahtarları, e-posta teşhis/gönderim, AI ve oyunlaştırma parametreleri, modül aç/kapa, rol bazlı menü/özellik görünürlüğü, ayar geçmişi/geri alma ve demo veri üretme/silme araçları.

**Genel puan: 3/10** · **Karar: yeniden inşa et** (ayar merkezi olarak yeniden kur; demo araçlarını ve diğer sayfaların kopyalarını buradan çıkar)

> Özet: Sayfadaki 21 "site ayarı" alanından yalnızca **2'si** (`backgroundEffect`, `enableMagicLink`) gerçekten bir yerde okunuyor; geri kalan 19 alan veritabanına yazılıyor ama hiçbir kod okumuyor. "Bakım Modu", "Yeni Kayıtlar" ve "Google ile Giriş" anahtarları operatöre güven veriyor ama hiçbir şeyi değiştirmiyor. "Bu sürüme dön" butonu, kayıt biçimi uymayan audit girdilerinde **yanlış ayar satırları üretiyor**. "Demo" butonları canlı Neon üzerinde **gerçek bayi/müşteri verisini değiştiriyor ve siliyor**. Ayrıca sayfanın ana veri ucu, admin gizli kapısının cevabını gate cookie'si olmayan bir ADMIN oturumuna döndürüyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | 21 ayar alanının 19'u ölü; rollback ve demo-sil akışları veri bozuyor; çalışan kısımlar (modül/görünürlük, arka plan, mail testi) azınlıkta. |
| UX | 3/10 | 8 sekmenin üstünde sayfayla ilgisiz 3 kart (demo/geçmiş) duruyor; tek "Kaydet" bütün sekmeleri birden yazıyor; kaydedilmemiş değişiklik göstergesi, kirli durum uyarısı ve diff yok. |
| Görsel | 5/10 | shadcn kartları düzgün, ama efekt grid'inde 4 farklı gradient/emoji dili (PREMIUM, LEGENDARY, `animate-pulse`) admin aracına göre fazla gösterişli; önizleme yok. |
| Mimari | 2/10 | 2073 satırlık tek istemci bileşeni, ~45 `useState`, şemasız toplu yazma ucu (her anahtar, her değer), sürüm/eşzamanlılık kontrolü yok, aynı katalog için iki ayrı anahtar (modül + özellik görünürlüğü). |
| Performans | 6/10 | `next/dynamic` + `ssr:false` ile ayrı chunk; açılışta 5 paralel istek makul; Radix Tabs pasif sekmeleri DOM'dan çıkardığı için yeniden çizim sınırlı. Çift skeleton var. |
| Erişilebilirlik + mobil | 4/10 | Profil/Genel/Görünüm/AI/Oyun formlarındaki `Label`'ların `htmlFor`'u yok, Switch'lerin `aria-label`'ı yok, avatar düğmesi yalnızca hover'da görünüyor ve etiketsiz; mobilde 8 sekme 4 satıra ve 10px yazıya iniyor. |

---

## Özellik envanteri

Durumlar: ÇALIŞIYOR / KISMİ / BOZUK / SAHTE / EKSİK. Yollar depo köküne göredir; `SC` = `app/admin/settings/settings-client.tsx`.

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Dinamik yükleme + chunk skeleton | ÇALIŞIYOR | `app/admin/settings/page.tsx:7-20` | `ssr:false`; sonra ikinci bir skeleton daha geliyor (#2). |
| 2 | İç yükleme skeleton'u | KISMİ | `SC:809-823` | Yalnızca `/api/admin/settings` isteğini bekliyor; demo/modül/görünürlük sayaçları önce `0` ya da boş görünüyor. |
| 3 | Ayarlar yüklenemezse hata durumu | BOZUK | `SC:346-366` | `res.ok` kontrol edilmiyor, hata yalnızca `console.error`'a gidiyor; sabit varsayılanlar gösteriliyor ve sonraki "Kaydet" bu varsayılanları canlı DB'ye yazıyor (bkz. B6). |
| 4 | Sayfa başlığı (`PageHeader`) | ÇALIŞIYOR | `SC:827` | |
| 5 | Sekme ↔ `?tab=` URL senkronu | ÇALIŞIYOR | `SC:280-299` | Başka sayfalardan `?tab=auth` derin bağlantısı var. |
| 6 | API yetkisi (ADMIN rolü) | KISMİ | `lib/api-auth.ts:52`, `proxy.ts:79` | Rol kontrol ediliyor ama gizli kapı cookie'si `/api/admin/*` için aranmıyor (bkz. B1). |
| 7 | "3 Demo Kafe Ekle" | KISMİ | `SC:837`, `lib/demo-cafes-seed.ts:102-150,205` | Çalışıyor ama canlıda bilinen şifreli (`Demo123!`) DEALER/CUSTOMER hesapları, herkese açık sahte geri bildirimler ve defter kaydı olmadan puan bakiyesi oluşturuyor; silme karşılığı yok. |
| 8 | "Sektör verisi üret" | BOZUK | `app/api/admin/bootstrap/route.ts:237-266` | Kategorisi boş **gerçek** bayilere `demo-*` kategorisi yazıyor. |
| 9 | "Şüpheli aktivite üret" | BOZUK | `bootstrap/route.ts:281-348` | Gerçek müşterilere sahte SuspiciousActivity açıyor, `fraudStatus:'flagged'` yapıyor (önceki durumu, `shadow_ban` dahil, eziliyor). |
| 10 | "AI kalite örneği üret" | KISMİ | `bootstrap/route.ts:385-430` | Gerçek geri bildirimlerden `pending` örnek açıyor; `[bootstrap-demo]` işaretiyle geri alınabiliyor. |
| 11 | "A/B cohort ata" | KISMİ | `bootstrap/route.ts:184-208` | Bu bir demo işlemi değil, tüm gerçek bayilere kalıcı cohort atıyor; geri alma yok; döngüde tek tek update (N+1). |
| 12 | "Demo sektör verisini sil" | BOZUK | `bootstrap/route.ts:268-279` | `businessCategory` alanı dolu olan **tüm** bayilerinkini `null` yapıyor; gerçek kategorileri siliyor (bkz. B2). |
| 13 | "Demo şüpheli aktiviteleri sil" | BOZUK | `bootstrap/route.ts:350-383` | İzlenen kullanıcıları `clean` / `0` yapıyor; seed'den önce zaten `flagged`/`shadow_ban` olan bir müşterinin cezası da kalkıyor. |
| 14 | "Demo AI örneklerini sil" | ÇALIŞIYOR | `bootstrap/route.ts:432-446` | İşaret ve tracker'a göre siliyor. |
| 15 | Yıkıcı butonlar için onay | EKSİK | `SC:842-844,872-880` | Tek tık, onay yok, geri alma yok, audit log yok. |
| 16 | Demo sayaçları (4 kutu) | KISMİ | `SC:882-899`, `bootstrap/summary/route.ts:13-30` | Sayılar doğru, ama "Insights demo kategori" sayacı #8 yüzünden kirletilmiş gerçek bayileri sayıyor; demo kafeler sayılmıyor. |
| 17 | "Demo özetini yenile" | ÇALIŞIYOR | `SC:860-863` | |
| 18 | "Toplu demo üret" | BOZUK | `SC:622-658` | 3 işlem `Promise.all` ile paralel gidiyor; her biri tracker'ı oku → yaz yapıyor, son yazan diğerlerinin ID'lerini siliyor (bkz. B5). |
| 19 | "Toplu demo sil" | BOZUK | `SC:875-879` | #12'yi de çalıştırıyor, yani bütün bayi kategorilerini siliyor. |
| 20 | Demo kafeleri kaldırma / ortam koruması | EKSİK | `bootstrap/route.ts:102-126` | `NODE_ENV`/`VERCEL_ENV` kontrolü, rate limit, `admin_bootstrap` modül kapısı yok. |
| 21 | "Geçmişi getir" | KISMİ | `SC:660-672,914-917` | Elle yükleniyor; yüklemeden önce "Henüz geçmiş kaydı yok" yazıyor, bu yanıltıcı. |
| 22 | Geçmiş listesi | KISMİ | `SC:918-949`, `settings/audit/route.ts:14-27` | Ham `action` gösteriliyor (`batch_update`, `update_modules`), diff yok, sayfalama yok (son 50). `entity:'Settings'` (büyük S) ile yazılan puan matrisi ve gizli kapı kayıtları listede çıkmıyor. |
| 23 | "Bu sürüme dön" | BOZUK | `settings/rollback/route.ts:71-103` | `oldData`'yı her zaman `{anahtar: değer}` haritası sayıyor; modül/SEO/rozet/agent kayıtlarında yanlış satırlar oluşturuyor; önbellek temizlenmiyor (bkz. B3). |
| 24 | Geri alma onayı | KISMİ | `SC:788` | `window.confirm` var ama hangi anahtarların değişeceğini göstermiyor. |
| 25 | Avatar gösterimi | ÇALIŞIYOR | `SC:1005-1010` | |
| 26 | Avatar üzerindeki kamera düğmesi | KISMİ | `SC:1013-1015` | Yalnızca hover'da görünüyor, `aria-label` yok, klavye odağında görünmüyor. |
| 27 | Avatar dialog'unda kategori sekmeleri | ÇALIŞIYOR | `SC:1025-1036` | |
| 28 | Avatar seçimi | ÇALIŞIYOR | `SC:1040-1063,368-372` | Tüm görsellerin `alt` değeri "Avatar". Toast'ta ASCII Türkçe var ("secildi", "Kaydetmeyi unutmayin"). |
| 29 | "Avatar Değiştir" butonu | ÇALIŞIYOR | `SC:1073-1081` | |
| 30 | Ad Soyad + "Profili Kaydet" | ÇALIŞIYOR | `SC:1094-1109,374-397` | `saving` state'i şifre ve site kaydıyla ortak, tüm butonlar birlikte kilitleniyor. Oturumda görsel yoksa varsayılan avatar kalıcı olarak yazılıyor (`SC:306`). |
| 31 | E-posta (salt okunur) | ÇALIŞIYOR | `SC:1101-1104` | |
| 32 | Rol etiketi "Admin" | ÇALIŞIYOR | `SC:1072` | Sabit metin. |
| 33 | Şifre değiştirme | KISMİ | `SC:399-431`, `app/api/user/password/route.ts:22-80` | Rate limit ve audit var. Güç göstergesi yok, diğer oturumlar kapatılmıyor, OAuth ile giren adminde "şifre ayarlı değil" hatası veriyor. |
| 34 | Site Adı | SAHTE | `SC:1169-1173` | `siteName` anahtarını okuyan kod yok; gerçek değer `seo.global.siteName` içinde (`lib/seo-settings.ts:17-21`, `/admin/seo`). |
| 35 | Site URL | SAHTE | `SC:1175-1181` | Aynı durum: gerçek değer `seo.global.siteUrl` / `lib/site-config`. |
| 36 | Site Açıklaması | SAHTE | `SC:1183-1189` | Okuyan yok. |
| 37 | Bakım Modu | SAHTE | `SC:1190-1199` | `maintenanceMode` için depoda hiç okuyucu yok (`grep` sonucu boş); `proxy.ts` bakım modunu kontrol etmiyor. |
| 38 | Genel "Kaydet" (toplu) | KISMİ | `SC:550-577` | 21 anahtarın hepsini, UI'da alanı bile olmayan `emailFrom`/`smtpHost`/`smtpPort` dahil, `category:'general'` ile yazıyor. Diğer sekmelerdeki kaydedilmemiş değişiklikleri de kaydediyor. |
| 39 | Logo URL | SAHTE | `SC:1224-1229` | `logoUrl` ayar anahtarını okuyan yok (`lib/email.ts:17` başka bir kaynaktan üretiyor). |
| 40 | Favicon URL | SAHTE | `SC:1230-1236` | Okuyan yok. |
| 41 | Ana Renk (renk seçici + metin) | SAHTE | `SC:1238-1254` | Okuyan yok; hex doğrulaması yok. Gerçek tema `/admin/themes` → `customColors`. |
| 42 | Varsayılan Tema | SAHTE | `SC:1255-1270` | `components/providers.tsx:225` sabit olarak `defaultTheme="system"` kullanıyor; gerçek ayar `defaultMode` (`lib/theme-settings-keys.ts:14`). |
| 43 | Arka plan efekti seçimi (28 seçenek, 4 grup) | ÇALIŞIYOR | `SC:584-604,1290-1446`, `lib/get-background-effect.ts:13-25` | Anında kaydediliyor, `revalidateTag('settings')` ile landing'e yansıyor. |
| 44 | Efekt kaydı başarısız olunca geri alma | KISMİ | `SC:585,598-603` | Optimistic güncelleme yapılıyor, hata olunca eski değere dönülmüyor ve UI yanlış seçimi gösteriyor. |
| 45 | Efekt önizlemesi | EKSİK | `SC:1311-1314` | Yalnızca ad ve açıklama var; 28 efekt görülmeden seçiliyor. |
| 46 | "Seçili" bilgi kutusu | ÇALIŞIYOR | `SC:1448-1453` | Dönemsel konsept override'ını (`components/seasonal/seasonal-concept-applier.tsx:56`) göstermiyor. |
| 47 | Yeni Kayıtlar | SAHTE | `SC:1477-1480` | `enableRegistration` okuyucusu yok; `app/api/auth/register` ayarı kontrol etmiyor. |
| 48 | Google ile Giriş | SAHTE | `SC:1487-1490` | `lib/auth.ts:42` GoogleProvider'ı koşulsuz ekliyor. |
| 49 | Magic Link | ÇALIŞIYOR | `SC:1497-1500`, `app/api/auth/magic-link/route.ts:36` | Çalışan tek kimlik anahtarı. |
| 50 | Sunucu (.env) mail özeti | ÇALIŞIYOR | `SC:327-344,1522-1535` | `/api/admin/system-status` her açılışta bir de `SELECT 1` çalıştırıyor; burada gereksiz. |
| 51 | .env değişken dokümantasyonu | ÇALIŞIYOR | `SC:1536-1561` | Statik. |
| 52 | Test e-postası | ÇALIŞIYOR | `SC:433-488,1562-1609` | Kanal ve gönderen özeti iyi. |
| 53 | Özel e-posta (logo şablonu) | KISMİ | `SC:490-548,1611-1705`, `app/api/admin/compose-mail/route.ts` | Gönderiyor ama audit kaydı, rate limit ve gönderilenler kaydı yok; `/admin/inbox` ile çakışıyor. |
| 54 | Gönderim sonuç uyarıları | ÇALIŞIYOR | `SC:1580-1608,1677-1704` | |
| 55 | AI Özellikleri anahtarı | SAHTE | `SC:1723-1732` | `aiEnabled` okuyucusu yok. |
| 56 | OpenAI API anahtarı | SAHTE | `SC:1734-1742` | Hiç kullanılmıyor (`lib/ai-engine.ts:56` yalnızca `process.env`), ama girilen anahtar düz metin olarak DB'ye **ve** audit log'a yazılıyor (bkz. B4). |
| 57 | Model seçimi | SAHTE | `SC:1744-1758` | Okuyan yok; seçenekler (`gpt-4-turbo-preview`, `gpt-3.5-turbo`) eskimiş, sistem Groq/OpenAI'yi env üzerinden seçiyor (`lib/ai-engine.ts:46-75`). |
| 58 | Geri Bildirim Puanı | SAHTE | `SC:1783-1790` | Okuyan yok; gerçek kaynak `points_matrix` (`lib/points-rules.ts:3`, `/admin/points-matrix`). |
| 59 | Referans Puanı | SAHTE | `SC:1792-1799` | Okuyan yok. |
| 60 | Seviye Atlama Eşiği | SAHTE | `SC:1801-1808` | Okuyan yok; `parseInt` ile negatif değer girilebiliyor. |
| 61 | Modül arama | ÇALIŞIYOR | `SC:779-784,1830-1838` | |
| 62 | Kapsam filtresi | ÇALIŞIYOR | `SC:1840-1851` | |
| 63 | Modül "Yenile" | KISMİ | `SC:1852-1854` | Kaydedilmemiş değişiklikleri sorgusuz siliyor. |
| 64 | Modül "Kaydet" | ÇALIŞIYOR | `SC:689-705`, `settings/modules/route.ts:149-191` | Gate cache'ini temizliyor. Audit'te IP/UA meta'sı yok, rate limit yok. |
| 65 | Kapsam bazlı toplu aç/kapa (6 buton) | KISMİ | `SC:1861-1868` | Asimetrik: admin/platform için "aç" var, "kapat" yok. Kritik modüller için uyarı yok. |
| 66 | Modül kartında switch | ÇALIŞIYOR | `SC:1897-1902` | Severity ve scope ham İngilizce gösteriliyor (`critical`, `customer`). |
| 67 | "Detay sayfasına git" bağlantısı | KISMİ | `SC:1888-1895`, `lib/module-controls.ts:47` | `ai_features` dealer kapsamında ama `/admin/ai-dashboard`'a gidiyor; landing modülleri `/`'a gidiyor. |
| 68 | Filtre boş durumu | ÇALIŞIYOR | `SC:1870-1873` | |
| 69 | `admin_bootstrap` modül anahtarı | SAHTE | `lib/module-controls.ts:66` | Bootstrap ucu `assertModuleEnabled` çağırmıyor; anahtar hiçbir şeyi kapatmıyor. |
| 70 | Kaydedilmemiş değişiklik göstergesi / uyarısı | EKSİK | `SC:192-207` | Modül, görünürlük ve site formlarında dirty-state takibi yok; sekme değişince ya da sayfadan çıkınca uyarı gelmiyor. |
| 71 | Görünürlük: rol seçimi (Bayi/Müşteri) | ÇALIŞIYOR | `SC:1928-1946` | |
| 72 | Görünürlük "Yenile" | KISMİ | `SC:1947-1949` | Kaydedilmemiş değişiklikleri siliyor. |
| 73 | Görünürlük "Kaydet" | ÇALIŞIYOR | `SC:723-747`, `settings/visibility/route.ts:119-242` | Anahtar beyaz listesi, transaction, audit ve cache temizliği var; iyi örnek. |
| 74 | Toplu özellik/menü aç/kapa | ÇALIŞIYOR | `SC:1956-1976` | |
| 75 | Özellik görünürlüğü listesi | KISMİ | `SC:1978-2004` | Modüller sekmesindeki aynı `MODULE_CATALOG` anahtarlarını ikinci bir katmanla kontrol ediyor (bkz. B9). |
| 76 | Menü/sayfa görünürlüğü listesi | ÇALIŞIYOR | `SC:2006-2030`, `lib/module-gate.ts:132-164` | |
| 77 | Sistem (admin/platform) özellik görünürlüğü | KISMİ | `SC:2033-2065` | Modüller sekmesindeki admin/platform anahtarlarıyla birebir aynı (`settings/visibility/route.ts:48-50`); ikisi AND ile birleşiyor (`lib/module-gate.ts:100-103`). |
| 78 | "Responsive görünüm" etiketi | SAHTE | `SC:1926` | İşlevi olmayan, kullanıcıya bir şey söylemeyen metin. |
| 79 | Görünürlük kaydından sonra geçmişi yenileme | ÇALIŞIYOR | `SC:741` | |
| 80 | Eşzamanlılık / sürüm kontrolü | EKSİK | `prisma/schema.prisma:899-907` | `Settings` tablosunda `version`/`updatedBy` alanı yok; iki sekme ya da iki admin birbirinin değişikliğini sessizce eziyor. |

**Sayım:** ÇALIŞIYOR 29 · KISMİ 20 · BOZUK 8 · SAHTE 18 · EKSİK 5 (toplam 80)

---

## Bulgular (önem sırasıyla)

### B1: Kritik / Güvenlik: Sayfanın veri ucu gizli kapı cevabını sızdırıyor; `/api/admin/*` gate'i tamamen atlıyor
- **Kanıt:** `proxy.ts:79` gate kontrolü yalnızca `pathname.startsWith('/admin')` olduğunda çalışıyor, `/api/admin/...` ise `/api` ile başlıyor. `lib/api-auth.ts:52` (`requireAuth`) gate cookie'sine bakmıyor. `app/api/admin/settings/route.ts:61-66` filtresiz olarak `take: 5000` satır döndürüyor ve buna `admin_gate` anahtarı da dahil (`lib/admin-gate.ts:13`). Ayrıca `app/api/admin/settings/admin-gate/route.ts:19-27` cevabı doğrudan veriyor.
- **Sorun:** Gizli kapının tehdit modeli "rolü yanlışlıkla ADMIN yapılan stajyer"di (`proxy.ts:76-78`). Böyle bir hesap gate ekranını hiç geçmeden `GET /api/admin/settings` ile cevabı okuyabilir, `POST /api/admin/settings` ile `admin_gate` dahil herhangi bir anahtarı değiştirebilir ve tüm admin API'lerini doğrudan çağırabilir.
- **Öneri:** Gate doğrulamasını `requireAuth(['ADMIN'])` içine taşı (HMAC cookie ve `gateCookieBelongsTo`); edge'de `/api/admin/:path*` için de aynı kontrolü yap. `GET /api/admin/settings` bir **izin listesiyle** dönmeli: gizli anahtarlar (`admin_gate`, tracker'lar, API anahtarları) hiçbir zaman toplu listede yer almamalı. Gizli değerler için ayrı, maskeli bir "secret" katmanı kur.
- **Efor:** M

### B2: Kritik / Veri bütünlüğü: "Demo sektör verisini sil" ve "Toplu demo sil" canlıdaki tüm bayi kategorilerini siliyor
- **Kanıt:** `app/api/admin/bootstrap/route.ts:268-279`: `updateMany({ where: { role:'DEALER', businessCategory: { not: null } }, data: { businessCategory: null } })`. Tracker'daki `insightsDealerIds` filtreye hiç girmiyor. Butonlar: `SC:842`, `SC:875`.
- **Sorun:** `.env` canlı Neon'u gösteriyor. Tek tıkla, onaysız olarak bütün gerçek bayilerin işletme kategorisi siliniyor; segment, benchmark ve insights bundan etkileniyor. Bunun tersi de var: "Sektör verisi üret" (`:237-266`) kategorisi boş gerçek bayilere `demo-cafe` gibi değerler yazıyor.
- **Öneri:** Demo verisi gerçek kayıtlara asla yazılmamalı. Demo üretimi yalnızca kendi oluşturduğu `demo-*` id'li kayıtlarla çalışmalı ve silme sadece `id IN tracker` üzerinden yapılmalı. Canlı ortamda (`VERCEL_ENV==='production'`) bootstrap ucu varsayılan olarak 403 dönmeli, açıkça açılan bir "sandbox org" bayrağı istemeli. Her çalıştırma audit log'a düşmeli.
- **Efor:** M

### B3: Kritik / Veri bütünlüğü: "Bu sürüme dön" yanlış biçimli audit kayıtlarında çöp ayar satırları oluşturuyor
- **Kanıt:** `app/api/admin/settings/rollback/route.ts:71-103` her `oldData`'yı `{settingKey: value}` haritası varsayıyor. Ama aynı listede (`settings/audit/route.ts:14-17`, `entity:'settings'`) farklı biçimde kayıtlar var:
  - `update_modules`: `oldData` = `{donations:true, referrals:false, …}` (`settings/modules/route.ts:180`). Rollback, `moduleControls`'u geri yüklemek yerine `donations`, `referrals`… adında boolean değerli **yeni Settings satırları** açıyor.
  - SEO: `oldData` = `{global, pageOverrides}` (`app/api/admin/seo/route.ts:176-179`). Rollback `global` ve `pageOverrides` adında satırlar oluşturuyor, `seo` geri gelmiyor.
  - `BADGE_ALGO_UPDATE` (`badges/algorithm/route.ts:92-95`) ve tek anahtarlı `PUT` (`settings/route.ts:169-179`, örneğin `agent_council_profiles` → `{weights}`) da aynı şekilde bozuluyor.
  - `create_*` kayıtlarında `oldData` = `{key: null}`; bu durumda `upsert value:null` hata verebilir (doğrulanmadı).
- **Ek sorun:** Rollback `revalidateTag` çağırmıyor. Module-gate ve arka plan önbelleği 60 saniye boyunca eski kalıyor. Etiketteki "Bu sürüme dön" ifadesi de yanlış: işlem aslında "bu değişikliği geri al" (önceki değeri yükle).
- **Öneri:** Audit şemasını standartlaştır: `{ settingKey, before, after }` biçiminde, her ayar için ayrı satır (`entityId = settings.id`). Rollback yalnızca `entityId` ile eşleşen tek anahtarı geri yüklemeli; uyumsuz kayıtlarda buton hiç gösterilmemeli. Geri almadan önce diff önizlemesi (önce/sonra) olmalı, ardından ilgili cache tag'leri temizlenmeli.
- **Efor:** M

### B4: Yüksek / Güvenlik: OpenAI API anahtarı düz metin olarak DB'ye ve her kayıtta audit log'a yazılıyor, sonra tarayıcıya geri dönüyor
- **Kanıt:** Alan `SC:1735-1741`. `handleSave` her seferinde bütün `settings` nesnesini yolluyor (`SC:555-559`). Batch ucu `newData`'yı ham olarak audit'e yazıyor (`settings/route.ts:263-278`). Ardından `GET /api/admin/settings` ve `GET /api/admin/settings/audit` (`audit/route.ts:22-23`) bu değeri istemciye gönderiyor. Anahtar hiçbir yerde kullanılmıyor (`lib/ai-engine.ts:56` yalnızca env okuyor).
- **Sorun:** İşe yaramayan bir alan, gerçek bir sırrın kalıcı ve çoğaltılmış bir sızıntı yüzeyine dönüşüyor: her "Kaydet" yeni bir audit kopyası bırakıyor.
- **Öneri:** Alanı kaldır. İleride sağlayıcı anahtarı DB'den yönetilecekse şifreli saklansın (KMS/AES-GCM), yalnızca son 4 karakteri gösterilsin, yalnızca yazılabilir olsun ve audit'e `"[redacted]"` düşülsün. Mevcut `Settings.openaiApiKey` satırını ve audit içeriğini temizleyen bir migration notu ekle (canlı DB'ye dokunmadan önce onay alınmalı).
- **Efor:** S

### B5: Yüksek / Veri bütünlüğü: "Toplu demo üret" tracker'da yarış koşulu yaratıyor; şüpheli aktivite seed'i gerçek kullanıcıların fraud durumunu eziyor
- **Kanıt:** `SC:629-642` 3 işlemi `Promise.all` ile paralel çalıştırıyor. Her işlem `getTracker()` ile okuyup `saveTracker({...tracker, ...})` ile yazıyor (`bootstrap/route.ts:238,262; 282,342; 386,421`), dolayısıyla son yazan diğerlerinin ID listesini siliyor. `seed_suspicious_activities` `:313-318` arasında önceki durumu kaydetmeden `fraudStatus:'flagged'` yazıyor. `clear` adımı (`:366-375`) da bu kullanıcıları `clean` / `0` yapıyor.
- **Sorun:** Gerçekten `shadow_ban` durumundaki bir müşteri, seed → clear döngüsünden sonra temize çıkıyor. Bu, puan ekonomisinin fraud koruması invariant'ını deliyor. Tracker kaybı yüzünden ID tabanlı silme de güvenilmez hale geliyor.
- **Öneri:** Tracker güncellemesini atomik yap (`jsonb` alan bazlı update ya da ayrı `DemoArtifact(kind, refId)` tablosu). Toplu işlemleri sunucuda tek bir transaction'lı uç olarak çalıştır. Demo fraud kayıtları yalnızca demo kullanıcılarına bağlansın; gerçek kullanıcının `fraudStatus` değerine asla dokunulmasın.
- **Efor:** M

### B6: Yüksek / Veri bütünlüğü: Ayarlar yüklenemezse varsayılanlar canlı veriyi ezer; tek "Kaydet" bütün sekmeleri yazar
- **Kanıt:** `SC:349-360`: `res.ok` kontrolü yok. 500, 401 ya da 429 geldiğinde `data.entries` olmuyor ve state sabit varsayılanlarda kalıyor (`SC:256-278`). Kullanıcı herhangi bir sekmede "Kaydet"e basınca `SC:555` bütün 21 anahtarı yazıyor; buna canlı olan `enableMagicLink:false` da dahil. Ayrıca bir sekmede başlanıp kaydedilmemiş değişiklikler, başka sekmedeki "Kaydet" ile istemeden kaydediliyor.
- **Öneri:** Yükleme hatasında formu kilitle ve "Yeniden dene" durumu göster. Kayıtta yalnızca **değişen** anahtarları gönder (dirty-diff) ve her sekmeye kendi kaydetme kapsamını ver. Sunucuda `If-Match`/`version` ile iyimser kilit uygula (B10).
- **Efor:** M

### B7: Yüksek / İşlevsellik (SAHTE): Bakım Modu, Yeni Kayıtlar ve Google ile Giriş anahtarları hiçbir şey yapmıyor
- **Kanıt:** `maintenanceMode`, `enableRegistration`, `enableGoogleAuth` için `app/`, `lib/`, `components/` ve `proxy.ts` altında hiç okuyucu yok. `lib/auth.ts:42` Google'ı koşulsuz ekliyor; `app/api/auth/register/route.ts` ayar okumuyor.
- **Sorun:** Bunlar olay anında kullanılan kontroller (spam kaydı dalgası, OAuth sorunu, bakım). Operatör anahtarı kapatıp sistemi korunuyor sanıyor; oysa hiçbir şey değişmiyor. Bu, en tehlikeli türden "sahte" özellik.
- **Öneri:** Ya gerçekten bağla ya da kaldır. Bağlanacaksa: (1) `lib/platform-flags.ts`'te `unstable_cache` + tag'li tek okuyucu, (2) `proxy.ts`'te bakım modu için 503 sayfası ve ADMIN muafiyeti, (3) register ucunda ve signup UI'da `enableRegistration` kontrolü, (4) `authOptions.providers` için çalışma anında koşul ya da `signIn` callback'inde Google reddi, (5) `/api/public/auth-features` üzerinden UI'ın butonları gizlemesi. Her anahtarın yanında "etki alanı" açıklaması ve son değiştiren kişi gösterilmeli.
- **Efor:** M

### B8: Yüksek / Mimari (SAHTE): Site, görünüm, AI ve oyunlaştırma sekmelerindeki 16 alan ölü; gerçek ayarlar başka sayfalarda
- **Kanıt:**
  - `siteName`/`siteUrl`/`siteDescription` → gerçek kaynak `seo.global` (`lib/seo-settings.ts:17-21`, `/admin/seo`).
  - `primaryColor`/`defaultTheme` → gerçek kaynak `customColors`/`defaultMode` (`lib/theme-settings-keys.ts:11-15`, `/admin/themes`), ayrıca `components/providers.tsx:225` sabit `system` kullanıyor.
  - `pointsPerFeedback`/`pointsPerReferral`/`levelUpThreshold` → gerçek kaynak `points_matrix` (`/admin/points-matrix`).
  - `aiEnabled`/`openaiModel` → env ve bayi başına `AISettings` (`/admin/ai-settings`).
  - `logoUrl`/`faviconUrl`/`emailFrom`/`smtpHost`/`smtpPort` → okuyucu yok (son üçünün UI'da alanı bile yok ama her kayıtta yazılıyor).
- **Sorun:** Operatör iki farklı yerde aynı adla iki farklı değer görüyor ve yanlış yeri değiştiriyor. Puan alanları, puan ekonomisini yönettiği izlenimi veriyor.
- **Öneri:** Bu alanları sil. Yerlerine ilgili sahibi sayfaya giden **salt okunur özet kartları** koy ("Site adı: QRateX · SEO Motoru'nda düzenle →"). Bunu tek bir `settings-registry.ts` ile yap: her anahtar için `{key, owner page, schema, reader}` tanımı. Okuyucusu olmayan anahtar CI'da test ile yakalanabilir.
- **Efor:** M

### B9: Orta / Mimari + UX: Aynı modül anahtarı iki yerde, iki ayrı ayarla kontrol ediliyor
- **Kanıt:** Modüller sekmesi `moduleControls` (`settings/modules/route.ts:162-172`); Sayfa Ayarı sekmesi aynı `MODULE_CATALOG` anahtarları için `feature_visibility` ve `system_feature_visibility` (`settings/visibility/route.ts:45-50,108-112`). Gate bunları AND ile birleştiriyor (`lib/module-gate.ts:100-103`). Ayrıca `/admin/modules` ("Modül Detay Merkezi") ve `/admin/features` (feature flags) da var.
- **Sorun:** Modüller sekmesinde "açık" görünen bir modül, Sayfa Ayarı'nda "kapalı" olduğu için 403 veriyor ve UI bunu hiçbir yerde açıklamıyor. Admin/platform kapsamı için bu tamamen kopya.
- **Öneri:** Tek bir "Etkin durum" modeli kur: modül başına `global` + rol bazlı override matrisi (satır = modül, sütun = Global/Bayi/Müşteri/Sistem). Hücrede efektif durum ("kapalı, sebep: Global") ve `module_gate_blocked` olay sayısı (`analyticsEvent`) gösterilsin.
- **Efor:** L

### B10: Orta / Mimari: Şemasız toplu yazma ucu ve eşzamanlılık kontrolünün olmaması
- **Kanıt:** `lib/validations-admin.ts:47-58`: `key: z.string()`, `value: z.unknown()`. Normalizasyon yalnızca `points_matrix` için var (`settings/route.ts:246-256`). `prisma/schema.prisma:899-907` içinde `version` alanı yok.
- **Sorun:** Bu uçla `moduleControls`, `admin_gate`, `feature_visibility` gibi anahtarlar kendi normalizer ve beyaz listeleri atlanarak yazılabiliyor. İki admin ya da iki sekme son yazanın kazandığı şekilde birbirinin işini eziyor (örneğin `/admin/seasonal-concepts` ile arka plan efekti).
- **Öneri:** Anahtar başına Zod şemalı bir kayıt defteri (B8) kur ve batch ucu yalnızca kayıtlı, "genel" kategorideki anahtarları kabul etsin. `Settings`'e `version Int @default(0)` ve `updatedById` ekle; yazmada `updateMany({where:{key, version}})` ile çakışmayı 409 olarak dön. UI'da "Bu ayar sen düzenlerken X tarafından değiştirildi" uyarısı göster.
- **Efor:** M

### B11: Orta / Güvenlik + iz sürülebilirlik: Bootstrap, demo ve özel e-posta işlemleri audit'siz, rate limit'siz ve onaysız
- **Kanıt:** `bootstrap/route.ts` içinde hiç `auditLog.create` yok. `compose-mail/route.ts:20-80` audit/rate yok. Yıkıcı butonların onayı yok (`SC:842-844,872-880`). `admin_bootstrap` modül kapısı uygulanmıyor (`lib/module-controls.ts:66`; route'ta `assertModuleEnabled` yok).
- **Öneri:** Her yıkıcı işlem için "etkilenecek kayıt sayısı" ön-izleme ucu (`dryRun:true`) ekle, sonuç tipli bir onay dialog'unda gösterilsin ("DEMO-SİL yaz"). `auditLog` + `checkAdminRateLimit` kullan. Özel e-postalar `InboxMessage`/outbox'a "gönderilen" olarak kaydedilsin (`/admin/inbox` thread modeliyle birleşsin).
- **Efor:** M

### B12: Orta / Veri bütünlüğü: "3 Demo Kafe" canlıda bilinen şifreli hesaplar, herkese açık sahte yorumlar ve defter dışı puan oluşturuyor
- **Kanıt:** `lib/demo-cafes-seed.ts:102` (`hashPassword('Demo123!')`), `:106-121` (`emailVerified`, `points: 100+n*50`), `:205` (`isPublic: true` geri bildirim).
- **Sorun:** Doğrulanmış DEALER hesaplarına açık şifreyle girilebilir. Sahte yorumlar public akışlara ve discovery'ye düşebilir (tam yansıması doğrulanmadı). Bakiye defter kaydı olmadan basılıyor, bu da puan ekonomisi invariant'ına aykırı.
- **Öneri:** Demo verisini ayrı bir "demo tenant" ya da preview DB'ye taşı. Kalacaksa: rastgele ve gösterilmeyen şifre, `isDemo` bayrağı, public sorgularda `isDemo=false` filtresi, puanların ledger üzerinden basılması ve bir "Demo kafeleri kaldır" aksiyonu.
- **Efor:** L

### B13: Orta / UX: Bilgi mimarisi: "Ayarlar" başlığının altında ilk 3 kart ayar değil
- **Kanıt:** `SC:829-951`: Hızlı admin başlangıcı, Demo Durum Merkezi ve Kritik değişiklik geçmişi her sekmenin **üstünde** sabit duruyor. Profil sekmesi varsayılan (`SC:238`).
- **Sorun:** Operatör ayar bulmak için önce 8 yıkıcı demo butonunu geçiyor. Kişisel profil ile platform ayarları aynı yüzeyde duruyor (Stripe/Linear bunları "Account" ve "Workspace" olarak ayırır).
- **Öneri:** Sol dikey navigasyonlu bir ayar kabuğu kur: **Hesabım** (profil, şifre, oturumlar, 2FA) · **Platform** (kimlik doğrulama bayrakları, bakım, görünüm) · **Modüller & Erişim** · **E-posta** (teşhis) · **Geçmiş**. Demo araçları ayrı bir `/admin/dev-tools` sayfasına ya da yalnızca preview ortamına taşınsın.
- **Efor:** L

### B14: Düşük / Erişilebilirlik
- **Kanıt:** `Label`'larda `htmlFor` yok, `Input`'larda `id` yok (`SC:1095-1104,1121-1143,1169-1189,1224-1269,1735-1757,1783-1807`). Switch'lerin `aria-label`/`aria-describedby`'ı yok (`SC:1195,1477,1487,1497,1728,1897,1992,2018,2053`). Avatar düğmesi yalnızca `group-hover` ile görünüyor ve etiketsiz (`SC:1013`). Tüm avatar görsellerinde `alt="Avatar"` (`SC:1052`). Seçili efekt yalnızca renk ve ikonla belirtiliyor, `aria-pressed` yok (`SC:1294-1305`). Toast'larda ASCII Türkçe var ("Sifre guncellendi", "Basarili:" öneki `lib/admin-toast.ts:136`).
- **Not:** `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) ve `globals.css:801` sayesinde azaltılmış hareket tercihi destekleniyor.
- **Öneri:** Form satırları için ortak bir `SettingRow` bileşeni yaz (label, açıklama, kontrol ve `aria-describedby` otomatik bağlansın). Efekt kartları `role="radiogroup"`/`radio` olsun. Toast metinleri `i18n`'e taşınsın.
- **Efor:** S

### B15: Düşük / Mimari: 2073 satırlık tek bileşen, ölü importlar, ortak `saving` state'i
- **Kanıt:** `Settings` ve `Bell` import edilmiş ama kullanılmıyor (`SC:10,14`). Mount'ta 4 ayrı `useEffect` var (`SC:311-325`). `saving` profil, şifre ve site kaydı arasında paylaşılıyor (`SC:183,375,408,552`). E-posta sonuç tipi iki kez kopyalanmış (`SC:210-237`). `fetchSettings` kapanıştaki ilk `settings` değerine bağımlı (`SC:353`).
- **Öneri:** Her sekmeyi ayrı bir route segment'i ya da en azından ayrı bir bileşen yap (`settings/(account)`, `settings/platform`…). Veriyi SWR/React Query ile anahtar başına çek ve form durumunu `react-hook-form` + Zod ile yönet.
- **Efor:** L

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Değişiklik çekmecesi ve diff önizlemesi:** Kaydetmeden önce "3 ayar değişti" gösteren yapışkan bir alt çubuk; önce/sonra diff'i; tek tıkla iptal (Linear ve Retool'daki "unsaved changes" çubuğu gibi).
2. **Gerçek denetim günlüğü:** Ayar bazında zaman çizelgesi, aktör, IP, diff; anahtar ve aktöre göre filtre; sayfalama; CSV dışa aktarma; güvenli geri alma (Stripe "Events & logs" gibi).
3. **Ortam farkındalığı:** Başlıkta "Production" rozeti; tehlikeli işlemlerde tipli onay ("production" yaz); preview ve production arasında ayar karşılaştırması (PostHog'daki proje ayrımı gibi).
4. **Güvenlik merkezi (Hesabım):** Aktif oturumlar ve uzaktan çıkış, 2FA durumu (`app/api/auth/2fa` var ama burada görünmüyor), şifre gücü göstergesi, son giriş bilgileri.
5. **Etkin durum gezgini:** "Bu kullanıcı/rol için şu modül neden kapalı?" sorusunun cevabı, `module_gate_blocked` olay sayaçları ve "bu bayi olarak önizle" (Retool'daki permission preview gibi).
6. **Ayar arama ve komut paleti:** Tüm ayarlar arasında arama ve doğrudan bağlantı (`#auth.magicLink`); Linear'daki Cmd+K → "Settings: …" gibi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç şeyi hemen görmeli: (1) platformun **acil durum anahtarları** (bakım, kayıt, sağlayıcılar) ve gerçek etkileri, (2) **neyin ne zaman, kim tarafından** değiştiği, (3) her ayarın **asıl sahibi** olan sayfaya kısa yol. Hiçbir kontrol sahte olmamalı: okuyucusu olmayan ayar kayıt defterine giremez.

**Yerleşim:**
- Solda dikey navigasyon (mobilde üstte yatay kayan "segmented" menü): Hesabım · Platform · Kimlik doğrulama · E-posta · Modüller & Erişim · Görünüm · Geçmiş.
- **Platform** üstte bir "Durum şeridi" ile başlıyor: Bakım `KAPALI`, Kayıt `AÇIK`, Google `AÇIK`, Magic link `KAPALI`, Mail `SMTP+Resend`. Her çip tıklanınca ilgili bölüme kayıyor. Bakım modu açılınca şerit kırmızıya dönüyor ve bütün admin başlıklarında global bir uyarı bandı çıkıyor.
- **Modüller & Erişim**: tek bir matris tablosu (satır = modül, sütun = Global / Bayi / Müşteri / Sistem). Hücrelerde üç durumlu kontrol (miras / açık / kapalı), efektif durum rozeti ve son 7 günün engelleme sayısı. Severity `critical` olan modülü kapatırken etki önizlemesi gösteriliyor.
- **Görünüm**: Arka plan efektleri **canlı küçük önizlemelerle** (statik poster ve hover'da kısa döngü) gösteriliyor; dönemsel konsept override aktifse "Şu an Dönemsel Konsept X bunu eziyor" bilgisi çıkıyor. Tema ve renk için `/admin/themes`'e yönlendiren özet kartı var.
- **Geçmiş**: Sağda açılan bir drawer'da diff görünümü (JSON alanları için anahtar bazlı) ve "Bu değişikliği geri al" butonu; geri alma öncesinde etkilenecek anahtarlar listeleniyor.
- Alt kenarda yapışkan **değişiklik çubuğu**: "4 değişiklik · Geri al · Kaydet". Kayıt bölüm bazında yapılıyor; çakışma olursa 409 ve birleştirme dialog'u açılıyor.

**Motion/3D (ölçülü):** Bu bir operasyon yüzeyi; 3D'ye gerek yok. framer-motion yalnızca şu yerlerde kullanılmalı: değişiklik çubuğunun girişi (y: 16 → 0, 150 ms), kaydetme sonrası satırda kısa bir "kaydedildi" onay vurgusu, bakım modu bandının yumuşak girişi. Efekt kartlarındaki `whileHover scale` ve `LEGENDARY animate-pulse` kaldırılmalı; gösterişli etiketlerin yerini önizleme görseli almalı. Global `MotionConfig reducedMotion="user"` korunmalı.

**Veri / API değişiklikleri:**
1. `lib/settings-registry.ts`: `{ key, section, schema (Zod), default, readerRef, secret?, ownerHref? }`. Okuyucusu olmayan anahtar için CI testi eklenmeli.
2. `GET /api/admin/settings?section=platform`: yalnızca kayıtlı, gizli olmayan anahtarlar ve `version` değeri dönmeli.
3. `PATCH /api/admin/settings`: `{ changes: [{key, value, expectedVersion}] }`. Anahtar başına doğrulama, transaction, `version++`, `{settingKey, before, after}` biçiminde audit ve ilgili tag'lerin temizlenmesi.
4. `POST /api/admin/settings/revert`: `{ auditLogId }` yalnızca standart biçimli kayıtları kabul etmeli; `dryRun` ile diff dönmeli.
5. `requireAuth(['ADMIN'])` içinde gate cookie doğrulaması (B1).
6. Bootstrap'in production'da kapatılması, `DemoArtifact` tablosu ya da ayrı bir demo tenant, `dryRun` sayımları (B2, B5, B12).
7. `Settings` modeline `version Int @default(0)` ve `updatedById String?` eklenmesi (canlı Neon'a migration öncesinde onay alınmalı).

---

## Çakışmalar / birleştirme önerisi

| Bu sayfadaki bölüm | Çakıştığı sayfa | Öneri |
|---|---|---|
| Genel: Site adı, URL, açıklama | `/admin/seo` (`seo.global`) | Buradan kaldır; salt okunur özet ve bağlantı koy. |
| Görünüm: Ana renk, varsayılan tema, logo/favicon | `/admin/themes`, `/admin/design-language` | Kaldır; tema sahibi `/admin/themes`. |
| Görünüm: Arka plan efekti | `/admin/seasonal-concepts` (efekt override) | Burada kalabilir, ama override durumunu göstermeli. Uzun vadede "Görünüm" tek sayfada birleşmeli. |
| AI: anahtar, model, aktif | `/admin/ai-settings`, `/admin/ai-dashboard` | Kaldır (anahtar alanı güvenlik riski). |
| Oyun: puan, referans, seviye | `/admin/points-matrix`, `/admin/gamification-settings`, `/admin/referrals` | Kaldır; puan ekonomisinin tek kaynağı points matrix. |
| Modüller sekmesi | `/admin/modules` (Modül Detay Merkezi), `/admin/features` | Modül aç/kapa ve görünürlük **tek** "Modüller & Erişim" sayfasında birleşmeli; `/admin/modules` detay/analitik görünümü olarak buna bağlanmalı. |
| Sayfa Ayarı sekmesi | `/admin/menu-groups`, `/admin/sidebar-order`, `/admin/pages` | Menü görünürlüğü, menü grupları ve sıralama "Navigasyon" başlığı altında birleşmeli. |
| Özel e-posta / test e-postası | `/admin/inbox` (aynı `compose-mail` ucu), `/admin/intern-emails` | Özel e-posta `/admin/inbox`'a taşınmalı; burada yalnızca mail teşhisi (env özeti + test) kalmalı. |
| Hızlı admin başlangıcı + Demo Durum Merkezi | `/admin/ai-settings` (bootstrap kullanıyor), diğer sayfalardaki `BootstrapActionButton`'lar | Ayarlar'dan çıkarılmalı; production'da gizli bir `/admin/dev-tools` sayfasında toplanmalı. |
| Kritik değişiklik geçmişi | `/admin/audit`, `/admin/seo` (kendi rollback'i) | Tek bir ayar geçmişi bileşeni olmalı; `/admin/audit` ile filtre paylaşmalı; SEO'nun kendi rollback'i aynı standart biçime geçmeli. |

---

## Doğrulama (şüpheci inceleme)

Bu bölüm, yukarıdaki KRİTİK/YÜKSEK iddiaları çürütmek amacıyla kodun salt okunur incelenmesiyle yazıldı. Kod değiştirilmedi; veritabanına, dev server'a, build'e ya da teste dokunulmadı. Canlı DB'deki gerçek durum (hangi satırların var olduğu) **doğrulanmadı**; kararlar kod yollarına dayanıyor.

### 1. Admin gizli kapısı API katmanında atlanıyor: **DOĞRULANDI**
- `proxy.ts:105-119`: `/api/` ile başlayan her istek `authMiddleware`'e hiç girmeden `NextResponse.next()` ile geçiyor. Gate kontrolü (`proxy.ts:79-88`) yalnızca sayfa yollarında çalışıyor.
- `lib/api-auth.ts:52-82` `requireAuth` yalnızca session, rol ve token-replay kontrolü yapıyor; `admin_gate` cookie'sine bakmıyor. Kod tabanında `verifyGateCookie` (`lib/admin-gate.ts:55`) hiçbir API rotasında çağrılmıyor.
- İddiadan daha doğrudan bir kanıt da var: `app/api/admin/settings/admin-gate/route.ts:19-27` GET, soruyla birlikte **cevabı da** düz olarak döndürüyor; PUT (`:34-63`) cevabı değiştirebiliyor. Bunlar da yalnızca `requireAuth(['ADMIN'])` ile korunuyor.
- `GET /api/admin/settings` (`route.ts:61-66`) filtre uygulamadan `admin_gate` satırını da döndürüyor (satır DB'de varsa). Batch POST (`lib/validations-admin.ts:47-58`, `key: z.string()`) `admin_gate` anahtarını da normalize etmeden yazabiliyor.
- **Yeniden üretim:** Rolü ADMIN olan ama gate'i geçmemiş hesapla oturum açılır. `/admin` sayfası `/admin-gate`'e yönlendirir, ancak tarayıcı konsolundan `fetch('/api/admin/settings/admin-gate')` çağrısı `{question, answer}` döndürür. Aynı oturum `/api/admin/*` altındaki tüm uçları (bootstrap, rollback, kullanıcı yönetimi) gate'siz kullanabilir.
- **Not:** Gate'in tehdit modeli zaten zayıf (cevap tek rakam, varsayılan `'7'` kaynak kodda). Düzeltmenin yeri `requireAuth`'tur: rol `ADMIN` olduğunda gate cookie'si `verifyGateCookie` ile doğrulanmalı (`/api/admin/gate` muaf tutulmalı). Proxy'de `/api/admin/*` için edge HMAC kontrolü de ikinci katman olarak eklenebilir.

### 2. "Demo sektör verisini sil" tüm bayilerin `businessCategory` alanını siliyor: **DOĞRULANDI** (etki kapsamı daraltıldı)
- `app/api/admin/bootstrap/route.ts:268-279`: `updateMany({ where: { role: 'DEALER', businessCategory: { not: null } } })`. Tracker'daki `insightsDealerIds` okunuyor ama `where` içinde kullanılmıyor; sonra sıfırlanıyor. Onay adımı yok: `settings-client.tsx:842` (`BootstrapActionButton`, confirm yok) ve `:875` (`runBootstrapBatch('clear')`).
- **Daraltma:** Kod tabanında bayinin kendi `businessCategory` değerini yazabildiği bir ürün yolu yok. Yazan yerler yalnızca `bootstrap` (`:249-252`) ve `lib/demo-cafes-seed.ts:139,149`. Bu yüzden "gerçek işletme kategorileri"nin kaybı yalnızca elle (DB üzerinden) girilmiş değerler ve demo kafe kategorileri (`cafe`/`restaurant`/`bakery`) için geçerli. Ters yön daha somut: `seed_insights_categories` (`:237-266`) kategorisi boş olan **gerçek** bayilere `demo-*` değeri yazıyor. Bu değerler müşteriye açık `app/api/customer/category-leaderboard/route.ts:32`, bayiye açık `app/api/dealer/benchmark/route.ts:217-224` ve `lib/visit-missions.ts:49-72` (kategori şartlı görevler) tarafından okunuyor.
- **Yeniden üretim:** "3 Demo Kafe Ekle" → demo kafeler `cafe`/`restaurant`/`bakery` kategorisini alır → "Toplu demo sil" → `cleared` sayısı tracker'daki ID sayısından büyük çıkar, demo kafelerin (ve elle girilmiş tüm bayilerin) kategorisi `null` olur.

### 3. Settings rollback, `{key:value}` biçiminde olmayan audit kayıtlarında rastgele satırlar oluşturuyor: **DOĞRULANDI**
- `app/api/admin/settings/rollback/route.ts:37-69`: `entity === 'settings'` olan her kaydın `oldData` alanının **üst düzey anahtarlarını** Settings anahtarı sayıp `category: 'general'` ile upsert ediyor. `revalidateTag` çağrılmıyor (dosyada `next/cache` importu yok).
- `GET /api/admin/settings/audit` (`audit/route.ts:14-27`) `entity:'settings'` olan bütün kayıtları listeliyor ve UI her satıra "Bu sürüme dön" butonu koyuyor (`settings-client.tsx:917-946`).
- Biçimi uyumsuz kaynaklar: SEO `oldData = existing.value` = `{global, pageOverrides}` (`app/api/admin/seo/route.ts:178`), modüller `oldData = existing.value` (`app/api/admin/settings/modules/route.ts:58`; iddiadaki `:180` satır numarası yanlış, bulgu doğru), rozet algoritması (`badges/algorithm/route.ts:92-95`) ve `PUT /api/admin/settings` (`route.ts:169-179`). Sonuncusu her tekil anahtar için ham değeri yazıyor; örneğin `agent_council_profiles` ve `points_matrix` bu yoldan geliyor. Buna karşılık batch, visibility, sidebar ve experience-pulse kayıtları `{[KEY]: value}` biçiminde, yani uyumlu.
- **Yeniden üretim:** `/admin/seo` üzerinden bir kez kaydedilir → `/admin/settings` ekranında "Geçmişi getir" → `update` satırında "Bu sürüme dön" → Settings tablosunda `global` ve `pageOverrides` adlı yeni `general` satırları oluşur, SEO ayarı geri dönmez, toast "Ayarlar geri alındı (2 anahtar)" der ve audit'e `rollback` başarı kaydı düşer.

### 4. Şüpheli aktivite seed/clear döngüsü gerçek kullanıcıların fraud durumunu ezip temizliyor: **ÇÜRÜTÜLDÜ** (iddia edilen etki yok; daha düşük önemde bir kalıntı var)
- Mekanik kısım doğru: `bootstrap/route.ts:329-334` önceki durumu saklamadan `fraudStatus:'flagged', fraudScore:0.71` yazıyor; `:361-370` `clean/0` yapıyor. `Promise.all` (`settings-client.tsx:629-642`) üç aksiyonu paralel çalıştırıyor ve her biri `getTracker → saveTracker` yaptığı için tracker'da kayıp güncelleme oluşuyor.
- **İddianın çöktüğü yer:** `fraudStatus` alanının, bootstrap dışında üretimde **hiçbir yazıcısı yok**. `lib/fraud/engine.ts` içindeki `checkFraudulentActivity` ve `shouldApplyReward` hiçbir yerden çağrılmıyor (grep ile doğrulandı). Alanı okuyan yerler yalnızca admin gösterge panelleri: `app/admin/fraud-prevention/page.tsx:24-29,130`, `app/api/admin/trust-overview/route.ts:30`, `app/api/admin/dealers-health/route.ts:93-94`. Dolayısıyla uygulama üzerinden "önceden shadow_ban/flagged olmuş gerçek müşteri" oluşamaz; `fraudStatus` puan kazanımını da engellemediği için "puan ekonomisinin fraud korumasının delinmesi" diye bir etki yok. Tracker yarışı da pratikte zararsız: clear aksiyonları `metadata.source='bootstrap'`, `notes='[bootstrap-demo]'` ve `fraudScore 0.70-0.72` gibi geri dönüş eşleşmeleriyle temizliyor.
- **Kalan gerçek sorun (orta/düşük):** Seed, son 30 **gerçek** müşteriye sahte `SuspiciousActivity` kayıtları bağlıyor ve bu müşterileri fraud panosunda "ŞÜPHELİ" olarak gösteriyor. Bu, admin'in gerçek bir müşteriye yanlış işlem uygulamasına yol açabilir. Bunun ayrıca dikkat çekici bir sonucu var: fraud motoru ölü kod, yani puan ekonomisinde hız tabanlı fraud koruması fiilen **hiç yok**. Bu ayrı bir bulgu olarak ele alınmalı.

### 5. OpenAI API anahtarı düz metin olarak Settings ve AuditLog'a yazılıyor, tarayıcıya geri dönüyor: **DOĞRULANDI** (etki, anahtarın girilmiş olmasına bağlı)
- Alan: `settings-client.tsx:1735-1741`. `handleSave` (`:550-565`) state'teki tüm anahtarları, `openaiApiKey` dahil, batch POST ediyor. `route.ts:236-279` `oldMap` ve `newMap` değerlerini ham olarak `auditLog`'a yazıyor, yani anahtar her kayıtta iki kopya daha üretiyor. `audit/route.ts:18-23` `oldData/newData`'yı tarayıcıya döndürüyor; `GET /api/admin/settings` de değeri döndürüyor.
- Değer sunucuda hiçbir yerde okunmuyor: grep yalnızca istemci dosyasını buluyor, `lib/ai-engine.ts:56-58` yalnızca `process.env.OPENAI_API_KEY` / `GROQ_API_KEY` kullanıyor.
- **Yeniden üretim:** Admin, AI'yı açtığını düşünerek `sk-...` yapıştırır ve Kaydet'e basar → Settings `openaiApiKey` satırı ve AuditLog `newData.openaiApiKey` düz metin olur → her sonraki Kaydet aynı değeri yeni bir audit kaydına kopyalar → "Geçmişi getir" yanıtında anahtar network sekmesinde görünür. Madde 1 ile birleşince gate'i geçmemiş bir ADMIN-rol hesap da anahtarı okuyabilir. Canlıda gerçekten bir anahtar girilip girilmediği **doğrulanmadı**.

### 6. Ayar yüklemesi başarısız olursa varsayılanlar canlı ayarların üzerine yazılır: **DOĞRULANDI** (tetikleyici daraltıldı)
- `settings-client.tsx:349-366`: `res.ok` kontrolü yok, hata kullanıcıya gösterilmiyor (yalnızca `console.error`), `data.entries` yoksa state `:256-278` arasındaki sabit varsayılanlarda kalıyor. `handleSave` (`:555-565`) state'teki 21 anahtarın hepsini gönderiyor. Bunlardan `enableMagicLink` canlıda `app/api/auth/magic-link/route.ts:36` ve `app/api/public/auth-features/route.ts:10` tarafından, `backgroundEffect` ise `lib/get-background-effect.ts:14` tarafından okunuyor.
- **Daraltma:** İddiadaki "429" GET için geçerli değil; GET'te rate limit yok, `checkAdminRateLimit` yalnızca POST'ta (`route.ts:207`). Oturum hatası (401/403) durumunda POST da başarısız olacağı için zarar oluşmaz. Gerçek tetikleyici GET'in geçici 500 ya da timeout ile düşmesi ve sonraki POST'un başarılı olması (örneğin Neon soğuk başlangıcı).
- **Yeniden üretim:** GET `/api/admin/settings` 500 döner → sayfa varsayılanlarla, hata göstermeden açılır → admin yalnızca "Site adı"nı değiştirip Kaydet'e basar → `enableMagicLink=false`, `backgroundEffect='original'`, `maintenanceMode=false` ve diğer 18 anahtar canlıda ezilir. Aynı mekanizma, yükleme başarılı olsa bile **iki sekme ya da iki admin** arasında kayıp güncellemeye (lost update) yol açar, çünkü değişmeyen anahtarlar da gönderiliyor. Bu ikinci senaryo daha sık yaşanabilir.

### 7. Demo kafe seed'i canlıda bilinen şifreli, doğrulanmış hesaplar ve defter dışı puan oluşturuyor: **DOĞRULANDI**
- `lib/demo-cafes-seed.ts:102` `hashPassword('Demo123!')`. `:107-121` `emailVerified` + `points: 100+n*50` ile 5 CUSTOMER oluşturuyor. `:136-158` `emailVerified` + `points: 300` ile 3 DEALER oluşturuyor; e-posta adresleri `cafe-*@qratex.com` / `demo-musteri-*@qratex.com`. `:205` `isPublic: true` sahte yorumlar ekliyor, `:250-259` `status:'sent'` kampanyalar oluşturuyor.
- `lib/auth.ts:79-150` credentials `authorize` içinde demo hesaplarını engelleyen bir kontrol yok. Şifre kaynak kodda (`git remote` → GitHub; reponun açık mı özel mi olduğu **doğrulanmadı**). Kodda demo kafeleri silen bir aksiyon yok (grep: `demo-dealer` / `Demo123` yalnızca seed dosyasında geçiyor).
- **Yeniden üretim:** `/admin/settings` → "3 Demo Kafe Ekle" (onay yok) → herhangi biri `cafe-aroma@qratex.com` / `Demo123!` ile DEALER paneline girebilir; `demo-musteri-1@qratex.com` hesabı ise kazanılmamış 150 puanla ödül ekonomisine katılır. Puan hareket kaydı olmadan doğrudan `User.points` alanına yazılıyor. Bu butona canlıda basılıp basılmadığı **doğrulanmadı**.

### Özet

| # | İddia | Karar |
|---|---|---|
| 1 | Gate API'de atlanıyor | Doğrulandı |
| 2 | Demo kategori silme tüm bayileri etkiliyor | Doğrulandı (gerçek kategori yazan ürün yolu yok, etki daraltıldı) |
| 3 | Rollback biçimsiz audit'te çöp satır açıyor | Doğrulandı |
| 4 | Fraud seed/clear gerçek kullanıcıyı temizliyor | Çürütüldü (fraudStatus hiçbir şeyi gate'lemiyor; kalıntı: gerçek müşteriye sahte şüpheli kaydı) |
| 5 | OpenAI anahtarı düz metin, audit'te çoğalıyor | Doğrulandı |
| 6 | Yükleme hatasında varsayılanlar canlıyı ezer | Doğrulandı (tetikleyici 500/timeout ve çok sekme) |
| 7 | Demo kafe: bilinen şifre + defter dışı puan | Doğrulandı |

---

## Uygulama (Dalga 2)

**Yüzey:** a-ayarlar-kapi · **Rotalar:** `/admin/settings` (yeniden yazıldı), `/admin/gate-settings` (ayrıntı ekranı olarak korundu).

**Mimari:** `app/admin/settings/page.tsx` artık sunucu bileşeni: `lib/platform-settings/server.ts → getPlatformSettingsState()` sunucuda okunur (ön yükleme düşerse istemci `QueryState` hata + "Tekrar dene"; varsayılanlarla form AÇILMAZ). 2211 satırlık `settings-client.tsx` silindi; yerine `components/admin/a-ayarlar-kapi/**` (kabuk + bölüm başına bileşen; Erişim ve Geçmiş `next/dynamic` ile tembel). **Kayıt defteri** `lib/platform-settings/registry.ts`: her anahtar `{bölüm, etiket, etki metni, zod şeması, okuma yorumu, okuyucu dosyalar, önbellek etiketleri}`; okuyucusu olmayan anahtar deftere giremez (jest testi okuyucu dosyalarının varlığını ve anahtarı gerçekten okuduğunu doğrular). Bölümler: **Genel · Kimlik · Güvenlik ve kapı · Bakım · Erişim · Geçmiş**; üstte acil durum şeridi (Bakım / Kayıt / Google / Bağlantıyla giriş / E-posta / Gizli kapı çipleri ilgili bölüme götürür; bakım açıkken kırmızı bant). Yeni BFF'ler (`defineRoute`, ADMIN + kapı + rate limit + zod): `GET|PATCH /api/admin/platform-settings`, `GET /api/admin/platform-settings/history` (imleçli), `POST /api/admin/platform-settings/revert` (`dryRun` önizleme + sürüm), `GET|PUT /api/admin/platform-settings/access`. Yazma `lib/settings-version` ile anahtar başına sürüm kontrollü (409), tek transaction, anahtar başına STANDART denetim (`{settingKey, value}` eski/yeni). Eşzamanlılık şema değişmeden `updatedAt` sürümüyle çözüldü (C2 iyimser kilit deseni korunur). Hareket: bölüm geçişinde `fadeUp` (`useMotionPolicy` ile azaltılmış harekette statik); 3B yok.

**Gerçek etki kazanan anahtarlar** (eski sahte anahtarlar dağıtımda kendiliğinden etki kazanmasın diye YENİ adlarla):
- `platform_registration_open` → `app/api/auth/register` 403 `REGISTRATION_CLOSED`; `lib/auth.ts resolveOAuthSignIn` yeni OAuth hesabını reddeder.
- `platform_google_auth` → `lib/auth.ts` Google girişini reddeder; `getAuthFeatures().google` düğmeyi gizler. Kapatma onayında Google hesabı bağlı kullanıcı sayısı (gerçek `Account` sayımı) gösterilir.
- `platform_maintenance {enabled, message, plannedEndAt}` → kaydedilince Redis'e yayınlanır; `proxy.ts` → `lib/platform-settings/maintenance-edge.ts` (izolat başına 10 sn bellek önbelleği): müşteri/bayi paneli sayfaları `/bakim` ekranına, `/api/(customer|dealer|staff)/*` 503 `MAINTENANCE`; ADMIN muaf. Redis yoksa bakım AÇILAMAZ (409 `MAINTENANCE_UNAVAILABLE`, anahtar kilitli + açıklama). Ayar ekranı her açılışta DB ↔ Redis eşleşmesini denetleyip onarır. Açma işlemi tipli onay ("BAKIM").

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Dinamik yükleme + skeleton | ÇALIŞIYOR — sunucu bileşeni ön yükleme; tek iskelet |
| 2 | İç skeleton | ÇALIŞIYOR — `QueryState` (sayaçlar sahte 0 göstermez) |
| 3 | Yükleme hata durumu | ÇALIŞIYOR — hata + tekrar dene; form kilitli (B6) |
| 4 | PageHeader | ÇALIŞIYOR |
| 5 | `?tab=` senkronu | ÇALIŞIYOR — `?bolum=`; eski `?tab=` derin bağlantıları yeni bölümlere eşlenir |
| 6 | API yetkisi | ÇALIŞIYOR — `defineRoute` + `requireAuth` kapı doğrulaması (A2) |
| 7–20 | Demo/bootstrap araçları (kafe, sektör, şüpheli, AI örnek, A/B, sil, sayaç, toplu, özet) | KALDIRILDI — ayar ekranında yeri yok (B13); canlı veriye yazıyorlardı. Uç `/api/admin/bootstrap` sahiplik dışı (bkz. Kalanlar) |
| 21 | Geçmişi getir | ÇALIŞIYOR — Geçmiş bölümü açılınca yüklenir; yanıltıcı boş metin yok |
| 22 | Geçmiş listesi | ÇALIŞIYOR — insan okunur etiket, önce → sonra, aktör, İstanbul saati, sayfalama, `/admin/audit` bağlantısı |
| 23 | Bu sürüme dön | ÇALIŞIYOR — "Bu değişikliği geri al": yalnız standart kayıt, sürüm kontrollü, önbellek tazelenir (B3) |
| 24 | Geri alma onayı | ÇALIŞIYOR — sunucu önizlemesi (şimdiki / geri yüklenecek değer) |
| 25 | Avatar gösterimi | ÇALIŞIYOR |
| 26 | Avatar düğmesi | ÇALIŞIYOR — her zaman görünür "Avatar seç" düğmesi, klavye ile erişilir |
| 27 | Avatar kategorileri | ÇALIŞIYOR — `tablist`/`tab` |
| 28 | Avatar seçimi | ÇALIŞIYOR — `radiogroup`, anlamlı `aria-label`, ASCII toast yok |
| 29 | Avatar değiştir | ÇALIŞIYOR (26 ile birleşti) |
| 30 | Ad + Profili kaydet | ÇALIŞIYOR — ayrı kaydetme durumu; seçilmemiş varsayılan avatar YAZILMAZ |
| 31 | E-posta (salt okunur) | ÇALIŞIYOR |
| 32 | "Admin" rol etiketi | KALDIRILDI — bilgi değeri olmayan sabit metin |
| 33 | Şifre değiştirme | ÇALIŞIYOR — güç göstergesi, eşleşme denetimi; diğer oturumlar zaten düşüyor (P0-07) ve ekranda söylenir; şifresiz OAuth hesabına anlaşılır yönerge |
| 34–36 | Site adı / URL / açıklama | KALDIRILDI — gerçek kaynak `seo.global`; salt okunur özet + "SEO Motoru'nda düzenle" |
| 37 | Bakım modu | ÇALIŞIYOR — gerçek (proxy + `/bakim` + 503), mesaj ve tahmini bitiş |
| 38 | Genel toplu Kaydet | KALDIRILDI — bölüm başına yalnız değişen anahtarlar + sürüm (B6) |
| 39–42 | Logo / favicon / ana renk / varsayılan tema | KALDIRILDI — okuyucusuz; Tasarım Sistemi'ne bağlantı |
| 43 | Arka plan efekti seçimi | ÇALIŞIYOR — `radiogroup`, kayıt defteri zod'u, `settings` etiketi anında sona erer |
| 44 | Efekt hatasında geri alma | ÇALIŞIYOR — seçim sunucu onayından sonra değişir; hata görünür |
| 45 | Efekt önizlemesi | KALDIRILDI (yerine "Ana sayfayı aç") — 28 canlı canvas önizlemesi ops ekranı için ağır; bkz. Kalanlar |
| 46 | Seçili bilgi + dönemsel override | ÇALIŞIYOR — etkin dönemsel konsept efekti ezerse bant |
| 47 | Yeni kayıtlar | ÇALIŞIYOR — gerçek (e-posta + OAuth ilk hesap) |
| 48 | Google ile giriş | ÇALIŞIYOR — gerçek (callback + düğme) |
| 49 | Magic link | ÇALIŞIYOR |
| 50 | Sunucu mail özeti | ÇALIŞIYOR — sunucuda hesaplanır, ayrı `SELECT 1` isteği yok |
| 51 | .env dokümantasyonu | ÇALIŞIYOR — yalnız yapılandırma eksikken kısa yönerge |
| 52 | Test e-postası | ÇALIŞIYOR |
| 53 | Özel e-posta | KALDIRILDI — `/admin/inbox` (aynı uç) tek yer |
| 54 | Gönderim sonuçları | ÇALIŞIYOR — `aria-live` |
| 55–57 | AI anahtar / OpenAI anahtarı / model | KALDIRILDI — okuyucusuz; anahtar alanı güvenlik riskiydi (B4) |
| 58–60 | Geri bildirim / referans puanı / seviye eşiği | KALDIRILDI — puan kuralları tek kaynak Ekonomi Stüdyosu |
| 61–68 | Modül arama/filtre/yenile/kaydet/toplu/switch/detay/boş durum | KALDIRILDI — global modül aç/kapa tek kaynak `/admin/features` (B9); Erişim'de "Herkese kapalı" rozeti oraya bağlanır |
| 69 | `admin_bootstrap` modül anahtarı | KALDIRILDI (bu ekrandan) — uç sahiplik dışı |
| 70 | Kaydedilmemiş değişiklik göstergesi | ÇALIŞIYOR — satır başına "Kaydedilmedi", `DirtyBar` (geri al, Ctrl+S, sayfadan çıkış uyarısı) |
| 71 | Görünürlük rol seçimi | ÇALIŞIYOR |
| 72 | Görünürlük Yenile | KALDIRILDI — çakışmada "güncel hâli yükle"; başka durumda gereksiz |
| 73 | Görünürlük Kaydet | ÇALIŞIYOR — sürüm kontrollü (409), standart denetim, kapı önbelleği anında |
| 74 | Toplu aç/kapa | ÇALIŞIYOR |
| 75 | Özellik görünürlüğü | ÇALIŞIYOR — global durum rozeti, kritik rozeti |
| 76 | Menü görünürlüğü | ÇALIŞIYOR |
| 77 | Sistem görünürlüğü | KALDIRILDI — Özellik Kontrolü ile çakışan katman; kalmış kapatmalar uyarı + tek tık temizleme |
| 78 | "Responsive görünüm" etiketi | KALDIRILDI |
| 79 | Kayıttan sonra geçmiş | ÇALIŞIYOR |
| 80 | Eşzamanlılık | ÇALIŞIYOR — `updatedAt` sürümü + 409 + çakışma bandı (şema değişikliği gerekmedi) |

### Kapanan bulgular (15'ten 11'i tam, 4'ü bu ekrandan kaldırılarak)
- **B1** kapandı: kapı API'de zorunlu (A2); ayrıca genel `GET /api/admin/settings` artık `openaiApiKey`'i de listelemez, POST/PUT yazamaz.
- **B3** kapandı: yeni geri alma yalnız standart kayıt; eski `/api/admin/settings/rollback` (denetim merkezi kullanıyor) sertleştirildi: yalnız `batch_update`/`rollback` + `entityId` boş, yalnız VAR OLAN satırlar, önbellek etiketleri temizlenir.
- **B4** kapandı (kod): alan kaldırıldı; genel uç gizler/reddeder; ham `oldData/newData` döndüren `/api/admin/settings/audit` 410.
- **B6, B7, B8, B9, B10 (yeni uç), B13, B14, B15** kapandı. Eski `/api/admin/settings/modules` ve `/visibility` (yalnız eski istemci) 410.
- **B2, B5, B11, B12** (demo/bootstrap): ayar ekranından kaldırıldı; uçların kendisi kalan.

### Kalanlar
- `/api/admin/bootstrap` + `lib/demo-cafes-seed.ts` (B2/B5/B11/B12): üretimde kapatma, `dryRun`, denetim ve demo kiracı — sahiplik dışı (başka yüzeyler `BootstrapActionButton` kullanıyor).
- Canlı DB'de mevcut `openaiApiKey` satırı ve eski denetim kopyaları: veri temizliği onay gerektirir (DB'ye bağlanılmadı).
- Genel batch ucu (`POST /api/admin/settings`) tema ekranları için kayıt defteri dışı anahtar yazmaya devam ediyor (B10 kısmi) — tema sahibi yüzey.
- Kayıt ekranı `REGISTRATION_CLOSED`'u genel hata olarak gösterir; özel "kayıtlar kapalı" metni p-auth yüzeyinin işi (sunucu `getAuthFeatures().registrationOpen` artık veriyor).
- Efekt canlı önizlemesi (#45) ve "etkin durum gezgini"/`module_gate_blocked` sayaçları (eksik özellik 5) yapılmadı.
