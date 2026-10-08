# Admin / Platform Paneli — Sentez Denetim Raporu

**Tarih:** 2026-10-08 · **Kapsam:** `app/admin/**` altındaki 73 rota (tamamı) · **Kaynak:** `docs/audit/2026-10-08/admin/*.md` sayfa raporları ve her raporun sonundaki "Doğrulama (şüpheci inceleme)" bölümleri
**Kıyas çıtası:** Stripe Dashboard (yaşam döngüsü, audit, yıkıcı işlem güvenliği), Linear (yoğun liste + detay paneli + klavye), Retool iç araçları (form/tablo tutarlılığı), PostHog (deney, metrik sözleşmesi, drill-down)
**Yöntem notu:** Bu sentez yalnızca okuyarak yapıldı. Kod değiştirilmedi, veritabanına, build'e ya da teste dokunulmadı. Doğrulama bölümünde "çürütüldü" olarak işaretlenen alt iddialar sayılmadı. Önemi doğrulayıcı tarafından düşürülen bulgular düşürülmüş önemiyle yazıldı. Sistem geneli kök neden (admin gizli kapısı) bu sentez sırasında `proxy.ts:79`, `proxy.ts:105-118`, `lib/admin-gate-edge.ts:14-22` ve `app/api/admin/settings/admin-gate/route.ts:19-26` yeniden okunarak teyit edildi. `prisma/schema.prisma:1118` (AuditLog `onDelete: Cascade`) da yeniden teyit edildi.

---

## 1. Yönetici özeti

**Panel sağlık puanı: 3,8 / 10.** 73 sayfanın aritmetik ortalaması 4,1. Puanı aşağı çeken iki şey var: sistem geneli bir güvenlik açığı ve puan basımıyla ilgili birden fazla doğrulanmış ekonomi açığı.

Admin paneli geniş: 73 rotada 3.004 özellik envantere girdi. Ancak bu özelliklerin **337'si bozuk ya da sahte**. Panelin asıl sorunu tek tek hatalardan çok, **"yazılan ama hiçbir yerde okunmayan kontroller"** ve **"başarı gösteren ama sonuç üretmeyen akışlar"**. Operatör bir anahtarı kapattığında, bir bayrağı indirdiğinde ya da bir ayarı kaydettiğinde çoğu zaman ürün davranışı değişmiyor, ama ekran değiştiğini söylüyor. Stripe veya Linear düzeyindeki bir iç araçta bu tür yanlış güven en pahalı hata sınıfıdır.

Sayfa kararlarının dağılımı:

| Karar | Sayfa | Anlamı |
|---|---|---|
| koru-iyileştir | 7 | Temel doğru; hedefli düzeltme yeter (intern-emails, inbox, platform-pulse, points-matrix, character-thresholds, games, api-catalog) |
| yeniden-tasarla | 39 | Veri katmanı kısmen kullanılabilir; UX ve mimari yeniden kurulmalı |
| birleştir | 18 | Başka bir sayfanın alt kümesi ya da kopyası; tek yüzeye taşınmalı |
| yeniden-inşa | 8 | Mevcut hali kurtarılamaz (settings, fraud-prevention, ai-dashboard, quests, squads/battles, segments, pages, gate-settings) |
| kaldır | 1 | experience-pulse (tüketicisi olmayan editör) |

**En kritik beş gerçek (hepsi kodla doğrulandı):**

1. **Admin gizli kapısı API katmanında yok.** `proxy.ts:105-118` `/api/*` isteklerini auth middleware'e sokmadan geçiriyor. Kapı kontrolü yalnızca `proxy.ts:79`'daki `/admin` sayfa yollarında çalışıyor. `requireAuth` (`lib/api-auth.ts:52`) gate cookie'sine bakmıyor. Daha ağır olanı: `GET /api/admin/settings/admin-gate` (`route.ts:19-26`) gizli cevabı her ADMIN-rollü oturuma düz metin döndürüyor. `lib/admin-gate-edge.ts:14-22` ise cookie'nin HMAC'ini doğrulamıyor, yalnızca `userId.<64 hex>` biçimine bakıyor; bu yüzden sayfa kapısı da sahte cookie ile geçilebiliyor. Yani gizli kapının koruması fiilen yok. 20'den fazla sayfa raporu bu açığı bağımsız olarak buldu.
2. **Puan ekonomisinin değişmezleri (escrow, atomik tek seferlik kredi, `points_credited` görünürlüğü) birden fazla yoldan delinmiş.** Örnekler: otomatik tamamlanan görevler `/claim` ile ikinci kez ödüllendiriliyor (quests). Admin klan savaşını iptal edince fonlanmış escrow iade edilmeden siliniyor (squads/battles). Kayıt akışı davet limitlerini atlayıp doğrulanmamış hesaplarla puan basıyor (referrals). Tüketim yolundaki sezon bonusu tavansız ve `points_credited` yazılmadan veriliyor (seasonal-campaigns). Admin elle puan eklerken defter dışı ve negatif bakiye üretebiliyor (users).
3. **Denetim izi kalıcı değil.** `AuditLog.user` ilişkisi `onDelete: Cascade` (`schema.prisma:1118`). Bir admin başka bir admini silerse (`app/api/admin/users/route.ts:676`) silinen kişinin bütün denetim geçmişi de kaybolur. OpenAI anahtarı da dahil olmak üzere ayar değerleri audit'e düz metin yazılıyor. Rollback, biçimi uyumsuz audit kayıtlarından çöp ayar satırları üretiyor.
4. **Demo/bootstrap araçları canlı üretim verisine yazıyor.** "AI verisini başlat" gerçek feedback'lere sahte AI sinyali yazıyor ve gerçek analiz kuyruğunu kalıcı olarak boşaltıyor. "Demo sektör verisini sil" bütün bayilerin `businessCategory` alanını null yapıyor. Fraud demosu gerçek müşterileri `flagged` işaretliyor. Innovation demo paketi gerçek bayiye, müşterilere görünen bir flash teklif açıyor. Demo kafe seed'i bilinen şifreli (`Demo123!`) ve doğrulanmış hesaplar oluşturuyor. Bunların hepsi onaysız ve tek tıklık.
5. **Dört form fiilen kullanılamıyor.** pages, pricing, quests ve rewards sayfalarında form bileşeni render içinde tanımlandığı için her tuş vuruşunda input yeniden mount ediliyor ve odak kayboluyor. Quests'te ayrıca tür/tarih uyumsuzluğu oluşturmayı 500'e düşürüyor. Bir STAFF kullanıcısının varlığı `/admin/users`'ı tamamen çökertiyor. SEO'da boş Site URL kaydedilirse admin dahil tüm site çöküyor.

**Pozitif tarafta:** Ekip modülü (103 özellik, yarısı çalışıyor), intern-emails, inbox, platform-pulse ve points-matrix gerçek iş akışı taşıyan, olgunlaşmaya yakın yüzeyler. Prisma şeması ve ekonomi yardımcıları (`creditPointsAndXp`, `debitPoints`, `points_credited`) doğru tasarlanmış; sorun, bunların her yolda kullanılmaması. Doğru desenler projede zaten var: `CardAuditLog` SetNull kullanıyor (`schema.prisma:1649`), `lib/timezone.ts` Europe/Istanbul'u biliyor, `lib/r2-storage.ts` hazır. Yani çözümlerin çoğu sıfırdan icat değil, var olan desenin tutarlı yayılması.

**Önerilen yön (özet):** Önce sekiz P0 epiği (güvenlik kapısı, ekonomi değişmezleri, demo karantinası, audit bütünlüğü, KVKK, çöken sayfalar, "yükleme hatası canlıyı ezer" deseni, yıkıcı silmeler). Ardından paylaşılan bir **Admin UI çekirdeği** (veri kancası, durum paneli, onay diyaloğu, kirli durum çubuğu, metrik sözleşmesi) ve bir **Ayar Kayıt Defteri** (her ayarın okuyucusu, şeması ve sahibi). Son olarak bilgi mimarisini 73 rotadan yaklaşık 40 yüzeye indirmek. Epikler §7'de, ajanlarla paralel uygulanabilecek şekilde dosya kapsamına göre bölündü.

---

## 2. Tüm sayfaların puan tablosu (73/73)

Puanlar 10 üzerinden. "Özellik" sütunu sayfa raporundaki envanter sayısı, "Bozuk+sahte" sütunu bozuk ve sahte durumlu özelliklerin toplamı. Ayrıntılı gerekçe her satırın kendi raporunda (`admin_<route>.md`).

