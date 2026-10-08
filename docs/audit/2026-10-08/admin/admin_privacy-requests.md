# /admin/privacy-requests

**Amaç** · KVKK m.11 / GDPR kapsamındaki veri sahibi taleplerini (erişim, silme, düzeltme) tek bir kuyrukta görmek ve yürütmek: talebi incelemeye almak, erişim talebinde kullanıcının veri paketini JSON olarak indirmek, silme talebinde kullanıcıyı geri döndürülemez biçimde anonimleştirmek, talebi tamamlamak ya da reddetmek.

**Genel puan: 4.5/10** · **Karar: yeniden tasarla** (ve `/admin/compliance` içindeki kopya KVKK kuyruğu bu sayfaya taşınarak kaldırılmalı)

Sayfa küçük ve okunaklı. Yürütme motoru (`lib/gdpr-core.ts`) gerçekten var, sayfa yalnızca durum etiketi değiştirmiyor. Ancak hukuki sonucu olan bir iş akışı için ciddi açıklar var. Anonimleştirme oturumu kapatmıyor. Silme talebi yürütülmeden "Tamamlandı" yapılabiliyor ve bunun ardından UI'dan bir daha yürütülemiyor. Sayfadaki "Tüm işlemler denetim günlüğüne yazılır" vaadi doğru değil. Kuyruğu besleyen müşteri tarafında hiçbir arayüz yok. Self-servis silme ve dışa aktarma ise bu kuyruğun tamamen dışında, ayrı bir yoldan çalışıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Export ve anonimleştirme gerçekten çalışıyor. Buna karşın JWT iptal edilmiyor, PII kapsamı eksik, silme talebi yürütülmeden kapatılabiliyor ve kuyruğu besleyen bir giriş noktası yok. |
| UX | 4/10 | Düz bir liste var. Filtre, arama, SLA sayacı, detay görünümü, ret gerekçesi ve yenileme yok. Kritik eylem bir tarayıcı `confirm()` penceresine bırakılmış ve eylemlerin anlamı belirsiz ("Tamamlandı" ile "Anonimleştir"). |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ve shadcn `Card` ile tutarlı. Ancak her talep aynı ağırlıkta gösteriliyor; acil, geciken ve kapanmış talepler arasında görsel hiyerarşi yok. |
| Mimari | 3/10 | İki ayrı export ve iki ayrı silme uygulaması var. Admin eylemlerinde aktör kaydı tutulmuyor. Talep türü sunucuda doğrulanmıyor. Anonimleştirme ile talep güncellemesi aynı transaction içinde değil. Aynı API'yi iki sayfa farklı kurallarla tüketiyor. |
| Performans | 7/10 | Tek sorgu, `take: 100` ve `select` ile dar alan seçimi kullanılıyor; N+1 yok. Export en fazla yaklaşık 9 bin satırı tek JSON yanıtında döndürüyor, bu ölçekte kabul edilebilir. |
| Erişilebilirlik + Mobil | 5/10 | `flex-wrap` sayesinde dar ekranda bozulmuyor. Ancak `p-6` layout dolgusuyla üst üste biniyor, `aria-live`/`aria-busy` yok ve onay için erişilebilir bir dialog yerine `window.confirm` kullanılıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık ve açıklama | ÇALIŞIYOR | `app/admin/privacy-requests/page.tsx:124-128` | Ortak `AdminPremiumHero`, `useReducedMotion` destekli (`components/admin/admin-premium-hero.tsx:9,36`). |
| 2 | Kart açıklamasındaki "Tüm işlemler denetim günlüğüne yazılır" vaadi | SAHTE | `page.tsx:133-134` ile `app/api/admin/privacy-requests/[id]/route.ts:35-46` ve `:85-91` | PATCH ve export hiç `auditLog` yazmıyor. Yalnızca anonimleştirme yazıyor, o da admin aktörü olmadan (`lib/gdpr-core.ts:162-170`). |
| 3 | Talep listesini yükleme (GET) | ÇALIŞIYOR | `page.tsx:50-61`, `app/api/admin/privacy-requests/route.ts:12-28` | En yeni 100 kayıt döner, sayfalama yok. |
| 4 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:138-143` | 3 adet `animate-pulse` blok. |
| 5 | Boş durum | KISMİ | `page.tsx:144-145` | "Bekleyen talep yok" metni yanlış: liste tamamlanmış ve reddedilmiş talepleri de içeriyor. Hata durumu da bu metne düşüyor (#6). |
| 6 | Hata durumu | BOZUK | `page.tsx:52-55` | `r.ok` kontrol edilmiyor. 401/403/500 yanıtında `{error}` geliyor, `d.requests` dizi olmadığı için liste `[]` oluyor ve "Bekleyen talep yok" gösteriliyor. Gerçek hata gizleniyor. `catch` yalnızca ağ veya JSON parse hatasında çalışıyor. |
| 7 | Talep türü etiketi | ÇALIŞIYOR | `page.tsx:25-29,153` | DB alanı `String` (`prisma/schema.prisma:2809`); bilinmeyen bir değer `undefined` olarak görünür. |
| 8 | Durum rozeti (renk ve metin) | ÇALIŞIYOR | `page.tsx:31-43,154-156` | Bilgi yalnızca renkle değil, metinle de veriliyor. |
| 9 | "Makbuz gönderildi" işareti | ÇALIŞIYOR | `page.tsx:157-161` | Gönderim zamanı gösterilmiyor; gönderilmediyse bir uyarı da çıkmıyor. |
| 10 | E-posta ve oluşturulma tarihi | KISMİ | `page.tsx:163-164`, `app/api/customer/privacy-request/route.ts:14,34` | E-posta başvuranın serbestçe girdiği bir değer ve doğrulanmıyor. Admin, eylemin hesabı olan `userId` ile eşleşmeyen bir e-posta görebilir. |
| 11 | "İşlendi" tarihi | KISMİ | `page.tsx:165,74` | `setStatus` iyimser güncellemesi `processedAt` alanını yerelde güncellemiyor; tarih ancak sayfa yenilenince görünüyor. |
| 12 | Başvuru mesajı | ÇALIŞIYOR | `page.tsx:167-169` | `whitespace-pre-wrap` ile React tarafından kaçışlanıyor, XSS yok. |
| 13 | "İncelemeye al" | KISMİ | `page.tsx:172-176`, `[id]/route.ts:39-43` | Reddedilmiş talebi de yeniden açıyor ama `processedAt` temizlenmiyor (`undefined` olduğu için eski değer kalıyor). Durum makinesi yok. |
| 14 | "Veri paketi" (export) | KISMİ | `page.tsx:80-98,177-182`, `[id]/route.ts:85-91`, `lib/gdpr-core.ts:21-104` | Çalışıyor. Ancak denetim kaydı yok, kapsam eksik (ödüller, analitik, sohbet logları, bağış ve push yok) ve "düzeltme" talebinde yanlış eylem olarak sunuluyor. |
| 15 | "Anonimleştir" | KISMİ | `page.tsx:100-120,183-194`, `lib/gdpr-core.ts:116-173` | PII alanları maskeleniyor. Ancak JWT oturumu iptal edilmiyor (bulgu 1), PII kapsamı eksik (bulgu 5) ve admin aktörü kaydedilmiyor. |
| 16 | Anonimleştirme onayı | KISMİ | `page.tsx:101-107` | Yalnızca `window.confirm` kullanılıyor. Hedef kullanıcı adı veya e-postası gösterilmiyor, yazarak onay ya da yeniden kimlik doğrulama yok. |
| 17 | "Reddet" | KISMİ | `page.tsx:195-199` | Onay yok, ret gerekçesi alınmıyor ve başvurana bildirim gitmiyor. KVKK m.13 kapsamında ret gerekçeli ve yazılı olmalı. |
| 18 | "Tamamlandı" | BOZUK | `page.tsx:200-204` ile `:183` | Silme talebi yürütülmeden "completed" yapılabiliyor. Ardından "Anonimleştir" butonu gizleniyor (`r.status !== 'completed'`) ve "İncelemeye al" da görünmüyor (`:172`). Talep UI'dan bir daha yürütülemiyor. |
| 19 | Satır bazlı meşgul kilidi | KISMİ | `page.tsx:48,173,178-179,188-191` | Tek `busy` id var. Hangi eylem çalışırsa çalışsın aynı satırdaki iki butonda birden spinner dönüyor. |
| 20 | Toast bildirimleri | KISMİ | `lib/admin-toast.ts:17,19` | "Basarili: " ve "Dikkat: " önekleri Türkçe karakter içermiyor. Sunucu hata metni doğrudan kullanıcıya gösteriliyor. |
| 21 | Yetki: API'de ADMIN rolü | ÇALIŞIYOR | `route.ts:9`, `[id]/route.ts:18,61` | Kaba taneli: her ADMIN herkesin tam veri paketini indirebiliyor. Yetki kapsamı (DPO/hukuk rolü) yok. |
| 22 | Sunucu tarafında "eylem ile talep türü" eşleşmesi | EKSİK | `[id]/route.ts:73-95` | `anonymize` eylemi `type === 'deletion'` kontrolü yapmıyor. Bir erişim talebi üzerinden doğrudan API çağrısıyla hesap geri döndürülemez biçimde anonimleştirilebilir. |
| 23 | Anonimleştirme ile talep kapanışının atomikliği | KISMİ | `[id]/route.ts:95-99`, `lib/gdpr-core.ts:122-170` | `anonymizeUser` transaction'ı ve audit kaydı ayrı, talep güncellemesi de ayrı. Aradaki bir hata durumunda kullanıcı anonimleşir ama talep açık kalır. |
| 24 | Kuyruğu besleyen müşteri arayüzü | EKSİK | `app/api/customer/privacy-request/route.ts` (çağıran yok) | Repoda `/api/customer/privacy-request` için hiçbir `fetch` yok. Tek referans `/admin/compliance` sayfasındaki açıklama metni (`app/admin/compliance/page.tsx:271`). Kuyruk yalnızca elle yapılan API çağrılarıyla dolabiliyor. |
| 25 | Self-servis silme ve export'un kuyruğa düşmesi | EKSİK | `components/settings/privacy-security.tsx:108-140`, `app/api/user/delete-account/route.ts:32-39` | Kullanıcı ayarlardan hesabını sert-siliyor (`user.delete`). DSR kaydı ve audit oluşmuyor; admin bu sayfada hiçbir şey görmüyor. |
| 26 | Filtre, arama ve sıralama | EKSİK | `page.tsx:147-209` | Tür, durum, tarih ve e-posta araması yok. |
| 27 | Sayfalama | EKSİK | `route.ts:14` | Sabit `take: 100`. Daha eski talepler görünmez oluyor; arşiv yok. |
| 28 | Yasal süre (30 gün) ve SLA göstergesi | EKSİK | – | KVKK m.13 en geç 30 gün içinde cevap istiyor. Kalan süre ya da gecikme uyarısı yok. |
| 29 | Kimlik doğrulama adımı | EKSİK | – | Başvuranın e-postası ile hesap e-postası karşılaştırılmıyor; doğrulama durumu da yok. |
| 30 | Başvurana sonuç bildirimi | EKSİK | – | Yalnızca alındı makbuzu gidiyor (`lib/email.ts:54-84`). Tamamlanma, ret ya da veri paketi teslimi için bildirim yok. |
| 31 | Talep detayı ve zaman çizelgesi | EKSİK | – | Kim, ne zaman, hangi eylemi yaptı bilgisi görünmüyor; bu veri zaten kaydedilmiyor. |
| 32 | Yenile butonu | EKSİK | `page.tsx:129-136` | Kopya kuyrukta bu buton var (`app/admin/compliance/page.tsx:264-266`), asıl sayfada yok. |
| 33 | Mobil düzen | KISMİ | `page.tsx:123,150,171`, `app/admin/layout.tsx:33,38` | `flex-wrap` sayesinde satır kırılıyor. Ancak `p-6`, layout dolgusuyla üst üste biniyor; dar ekranda 5 buton yığılıyor. |
| 34 | Erişilebilirlik | KISMİ | `page.tsx:141,173-203` | Butonlarda metin etiketi var. Ancak yükleme için `aria-busy` / `aria-live` yok, iskelet `aria-hidden` değil ve onay için erişilebilir dialog yerine `confirm` kullanılıyor. |
| 35 | Azaltılmış hareket | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:36-43` | Hero `useReducedMotion` ve `motion-reduce` kullanıyor. Sayfada başka animasyon yok. |
| 36 | Sayfa `<title>` / metadata | EKSİK | `page.tsx:1` | Tamamı `'use client'`. Sekme başlığı yalnızca layout'taki varsayılan "Admin" olarak kalıyor. |

