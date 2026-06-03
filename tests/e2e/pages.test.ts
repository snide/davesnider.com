import { expect, test } from '@playwright/test';

test.describe('Main pages', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/dave/i);
  });

  test('about page loads successfully', async ({ page }) => {
    await page.goto('/about');
    await expect(page).toHaveURL(/about/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('links page loads successfully', async ({ page }) => {
    await page.goto('/links');
    await expect(page).toHaveURL(/links/);
  });
});

test.describe('Museum pages', () => {
  test('museum page loads successfully', async ({ page }) => {
    await page.goto('/museum');
    await expect(page).toHaveURL(/museum/);
  });

  test('museum page displays gallery content', async ({ page }) => {
    await page.goto('/museum');

    // Check for images on the page as gallery content
    const images = page.locator('img');
    await expect(images.first()).toBeVisible({ timeout: 10000 });
  });
});
