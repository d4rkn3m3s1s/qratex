
export const dynamic = 'force-dynamic';

/**
 * Global search API - tüm varlıklarda arama (kullanıcılar, geri bildirimler, ürünler, QR kodları)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { INPUT_LIMITS } from '@/lib/input-limits';

const LIMIT_PER_TYPE = 5;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('q') || '').trim();
  const q = raw.slice(0, INPUT_LIMITS.searchQuery);
  if (q.length < 2) {
    return NextResponse.json({ success: true, results: { users: [], feedbacks: [], products: [], qrCodes: [] } });
  }

  const role = session.user?.role as string;
  const dealerId = role === 'DEALER' ? session.user?.id : undefined;
  const userId = role === 'CUSTOMER' ? session.user?.id : undefined;

  const results: {
    users: { id: string; name: string | null; email: string; businessName: string | null; role: string; href: string }[];
    feedbacks: { id: string; text: string | null; rating: number; sentiment: string | null; createdAt: string; href: string }[];
    products: { id: string; name: string; categoryName?: string; href: string }[];
    qrCodes: { id: string; name: string; code: string; businessName: string | null; href: string }[];
  } = {
    users: [],
    feedbacks: [],
    products: [],
    qrCodes: [],
  };

  try {
    const searchContains = { contains: q, mode: 'insensitive' as const };

    // ADMIN: users, feedbacks, products, qrCodes
    // DEALER: feedbacks (own), products (own), qrCodes (own)
    // CUSTOMER: feedbacks (own), products (visible)
    const [usersResult, feedbacksResult, productsResult, qrCodesResult] = await Promise.all([
      role === 'ADMIN'
        ? prisma.user.findMany({
            where: {
              OR: [
                { name: searchContains },
                { email: searchContains },
                { businessName: searchContains },
              ],
            },
            take: LIMIT_PER_TYPE,
            select: { id: true, name: true, email: true, businessName: true, role: true },
          })
        : Promise.resolve([]),
      prisma.feedback
        .findMany({
          where: {
            deletedAt: null,
            text: { not: null },
            OR: [
              { text: searchContains },
              ...(role === 'ADMIN' ? [{ user: { name: searchContains } }, { user: { email: searchContains } }] : []),
            ],
            ...(dealerId ? { qrCode: { dealerId } } : {}),
            ...(userId ? { userId } : {}),
          },
          take: LIMIT_PER_TYPE,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            text: true,
            rating: true,
            sentiment: true,
            createdAt: true,
            qrCode: { select: { dealerId: true } },
          },
        })
        .then((f) =>
          f.map((fb) => ({
            id: fb.id,
            text: fb.text?.slice(0, 80) ?? null,
            rating: fb.rating,
            sentiment: fb.sentiment,
            createdAt: fb.createdAt.toISOString(),
            href:
              role === 'ADMIN'
                ? `/admin/feedbacks?search=${encodeURIComponent(q)}`
                : role === 'DEALER'
                  ? `/dealer/feedbacks?search=${encodeURIComponent(q)}`
                  : `/customer/feedbacks?search=${encodeURIComponent(q)}`,
          }))
        ),
      prisma.product
        .findMany({
          where: {
            isActive: true,
            name: searchContains,
            ...(dealerId ? { OR: [{ dealerId }, { dealerId: null }] } : {}),
          },
          take: LIMIT_PER_TYPE,
          select: {
            id: true,
            name: true,
            dealerId: true,
            category: { select: { name: true } },
          },
        })
        .then((p) =>
          p.map((pr) => ({
            id: pr.id,
            name: pr.name,
            categoryName: pr.category?.name,
            href:
              role === 'ADMIN'
                ? `/admin/feedbacks?search=${encodeURIComponent(q)}`
                : role === 'DEALER'
                  ? `/dealer/products?search=${encodeURIComponent(q)}`
                  : `/customer/consumptions?search=${encodeURIComponent(q)}`,
          }))
        ),
      (role === 'ADMIN' || role === 'DEALER')
        ? prisma.qRCode.findMany({
            where: {
              isActive: true,
              OR: [
                { name: searchContains },
                { code: searchContains },
                ...(role === 'ADMIN' ? [{ dealer: { businessName: searchContains } }, { dealer: { name: searchContains } }] : []),
              ],
              ...(dealerId ? { dealerId } : {}),
            },
            take: LIMIT_PER_TYPE,
            select: {
              id: true,
              name: true,
              code: true,
              dealer: { select: { businessName: true, name: true } },
            },
          })
        .then((qr) =>
          qr.map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            businessName: c.dealer?.businessName ?? c.dealer?.name ?? null,
            href: `/dealer/qr-codes?search=${encodeURIComponent(q)}`,
          }))
        )
        : Promise.resolve([]),
    ]);

    results.users = usersResult.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      businessName: u.businessName,
      role: u.role,
      href: `/admin/users?id=${u.id}`,
    }));
    results.feedbacks = feedbacksResult;
    results.products = productsResult;
    results.qrCodes = qrCodesResult;
  } catch (err) {
    console.error('Global search error:', err);
    return NextResponse.json({ error: 'Arama hatası' }, { status: 500 });
  }

  return NextResponse.json({ success: true, results });
}