**Sayım:** 36 özellik. 9 ÇALIŞIYOR, 13 KISMİ, 2 BOZUK, 1 SAHTE, 11 EKSİK.

---

## Bulgular (önem sırasıyla)

### 1. Anonimleştirme oturumu kapatmıyor: JWT stratejisinde `session.deleteMany` etkisiz
- **Önem:** kritik · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** M
- **Kanıt:** `lib/auth.ts:61` (`strategy: 'jwt'`), `lib/gdpr-core.ts:154-157` (`tx.session.deleteMany`), `lib/api-auth.ts:52-80` (yalnızca rol ve token-replay kontrolü var), `lib/token-replay.ts:51-76` (jti iptal listesi yok).
- **Sorun:** NextAuth JWT stratejisinde `Session` tablosu kullanılmaz; silinen satırlar zaten boştur. Anonimleştirilen kullanıcının tarayıcısındaki JWT, `maxAge` dolana kadar geçerli kalır. `requireAuth` her istekte yalnızca rolü ve jti/IP/UA eşleşmesini kontrol ediyor. Sonuç olarak "silinmiş" kişi oturumunu kullanmayı sürdürebilir: puan harcayabilir, yorum yazabilir, yani anonim hesaba yeni PII ekleyebilir. Kodun yorumu (`gdpr-core.ts:11`, "Hesap girişini kapatır") ile gerçek davranış çelişiyor.
- **Öneri:** Kullanıcı bazlı bir iptal mekanizması kurulmalı. `User.sessionVersion` (veya `tokensValidAfter`) alanı eklenip `jwt` callback'te token'a yazılır. `requireAuth` bu değeri mevcut Redis sıcak katmanında (`token-replay` deseni) karşılaştırır. `anonymizeUser` bu sürümü artırır ve Redis'teki `jti` anahtarlarını temizler. Aynı mekanizma şifre değişimi ve hesap kilitleme için de kullanılabilir. Anonimleştirilen hesabın `PushSubscription` kayıtları da silinmeli (bkz. bulgu 5).

