# Lark Suite Mail entegrasyonu: araştırma ve plan

Tarih: 2026-10-12 · Durum: yalnız araştırma (kod ve şema değişmedi)

Bağlam: proje sahibi iş mailini artık Lark Suite (larksuite.com) üzerinde, kendi alan adıyla kullanıyor. Bu belge, Lark posta kutusunu Qratex'in mail sistemine (gelen kutusu `/admin/inbox`, stajyer eşleştirme, bounce, SPF/DKIM/DMARC doğrulaması, gönderim) yeni kaynak olarak bağlamanın yollarını değerlendiriyor.

İşaretler: **[belge]** Lark Open Platform sayfasından okundu. **[doğrula]** belgede görülmedi, Lark panelinde veya ilk denemede teyit edilmeli.

---

## 0. Mevcut sistemin özeti (değişmeyecek kısımlar)

| Parça | Dosya | Not |
|---|---|---|
| IMAP senkronu | `lib/mail-inbox.ts` | imapflow + mailparser; UID artımlı imleç `Settings[inbox_sync_state]` (`uidValidity`, `lastUid`); parti sınırı ve süre bütçesi var |
| IMAP ayarları | `lib/mail-inbox.ts` `imapConfig()` | `IMAP_HOST` (varsayılan `imap.gmail.com`), `IMAP_PORT` (993), `IMAP_USER` yoksa `SMTP_USER`, `IMAP_PASS` yoksa `SMTP_PASS` |
| Gönderen doğrulaması | `lib/mail-center/mail-auth.ts` `verifyMailAuth()` | Ham kaynaktaki **en üst** `Authentication-Results` satırını okur. authserv-id `MAIL_AUTHSERV_ID` ile aynı olmalı, ardından hizalı dmarc/dkim/spf=pass aranır |
| Bounce | `lib/mail-center/bounce.ts`, `isDeliveryStatusReport()` | DSN (`multipart/report; report-type=delivery-status`) ve izleme tokenları |
| Gönderim | `lib/email.ts` → `lib/mail-sender` (nodemailer/SMTP) | `EMAIL_FROM`, `SMTP_*` |
| Model | `InboxMessage` (prisma) | `@@unique([mailbox, uid])`, `uid Int` = IMAP UID |
| Cron | `app/api/cron/inbox-sync` | harici cron-job.org |

Önemli sonuç: kod zaten **sunucu adını env'den alıyor**. Bu yüzden Lark'ın IMAP/SMTP'si açıksa seçenek (a) neredeyse yalnız ayar işidir.

---

## 1. Lark Mail Open API özeti

### 1.1 Lark Global ve Feishu farkı
- **Lark Global:** `https://open.larksuite.com/open-apis/...`, geliştirici konsolu `open.larksuite.com/app`, yönetim paneli `<tenant>.larksuite.com/admin`.
- **Feishu (Çin):** `https://open.feishu.cn/open-apis/...`. API yolları aynıdır ama hesaplar, uygulamalar, tokenlar ve veri merkezi **tamamen ayrıdır**. Bir ortamın token'ı ötekinde çalışmaz.
- Çoğu SDK (ör. `@larksuiteoapi/node-sdk`) varsayılan olarak Feishu alan adını kullanır. Lark için `domain: Domain.Lark` açıkça verilmeli. Biz `LARK_BASE_URL=https://open.larksuite.com` ile sabitleyeceğiz.

### 1.2 Kimlik doğrulama
- **tenant_access_token** (uygulama kimliği): `POST /open-apis/auth/v3/tenant_access_token/internal` ile `{app_id, app_secret}` gönderilir. Yaklaşık 2 saat geçerlidir; süre bitmeden yenilenir ve Redis'te önbelleğe alınır.
- **user_access_token** (kullanıcı kimliği): OAuth yetkilendirme koduyla alınır. Kısa ömürlüdür (yaklaşık 2 saat) ve **refresh_token** ile yenilenir. Refresh token'ın ömrü daha uzundur ama sınırlıdır [doğrula]; kullanılmazsa süresi dolar ve kullanıcının yeniden yetki vermesi gerekir.
- Mail API'leri yalnız **Custom App** (şirket içi uygulama) tipinde çalışır [belge].
- Okuma (list/get) **tenant token ile de** yapılabilir. Ancak uygulamaya posta için ayrıca **veri kapsamı (data scope)** verilmesi gerekir: hangi posta kutularını görebileceği [belge].
- **Gönderim (send)** ve **olay aboneliği (event/subscribe)** yalnız **user_access_token** kabul eder [belge]. Bu yüzden REST ile gönderim için bir kez OAuth akışı ve kalıcı refresh-token saklama şarttır.