| Route | Genel | İşlevsellik | UX | Görsel | Karar | Özellik | Bozuk+sahte |
|---|---|---|---|---|---|---|---|
| /admin | 4,5 | 5 | 4 | 6 | yeniden-tasarla | 78 | 14 |
| /admin/ab-testing | 3 | 2 | 3 | 5 | birleştir | 35 | 6 |
| /admin/accessibility | 4 | 3 | 4 | 6 | birleştir | 27 | 1 |
| /admin/agent-council | 4,8 | 5 | 5 | 6 | yeniden-tasarla | 42 | 4 |
| /admin/agent-council/agents | 2,5 | 1,5 | 3 | 4 | birleştir | 32 | 2 |
| /admin/agent-council/history | 2,5 | 1 | 3 | 4 | birleştir | 28 | 2 |
| /admin/ai-dashboard | 3,5 | 3 | 4 | 5 | yeniden-inşa | 42 | 9 |
| /admin/ai-detailed | 4,5 | 5 | 4 | 6 | birleştir | 34 | 4 |
| /admin/ai-learning | 4 | 5 | 4 | 5 | yeniden-tasarla | 47 | 3 |
| /admin/ai-quality | 3,9 | 4 | 3 | 4 | yeniden-tasarla | 35 | 2 |
| /admin/ai-settings | 4 | 3 | 4 | 6 | yeniden-tasarla | 45 | 17 |
| /admin/analytics | 4,5 | 4 | 5 | 6 | yeniden-tasarla | 50 | 7 |
| /admin/api-catalog | 5 | 5 | 4 | 6 | koru-iyileştir | 30 | 2 |
| /admin/api-keys | 4,3 | 4 | 4 | 5 | yeniden-tasarla | 42 | 3 |
| /admin/audit | 3,5 | 3 | 3 | 5 | yeniden-tasarla | 37 | 6 |
| /admin/badges | 4,5 | 4 | 4 | 6 | yeniden-tasarla | 57 | 4 |
| /admin/cards | 4,8 | 5 | 5 | 6 | yeniden-tasarla | 48 | 4 |
| /admin/character-test | 3,9 | 4 | 3 | 5 | yeniden-tasarla | 42 | 5 |
| /admin/character-thresholds | 5,5 | 6 | 4 | 6 | koru-iyileştir | 33 | 1 |
| /admin/compliance | 4,2 | 4 | 4 | 5 | yeniden-tasarla | 48 | 8 |
| /admin/coupons | 4,3 | 3 | 4 | 5 | yeniden-tasarla | 36 | 3 |
| /admin/dealers-health | 3,9 | 4 | 3 | 5 | birleştir | 35 | 3 |
| /admin/design-language | 4 | 3 | 4 | 5 | birleştir | 32 | 1 |
| /admin/discovery | 3,5 | 4 | 3 | 3 | yeniden-tasarla | 55 | 9 |
| /admin/donations | 3,5 | 4 | 3 | 3 | yeniden-tasarla | 46 | 3 |
| /admin/economy-sim | 3 | 3 | 3 | 5 | birleştir | 36 | 1 |
| /admin/ecosystem | 4,5 | 5 | 4 | 5 | birleştir | 25 | 0 |
| /admin/ekip | 5 | 6 | 5 | 6 | yeniden-tasarla | 103 | 6 |
| /admin/ekip/departmanlar | 5 | 5 | 5 | 6 | yeniden-tasarla | 43 | 1 |
| /admin/experience-pulse | 3,5 | 2 | 4 | 6 | kaldır | 36 | 5 |
| /admin/features | 3,5 | 2 | 4 | 5 | birleştir | 34 | 4 |
| /admin/feedbacks | 4,4 | 4 | 5 | 6 | yeniden-tasarla | 65 | 8 |
| /admin/fraud-prevention | 2,8 | 2 | 3 | 5 | yeniden-inşa | 36 | 5 |
| /admin/games | 5 | 4 | 5 | 6 | koru-iyileştir | 37 | 6 |
| /admin/gamification-settings | 3,5 | 3 | 3 | 5 | yeniden-tasarla | 29 | 7 |
| /admin/gate-settings | 3,5 | 4 | 5 | 6 | yeniden-inşa | 26 | 4 |
| /admin/inbox | 5,5 | 6 | 5 | 6 | koru-iyileştir | 42 | 0 |
| /admin/innovation | 3,5 | 4 | 3 | 4 | yeniden-tasarla | 47 | 5 |
| /admin/innovation/segment-proposals | 4 | 4 | 4 | 5 | yeniden-tasarla | 35 | 2 |
| /admin/insights | 3 | 2 | 3 | 5 | birleştir | 31 | 4 |
| /admin/intern-emails | 6 | 7 | 6 | 6 | koru-iyileştir | 45 | 1 |
| /admin/league-settings | 3,9 | 3 | 4 | 5 | yeniden-tasarla | 30 | 4 |
| /admin/menu-groups | 4,5 | 5 | 4 | 5 | birleştir | 38 | 3 |
| /admin/modules | 3,5 | 3 | 3 | 4 | birleştir | 29 | 1 |
| /admin/modules/ai-tones | 3,5 | 3 | 3 | 5 | yeniden-tasarla | 30 | 2 |
| /admin/observability | 4 | 3 | 4 | 6 | yeniden-tasarla | 56 | 7 |
| /admin/pages | 3 | 2 | 3 | 5 | yeniden-inşa | 32 | 2 |
| /admin/partners | 3 | 2 | 3 | 4 | birleştir | 33 | 4 |
| /admin/platform-pulse | 5,5 | 6 | 5 | 6 | koru-iyileştir | 41 | 0 |
| /admin/playbooks | 4,2 | 3 | 4 | 6 | yeniden-tasarla | 42 | 3 |
| /admin/points-matrix | 5,4 | 6 | 5 | 6 | koru-iyileştir | 48 | 4 |
| /admin/pricing | 3,8 | 3 | 3 | 5 | yeniden-tasarla | 40 | 10 |
| /admin/privacy-requests | 4,5 | 4 | 4 | 5 | yeniden-tasarla | 36 | 3 |
| /admin/qra-chat-logs | 4,5 | 5 | 4 | 5 | yeniden-tasarla | 40 | 1 |
| /admin/quests | 3,2 | 2 | 3 | 5 | yeniden-inşa | 43 | 10 |
| /admin/referrals | 4 | 4 | 3 | 3 | yeniden-tasarla | 29 | 1 |
| /admin/rewards | 4,3 | 3 | 4 | 6 | yeniden-tasarla | 43 | 9 |
| /admin/roadmap | 4,3 | 3 | 4 | 6 | birleştir | 35 | 3 |
| /admin/seasonal-campaigns | 4 | 4 | 3 | 4 | birleştir | 37 | 4 |
| /admin/seasonal-concepts | 4,3 | 3,5 | 4 | 5,5 | yeniden-tasarla | 34 | 3 |
| /admin/segments | 3,9 | 3 | 4 | 6 | yeniden-inşa | 35 | 3 |
| /admin/seo | 5 | 5 | 4 | 5 | yeniden-tasarla | 52 | 5 |
| /admin/settings | 3 | 2 | 3 | 5 | yeniden-inşa | 80 | 26 |
| /admin/shop | 4,8 | 4 | 4 | 5 | yeniden-tasarla | 47 | 4 |
| /admin/sidebar-order | 4,5 | 5 | 4 | 6 | birleştir | 33 | 1 |
| /admin/squads | 4 | 4 | 3 | 3 | yeniden-tasarla | 34 | 2 |
| /admin/squads/battles | 3,5 | 3 | 3 | 4 | yeniden-inşa | 37 | 8 |
| /admin/surprise-boxes | 5,2 | 5 | 5 | 6,5 | yeniden-tasarla | 40 | 5 |
| /admin/tech/add | 4 | 4 | 4 | 5 | birleştir | 32 | 3 |
| /admin/themes | 4,5 | 5 | 4 | 5 | yeniden-tasarla | 35 | 5 |
| /admin/trust-command | 4,5 | 3 | 4 | 5 | yeniden-tasarla | 46 | 8 |
| /admin/users | 4 | 4 | 4 | 5 | yeniden-tasarla | 69 | 8 |
| /admin/webhooks | 4,5 | 3 | 4 | 5 | yeniden-tasarla | 42 | 3 |
| **Toplam / ortalama** | **4,1** | — | — | — | — | **3.004** | **337** |

**Okuma notları:**
- En düşük beş sayfa: agent-council/agents (2,5), agent-council/history (2,5), fraud-prevention (2,8), ab-testing / economy-sim / insights / pages / partners / settings (3). Bunların ortak özelliği, ekranın gösterdiği şeyin arka planda gerçekleşmemesi.
- En çok bozuk ve sahte içeren sayfalar: settings (26; 18'i sahte ayar), ai-settings (17; 14'ü okunmayan anahtar), /admin dashboard (14), pricing (10), quests (10).
- Görsel puanlar dar bir bantta (3–6,5). Bu da sorunun estetik değil, **tutarlılık ve durum dili** olduğunu gösteriyor: brütalist `border-4 border-black` kartlar, hover'da açılan aksiyonlar, sabit hero kullanımı ve hata durumunun boş durumla aynı görünmesi.

---

## 3. Doğrulanmış kritik hatalar (P0)

Bu listeye yalnızca sayfa raporlarının doğrulama bölümünde **"doğrulandı"** olarak geçen ve etkisi güvenlik, ekonomi, kalıcı veri kaybı, yasal yükümlülük ya da sayfanın kullanılamaz olması olan bulgular alındı. Doğrulayıcının önem düzeltmeleri parantez içinde verildi.

### 3.1 Güvenlik ve yetki

| # | Hata | Kanıt | Etki |
|---|---|---|---|
| P0-1 | Admin gizli kapısı `/api/admin/*` katmanında uygulanmıyor; kapı cevabı API'den sızıyor; edge'de cookie HMAC'i doğrulanmıyor | `proxy.ts:105-118` (/api doğrudan `NextResponse.next()`), `proxy.ts:79` (yalnız `/admin` sayfa öneki), `lib/api-auth.ts:52` (gate yok), `app/api/admin/settings/admin-gate/route.ts:19-26` (GET `answer` döndürüyor), `lib/admin-gate-edge.ts:14-22` (yalnız biçim kontrolü) | Rolü ADMIN yapılmış ama cevabı bilmeyen hesap cevabı okuyabilir, PUT ile değiştirip gerçek adminleri dışarıda bırakabilir ve bütün admin yazma uçlarını kullanabilir. `document.cookie` ile sahte cookie yazılarak sayfa kapısı da geçilebilir. 20+ raporda bağımsız olarak doğrulandı. |
| P0-2 | STAFF rolü `/api/ai/detailed` üzerinden platform genelindeki tüm geri bildirimleri okuyabiliyor | `app/api/ai/detailed/route.ts:24-37` (yalnız CUSTOMER reddediliyor, yalnız DEALER daraltılıyor) | Kiracılar arası veri sızıntısı: A işletmesinin personeli tüm platformun yorum metinlerini, AI çıktılarını ve kullanıcı adlarını alabiliyor. |
| P0-3 | KVKK anonimleştirmesi JWT oturumunu iptal etmiyor | `lib/auth.ts:61` (jwt stratejisi), `lib/gdpr-core.ts:154-157` (yalnız `session.deleteMany`), `lib/api-auth.ts:52-80` | Anonimleştirilen kullanıcı 24 saat boyunca aynı token ile profiline yeniden ad, telefon ve adres yazabiliyor. |
| P0-4 | Ekip yöneticisi (CUSTOMER rolünde olabilir) bütün platform kullanıcılarını e-posta ve rolüyle listeleyebiliyor | `app/api/admin/team/members/route.ts:17-26`, `lib/team-access.ts:29` | Kullanıcı tabanının e-posta listesi dışarı çıkarılabilir. Rate limit yok. |

### 3.2 Puan ekonomisi (değişmez ihlalleri)