### 2. "Tamamlandı" silme talebini yürütmeden kapatıyor ve UI kendini kilitliyor
- **Önem:** kritik · **Kategori:** iş akışı / hukuki uyum · **Efor:** S-M
- **Kanıt:** `page.tsx:200-204` ("Tamamlandı" her tür için görünür), `page.tsx:183` (Anonimleştir yalnızca `status !== 'completed'` iken görünür), `page.tsx:172` ("İncelemeye al" completed için gizli), `[id]/route.ts:35-44` (PATCH türden bağımsız `completed` kabul ediyor). Aynı açık kopya kuyrukta da var: `app/admin/compliance/page.tsx:120-131,302-304`.
- **Sorun:** Admin silme talebinde yanlışlıkla ya da bilinçli olarak "Tamamlandı" der. Talep `completed` ve `processedAt` dolu olarak kapanır, oysa hiçbir veri silinmemiştir. Bu noktadan sonra Anonimleştir butonu kaybolur ve talep yeniden açılamaz. Kayıtlar hakkın yerine getirildiğini gösterir, gerçekte getirilmemiştir. Bu, denetimde ağır sonuç doğurabilecek sahte bir uyum kanıtıdır. Erişim talebi için de aynısı geçerli: export alınmadan kapatılabiliyor.
- **Öneri:** Sunucu tarafında bir durum makinesi tanımlanmalı. `deletion` türünde `completed` durumuna yalnızca `anonymize` eylemi geçirebilmeli; PATCH ile `completed` reddedilmeli. `access` türünde `completed` için bir `fulfilledAt` ya da export kanıtı (export hash'i, teslim zamanı) şart olmalı. UI'da "Tamamlandı" genel butonu kaldırılmalı; her türün tek bir "Yürüt ve kapat" birincil eylemi olmalı. Kapanmış talepte "Yeniden aç (gerekçeli)" eylemi bulunmalı.

### 3. Denetim izi vaadi doğru değil ve admin aktörü hiç kaydedilmiyor
- **Önem:** yüksek · **Kategori:** güvenlik / izlenebilirlik · **Efor:** M
- **Kanıt:** `page.tsx:133-134` ("Tüm işlemler denetim günlüğüne yazılır"), `[id]/route.ts:35-46` (PATCH, audit yok), `[id]/route.ts:85-91` (export, audit yok), `lib/gdpr-core.ts:13` ("Her iki işlem de AuditLog'a yazılır") ile `:162-170` (yalnızca anonimleştirme yazılıyor ve `userId` alanına anonimleşen kişi yazılıyor, admin değil).
- **Sorun:** Hangi adminin, hangi kullanıcının tam kişisel veri paketini ne zaman indirdiği hiçbir yerde kayıtlı değil. Bu, KVKK veri güvenliği yükümlülüğü açısından içeriden sızıntı riski demek. Anonimleştirme kaydında da yalnızca konu kullanıcı var, işlemi yapan kişi yok. Ekran ise yöneticiye bunun tersini söylüyor.
- **Öneri:** Tüm DSR eylemleri tek bir `recordDsrEvent({ requestId, actorId, action, before, after, ip, ua })` yardımcısından geçmeli. Bunun için ya `AuditLog` (actor `userId`, subject `entityId`) ya da ayrı bir `DataSubjectRequestEvent` tablosu kullanılabilir. Export için ek olarak içerik hash'i ve satır sayıları kaydedilmeli. Talep detay panelinde bu olaylar zaman çizelgesi olarak gösterilmeli (bkz. vizyon).

### 4. Anonimleştirme talep türünü sunucuda doğrulamıyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** S
- **Kanıt:** `[id]/route.ts:73-95`. `req.type` seçiliyor ama hiç kontrol edilmiyor; yalnızca `userId` var mı diye bakılıyor.
- **Sorun:** UI butonu yalnızca `deletion` için gösteriyor (`page.tsx:183`), ancak API herhangi bir türdeki talep üzerinden `?action=anonymize` kabul ediyor. Hatalı bir istemci, script ya da ileride eklenecek bir toplu işlem, erişim talebi açmış bir kullanıcının hesabını geri döndürülemez biçimde yok edebilir. Zaten tamamlanmış ya da reddedilmiş talepler için de kontrol yok.
- **Öneri:** `if (action === 'anonymize' && req.type !== 'deletion') 409` ve `if (req.status in ['completed','rejected']) 409` kontrolleri eklenmeli. Export için de türe göre beyaz liste (`access`) tutulmalı. İdeal olarak talep güncellemesi ile anonimleştirme aynı `$transaction` içinde yapılmalı (`[id]/route.ts:95-99` şu an transaction dışında).

### 5. Anonimleştirmenin PII kapsamı eksik
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / hukuki uyum · **Efor:** M-L
- **Kanıt:** `lib/gdpr-core.ts:124-157` yalnızca `User`, `Feedback.text`, `ConsumptionReview.text`, `Session` ve `Account` kayıtlarına dokunuyor. Şemada kullanıcıya bağlı serbest metin ve kimlik alanları da var: `Consumption.note`, `Notification.message`, `Donation.message`, `ImprovementRequest.message`, `UserSurpriseBox.message`, `RemedyOffer.message`, `AuditLog.ipAddress`, `Feedback.media` (`prisma/schema.prisma:773`), `QraChatLog.userMessage/assistantMessage` (`:2250-2259`), `PushSubscription` (endpoint ve userAgent, `:1969-1980`). Ayrıca `DataSubjectRequest.email/message` kaydının kendisi de var.
- **Sorun:** "Silme" sonrasında kullanıcının sohbet mesajları, tüketim notları, bağış mesajları, yüklediği medya URL'leri (R2 nesneleri dahil) ve push aboneliği yerinde kalıyor. Kişi push bildirimi almaya da devam edebilir. Export tarafı da tutarsız: `gdpr-core` ödülleri ve analitiği içermiyor, self-servis export (`app/api/user/data-export/route.ts`) ise farklı bir küme döndürüyor.
- **Öneri:** Kişisel veri envanteri tek yerde, kodla tanımlanmalı. `/admin/compliance` içindeki `kvkkInventory` bu iş için zaten mevcut ve bir `PII_REGISTRY` olarak kullanılabilir. Her model için `export` ve `erase` stratejisi (null'la, maskele, sil, R2 nesnesini sil, saklama süresi ile tut) bu kayıttan okunmalı. `exportUserData`, `anonymizeUser` ve self-servis uçlar aynı kayıt üzerinden çalışmalı. Kayıt dışında kalan kullanıcı ilişkili alanları yakalayan bir jest testi eklenmeli (şema DMMF taraması), böylece yeni modeller unutulmaz. DSR kaydındaki e-posta için yasal saklama süresi belirlenip sonra maskelenmeli.

### 6. Kuyruğun girişi öksüz, self-servis yollar kuyruğu tamamen atlıyor
- **Önem:** yüksek · **Kategori:** mimari / bilgi mimarisi · **Efor:** M
- **Kanıt:** `/api/customer/privacy-request` için repoda istemci çağrısı yok (yalnızca `app/admin/compliance/page.tsx:271` içindeki açıklama metni). Kullanıcı ayarları ayrı uçlar kullanıyor: `components/settings/privacy-security.tsx:108-140` → `/api/user/data-export` ve `/api/user/delete-account`. `app/api/user/delete-account/route.ts:32-39` sert-silme yapıyor (`user.delete`), DSR ya da audit kaydı oluşturmuyor. KVKK aydınlatma metni başvuru kanalı olarak e-posta veriyor (`app/(public)/kvkk-aydinlatma-metni/page.tsx:57`).
- **Sorun:** Bu sayfa pratikte hep boş kalan bir kuyruk. Gerçek talepler ya e-posta ile geliyor ve sisteme girilmiyor, ya da self-servis yolla izsiz yürütülüyor. Platformda aynı hak için iki ayrı silme semantiği var (sert-silme ve anonimleştirme). Uyum açısından "kaç silme talebi aldık, ne kadar sürede yanıtladık" sorusu cevapsız.
- **Öneri:** Tek bir giriş modeli kurulmalı. (a) Kullanıcı ayarlarındaki "Verilerimi indir" ve "Hesabımı sil" eylemleri DSR kaydı oluşturup otomatik yürütülmeli (auto-fulfilled, kanıt kayıtlı). (b) "Düzeltme" ve "itiraz" için ayarlara bir başvuru formu eklenmeli; bu form `/api/customer/privacy-request` ucunu kullanmalı. (c) E-posta ile gelen başvurular için admin sayfasına "Manuel talep oluştur" eklenmeli. (d) Sert-silme ile anonimleştirme arasında tek bir politika seçilmeli; puan ve ekonomi değişmezleri gereği anonimleştirme öneriliyor.

### 7. Müşteri ucu keyfi e-postaya makbuz gönderiyor ve hız sınırı yok
- **Önem:** yüksek · **Kategori:** güvenlik / kötüye kullanım · **Efor:** S
- **Kanıt:** `app/api/customer/privacy-request/route.ts:14` (`email` istemciden opsiyonel olarak alınıyor), `:34` (oturum e-postasının yerine geçiyor), `:52-56` (makbuz bu adrese gönderiliyor). Ucun içinde ve `proxy.ts` içinde rate-limit yok (karşılaştırma için `app/api/customer/ai-chat/route.ts:31` `checkRateLimitDb` kullanıyor).
- **Sorun:** Oturum açmış herhangi bir kullanıcı, döngü içinde istediği adrese QRATEX markalı "Başvurunuz alındı" e-postaları gönderebilir. Bu bir spam ve itibar sorunu; gönderici domain'in itibarını da düşürür. Admin ekranında ise başkasının e-postası görünür, ama eylem başvuranın kendi hesabını (`userId`) etkiler. Ekrandaki e-posta ile etkilenen hesap birbirini tutmaz, bu da yanlış kişiye yanıt riski yaratır. Ucun şu an bir UI'ı yok, ancak uç canlıda erişilebilir.
- **Öneri:** Makbuz her zaman hesap e-postasına gönderilmeli. Farklı bir iletişim adresi isteniyorsa ayrı bir `contactEmail` alanına yazılmalı ve doğrulama bağlantısıyla onaylanmalı. Kullanıcı başına bir rate-limit eklenmeli (ör. `checkRateLimitDb('dsr:'+userId, 3, 24h)`) ve aynı türde açık talep varken yenisi engellenmeli (idempotency). Admin ekranında "hesap e-postası" ile "başvuru e-postası" ayrı gösterilmeli ve eşleşmiyorsa uyarı verilmeli.

### 8. Hata durumu boş durum gibi görünüyor
- **Önem:** orta · **Kategori:** hata yönetimi / UX · **Efor:** S
- **Kanıt:** `page.tsx:52-55,144-145`.
- **Sorun:** Oturum süresi dolduğunda, token-replay 403 döndüğünde ya da DB hatasında admin "Bekleyen talep yok" mesajını görür. Yasal süreli bir kuyrukta "iş yok" yanılgısı, sürenin kaçırılmasına yol açabilir.
- **Öneri:** `r.ok` kontrol edilmeli. Hata için yeniden dene butonlu ayrı bir durum (`error` state) gösterilmeli. Listeleme SWR veya React Query ile yapılmalı (odakta yenileme, `mutate` ile iyimser güncelleme). Boş durum metni filtreye göre değişmeli ("Açık talep yok", "Bu filtrede kayıt yok").

### 9. Ret ve kapanış iletişimi yok; durum makinesi gevşek
- **Önem:** orta · **Kategori:** iş akışı / hukuki uyum · **Efor:** M
- **Kanıt:** `page.tsx:195-199` (Reddet onaysız ve gerekçesiz), `[id]/route.ts:10-12,39-43` (her durumdan her duruma geçişe izin var; `in_review` geçişinde `processedAt` temizlenmiyor), `lib/email.ts:54-84` (yalnızca makbuz şablonu var; içinde `Tür: deletion` gibi İngilizce enum ve ham ISO tarih geçiyor).
- **Sorun:** KVKK m.13 uyarınca ret gerekçeli olmalı ve başvurana bildirilmeli. Tamamlanma da bildirilmeli. Şu an başvuran makbuzdan sonra hiçbir şey öğrenmiyor. Reddedilen talep yeniden açıldığında eski `processedAt` kalıyor ve raporlamayı bozuyor.
- **Öneri:** `rejectionReason` (zorunlu, şablonlu seçenek ve serbest metin) ile `resolutionNote` alanları eklenmeli. Geçişler sunucuda beyaz listeyle sınırlandırılmalı (`received→in_review→completed|rejected`, gerekçeli `reopen`). Kapanışta Türkçe etiketli "Talebiniz sonuçlandı" e-postası gönderilmeli (erişim talebinde süreli ve imzalı bir indirme bağlantısıyla, bkz. bulgu 10). Makbuz şablonundaki tür etiketi ve tarih yerelleştirilmeli.

### 10. Veri paketi admin tarayıcısına iniyor; teslim kanalı yok
- **Önem:** orta · **Kategori:** güvenlik / süreç · **Efor:** M
- **Kanıt:** `page.tsx:80-98` (JSON admin makinesine kaydediliyor, dosya adında e-posta var: `kvkk-export-${email}-${id}.json`), `[id]/route.ts:85-91`.
- **Sorun:** Erişim hakkı veri sahibine teslimle yerine gelir, ancak sistem paketi yalnızca adminin bilgisayarına indiriyor. Kişisel veri, kontrolsüz bir yerel kopya olarak kalıyor ve sonrasında e-postaya ek yapılıp gönderilmesi gerekiyor; teslim edildiğine dair kanıt da yok.
- **Öneri:** Export, R2'ye kısa ömürlü bir nesne olarak yazılmalı (mevcut R2 altyapısı kullanılabilir). Veri sahibine süreli ve imzalı bir indirme bağlantısı içeren e-posta gönderilmeli. Bağlantının ilk açılışında `fulfilledAt` damgalanmalı. Admin için "önizle" görünümü (bölüm başına sayılar) yeterli; tam indirme ayrı bir yetkiye bağlanmalı ve audit'e yazılmalı.

### 11. Ölçeklenmeyen liste: filtre, arama, sayfalama ve SLA yok
- **Önem:** orta · **Kategori:** UX / ürün · **Efor:** M
- **Kanıt:** `route.ts:12-14` (`take: 100`, filtre parametresi yok), `page.tsx:147-209`.
- **Sorun:** Kapalı talepler açık taleplerle aynı listede ve aynı ağırlıkta duruyor. 30 günlük yasal süreye yaklaşan bir talebi ayırt etmenin yolu yok. 100'ü aşan kayıtlar görünmüyor.
- **Öneri:** API'ye `status`, `type`, `q` (e-posta) ve `cursor` parametreleri eklenmeli; şemadaki `@@index([status, createdAt])` (`prisma/schema.prisma:2819`) bunu zaten destekliyor. Kart görünümü yerine tablo ve sağdan açılan detay paneli kullanılmalı. Her satırda "kalan gün" rozeti olmalı (yeşil > 10, amber 3-10, kırmızı < 3 veya gecikmiş). Üstte durum sekmeleri ve sayaçlar bulunmalı.

### 12. Kopya KVKK kuyruğu `/admin/compliance` içinde, daha zayıf kurallarla
- **Önem:** orta · **Kategori:** bilgi mimarisi / tutarlılık · **Efor:** S
- **Kanıt:** `app/admin/compliance/page.tsx:76-131,260-312`. Aynı GET ve PATCH uçlarını kullanıyor. Yürütme butonu yok. "Tamamlandı" her satırda var. Tür ve durum ham İngilizce enum olarak gösteriliyor (`{row.type}`, `{row.status}` `:296-299`). Kenar çubuğunda iki girdi de aynı `Shield` ikonuyla art arda duruyor (`components/dashboard/sidebar.tsx:207-208`).
- **Sorun:** Aynı veri iki farklı kural setiyle yönetiliyor. Uyum sayfası bulgu 2'deki açığı daha da kolaylaştırıyor (tek tıkla yürütmeden kapatma). Admin hangisinin doğru yer olduğunu bilemiyor.
- **Öneri:** Uyum sayfasındaki tablo kaldırılmalı. Yerine "Açık KVKK talebi: N · Geciken: M · En yakın son tarih: X gün" özet kartı ve bu sayfaya bağlantı konmalı. Kenar çubuğunda `privacy_requests` için ayırt edici bir ikon (ör. `UserX` / `FileLock`) kullanılmalı ve iki girdi "Uyum" grubu altında toplanmalı.

### 13. Küçük UI ve kod kusurları
- **Önem:** düşük · **Kategori:** kalite · **Efor:** S
- **Kanıt ve öneriler:**
  - `page.tsx:179,191`: tek `busy` id yüzünden iki butonda aynı anda spinner dönüyor. `busy` değeri `{id, action}` olarak tutulmalı.
  - `page.tsx:74`: iyimser güncelleme `processedAt` alanını atlıyor. Sunucunun döndürdüğü `request` (`[id]/route.ts:46`) state'e yazılmalı.
  - `page.tsx:177`: "düzeltme" talebinde export sunuluyor. Düzeltme için kullanıcı profilini düzenleme eylemi gerekiyor, ancak admin kullanıcı detay sayfası yok (`app/admin/users/` altında yalnızca liste var).
  - `page.tsx:123`: `p-6`, layout'taki yatay dolguyla üst üste biniyor (`app/admin/layout.tsx:33,38`); mobilde içerik daralıyor.
  - `page.tsx:1`: sayfa tamamen istemci bileşeni, `metadata` yok. Sunucu bileşeni sarmalayıcı ve `title: 'KVKK Talepleri'` eklenmeli.
  - `page.tsx:93`: `URL.revokeObjectURL` çağrısı `click()` ile aynı tick'te yapılıyor; bazı tarayıcılarda indirme iptal olabilir (doğrulanmadı). `setTimeout` içinde çağrılmalı.
  - `lib/admin-toast.ts:17,19`: "Basarili:" ve "Dikkat:" öneklerinde Türkçe karakter eksik (paylaşılan yardımcı, sistem genelinde etkili).
  - `page.tsx:141`: iskelet bloklarında `aria-hidden` yok; liste kabında `aria-busy` yok.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **SLA ve yasal süre motoru:** Her talep için `dueAt = createdAt + 30 gün`, kalan gün rozeti, geciken talepler için admin bildirimi (mevcut bildirim merkezi ve cron altyapısı). PostHog ve Stripe, DSR kuyruklarını "due date" etrafında kurar.
2. **Talep detay paneli ve olay zaman çizelgesi:** Linear tarzı sağ panel. Başvuran, hesap eşleşmesi, mesaj ve olaylar (oluşturuldu, makbuz, inceleme, export, anonimleştirme, kapanış) aktör ve zaman bilgisiyle; dahili not alanı.
3. **Kimlik doğrulama adımı:** Başvuru e-postası ile hesap e-postasının eşleşmesi ve gerekirse doğrulama bağlantısı. Durum bir "Doğrulandı" rozeti olarak gösterilir.
4. **Teslim kanalı:** Erişim talebinde süreli ve imzalı R2 bağlantısıyla veri sahibine doğrudan teslim; ret veya tamamlanma için şablonlu yanıt e-postası.
5. **Filtre, arama, sekmeler ve sayfalama;** CSV olarak "DSR raporu" (yıllık uyum raporu için tür ve durum bazında sayılar, ortalama yanıt süresi).
6. **İnce taneli yetki ve iki aşamalı onay:** Anonimleştirme ve tam export için ayrı bir izin (ör. `dpo`); geri döndürülemez eylemde hedef e-postayı yazarak onaylama (Stripe'ın "type to confirm" deseni).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin sayfayı açtığında üç soruya tek bakışta cevap bulmalı: "Bugün neyi bitirmem lazım?", "Hangisi gecikiyor?" ve "Her talebin kanıtı tam mı?". Her talep, türüne özgü tek bir birincil eylemle sonuçlanmalı; durum etiketi elle "Tamamlandı" yapılamamalı.

**Yerleşim:**
- **Üst şerit (KPI):** Açık · İncelemede · 7 gün içinde süresi dolacak · Geciken · Son 30 gündeki ortalama yanıt süresi. Geciken sayaç kırmızı ve tıklanabilir; tıklanınca filtreyi uygular.
- **Sekmeler:** Açık (varsayılan) / Tamamlanan / Reddedilen / Tümü, yanında tür filtresi ve e-posta araması. Filtreler URL'de tutulur (`?status=open&type=deletion`).
- **Tablo:** Tür ikonu · başvuran (hesap e-postası ile başvuru e-postası eşleşmiyorsa uyarı ikonu) · kalan gün rozeti · durum · son olay. Satıra tıklayınca sağdan detay paneli (shadcn `Sheet`) açılır. Mobilde tablo kartlara dönüşür, panel tam ekran olur.
- **Detay paneli:** Başvuru metni, kimlik doğrulama durumu, veri envanteri özeti (bölüm başına kayıt sayısı, `exportUserData` çıktısından), zaman çizelgesi ve dahili not. Altta türe özgü tek bir birincil eylem bulunur. Erişim talebinde bu "Paketi hazırla ve gönder", silme talebinde "Anonimleştir ve kapat" eylemidir; ikincisi `AlertDialog` içinde e-postayı yazarak onaylanır. Düzeltme talebinde "Profili düzenle" eylemi gelecekteki kullanıcı detay sayfasına bağlanır. "Reddet" eylemi gerekçe seçimi zorunlu bir dialog açar.

**Motion (yerinde ve ölçülü):** Bu bir uyum aracı, 3B ya da gösterişli animasyon gereksiz. Yalnızca şunlar yeterli: detay panelinin `Sheet` geçişi; anonimleştirme sonrası satırın `layout` animasyonuyla "Tamamlanan" sekmesine kayması (global `m as Motion`, `useReducedMotion` ile kapatılabilir); kalan gün rozetinde renk geçişi. Yükleme sırasında iskelet, `aria-busy` ile birlikte.

**Veri ve API değişiklikleri:**
- Şema: `DataSubjectRequest` modeline `dueAt`, `verifiedAt`, `contactEmail`, `rejectionReason`, `resolutionNote`, `fulfilledAt`, `assigneeId` alanları; yeni `DataSubjectRequestEvent` modeli (`requestId`, `actorId`, `action`, `meta Json`, `createdAt`). `type` ve `status` alanları Prisma `enum` yapılmalı. Not: Lokal `DATABASE_URL` canlı Neon'a işaret ettiği için şema değişikliği yalnızca kontrollü bir migration ile uygulanmalı.
- API: `GET /api/admin/privacy-requests?status&type&q&cursor` ve `GET /[id]` (olaylarla birlikte). Eylemler komut uçları olarak tasarlanmalı: `POST /[id]/review`, `/[id]/fulfill-access`, `/[id]/erase`, `/[id]/reject`, `/[id]/reopen`. Her uç, sunucu tarafı durum makinesi ve türe göre koruma içermeli, işlem ile olay kaydını tek transaction'da yazmalı. Genel `PATCH status` kaldırılmalı.
- Ortak çekirdek: `lib/gdpr-core.ts`, bir `PII_REGISTRY` üzerinden çalışmalı. Self-servis uçlar (`/api/user/data-export`, `/api/user/delete-account`) aynı çekirdeği çağırıp otomatik tamamlanan DSR kaydı oluşturmalı. Anonimleştirme `sessionVersion` değerini artırmalı, Redis'teki jti anahtarlarını temizlemeli, push aboneliklerini ve R2 medyasını silmeli.
- Cron: Günlük "yaklaşan veya geciken DSR" kontrolü (mevcut harici cron-job.org tetikleyicisine eklenebilir) admin bildirimi üretmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/compliance` (KVKK kuyruğu kartı, `app/admin/compliance/page.tsx:260-312`):** Aynı veri ve aynı uçlar kullanılıyor, ancak yürütme yok, kurallar daha zayıf ve enum'lar ham. Kart kaldırılmalı, yerine özet KPI ve bu sayfaya bağlantı konmalı. Bu sayfa DSR'ler için tek doğru kaynak olmalı.
- **`components/settings/privacy-security.tsx` ile `/api/user/data-export` ve `/api/user/delete-account`:** Aynı KVKK haklarının ikinci ve farklı bir uygulaması (sert-silme, farklı export kapsamı, iz yok). Ortak `gdpr-core` çekirdeğine bağlanmalı ve DSR kaydı üretmeli.
- **`/admin/audit`:** DSR olayları burada da `entity = DataSubjectRequest` filtresiyle görülebilmeli; ayrı bir log ekranı açılmamalı.
- Kenar çubuğunda `compliance` ve `privacy_requests` aynı ikonla art arda duruyor (`components/dashboard/sidebar.tsx:207-208`). İkisi tek bir "Uyum" grubu altında toplanmalı ve DSR girdisine ayırt edici bir ikon verilmeli.

---

## Doğrulama (şüpheci inceleme)

Yöntem: Her iddia çürütülmeye çalışıldı. Okunan kodlar: `app/admin/privacy-requests/page.tsx`, `app/api/admin/privacy-requests/route.ts` ve `[id]/route.ts`, `lib/gdpr-core.ts`, `lib/auth.ts`, `lib/api-auth.ts`, `lib/token-replay.ts`, `proxy.ts`, `app/api/customer/privacy-request/route.ts`, `lib/email.ts`, `app/admin/compliance/page.tsx`, `app/api/user/profile/route.ts`, `app/api/user/delete-account/route.ts`, `app/api/admin/users/route.ts` ve `prisma/schema.prisma`. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Anonimleştirilen kullanıcının JWT oturumu geçerli kalıyor: **DOĞRULANDI (Yüksek)**
- `lib/auth.ts:60-63` `strategy: 'jwt'`. `session` callback'i (`:285-302`) DB'ye hiç gitmez, token içeriğini oturuma kopyalar. `lib/api-auth.ts:52-80` yalnızca rol ve jti/IP/UA eşleşmesine bakar. `lib/token-replay.ts` içinde iptal listesi yok, `sessionVersion` veya benzeri bir alan da yok (repo genelinde grep sonucu boş).
- `lib/gdpr-core.ts:155` `tx.session.deleteMany` JWT stratejisinde hiçbir şeyi geçersiz kılmaz. Bu yüzden `:11`'deki "Hesap girişini kapatır" yorumu yalnızca *yeni* girişler için doğru (password=null, Account silindi, e-posta değişti). *Mevcut* oturumu kapatmaz.
- Yeniden üretim: Kullanıcı oturum açıkken silme talebi gönderir, admin "Anonimleştir"e basar. Kullanıcı aynı tarayıcıda, token süresi dolana kadar (varsayılan 24 saat, `lib/auth.ts:36`) `PATCH /api/user/profile` ile `name`/`phone`/`address` yazabilir (`app/api/user/profile/route.ts:41-48`, `requireAuth()`). Böylece "Anonim Kullanıcı" satırına yeni PII eklenir. Ayrıca `PushSubscription` (`schema.prisma:1969`) silinmediği için push almaya devam eder.
- Not: Pencere sınırlı (en fazla maxAge kadar). Ama KVKK açısından silme sonrası yeni veri toplanması somut bir sonuç.

### 2. Silme talebi yürütülmeden "completed" yapılabiliyor: **DOĞRULANDI (Yüksek), "UI'dan bir daha yürütülemez" kısmı abartılı**
- `page.tsx:200-204` "Tamamlandı" düğmesi tür fark etmeksizin görünüyor ve onay istemiyor. `[id]/route.ts:35-44` PATCH türü ya da yürütülüp yürütülmediğini kontrol etmeden `completed` ve `processedAt` yazıyor. `page.tsx:183` sonrasında "Anonimleştir" düğmesini gizliyor.
- Yeniden üretim: Silme talebinde admin yanlışlıkla ya da kestirme olarak, "Anonimleştir"in hemen yanındaki "Tamamlandı"ya basar. Kayıt "Tamamlandı · İşlendi: <tarih>" gösterir ama `User` satırı ve PII aynen durur. Bu, yanıltıcı bir uyum kaydıdır.
- Düzeltme: Talep geri getirilemez değil. `app/admin/compliance/page.tsx:305-307`'deki "İncelemede" düğmesi her durumda görünür ve aynı PATCH ucunu çağırır. Talep `in_review`'a çekilince bu sayfada "Anonimleştir" yeniden görünür. Yani kurtarma mümkün ama keşfedilmesi zor. Bu sayfanın kendi içinde (`page.tsx:172`) geri alma yolu yok.

### 3. anonymize eylemi talep türünü doğrulamıyor: **DOĞRULANDI, şiddet ORTA'ya düşürülmeli**
- `[id]/route.ts:73-95` `type` seçiliyor ama kullanılmıyor. Ne tür ne de durum kontrolü var. Talep güncellemesi transaction dışında (`:96-99`).
- Çürütme denemesi: "Erişim talebi üzerinden doğrudan API ile anonimleştirme" yalnızca bir ADMIN tarafından yapılabilir. ADMIN zaten `DELETE /api/admin/users?id=` (`app/api/admin/users/route.ts:646-690`) ile herhangi bir kullanıcıyı sert silebiliyor. Bu nedenle yetki yükseltmesi yok, mesele derinlemesine savunma eksikliği.
- Ancak somut bir UI senaryosu var: `page.tsx:183` koşulu yalnızca `status !== 'completed'`. Yani **reddedilmiş** (`rejected`) bir silme talebinde "Anonimleştir" düğmesi görünmeye devam ediyor ve sunucu bunu kabul ediyor. Örneğin kimlik doğrulanamadığı için reddedilen bir talep, sonradan bir yanlış tıklamayla geri döndürülemez biçimde yürütülebilir ve durum sessizce `rejected`'dan `completed`'a döner.
- Transaction dışı güncelleme düşük risk taşır: `anonymizeUser` idempotent olduğundan yeniden çalıştırmak zarar vermez. Yalnızca ikinci bir `gdpr_anonymize` audit satırı oluşur.

### 4. DSR eylemlerinde denetim izi yok, ekrandaki vaat yanlış: **DOĞRULANDI (Yüksek)**
- `page.tsx:133-134` "Tüm işlemler denetim günlüğüne yazılır" diyor. `[id]/route.ts` PATCH (`:35-46`) ve export (`:85-91`) hiç `auditLog.create` çağırmıyor. Prisma'da otomatik denetim için `$extends`/`$use` da yok (`lib/prisma.ts`).
- `lib/gdpr-core.ts:162-170` audit satırını `userId: <konu kullanıcı>` ile yazıyor. İşlemi yapan admin, IP ve UA kaydedilmiyor (`AuditLog` modelinde `ipAddress`/`userAgent` alanları var, `schema.prisma:1106-1116`). Karşılaştırma için `admin/users` DELETE aktörü ve `auditMeta`'yı yazıyor (`route.ts:680-692`).
- Yeniden üretim: Bir admin, herhangi bir erişim talebinde "Veri paketi"ne basarak kullanıcının profil, adres, telefon ve tüketim geçmişini indirir. Sistemde bu indirmeye dair hiçbir iz kalmaz.

### 5. Anonimleştirme kişisel verinin önemli bir kısmını bırakıyor: **DOĞRULANDI (Yüksek)**
- `gdpr-core.ts:124-157` yalnızca `User`, `Feedback.text`, `ConsumptionReview.text`, `Session` ve `Account`'a dokunuyor. User satırı silinmediği için Cascade ilişkileri de olduğu gibi kalıyor: `Consumption.note`, `Notification.message`, `Donation.message`, `ImprovementRequest.message`, `PushSubscription`, `QraChatLog.userMessage` (`schema.prisma:2250-2258`), `Feedback.media` (R2 URL'leri) ve `Feedback.entities`.
- En somut kanıt şu: `app/api/user/profile/route.ts:81-85` her profil güncellemesinde `AuditLog.newData` alanına `{ name, phone, address, latitude, longitude, businessName ... }` değerlerini düz metin olarak yazıyor. Anonimleştirme `AuditLog`'a dokunmadığı için kullanıcının eski adı, telefonu ve adresi anonim hesaba bağlı olarak okunabilir kalıyor.
- Ek tutarsızlık: Self-servis `DELETE /api/user/delete-account` sert silme yapıyor (cascade ile hepsi gidiyor, `route.ts:33-39`). Admin yolu ise çok daha az veri temizliyor. Aynı hak iki farklı sonuç doğuruyor.

### 6. Müşteri DSR ucu keyfi adrese markalı e-posta gönderiyor, hız sınırı yok: **DOĞRULANDI (Orta)**
- `app/api/customer/privacy-request/route.ts:14` `email` opsiyonel ve istemciden geliyor. `:34` bu değer oturum e-postasının yerine geçiyor. `:52` makbuz bu adrese gidiyor. Uçta `checkRateLimitDb` yok (karşılaştırma için `ai-chat` ve `redeem-coupon` uçlarında var). `proxy.ts` içinde de hız sınırı yok.
- Hafifletici etkenler: E-posta içeriği sabit şablon. `lib/email.ts:54-89` yalnızca requestId, type ve createdAt içeriyor, saldırgan metin enjekte edemez. Bu yüzden oltalama değeri düşük. Ayrıca repoda bu ucu çağıran bir UI yok (yalnızca `compliance/page.tsx:271` dokümantasyonu). Uç yine de canlıda ve oturum açmış her rol (Google OAuth ile anında hesap açılabiliyor) bir döngüyle sınırsız sayıda QRATEX markalı e-posta gönderebilir. Bu, gönderim kotasını ve alan adı itibarını tüketir, her istekte de DB satırı ile audit satırı oluşturur.
- Admin tarafındaki etki gerçek ama dar: `page.tsx:164` başvurudaki e-postayı gösteriyor, eylem ise `userId` üzerinde yapılıyor. A kullanıcısı B'nin adresini yazarak silme talebi açarsa admin B'yi sildiğini sanırken aslında A anonimleştirilir. Talebi açan zaten A olduğu için başkasının verisi etkilenmez, ancak kayıtlar yanıltıcı olur.

### Özet
| # | İddia | Karar | Düzeltilmiş şiddet |
|---|---|---|---|
| 1 | JWT oturumu anonimleştirme sonrası geçerli | Doğrulandı | Yüksek |
| 2 | Yürütmeden "completed" | Doğrulandı (kurtarma `/admin/compliance` üzerinden mümkün) | Yüksek |
| 3 | anonymize tür/durum kontrolü yok | Doğrulandı (yetki yükseltmesi yok, rejected talepte UI açığı var) | Orta |
| 4 | Denetim izi yok | Doğrulandı | Yüksek |
| 5 | Eksik anonimleştirme | Doğrulandı (AuditLog.newData içindeki PII en kritik kalıntı) | Yüksek |
| 6 | Keyfi adrese makbuz, hız sınırı yok | Doğrulandı | Orta |
