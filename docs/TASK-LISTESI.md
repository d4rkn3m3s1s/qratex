# Görev Listesi (Task'lar)

**Oluşturulma:** 2025-02-19  
**Amaç:** Sprint veya günlük plan için net, uygulanabilir görevler. Her madde tek kişi tarafından alınıp tamamlanabilir.

---

## Yüksek öncelik

| ID | Görev | Dosya / alan | Tahmini |
|----|--------|----------------|--------|
| TASK-01 | **Push bildirimleri (PWA)** – Web Push izni, VAPID, puan/rozet/görev tamamlama bildirimi | `lib/email.ts` veya yeni `lib/push.ts`, PWA manifest, izin UI | 2–3 gün |
| TASK-02 | **Müşteri dil tercihi** – Profilde TR/EN seçimi, locale’e göre metin (i18n key’leri) | `lib/i18n` veya mevcut metinlerin key’e taşınması, User model locale alanı | 1–2 gün |
| TASK-03 | **E2E kritik akışlar** – Playwright ile login → dashboard, feedback gönderme, dealer scan | `e2e/`, `playwright.config.ts` | 2–3 gün |

---

## Orta öncelik (özellik)

| ID | Görev | Dosya / alan | Tahmini |
|----|--------|----------------|--------|
| TASK-04 | **Toplu QR kod oluşturma** – CSV/Excel yükle, çoklu QR üret, ZIP veya PDF etiket | `app/api/admin/qr-codes/bulk/`, admin QR sayfası, `lib/export-utils` | 2 gün |
| TASK-05 | **Müşteri anketleri** – Admin/dealer anket oluşturma, QR/link ile paylaşım, sonuç raporu | Yeni model `Survey`, `app/api/.../surveys`, müşteri anket sayfası | 3–4 gün |
| TASK-06 | **Segment bazlı kampanya hedefleme** – Kampanyada “sadece şu segment” seçimi | `app/dealer/campaigns`, segment API, kampanya API | 2 gün |
| TASK-07 | **Otomatik yanıt kuralları** – Düşük puan veya anahtar kelimede şablon yanıt | Yeni model veya ayar, kural motoru, feedback sonrası tetikleyici | 2–3 gün |
| TASK-08 | **Benchmark karşılaştırması** – Sektör/şehir bazlı anonim ortalama, dealer’a “sektör ortalaması” | `app/api/dealer/benchmark`, dealer dashboard kartı | 2 gün |

---

## Orta öncelik (teknik)

| ID | Görev | Dosya / alan | Tahmini |
|----|--------|----------------|--------|
| TASK-09 | **React Query genişletme** – dealer profile, offline-sync, next-best-actions sayfalarında useEffect+fetch → useQuery | İlgili sayfa dosyaları | 1 gün |
| TASK-10 | **LazyMotion tutarlılığı** – dealer/page, dealer/feedbacks, landing bileşenlerinde motion → m + LazyMotion sarmalayıcı | İlgili sayfa ve `components/landing` | 1 gün |
| TASK-11 | **API birim testleri** – feedback POST, gamification claim, dealer reply route’ları için mock ile test | `__tests__/api/` | 1–2 gün |
| TASK-12 | **Form/buton a11y** – Register, dealer settings, admin formlarda label/htmlFor ve aria-label kontrolü | İlgili form sayfaları | 0.5 gün |

---

## Düşük öncelik / iyileştirme

| ID | Görev | Dosya / alan | Tahmini |
|----|--------|----------------|--------|
| TASK-13 | **Çoklu dil admin paneli** – Admin UI metinlerini TR/EN key’lere taşıma, dil seçici | Admin layout, `lib/i18n` | 2–3 gün |
| TASK-14 | **Sezonluk ligler** – Ligleri tarih aralığına bağlama, sezon sonu ödül, sıfırlama | `lib/league-rules`, gamification API, admin lig ayarları | 2 gün |
| TASK-15 | **Sınırlı süreli ödüller (flash)** – Reward/badge’e start/end tarihi, “bugün 2x puan” | Prisma model, gamification kuralları, UI | 1–2 gün |
| TASK-16 | **OpenAPI genişletme** – /api/customer/stats, /api/leaderboard, /api/notifications vb. path’leri openapi.yaml’a ekleme | `openapi.yaml` | 0.5 gün |
| TASK-17 | **Postman koleksiyonu** – openapi.yaml’dan veya manuel Postman collection (JSON) üretme | `docs/` veya `postman/` | 0.5 gün |

---

## Hızlı kazanım (yarım gün veya daha az)

| ID | Görev | Açıklama |
|----|--------|----------|
| TASK-18 | Dealer “hızlı tarama” tam ekran modu | Tek dokunuşla tara–onayla, kamera odaklı UI |
| TASK-19 | Tenant/marka özelleştirme – logo, renk, favicon | Settings veya env tabanlı tema |
| TASK-20 | Webhook payload alan seçimi | Admin’in webhook’ta gönderilecek alanları seçmesi |
| TASK-21 | E-posta şablon editörü (basit) | Admin’de davet/şifre sıfırlama metni ve {{değişken}} düzenleme |
| TASK-22 | YAPILACAKLAR-LISTESI’ndeki tekrarlayan satırları temizleme | F1, F2, K2 vb. satırlarda çift Detay metnini silme |

---

## Özet

| Öncelik | Task sayısı | Örnek |
|---------|-------------|--------|
| Yüksek | 3 | Push, dil tercihi, E2E ✅ (critical-flows) |
| Orta (özellik) | 5 | Toplu QR, anket, segment kampanya, otomatik yanıt, benchmark |
| Orta (teknik) | 4 | React Query ✅, LazyMotion ✅, API test ✅, a11y ✅ |
| Düşük | 5 | Admin i18n, sezonluk lig, flash ödül, OpenAPI/Postman |
| Hızlı | 5 | Hızlı tarama, marka, webhook, e-posta editör, doc temizlik |

**Toplam:** 22 task. İlk sprint için öneri: **TASK-01** (Push), **TASK-02** (Dil) veya **TASK-03** (E2E). Teknik borç için: **TASK-09**, **TASK-10**, **TASK-11**.