### 1.3 Uç noktalar (Lark Global)

| İş | Yöntem ve yol | Token | İzin | Hız sınırı |
|---|---|---|---|---|
| Mesaj listesi | `GET /open-apis/mail/v1/user_mailboxes/:mbox/messages?page_size=1..20&page_token&folder_id=INBOX&only_unread` | tenant veya user | `mail:user_mailbox.message:readonly` | 10/sn [belge] |
| Mesaj okuma | `GET .../messages/:message_id?format=full\|plain_text_full\|metadata` | tenant veya user | yukarıdaki + hassas alanlar ↓ | 100/dk [belge] |
| Ek indirme | `GET .../messages/:message_id/attachments/download_url?attachment_ids=...` (geçici URL döner) | tenant veya user | gövde izni | [doğrula] |
| Gönderim | `POST .../messages/send` | **yalnız user** | `mail:user_mailbox.message:send` | 100/dk; **kullanıcı başına sıralı**, eşzamanlı istek 1236006 (429) döner [belge] |
| Olay aboneliği | `POST .../event/subscribe` `{event_type:1}` | **yalnız user** | `mail:event` | 1/sn [belge] |
| Klasörler | `GET .../folders` | tenant veya user | readonly | — |
| multi_entity/search | `POST /open-apis/mail/v1/multi_entity/search` `{query, size≤20}` | **yalnız user** | `mail:user_mailbox:readonly` | 100/dk [belge] |

Hassas alan izinleri (get için) [belge]:
- `mail:user_mailbox.message.address:read`: to, cc, bcc, head_from
- `mail:user_mailbox.message.body:read`: body_html, body_plain_text, attachments
- `mail:user_mailbox.message.subject:read`: subject

Bu üçü verilmezse alanlar **boş döner**. Stajyer eşleştirme için `head_from` şarttır.

**multi_entity/search ne işe yarar?** Mail yazarken alıcı bulmak için tenant içindeki kişi ve grupları (kullanıcı, grup sohbeti, posta listesi) isimle arayan bir **adres defteri araması**dır. Gelen kutusu senkronu için **gereksizdir**. En fazla "Yeni mail" ekranında Lark iç rehberinden otomatik tamamlama için işe yarar; öncelikli değildir.

### 1.4 Mesaj modeli (get, format=full) [belge]
- `body_html`, `body_plain_text`, `body_preview` **base64url** kodlu gelir; çözülmesi gerekir.
- `internal_date` milisaniye cinsinden bir dizedir. `smtp_message_id` RFC Message-ID'dir. `in_reply_to`, `references`, `reply_to` ve `thread_id` de gelir.
- `message_state` değerleri: 1 alındı, 2 gönderildi, 3 taslak.
- `attachments[]` alanları: `filename`, `id`, `attachment_type` (1 normal, 2 büyük ek), `is_inline`, `cid`.
- `security_level`: `is_risk`, `via_domain` (SPF/DKIM gösterim alanı), `is_header_from_external`, spam şeridi bilgisi.
- **Ham EML yok, tam başlık dökümü yok, `Authentication-Results` yok.** Bu, mevcut `verifyMailAuth()` için kritik bir bulgu (bkz. §3.3).

### 1.5 Sayfalama
`page_token` + `has_more` (imleç tabanlı, en fazla 20/sayfa). Liste **yalnız mesaj ID'leri** döner, her mesaj için ayrı bir `get` gerekir (100/dk). 200 maillik ilk doldurma yaklaşık 2 dakikadan uzun sürer; serverless süre bütçesi nedeniyle birkaç cron koşusuna yayılmalıdır. Liste sırası ve "son görülen" mantığı IMAP UID gibi monoton değildir. İmleç olarak `internal_date` ile görülen ID kümesinin birlikte kullanılması gerekir [doğrula: listenin tarih sırası].

