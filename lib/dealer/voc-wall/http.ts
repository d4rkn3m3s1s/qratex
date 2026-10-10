/** WallError → zarf v2 ApiError (rota içinde `rethrowWallError(err)`). */
import { ApiError } from '@/lib/http/define-route';
import { WallError } from './server';

export function rethrowWallError(err: unknown): never {
  if (err instanceof WallError) throw new ApiError(err.code, err.message);
  throw err;
}
