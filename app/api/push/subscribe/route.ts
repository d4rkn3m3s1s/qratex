import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST - Subscribe to push notifications

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await req.json();
    const { endpoint, keys } = subscription;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }

    // Upsert subscription
    const pushSubscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: session.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get('user-agent') || undefined,
        isActive: true,
        lastUsedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Push notifications enabled',
      subscriptionId: pushSubscription.id,
    });
  } catch (error) {
    console.error('Error subscribing to push:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Unsubscribe from push notifications
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await req.json();

    if (endpoint) {
      await prisma.pushSubscription.updateMany({
        where: { 
          endpoint,
          userId: session.user.id,
        },
        data: { isActive: false },
      });
    } else {
      // Disable all subscriptions for user
      await prisma.pushSubscription.updateMany({
        where: { userId: session.user.id },
        data: { isActive: false },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Push notifications disabled',
    });
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
