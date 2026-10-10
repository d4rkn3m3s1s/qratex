# /customer/feedbacks/[id]/journey

**Amaç:** Müşterinin QR ile gönderdiği tek bir geri bildirimin işletme tarafındaki akışını (alındı → işletme inceledi → işletme yanıt verdi → telafi teklifi → teklifin değerlendirilmesi) şeffaf bir zaman çizelgesi olarak göstermek.

**Genel puan: 4.8 / 10**

**Karar:** **birleştir**. Sayfanın fikri doğru ve değerli (şeffaflık, "sesim duyuldu mu?" sorusuna yanıt), fakat şu anki hâli liste sayfasının (`/customer/feedbacks`) zaten gösterdiği verinin (işletme yanıtı ve telafi linki) üstüne yalnızca "işletme inceledi" adımını ekleyen, ayrı ve zor bulunan bir alt sayfa. Bu yüzden `/customer/feedbacks/[id]` adında tek bir **geri bildirim detay sayfasına** dönüştürülüp hem QR geri bildirimlerini hem tüketim yorumlarını kapsamalı. Zaman çizelgesi de bu detayın merkez bileşeni olmalı.

İncelenen dosyalar: `app/customer/feedbacks/[id]/journey/page.tsx` (117 satır), `app/customer/feedbacks/[id]/journey/layout.tsx`, `app/customer/feedbacks/layout.tsx`, `app/customer/layout.tsx`, `app/api/customer/feedbacks/[id]/journey/route.ts`, `app/api/dealer/feedbacks/[id]/viewed/route.ts`, `app/api/dealer/feedbacks/[id]/reply/route.ts`, `lib/auto-reply-engine.ts`, `lib/notify-email.ts`, `components/dashboard/notification-center.tsx`, `app/customer/feedbacks/page.tsx`, `app/api/feedbacks/route.ts`, `app/api/admin/feedbacks/route.ts`, `lib/utils.ts`, `lib/app-locale.tsx`, `lib/api-auth.ts`, `proxy.ts`, `prisma/schema.prisma` (Feedback, RemedyOffer, RemedyTimelineEvent, ConsumptionReview).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel zaman çizelgesi çalışıyor, ama "inceledi" adımı otomatik yanıtta hiç işaretlenmiyor, telafi mesajı ve aksiyonu gösterilmiyor, geri bildirimin kendi metni hiç görünmüyor. |
| UX | 4/10 | Sayfaya yalnızca listedeki küçük bir "Yolculuk" düğmesinden gelinebiliyor. Bildirim ve e-postadan doğrudan link yok, sayfada hiçbir aksiyon yok, geri dönüşte QR sekmesi kayboluyor. |
| Görsel | 4/10 | Standart shadcn kartları ve düz bir dikey liste kullanılıyor. Oyunlaştırılmış müşteri panelinin geri kalanıyla (motion, glass kartlar, `DashboardPageHeading`) görsel dil tutarlı değil. Hiyerarşi zayıf. |
| Mimari | 5/10 | İstemci tarafında tek fetch var, API sahiplik kontrolü doğru. Ancak API'de try/catch yok, soft-delete filtresi yok, adım etiketleri API'de sabit Türkçe, adımlar kronolojik değil sabit sırada ve tip tanımı iki yerde kopya. |
| Performans | 7/10 | Tek ve hafif bir sorgu (`findUnique` + include, `take: 30`) var, N+1 yok, `no-store` doğru kullanılmış. Sadece yükleme sırasında tam sayfa spinner ve iskelet yokluğu algılanan hızı düşürüyor. |
| Erişilebilirlik + Mobil | 5/10 | `ol` semantiği ve `max-w-lg` mobil düzeni iyi. Ancak adımın tamamlanıp tamamlanmadığı yalnızca renk ve ikonla anlatılıyor, yükleniyor durumunda `role="status"` yok, mobilde geri düğmesi tam genişlikte. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | "Geri bildirimlerim" geri düğmesi | KISMİ | `journey/page.tsx:59-64` | Linkin hedefi sabit `/customer/feedbacks`. Liste sayfası varsayılan olarak `consumption` sekmesiyle açılıyor (`feedbacks/page.tsx:96`), yani kullanıcı QR sekmesinden geldiği hâlde yanlış sekmeye düşüyor. Metin sabit Türkçe. Mobilde `w-full` olduğu için ghost düğme tam genişlikte duruyor. |
| 2 | Başlık kartı ("Geri bildirim yolculuğu" ve alt metin) | ÇALIŞIYOR | `journey/page.tsx:65-68` | Metinler sabit Türkçe, i18n'e bağlanmamış. Diğer müşteri sayfalarındaki `DashboardPageHeading` yerine özel bir kart kullanılmış. |
| 3 | Sayfa metadata (title/description) | ÇALIŞIYOR | `journey/layout.tsx:4-6`, `messages/tr.json:129-130` | Burası i18n'li. Sayfa gövdesi ise i18n'li değil. |
| 4 | Veri çekme (useEffect, iptal bayrağı) | ÇALIŞIYOR | `journey/page.tsx:29-55` | Unmount olunca state güncellenmiyor. `t` deps dizisinde yok (`:55`), bu nedenle dil değişince hata metni güncellenmiyor (küçük sorun). |
| 5 | Yükleniyor durumu | KISMİ | `journey/page.tsx:70-74` | Yalnızca tam sayfa `Loader2` gösteriliyor. İskelet yok, `role="status"` ya da `aria-live` yok. |
| 6 | Hata durumu kartı | KISMİ | `journey/page.tsx:75-79` | "Yeniden dene" düğmesi yok. Sunucu 500 dönüp HTML gövde gelirse `res.json()` (`:37`) patlıyor ve kullanıcı ham `SyntaxError` İngilizce metnini görüyor. |
| 7 | Boş `id` savunması | KISMİ | `journey/page.tsx:23,30` | `id` boşsa effect hemen dönüyor ama `loading` true kaldığı için spinner sonsuza dek dönüyor. Dinamik rotada bu pratikte zor oluşur. |
| 8 | Özet kart: işletme adı | ÇALIŞIYOR | `journey/page.tsx:85`, `route.ts:113` | Bayi yoksa `qrCode.name` gösteriliyor. |
| 9 | Özet kart: "Puan: x/5" | KISMİ | `journey/page.tsx:87` | Yıldız görseli yok. Oyunlaştırma ekonomisinde "Puan" kelimesi kazanılan puanla karışıyor (liste sayfası yıldız kullanıyor). |
| 10 | Özet kart: gönderim zamanı | KISMİ | `journey/page.tsx:87`, `lib/utils.ts:33-71` | `formatRelativeTime` locale parametresi verilmeden çağrılıyor, bu yüzden her zaman Türkçe çıkıyor. Mutlak tarih ya da tooltip yok. |
| 11 | Adım: "Geri bildiriminiz alındı" | ÇALIŞIYOR | `route.ts:65-70` | Her zaman tamamlanmış görünüyor. |
| 12 | Adım: "İşletme geri bildiriminizi inceledi" | KISMİ | `route.ts:71-76`, `dealer/feedbacks/page.tsx:196,258`, `lib/auto-reply-engine.ts:74-80` | `dealerFirstViewedAt` yalnızca bayi yanıt ya da telafi diyaloğunu açınca yazılıyor, listede okumak sayılmıyor. Otomatik yanıt bu alanı hiç yazmıyor. Ayrıntı Bulgu 1'de. |
| 13 | Adım: "İşletme yanıt verdi" ve yanıt metni | KISMİ | `route.ts:77-83`, `journey/page.tsx:106-108` | Çalışıyor, fakat AI veya kural tabanlı otomatik yanıt da "İşletme yanıt verdi" olarak sunuluyor ve otomatik olduğu belirtilmiyor (`auto-reply-engine.ts:76-79`). |
| 14 | Adım: "Size telafi teklifi sunuldu" | KISMİ | `route.ts:86-94`, `journey/page.tsx:106` | API `detail: firstOffer.message` gönderiyor, ama sayfa detayı yalnızca `dealer_replied` için çiziyor, yani telafi mesajı hiç görünmüyor. Teklif `id`'si dönmediği için `/customer/remedy/[offerId]`'e link de verilemiyor. |
| 15 | Adım: "Telafi teklifini değerlendirdiniz" | KISMİ | `route.ts:95-101` | Adım yalnızca `accepted` olduğunda tamamlanıyor. `expired` durumunda "süresi doldu" bilgisi yok, adım sonsuza dek gri kalıyor. `pending` durumunda "Şimdi seç" aksiyonu yok. Etiket ("değerlendirdiniz") kabul dışındaki sonuçlarla da anlamsal olarak uyumsuz. |
| 16 | Dikey bağlayıcı çizgi | ÇALIŞIYOR | `journey/page.tsx:101` | Basit `w-px` çizgi. Tamamlanan bölüm renklendirilmiyor. |
| 17 | Tamamlandı/bekliyor görsel durumu | KISMİ | `journey/page.tsx:96-103` | Durum yalnızca renk ve ikonla anlatılıyor. Ekran okuyucu için metin ("tamamlandı", "bekleniyor") ya da `aria-current` yok. lucide 0.303 SVG'leri etiketsiz. |
| 18 | API sahiplik kontrolü (IDOR koruması) | ÇALIŞIYOR | `route.ts:24-26,57-62` | CUSTOMER yalnızca kendi `userId`'sini görebiliyor. Anonim geri bildirimlerde (`userId=null`) 403 dönüyor, bu doğru. |
| 19 | Rota rol koruması (proxy) | ÇALIŞIYOR | `proxy.ts:53,124` | `/customer` CUSTOMER rolüne bağlı. |
| 20 | Soft-delete edilmiş geri bildirim filtresi | BOZUK | `route.ts:29-30` ve karşılaştırma için `app/api/feedbacks/route.ts:43`, `app/api/admin/feedbacks/route.ts:366-369` | Liste `deletedAt: null` ile filtreliyor, journey API filtrelemiyor. Admin tarafından moderasyonla kaldırılan geri bildirim bu sayfada hâlâ eksiksiz görünüyor. |
| 21 | API hata yönetimi (try/catch, DB erişilemezlik) | EKSİK | `route.ts:20-119` | Diğer uçlarda kullanılan `responseIfDatabaseUnavailable` ve try/catch burada yok. DB hatası Next'in HTML 500'üne dönüşüyor ve istemcide Özellik 6'daki ham hataya yol açıyor. |
| 22 | Geri bildirimin kendi metninin gösterimi | EKSİK | `route.ts:110,112` (döndürülüyor), `journey/page.tsx:40-45` (kullanılmıyor) | `text` ve `qrName` API'den geliyor ama sayfa bunları atıyor (ölü veri). Kullanıcı neyin yolculuğuna baktığını göremiyor. |
| 23 | i18n (TR/EN) | KISMİ | `journey/page.tsx:62,66,67,87,47`, `route.ts:52,59,67,73,79,90,98` | Sayfada yalnızca 1 anahtar `t()` ile çevriliyor. Adım etiketleri API'de sabit Türkçe. `'Hata'` fallback'i sabit. EN kullanıcı tamamen Türkçe bir sayfa görüyor. |
| 24 | Önbellek başlıkları | ÇALIŞIYOR | `route.ts:4,117` | `PRIVATE_NO_STORE_HEADERS` kullanılıyor, kişisel veri CDN'e düşmüyor. |
| 25 | Teklif görünürlük filtresi (onay kuyruğu ve reddedilenler gizli) | ÇALIŞIYOR | `route.ts:34-36`, `api/customer/remedy/route.ts:25` | Müşteri tarafındaki diğer uçlarla tutarlı. |
| 26 | Canlı güncelleme / yenileme (polling, odakta yeniden çekme, pull-to-refresh) | EKSİK | `journey/page.tsx:29-55` | Veri tek seferlik çekiliyor. İşletme sayfa açıkken yanıt verirse kullanıcı görmüyor. |
| 27 | Bildirim ve e-postadan derin link | EKSİK | `reply/route.ts` (FEEDBACK_REPLY, `data: { feedbackId }`), `notification-center.tsx:507-514` (yalnızca remedy yönlendiriyor), `lib/notify-email.ts:127` (`ctaPath: '/customer/feedbacks'`) | "İşletme yanıt verdi" bildirimi bu sayfaya götürmüyor, bu yüzden sayfa en anlamlı anında bulunamıyor. |
| 28 | Tüketim yorumu (ConsumptionReview) yolculuğu | EKSİK | `feedbacks/page.tsx:584` (link yalnızca QR sekmesinde), `schema.prisma` ConsumptionReview: `dealerReply`, `remedyOffers` var | Tüketim yorumunun da yanıtı ve telafisi olduğu hâlde yolculuk sayfası yok. |
| 29 | Kazanılan puan/XP ve rozet katkısı | EKSİK | `app/api/feedbacks/route.ts:330-347` (`points_credited` olayında `feedbackId` yok) | Bu geri bildirimin kazandırdığı puan hiçbir yerde gösterilmiyor. Mevcut veri modeliyle doğru eşleştirme de yapılamıyor. |
| 30 | Bekleme beklentisi (SLA / "işletmeler genelde X saatte yanıtlar") | EKSİK | `journey/page.tsx:92-112` | Bekleyen adımlar için hiçbir bağlam verilmiyor. |
| 31 | Aksiyonlar (yanıta teşekkür et/beğen, işletmeye tekrar yaz, paylaş, işletmeyi favorile, tekrar ziyaret) | EKSİK | Dosyanın tamamı | Sayfa salt okunur ve çıkışsız. Tek aksiyon geri düğmesi. |