| # | Hata | Kanıt | Etki |
|---|---|---|---|
| P0-5 | Otomatik tamamlanan görevler `/claim` ile ikinci kez ödüllendiriliyor | `lib/visit-missions.ts:110-128`, `lib/achievements.ts:114-173` (otomatik kredi, `CLAIM_QUEST_REWARD` yazılmıyor); `app/api/gamification/quests/[id]/claim/route.ts:82-101` | Kullanıcının tetikleyebildiği, sistematik çift kredi. |
| P0-6 | Admin klan savaşı iptali fonlanmış escrow'u iade etmeden hard-delete ediyor | `app/api/admin/squads/battles/[id]/route.ts:95-97`; escrow tahsilatı `customer/squads/challenge/route.ts:116-118` | Oyuncu puanı kalıcı olarak yok oluyor; cron iade taraması silinen satırı göremiyor. |
| P0-7 | Kayıt akışı davet kurallarını atlayarak puan basıyor | `app/api/auth/register/route.ts:56-64, 99-145` (modül kapısı, ömür boyu limit ve aylık limit yok; `emailVerified:null` iken COMPLETED + 1000 puan) | Sahte e-postalarla davet çiftliği kurulabilir: 25 kayıt 25.000 puan, üstüne kademe bonusu. |
| P0-8 | Tüketim yolundaki sezon bonusu tavansız ve `points_credited` yazmadan veriliyor | `app/api/dealer/consumptions/route.ts:323-349`; `app/api/admin/seasonal-campaigns/route.ts:20` (bonus en fazla 100.000) | Velocity dedektörü görmüyor. İşbirlikçi bir bayi saatte milyon mertebesinde puan basabiliyor. BIRTHDAY/ANNIVERSARY kampanyaları da herkese uygulanıyor (`lib/seasonal-campaign-live.ts:29-33`). |
| P0-9 | Admin "Puan ekle/düş" defter dışı; negatif bakiye ve ondalıkta 500 üretiyor (doğrulayıcıya göre: Orta, ekonomik risk yüksek) | `app/api/admin/users/route.ts:43-48, 399-405` | `points_credited` yok, `debitPoints` yok. Otomasyon "Execute Now" kayıtsız formla 500 kullanıcıya onaysız puan basabiliyor (`automation/execute/route.ts:41-55`). |
| P0-10 | Sürpriz kutu puanında üst sınır ve audit yok | `app/api/admin/surprise-box/send/route.ts:12, 65-72, 86-101` | 500 alıcıya sınırsız puan, iz bırakmadan. |
| P0-11 | Admin tüketim yorumu silme işlemi hard delete; müşteri aynı tüketime yeniden yorum yazıp yeniden puan kazanabiliyor | `app/api/admin/feedbacks/route.ts:361-364`; RemedyOffer Cascade | Tekrarlanabilir kredi; telafi geçmişi de siliniyor. |

### 3.3 Kalıcı veri kaybı ve canlı veri bozulması

| # | Hata | Kanıt | Etki |
|---|---|---|---|
| P0-12 | Kullanıcı silme denetim izini cascade ile yok ediyor | `prisma/schema.prisma:1118`; `app/api/admin/users/route.ts:676`, `bulk/route.ts:79`, `app/api/user/delete-account/route.ts:39` (audit de yazmıyor) | 5651 / KVKK hesap verebilirliği çöker. Bir bayi silindiğinde QR'ları ve diğer müşterilerin yorumları da gidiyor. |
| P0-13 | "AI verisini başlat" gerçek feedback'lere sahte AI sinyali yazıyor ve gerçek analiz kuyruğunu kalıcı olarak boşaltıyor | `app/api/admin/bootstrap/route.ts:449-488`; `app/api/cron/ai-retry/route.ts:36-41` | Churn/next-best-action değerleri kirleniyor ve bu kayıtlar bir daha analiz edilmiyor. Sahte analizler AI kalite örneklemine de giriyor. |
| P0-14 | "Demo sektör verisini sil" bütün bayilerin kategorisini null yapıyor; seed gerçek bayilere `demo-*` yazıp müşteriye gösteriyor (doğrulayıcı: Orta–Yüksek) | `bootstrap/route.ts:237-279`; `app/api/customer/category-leaderboard/route.ts:30-38` | Müşteri tarafında sahte sektörler görünüyor; elle girilmiş kategoriler kayboluyor. |
| P0-15 | Fraud demosu gerçek müşterileri `flagged` işaretliyor; temizleme gerçek bayrakları da aklayabiliyor | `bootstrap/route.ts:289-334, 357-370` | Gerçek ad ve e-postalarla sahte güvenlik kayıtları; trust/compliance sayaçları kirleniyor. |
| P0-16 | Innovation demo paketi gerçek bayiye, müşterilere görünen aktif flash teklif açıyor | `app/api/admin/innovation/demo-package/route.ts:53-94`; `app/api/customer/innovation/nearby/route.ts:35-40` | 15 km içindeki müşteriler "Demo: Mutlu saat %15" teklifini görüyor. |
| P0-17 | Demo kafe seed'i canlıda bilinen şifreli (`Demo123!`), doğrulanmış hesaplar ve defter dışı puan oluşturuyor | `lib/demo-cafes-seed.ts:102-158` | Bu hesaplarla bayi paneline girilebilir (canlıda butona basılıp basılmadığı doğrulanmadı). |
| P0-18 | Bloklu kart "Müşteriden Kaldır" ile UNUSED oluyor ve tekrar aktive edilebiliyor | `app/api/admin/cards/[id]/unassign/route.ts:46-61`; `app/api/cards/[token]/activate/route.ts:58` | Çalıntı kartı elinde tutan kişi, kartı kendi hesabına bağlayabiliyor. |
| P0-19 | Rozet ve ödül silme onaysız hard delete; kazanımları cascade ile siliyor, iade yok | `app/api/gamification/badges/[id]/route.ts:127` + `schema.prisma:638`; `app/api/gamification/rewards/[id]/route.ts:118` + `schema.prisma:708` | Müşterinin puanla aldığı kupon kodları kayboluyor. Karakter rozeti silinip yeniden oluşunca ödül puanı ikinci kez basılıyor. |
| P0-20 | Plan silme aboneli bayileri ücretsiz kademeye düşürüyor; Stripe webhook FK hatası verebiliyor | `app/admin/pricing/page.tsx:426`; `app/api/admin/pricing/route.ts:157-160`; `schema.prisma:112` | Gelir ve hizmet kesintisi (Stripe kolu mantıksal çıkarım, çalıştırılarak doğrulanmadı). |
| P0-21 | "Yükleme hatası, ardından Kaydet canlıyı ezer" deseni | points-matrix `page.tsx:192-221, 414` (istemci streak varsayılanı sunucudan farklı); league-settings `page.tsx:19-58`; discovery `page.tsx:132,146-147,418`; settings `settings-client.tsx:349-366, 555`; character-thresholds `lib/character-thresholds.ts:65-70`; menu-groups `page.tsx:38-53` | Geçici bir Neon hatasından sonraki tek bir Kaydet; canlı puan matrisini, lig kurallarını, keşif konumlarını ya da 21 sistem ayarını sessizce varsayılana çeviriyor. |

### 3.4 Çöken ya da kullanılamayan sayfalar

| # | Hata | Kanıt |
|---|---|---|
| P0-22 | Form render içinde tanımlı; her tuşta odak kayboluyor | `app/admin/pages/page.tsx:150`, `app/admin/pricing/page.tsx:230`, `app/admin/quests/page.tsx:264`, `app/admin/rewards/page.tsx:235` |
| P0-23 | Görev oluşturma, tür ya da bitiş tarihi seçilince 500 dönüyor | `app/admin/quests/page.tsx:293-296` (DAILY…) ile `lib/validations.ts:167` (daily…) ve `:178` (`z.date()`) uyumsuz |
| P0-24 | Tek bir STAFF kullanıcısı `/admin/users`'ı çökertiyor | `app/admin/users/users-client.tsx:150-154, 906, 939, 1070` (`roleIcons`'ta STAFF yok) |
| P0-25 | Boş Site URL kaydedilince admin dahil tüm site çöküyor | `app/api/admin/seo/route.ts:91-99`, `lib/seo-settings.ts:102`, `app/layout.tsx:49,65` (`new URL('')`) |
| P0-26 | Rozet ve ödül görseli yükleme Vercel'de çalışmıyor (salt-okunur FS) | `app/api/admin/assets/upload/route.ts:81-85` |

### 3.5 Yapay zekâ yönetişimi ve KVKK

| # | Hata | Kanıt |
|---|---|---|
| P0-27 | Admin ya da eğitim, sohbet promptunu değiştirince müşteri sohbetinin gizlilik korumaları devreden çıkıyor | `lib/ai-engine.ts:878-880, 903` (`chatSystemPrompt` tabanın yerine geçiyor), `lib/ai-learning.ts:762-790` |
| P0-28 | Admin'in kapattığı AI analizi cron üzerinden yine çalışıyor (maliyet ve uyum) | `app/api/cron/ai-retry/route.ts:36-46`, `lib/inngest/feedback-analyze-pipeline.ts:30-36` |
| P0-29 | QRA sohbet kayıtları KVKK silme, dışa aktarma ve saklama kapsamı dışında | `lib/gdpr-core.ts:48-78, 117-160`; `app/api/cron/db-cleanup/route.ts:33-45` |
| P0-30 | DSR "Tamamlandı" silme talebini yürütmeden kapatıyor; DSR eylemleri audit'e yazılmıyor | `app/api/admin/privacy-requests/[id]/route.ts:35-46, 85-91`; `lib/gdpr-core.ts:162-170` |

> **Not:** Doğrulayıcının önemini düşürdüğü bazı bulgular P1'e alındı: inbox CSP atlatması (`allow-same-origin` olmadığı için Orta), badges IDOR (Düşük–Orta), API kataloğu metod tespiti (Düşük), OpenAI anahtarının audit'e düz metin yazılması (canlıda gerçek anahtar girilip girilmediği doğrulanmadı, Orta).

---

## 4. Sayfalar arası ortak temalar ve kök nedenler

Aşağıdaki 16 kalıp 73 sayfadaki bulguların büyük çoğunluğunu açıklıyor. Her birinin altında **tek noktadan** düzeltilebilecek bir kök neden var. Epikler (§7) bu kök nedenlere göre kuruldu.

