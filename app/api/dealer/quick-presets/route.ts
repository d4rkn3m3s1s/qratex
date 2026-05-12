import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

// GET - Get dealer's quick scan presets

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const presets = await prisma.quickScanPreset.findMany({
      where: { dealerId: session.user.id },
      include: {
        product: {
          select: { id: true, name: true, price: true, image: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { order: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      presets,
    });
  } catch (error) {
    console.error('Error fetching quick presets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create quick scan preset
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const { name, productId, amount, note, isDefault } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.quickScanPreset.updateMany({
        where: { dealerId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Get next order number
    const lastPreset = await prisma.quickScanPreset.findFirst({
      where: { dealerId: session.user.id },
      orderBy: { order: 'desc' },
    });

    const preset = await prisma.quickScanPreset.create({
      data: {
        dealerId: session.user.id,
        name,
        productId: productId || null,
        amount: amount ? parseFloat(amount) : null,
        note: note || null,
        isDefault: isDefault || false,
        order: (lastPreset?.order || 0) + 1,
      },
      include: {
        product: {
          select: { id: true, name: true, price: true, image: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      preset,
    });
  } catch (error) {
    console.error('Error creating quick preset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update quick scan preset
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await req.json();
    const { id, name, productId, amount, note, isDefault, order } = body;

    if (!id) {
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.quickScanPreset.findFirst({
      where: { id, dealerId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults
    if (isDefault && !existing.isDefault) {
      await prisma.quickScanPreset.updateMany({
        where: { dealerId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const preset = await prisma.quickScanPreset.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        productId: productId !== undefined ? productId : existing.productId,
        amount: amount !== undefined ? (amount ? parseFloat(amount) : null) : existing.amount,
        note: note !== undefined ? note : existing.note,
        isDefault: isDefault !== undefined ? isDefault : existing.isDefault,
        order: order !== undefined ? order : existing.order,
      },
      include: {
        product: {
          select: { id: true, name: true, price: true, image: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      preset,
    });
  } catch (error) {
    console.error('Error updating quick preset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete quick scan preset
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.quickScanPreset.findFirst({
      where: { id, dealerId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    await prisma.quickScanPreset.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Preset deleted',
    });
  } catch (error) {
    console.error('Error deleting quick preset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