---

## 2. Üç seçenek

### (a) Lark IMAP/SMTP + mevcut IMAP kodu
Lark Mail standart istemcileri destekler. Yönetim panelinde ve kullanıcı ayarlarında **"Üçüncü taraf istemci / IMAP-SMTP"** açılır ve hesaba özel bir **istemci (uygulama) şifresi** üretilir [doğrula: menü adı].

Bilinen sunucu ayarları [doğrula, ayarlar ekranında gösterilir]:
- IMAP: `imap.larksuite.com`, port 993, SSL
- SMTP: `smtp.larksuite.com`, port 465 SSL (veya 587 STARTTLS)
- Kullanıcı: tam adres (`ad@alanadiniz.com`), şifre: üretilen istemci şifresi

Artıları:
- **Sıfır yeni kod.** `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` ve SMTP env'leri değiştirilir.
- **Ham EML** gelir. `verifyMailAuth`, bounce/DSN tespiti, ek ayrıştırma, thread başlıkları ve stajyer eşleştirme aynen çalışır.
- UID artımlı imleç zaten var. `uidValidity` değişince imleç kendini sıfırlar.
- OAuth, refresh-token ve Custom App onayı gerekmez.

Eksileri:
- Anlık değildir; gecikme cron aralığı kadardır (şu an kullanılan düzen).
- Uygulama şifresi tam posta yetkisi verir. Kapsam daraltılamaz; şifre sızarsa iptal edilip yenisi üretilir.
- `MAIL_AUTHSERV_ID` Lark'ın MX'inin authserv-id değerine güncellenmelidir. Yanlış kalırsa tüm mailler "yabancı authserv-id" ile `authVerified=false` olur (güvenli yönde hata verir ama kırmızı rozet çıkar).
- Kiracı yöneticisi IMAP'i kapatırsa senkron durur.

