import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lra9egAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Avatar asset editor', () => {
  test('uploads an emotion asset from the character assets tab', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-testid="character-panel-trigger"]').click();
    await expect(page.locator('[data-testid="character-panel"]')).toBeVisible();

    await page.locator('[data-testid="character-panel-add"]').click();
    await expect(page.locator('[data-testid="character-editor"]')).toBeVisible();

    await page.locator('[data-testid="character-editor-tab-assets"]').click();

    const dropzone = page
      .locator('[data-testid^="character-asset-upload-"][data-testid$="-dropzone"]')
      .first();
    await expect(dropzone).toBeVisible();
    await expect(dropzone).toBeEnabled();
    await dropzone.focus();
    await expect(dropzone).toBeFocused();

    await page
      .locator('[data-testid^="character-asset-upload-"][data-testid$="-file-input"]')
      .first()
      .setInputFiles({
        name: 'avatar-emotion.png',
        mimeType: 'image/png',
        buffer: tinyPng,
      });

    await expect(
      page.locator('[data-testid^="character-asset-upload-"][data-testid$="-remove"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.locator('[data-testid="character-editor-done"]').click();
    await expect(page.locator('[data-testid="character-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="character-editor"]')).not.toBeVisible();
  });
});