### K1 — Admin kapısı yalnız sayfa katmanında (sistem geneli güvenlik)
**Görüldüğü sayfalar:** ab-testing, analytics, api-keys, audit, dealers-health, donations, feedbacks, gamification-settings, gate-settings, inbox, innovation, platform-pulse, qra-chat-logs, referrals, roadmap, settings, shop, squads, /admin, agent-council/history ve diğerleri.
**Kök neden:** Kapı tasarımı edge'de senkron HMAC yapılamayacağı varsayımıyla "biçim kontrolü yeter" diye kurulmuş (`lib/admin-gate-edge.ts:9-12` yorumu). Bu varsayım iki yerde çöküyor: cookie `document.cookie` ile yazılabiliyor, cevap da API'den okunabiliyor. API'ler ise hiç kontrol edilmiyor.
**Hedef:** Edge'de `crypto.subtle` (Web Crypto) ile asenkron HMAC, `exp` ve `epoch` doğrulaması. `requireAuth(['ADMIN'])` içinde aynı doğrulama ve `GATE_REQUIRED` 403'ü. Gate cevabı yalnız yazılabilir ve hash'li saklanmalı. Kümülatif kilitleme ve audit eklenmeli. Gerçek ikinci faktör olarak TOTP ya da WebAuthn yolu açılmalı.

### K2 — Yazılan ama okunmayan kontroller ("sahte kontrol düzlemi")
Panelin en yaygın ve en yanıltıcı hatası. Örnekler:
- **FeatureFlag:** hiçbir runtime kodu okumuyor (features, tech/add).
- **Modül kill-switch'leri:** 42 modülün 15'i hiçbir yerde uygulanmıyor; `vip_lounge` ve `dealer_shift_pulse` katalogda bile yok (modules).
- **AI ayarları:** 16 anahtarın 14'ü okunmuyor (ai-settings).
- **Oyunlaştırma ayarları:** 7 alanın 5'i write-only; global çarpan yalnız feedback yolunda uygulanıyor (gamification-settings).
- **Sistem ayarları:** 16 ölü alan; Bakım Modu, Kayıt ve Google girişi anahtarları hiçbir şey yapmıyor (settings).
- **Diğerleri:** ajan ağırlıkları (agent-council/agents), A/B kohort çarpanı (ab-testing), sezon konsepti arka plan efekti ve `bonusMultiplier` (seasonal-concepts), lig gradient'i (league-settings), tema `defaultMode` (themes), soft freeze (donations, squads), partner anahtarı (partners), webhook olaylarının 4/5'i (webhooks), "Yayınla" (pages), kupon kullanımı (coupons), fraud motoru (fraud-prevention), experience-pulse vitrini.

**Kök neden:** Bir ayarın **okuyucu sözleşmesi** yok. `Settings` tablosu serbest anahtar/değer deposu, şema `z.unknown()`, ve "bu anahtarı kim tüketiyor" sorusunun cevabı hiçbir yerde kayıtlı değil.
**Hedef:** `lib/settings/registry.ts` kurulmalı. Her anahtar için `{key, zodSchema, reader (dosya:fonksiyon), ownerPage, scope, dangerLevel}` tutulmalı. CI'da okuyucusu olmayan anahtar ve `assertModuleEnabled` çağrılmayan katalog modülü yakalanmalı. UI her kontrolün yanında "Etkisi: API / UI / landing / yok" rozetini göstermeli. Bağlanamayan kontroller kaldırılmalı ya da "Yakında" olarak devre dışı bırakılmalı.

### K3 — Hata durumu boş durum gibi görünüyor
30'dan fazla sayfada `res.ok` kontrol edilmiyor. 401, 403 ve 500 yanıtları "Henüz kayıt yok", "0 kullanıcı" ya da kalıcı spinner olarak görünüyor. Örnekler: agent-council/history, ai-detailed, ai-settings, api-keys, audit, coupons, inbox, insights, partners, privacy-requests, qra-chat-logs, referrals, roadmap, trust-command, webhooks, modules, donations (kalıcı "Yükleniyor"), observability (tek JSON hatası tüm veriyi siliyor).
**Kök neden:** Ortak bir `adminFetch` ya da veri kancası yok; her sayfa kendi `useEffect` + `fetch` kodunu yazıyor.
**Hedef:** `useAdminResource` kancası (SWR veya TanStack Query) ve tek bir `StatePanel` bileşeni: iskelet, hata + Tekrar dene, filtreye duyarlı boş durum, bayat veri rozeti. 401/403'te gate ya da login yönlendirmesi.

### K4 — "Yükleme hatası, ardından Kaydet" ve son yazan kazanır
Ayar ekranları başlangıç state'ini istemcideki sabit varsayılanlarla kuruyor. Yükleme hatası sessiz geçiyor ve Kaydet açık kalıyor. Sunucu tarafında iyimser kilit (`expectedUpdatedAt`) yok.
**Görüldüğü yerler:** points-matrix, league-settings, discovery, settings, character-thresholds, menu-groups, sidebar-order, agent-council/agents, experience-pulse, gate-settings, gamification-settings, seo, themes.
**Hedef:** `idle → loading → ready | error` durum makinesi; ready olmadan form render edilmemeli. İstemci varsayılan kopyaları silinmeli, varsayılan GET'ten gelmeli. PUT'ta `baseVersion` zorunlu olmalı ve uyuşmazlıkta 409 + fark görünümü gösterilmeli. Upsert ile audit tek `$transaction` içinde olmalı.

### K5 — Onaysız, kalıcı ve cascade'li silme
badges, rewards, quests, cards, features, pages, pricing, ekip (tekil ve 200'e kadar toplu), squads/battles, users (bayi silinince QR'lar ve yorumlar), ekip/departmanlar, feedbacks (tüketim yorumu).
**Kök neden:** Şemada `archivedAt`/`deletedAt` deseni tutarsız; `onDelete: Cascade` varsayılan refleks olmuş; ortak onay bileşeni yok.
**Hedef:** Varsayılan aksiyon **arşivle** olmalı. Kalıcı silme yalnız referansı olmayan kayıtta, sunucudan gelen **etki önizlemesiyle** (kaç kazanım, kaç abone, kaç puan) ve ad yazarak onayla yapılmalı. Geri al toast'ı olmalı. Kullanıcı ve değer taşıyan ilişkilerde `Restrict` veya `SetNull` kullanılmalı.

### K6 — Ekonomi değişmezlerinin yol yol delinmesi
Bellekteki "Points economy invariants" kuralları (escrow/net-sıfır, atomik tek seferlik kredi, `points_credited` görünürlüğü, fail-closed cron) yalnız bazı yollarda uygulanıyor. Puan basan yolların envanteri: feedback (doğru), tüketim yorumu (çarpan yok), tüketim pasif puanı (tavansız, olay yok), görev otomatik + claim (çift), admin elle ekleme (olay yok, negatif), otomasyon (onay bypass), sürpriz kutu (sınırsız), karakter rozeti + test reset (tekrar basım), referral kayıt (limit yok), klan savaşı (iade ve ödeme idempotency'si yok), oyunlar (istemci-sunucu eşik ayrışması), çark (yinelenen ödül id'si yanlış dilimi gösteriyor), puan matrisi (üst sınır yok).
**Kök neden:** Tek bir **mint kapısı** yok. Her route `creditPointsAndXp`'yi kendi bağlamıyla çağırıyor ya da hiç çağırmıyor.
**Hedef:** `lib/economy/mint.ts`: `mint({userId, amount, source, idempotencyKey, cap, actor, reason})`. Tek transaction, `points_credited` zorunlu, kaynak bazlı tavan ve çarpan şelalesi (`lib/economy/reward-pipeline.ts`). Aynı modül economy-sim'in de motoru olmalı (bkz. economy-sim bulgusu: simülasyon gerçek zinciri modellemiyor). `rewardedAt` / `paidOutAt` gibi idempotency kolonları eklenmeli.

### K7 — Demo/bootstrap araçları üretime açık
ai-dashboard, ai-quality, insights, settings, fraud-prevention, innovation, ab-testing ve shop (seed admin düzenlemelerini eziyor) sayfalarında görülüyor. Tek bir `app/api/admin/bootstrap/route.ts` canlı veriye onaysız, audit'siz ve ortam koruması olmadan yazıyor.
**Hedef:** Prod'da `ALLOW_DEMO_SEED` olmadan 403. Demo kayıtları yalnız `isDemo` işaretli sentetik varlıklara yazılmalı, müşteri sorgularında merkezi filtreyle dışlanmalı. `dryRun` sayımı, tipli onay ve audit eklenmeli. Gerçek kullanıcının `fraudStatus`, `businessCategory` ve AI alanlarına asla dokunulmamalı.

### K8 — Gevşek doğrulama ve okunamayan hata sözleşmesi
Ayar uçlarında `z.unknown()` / `z.record(z.unknown())` kullanılıyor: points-matrix, league, discovery, innovation config, seo, settings. Ayrıca PATCH uçlarında hiç şema yok (rewards, quests, ai-tones, badges). Zod `flatten()` nesnesi `new Error(obj)` ile "[object Object]" toast'ı üretiyor (pages, partners, playbooks, pricing). İngilizce zod mesajları kullanıcıya gidiyor (features, games, shop).
**Hedef:** İstemci ve sunucu arasında paylaşılan Türkçe mesajlı zod şemaları; `{error: string, fieldErrors}` sözleşmesi; react-hook-form + zodResolver; P2002 → 409, P2025 → 404 eşlemesi.

### K9 — React durum hataları: render içinde bileşen, sızan dialog state'i, bayat closure
- Render içinde tanımlı form bileşeni: pages, pricing, quests, rewards.
- Edit dialog'u Esc ile kapanınca "Yeni" formu eski kaydı PATCH ediyor ya da kopya oluşturuyor: ai-tones, pages, pricing, rewards, badges.
- Bayat closure: features (eşzamanlı toggle), /admin (toast spam), games (kapatılan oyun Kaydet ile yeniden açılıyor), referrals/squads (çift istek).
- Değişmeyen `key` olmaması: discovery sponsor id'si ve points-matrix streak gün alanı odağı kaybediyor.
**Hedef:** Modül seviyesinde `EntityEditorSheet` deseni; `{mode:'create'} | {mode:'edit', entity}` tek state; açılışta `reset()`; dirty alan PATCH'i.

### K10 — Saat dilimi: sunucu UTC'yi yerel saat sanıyor
analytics (ısı haritası 3 saat kayık), discovery (`isOpenNow` UTC), audit (bitiş günü dışlanıyor), ekip (yorum saatleri `getUTCHours`), platform-pulse (UTC gün kovaları), games ("bugün" UTC), squads/battles (`datetime-local`), fraud-prevention (sunucuda `toLocaleString`), gamification-settings (sezon bitiş tarihi).
**Hedef:** `lib/timezone.ts` üzerine `formatTR`, `dayBucketTR` ve SQL tarafında `AT TIME ZONE 'Europe/Istanbul'` yardımcıları. API yanıtlarına `timezone` alanı eklenmeli.

