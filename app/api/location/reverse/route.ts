import { NextRequest, NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';


export const dynamic = 'force-dynamic';

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const lat = toNumber(searchParams.get('lat'));
    const lng = toNumber(searchParams.get('lng'));

    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Geçersiz koordinat' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
    endpoint.searchParams.set('lat', String(lat));
    endpoint.searchParams.set('lon', String(lng));
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('addressdetails', '1');
    endpoint.searchParams.set('accept-language', 'tr');

    const appOrigin = getPublicAppOrigin();

    const response = await fetch(endpoint.toString(), {
      headers: {
        'User-Agent': `QRATEX/1.0 (reverse geocode; +${appOrigin})`,
        Referer: `${appOrigin}/`,
        'Accept-Language': 'tr,en;q=0.8',
      },
      cache: 'no-store',
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Adres servisi şu an meşgul. Bir süre sonra tekrar deneyin.' },
        { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Adres çözümlenemedi' }, { status: 502 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const data = await response.json();
    const displayName = typeof data?.display_name === 'string' ? data.display_name : '';
    const address = data?.address && typeof data.address === 'object' ? data.address : {};

    const compactAddress = [
      address?.road,
      address?.suburb || address?.neighbourhood,
      address?.city || address?.town || address?.state,
      address?.country,
    ]
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .join(', ');

    return NextResponse.json({
      success: true,
      data: {
        displayName,
        compactAddress: compactAddress || displayName,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return NextResponse.json({ error: 'Adres çözümlenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
