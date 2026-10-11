import { test as setup, expect } from '@playwright/test';
import { ROLES, account, createState } from '../support/accounts';

/**
 * Her rol için giriş akışı + storageState (kalite kapısı projeleri buna bağımlı).
 * Giriş sonrası rolün kendi paneline düşmesi doğrulanır; ADMIN kapıyı geçmiş olmalı.
 */
for (const role of ROLES) {
  setup(`giriş: ${role}`, async ({ browser, baseURL }) => {
    setup.setTimeout(180_000);
    const finalPath = await createState(browser, baseURL ?? 'http://localhost:3000', role);
    expect(finalPath.startsWith(account(role).home), `${role} giriş sonrası ${finalPath}`).toBe(true);
  });
}