### K11 — Ölçüm doğruluğu
- `orderBy` olmadan `take` kullanımı: "En iyi işletmeler" rastgele 10 bayiden seçiliyor (/admin, analytics); dealers-health'te 200 sınırı sırasız; segments'te 10.000 sınırı en yenileri dışlıyor.
- `deletedAt` filtresi eksik: analytics, ai-detailed, segments, /admin.
- Asimetrik dönem karşılaştırmaları (analytics).
- Serverless örnek belleğinde metrik: observability (RUM, trafik), ai-dashboard (başarı oranı `|| 100`).
- Pasif bayiye yüksek sağlık puanı: dealers-health 83, innovation v2 100.
- Etiket hataları: yüzde adet gibi gösteriliyor, "30 gün" aslında tüm zamanlar, negatif büyüme yeşil görünüyor.
**Hedef:** Tek `MetricValue` sözleşmesi (`value, unit, window, previous, delta, higherIsBetter, sampleSize, computedAt`). `activeFeedbackWhere` sabiti. Toplamların SQL'de yapılması. Upstash'te önceden hesaplanmış günlük özetler. Örneklem eşikleri (k-anonimlik ≥ 3).

### K12 — Çoğaltılmış motorlar ve çoklu doğruluk kaynağı
| Kavram | Kaynak sayısı | Sayfalar |
|---|---|---|
| Bayi sağlık skoru | 3 motor, 3 eşik (45/65, 50, 70) | dealers-health, innovation, /admin, churn-playbook |
| Müşteri segmenti | 4 tanım | segments, playbooks, dealer campaigns, CLV |
| Lig kuralları | 3 varsayılan; müşteri paneli DB'yi okumuyor | league-settings |
| Fiyat | landing sabiti + DB + Stripe | pricing |
| API anahtarı | 2 sistem (qrx_ SHA-256 / qrk_ bcrypt) | api-keys, partners |
| Kupon | 3 kavram | coupons, rewards, surprise-boxes |
| Webhook olay kataloğu | 2 farklı liste | webhooks, tech/add |
| Deney (A/B) | 2 ürün | ab-testing, innovation |
| Segment onay kuyruğu | 2 kopya | innovation, segment-proposals |
| DSR kuyruğu | 2 kopya | compliance, privacy-requests |
| Menü yapılandırması | 3 sayfa | menu-groups, sidebar-order, settings |
| Tema / konsept paleti | 2 uygulayıcı | themes, seasonal-concepts |

**Hedef:** Her kavram için tek saf modül (`lib/<domain>/core.ts`), birim testleri ve tüm tüketicilerin bu modülden okuması. Tekrar eden yüzeyler birleştirilmeli (§5).

### K13 — Yetim rotalar ve kırık linkler
- Menüden erişilemeyen rotalar: agent-council/agents, agent-council/history, squads/battles.
- squads/battles'taki "Detaylar" linki 404 veriyor.
- Modül katalogundaki 28 "detay" linki ve roadmap'teki 6 link admin'i proxy üzerinden `/admin`'e geri atıyor (`proxy.ts:60-70`).
- Trust-timeline'daki 3 link yanlış sayfaya gidiyor.
- Dashboard'daki `?sentiment=` derin linkleri feedbacks sayfasında okunmuyor; audit sayfası URL filtrelerini okumuyor.
**Hedef:** Merkezi bir `lib/admin/routes.ts` katalogu (rota, menü grubu, derin link parametreleri); href'lerin admin'in erişebildiği rotaya karşılık geldiğini doğrulayan CI testi; tüm liste sayfalarında filtre durumunun URL'de tutulması.

### K14 — Audit kalitesi
- Ölçek: 88 `auditLog.create` çağrısından yalnız 1'i IP/UA yazıyor (compliance).
- Tutarsızlık: entity adları büyük/küçük harf karışık ("User"/"user", "Settings"/"settings"); filtre seçenekleri gerçek veriyle uyuşmuyor (audit).
- `oldData` biçimi değişken; bu yüzden rollback çöp satır üretiyor (settings, themes).
- Gizli değerler düz metin yazılıyor (settings).
- Kritik mutasyonlarda audit hiç yok: api-keys/partners, donations, surprise-boxes, playbooks, ai-tones, character-test, squads freeze, coupons.
**Hedef:** `lib/audit/write.ts` → `writeAudit({actor, action (enum), entity (enum), entityId, before, after, redact, req})`. Merkezi redaksiyon, IP/UA, standart diff biçimi. 88 çağrı noktası codemod ile taşınmalı. Aktör snapshot'ı tutulmalı ve ilişki `SetNull` olmalı.

### K15 — Erişilebilirlik ve dil
Label–input bağı neredeyse hiçbir formda yok. Aksiyonlar yalnız hover'da görünüyor (`opacity-0 group-hover`; badges, rewards, features, quests). Klavyeyle açılamayan `div onClick` kartlar var (ai-quality, segments, themes). Sıralama yalnız fareyle yapılıyor (sidebar-order). Başlık hiyerarşisi h1'den h3'e atlıyor (`CardTitle=h3`). `lib/admin-toast.ts` her dilde Türkçe karaktersiz "Basarili:/Dikkat:" öneki ekliyor. ai-dashboard ve ai-settings'te mojibake var. Paylaşılan `Progress` bileşeni `aria-valuenow` iletmiyor.
**Hedef:** shadcn `Form/FormField`, her zaman görünür `⋯` DropdownMenu, `@axe-core/playwright` smoke taraması, `eslint-plugin-jsx-a11y` ve admin-toast'ın i18n fabrikasına taşınması.

### K16 — Vercel / serverless uyumsuzlukları
- `public/` altına `writeFile`: rozet ve ödül yüklemeleri.
- Modül düzeyi bellek önbelleği: character-thresholds, league-rules, points-rules (60 sn), observability RUM ve trafik, ai-engine usage log.
- `revalidateTag(tag, 'max')` stale-while-revalidate davranıyor: themes kayıttan sonra eski temaya dönüyor; seo ve games değişiklikleri anında yürürlüğe girmiyor.
- Senkron uzun işler: agent-council 14 sıralı LLM çağrısını 60 sn'ye sığdırmaya çalışıyor; intern-emails toplu gönderimi idempotent değil.
- Görünür ama arka planda sağlanmayan kalıcılık: inbox son 40 maile bakıyor.
**Hedef:** Yüklemeler R2'ye. Sürümlü Upstash anahtarlarıyla örnekler arası geçersizleştirme. Anında etki istenen yerde `revalidateTag(tag, {expire:0})`. Uzun işler `after()` / Queues / Workflow ile; iş kaydı ve ilerleme göstergesiyle.

---

## 5. Bilgi mimarisi önerisi

Mevcut durum: 73 rota, sidebar'da üç ayrı "genel bakış" girişi, aynı katalogu yöneten iki ekran, menüde olmayan üç alt sayfa. Hedef: **10 alan altında yaklaşık 40 yüzey**. Her alanın tek bir "ev" sayfası ve sekmeli çalışma alanları olacak.

### 5.1 Birleştirilecek sayfalar