Maliyet: yok (Lark planına dahil) [doğrula: Lark planının IMAP'e izin vermesi]. Hız sınırı: IMAP oturum sınırları, cron başına tek bağlantı yeterli.

### (b) Lark Open API (REST) adaptörü
Artıları:
- İzinler ince ayarlıdır (salt okuma, alan bazında).
- Okuma tenant token ile yapılabildiği için kullanıcı şifresi saklanmaz; yalnız App Secret saklanır.
- `security_level.is_risk` ve spam bilgisi ücretsiz gelir.

Eksileri:
- **Ham başlık yok, dolayısıyla `verifyMailAuth` çalışmaz.** Doğrulama Lark'a devredilmek zorundadır (§3.3).
- DSN ham yapısı (`multipart/report`) görünmez. Bounce tespiti konu, gönderen ve gövde sezgisine düşer (`extractBounceInfo` gövde tabanlıysa kısmen çalışır).
- Liste+get çift çağrısı ve 100/dk sınırı nedeniyle toplu doldurma yavaştır. Her mesaj için ayrı ek indirme URL'si gerekir.
- Gönderim yalnız user_access_token ile yapılır: OAuth akışı, şifreli refresh-token saklama ve süre dolunca yeniden yetkilendirme gerekir. Ayrıca kullanıcı başına sıralı gönderim zorunludur (toplu stajyer mailinde kuyruk gerekir).
- Yeni kod: yaklaşık 400–600 satır adaptör ve testler.

Maliyet: API ücretsiz, Custom App ücretsiz [doğrula]. Hız sınırı: list 10/sn, get 100/dk, send 100/dk (sıralı).

### (c) Olay aboneliği (webhook) ile anlık alım
Akış:
1. Konsolda olay aboneliği açılır; istek URL'si `https://<alan>/api/webhooks/lark` olur.
2. Kullanıcı token'ıyla `event/subscribe {event_type:1}` çağrılır.
3. Yeni mail gelince Lark, `mail.user_mailbox.event.message_received_v1` olayını gönderir [doğrula: olay adı ve payload]. Payload `mail_address` ve `message_id` içerir.
4. Uç nokta hemen 200 döner, `after()` içinde `get` çağrılır (REST) **ya da** yalnız `inbox-sync` tetiklenir (IMAP).

Güvenlik:
- Konsolda **Encrypt Key** ve **Verification Token** ayarlanır.
- İlk kurulumda gelen `url_verification` challenge'ı yanıtlanır.
- Her istekte `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce` ve `X-Lark-Signature` başlıkları gelir. İmza şu şekilde doğrulanır: `sha256(timestamp + nonce + encryptKey + rawBody) == signature`. Karşılaştırma sabit zamanlı yapılır, timestamp penceresi ±5 dk tutulur, nonce Redis'te tekilleştirilir.
- Şifreli gövde AES-256-CBC ile gelir. Anahtar `sha256(encryptKey)`, IV ise base64 çözülmüş verinin ilk 16 baytıdır.
- `header.token`, `LARK_VERIFICATION_TOKEN` ile eşleşmelidir.
- `header.app_id`, `LARK_APP_ID` ile eşleşmelidir.

Artıları: anlık bildirim, cron yükü azalır.

Eksileri:
- Abonelik user token gerektirir.
- Olaylar kaçabilir (en az bir kez teslim, yeniden deneme). Cron **yedek olarak kalmalıdır**.
- Ek uç nokta açılır: imza doğrulama, rate-limit ve idempotency gerekir (`messageId` tekilliği).

Maliyet: yok.

### Karşılaştırma

| Ölçüt | (a) IMAP/SMTP | (b) REST | (c) Webhook |
|---|---|---|---|
| Yeni kod | ~0 (env) | yüksek | orta (+a veya b) |
| SPF/DKIM/DMARC (`verifyMailAuth`) | çalışır | **çalışmaz** (Lark'a devredilir) | alım yoluna bağlı |
| Bounce (DSN) | çalışır | zayıf | alım yoluna bağlı |
| Gecikme | cron aralığı | cron aralığı | saniyeler |
| Sır | uygulama şifresi (geniş yetki) | App Secret + refresh token | + Encrypt Key/Verification Token |
| Kapsam daraltma | yok | ince | — |

---

## 3. Önerilen mimari

**Öneri: önce (a), gerekirse sonra (c)'yi "tetikleyici" olarak eklemek; (b) şimdilik yapılmasın.**

Gerekçe: (a) bugünkü güvenlik zincirini (ham Authentication-Results doğrulaması, DSN bounce, ekler, thread) hiç bozmadan Lark'a geçirir ve yalnız env değişikliği gerektirir. (b) tam da yakın zamanda eklenen SPF/DKIM/DMARC doğrulamasını devre dışı bırakır. Anlık bildirim istenirse webhook yalnız `syncInbox()`'ı tetikler. Böylece veri hâlâ ham EML olarak IMAP'ten gelir ve kayıp olay riski cron ile kapanır.

### 3.1 MailSource arayüzü (ileride, REST gerekirse)
`lib/mail-center/sources/` altında:

```ts
interface MailSource {
  id: 'imap' | 'lark-api';
  isConfigured(): boolean;
  account(): string | null;
  /** imleçten devam eden parti; ham EML varsa onu da döner */
  fetchBatch(cursor: unknown, budget: { max: number; deadlineMs: number }):
    Promise<{ items: NormalizedMail[]; nextCursor: unknown; hasMore: boolean }>;
}
type NormalizedMail = {
  sourceKey: string;           // IMAP: `${uidValidity}:${uid}`, Lark: message_id
  raw?: Buffer;                // varsa verifyMailAuth / DSN bunu kullanır
  messageId, from, to, subject, text, html, sentAt, inReplyTo, references,
  attachments: { filename, contentType, size, fetch(): Promise<Buffer> }[];
  providerAuth?: { verified: boolean; reason: string };  // raw yoksa (Lark REST)
};
```
`lib/mail-inbox.ts` içindeki ortak boru hattı (eşleştirme, bounce, R2 ekleri, upsert) kaynaktan bağımsız hale getirilir. Bugünkü IMAP kodu `ImapSource` olur.

### 3.2 InboxMessage'a kaynak alanı
- (a) için **gerekmez**: yine IMAP, `mailbox`+`uid` tekilliği korunur. Gmail'den Lark'a geçişte UID'ler çakışabilir. Geçişte `mailbox` değeri `LARK:INBOX` gibi ayrı bir önek alabilir ya da imleç sıfırlanır (eski Gmail satırları kalır).
- (b) için **gerekir**: Lark `message_id` bir dizedir, `uid Int` alanına sığmaz. Bu ihtiyaç `docs/audit/2026-10-08/SCHEMA-REQUESTS-ek.md` dosyasına talep olarak eklendi (şemaya dokunulmadı).

### 3.3 Authentication-Results ve Lark
- **IMAP yolunda:** Lark MX'i gelen maile kendi `Authentication-Results` başlığını ekler [doğrula]. Lark'tan gelen gerçek bir mailin ham kaynağına bakılıp ilk `Authentication-Results:` satırındaki authserv-id alınır ve `MAIL_AUTHSERV_ID` buna ayarlanır. Bu ayarlanana kadar her şey `authVerified=false` olur (güvenli varsayılan).
- **REST yolunda:** başlık gelmez. Yerine `security_level` (`is_risk`, `via_domain`, `is_header_from_external`) kullanılabilir. Bu, hizalı DMARC kanıtı **değildir**. `authVerified` alanı `null` ya da "sağlayıcı-onaylı" olarak ayrı işaretlenmeli, stajyer eşleştirmesi bu durumda katı kalmalıdır.

### 3.4 Gönderim
- Önerilen yol: Lark SMTP (`SMTP_HOST=smtp.larksuite.com`, 465). nodemailer aynen kalır, `EMAIL_FROM` alan adı adresine çekilir.
- Lark SMTP'nin gönderim kotası Gmail'den farklıdır [doğrula: günlük limit]. Toplu stajyer maillerinde mevcut hızlandırma ve throttling korunmalıdır.
- İzleme pikseli ve logo için önceki dersler geçerli: logo HTTPS URL olmalı, piksel `display:none` olmamalı, origin `localhost` olmamalı.
- REST send yalnız gerekiyorsa (ör. IMAP/SMTP kapalı bir tenant'ta) kullanılmalı: user token, kullanıcı başına sıralı kuyruk, base64url `raw` EML (nodemailer'ın MailComposer çıktısı doğrudan verilebilir).

### 3.5 Bounce
- (a) yolunda Lark'ın mailer-daemon DSN'leri gelen kutusuna düşer ve `isDeliveryStatusReport` ile `extractBounceInfo` aynen çalışır.
- DSN gövdesindeki izleme token'ı kaynağı korunur, çünkü giden mail aynı HTML ile gider.
- İlk birkaç Lark DSN'si örneklenip ayrıştırıcının uyumu test edilmelidir [doğrula].

---

## 4. Proje sahibinin Lark panelinde yapacakları

1. **Alan adı DNS (Lark Admin → Mail → Domain)**: Lark'ın gösterdiği kayıtları eksiksiz ekleyin.
   - MX: Lark'ın verdiği MX kayıtları (eski Gmail/Google MX'leri kaldırılır).
   - SPF: `TXT @ "v=spf1 include:<Lark'ın verdiği include> ~all"`. Başka gönderici varsa (ör. Vercel/SMTP sağlayıcı) aynı kayda include olarak eklenir. **Tek SPF kaydı** olmalı.
   - DKIM: Lark'ın ürettiği seçici ile `TXT <selector>._domainkey` kaydı.
   - DMARC: `TXT _dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc@<alan>; adkim=r; aspf=r"`. Önce `p=none` ile başlanır, raporlar temizse `quarantine` yapılır.
   - Doğrulama ekranında tüm kayıtlar yeşil olmalı.
2. **IMAP/SMTP'yi açın**: Admin → Mail → Ayarlar'da üçüncü taraf istemci erişimine izin verin. Sonra kullanıcı olarak Lark Mail → Ayarlar → Üçüncü taraf istemci bölümünden **istemci şifresi** üretin. Bu şifreyi yalnız Vercel env'e girin.
3. **Test maili**: dışarıdan (Gmail'den) Lark adresinize mail atın. Lark'ta "orijinali göster" ile ilk `Authentication-Results` satırındaki authserv-id değerini bize iletin (`MAIL_AUTHSERV_ID` için).
4. **(Webhook/REST istenirse) Custom App oluşturun**: `open.larksuite.com/app` → Create Custom App.
   - App ID ve App Secret kopyalanır.
   - İzinler: `mail:user_mailbox.message:readonly`, `mail:user_mailbox.message.address:read`, `mail:user_mailbox.message.subject:read`, `mail:user_mailbox.message.body:read`, `mail:event`. Gönderim REST ile yapılacaksa `mail:user_mailbox.message:send` de eklenir.
   - Mail için veri kapsamı yalnız ilgili posta kutusuna verilir.
   - Sürüm yayınlanır ve yönetici onayı verilir.
5. **(Webhook) Olay aboneliği**: Uygulama → Events & Callbacks bölümünde Encrypt Key ve Verification Token ayarlanır, istek URL'si `https://<qratex alan adı>/api/webhooks/lark` olarak girilir, "mail received" olayı eklenir. Ardından Qratex panelindeki "Lark'a bağlan" OAuth adımı bir kez tamamlanır (abonelik user token ister).

## 5. Env değişkenleri

Seçenek (a), yalnız mevcut anahtarlar kullanılır:
```
IMAP_HOST=imap.larksuite.com
IMAP_PORT=993
IMAP_USER=ad@alanadiniz.com
IMAP_PASS=<Lark istemci şifresi>
SMTP_HOST=smtp.larksuite.com
SMTP_PORT=465
SMTP_USER=ad@alanadiniz.com
SMTP_PASS=<Lark istemci şifresi>
EMAIL_FROM="Qratex <ad@alanadiniz.com>"
MAIL_AUTHSERV_ID=<Lark MX authserv-id>
```
Seçenek (c) ve (b) için yenileri:
```
LARK_BASE_URL=https://open.larksuite.com   # Feishu DEĞİL
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=...
LARK_ENCRYPT_KEY=...
LARK_VERIFICATION_TOKEN=...
LARK_MAILBOX=ad@alanadiniz.com
LARK_TOKEN_ENC_KEY=<32 bayt; refresh_token'ı DB/Redis'te AES-GCM ile şifrelemek için>
```
Refresh token env'de **değil**, şifreli olarak `Settings` tablosunda tutulmalı (yenilendikçe değişir).

## 6. Uygulama planı

| # | Adım | Efor |
|---|---|---|
| 1 | DNS (MX/SPF/DKIM/DMARC) ve IMAP açma (sahip) | 0,5 gün (DNS yayılımı dahil) |
| 2 | Env'leri Vercel'e girmek, `MAIL_AUTHSERV_ID` belirlemek, imleci sıfırlamak ya da `mailbox` önekini belirlemek | 1–2 saat |
| 3 | Doğrulama: senkron, `authVerified` dağılımı, Lark DSN örneği, ek indirme, SMTP gönderim ve piksel takibi | 2–3 saat |
| 4 | (İsteğe bağlı) `/api/webhooks/lark`: imza ve şifre çözme, challenge, nonce tekilleştirme, `syncInbox()` tetikleme; testler | 1 gün |
| 5 | (İsteğe bağlı) OAuth "Lark'a bağlan", şifreli refresh-token saklama, abonelik çağrısı | 1 gün |
| 6 | (Yalnız gerekirse) MailSource refaktörü ve LarkApiSource; şema talebi onaylanırsa göç | 3–4 gün |

Toplam: (a) yaklaşık 1 gün. (a)+(c) yaklaşık 3 gün. Tam REST yaklaşık 1 hafta.

Riskler:
- Kiracı IMAP'i kapatabilir: panelde "kaynak çalışmıyor" uyarısı mevcut hata görünürlüğüyle gösterilir.
- Gmail'den Lark'a geçişte UID çakışması: §3.2'deki önek ya da imleç sıfırlama ile çözülür.
- Lark SMTP kotası: [doğrula].
- Bu belgedeki [doğrula] işaretli tüm maddeler.
