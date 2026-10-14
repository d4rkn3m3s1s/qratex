/**
 * R2 dosya sunum uçları (bucket public değil):
 *  - GET /api/files/public/[...key]       → izinli önek + görsel uzantısı, traversal reddi, önbellek/ETag
 *  - GET /api/files/feedback/[id]/[n]     → sahiplik: admin / kendi bayisi / aktif personel / kendi müşterisi
 *  - GET /api/admin/team/tasks/[id]/file  → görevi görebilen + key bu göreve ait
 */
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));

const mockGetR2Object = jest.fn();
jest.mock('@/lib/r2-storage', () => ({
  isR2Configured: () => true,
  getR2Object: (k: string) => mockGetR2Object(k),
}));

const mockStaffDealer = jest.fn();
jest.mock('@/lib/auth/scope', () => ({ getActiveStaffDealerId: (id: string) => mockStaffDealer(id) }));

const db = {
  feedback: { findUnique: jest.fn() },
  taskAttachment: { findFirst: jest.fn() },
  taskComment: { findFirst: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, default: db, isPrismaConnectivityError: () => false }));

const mockFindVisibleTask = jest.fn();
jest.mock('@/lib/team/access', () => {
  const { ApiError } = jest.requireActual('@/lib/http/define-route');
  return {
    TEAM_ROUTE_ROLES: ['ADMIN', 'CUSTOMER', 'DEALER', 'STAFF'],
    requireTeamViewer: async (id: string) => {
      if (id === 'outsider') throw new ApiError('FORBIDDEN', 'Ekip üyesi değilsin.');
      return { userId: id };
    },
    findVisibleTask: (...a: unknown[]) => mockFindVisibleTask(...a),
  };
});

function obj(body = 'IMG') {
  return {
    body: new Blob([body]).stream(),
    size: body.length,
    contentType: 'image/png',
    etag: '"etag-1"',
    lastModified: new Date('2026-10-01T00:00:00Z'),
  };
}

function as(user: { id: string; role: string } | null) {
  if (!user) {
    mockRequireAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Oturum yok' }, { status: 401 }) });
  } else {
    mockRequireAuth.mockResolvedValue({ session: { user } });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockGetR2Object.mockImplementation(async () => obj());
  process.env.R2_PUBLIC_URL = 'https://pub-abc.r2.dev';
});

// ───────────────────────────── public ─────────────────────────────

async function getPublic(segments: string[], headers: Record<string, string> = {}) {
  const { GET } = await import('@/app/api/files/public/[...key]/route');
  const req = new NextRequest(`http://localhost/api/files/public/${segments.join('/')}`, { headers });
  return GET(req, { params: Promise.resolve({ key: segments }) });
}