| Yeni yüzey | Birleşen rotalar | Gerekçe |
|---|---|---|
| **Komuta Merkezi** (`/admin`) | /admin + platform-pulse + ecosystem | ecosystem, platform-pulse'un alt kümesi (`ecosystem-summary/route.ts:22-27` ile `platform-pulse/route.ts:32-55` aynı sorgular). Dashboard'da aynı metrik 4–5 kez tekrar ediyor. |
| **Analitik** | analytics + insights | insights'ın tek veri kaynağı (`businessCategory`) gerçek akışlarda yazılmıyor. Sektör kırılımı analitikte bir boyut olmalı. |
| **Bayi Sağlığı** | dealers-health + innovation "Sağlık 2.0" + playbooks (bağlamlı uygulama) | Üç motor tek skora inmeli. Playbook, riskli bayi satırından önizlemeli uygulanmalı. |
| **Segmentler** | segments + innovation/segment-proposals + innovation hub'daki kopya kuyruk | Tek segment kayıt defteri ve tek onay kuyruğu. |
| **Klanlar** | squads + squads/battles (sekme) | battles yetim ve 20 klanla sınırlı. |
| **Ekonomi Stüdyosu** | points-matrix + gamification-settings + economy-sim + league-settings | Ekonomi parametreleri dört sayfaya dağılmış. Simülasyon taslak matrisle çalışamıyor. Önizleme, kaydetme öncesi diff panelinde olmalı. |
| **Rozetler** | badges + character-thresholds + character-test ("Test laboratuvarı" sekmesi, yalnız test hesabı allowlist'iyle) | Aynı rozet motorunun üç parçası. character-test eşikleri yok sayıyor. |
| **Mağaza ve Ödüller** | rewards + shop (Katalog / Kozmetik / Talepler sekmeleri) | Aynı "puan harca" ekonomisi; ortak yaşam döngüsü ve talep defteri. |
| **Kampanyalar ve Teşvikler** | seasonal-campaigns + seasonal-concepts (görsel katman) + surprise-boxes + coupons + referrals | Ortak zaman çizelgesi, bütçe ve hedefleme. Kupon tek kod defterine iner. |
| **AI Operasyon** | ai-dashboard + ai-detailed | Aynı sinyaller, farklı örneklemler. Tek dönem kavramı ve drill-down. |
| **Prompt ve Model Stüdyosu** | ai-learning + ai-settings + modules/ai-tones | Prompt sürümleme, bayi istisnası ve üslup aynı yönetişim modeline bağlı. |
| **AI Kalite** | ai-quality + qra-chat-logs | Etiketleme kuyruğu ve sohbet gözlemi; ortak örnekleme ve aksiyonlar. |
| **Ajan Konseyi** | agent-council + history + agents (Oturum / Geçmiş / Ayarlar sekmeleri) | İki alt sayfa yetim; history yapısal olarak boş. |
| **Güven Merkezi** | trust-command + fraud-prevention | Tek vaka kuyruğu ve tek önem sözlüğü. |
| **KVKK ve Uyum** | privacy-requests (kanonik) + compliance | DSR kuyruğu kopyalanmış. Compliance envanter ve özet sekmesi olarak kalmalı. |
| **Entegrasyonlar** | api-keys + partners + webhooks + tech/add + api-catalog | İki anahtar sistemi tek sisteme inmeli. tech/add üç formun kopyası. |
| **Özellik ve Deney Kontrolü** | modules + features + ab-testing + innovation (deneyler) | Kill-switch, bayrak ve deney tek kontrol düzleminde olmalı. Katalog iki ekranda tutulmamalı. |
| **Navigasyon Stüdyosu** | menu-groups + sidebar-order + settings'teki menü görünürlüğü | Sıra, grup ve görünürlük tek sürükle-bırak ağaçta, canlı önizlemeyle. |
| **Tasarım Sistemi** | themes + design-language + accessibility | Token gezgini, uyum ölçümü, kontrast denetimi ve canlı bileşen galerisi. |
| **Ekip** | ekip + ekip/departmanlar + roadmap ("Girişimler" sekmesi) | Roadmap'teki 16 maddenin 16'sı "shipped" ve 5 aydır bayat. Görevlere bağlı girişim modeli olmalı. |

### 5.2 Kaldırılacak sayfalar
- **/admin/experience-pulse:** tüketici yüzeyi yok; iki ölü GET ucu her çağrıda `AnalyticsEvent` yazıyor. Uçlar, modül girdisi ve menü satırı birlikte kaldırılmalı.
- **/admin/ecosystem** ve **/admin/tech/add:** birleştirmeden sonra yönlendirme olarak kalmalı.
- **/admin/pages:** ürün kararına bağlı. Yayın hattı kurulmayacaksa sayfa, API ve `Page` modeli birlikte kaldırılmalı. Kurulacaksa yeniden inşa edilmeli (bkz. 5.3).
- **innovation demo araçları** ("Paket aç", "Sadece plan"): üretimden çıkarılmalı.

### 5.3 Yeniden inşa edilecek sayfalar
settings (yalnız gerçek ayarlar, kayıt defteri tabanlı), fraud-prevention → Güven Merkezi (vaka yönetimi), ai-dashboard → AI Operasyon, quests (mekanik kayıt defteri ve durumlar), squads/battles (durum makinesi ve escrow servisi), segments (tek motor), gate-settings (gerçek ikinci faktör), pages (karar verilirse).

### 5.4 Yeni menü yapısı

```
Genel Bakış
  ├─ Komuta Merkezi            (/admin — dikkat şeridi, KPI, sağlık, aktivite)
  └─ Analitik                  (sektör kırılımı dahil)
Müşteriler ve Bayiler
  ├─ Kullanıcılar              (liste + /admin/users/[id] 360 görünümü)
  ├─ Bayi Sağlığı              (skor + playbook uygulama)
  ├─ Segmentler                (kayıt defteri + onay kuyruğu)
  ├─ Klanlar                   (Klanlar · Savaşlar)
  ├─ Kartlar
  └─ Geri Bildirimler          (inceleme kuyruğu)
Ekonomi ve Oyunlaştırma
  ├─ Ekonomi Stüdyosu          (Matris · Çarpanlar ve tavanlar · Ligler · Simülasyon)
  ├─ Görevler
  ├─ Oyunlar
  ├─ Rozetler                  (Katalog · Eşikler · Test laboratuvarı)
  └─ Mağaza ve Ödüller         (Ödüller · Kozmetik · Talepler)
Kampanyalar
  ├─ Takvim                    (sezon kampanyaları + görsel konseptler)
  ├─ Sürpriz Kutular
  ├─ Kuponlar
  ├─ Davet Programı
  ├─ Keşif ve Sponsorlu
  └─ Bağışlar
Yapay Zekâ
  ├─ AI Operasyon
  ├─ AI Kalite                 (Değerlendirme · Sohbet kayıtları)
  ├─ Prompt ve Model Stüdyosu  (Sistem · Bayi istisnaları · Üsluplar)
  └─ Ajan Konseyi              (Oturum · Geçmiş · Ayarlar)
Güven ve Uyum
  ├─ Güven Merkezi             (vaka kuyruğu)
  ├─ Denetim Günlüğü
  └─ KVKK                      (Talepler · Envanter · Saklama)
Platform
  ├─ Özellik ve Deney Kontrolü (Modüller · Bayraklar · Deneyler)
  ├─ Entegrasyonlar            (API anahtarları · Partnerler · Webhook · Katalog)
  ├─ Fiyatlandırma
  └─ Gözlemlenebilirlik
İçerik ve Görünüm
  ├─ SEO
  ├─ Tasarım Sistemi           (Temalar · Tasarım dili · Erişilebilirlik)
  └─ Navigasyon Stüdyosu
Ekip ve İletişim
  ├─ Ekip                      (Pano · Departmanlar · Girişimler)
  ├─ Gelen Kutusu
  └─ Stajyer Mailleri
Sistem
  └─ Ayarlar                   (Genel · Kimlik · Güvenlik/Kapı · Bakım)
```

Sidebar'daki bekleyen sayılar (segment önerileri, DSR SLA, açık vakalar, inceleme kuyruğu) rozet olarak gösterilmeli. Cmd+K komut paleti bütün yüzeylere ve kayıtlara (kullanıcı, bayi, kart token'ı) doğrudan erişim sağlamalı.

---

## 6. Tasarım ve motion vizyonu

### 6.1 Dil: "Operatör konsolu"
Hedef his: Linear'ın yoğunluğu, Stripe'ın güvenlik dili, PostHog'un metrik dürüstlüğü. Admin paneli bir pazarlama yüzeyi değil, karar verme aracı. Bu yüzden görsel öncelik sırası **durum doğruluğu → yoğunluk → hiyerarşi → süs** olmalı.