**Sayım:** ÇALIŞIYOR 10 (2, 3, 4, 8, 11, 16, 18, 19, 24, 25) · KISMİ 12 (1, 5, 6, 7, 9, 10, 12, 13, 14, 15, 17, 23) · BOZUK 1 (20) · SAHTE 0 · EKSİK 8 (21, 22, 26, 27, 28, 29, 30, 31) · **Toplam 31**

---

## Bulgular

### 1. [yüksek · veri bütünlüğü] Otomatik yanıtta "İşletme inceledi" adımı hiç tamamlanmıyor, kronoloji de tersine dönebiliyor
- **Kanıt:** `lib/auto-reply-engine.ts:74-80` yalnızca `dealerReply` ve `dealerRepliedAt` yazıyor, `dealerFirstViewedAt` yazmıyor. Manuel yanıt ise yazıyor (`app/api/dealer/feedbacks/[id]/reply/route.ts:197,224`). Journey bu alanı bağımsız okuyor (`route.ts:71-76`). `dealerFirstViewedAt` ayrıca yalnızca yanıt veya telafi diyaloğu açıldığında yazılıyor (`app/dealer/feedbacks/page.tsx:196,258`).
- **Sorun:** Otomatik yanıt kuralı tetiklendiğinde kullanıcı şu çelişkili tabloyu görüyor: "İşletme inceledi" adımı bekliyor (gri), "İşletme yanıt verdi" adımı tamamlanmış (yeşil). Bayi daha sonra diyaloğu açarsa "inceledi" zamanı yanıttan sonraya düşüyor. Adımlar sabit sırada çizildiği için (`route.ts:64-84`) zaman damgaları geriye akıyor. Ayrıca makinenin ürettiği yanıt "İşletme yanıt verdi" olarak sunuluyor. Sayfanın tek varlık sebebi şeffaflık olduğu için bu hem yanıltıcı hem güven kırıcı.
- **Öneri:** Yolculuğu tek tek alanlardan değil **olay akışından** türetin. Feedback için `FeedbackTimelineEvent` (veya genel `EngagementEvent`) tablosu açılsın; `kind` değerleri `submitted | ai_analyzed | dealer_viewed | auto_replied | dealer_replied | remedy_offered | remedy_accepted | remedy_expired | remedy_completed | points_credited` olsun. Hâlihazırda var olan `RemedyTimelineEvent` deseni (`lib/remedy-timeline.ts`) genelleştirilebilir. Otomatik yanıt `auto_replied` olarak yazılsın ve UI'da "Otomatik yanıt" rozetiyle gösterilsin. "Okundu" sinyali, bayinin listede kartı gerçekten görüntülemesine (IntersectionObserver ve debounce'lu toplu PATCH) bağlansın. API adımları `at`'e göre sıralasın ve geçmişe dönük tutarsızlıkları (`repliedAt < viewedAt`) normalize etsin (`viewedAt = min(viewedAt, repliedAt)`).
- **Efor:** M