describe('GET /api/files/public/[...key]', () => {
  it('izinli önek + görsel: 200, uzun önbellek, ETag, nosniff, oturum gerekmez', async () => {
    const res = await getPublic(['assets', 'badges', 'a-1.png']);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('ETag')).toBe('"etag-1"');
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(mockGetR2Object).toHaveBeenCalledWith('assets/badges/a-1.png');
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('If-None-Match eşleşirse 304', async () => {
    const res = await getPublic(['logos', 'd1', 'x.jpg'], { 'if-none-match': '"etag-1"' });
    expect(res.status).toBe(304);
  });

  it('SVG attachment olarak verilir (doğrudan açılınca çalışmaz)', async () => {
    const res = await getPublic(['assets', 'rewards', 'a.svg']);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
  });

  it('path traversal reddedilir', async () => {
    for (const segs of [['assets', '..', 'tasks', 'a.png'], ['assets', '.', 'a.png'], ['..', 'feedback', 'a.jpg']]) {
      const res = await getPublic(segs);
      expect(res.status).toBe(404);
    }
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });

  it('izinsiz önek (özel sınıf) ve görsel olmayan uzantı reddedilir', async () => {
    for (const segs of [['tasks', 'u', 'a.png'], ['feedback', 'q', '2026-10', 'a.jpg'], ['inbox', '1-a.png'], ['backups', 'db', 'x.png'], ['assets', 'badges', 'x.html'], ['assets', 'badges', 'x.pdf']]) {
      const res = await getPublic(segs);
      expect(res.status).toBe(404);
    }
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });

  it('nesne yoksa 404', async () => {
    mockGetR2Object.mockResolvedValueOnce(null);
    expect((await getPublic(['assets', 'badges', 'yok.png'])).status).toBe(404);
  });
});

// ───────────────────────────── feedback ─────────────────────────────

async function getFeedback(id: string, n: number | string) {
  const { GET } = await import('@/app/api/files/feedback/[id]/[n]/route');
  const req = new NextRequest(`http://localhost/api/files/feedback/${id}/${n}`);
  return GET(req, { params: Promise.resolve({ id, n: String(n) }) });
}

const FB = {
  id: 'f1',
  userId: 'c1',
  deletedAt: null,
  qrCode: { dealerId: 'd1' },
  media: ['https://pub-abc.r2.dev/feedback/qr1/2026-10/AAAAAAAAAAAAAAAAAAAAAAAA.jpg', 'feedback/qr1/2026-10/BBBBBBBBBBBBBBBBBBBBBBBB.jpg', 'https://pub-abc.r2.dev/tasks/u/x.pdf', 'feedback/../tasks/u/x.pdf'],
};

describe('GET /api/files/feedback/[id]/[n]', () => {
  beforeEach(() => db.feedback.findUnique.mockResolvedValue(FB));

  it('oturumsuz → 401', async () => {
    as(null);
    expect((await getFeedback('f1', 0)).status).toBe(401);
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });

  it('kendi bayisi 200 (eski URL ve yeni key biçimi), özel önbellek', async () => {
    as({ id: 'd1', role: 'DEALER' });
    const r0 = await getFeedback('f1', 0);
    expect(r0.status).toBe(200);
    expect(r0.headers.get('Cache-Control')).toMatch(/^private/);
    expect(mockGetR2Object).toHaveBeenLastCalledWith('feedback/qr1/2026-10/AAAAAAAAAAAAAAAAAAAAAAAA.jpg');
    expect((await getFeedback('f1', 1)).status).toBe(200);
    expect(mockGetR2Object).toHaveBeenLastCalledWith('feedback/qr1/2026-10/BBBBBBBBBBBBBBBBBBBBBBBB.jpg');
  });

  it('başka bayi → 404 (varlık sızdırılmaz)', async () => {
    as({ id: 'd2', role: 'DEALER' });
    expect((await getFeedback('f1', 0)).status).toBe(404);
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });

  it('personel: yalnız aktif bağlı olduğu bayi', async () => {
    as({ id: 's1', role: 'STAFF' });
    mockStaffDealer.mockResolvedValueOnce('d1');
    expect((await getFeedback('f1', 0)).status).toBe(200);
    mockStaffDealer.mockResolvedValueOnce('d2');
    expect((await getFeedback('f1', 0)).status).toBe(404);
    mockStaffDealer.mockResolvedValueOnce(null);
    expect((await getFeedback('f1', 0)).status).toBe(404);
  });

  it('müşteri: yalnız kendi geri bildirimi; kaldırılmışsa 404', async () => {
    as({ id: 'c1', role: 'CUSTOMER' });
    expect((await getFeedback('f1', 0)).status).toBe(200);
    as({ id: 'c2', role: 'CUSTOMER' });
    expect((await getFeedback('f1', 0)).status).toBe(404);
    as({ id: 'c1', role: 'CUSTOMER' });
    db.feedback.findUnique.mockResolvedValueOnce({ ...FB, deletedAt: new Date() });
    expect((await getFeedback('f1', 0)).status).toBe(404);
  });

  it('admin her geri bildirim', async () => {
    as({ id: 'a1', role: 'ADMIN' });
    expect((await getFeedback('f1', 1)).status).toBe(200);
  });

  it('medya dizisinde feedback/ dışı key ya da traversal → 404; olmayan index 404', async () => {
    as({ id: 'a1', role: 'ADMIN' });
    expect((await getFeedback('f1', 2)).status).toBe(404);
    expect((await getFeedback('f1', 3)).status).toBe(404);
    expect((await getFeedback('f1', 9)).status).toBe(404);
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });

  it('geçersiz kimlik/index reddedilir (400/404), depoya gidilmez', async () => {
    as({ id: 'a1', role: 'ADMIN' });
    expect([400, 404]).toContain((await getFeedback('../x', 0)).status);
    expect([400, 404]).toContain((await getFeedback('f1', 'abc')).status);
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── görev eki ─────────────────────────────

async function getTaskFile(id: string, k: string) {
  const { GET } = await import('@/app/api/admin/team/tasks/[id]/file/route');
  const req = new NextRequest(`http://localhost/api/admin/team/tasks/${id}/file?k=${encodeURIComponent(k)}`);
  return GET(req, { params: Promise.resolve({ id }) });
}

describe('GET /api/admin/team/tasks/[id]/file', () => {
  beforeEach(() => {
    mockFindVisibleTask.mockImplementation(async (viewer: { userId: string }, id: string) => {
      const { ApiError } = jest.requireActual('@/lib/http/define-route');
      if (id !== 't1' || viewer.userId === 'blind') throw new ApiError('NOT_FOUND', 'Görev bulunamadı ya da erişimin yok.');
      return { id: 't1' };
    });
    db.taskAttachment.findFirst.mockImplementation(async ({ where }: { where: { taskId?: string; path: { in: string[] } } }) =>
      where.path.in.includes('https://pub-abc.r2.dev/tasks/u1/rapor.html') && (where.taskId === undefined || where.taskId === 't1')
        ? { filename: 'rapor.html', mime: 'text/html' }
        : null
    );
    db.taskComment.findFirst.mockResolvedValue(null);
  });

  it('oturumsuz → 401', async () => {
    as(null);
    expect((await getTaskFile('t1', 'tasks/u1/rapor.html')).status).toBe(401);
  });

  it('ekip dışı → 403, görevi göremeyen → 404', async () => {
    as({ id: 'outsider', role: 'CUSTOMER' });
    expect((await getTaskFile('t1', 'tasks/u1/rapor.html')).status).toBe(403);
    as({ id: 'blind', role: 'CUSTOMER' });
    expect((await getTaskFile('t1', 'tasks/u1/rapor.html')).status).toBe(404);
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });

  it('görevi gören üye: eski tam URL ile saklanmış eke 200; HTML indirme olarak (octet-stream + nosniff)', async () => {
    as({ id: 'u1', role: 'CUSTOMER' });
    const res = await getTaskFile('t1', 'tasks/u1/rapor.html');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('key bu göreve ait değilse 404 (başka görevin eki)', async () => {
    as({ id: 'u1', role: 'CUSTOMER' });
    expect((await getTaskFile('t1', 'tasks/other/gizli.pdf')).status).toBe(404);
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });

  it('traversal ve izinsiz önek reddedilir', async () => {
    as({ id: 'u1', role: 'ADMIN' });
    for (const k of ['tasks/../feedback/q/a.jpg', '../tasks/u1/rapor.html', 'feedback/q/2026-10/a.jpg', 'inbox/1-a.pdf', '/tasks/u1/rapor.html', 'https://pub-abc.r2.dev/tasks/u1/rapor.html']) {
      expect((await getTaskFile('t1', k)).status).toBe(404);
    }
    expect(mockGetR2Object).not.toHaveBeenCalled();
  });
});