**Kalkacaklar:** sayfa başına büyük `AdminPremiumHero` (yalnız Komuta Merkezi'nde kalsın; koyu temada ilk karede koyu-üstüne-koyu render sorunu da var, `components/admin/admin-premium-hero.tsx:164-170, 231-233`), brütalist `rounded-none border-4 border-black` kartlar (agents, history), anlamsız dönüşümlü accent renkleri (accessibility, design-language), hover'a gizlenen aksiyonlar, emoji ile durum gösterimi.

**Paylaşılan bileşen seti (`components/admin/kit/`):**

| Bileşen | Görev | Çözdüğü kalıp |
|---|---|---|
| `AdminPageShell` | Kompakt başlık, breadcrumb, birincil aksiyon, "Güncellendi X sn önce · Yenile", ortam rozeti (Production) | K3, K13 |
| `useAdminResource` + `StatePanel` | İskelet / hata + Tekrar dene / boş / bayat | K3, K4 |
| `DataTable` (TanStack) | Sunucu sayfalama, URL'de filtre, sütun sıralama, çoklu seçim + toplu işlem çubuğu, j/k gezinme | Çoğu liste sayfası |
| `DetailSheet` | Satırdan sağ panel; `?id=` derin linki | users, feedbacks, audit, trust, cards |
| `EntityEditorSheet` | react-hook-form + paylaşılan zod, create/edit tek state, dirty alan PATCH | K8, K9 |
| `DirtyBar` | Yapışkan "N değişiklik · Fark · Vazgeç · Kaydet", beforeunload | K4 |
| `ConfirmAction` | Sunucudan etki önizlemesi, ad yazarak onay, gerekçe alanı, geri al toast'ı | K5 |
| `MetricTile` / `DeltaBadge` / `Sparkline` | `MetricValue` sözleşmesi; pencere etiketi, örneklem, `higherIsBetter` ile renk | K11 |
| `SeverityBadge` / `StatusBadge` | İkon + metin + renk, tek sözlük (LOW..CRITICAL) | fraud, trust, observability |
| `AuditTimeline` + `DiffView` | Varlık bazlı geçmiş ve alan bazlı fark, güvenli geri alma | K14 |
| `EffectBadge` | "Etkisi: API / UI / yok" — kayıt defterinden | K2 |

**Token disiplini:** Renk anlamsal olmalı (başarı/uyarı/tehlike/bilgi/nötr + 1 marka vurgusu), radius 2 kademe, gölge 2 kademe. Tablolar için 13px, metrikler için tabular-nums. Açık/koyu temada aynı kontrast oranları korunmalı.

### 6.2 Motion
Altyapı mevcut: global `LazyMotion` ve `m as Motion`. Kural: **hareket durumu açıklamak içindir, dekor değildir.**

| Durum | Hareket | Süre / eğri |
|---|---|---|
| Sheet / Dialog açılışı | 12px kayma + opaklık | 180 ms, `easeOut` |
| Liste satırı ekleme/silme | Yükseklik çökmesi + opaklık; iyimser güncellemede satır 400 ms vurgu | 160 ms |
| KPI sayı değişimi | Sayı tween (yalnız değer değişince) | 240 ms |
| Kaydet başarılı | DirtyBar'dan onay rozetine geçiş | 200 ms |
| Sürükle-bırak (navigasyon, kanban) | dnd-kit yerleşme animasyonu | 150 ms |
| Yükleme | Statik iskelet (shimmer yok, reduced-motion'da sabit) | — |

**Kurallar:**
- Yoğun tablolarda giriş stagger'ı yok, en fazla ilk 12 satır.
- `prefers-reduced-motion` açıkken yalnız opaklık kullanılmalı.
- Admin'de konfeti yok. Ekipteki haftalık %100 kutlaması yalnız kullanıcı eylemiyle tetiklenmeli ve `disableForReducedMotion` uygulanmalı (bkz. ekip bulgusu).
- Parallax ve sürekli dönen arka plan yok.
- Süre ve eğri değerleri `lib/motion-tokens.ts` içinde tutulmalı.

### 6.3 Nerede 3D / canvas, nerede sade?
**İlke:** 3D yalnız **müşterinin 3D gördüğü içeriğin önizlemesinde** kullanılmalı. Operasyon yüzeyleri tamamen sade kalmalı.

- **3D (three.js, `ssr:false`, "Önizle" ile tembel yükleme):**
  - Rozetler → *Test laboratuvarı*: karakter küresi/maskot reveal'i ve kademe formu, müşteri bileşenlerinin kendisiyle. Bellekteki "görsel 3B doğrulama tezgâhı" deseni burada yeniden kullanılabilir.
  - Sürpriz Kutular: kutu açılış önizlemesi (imza sürpriz kutusu bileşeni).
  - Admin gizli kapı ekranı (mevcut uzay ekranı) kalabilir. Ancak güvenlik gerçek ikinci faktöre taşındıktan sonra kapının *kendisi* görsel bir kamuflaj olmaktan çıkmalı.
- **2D canvas / SVG (hafif ve anlamlı):**
  - Komuta Merkezi'nde tek bir "platform nabzı" şeridi (24 saatlik olay yoğunluğu, canvas).
  - Ekonomi Stüdyosu'nda kaynak → havuz Sankey diyagramı (SVG).
  - Bayi Sağlığı'nda skor dağılım histogramı.
  - Kampanyalarda zaman çizelgesi ve çakışma görünümü.
  - Tasarım Sistemi'nde kapsamlı (scoped) tema önizleme tuvali (`applyRuntimeThemeToRoot`'un root parametresiyle; global DOM'a yazmadan).
- **Sade (canvas yok):** tüm tablolar, formlar, ayar ekranları, audit, KVKK, güven vakaları, entegrasyonlar.

---

## 7. Önceliklendirilmiş epikler

**Paralel çalışma ilkesi:** Her epik mümkün olduğunca ayrık bir dosya kümesine dokunacak şekilde bölündü; aynı dosyaya dokunan epikler bağımlılık olarak işaretlendi.

**Şema değişikliği uyarısı:** `.env` içindeki `DATABASE_URL` canlı Neon'u gösteriyor. Migration gerektiren her epik (E4, E5, E2a, E2c, E8, E14…) için **önce proje sahibinin onayı ve yedek** (`scripts/db-backup-*`) gerekir. Migration'lar geriye uyumlu (önce ekle, sonra kullan, en son kaldır) yazılmalı.

### P0 — Güvenlik, ekonomi, kalıcı veri kaybı, çöken sayfalar

| Epik | Sayfalar | Gerekçe ve yaklaşım | Efor | Bağımlılık |
|---|---|---|---|---|
| **E1 · Admin kapısı: gerçek ikinci faktör** | gate-settings, tüm `/api/admin/*` | P0-1. Edge'de Web Crypto HMAC + exp + epoch; `requireAuth(['ADMIN'])` içinde gate doğrulaması (`/api/admin/gate` muaf); GET'te cevap dönmemesi (write-only, hash'li); kümülatif kilitleme + `ADMIN_GATE_FAILED` audit; cookie `maxAge`; "tüm kapı oturumlarını sonlandır". Dosyalar: `proxy.ts`, `lib/api-auth.ts`, `lib/admin-gate*.ts`, `app/api/admin/gate`, `app/api/admin/settings/admin-gate`. | M | — |
| **E2a · Görev ödülü idempotency'si** | quests | P0-5. `UserQuest.rewardedAt` + tek atomik `rewardQuest()`; otomatik yollar ve claim aynı fonksiyonu kullanmalı; geçmiş veri `points_credited`'dan backfill edilmeli. Dosyalar: `lib/achievements.ts`, `lib/visit-missions.ts`, `app/api/gamification/quests/**`. | M | migration |
| **E2b · Admin elle puan basımı tek kapıdan** | users, surprise-boxes, character-test, users-automation | P0-9, P0-10. `adjustPointsByAdmin` (`creditPointsAndXp`/`debitPoints` + `points_credited` + gerekçe + üst sınır + eşik üstü ikinci onay); sürpriz kutuda bütçe + audit; character-test reset'i ledger ters kaydıyla ve test hesabı allowlist'iyle; otomasyonda yalnız kayıtlı ve onaylı kural çalışmalı, oluşturan ile onaylayan farklı olmalı. | M | — |
| **E2c · Klan savaşı escrow servisi** | squads/battles | P0-6. `cancelSquadBattle` / `finishSquadBattle` durum makinesi, `paidOutAt` idempotency'si, iade + bildirim + audit, soft-cancel; admin POST'ta "tek açık savaş" invariant'ı ve zod. Dosyalar: `app/api/admin/squads/battles/**`, `lib/gamification-engine.ts`. | M | migration |
| **E2d · Davet kayıt yolu** | referrals | P0-7. `lib/referral-apply.ts`: kayıtta PENDING ve puansız; e-posta doğrulanınca guard'lı `updateMany` ile COMPLETED + kredi; limitler ve modül kapısı tek yerde. | M | — |
| **E2e · Tüketim yolu ve çarpan zinciri** | seasonal-campaigns, points-matrix, feedbacks | P0-8, P0-11. Pasif puan `creditPointsAndXp` + günlük tavan + `points_credited`; BIRTHDAY/ANNIVERSARY için `userId` ile uygunluk; matrise alan bazlı üst sınır şeması; `ConsumptionReview` soft-delete'e ve tekrar korumasının kredi kaydına bağlanması. | M | E2b'deki mint yardımcısını paylaşır |
| **E3 · Demo / bootstrap karantinası** | ai-dashboard, ai-quality, insights, settings, fraud-prevention, innovation, ab-testing, shop | P0-13…P0-17. Prod'da `ALLOW_DEMO_SEED` yoksa 403; yalnız `isDemo` varlıklar; `synthesize_ai_signals`'ın kaldırılması ve yerine audit'li "Bekleyen analizleri işle"; demo paketinin sandbox bayiyle sınırlanması; demo kafe hesaplarının girişten engellenmesi; `dryRun` + tipli onay + audit. Mevcut kirli kayıtlar için ayrı, onaylı temizlik betiği. Dosyalar: `app/api/admin/bootstrap/route.ts`, `app/api/admin/innovation/demo-*`, `lib/demo-cafes-seed.ts`, `lib/cosmetic-seed-server.ts`. | M | — |
| **E4 · Denetim izi bütünlüğü** | audit, compliance, users, settings, themes | P0-12 + K14. `AuditLog.userId` nullable + `SetNull` + aktör snapshot'ı; `writeAudit()` (redaksiyon, IP/UA, standart diff); rollback'in `entityId` ile tek anahtara sınırlanması ve uyumsuz kayıtta düğmenin gizlenmesi; kullanıcı hard delete yerine askıya alma + anonimleştirme; `openaiApiKey` alanının kaldırılması ve audit'teki değerin onaylı redaksiyonu. | L | migration |
| **E5 · KVKK / DSR motoru** | privacy-requests, compliance, qra-chat-logs | P0-3, P0-29, P0-30. `User.sessionVersion` (Redis sıcak katman) ile JWT iptali; DSR durum makinesi (completed yalnız yürütme kanıtıyla); `recordDsrEvent`; `PII_REGISTRY` (qraChatLog, PushSubscription, AuditLog.newData dahil) + şema tarama testi; self-servis export/silme işlemlerinin DSR kaydı üretmesi; müşteri ucunda rate limit ve yalnız hesap e-postasına makbuz. | L | E4 (audit yardımcısı) |
| **E6 · Çöken ve kullanılamayan sayfalar (hızlı düzeltmeler)** | pages, pricing, quests, rewards, users, seo, gamification-settings, economy-sim, feedbacks | P0-22…P0-25. Formların modül seviyesine taşınması; quest enum/tarih uyumu ve 400 dönüşü; STAFF rol sözlüğü (`lib/roles.ts`); SEO `siteUrl` zorunlu + override fallback'inde `\|\|`; null/NaN korumaları; duygu alanı normalizasyonu. Sayfa başına ayrık dosyalar, 9 ajana paralel bölünebilir. | M | — |
| **E7 · "Yükleme hatası canlıyı ezer" + iyimser kilit** | points-matrix, league-settings, discovery, settings, character-thresholds, menu-groups, sidebar-order, agent-council/agents, experience-pulse, gamification-settings, seo, themes | P0-21 + K4. `useAdminResource` durum makinesi; ready olmadan form yok; istemci varsayılan kopyalarının silinmesi; ayar uçlarında `baseVersion` → 409; upsert + audit `$transaction`. Character-thresholds okuyucusu hata durumunu cache'lememeli. | M | E10'un kanca kısmıyla birlikte yapılabilir |
| **E8 · Yıkıcı işlemler: arşiv, onay, etki önizlemesi** | cards, badges, rewards, pricing, quests, features, pages, ekip, ekip/departmanlar | P0-18, P0-19, P0-20 + K5. Kart yaşam döngüsü durum makinesi (`lib/cards/lifecycle.ts`; unassign yalnız ACTIVATED kartta); `archivedAt` alanları; kazanım veya abone varsa 409; `ConfirmAction`; karakter rozetinde silmenin kapatılması; plan arşivleme ve abone taşıma. | M | migration; E10 (ConfirmAction) |
| **E9 · AI kiracı sınırı ve yönetişim** | ai-detailed, ai-settings, ai-learning, ai-dashboard | P0-2, P0-27, P0-28. `/api/ai/detailed` için izin listesi + STAFF kapsamı; analiz pipeline'ı başında `shouldAnalyze` kapısı ve kapalı bayinin cron sorgusundan dışlanması; değiştirilemez gizlilik çekirdeği + yönetilebilir ek prompt; sayfa açılışında LLM çağrısının durdurulması (okuma/üretim ayrımı). | M | — |
| **E2f · Görsel yükleme R2'ye** | badges, rewards, shop | P0-26. `assets/upload` → `uploadToR2`, `remotePatterns`, yerel yazma yalnız development'ta. | S | — |

### P1 — Temel altyapı ve yanıltıcı kontrollerin bağlanması

| Epik | Sayfalar | Gerekçe ve yaklaşım | Efor |
|---|---|---|---|
| **E10 · Admin UI çekirdeği** | Tümü (önce: audit, users, feedbacks, trust) | K3, K8, K9, K15. `components/admin/kit/*` (§6.1 tablosu), `adminFetch` + hata sözleşmesi, admin-toast i18n, `lib/timezone` biçimleyicileri. Diğer epiklerin UI kısmı buna dayanır; ilk sürüm 1 sprintte çıkarılıp sayfalar kademeli taşınmalı. | L |
| **E11a · Ayar kayıt defteri + sistem ayarları yeniden inşası** | settings, gamification-settings, themes, seasonal-concepts, league-settings | K2. `lib/settings/registry.ts`, CI okuyucu kontrolü, 16 ölü alanın kaldırılması, Bakım/Kayıt/Google anahtarlarının gerçekten bağlanması (proxy 503 + register guard + signIn callback), sezon/XP tavanı/seviye ödülü alanlarının bağlanması ya da kaldırılması, `defaultMode` kararı. | L |
| **E11b · Modül ve bayrak kontrol düzlemi** | modules, features, tech/add, ab-testing | K2. Derleme anında `assertModuleEnabled` taraması → katalogda `enforcement` alanı; kill-switch anlamı taşıyanların (api_keys, webhooks, ai_features) API seviyesinde kapılanması; `lib/flags.ts` (Redis + `revalidateTag` + fail-safe) ya da FeatureFlag'in emekliye ayrılması; kimliksiz isteklerin `module_gate_blocked` yazmasının durdurulması; 28 detay linkinin `adminHref`/`previewPath` olarak ayrılması. | L |
| **E12 · Güven Merkezi (vaka yönetimi)** | fraud-prevention, trust-command | Fraud motorunun puan veren tek kapıya bağlanması (`assertRewardAllowed`) ya da silinmesi; `FraudSeverity` enum'u + normalizasyon; triage kuyruğu (çöz/yanlış alarm/ata/gölge ban/puan geri al) + `/api/admin/trust/actions` + audit; KPI'ların düzeltilmesi (HIGH sayımı, bayrağın role göre kırılımı); timeline linklerinin sayfa içi panele çevrilmesi. | XL |
| **E13 · Ölçüm doğruluğu katmanı** | /admin, analytics, ai-dashboard, observability, dealers-health, segments, platform-pulse, ecosystem | K11. `MetricValue` sözleşmesi, `activeFeedbackWhere`, SQL'de sıralı top-N, Europe/Istanbul kovaları, tek `/api/admin/overview` toplayıcısı (bölüm başına Redis TTL, `Promise.allSettled`, gizli sekmede polling yok), `AIUsageLog`'a kalıcı başarı/başarısızlık yazımı, RUM ve trafiğin Redis kovalarına taşınması, outbox `pending/oldest/dead` ayrımı. | L |
| **E14 · Tek skor ve segment motorları** | dealers-health, innovation, segments, playbooks, segment-proposals | K12. `lib/dealer-health` (saf skor + `HEALTH_BANDS`, veri yetersizliğinde null), `CustomerSegment` kayıt defteri + `classify()` + cron anlık görüntüsü; playbook'ta çalıştırılabilir `segmentRule`, `dealerBrief` / `customerMessageTemplate` ayrımı ve görevin taslak olarak doğması. | L |
| **E15 · Entegrasyonlar birleşik modeli** | api-keys, partners, webhooks, tech/add, api-catalog | Kapsam (scope) matrisi + `partnerId`/`dealerId` bağlama + iptal/süre/rotasyon; Partner `qrk_` sisteminin kaldırılması; tek webhook olay kataloğu + secret'ın yalnız yazılabilir olması + SSRF koruması + `after()`/Inngest retry + "Test gönder"; katalog üreticisinin AST'ye taşınması ve erişim sütunu. | L |
| **E16 · Oyunlaştırma doğruluğu** | games, league-settings, badges, character-thresholds, character-test, points-matrix | Oyuna etkin config geçirilmesi ve sunucunun eşikle karar vermesi; `complete` içinde `enabled` kontrolü; lig kurallarının müşteri tüketicilerine sunucudan verilmesi + `findLast`; `Badge.rewardPoints` alanı + karakter seçiminde `isActive`; eşik sınırları + etki önizlemesi; çark ödül id'sinin `randomUUID` ile üretilmesi; streak simülasyonunun sunucu çekirdeğini kullanması. | L |
| **E17 · Teşvik ve ödül ürünleri gerçek değere** | coupons, rewards, shop, surprise-boxes, donations, pricing | Kupon kullanımının cüzdan kaydı üretmesi (ya da yanıltıcı metnin kaldırılması); `UserReward` talep/teslim durum makinesi; shop satın almada `isActive` + `expectedPrice` kontrolü ve tipli `assetKind`; sürpriz kutu kampanya varlığı + `source=admin` filtresi + DB'de rastgele seçim; bağış durum enum'u (PAUSED gerçek olmalı) ve sıfır değer doğrulaması; `stripePriceId` UI'ı + Stripe doğrulaması + landing fiyatlarının DB'den okunması. | XL |
| **E18 · Ajan Konseyi kalıcılığı** | agent-council, agent-council/history, agent-council/agents | Akış sırasında `AgentRun`/`AgentMessage`/`AgentDecision` yazımı + `runId` URL'si; mesaj başına `live` bayrağı; council-to-actions idempotency + audit + önizleme; ağırlıkların bağlanması ya da sayfanın kaldırılması; üretimin arka plan işine taşınması; sekmeli tek çalışma alanı. | L |
| **E19 · Ekip modülü sertleştirme** | ekip, ekip/departmanlar | `priorityRank`; `lib/team-task-transitions.ts` durum makinesi (otomasyon, toplu işlem ve cron aynı yolu kullanmalı); soft delete + R2 temizliği; görev alanlarının düzenlenebilmesi; aday aramasının maskelenmesi + rate limit; üye PUT'unun transaction'a alınması; departman arşivleme; `createdBy` cascade'inin kaldırılması; Europe/Istanbul saatleri. | L |

### P2 — Bilgi mimarisi ve içerik yüzeyleri

| Epik | Sayfalar | Gerekçe ve yaklaşım | Efor |
|---|---|---|---|
| **E20 · Menü yeniden yapılandırma ve birleştirmeler** | §5'teki tüm birleşmeler | `lib/admin/routes.ts` katalogu, yeni sidebar, eski rotalara yönlendirme, href CI testi, sidebar sayaç rozetleri, experience-pulse ve ölü uçlarının kaldırılması. E10'dan sonra yapılmalı. | L |
| **E21 · Navigasyon Stüdyosu** | menu-groups, sidebar-order | `buildNavBlocks` saf fonksiyonu, dnd-kit ağacı (klavye erişimli), TR/EN grup adları, canlı önizleme, tek API + transaction, ayarların layout'ta sunucuda okunması (CLS'nin giderilmesi). | M |
| **E22 · İçerik ve görünüm** | seo, themes, design-language, accessibility, seasonal-concepts, pages | SEO tek zod şeması + sürüm zaman çizelgesi + noindex onayı + health'e robots kontrolü; tema taslak/önizle/yayınla + atomik kayıt + `revalidateTag(expire:0)` + "Aydınlık" ailesinin düzeltilmesi; konsept paletinin ThemeColorsProvider girdisi olması + zaman çizelgesi; tasarım sistemi sayfasının canlı galeri + uyum ölçümüne dönüştürülmesi; pages için ürün kararı. | L |
| **E23 · Gelen kutusu ve mail güvenliği** | inbox, intern-emails | HTML'in senkronda sanitize edilmesi (`bodyHtmlSafe`); eklerin private R2 + presigned URL ile sunulması; UID artımlı senkron; References zinciri; saklama politikası; intern-emails'te taslak korunması, PUT zod'u, kişisel verinin kaynak koddan temizlenmesi, toplu gönderimin iş kuyruğuna taşınması. | M |
| **E24 · AI kalite döngüsü** | ai-quality, qra-chat-logs, ai-learning, modules/ai-tones | Rubrikli alan bazlı değerlendirme + "kaydet ve sonraki" + metrikler; örneklemden heuristic/fallback kayıtlarının dışlanması; `source` alanı; sohbet `outcome`/oturum/token alanları + trigram indeksi + audit'li tam metin; prompt sürümleme (`AIPromptVersion`); üslup slug kilidi ve bayi seçicisinin DB'den beslenmesi. | L |
| **E25 · Sistem geneli erişilebilirlik ve dil** | Tümü | `jsx-a11y` kuralları, `@axe-core/playwright` smoke taraması, mojibake CI lint'i, Label/aria düzeltmeleri, `Progress` aria-valuenow, `CardTitle` hiyerarşisi. E10 bileşenleriyle birlikte kademeli ilerler. | M |

### P3 — Ürün olgunluğu

| Epik | Sayfalar | Gerekçe ve yaklaşım | Efor |
|---|---|---|---|
| **E26 · Deney ürünü** | ab-testing, innovation | `Experiment` / `ExperimentAssignment`, hash tabanlı atama, istatistik motoru (lift, %95 GA, SRM), guardrail metrikleri, kazananı bayrağa yayınlama. E11b'den sonra. | XL |
| **E27 · Kullanıcı 360 ve operatör verimliliği** | users, /admin, feedbacks, cards | `/admin/users/[id]` (kimlik, puan defteri, güven, aktivite, audit), süre sınırlı ve audit'li impersonation, Cmd+K, kayıtlı görünümler, eşik tabanlı uyarı kuralları (push/e-posta). | XL |
| **E28 · Ekonomi simülasyonu kalibrasyonu** | economy-sim → Ekonomi Stüdyosu | Gerçek `reward-pipeline` modülüyle taslak matris what-if analizi, son 30 gün baseline'ı, kaynak/havuz net akışı, duyarlılık analizi. E2 serisi bittikten sonra. | L |
| **E29 · Girişimler (roadmap) ve tasarım uyum ölçümü** | roadmap, design-language | `RoadmapInitiative` + `CompanyTask.initiativeId`, ilerlemenin görevlerden türetilmesi, build-time `design-audit.json` ile drift panosu. | M |

### Paralel uygulama planı (önerilen dalgalar)

1. **Dalga 1 (aynı anda, ayrık dosyalar):** E1, E2b, E2d, E3, E6 (9 alt ajan), E9, E2f.
2. **Dalga 2 (sahip onayıyla migration gerektirenler):** E2a, E2c, E4 → E5, E8; E2e (E2b'nin mint yardımcısını kullanır); E7 ve E10 çekirdeği paralel.
3. **Dalga 3:** E11a, E11b, E12, E13, E14, E15, E16, E17, E18, E19 (her biri kendi domain klasöründe).
4. **Dalga 4:** E20–E25. **Dalga 5:** E26–E29.

Her epiğin "bitti" tanımı: ilgili sayfa raporundaki doğrulanmış bulgu yeniden üretilemiyor olmalı; ekonomiye dokunan her yol `points_credited` ile görünür olmalı; yeni ayar kayıt defterine okuyucusuyla birlikte girmeli; UI hata, boş ve yükleniyor durumlarını ayrı göstermeli. Kullanıcı tercihi gereği build en sona bırakılmalı (ilerleme `tsc` ile doğrulanır). Görsel değişiklikler tahminle değil, ekran görüntüsüyle doğrulanmalı.
