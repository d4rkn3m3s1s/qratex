# Uçtan Uca (E2E) Test Turu — Özet Raporu

Tarih: 2026-10-11 · Dal: `feat/platform-overhaul` · Kaynak: `.wf-tmp/e2e/*/REPORT.md` (17 dosya) + ajan özetleri (5 alan rapor dosyası yazamadı: a-genel-kullanici, b-kasa-katalog, m-cuzdan, m-ses-ayar, p-auth)
Ortam: localhost `next dev` + **canlı Neon** DB, 22 paralel ajan. Dev sunucusu turun büyük kısmında aşırı yüklüydü (istek başına 3–70 sn), bu birçok "AÇIK" maddenin ve kısaltılmış turun nedeni.

## Kısa sonuç

| Ölçü | Değer |
|---|---|
| Test alanı (ajan) | 22 (müşteri 8, bayi 5, admin 4, public 3, çapraz 2) |
| Test edilen rota (alan bazında, çapraz denetimler hariç) | ~146 |
| Çapraz denetim | x-mobil-native 19 rota × 4 profil (76 ölçüm), x-tema 18 rota (171 yükleme) |
| Ekran görüntüsü | ~1.300+ |
| **DÜZELTİLDİ** | **~46 hata** (yaklaşık 30 commit; sayı ajan raporlarından toplandı, m-oyunlar-2'deki 6'lı kırpma düzeltmesi ajanın tahmini) |
| **GEÇTİ** | Taramaların çok büyük kısmı; yatay taşma tüm turlarda 0 |
| **AÇIK** | ~45 madde: gerçek ürün sorunu ~15, tasarım/ürün kararı ~12, test edilemeyen ~12, ortam kaynaklı ~6 |
| Son doğrulama | `tsc` 0 hata · `jest` 352/352 suite, 5046/5046 test (bu turda 1 kırık suite düzeltildi, aşağıda) |

Dürüstlük notu: Altı alan (m-ben, m-ses-ayar, p-public, p-qr-huni, p-auth, a-genel-kullanici) **kısaltılmış/kısmi tur** yaptı. "GEÇTİ" sayıları o alanlarda tam kapsama anlamına gelmez.

## Alan bazında tablo

| Alan | Rol | Rota | Düzeltildi | Açık | Not |
|---|---|---|---|---|---|
| m-ana-tara | Müşteri | 2 (22 özellik) | 1 | 2 | Çerez bandı modal açıkken tıklanamıyordu (330a05df) |
| m-kesfet | Müşteri | 2 + 8 yönlendirme | 1 | 4 | Mekân detayında EmptyState'e fonksiyon geçirme (c816956e) |
| m-oyunlar-1 | Müşteri | 9 + 14 yönlendirme | 4 | 5 | Turnuva sekmesi çöküyordu, çift /start, tek dokunuşla hak yakma, CTA kontrastı (81ddd423) |
| m-oyunlar-2 | Müşteri | 10 | ~6 | 0 | Bilgi yarışması çökmesi + katman kırpma (2a1a08d6); bu tur yeniden koşulmadı |
| m-cuzdan | Müşteri | 5 | 3 | 2 | Tutarlılık/kaynak eşlemesi/donate-sheet (4037234b) |
| m-ben | Müşteri | 5 | 1 | kısmi | Koyu temada rozet görseli kayboluyordu |
| m-ses-ayar | Müşteri | 3 | 0 | 1 | Hata yok; telafi kabulü test edilemedi |
| m-anlar-pwa | Müşteri | 6 özellik | 3 | 2 | Bildirim merkezi (810f3030) |
| b-bugun-gelen | Bayi | 6 | 2 | 3 | Vaka 500 (P2028, prisma maxWait) + radar etiketi (bab27466) |
| b-musteri-pazarlama | Bayi | 10 (+33 API) | 2 | 4 | Kampanya önizleme + editör hata kenarlığı (7ecffef9) |
| b-analitik-ai | Bayi | 6 | 2 (tek kök neden) | 3 | Kıyas/Etki 500 — dev prisma örnek çiftlenmesi (c6b5c04c) |
| b-kasa-katalog | Bayi | 4 (~30 özellik) | 3 | birkaç | **Kasada tüketim kaydı 500, puan yazılmıyordu** (tx timeout) + ürün listesi filtre yenilenmiyordu (5221a190) |
| b-ekip-ayar | Bayi+Personel | 10 | 4 | 3 | İzin kartı, baş harf, iç içe `<main>`, sayfalama tie-breaker (1c8d0e0d) |
| a-ai | Admin | 6 (+36 API) | 3 | 6 | **Groq llama-3.1-8b kaldırılmış**, konsey 502, kalite istatistik 500 |
| a-ekonomi-oyun | Admin | 12 | 4 | 4 | **Karakter sınıflandırıcı her yorumu "unclassified" döndürüyordu** (6a60dcf0) |
| a-platform | Admin | 17 | 1 | 6 | **Admin kapısı ilk oturum yenilemesinde düşüyordu** (374c6de5) |
| a-genel-kullanici | Admin | 10 | 1 | kısmi | /admin/cards iç içe düğme (66bde16e); etkileşim taraması yük yüzünden yapılamadı |
| p-public | Anonim | 10 | 0 | 2 | Hızlı tur |
| p-qr-huni | Anonim+Müşteri | 6 | 0 | 2 + test edilmeyenler | Puan/claim akışı çift kredisiz doğrulandı |
| p-auth | Anonim | 11 | 1 | 1+ | **2FA gerçek uygulamayla hiç kurulamıyordu** (Base32, aa13cb1c) |
| x-mobil-native | Çapraz | 19 × 4 profil | 2 | 5 | FAB sekmeyi örtüyordu, klavye+alt çubuk (bd6f2405) |
| x-tema-erisilebilirlik | Çapraz | 18 | 3 | 3 | 2FA kontrastı, logo input odağı, cüzdan link kontrastı (af8cc0f9 +1) |

