import { test, expect } from '@playwright/test';

test.describe('Squad Management Admin Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Assume an admin is logging in or mocking admin session
        await page.goto('/auth/login');
        await page.fill('input[type="email"]', 'admin@qratex.com');
        await page.fill('input[type="password"]', 'admin123'); // Example generic admin credentials
        await page.click('button[type="submit"]');
        await page.waitForURL('**/admin**', { timeout: 15000 });
    });

    test('Navigate to Squad Battles and view list', async ({ page }) => {
        await page.goto('/admin/squads/battles');
        
        // Wait for page load
        await expect(page.getByRole('heading', { name: /Klan Savaşları|Squad Battles/i }).first()).toBeVisible();
        
        // Check if there is either a "No Battles" message or at least one battle card
        const emptyState = page.getByText(/Aktif veya planlanmış savaş yok|No active battles/i).first();
        const battleCard = page.locator('.overflow-hidden').first(); // The Card component

        // Either one should be visible after data loads
        await Promise.race([
            expect(emptyState).toBeVisible({ timeout: 10000 }),
            expect(battleCard).toBeVisible({ timeout: 10000 })
        ]);
    });

    test('Open create battle modal and close it', async ({ page }) => {
        await page.goto('/admin/squads/battles');
        
        // Wait for heading
        await expect(page.getByRole('heading', { name: /Klan Savaşları|Squad Battles/i }).first()).toBeVisible();

        // Click create button
        const createBtn = page.getByRole('button', { name: /Savaş Planla|Start New Battle/i });
        await createBtn.click();

        // Check if modal opened
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Yeni Savaş|New Battle/i }).first()).toBeVisible();

        // Close modal
        const cancelBtn = page.getByRole('button', { name: /İptal|Cancel/i });
        await cancelBtn.click();
        
        // Check if modal closed
        await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('Navigate to Gamification Settings and view form', async ({ page }) => {
        await page.goto('/admin/gamification-settings');
        
        // Wait for page load
        await expect(page.getByRole('heading', { name: /Oyunlaştırma Ayarları|Gamification Settings/i }).first()).toBeVisible();

        // Wait for input to be populated (loading disappears)
        const xpInput = page.locator('input[type="number"]').first();
        await expect(xpInput).toBeVisible({ timeout: 10000 });

        // Ensure Save button is there
        const saveBtn = page.getByRole('button', { name: /Kaydet|Save/i });
        await expect(saveBtn).toBeVisible();
    });
});