### 2. [yüksek · UX/işlev] Telafi teklifi adımı aksiyonsuz ve mesajı görünmüyor
- **Kanıt:** API `detail: firstOffer.message` gönderiyor (`route.ts:93`), sayfa ise detayı yalnızca `s.key === 'dealer_replied'` için çiziyor (`journey/page.tsx:106`). Teklif `id`'si yanıtta yok (`route.ts:86-101`). `expired` durumu ayrı bir adım üretmiyor (`:95-101`).
- **Sorun:** Telafi, müşteri için yolculuğun en değerli anı (bir şey kazanma). Kullanıcı "Size telafi teklifi sunuldu" yazısını görüyor ama ne teklif edildiğini göremiyor ve kabul etmek için tıklayabileceği bir yer yok. Süresi dolan teklif "değerlendirmediniz" gibi sonsuza dek açık kalıyor. Birden fazla teklif olduğunda yalnızca ilki gösteriliyor, kabul edilen teklif ise listenin herhangi bir yerinden bulunuyor. Böylece iki farklı teklifin zamanları tek bir hikâyeye karışabiliyor.
- **Öneri:** API her teklifi `{ id, status, message, options, selectedType, selectedValue, createdAt, acceptedAt, expiresAt }` biçiminde döndürsün. UI'da telafi adımı bir **aksiyon kartına** dönüşsün: `pending` ise birincil CTA "Ödülünü seç" `/customer/remedy/[offerId]`'e gitsin (geri sayımlı); `accepted` ise seçilen ödül ("%20 indirim", "100 puan") ve kullanım durumu gösterilsin; `expired` ise "Süresi doldu" kırmızı-nötr rozeti çıksın. Her teklif kendi alt zaman çizelgesiyle (`RemedyTimelineEvent`) gruplansın.
- **Efor:** M