## En kritik düzeltmeler (üretimi etkileyen)

1. **Kasada tüketim kaydı 500 / puan yazılmıyordu** — `lib/consumption/service.ts` tx timeout 5→20 sn, maxWait 10 sn. DB'den bakiye/defter/idempotency/geri alma doğrulandı.
2. **Admin kapısı oturum yenilemesinde düşüyordu** — next-auth her encode'da `jti` yeniliyor; kalıcı `token.sid` ile çözüldü, regresyon testi eklendi.
3. **Groq `llama-3.1-8b-instant` kaldırılmış** — AI Operasyon asistanı 503, Ajan Konseyi 502. `openai/gpt-oss-20b` + `reasoning_effort: 'low'`.
4. **Karakter kategori sınıflandırıcısı** — maxTokens 40 akıl yürütme bütçesini yiyordu; üretimde her tüketim yorumu "sınıflandırılmadı" düşüyordu.
5. **2FA (TOTP)** — HMAC anahtarı Base32 çözülmeden kullanılıyordu; RFC test vektörüyle düzeltildi (DB'de 2FA'lı kullanıcı 0, etkilenen yok).
6. **Vaka aç/çöz aralıklı 500** — `lib/prisma.ts` global `transactionOptions.maxWait: 10_000`.
7. **AI Kalite sohbet istatistikleri 500** — `Prisma.join` → `= ANY(${arr}::text[])`.
8. Server→client bileşene lucide ikon fonksiyonu geçirme (turnuva sekmesi, bilgi yarışması, mekân detayı) — 3 alanda aynı desen.

## AI kanıt özeti

| Alan | Gerçek çağrı | Sonuç |
|---|---|---|
| a-ai | Asistan, konsey oturumu, üslup/bağlam önizleme, öğrenme eğitimi + öneri reddi | Düzeltmeden sonra hepsi 200; sayılar DB ile tutarlı (4 bildirim / 4.25). Konsey kararında veri paketinde olmayan bir metrik uyduruldu (düşük önem) |
| a-ekonomi-oyun | Rozet Test lab sınıflandırma | Düzeltme öncesi boş JSON, sonrası doğru kategori |
| b-analitik-ai | Bayi asistanı (NDJSON) + ⌘J | Sayılar DB ile tutarlı; başka bayinin verisini isteyen istem reddedildi (kiracı izolasyonu GEÇTİ) |
| b-bugun-gelen | Gelen kutusu AI yanıt taslağı | GEÇTİ |
| m-ses-ayar | Yorum düzenleme sonrası yeniden analiz | sentiment/kategori metinle tutarlı |
| Diğer alanlar | — | Kapsamda AI özelliği yok |

Kanıt dosyaları: `.wf-tmp/e2e/<alan>/ai-evidence.md`.

## Mobil / native hazırlık

- **Web mobil: hazır.** 76 ölçümde yatay taşma 0, safe-area doğru, alt sekme hedefleri ≥44px, Android geri (sekme gezinme) ve yatay mod GEÇTİ, PWA manifest/ikonlar/SW 200.
- Düzeltildi: QRA sohbet FAB'ı "Cüzdan" sekmesini örtüyordu; yazılım klavyesi açıkken alt çubuk odaklı alanın üstüne biniyordu.
- **Capacitor/native: hazır değil.** Capacitor projesi yok; açık sheet/dialog'da Android geri sayfadan çıkıyor (backButton köprüsü gerekli); push web-push tabanlı (FCM/APNs gerekir); `assetlinks.json` / `apple-app-site-association` yok; manifest ikonları SVG, gerçek maskable PNG yok; arama input'larında `enterkeyhint` yok; onboarding/karşılama yalnız localStorage'a bağlı.

