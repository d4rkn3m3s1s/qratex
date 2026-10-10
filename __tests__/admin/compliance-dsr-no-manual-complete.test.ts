/**
 * P0-34 regresyon kalkanı: Uyum ekranı KVKK talebini elle "Tamamlandı" yapmaya çalışmamalı.
 * Sunucu bunu 409 ile reddediyor (tamamlanma yalnız yürütme kanıtıyla); eski düğme her
 * tıklamada "Güncellenemedi" hatası veriyor ve yöneticiyi yanıltıyordu.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'app/admin/compliance/page.tsx'), 'utf8');

describe('app/admin/compliance — KVKK talebi elle kapatılamaz', () => {
  it("PATCH status 'completed' göndermez", () => {
    expect(src).not.toMatch(/setPrivacyStatus\([^)]*'completed'\)/);
    expect(src).not.toMatch(/status:\s*'completed'/);
  });

  it('yürütme için KVKK Talepleri ekranına yönlendirir', () => {
    expect(src).toMatch(/href="\/admin\/privacy-requests"/);
  });
});