### 3. [orta · keşfedilebilirlik/UX] Sayfa yalnızca listeden erişiliyor; bildirim, e-posta ve tüketim yorumları bağlanmamış
- **Kanıt:** Sayfaya tek giriş noktası `app/customer/feedbacks/page.tsx:584` (yalnızca QR sekmesinde küçük bir ghost "Yolculuk" düğmesi). FEEDBACK_REPLY bildirimi `data: { feedbackId }` taşıyor ama `notification-center.tsx` bunu yönlendirmiyor (yalnızca `remedy_campaign` için `router.push` var, `:507-514`). Yanıt e-postası `ctaPath: '/customer/feedbacks'` (`lib/notify-email.ts:127`). Otomatik yanıt bildirimi `type: "info"` ve `feedbackId` taşımıyor (`auto-reply-engine.ts:84-91`).
- **Sorun:** Kullanıcının bu sayfaya en çok ihtiyaç duyduğu an "işletme yanıt verdi" bildirimini aldığı an, ama bildirim onu genel listeye bırakıyor. Tüketim yorumlarının yolculuk sayfası hiç yok.
- **Öneri:** Bildirim modeline standart bir `data.href` alanı eklensin ve notification-center bunu genel olarak izlesin (her tip için ayrı `if` yazmak yerine). Yanıt, telafi ve otomatik yanıt bildirimleri `href: /customer/feedbacks/{id}` taşısın. E-posta CTA'sı da aynı derin linke gitsin. Listede kartın tamamı tıklanabilir olsun (ayrı ghost düğme yerine), tüketim yorumları da aynı detay rotasına gitsin (`/customer/feedbacks/[id]?type=review` veya ayrı bir `reviews/[id]`).
- **Efor:** M

### 4. [orta · güvenlik/veri] Soft-delete edilmiş (moderasyonla kaldırılmış) geri bildirim yolculukta görünmeye devam ediyor
- **Kanıt:** `route.ts:29-30` `findUnique({ where: { id } })` çağrısında `deletedAt` kontrolü yok. Liste `deletedAt: null` ile filtreliyor (`app/api/feedbacks/route.ts:43`). Admin silmesi `deletedAt` set ediyor (`app/api/admin/feedbacks/route.ts:366-369`).
- **Sorun:** Admin moderasyonuyla (toksik veya sahte) kaldırılan bir kayıt, linki bilen sahibine tüm adımları ve işletme yanıtıyla açık kalıyor. Listedeki davranışla tutarsız ve moderasyonun etkisini zayıflatıyor. Sahiplik kontrolü olduğu için yabancı erişim (IDOR) yok.
- **Öneri:** `findFirst({ where: { id, deletedAt: null } })` kullanılsın ya da silinmişse 404 yerine "Bu geri bildirim kaldırıldı" durumu dönülsün (kullanıcıya nedenini açıklayan, itiraz yolu gösteren bir boş durum). Aynı kontrol tüm `feedback/[id]` müşteri uçlarında ortak bir `getCustomerFeedbackOr404()` yardımcısına taşınsın.
- **Efor:** S

### 5. [orta · mimari/hata yönetimi] API'de try/catch yok; istemci JSON olmayan yanıtta ham hata gösteriyor
- **Kanıt:** `route.ts:20-119` tamamen korumasız (diğer uçlarda `responseIfDatabaseUnavailable` kullanılıyor, örneğin `viewed/route.ts:73-80`). İstemci `res.json()`'u `res.ok` kontrolünden önce çağırıyor (`journey/page.tsx:37`).
- **Sorun:** Neon soğuk başlangıcı veya bağlantı hatasında Next HTML 500 döndürüyor, `res.json()` `SyntaxError: Unexpected token '<'` fırlatıyor ve bu İngilizce, teknik metin olduğu gibi hata kartına basılıyor (`:47,77`). Yeniden deneme yolu da yok.
- **Öneri:** Route'u standart sarmalayıcıya alın (try/catch, `responseIfDatabaseUnavailable`, Türkçe genel hata). İstemcide fetch'i paylaşılan bir `fetchJson` ya da SWR hook'una taşıyın (`useSWR('/api/customer/feedbacks/'+id+'/journey')`). Bu, `content-type` kontrolü, yerelleştirilmiş hata, `revalidateOnFocus` (Özellik 26'yı da çözer) ve hata kartında "Tekrar dene" düğmesi sağlar.
- **Efor:** S

### 6. [orta · i18n] Sayfa ve adım etiketleri sabit Türkçe; tarih biçimi locale'i yok sayıyor
- **Kanıt:** `journey/page.tsx:62,66-67,87`, `'Hata'` fallback'i `:47`. API etiketleri `route.ts:67,73,79,90,98`. `formatRelativeTime(meta.createdAt)` locale'siz çağrılıyor (`:87,105`), fonksiyon varsayılanı `'tr'` (`lib/utils.ts:35`). Sayfa yalnızca `common.failedToLoad` için `t()` kullanıyor (`:38`). Kardeş liste sayfası ise `useCustomerT` kullanıyor (`feedbacks/page.tsx:31`).
- **Sorun:** `messages/en.json` mevcut ve metadata zaten İngilizce çevrilmiş (`en.json:129-130`). EN seçen kullanıcı İngilizce sekme başlığı ve tamamen Türkçe bir gövde görüyor.
- **Öneri:** API etiket değil yalnızca `key` ve zaman damgası döndürsün, etiketler istemcide `t('feedbackJourney.steps.<key>')` ile çözülsün. Hook olarak müşteri paneliyle tutarlı `useCustomerT` kullanılsın ve `formatRelativeTime(at, locale)` çağrılsın.
- **Efor:** S

