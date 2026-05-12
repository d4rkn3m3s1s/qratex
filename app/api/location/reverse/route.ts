import { NextRequest, NextResponse } from 'next/server';
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = toNumber(searchParams.get('lat'));
    const lng = toNumber(searchParams.get('lng'));

    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Geçersiz koordinat' }, { status: 400 });
    }

    const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
    endpoint.searchParams.set('lat', String(lat));
    endpoint.searchParams.set('lon', String(lng));
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('addressdetails', '1');
    endpoint.searchParams.set('accept-language', 'tr');

    const response = await fetch(endpoint.toString(), {
      headers: {
        'User-Agent': 'QRATEX/1.0 (location reverse geocoding)',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Adres çözümlenemedi' }, { status: 502 });
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
    });
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return NextResponse.json({ error: 'Adres çözümlenemedi' }, { status: 500 });
  }
}