## Tema / erişilebilirlik

- 171 yüklemede (3 rol, 3 boyut, açık/koyu, + müşteri için yüksek kontrast/büyük yazı/azaltılmış hareket) yatay taşma 0, tek kontrast ihlali (düzeltildi), odak halkası her gerçek odakta görünür, atlama bağlantısı üç rolde var.
- Azaltılmış hareket An Motoru'nda ayrı durağan kart gösteriyor (GEÇTİ).
- Eksik kalan: bayi ve admin için erişilebilirlik modu taraması yarıda kesildi; Esc testi tetikleyici bulunamadığı için çalışmadı; iki kontrast düzeltmesi sayfada yeniden ölçülmedi.
- Otomatik kontrast ölçümü oklch ve degrade zeminlerde güvenilir değil; birkaç bulgu gözle yanlış pozitif sayıldı.

## AÇIK kalan sorunlar

### Gerçek ürün sorunları
| Alan | Açıklama | Neden kaldı |
|---|---|---|
| a-ai | `Prisma.join` kalıbı admin-quests, admin-donations, admin-ai-ops, admin-badges, admin-feedbacks'te de var; aynı "text <> jsonb" hatasını verebilir | Başka alanların kodu, doğrulanmadı |
| a-platform | POST /api/admin/gate yük altında 503 GATE_UNAVAILABLE (advisory-lock tx zaman aşımı) | tx timeout kararı bekliyor |
| a-platform / m-ana-tara | Onboarding sheet ile çerez bandı üst üste biniyor; band mobilde karşılama CTA'sını örtüyor, banda tıklama alttaki modalı kapatabilir | z-sırası tasarım kararı |
| b-musteri-pazarlama | SESSION_REPLAY 403 sayfada "erişim izniniz yok" gösteriyor, login'e yönlendirmeli | Döngü riski; auth sahibine bırakıldı |
| p-qr-huni | Aynı kullanıcı aynı token'ı tekrar claim edince "başka hesaba bağlanmış" mesajı (yanıltıcı) | Kozmetik, zaman |
| m-oyunlar-1 | Oyun sayfası hak kullanılmışken "Günde 1 · ödüllü" diyor; `?mod=` ipucu yok sayılıyor; guardian-of-trust yönlendirmesinde `mod=muhafiz` düşüyor | Zaman |
| a-ekonomi-oyun | Zod "Required" İngilizce detay mesajı (görev arşiv gerekçesi) | Küçük |
| a-ai | Bütçe kartında "888 / 60 B" tutarsız biçim | Kozmetik |
| b-analitik-ai | Etki/Kıyas grafiği az veride boş kutu | Kozmetik |
| p-public | /offline sayfasına özel `<title>` yok | Küçük |
| x-mobil-native | `/customer/settings/notifications` 404 (link veren yok) | Bilgi |
| x-mobil-native | Native/Capacitor eksikleri (yukarıda) | Ayrı proje kapsamı |
| x-tema | Ham renk kullanımları (chatbot, avatar çerçevesi, kapı ekranı, cüzdan kart yüzü, karşılama videosu, mail önizleme) | Tasarım kararı |

### Tasarım / ürün kararı gerektirenler
| Alan | Açıklama |
|---|---|
| Paylaşılan DS | 44px altı dokunma hedefleri: DataTable seçim kutuları 16–18px, sayfalama 36px, üst bar Dil/Tema 36px, ChoiceChips sm, PageHeader geri linki 32px, admin navigation taşı ikonları (~60), satır içi linkler |
| Paylaşılan DS | SectionTabs mobilde son sekmeyi kesiyor, kaydırma ipucu zayıf; `useUrlState` sekme geçişi force-dynamic sayfayı sunucuda yeniden render ediyor (yük altında gecikme) |
| b-musteri-pazarlama | Müşteriler segmentleri ile kampanya kitleleri farklı tanımlı (VIP eşiği, "aktif 30 gün") |
| m-kesfet | "Puan fırsatı" filtresi platform geneli mutlu saatte boş (globalBoost mekâna atfedilmiyor) |
| b-ekip-ayar | "Geciken/gelmeyen" KPI'si geç giriş yapınca 0'a düşüyor; mutasyon sonrası liste optimistik değil |
| p-qr-huni | /table-signal açık temada da koyu |