### 7. [orta · bilgi mimarisi] Sayfa neyin yolculuğu olduğunu göstermiyor; özet kart zayıf ve "Puan" belirsiz
- **Kanıt:** `text` ve `qrName` API'den dönüyor (`route.ts:110,112`) ama state'e alınmıyor (`journey/page.tsx:41-45`). Özet kartında yalnızca "Puan: x/5 · Gönderim: ..." var (`:87`).
- **Sorun:** Kullanıcı birden çok işletmeye birden çok geri bildirim gönderiyor. Bu sayfada kendi yazdığı metni, fotoğrafını, puanını (yıldız olarak) ve QR noktasının adını (örneğin "Masa 4") göremiyor. Oyunlaştırılmış panelde "Puan" kelimesi kazanılan puan anlamında kullanılıyor, burada "yıldız puanı" anlamında kullanılması kafa karıştırıyor.
- **Öneri:** Sayfanın üstünde bir **"senin sesin" kartı** olsun: işletme logosu ve adı, QR noktası, 1–5 yıldız (liste sayfasındaki `renderStars` paylaşılan bir bileşene çıkarılsın), alıntı stilinde metin, medya küçük resimleri, duygu rozeti ve mutlak tarih. "Puan" yerine "Değerlendirme" ya da yalnızca yıldız kullanılsın.
- **Efor:** S

### 8. [düşük · UX] Geri dönüşte QR sekmesi kayboluyor; mobilde geri düğmesi tam genişlikte
- **Kanıt:** Link sabit `/customer/feedbacks` (`journey/page.tsx:60`). Liste sekmesi `useState('consumption')` ile başlıyor ve URL'den okunmuyor (`feedbacks/page.tsx:96`). Düğmede `w-full sm:w-fit` var (`journey/page.tsx:59`).
- **Sorun:** Kullanıcı QR sekmesinden geldiği hâlde geri döndüğünde tüketim sekmesine düşüyor ve kaydırma konumunu da kaybediyor. Tam genişlikte bir ghost "geri" düğmesi mobil uygulama kalıplarına (sol üstte kompakt geri oku) uymuyor.
- **Öneri:** Sekme `?tab=qr` ile URL'de tutulsun ve geri linki `/customer/feedbacks?tab=qr#fb-{id}` olsun (ya da `router.back()` ve fallback kullanılsın). Mobilde sticky, kompakt bir üst bar kullanılsın (sol: geri oku, orta: işletme adı).
- **Efor:** S

### 9. [düşük · erişilebilirlik] Adım durumu yalnızca renk ve ikonla anlatılıyor; yükleniyor durumu duyurulmuyor
- **Kanıt:** `journey/page.tsx:96-103` (yeşil `CheckCircle2` ya da gri `Circle`, metin yok). `:70-74` (spinner'da `role="status"` veya görünmez metin yok). lucide-react 0.303 (`package.json:76`).
- **Sorun:** Ekran okuyucu kullanıcısı hangi adımın tamamlandığını ve hangisinin beklediğini bilemiyor. Renk körlüğünde yeşil/gri ayrımı zayıf kalıyor.
- **Öneri:** Her `li`'ye `aria-label` (örneğin "Tamamlandı: İşletme yanıt verdi, 2 saat önce") ve görünür, kısa bir durum metni ("Tamamlandı", "Bekleniyor", "Süresi doldu") eklensin. Etkin adıma `aria-current="step"` verilsin. Spinner yerine `role="status"` ve `aria-busy` taşıyan bir iskelet kullanılsın.
- **Efor:** S

### 10. [düşük · görsel/tutarlılık] Görsel dil müşteri panelinin geri kalanıyla uyumsuz; motion yok
- **Kanıt:** Liste sayfası `Card glass hover`, `Motion.div` stagger ve `DashboardPageHeading` kullanıyor (`feedbacks/page.tsx:24,520-526`). Journey düz `Card` ve özel başlık kartı kullanıyor, hiç motion yok (`journey/page.tsx:65-112`).
- **Sorun:** Sayfa panelin "ödül hissi"nden kopuk ve bir admin log ekranı gibi okunuyor. Tamamlanan bölümün çizgisi de renklenmiyor (`:101`), yani ilerleme görsel olarak hissedilmiyor.
- **Öneri:** Aşağıdaki vizyon bölümüne bakın: ilerleme çizgisi dolumu, adım kartlarının sırayla girişi, `useReducedMotion` desteği ve panelin glass kart dili.
- **Efor:** M

### 11. [düşük · kod kalitesi] Tip tekrarı ve effect deps
- **Kanıt:** `JourneyStep` hem `route.ts:9-15`'te `export` ediliyor hem de `journey/page.tsx:12-18`'de kopyalanıyor. `useEffect` deps dizisinde `t` yok (`:55`).
- **Öneri:** Tip `lib/types/feedback-journey.ts` dosyasına taşınıp iki tarafta da import edilsin. SWR'a geçilince deps sorunu kendiliğinden ortadan kalkar.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Canlı durum takibi (Domino's/Getir sipariş takibi, Monzo işlem durumu):** Sayfa açıkken işletme yanıt verdiğinde adım canlı olarak yeşile dönmeli (odakta yeniden çekme, kısa polling ya da mevcut realtime bildirim kanalı). Bekleyen adımda "İşletmeler genellikle ~X saatte yanıtlar" beklentisi gösterilmeli (bayi bazlı medyan yanıt süresi zaten `dealer/benchmark` ve analytics içinde hesaplanabiliyor).
2. **Ödül ve etki geri bildirimi (Starbucks Rewards, Duolingo):** "Bu geri bildirim sana +25 puan, +10 XP kazandırdı" ve "rozet ilerlemene katkı" satırları. Bunun için `points_credited` olayına `feedbackId` eklenmesi gerekiyor (`app/api/feedbacks/route.ts:330-347`).
3. **Etki hikâyesi (Spotify Wrapped / "senin sayende" anlatısı):** İşletme geri bildirime dayanarak bir aksiyon aldıysa (Feedback ile ilişkili `ActionItem`), bu "Önerin uygulandı" adımı olarak gösterilmeli. Kapanış duygusu sadakatin ana tetikleyicisi.
4. **Yanıta tepki verme:** İşletme yanıtına "Teşekkürler" ya da "Yanıt yardımcı oldu mu? (👍/👎)" tepkisi ve isteğe bağlı kısa takip mesajı. Bu, bayinin yanıt kalitesini ölçmeye de veri sağlar.
5. **Telafi aksiyon kartı (Revolut "Action required"):** Bekleyen teklif için sayfanın en üstünde geri sayımlı, birincil CTA'lı bir kart.
6. **Paylaş / tekrar ziyaret:** Olumlu bir kapanışta "işletmeyi favorile", "yakındaki şubeler" ve "tekrar QR okut" gibi döngüyü kapatan sonraki adım önerileri.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı "İşletme yanıt verdi" bildirimine dokunduğunda doğrudan bu ekrana gelir. Ekranın üst yarısında kendi sesini (yıldız ve metin), altında da bu sesin işletmede nasıl yol aldığını bir kargo takibi netliğinde görür. Bekleyen bir ödül varsa ilk göze çarpan şey o olur. Yolculuk kapandığında küçük ve ölçülü bir "döngü kapandı" anı yaşanır.

