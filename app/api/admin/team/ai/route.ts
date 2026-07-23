import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { runChatCompletion, isAIConfigured } from '@/lib/ai-engine';
import { weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('op', [
  // Başlık/açıklamadan alt-görev (checklist) önerisi
  z.object({ op: z.literal('suggest_checklist'), title: z.string().min(1).max(200), description: z.string().max(2000).optional() }),
  // Görev metnine göre departman + atanan önerisi
  z.object({ op: z.literal('suggest_assignment'), title: z.string().min(1).max(200), description: z.string().max(2000).optional() }),
  // Bu haftanın görevlerinden yönetici özeti
  z.object({ op: z.literal('weekly_summary'), weekKey: z.string().max(10).optional() }),
]);

function extractJson(content: string): unknown {
  // jsonMode bazen ``` sarmalar; ilk { veya [ ile son } veya ] arasını al.
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(trimmed); } catch { /* dene */ }
  const m = trimmed.match(/[[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* boşver */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  if (!isAIConfigured()) {
    return NextResponse.json({ success: false, error: 'AI yapılandırılmamış (GROQ/OPENAI anahtarı yok)' }, { status: 503, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz istek' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;

  // ── Alt-görev önerisi ────────────────────────────────────────────
  if (d.op === 'suggest_checklist') {
    const res = await runChatCompletion({
      system: 'Sen bir proje yöneticisi asistanısın. Verilen göreve uygun 3-6 somut alt-görev üret. SADECE JSON dizi döndür: ["adım 1", "adım 2"]. Türkçe, kısa ve eylem odaklı.',
      user: `Görev başlığı: ${d.title}\n${d.description ? `Açıklama: ${d.description}` : ''}`,
      jsonMode: true, temperature: 0.4, maxTokens: 400,
    });
    if (!res) return NextResponse.json({ success: false, error: 'AI yanıtı alınamadı' }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS });
    const json = extractJson(res.content);
    const items = Array.isArray(json) ? json.filter((x): x is string => typeof x === 'string').slice(0, 8)
      : Array.isArray((json as { items?: unknown })?.items) ? ((json as { items: unknown[] }).items.filter((x): x is string => typeof x === 'string').slice(0, 8)) : [];
    return NextResponse.json({ success: true, items }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  // ── Departman/atanan önerisi ─────────────────────────────────────
  if (d.op === 'suggest_assignment') {
    const [departments, members] = await Promise.all([
      prisma.department.findMany({ where: { isActive: true }, select: { slug: true, name: true } }),
      prisma.user.findMany({ where: { adminTeamRole: { not: null } }, select: { id: true, name: true, email: true, adminDepartment: true } }),
    ]);
    const depList = departments.map((x) => `${x.slug} (${x.name})`).join(', ');
    const memList = members.map((m) => `${m.id}: ${m.name || m.email}${m.adminDepartment ? ` [${m.adminDepartment}]` : ''}`).join('; ');
    const res = await runChatCompletion({
      system: 'Sen bir ekip görev yönlendirme asistanısın. Göreve en uygun departmanı ve kişiyi seç. SADECE JSON döndür: {"department": "<slug veya null>", "assignedToId": "<id veya null>", "reason": "<kısa gerekçe>"}. Sadece verilen listelerden seç.',
      user: `Görev: ${d.title}\n${d.description ? `Açıklama: ${d.description}\n` : ''}\nDepartmanlar: ${depList || 'yok'}\nÜyeler: ${memList || 'yok'}`,
      jsonMode: true, temperature: 0.3, maxTokens: 300,
    });
    if (!res) return NextResponse.json({ success: false, error: 'AI yanıtı alınamadı' }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS });
    const json = (extractJson(res.content) ?? {}) as { department?: string | null; assignedToId?: string | null; reason?: string };
    // Doğrula: önerilen değerler gerçekten listede mi?
    const depOk = json.department && departments.some((x) => x.slug === json.department) ? json.department : null;
    const memOk = json.assignedToId && members.some((m) => m.id === json.assignedToId) ? json.assignedToId : null;
    return NextResponse.json({ success: true, department: depOk, assignedToId: memOk, reason: json.reason ?? null }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  // ── Haftalık ekip özeti ──────────────────────────────────────────
  const weekKey = d.weekKey || weekKeyOf();
  const tasks = await prisma.companyTask.findMany({
    where: { weekKey },
    select: { title: true, status: true, priority: true, department: true, assignedTo: { select: { name: true } } },
    take: 300,
  });
  if (tasks.length === 0) {
    return NextResponse.json({ success: true, summary: 'Bu hafta için görev bulunmuyor.' }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
  const done = tasks.filter((t) => t.status === 'done').length;
  const lines = tasks.map((t) => `- [${t.status}] (${t.priority}) ${t.title}${t.assignedTo?.name ? ` → ${t.assignedTo.name}` : ''}${t.department ? ` #${t.department}` : ''}`).join('\n');
  const res = await runChatCompletion({
    system: 'Sen bir ekip yöneticisi asistanısın. Verilen haftalık görev listesinden yöneticiye kısa (3-5 cümle) bir Türkçe özet yaz: genel ilerleme, dikkat gereken yüksek öncelikli/geciken işler, kişi dağılımı. Madde işareti kullanma, akıcı paragraf yaz.',
    user: `Hafta: ${weekKey}\nToplam: ${tasks.length}, Biten: ${done}\n\nGörevler:\n${lines}`,
    temperature: 0.5, maxTokens: 500,
  });
  if (!res) return NextResponse.json({ success: false, error: 'AI yanıtı alınamadı' }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS });
  return NextResponse.json({ success: true, summary: res.content.trim() }, { headers: PRIVATE_NO_STORE_HEADERS });
}