### Test edilemeyenler
| Alan | Ne | Neden |
|---|---|---|
| m-oyunlar-1 | Sıralı modda kazanma + puan kredisi | Eşik rastgele girdiyle aşılamadı, günde 1 hak |
| m-ses-ayar | Telafi teklifi kabulü | Bekleyen teklif yoktu |
| m-ben | Rol erişimi, karakter reveal, Yılım kart indirme, DB doğrulaması | Zaman |
| b-bugun-gelen | Çekmece derin link, "Yeni vaka" diyaloğu UI | Dev sunucu Build Error'da takıldı |
| b-ekip-ayar | Kurallar kaydet, /wall/[token], otomasyon ve ayarlar etkileşimleri | Başka ajanın derleme hatası + zaman |
| a-genel-kullanici | Liste/filtre/sıralama/sayfalama, kart/segment işlemleri | İstek başına 25–30 sn |
| p-qr-huni | Oturumlu UI, foto yükleme, 768px, geçerli token'la /c /surveys /experience | Bayat oturum + zaman |
| p-auth | Şifre sıfırlama sunucu üzerinden tamamlanmadı | Mail kapalı / zaman |
| p-public | Kabul sonrası PostHog isteği (reddet "0 istek" de bu yüzden kesin değil) | Lokalde `NEXT_PUBLIC_POSTHOG_KEY` boş |
| m-anlar-pwa | Prod service worker boyutu | Dev'de yeniden üretilmiyor |
| a-ai | Öğrenme önerisi onayı | Canlı promptu herkes için değiştirir |

### Ortam kaynaklı (prod'da tekrar kontrol edilmeli)
- Aralıklı SSR "useSession must be wrapped / No QueryClient set / useAppLocale" → istemci render'a düşüş (birçok alan, tekrar üretilemedi; HMR çiftlenmesi şüphesi, kanıtlanmadı).
- /api/admin/surprise-box ve /coupons/stats 500 (dev prisma örnek çiftlenmesi; c6b5c04c sonrası yeniden test edilmedi).
- Yük altında P2028 (oyun complete bir kez), SSE notifications/stream 429, globals.css ENOENT / mobile-tab-bar ara derleme hataları.

## Test verisi (temizlik gerekebilir — canlı Neon)
`[TEST]` önekli: kampanya, flaş teklif, mutlu saat, 2 anket, vaka, telafi, görev, mekân iyileştirme kaydı, CustomerMoment, staff hesabı `e2e.staff.bekip@qratex.test`, müşteri kaydı (p-auth). Kupon **TESTE2E1 hâlâ aktif** — elle pasifleştirilmeli. Webhook "[TEST] a-platform ssrf" arşivlendi. Cüzdanda gerçek alımlar yapıldı (−300 kupon, −5.000 Hellfire Frame).

## Bu turdaki son doğrulama
- `tsc`: 0 hata.
- `jest`: ilk koşuda 1 suite kırıktı — `a11y-i18n-guards` B1: 66bde16e ile eklenen `components/ds/data/data-table.tsx` içindeki sabit `aria-label="Ayrıntıyı aç"`. Mevcut sözlük anahtarı `copy.open` ile değiştirildi → 352/352 suite, 5046/5046 test geçti.

## Önerilen sıradaki adımlar
1. **Dev'i yeniden başlatıp** ortam kaynaklı maddeleri (SSR provider hataları, surprise-box/coupons 500) tek ajanla doğrula; prod'da (Vercel) bir duman testi yap.
2. **`Prisma.join` kalıbını** listelenen 5 admin modülünde tara ve `ANY(::text[])`'e çevir.
3. **Transaction zaman aşımı politikası**: kapı (gate) advisory-lock tx'ine de maxWait/timeout ver; uzun tüketim tx'ini bölmeyi değerlendir (20 sn yama, kök çözüm değil).
4. **Test verisi temizliği** (özellikle aktif TESTE2E1 kuponu) — canlı Neon.
5. **Tasarım kararları oturumu**: DS dokunma hedefleri (DataTable seçim kutusu, üst bar 36px), çerez bandı/modal z-sırası, segment tanımlarının birleştirilmesi.
6. Kısmi kalan alanlar için tamamlayıcı tur: a-genel-kullanici etkileşimleri, b-ekip-ayar kurallar/wall, p-qr-huni oturumlu UI, p-auth şifre sıfırlama, bayi/admin erişilebilirlik modları.
7. Prod'da PostHog rıza akışı (kabul → istek var, reddet → yok) doğrulaması.
8. Native hedefleniyorsa: Capacitor iskeleti + Android geri köprüsü + PNG/maskable ikonlar + FCM/APNs.