**Yerleşim (mobil öncelikli, `max-w-lg`):**
1. **Sticky kompakt üst bar:** geri oku, işletme adı ve `?tab=qr` korunarak listeye dönüş.
2. **Durum başlığı (hero):** Tek cümlelik özet ("İşletme 3 saatte yanıt verdi", "İnceleniyor, genelde 1 gün içinde yanıtlanır") ve yanında ilerleme halkası (3/5).
3. **Aksiyon kartı (koşullu):** Bekleyen telafi teklifi için geri sayım ve "Ödülünü seç" düğmesi, `/customer/remedy/[offerId]`'e gider.
4. **"Senin sesin" kartı:** logo, QR noktası, yıldızlar, metin, medya, mutlak tarih.
5. **Zaman çizelgesi:** Olay tabanlı ve kronolojik. Her adımda etiket, göreli ve mutlak zaman, aktör rozeti (İşletme / Otomatik yanıt / Sen), detay (yanıt metni alıntı kartında, telafi seçimi, puan kazanımı) bulunur. Tamamlanan kısım dolu, kalan kısım kesikli çizgiyle gösterilir.
6. **Kazanımlar şeridi:** +puan, +XP, rozet ilerlemesi.
7. **Kapanış ve sonraki adım:** yanıta tepki, favorile, tekrar ziyaret.

