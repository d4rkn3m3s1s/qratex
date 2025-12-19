import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { chatWithQRA } from '@/lib/groq';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Mesaj gerekli' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Mesaj çok uzun (max 2000 karakter)' },
        { status: 400 }
      );
    }

    // Kullanıcı bilgilerini al (opsiyonel)
    let userContext: {
      name?: string;
      role?: string;
      stats?: { points?: number; level?: number };
    } | undefined;

    const session = await getServerSession(authOptions);
    if (session?.user) {
      userContext = {
        name: session.user.name || undefined,
        role: session.user.role || 'customer',
      };

      // Kullanıcı istatistiklerini al
      try {
        const userStats = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { points: true, level: true },
        });
        if (userStats) {
          userContext.stats = {
            points: userStats.points,
            level: userStats.level,
          };
        }
      } catch {
        // Stats alınamazsa devam et
      }
    }

    // AI yanıtını al
    const response = await chatWithQRA(
      message,
      conversationHistory,
      userContext
    );

    return NextResponse.json({
      success: true,
      message: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Bir hata oluştu' },
      { status: 500 }
    );
  }
}
