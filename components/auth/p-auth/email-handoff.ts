/**
 * Kimlik ekranları arasında yazılmış e-postayı taşır (giriş → şifremi unuttum → giriş,
 * kayıt "zaten kayıtlı" → giriş). URL'ye konmaz: kişisel veri adres çubuğunda, geçmişte ve
 * analitikte dolaşmasın. Yalnız bu sekmenin oturumunda (sessionStorage), 10 dk.
 * Depolama kapalıysa (gizli pencere vb.) sessizce hiçbir şey yapmaz — ön doldurma bir kolaylıktır.
 */
const KEY = 'qx_auth_email_handoff';
const TTL_MS = 10 * 60 * 1000;

export function rememberAuthEmail(email: string): void {
  const value = email.trim();
  if (!value || !value.includes('@') || value.length > 320) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ email: value, at: Date.now() }));
  } catch {
    /* depolama yok */
  }
}

export function recallAuthEmail(): string {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof parsed.email !== 'string' || typeof parsed.at !== 'number') return '';
    if (Date.now() - parsed.at > TTL_MS) return '';
    return parsed.email;
  } catch {
    return '';
  }
}
