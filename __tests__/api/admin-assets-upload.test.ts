/**
 * P0-39 / P0-26: Rozet/ödül görseli yükleme `fs.writeFile(public/…)` yapıyordu.
 * Vercel'de FS salt-okunur → üretimde her yükleme başarısız / kırık görsel.
 * Artık R2'ye yüklenir; üretimde R2 yoksa yerel yazma DENENMEZ, 503 döner.
 */
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/http/route-rate-limit', () => ({ enforceRouteRateLimit: async () => null }));

const mockIsR2Configured = jest.fn();
const mockUploadToR2 = jest.fn();
jest.mock('@/lib/r2-storage', () => ({
  isR2Configured: () => mockIsR2Configured(),
  uploadToR2: (...a: unknown[]) => mockUploadToR2(...a),
}));

jest.mock('@/lib/media-validation', () => ({
  validateMimeMagic: () => true,
  svgContainsScript: (buf: Buffer) => buf.toString('utf8').includes('<script'),
  stripExifPng: async (buf: Buffer) => buf,
  assetContentDisposition: (mime: string) => (mime === 'image/svg+xml' ? 'attachment; filename="x.svg"' : undefined),
}));

const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
jest.mock('fs/promises', () => ({
  writeFile: (...a: unknown[]) => mockWriteFile(...a),
  mkdir: (...a: unknown[]) => mockMkdir(...a),
}));

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
}

function svgFile(content = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>', name = 'Rozet İkonu.svg') {
  return new File([content], name, { type: 'image/svg+xml' });
}

async function upload(folder: string, file: File | null) {
  const { POST } = await import('@/app/api/admin/assets/upload/route');
  const fd = new FormData();
  fd.append('folder', folder);
  if (file) fd.append('file', file);
  const req = new Request('http://localhost/api/admin/assets/upload', { method: 'POST', body: fd });
  return POST(req);
}

describe('POST /api/admin/assets/upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...ORIGINAL_ENV };
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'admin1', role: 'ADMIN' } } });
    mockUploadToR2.mockImplementation(async (key: string) => `https://pub.r2.dev/${key}`);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('R2 yapılandırılmışsa nesne depolamaya yükler ve kalıcı HTTPS URL döner (yerel FS’e yazmaz)', async () => {
    mockIsR2Configured.mockReturnValue(true);
    setEnv({ R2_PUBLIC_URL: 'https://pub.r2.dev', NODE_ENV: 'production', VERCEL: '1' });

    const res = await upload('rewards', svgFile());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.storage).toBe('r2');
    expect(json.url).toMatch(/^https:\/\/pub\.r2\.dev\/assets\/rewards\/rozet-ikonu-\d+-[0-9a-f]{8}\.svg$/);
    expect(json.path).toBe(json.url); // geriye uyumlu alan
    expect(mockUploadToR2).toHaveBeenCalledWith(expect.stringMatching(/^assets\/rewards\//), expect.any(Buffer), 'image/svg+xml', expect.stringMatching(/^attachment;/));
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('üretimde R2 yoksa salt-okunur FS’e yazmayı DENEMEZ, açık 503 döner (eski hata: writeFile → 500)', async () => {
    mockIsR2Configured.mockReturnValue(false);
    setEnv({ R2_PUBLIC_URL: undefined, NODE_ENV: 'production', VERCEL: '1' });

    const res = await upload('badges', svgFile());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('STORAGE_NOT_CONFIGURED');
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it('R2 anahtarları var ama R2_PUBLIC_URL yoksa (görsel tarayıcıdan açılamaz) üretimde 503', async () => {
    mockIsR2Configured.mockReturnValue(true);
    setEnv({ R2_PUBLIC_URL: undefined, NODE_ENV: 'production', VERCEL: '1' });
    const res = await upload('badges', svgFile());
    expect(res.status).toBe(503);
    expect(mockUploadToR2).not.toHaveBeenCalled();
  });

  it('yerel geliştirmede R2 yoksa public/ altına yazar', async () => {
    mockIsR2Configured.mockReturnValue(false);
    setEnv({ R2_PUBLIC_URL: undefined, NODE_ENV: 'development', VERCEL: undefined });
    const res = await upload('badges', svgFile());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.storage).toBe('local-dev');
    expect(json.path).toMatch(/^\/images\/uploads\/badges\//);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('girdi doğrulaması korunur: geçersiz klasör, betikli SVG, yanlış tür', async () => {
    mockIsR2Configured.mockReturnValue(true);
    setEnv({ R2_PUBLIC_URL: 'https://pub.r2.dev' });
    expect((await upload('../etc', svgFile())).status).toBe(400);
    expect((await upload('badges', svgFile('<svg><script>alert(1)</script></svg>'))).status).toBe(400);
    expect((await upload('badges', new File(['x'], 'a.gif', { type: 'image/gif' }))).status).toBe(400);
    expect((await upload('badges', null)).status).toBe(400);
    expect(mockUploadToR2).not.toHaveBeenCalled();
  });

  it('yetkisiz istek reddedilir', async () => {
    const denied = new Response(null, { status: 403 });
    mockRequireAuth.mockResolvedValue({ error: denied });
    const res = await upload('badges', svgFile());
    expect(res.status).toBe(403);
    expect(mockUploadToR2).not.toHaveBeenCalled();
  });
});
