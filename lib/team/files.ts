import path from 'path';
import { deleteFromR2, keyFromPublicUrl } from '@/lib/r2-storage';

/**
 * Görev eki depolama yardımcıları. Görev ya da ek kalıcı silindiğinde nesne de silinir
 * (denetim Bulgu 2: toplu/tekil görev silmede R2 nesneleri yetim kalıyordu).
 */
export async function removeStoredTaskFile(storedPath: string | null | undefined): Promise<void> {
  if (!storedPath) return;
  try {
    if (/^https?:\/\//.test(storedPath)) {
      const key = keyFromPublicUrl(storedPath);
      if (key) await deleteFromR2(key);
      return;
    }
    if (storedPath.startsWith('/images/uploads/tasks/')) {
      const { unlink } = await import('fs/promises');
      const safe = path.basename(storedPath);
      await unlink(path.join(process.cwd(), 'public', 'images', 'uploads', 'tasks', safe)).catch(() => undefined);
      return;
    }
    // Yeni yüklemeler çıplak key (`tasks/...`); eski `/<key>` biçimi de desteklenir.
    const key = keyFromPublicUrl(storedPath);
    if (key && key.startsWith('tasks/')) await deleteFromR2(key);
  } catch (err) {
    console.warn('[team] dosya silinemedi:', storedPath, err);
  }
}

export async function removeStoredTaskFiles(paths: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  for (const p of unique) await removeStoredTaskFile(p);
}
