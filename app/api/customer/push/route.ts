import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";


export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { subscription } = await req.json();

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
        }

        const userId = session.user.id;
        const userAgent = req.headers.get("user-agent") || undefined;

        // Check if subscription exists
        const existingSub = await prisma.pushSubscription.findUnique({
            where: { endpoint: subscription.endpoint },
        });

        if (existingSub) {
            // Update existing if it belongs to someone else or needs refresh
            await prisma.pushSubscription.update({
                where: { id: existingSub.id },
                data: {
                    userId,
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                    userAgent,
                    isActive: true,
                    lastUsedAt: new Date(),
                },
            });
        } else {
            // Create new
            await prisma.pushSubscription.create({
                data: {
                    userId,
                    endpoint: subscription.endpoint,
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                    userAgent,
                },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Save Push Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { endpoint } = await req.json();

        if (!endpoint) {
            return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
        }

        await prisma.pushSubscription.deleteMany({
            where: {
                userId: session.user.id,
                endpoint,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete Push Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
