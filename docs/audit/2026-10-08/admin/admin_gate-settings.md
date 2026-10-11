# /admin/gate-settings

**Amaç:** Admin paneline girişte sorulan "gizli kapı" sorusunu ve tek rakamlık cevabını yönetmek. ADMIN rolü tek başına yetmesin, ek bir "bilgi faktörü" ile panele girilsin (rolü yanlışlıkla ADMIN yapılan stajyer senaryosu).

**Genel puan:** 3.5/10 · **Karar:** yeniden inşa (sayfanın kendisi küçük ve derli toplu, ama koruduğunu iddia ettiği güvenlik modeli uçtan uca kırık; sayfa, gerçek bir "Admin erişim güvenliği" ekranına dönüştürülerek yeniden kurulmalı)

> Özet: Form, veri akışı ve audit kaydı düzgün çalışıyor. Sorun, bu sayfanın yönettiği kapının **API katmanında hiç uygulanmaması**, proxy'nin **HMAC imzasını doğrulamaması** (cookie sahtelenebilir) ve bu sayfanın kendi GET ucunun **gizli cevabı kapıyı geçmemiş bir ADMIN'e düz metin olarak vermesi**. Ekrandaki "cevabı değiştirirsen tüm adminler yeniden sorulur" vaadi de kodla doğrulanmıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Okuma/kaydetme/önizleme çalışıyor; ama ayarın etkisi (kapı) API'de yok, cookie sahtelenebilir, "cevap değişince oturumlar düşer" vaadi gerçekleşmiyor. |
| UX | 5/10 | Tek amaçlı, anlaşılır form; fakat cevap ekranda maskesiz, yükleme hatasında yeniden dene yok, onay adımı yok, boş soru sessizce varsayılana dönüyor. |
| Görsel | 6/10 | Ortak `DashboardPageHero` + bilgi kartı tutarlı; önizleme kutusu gerçek kapı ekranını (portal halkası, kamuflaj noktaları) temsil etmiyor. |
| Mimari | 3/10 | Güvenlik kontrolü yalnız sayfa rotalarında (proxy), `/api/*` tamamen muaf; `verifyGateCookie` yalnız testlerde kullanılıyor; geçersiz girdi sessizce bilinen varsayılan "7"ye düşüyor. |
| Performans | 8/10 | Tek GET + tek PUT, hafif istemci bileşeni; sorun yok. |
| Erişilebilirlik + mobil | 5/10 | `Label`'lar `htmlFor` ile input'a bağlı değil, hata mesajı `aria-describedby`/`aria-invalid` ile bağlanmamış, `<form>` yok (Enter ile kaydetme yok); mobilde tek kolon düzgün akıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: proxy ADMIN rolü + gate cookie kontrolü | KISMİ | `proxy.ts:60-88` | Rol kontrolü doğru; gate kontrolü yalnız biçim + userId eşleşmesi, imza doğrulanmıyor (bkz. B2). |
| 2 | Hero başlık (Gizli Kapı) | ÇALIŞIYOR | `page.tsx:69-73` | Ortak bileşen, `useReducedMotion` destekli (`components/admin/admin-premium-hero.tsx:73`). |
| 3 | Bilgi kartı (kapının amacı) | KISMİ | `page.tsx:75-84` | Metin "cevabı değiştirirsen tüm adminler bir sonraki oturumda yeniden sorulur" diyor; cevap değişimi cookie'leri geçersiz kılmıyor (bkz. B3). |
| 4 | Ayarları yükleme (GET) | ÇALIŞIYOR | `page.tsx:24-40`, `route.ts:19-27` | `PRIVATE_NO_STORE_HEADERS` ile önbelleksiz. |
| 5 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:86-87` | Tek gri blok; `aria-busy` yok. |
| 6 | Yükleme hata durumu | KISMİ | `page.tsx:33-37` | Yalnız toast; form boş değerlerle açılıyor, "yeniden dene" yok, kaydetme mümkün (bkz. B7). |
| 7 | Gizli Soru alanı (max 200) | ÇALIŞIYOR | `page.tsx:91-100`, `lib/admin-gate.ts:32` | İstemci ve sunucu 200 karakterde kesiyor; karakter sayacı yok. |
| 8 | Boş soru doğrulaması | EKSİK | `page.tsx:121`, `lib/admin-gate.ts:32` | Boş soru gönderilebiliyor; sunucu sessizce varsayılan soruya çeviriyor, kullanıcıya söylenmiyor. |
| 9 | Cevap alanı (tek rakam, son girilen rakam kalır) | ÇALIŞIYOR | `page.tsx:102-111` | `inputMode="numeric"`, rakam dışı karakter filtreleniyor. |
| 10 | Cevabın maskelenmesi / göster-gizle | EKSİK | `page.tsx:103-110` | Cevap ekranda düz `type="text"` ve büyük puntoda (`text-2xl`); ekran paylaşımında sızar. |
| 11 | Cevap hata mesajı | ÖLÜ KOD (çalışmaz) | `page.tsx:107,109,111` | onChange zaten yalnız tek rakam bıraktığı için `answer && !answerValid` hiçbir zaman true olmaz; kırmızı kenarlık/mesaj asla görünmez. |
| 12 | Canlı önizleme | KISMİ | `page.tsx:114-119` | Soru metnini yansıtıyor ama gerçek kapı ekranının (`app/admin-gate/page.tsx:136-150` portal halkası, yıldız alanı, kamuflaj) temsili değil; "önizlemeyi tam ekran aç" yok. |
| 13 | Kirli durum (dirty) takibi + buton kilidi | ÇALIŞIYOR | `page.tsx:42,121` | `JSON.stringify` imzası ile; sayfadan ayrılırken kaydedilmemiş değişiklik uyarısı yok. |
| 14 | Kaydet (PUT) | ÇALIŞIYOR | `page.tsx:45-65`, `route.ts:34-64` | Upsert + yanıtla state senkronu doğru. |
| 15 | Sunucu tarafı doğrulama | KISMİ | `route.ts:41`, `lib/admin-gate.ts:34-35` | Geçersiz cevap 400 dönmüyor; sessizce bilinen varsayılan `'7'`ye düşüyor (bkz. B5). |
| 16 | Audit log (UPDATE_ADMIN_GATE) | ÇALIŞIYOR | `route.ts:50-61` | Cevap audit'e yazılmıyor (doğru karar), IP/UA ekleniyor; ama "cevap değişti mi" bilgisi hiç kaydedilmiyor. |
| 17 | Başarı / hata toast'ları | KISMİ | `page.tsx:34,59,62`, `lib/admin-toast.ts:17-19` | Önek "Basarili: " Türkçe karaktersiz; ✓ emoji ile "Basarili: ...✓" çift onay. |
| 18 | Cevap değişince eski gate oturumlarının düşmesi | BOZUK | `proxy.ts:82`, `lib/admin-gate-edge.ts:14-22`, `lib/admin-gate.ts:55` | `verifyGateCookie` üretimde hiç çağrılmıyor; proxy imza kontrol etmediği için eski cookie'ler geçerli kalıyor. |
| 19 | Kapının API uçlarını koruması | BOZUK | `proxy.ts:105-119` | `/api/*` istekleri `authMiddleware`'e hiç girmiyor; tüm `/api/admin/*` uçları yalnız rol kontrolüyle açık. |
| 20 | Gizli cevabın sızmaması | BOZUK | `route.ts:19-27` | GET cevabı döndürüyor ve kapıyı geçmemiş ADMIN de çağırabiliyor (bkz. B1). |
| 21 | Eşzamanlı düzenleme koruması (versiyon/ETag) | EKSİK | `route.ts:43-48` | Son yazan kazanır; `updatedAt` kontrolü yok. |
| 22 | Kimlik yeniden doğrulama (step-up) / onay adımı | EKSİK | `page.tsx:121` | Kritik güvenlik ayarı tek tıkla değişiyor. |
| 23 | Başarısız deneme görünürlüğü / kilitleme ayarı | EKSİK | `app/api/admin/gate/route.ts:46-64` | Yanlış denemeler loglanmıyor, alarm yok; bu sayfada ilgili hiçbir panel yok. |
| 24 | Değişiklik geçmişi (audit görünümü) | EKSİK | — | `UPDATE_ADMIN_GATE` yalnız yazılıyor; bu sayfada son değiştiren/zaman gösterilmiyor. |
| 25 | Sayfa başlığı (metadata) | EKSİK | `page.tsx:1` (`'use client'`, metadata yok) | Sekmede yalnız layout varsayılanı ("Admin") görünür. |
| 26 | Sidebar girişi + i18n etiket | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:212`, `messages/tr.json:2515` | Sayfa içi metinler ise i18n'siz, sabit Türkçe. |

Toplam: 26 özellik — ÇALIŞIYOR 10, KISMİ 7, BOZUK 3 (+1 ölü kod), SAHTE 0, EKSİK 7 (ölü kod satırı "bozuk" sayıldı → bozuk 4).

---

## Bulgular

### B1 — KRİTİK · Güvenlik · Gizli cevap, kapıyı geçmemiş her ADMIN'e API'den düz metin olarak veriliyor
- **Kanıt:** `app/api/admin/settings/admin-gate/route.ts:19-27` (GET `answer` döndürür, yalnız `requireAuth(['ADMIN'])`); `proxy.ts:105-119` (`/api/` yolları `authMiddleware`'e hiç girmeden `NextResponse.next()` ile geçer); `proxy.ts:79` gate kontrolü yalnız `pathname.startsWith('/admin')` (`/api/admin` bununla eşleşmez).
- **Sorun:** Kapının tehdit modeli "rolü yanlışlıkla ADMIN yapılan kişi gizli rakamı bilmeden giremez". Bu kişi `/admin-gate` ekranındayken tarayıcı konsolundan `fetch('/api/admin/settings/admin-gate').then(r=>r.json())` çağırdığında cevabı alır. Aynı yolla `PUT` ile cevabı kendisi belirleyebilir ve diğer adminleri kilitleyebilir. Route yorumundaki "admin zaten paneldeyse gate'i geçmiştir" varsayımı (`route.ts:16-17`) yanlış.
- **Öneri:** (1) Cevap asla istemciye dönmemeli: GET yalnız `question`, `hasCustomAnswer`, `updatedAt`, `updatedBy` döndürsün; ayar ekranında cevap "yeni cevap belirle" alanı olarak write-only olsun. (2) Ortak bir `requireAdminGate(session, request)` yardımcı fonksiyonu yazılsın (Node runtime, `verifyGateCookie` ile HMAC doğrulamalı) ve `requireAuth(['ADMIN'])` içine opsiyonel değil varsayılan olarak eklensin; muafiyet yalnız `/api/admin/gate` için. (3) Saklama: cevabı düz metin değil `HMAC(secret, answer)` veya scrypt hash olarak tut.
- **Efor:** M

### B2 — KRİTİK · Güvenlik · Gate cookie'si sahtelenebilir; proxy HMAC doğrulamıyor
- **Kanıt:** `lib/admin-gate-edge.ts:14-22` yalnız `userId.` öneki + 64 hex karakter biçimini kontrol eder; `proxy.ts:82` bunu kullanır; `verifyGateCookie` (`lib/admin-gate.ts:55-62`) üretim kodunda hiç çağrılmıyor (yalnız `__tests__/lib/admin-gate.test.ts:36-52`). Kullanıcının kendi id'si oturumda açık (`lib/auth.ts:287`, `/api/auth/session`).
- **Sorun:** ADMIN rolündeki kullanıcı DevTools'ta `admin_gate=<kendi-id>.<herhangi 64 hex>` cookie'si oluşturarak kapıyı tamamen atlar. `admin-gate-edge.ts:10-11`'deki "cookie'yi elde etmenin TEK yolu doğru cevabı vermek" iddiası yanlış; istemci aynı isimli cookie'yi kendi yazabilir. Testler HMAC'in güvenli olduğunu doğruluyor ama o kod yolu üretimde yok: sahte güven.
- **Öneri:** Edge runtime'da senkron node `crypto` gerekmez; Web Crypto `crypto.subtle.importKey` + `crypto.subtle.verify('HMAC', ...)` proxy'de async olarak çalışır. Cookie'ye `exp` ve gate "epoch/version" alanı eklensin (`userId.epoch.exp.sig`), proxy imzayı + süreyi doğrulasın. Böylece cevap değişimi veya "tüm admin oturumlarını düşür" düğmesi epoch'u artırarak anında etkili olur. Test, proxy'nin sahte imzayı reddettiğini doğrulayacak şekilde güncellenmeli.
- **Efor:** M

### B3 — YÜKSEK · Veri/doğruluk · "Cevap değişince herkes yeniden sorulur" vaadi kodda gerçekleşmiyor
- **Kanıt:** UI metni `page.tsx:81,59`; route yorumu `route.ts:31-32` ("tüm eski gate cookie'leri geçersizleşir"); gerçekte proxy imzayı/cevabı hiç kontrol etmiyor (`lib/admin-gate-edge.ts:21`). Cookie oturum cookie'si (`app/api/admin/gate/route.ts:68-74`), `maxAge` yok; Chrome "kaldığın yerden devam et" ayarında oturum cookie'leri tarayıcı kapanınca da silinmez.
- **Sorun:** Bir sızıntı şüphesinde admin cevabı değiştirir ve risk kapandı sanır; oysa kapıyı geçmiş (veya cookie sahtelemiş) herkes içeride kalır. Operatöre yanlış güvence veren bir güvenlik ayarı, hiç olmamasından daha tehlikelidir.
- **Öneri:** B2'deki epoch modeli + sayfada "Tüm admin kapı oturumlarını sonlandır" aksiyonu; cookie'ye kesin `maxAge` (ör. 12 saat). UI metni yalnız kod gerçekten bunu yaptıktan sonra bu vaadi vermeli.
- **Efor:** S (B2 ile birlikte)

### B4 — YÜKSEK · Güvenlik · Tek rakamlı cevap + 8/dk limit = en fazla ~2 dakikada kaba kuvvet
- **Kanıt:** `app/api/admin/gate/route.ts:47` (`checkRateLimitDb('admin-gate:userId', 8, 60_000)`), cevap uzayı 10 (`lib/admin-gate.ts:35`). Yanlış denemeler loglanmıyor/alarm üretmiyor (`gate/route.ts:59-64`).
- **Sorun:** Tasarım gereği "eğlenceli" bir katman olsa da sayfa bunu "Sadece bilenler girer" (`page.tsx:72`) diye güvenlik kontrolü olarak sunuyor. 10 olasılığı 8/dk ile denemek iki pencerede biter; bu sırada hiçbir iz kalmaz.
- **Öneri:** Bu sayfaya "Kilitleme politikası" bölümü: toplam başarısız deneme eşiği (ör. 3) sonrası 1 saat kilit + diğer adminlere bildirim (mevcut push/bildirim merkezine bağlanarak) + `ADMIN_GATE_FAILED` audit kaydı. Gerçek güvenlik isteniyorsa kapı TOTP/WebAuthn step-up ile değiştirilmeli; eğlenceli soru ekranı onun önüne "kostüm" olarak kalabilir.
- **Efor:** M

### B5 — YÜKSEK · Güvenlik/veri · Geçersiz girdi sessizce herkesin bildiği varsayılan "7"ye düşüyor
- **Kanıt:** `route.ts:41` → `lib/admin-gate.ts:33-35` (geçersiz → `DEFAULT_ADMIN_GATE.answer = '7'`, `lib/admin-gate.ts:18-21`). Ayar satırı yoksa/bozuksa da cevap `'7'` (`route.ts:22-25`, `.catch(() => null)`).
- **Sorun:** `PUT {answer:"42"}` gibi bir istek 200 dönüp cevabı kaynak kodda sabit olan "7"ye çeker. DB okuma hatası da sessizce varsayılana düşer (fail-open). Güvenlik ayarında "bozuksa bilinen değere düş" yanlış yön; doğru davranış reddetmek/fail-closed.
- **Öneri:** PUT'ta zod şeması ile 400 dön (`{ error, field }`); `normalizeAdminGate` yalnız okuma tarafında kalsın. Okuma hatasında gate POST 503 dönsün (fail-closed). Varsayılan cevap ilk kurulumda ortam değişkeninden gelsin, kaynakta sabit olmasın.
- **Efor:** S

### B6 — ORTA · UX/Güvenlik · Cevap ekranda maskesiz, onay ve yeniden doğrulama yok
- **Kanıt:** `page.tsx:103-110` (düz metin, `text-2xl font-bold`), `page.tsx:121` (tek tık kaydet).
- **Sorun:** Ekran paylaşımı/omuz üstünden bakma ile cevap sızar. Kritik güvenlik ayarı, mevcut cevabı veya parolayı sormadan değişebiliyor; oturumu açık bırakılmış bir bilgisayarda herkes değiştirebilir.
- **Öneri:** Cevap alanı write-only "Yeni cevap" + "Yeni cevabı tekrar gir" çifti (maskeli, `autoComplete="off"`); kaydetmeden önce onay diyaloğu: "Bu işlem tüm admin kapı oturumlarını sonlandırır" + mevcut parola ile step-up (settings sayfasındaki parola değiştirme ucu benzeri doğrulama, `app/admin/settings/settings-client.tsx:400-420`).
- **Efor:** S

### B7 — ORTA · Hata yönetimi · Yükleme hatası sonrası form boş açılıyor ve kaydedilebiliyor
- **Kanıt:** `page.tsx:33-37` (hata → yalnız toast, `loading=false`), `page.tsx:42` (`initialSig=''` iken her durum "dirty"), `lib/admin-gate.ts:32` (boş soru → varsayılan).
- **Sorun:** GET başarısız olursa (ör. geçici 500, token-replay 403) kullanıcı boş form görür; bir rakam girip kaydederse mevcut özel soru sessizce varsayılan soruya döner. Ayrıca yanıt JSON değilse `res.json()` "Unexpected token" mesajı toast'a düşer.
- **Öneri:** Üç durumlu veri modeli (`loading | error | ready`); `error`'da formu gizleyip "Yeniden dene" düğmeli hata kartı göster. Boş soruyu istemcide engelle (`question.trim().length >= 5`). Fetch için ortak `fetchJson` yardımcısı (içerik türü kontrolü + anlamlı mesaj).
- **Efor:** S

### B8 — ORTA · Erişilebilirlik · Etiketler input'a bağlı değil, hata mesajı programatik değil, form semantiği yok
- **Kanıt:** `page.tsx:92,102` (`<Label>` `htmlFor` yok, input'larda `id` yok); `page.tsx:111` (`aria-invalid`/`aria-describedby` yok); kök öğe `<div>`, `<form onSubmit>` yok; iskelette `aria-busy` yok (`page.tsx:87`).
- **Sorun:** Ekran okuyucu input'ları isimsiz okur; Enter ile kaydetme çalışmaz; yükleme durumu duyurulmaz. Ayrıca B'deki hata mesajı ölü kod olduğundan hiç gösterilmiyor (`page.tsx:107` filtre → `answerValid` her zaman true ya da boş).
- **Öneri:** `<form onSubmit>` + `id`/`htmlFor` eşleşmesi + `aria-describedby` ile yardım/hata metni bağlama; ölü hata dalını kaldırıp yerine "boş bırakılamaz" doğrulamasını koy; iskelete `role="status" aria-busy="true"`.
- **Efor:** S

### B9 — DÜŞÜK · Tutarlılık · Toast önekleri Türkçe karaktersiz ve emoji/önek tekrarı
- **Kanıt:** `lib/admin-toast.ts:17,19` (`'Basarili: '`), `page.tsx:59` ("... güncellendi ✓ (...)").
- **Sorun:** "Basarili: Gizli kapı güncellendi ✓" hem dil hatası hem çift onay işareti. Bu tüm admin panelini etkileyen ortak bir yardımcı.
- **Öneri:** Önekleri "Başarılı: "/"Dikkat: " olarak düzelt (veya tamamen kaldır; sonner zaten ikonla tür belirtiyor), mesajlardaki emoji/✓'yi temizle, metinleri `messages/tr.json`'a taşı.
- **Efor:** S

### B10 — DÜŞÜK · Mimari · Eşzamanlı düzenleme ve audit içeriği eksik
- **Kanıt:** `route.ts:43-48` (önce `findUnique`, sonra `upsert`, transaction/version yok); `route.ts:57-58` (yalnız soru loglanıyor).
- **Sorun:** İki admin aynı anda düzenlerse son yazan kazanır, ilki habersiz kalır. Audit'te "cevap değişti mi" bilgisi yok; olay incelemesinde cevabın ne zaman döndürüldüğü bilinemez.
- **Öneri:** İstemci `updatedAt`'i `If-Match` benzeri gönderir, uyuşmazlıkta 409; audit'e `answerChanged: boolean` ve `answerFingerprint` (ilk 6 karakter HMAC) ekle — cevabı açığa çıkarmadan değişimi izlenebilir kılar.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Step-up kimlik doğrulama:** Stripe/Linear güvenlik ayarlarını değiştirmeden önce parola/2FA ister; burada yok.
2. **Oturum yönetimi:** "Kapıyı geçmiş aktif admin oturumları" listesi (kullanıcı, IP, son görülme) + tek tek / toplu sonlandırma (Stripe "Active sessions", PostHog "Sessions").
3. **Başarısız deneme akışı ve alarm:** Son 7 günün `gate.failed` olayları, kilitlenen kullanıcılar, kilidi kaldırma; diğer adminlere bildirim.
4. **Politika ayarları:** Deneme eşiği, kilit süresi, cookie ömrü, IP allowlist (Retool/Cloudflare Access benzeri).
5. **Değişiklik geçmişi paneli:** Kim, ne zaman, hangi IP'den değiştirdi; audit sayfasına derin bağlantı (`/admin/audit?action=UPDATE_ADMIN_GATE`).
6. **Gerçek ikinci faktör seçeneği:** TOTP/WebAuthn (passkey) zorunluluğu; mevcut soru ekranı onun görsel kabuğu olarak kalabilir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Gizli Kapı" eğlenceli kimliğini korusun ama ekran, bir operatörün 10 saniyede "panele kim girebiliyor, kim denedi, risk var mı" sorusunu yanıtladığı bir **Admin Erişim Güvenliği** ekranı olsun.

**Yerleşim (masaüstü iki kolon, mobilde tek kolon akış):**
1. **Durum şeridi (üst):** Kapı durumu (Etkin / Varsayılan cevap kullanılıyor uyarısı), son değişiklik (kişi + göreli zaman), aktif kapı oturumu sayısı, son 24 saatte başarısız deneme sayısı. Varsayılan cevap hâlâ kullanılıyorsa kırmızı uyarı bandı.
2. **Sol kolon: Soru ve cevap:** Soru alanı (karakter sayacı), write-only "Yeni cevap" + tekrar alanı (maskeli), "Kaydet" → onay diyaloğu (etkileri listeler) → parola ile step-up.
3. **Sağ kolon: Gerçek önizleme:** `app/admin-gate/page.tsx` ekranının küçültülmüş, etkileşimsiz bir örneği (aynı portal bileşeni, prop ile `preview` modu); "Tam ekran önizle" düğmesi. Bu, iki ekranın görsel olarak ayrışmasını önler.
4. **Alt bölüm sekmeleri:** "Oturumlar" (liste + sonlandır), "Denemeler" (zaman çizelgesi, kullanıcı, IP, sonuç), "Politika" (eşik, kilit süresi, cookie ömrü).

**Motion/3D:** Ayar ekranında 3D gereksiz. Ölçülü öneriler: kaydetme sonrası durum şeridindeki "epoch" rozetinin kısa bir `layout` geçişiyle güncellenmesi; önizleme kartında portal halkasının yalnız hover'da dönmesi; `useReducedMotion` ile hepsi kapatılabilir. Yıldız alanı canvas'ı önizlemede çalıştırılmamalı (gereksiz rAF).

**Veri/API değişiklikleri:**
- `GET /api/admin/settings/admin-gate` → `{ question, isDefaultAnswer, updatedAt, updatedBy, epoch, policy }` (cevap YOK).
- `PUT` → zod doğrulama, `ifUpdatedAt` ile 409, step-up token zorunlu, cevabı hash'leyerek sakla, `epoch++`.
- `POST /api/admin/settings/admin-gate/revoke` → epoch artır (tüm oturumları düşür).
- `GET /api/admin/settings/admin-gate/attempts` → `AuditLog` üzerinden `ADMIN_GATE_FAILED/PASSED` olayları (sayfalı).
- Proxy: Web Crypto ile HMAC + `exp` + `epoch` doğrulaması; epoch değeri Upstash Redis'te sıcak katman (DB kaynak doğruluk), mevcut token-replay deseniyle aynı.
- `requireAuth` içine ADMIN için gate doğrulaması (muafiyet listesi: `/api/admin/gate`), böylece kapı UI ve API'de aynı kuralı uygular.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/settings`** (`app/admin/settings/settings-client.tsx:250-420`) zaten bir "Güvenlik" (parola değiştirme) bölümü barındırıyor; **`/admin/audit`** ve **`/admin/trust-command`** güvenlik/izleme tarafını kapsıyor. Gizli kapı ayarı sidebar'da oyunlaştırma ayarları arasında (`sidebar.tsx:209-215`, karakter eşikleri ile stajyer mailleri arasında) duruyor; bu yanlış bir bilgi mimarisi konumu.
- **Öneri:** Sayfa ayrı bir rota olarak kalabilir ama "Ayarlar → Güvenlik → Admin erişimi" altında gruplanmalı (sidebar'da güvenlik grubu: Gizli Kapı, API anahtarları, Audit, Uyumluluk). Değişiklik geçmişi için `/admin/audit`'e filtreli derin bağlantı verilmeli; ayrı bir log görünümü yazılmamalı.
- `/admin-gate` (giriş ekranı) ile bu sayfa aynı portal görsel bileşenini paylaşmalı (bkz. önizleme); şu an ikisi bağımsız kopyalar.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod değiştirilmedi, veritabanına/sunucuya dokunulmadı. Okunan dosyalar: `proxy.ts`, `lib/admin-gate-edge.ts`, `lib/admin-gate.ts`, `lib/api-auth.ts`, `lib/auth.ts`, `lib/rate-limit.ts`, `app/api/admin/settings/admin-gate/route.ts`, `app/api/admin/gate/route.ts`, `app/admin/gate-settings/page.tsx`. Projede ayrı bir `middleware.ts` yok; tek kesişim katmanı `proxy.ts`.

### 1. Admin gate cevabı API'den kapıyı geçmemiş ADMIN'e sızıyor (PUT ile de değiştirilebiliyor) — **DOĞRULANDI**

- `proxy.ts:105-119`: `/api/` ile başlayan her istek `authMiddleware`'e hiç girmeden `NextResponse.next()` ile geçiyor. Gate cookie kontrolü yalnız `authMiddleware` içinde ve yalnız `pathname.startsWith('/admin')` için (`proxy.ts:79`); `/api/admin/...` bu önekle başlamadığı için zaten kapsam dışı.
- `lib/api-auth.ts:52-80` `requireAuth` yalnız oturum + rol + token-replay kontrol ediyor; gate cookie'ye hiç bakmıyor. `admin_gate` cookie'sine başvuran tek üretim kodu `proxy.ts` ve `app/api/admin/gate/route.ts` (cookie set eden uç).
- `app/api/admin/settings/admin-gate/route.ts:19-26` GET cevabı düz metin döndürüyor; `:34-63` PUT yalnız `requireAuth(['ADMIN'])` ile korunuyor.
- **Yeniden üretim:** Rolü ADMIN yapılmış ama rakamı bilmeyen kullanıcı giriş yapar, `/admin`'e gidince `/admin-gate`'e yönlenir. Aynı sekmenin konsolunda `await (await fetch('/api/admin/settings/admin-gate')).json()` çalıştırır, `answer` alanını okur ve kapıyı geçer. Ya da `fetch('/api/admin/settings/admin-gate',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'x',answer:'3'})})` ile cevabı değiştirir; gerçek adminler bir sonraki oturumda yeni cevabı bilmedikleri için panele giremez (audit kaydına yalnız soru yazılıyor, `route.ts:56-58`).
- **Not:** Daha geniş sonuç da doğru: kapıyı geçmemiş ADMIN, `requireAuth(['ADMIN'])` kullanan tüm `/api/admin/*` uçlarını doğrudan çağırabiliyor. Yani kapı bugün yalnız arayüz katmanında bir engel; dosya başındaki "stajyer bile giremez" tehdit modelini API tarafında karşılamıyor.

### 2. Gate cookie HMAC doğrulanmıyor; DevTools ile sahte cookie kapıyı atlatıyor — **DOĞRULANDI**

- `lib/admin-gate-edge.ts:14-22` `gateCookieBelongsTo` yalnız `<userId>.<64 hex>` biçimini ve userId eşleşmesini kontrol ediyor. İmza doğrulaması yok; dosyanın kendi yorumu da bunu söylüyor (`:10-11`). Dayanak olarak "cookie'yi elde etmenin tek yolu doğru cevap" varsayımı gösteriliyor ama bu varsayım yanlış: biçimi tutan rastgele bir değer de kabul ediliyor.
- `lib/admin-gate.ts:55` `verifyGateCookie` üretim kodunda hiçbir yerde çağrılmıyor (grep sonucunda yalnız `__tests__/lib/admin-gate.test.ts`).
- userId kullanıcıya açık: `lib/auth.ts:287` `session.user.id = token.id`, bu değer `/api/auth/session` yanıtında dönüyor. Proxy `token.sub || token.id` kullanıyor (`proxy.ts:80`); credentials akışında ikisi de aynı kullanıcı id'si (`lib/auth.ts:239,259`).
- **Yeniden üretim:** ADMIN rolündeki kullanıcı `/admin-gate` ekranında konsola `const s=await (await fetch('/api/auth/session')).json(); document.cookie='admin_gate='+s.user.id+'.'+'a'.repeat(64)+'; path=/'` yazar. Ortada httpOnly bir `admin_gate` olmadığı için cookie yazılır, `/admin`'e gidince proxy bunu geçerli sayar ve kullanıcı panele girer.
- **Ek sonuç:** HMAC cevaba bağlı olsa da proxy imzayı doğrulamadığı için cevap değiştiğinde eski cookie'ler geçersiz olmuyor. `route.ts:30-32` yorumundaki "tüm eski gate cookie'leri geçersizleşir" iddiası yanlış. Sayfadaki "bir sonraki oturumda yeniden sorulur" metni (`page.tsx:15,81`) teknik olarak doğru, çünkü session cookie tarayıcı kapanınca siliniyor. Ancak tarayıcının "oturumu geri yükle" özelliği session cookie'yi koruyabildiği için açık oturumlar fiilen düşürülemiyor.

### 3. Geçersiz girdi ve DB okuma hatası sessizce kaynakta sabit "7" cevabına düşüyor — **DOĞRULANDI (önem derecesi: orta)**

- **PUT tarafı:** `route.ts:41` → `normalizeAdminGate` (`lib/admin-gate.ts:34-35`) geçersiz cevabı `DEFAULT_ADMIN_GATE.answer = '7'` (`:18-21`) ile değiştiriyor ve 200 dönüyor. `PUT {"question":"x","answer":"42"}` cevabı herkesin bildiği `'7'`ye çekiyor. Hafifletici iki durum var: arayüz bu girdiyi engelliyor (`page.tsx:43,46,107`) ve yanıt gövdesi `answer:'7'` döndürdüğü için çağıran sonucu görebiliyor. Yani bu yol yalnız doğrudan API çağrısıyla tetiklenir ve "sessiz" değil, "yanlış sınıflandırılmış başarı" sayılmalı. Boş/eksik soru da aynı şekilde varsayılan soruya dönüyor; yani kısmi bir güncelleme (yalnız `answer`) soruyu sessizce varsayılana sıfırlıyor.
- **Okuma tarafı (fail-open):** `app/api/admin/gate/route.ts:17-20` `.catch(() => null)` sonrasında `normalizeAdminGate(undefined)` → `'7'`. `POST` önce `checkRateLimitDb` çağırıyor; bu Redis-first çalışıyor (`lib/rate-limit.ts:30-37`), dolayısıyla DB erişilemezken de geçiyor. JWT oturumu DB gerektirmiyor. **Senaryo:** Neon kesintisi ya da zaman aşımı sırasında ADMIN rolündeki kullanıcı kapıya `7` girer, `answer === gate.answer` olur ve geçerli HMAC'li cookie yazılır (`route.ts:58-74`). `'7'` kaynakta sabit; repo erişimi olan herkes biliyor. Ayar ekranı GET'i de (`settings/admin-gate/route.ts:22-25`) DB hatasında gerçek değer yerine `'7'` gösterir; o anda kaydedilirse yanlış değer kalıcılaşabilir.
- **Ölçek notu:** Bulgu 2 varken kapı zaten atlatılabildiği için bu bulgunun bağımsız etkisi şu an sınırlı. Bulgu 1 ve 2 kapatıldıktan sonra ise kapının kalan zayıf noktası budur. Düzeltme yönü: PUT'ta zod ile katı doğrulama ve 400 dönülmesi (varsayılana düşmemeli); okuma hatasında fail-closed (503) çalışılması; varsayılan cevabın kaynak kodundan kaldırılıp ilk kurulumda zorunlu ayarlanması ya da `isDefaultAnswer` uyarısıyla gösterilmesi.

### Özet

| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | API'den cevap sızıntısı + PUT ile kilitleme | Doğrulandı | Kritik (kapının tehdit modeline göre) |
| 2 | Proxy HMAC doğrulamıyor, sahte cookie geçiyor | Doğrulandı | Kritik |
| 3 | Geçersiz girdi / DB hatası → sabit "7" | Doğrulandı | Orta (PUT yolu düşük, okuma fail-open orta) |

Kök neden ortak: kapı kuralı tek bir yetkili noktada uygulanmıyor. Önerilen yapı, gate doğrulamasını (Web Crypto ile HMAC + epoch + exp) hem `proxy.ts`'te hem de `requireAuth` içinde ADMIN için zorunlu kılmak (muafiyet: `/api/admin/gate`), GET yanıtından cevabı tamamen çıkarmak ve cevabı hash'lenmiş olarak saklamaktır (ayrıntılar yukarıdaki "Veri/API değişiklikleri" bölümünde).

---

## Uygulama (Dalga 2)

Kapı güvenliği Dalga 1'de (A2: `lib/admin-gate.ts`, `lib/admin-elevation.ts`, `proxy.ts`, `requireAuth`) gerçek yapıldı: cevap HMAC özetli, imzalı + süreli + oturuma bağlı çerez, `cfgVer` ile toplu sonlandırma, kümülatif kilit (1 sa 3 yanlış → 1 sa; 24 sa 5 yanlış → 24 sa) + bildirim, fail-closed 503. Bu dalgada ekran **Ayarlar kayıt defterine** bağlandı: `/admin/settings?bolum=guvenlik` "Güvenlik ve kapı" bölümü kapı özetini (varsayılan cevap uyarısı, 24 sa yanlış deneme / kilit sayısı, sürüm, son değişiklik — sunucudan; okunamazsa "okunamadı", sıfır değil) gösterir ve bu ekrana bağlanır; durum şeridinde "Gizli kapı" çipi var. Sayfa sunucu bileşeni oldu (`metadata` başlığı), istemci gövdesi `components/admin/a-ayarlar-kapi/gate-settings.tsx`'e taşındı; geri bağlantısı, `/admin/audit?varlik=AdminGate` bağlantısı ve İstanbul saat dilimi eklendi.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Sayfa erişimi (rol + imzalı kapı çerezi) | ÇALIŞIYOR (A2) |
| 2 | Başlık | ÇALIŞIYOR — `PageHeader` + Ayarlar'a geri bağlantı |
| 3 | Bilgi kartı vaadi | ÇALIŞIYOR — vaat artık kodla doğru (`cfgVer`) |
| 4 | GET | ÇALIŞIYOR — cevap/özet dönmez |
| 5 | Yükleniyor | ÇALIŞIYOR — `QueryState` |
| 6 | Yükleme hatası | ÇALIŞIYOR — hata + tekrar dene, form gizli |
| 7 | Soru alanı | ÇALIŞIYOR — sayaç |
| 8 | Boş soru | ÇALIŞIYOR — en az 5 karakter (istemci + zod) |
| 9 | Cevap alanı | ÇALIŞIYOR — mevcut / yeni / tekrar |
| 10 | Maskeleme | ÇALIŞIYOR — `type=password`, yalnız yazılır |
| 11 | Cevap hata mesajı (ölü kod) | ÇALIŞIYOR — eşleşme ve sunucu alan hataları `aria-describedby` ile |
| 12 | Canlı önizleme | ÇALIŞIYOR — statik, hareketsiz küçük kopya (rAF yok); portal bileşeni paylaşımı kalan |
| 13 | Kirli durum | ÇALIŞIYOR |
| 14 | Kaydet | ÇALIŞIYOR — `<form>` + Enter |
| 15 | Sunucu doğrulaması | ÇALIŞIYOR — zod 400, varsayılana düşme yok |
| 16 | Denetim | ÇALIŞIYOR — `answerChanged` + parmak izi |
| 17 | Toast'lar | ÇALIŞIYOR — Türkçe karakterli, öneksiz (bu sayfa `admin-toast` kullanmıyor) |
| 18 | Cevap değişince oturumların düşmesi | ÇALIŞIYOR |
| 19 | API koruması | ÇALIŞIYOR |
| 20 | Cevap sızmaması | ÇALIŞIYOR |
| 21 | Eşzamanlılık | ÇALIŞIYOR — `expectedCfgVer` 409 |
| 22 | Step-up / onay | ÇALIŞIYOR — mevcut cevap + etki önizlemeli onay |
| 23 | Başarısız deneme / kilit | ÇALIŞIYOR — kilitli hesaplar + kilit kaldırma |
| 24 | Değişiklik geçmişi | ÇALIŞIYOR — son 25 olay + denetim merkezi derin bağlantısı |
| 25 | Metadata | ÇALIŞIYOR — sunucu `metadata` |
| 26 | Sidebar | ÇALIŞIYOR (navigasyon ajanı) |

### Kapanan bulgular
B1–B8 ve B10 kapandı (A2 + bu dalga). **B9** (ortak `lib/admin-toast` öneki) bu sayfada geçersiz; ortak yardımcı sahiplik dışı.

### Kalanlar
- Gerçek ikinci faktör (TOTP/passkey step-up): F1.2 yol haritası.
- Kilit politikası sabit (`GATE_LOCK_POLICY`); düzenlenebilir politika ve IP izin listesi yok (ürün kararı).
- Önizleme, `app/admin-gate` ile aynı portal bileşenini paylaşmıyor (kapı ekranı sahiplik dışı).
