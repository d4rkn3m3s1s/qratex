'use client';

import dynamic from 'next/dynamic';
import type { BoxPhase } from './signature-gift-box-3d';

/**
 * İmza sürpriz kutusunun lazy sarmalayıcısı.
 * three.js (~332KB) AYRI chunk'a düşer ve YALNIZ kutu görüntülenirken indirilir —
 * sürpriz kutusu/ödüller sayfalarının ilk yükü ağırlaşmaz.
 * ssr:false ZORUNLU (WebGL `window` gerektirir).
 *
 * `loading`: 3B sahne inerken kutunun yerini tutan sakin safir hale — boşluk zıplamaz.
 */
const SignatureGiftBox3D = dynamic(() => import('./signature-gift-box-3d'), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="grid place-items-center"
      style={{ width: '100%', aspectRatio: '1 / 1' }}
    >
      <div
        className="h-2/3 w-2/3 animate-pulse rounded-3xl"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(90,162,255,0.22), rgba(18,58,134,0.10) 55%, transparent 70%)',
          boxShadow: '0 0 60px rgba(90,162,255,0.18)',
        }}
      />
    </div>
  ),
});

export type { BoxPhase };
export default SignatureGiftBox3D;
