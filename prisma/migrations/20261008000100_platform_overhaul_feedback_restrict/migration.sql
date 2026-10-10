-- ═════════════════════════════════════════════════════════════════════════════
-- Platform overhaul — P0-24 · Feedback.qrCode: ON DELETE CASCADE → RESTRICT · 2026-10-08
--
-- Etki: yorumu (Feedback) olan bir QR kodu hard delete edilemez; DB P2003 / 23503 hatası
-- verir. Böylece "QR sil" ile yüzlerce müşteri yorumunun, AI analizinin ve telafinin
-- geri dönüşsüz kaybolması VERİTABANI seviyesinde imkânsız olur. QR "silme" artık arşivdir
-- (QRCode.archivedAt / revokedAt / isActive=false — expand göçünde eklendi).
--
-- Yan etki (bilinçli): QRCode.dealer CASCADE olduğundan, yorum almış QR'ı olan bir BAYİ
-- hesabını hard delete etmek de artık hata verir (P0-25: bayi silme = anonimleştirme/askı).
--
-- Mevcut veriyi DEĞİŞTİRMEZ. Mevcut satırlar eski FK ile zaten geçerli olduğundan
-- NOT VALID + VALIDATE kullanılır (VALIDATE yazmaları kilitlemez).
-- İdempotent: tekrar çalıştırılabilir.
-- Sıra ve geri dönüş: docs/audit/2026-10-08/DEPLOY-RUNBOOK.md §4
-- ═════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

ALTER TABLE "Feedback" DROP CONSTRAINT IF EXISTS "Feedback_qrCodeId_fkey";
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_qrCodeId_fkey"
  FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Feedback" VALIDATE CONSTRAINT "Feedback_qrCodeId_fkey";