**Motion / 3D (yerinde ve ölçülü):**
- 3D gerekmiyor. Bu bir bilgi ekranı, three.js burada yük ve dikkat dağınıklığı getirir.
- framer-motion (`m as Motion`, global LazyMotion) ile ilerleme çizgisi `scaleY` 0'dan tamamlanan orana ~600 ms'de dolsun. Adım kartları 40–60 ms stagger ile `opacity/y` girişi yapsın. Yeni tamamlanan bir adım (son ziyaretten beri değişen, `lastSeenAt` localStorage'da) tek seferlik yumuşak bir yeşil pulse alsın.
- Telafi kabul edildiğinde ya da yolculuk tamamlandığında, mevcut ödül dilinden ödünç alınan küçük bir konfeti veya parıltı yalnızca bir kez gösterilsin.
- `useReducedMotion()` true ise tüm dolum ve stagger anlık olsun, pulse kapatılsın.

**Veri / API değişiklikleri:**
- **Yeni rota:** `/customer/feedbacks/[id]` (detay ve yolculuk). Eski `/journey` buraya 308 ile yönlendirilsin. `type=qr|review` ile ConsumptionReview de desteklensin.
- **API:** `GET /api/customer/feedbacks/[id]` şu biçimi döndürsün: `{ feedback: { id, type, rating, text, media, sentiment, createdAt, qr: { name }, business: { id, name, logo } }, events: [{ kind, at, actor, data }], remedyOffers: [...], rewards: { points, xp }, expectations: { medianReplyHours } }`. Etiketler istemcide i18n ile çözülsün. `deletedAt: null` ve sahiplik kontrolü ortak bir yardımcıda yapılsın, route standart try/catch sarmalayıcısına alınsın.
- **Şema:** `FeedbackTimelineEvent` (ya da `RemedyTimelineEvent`'i kapsayan genel bir `EngagementTimelineEvent`) eklensin ve otomatik yanıt, manuel yanıt, görüntüleme, telafi ve puan olayları buraya yazılsın. `points_credited` analytics olayına `feedbackId` eklensin. `medianReplyHours` Upstash Redis'te bayi bazlı olarak (örneğin 6 saat TTL ile) önbelleğe alınsın.
- **Bildirim:** `Notification.data.href` standardı getirilsin ve notification-center bunu genel olarak izlesin. Yanıt e-postası CTA'sı derin linke gitsin.
- **İstemci:** `useSWR` ile `revalidateOnFocus` kullanılsın. Bekleyen adım varsa 30–60 sn aralıklı, sayfa görünür olduğunda çalışan hafif bir yenileme yapılsın.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/feedbacks` (liste):** İşletme yanıtını ve telafi linkini zaten kart içinde gösteriyor (`feedbacks/page.tsx:545-570`). Journey'nin ek değeri yalnızca "inceledi" adımı ve zaman sırası. **Öneri:** Listedeki kartlar özet olarak kalsın (yanıtlandı/telafi rozetleri) ve kartın tamamı yeni detay sayfası `/customer/feedbacks/[id]`'e gitsin. Journey bu detay sayfasına **birleştirilsin**. Şu an `/customer/feedbacks/[id]` rotasının kendisi yok, bu yüzden URL hiyerarşisi de doğallaşır.
- **`/customer/remedy/[offerId]`:** Kendi zaman çizelgesini (`RemedyTimelineEvent`, `remedy/[offerId]/page.tsx:48-85,249-270`) tutuyor. Detay sayfasındaki telafi bölümü bu olayları gömülü bir alt çizelge olarak göstermeli. Remedy sayfası yalnızca "seçim yapma" aksiyon ekranı olarak kalmalı. İki ayrı zaman çizelgesi bileşeni yerine paylaşılan bir `components/customer/timeline/` bileşeni kullanılmalı.
- **`/customer/journey-score` ve `/api/customer/journey-timeline`:** Adında "journey" geçiyor ama kullanıcının genel gelişim zaman çizelgesi (kayıt, rozet, ödül, tüketim). Kavram çakışması kafa karıştırıcı. Bu sayfa "Geri bildirim durumu / takip" olarak adlandırılmalı. "Yolculuk" kelimesi genel gelişim ekranına bırakılmalı ya da tersi yapılmalı, ama ikisi aynı isimle yaşamamalı.
- **Kaldırma önerilmiyor.** Şeffaflık özelliği ürünün ayırt edici değerlerinden biri ve bayi tarafında `dealerFirstViewedAt` gibi altyapı onun için kurulmuş. Doğru yer ayrı bir alt sayfa değil, geri bildirim detayının kalbi.

---

## Doğrulama (şüpheci inceleme)

### 1. "Otomatik yanıt, şeffaflık yolculuğunda çelişkili ve yanıltıcı durum üretiyor" — **DOĞRULANDI** (önem: YÜKSEK değil, ORTA; güvenlik değil veri bütünlüğü/UX)

**Okunan kanıt:**
- `lib/auto-reply-engine.ts:74-80`: `rule.action === 'reply'` dalında `prisma.feedback.update` yalnızca `dealerReply` ve `dealerRepliedAt` yazıyor; `dealerFirstViewedAt` yazılmıyor. Kural `tone` taşıyorsa metin AI ile üretiliyor (`:60-71`).
- Manuel yanıt yolu ise görüntülemeyi de dolduruyor: `app/api/dealer/feedbacks/[id]/reply/route.ts:197` (ADMIN) ve `:224` (DEALER) → `dealerFirstViewedAt: feedback.dealerFirstViewedAt ?? new Date()`. Yani iki yazım yolu arasındaki tutarsızlık gerçek.
- `processAutoReplies` gerçekten çağrılıyor (ölü kod değil): `app/api/feedbacks/route.ts:501,523,526` ve `lib/inngest/feedback-analyze-pipeline.ts:136`. Kural yönetimi de canlı: `app/api/dealer/auto-reply-rules/route.ts`, `app/api/dealer/auto-replies/route.ts`.
- `app/api/customer/feedbacks/[id]/journey/route.ts:71-83` iki adımı birbirinden bağımsız, sabit sırada kuruyor (`done: !!feedback.dealerFirstViewedAt` / `done: !!feedback.dealerRepliedAt`), sıralama ya da tutarlılık kontrolü yok.
- `dealerFirstViewedAt` yalnızca bayinin yanıt diyaloğunu veya telafi modalını açmasıyla dolar: `app/dealer/feedbacks/page.tsx:196,258` → `app/api/dealer/feedbacks/[id]/viewed/route.ts:43-52` (`viewedAt = new Date()`, yalnızca null ise).
- Sayfa (`app/customer/feedbacks/[id]/journey/page.tsx:93-111`) adımları API sırasıyla çiziyor, aktör bilgisi göstermiyor; şemada (`prisma/schema.prisma:810-814`) yanıtın otomatik/AI olduğunu tutan bir alan yok.

**Yeniden üretim senaryosu:**
1. Bayi, `action: 'reply'` olan aktif bir otomatik yanıt kuralı tanımlar (ör. `rating gte 4`).
2. Giriş yapmış müşteri bu bayinin QR'ına 5 yıldızlı geri bildirim bırakır → `processAutoReplies` çalışır, `dealerReply` + `dealerRepliedAt = T1` yazılır, `dealerFirstViewedAt = null` kalır.
3. Müşteri `/customer/feedbacks/{id}/journey` açar: "İşletme geri bildiriminizi inceledi" gri/bekliyor, hemen altındaki "İşletme yanıt verdi" yeşil/tamamlandı ve yanıt metni işletmenin kendi sözü gibi görünür. Bildirim de "İşletme geri bildiriminize yanıt verdi." diyor (`lib/auto-reply-engine.ts:87`).
4. Bayi ertesi gün panelde bu kaydın yanıt diyaloğunu açar → `dealerFirstViewedAt = T2 > T1` yazılır. Yolculukta "inceledi" adımı artık "yanıt verdi" adımından SONRAKİ bir zaman damgası gösterir (zaman geriye akar). Bayi hiç açmazsa "inceledi" adımı sonsuza dek gri kalır.

**Abartı payı:** Yetkisiz erişim ya da veri sızıntısı yok; etkilenen yalnızca otomatik yanıt kuralı kullanan bayilerin müşterileri. Bu yüzden "kritik" değil, ancak sayfanın tek işlevi olan şeffaflığı doğrudan bozduğu için gerçek ve düzeltilmesi gereken bir bulgu.

**Önerilen düzeltme (ürün seviyesi):**
- **Kaynak bilgisini veriye taşı:** `Feedback`'e `dealerReplySource` (`manual | auto_rule | auto_ai`) ve isteğe bağlı `autoReplyRuleId` eklensin; `auto-reply-engine` bunu yazsın, manuel yanıt rotası `manual` yazsın (manuel yanıt otomatik yanıtın üzerine yazıldığında kaynak da güncellenir).
- **Yolculuğu olay tabanlı kur:** Sabit üç adım yerine olaylar (`submitted`, `auto_replied`, `dealer_viewed`, `dealer_replied`, `remedy_*`) `at`'e göre kronolojik sıralansın. Otomatik yanıt ayrı bir "Otomatik yanıt gönderildi" adımı olarak, "Otomatik" aktör rozetiyle gösterilsin; "İşletme inceledi" adımı bu yanıttan bağımsız olarak beklemeye devam edebilir ve tutarlı görünür.
- **Otomatik yanıt "görüntüleme" sayılmamalı:** `dealerFirstViewedAt`'i otomatik yanıtta doldurmak yanlış olur (bayi gerçekten görmedi); doğru çözüm etiketlemek ve sıralamak.
- **Bildirim/e-posta metni:** Otomatik yanıtta "İşletmeden otomatik yanıt" ifadesi kullanılsın; aynı kaynak alanı bildirimde de okunsun.
- Bu, raporun "Veri / API değişiklikleri" bölümündeki `FeedbackTimelineEvent` önerisiyle birlikte tek seferde uygulanabilir.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/customer/me/voices` (Ben › Seslerim). Sunucu bileşeni `app/customer/me/voices/page.tsx` özet + ilk liste sayfası + telafileri paralel ön yükler; istemci adası `components/customer/m-seslerim/**` (çekmece gövdeleri `next/dynamic` ile yalnız açılınca yüklenir). Veri katmanı `lib/customer-voices/{types,core,server}.ts`; BFF uçları `GET /api/customer/voices` (imleç sayfalı birleşik liste), `GET /api/customer/voices/summary` ("Sesin"), `GET /api/customer/voices/[key]` (detay; `fb-<id>` / `cs-<consumptionId>`), `GET /api/customer/remedy` (telafi listesi, yeniden yazıldı). Hepsi `defineRoute` (yalnız CUSTOMER, zod, hız sınırı, zarf v2). Eski rotalar sorgu parametrelerini koruyarak `permanentRedirect` ile Seslerim'e gider. Testler: `__tests__/lib/customer-voices.test.ts`, `__tests__/api/customer-voices-routes.test.ts`, `__tests__/api/customer-review-write.test.ts` (35 test, yeşil).
### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | KALDIRILDI | Ayrı sayfa yok: çekmece (Esc/kapat), liste filtresi URL'de korunur. Eski rota `?id=fb-<id>`'ye kalıcı yönlenir. |
| 2 | KALDIRILDI | Yerine çekmece başlığı + işletme başlığı (logo, QR noktası, "Mekânı gör"). |
| 3 | KALDIRILDI | Rota yönlendirmeye döndü; metadata Seslerim'de. |
| 4 | ÇALIŞIYOR | react-query (`AbortSignal`; dil değişimi sorunu yok). |
| 5 | ÇALIŞIYOR | `QueryState` iskeleti (`role="status"`). |
| 6 | ÇALIŞIYOR | Türkçe hata + "Tekrar dene"; JSON olmayan gövde ham `SyntaxError` göstermez. |
| 7 | ÇALIŞIYOR | Anahtar doğrulanır; geçersizse 404 durumu (sonsuz spinner yok). |
| 8 | ÇALIŞIYOR | |
| 9 | ÇALIŞIYOR | Yıldız görseli; "Puan" kelimesi kullanılmıyor. |
| 10 | ÇALIŞIYOR | Mutlak tarih/saat (Europe/Istanbul) + uygulama dili. |
| 11 | ÇALIŞIYOR | |
| 12 | ÇALIŞIYOR | Yalnız kayıtlı `dealerFirstViewedAt` VE yanıttan önceyse gösterilir; zaman geriye akmaz, adım uydurulmaz. Otomatik yanıt etiketi için ŞEMA isteği aşağıda. |
| 13 | ÇALIŞIYOR | Yanıt metni + tarih ayrı blokta; "otomatik yanıt" ayrımı ŞEMA isteğine bağlı. |
| 14 | ÇALIŞIYOR | Telafi mesajı + seçim paneli (aynı çekmecede kabul); zaman müşteriye bildirim anı. |
| 15 | ÇALIŞIYOR | Ayrı adımlar: "Telafini seçtin" (+ seçim), "Puan hesabına eklendi" (gerçek miktar), "Süresi doldu". |
| 16 | ÇALIŞIYOR | DS `Timeline` (`<ol>` + `<time>`). |
| 17 | ÇALIŞIYOR | İkon + metin; bekleyen adım "İşletmenin yanıtı bekleniyor" metniyle. |
| 18 | ÇALIŞIYOR | `findFirst({ id, userId })`; başkasının kaydı 404. |
| 19 | ÇALIŞIYOR | |
| 20 | ÇALIŞIYOR | BOZUK düzeldi: moderasyonla silinen kayıt `VOICE_REMOVED` (404) + açıklayıcı durum. |
| 21 | ÇALIŞIYOR | `defineRoute` merkezi hata ve 503. |
| 22 | ÇALIŞIYOR | Metin, medya (yalnız güvenli görsel), yıldız. |
| 23 | ÇALIŞIYOR | Sunucu yalnız adım türünü döner; etiketler istemcide TR/EN. |
| 24 | ÇALIŞIYOR | `private, no-store`. |
| 25 | ÇALIŞIYOR | |
| 26 | ÇALIŞIYOR | Odakta yeniden çekme + yanıt beklenirken sayfa görünürken 60 sn'de bir. |
| 27 | KALAN | Eski rota yönlendirir; bildirim merkezinin `href` izlemesi sahiplik dışı. |
| 28 | ÇALIŞIYOR | Tüketim yorumları aynı çekmecede (`cs-`). |
| 29 | ÇALIŞIYOR (tüketim) / KALAN (QR) | Defterden; QR kredisi kaynağa bağlı değil (sahiplik dışı). |
| 30 | ÇALIŞIYOR | Bayinin son 90 gündeki medyan yanıt süresi (en az 5 örnek; yoksa gösterilmez). |
| 31 | ÇALIŞIYOR (kısmi) | Telafi seçimi, yorum düzenleme, "Mekânı gör" (favori ve tekrar ziyaret mekân sayfasında). Yanıta tepki ŞEMA isteğine bağlı. |

### Kapanan bulgular
1 (kronoloji + uydurma adım yok; "otomatik yanıt" etiketi ŞEMA'ya bağlı), 2, 3 (liste + tüketim yorumu; bildirim derin linki sahiplik dışı), 4, 5, 6, 7, 8, 9, 10, 11 — **11/11** (1 ve 3'teki dış bağımlılıklar hariç).

### ŞEMA İSTEKLERİ
- `Feedback.dealerReplySource` (`manual | auto_rule | auto_ai`): otomatik yanıtı "Otomatik yanıt" olarak göstermek için.
- Yanıta tepki alanı (`Feedback.replyReaction`, `ConsumptionReview.replyReaction`).
