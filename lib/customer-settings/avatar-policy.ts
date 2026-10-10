/**
 * Müşteri avatarı izin listesi (denetim B3).
 *
 * Eskiden `PATCH /api/user/profile` `image` alanına herhangi bir https URL yazdırıyordu;
 * liderlik/lig tablosunu açan herkesin tarayıcısı o adrese istek atıyordu (IP + zaman
 * sızıntısı, uygunsuz görsel). Müşteri artık yalnız:
 *  - hazır müşteri avatarlarından birini (`lib/avatar-options`, "Bayi" kategorisi hariç), ya da
 *  - hesabında ZATEN kayıtlı olan görseli (ör. Google profil fotoğrafı) koruyabilir.
 */
import { avatarList } from '@/lib/avatar-options';

const CUSTOMER_AVATARS: ReadonlySet<string> = new Set(
  avatarList.filter((c) => c.category !== 'Bayi').flatMap((c) => c.items),
);

export function isCustomerPresetAvatar(image: string): boolean {
  return CUSTOMER_AVATARS.has(image);
}

/** Müşterinin `image` olarak yazabileceği değer mi? */
export function isAllowedCustomerAvatar(image: string, currentImage: string | null | undefined): boolean {
  if (!image) return false;
  if (CUSTOMER_AVATARS.has(image)) return true;
  return !!currentImage && image === currentImage;
}

/** Seçici için müşteri avatar kategorileri (Bayi hariç). */
export function customerAvatarCategories() {
  return avatarList.filter((c) => c.category !== 'Bayi');
}
