import { test, expect, type Page } from '@playwright/test';

// 念念 · 陈列室 —— M1 外壳 e2e。
// 覆盖验收硬指标点名的场景：
//  1) 建场景 → 切场景 → 刷新后场景与布局状态完整还原
//  2) 物件抽屉列出 14 件
//  3) 场景背景不可重复且最多 3 个（第 4 个被阻止 + 置灰“素材已用完”）
//
// 背景名（对齐 M1-S1 manifest）：书房 / 客厅 / 卧室。

async function freshApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
}

async function openPicker(page: Page) {
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
}

async function createScene(page: Page, bgName: string) {
  await openPicker(page);
  await page.getByTestId('bg-option').filter({ hasText: bgName }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip').filter({ hasText: bgName })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('建场景 → 切场景 → 刷新后场景与布局状态完整还原', async ({ page }) => {
  // 起点：无场景，画布是空态。
  await expect(page.getByTestId('scene-chip')).toHaveCount(0);
  await expect(page.getByTestId('canvas')).toBeVisible();

  // 建「客厅」并放入第一件物件（产生布局状态）。
  await createScene(page, '客厅');
  const firstItemId = await page.getByTestId('tray-item').first().getAttribute('data-item-id');
  expect(firstItemId).toBeTruthy();
  await page.getByTestId('tray-item').first().click();

  const placement = page.getByTestId('placement');
  await expect(placement).toHaveCount(1);
  await expect(placement).toHaveAttribute('data-item-id', firstItemId!);
  // 记录布局（位置/角度/缩放/层级都编码在 inline style 里）。
  const styleBefore = await placement.getAttribute('style');

  // 建「书房」→ 自动切到书房（空场景，画布 0 件）。
  await createScene(page, '书房');
  await expect(page.getByTestId('scene-chip').filter({ hasText: '书房' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('placement')).toHaveCount(0);

  // —— 刷新 ——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();

  // 场景列表完整还原：客厅 + 书房 两个 chip 都在。
  await expect(page.getByTestId('scene-chip')).toHaveCount(2);
  await expect(page.getByTestId('scene-chip').filter({ hasText: '客厅' })).toBeVisible();
  await expect(page.getByTestId('scene-chip').filter({ hasText: '书房' })).toBeVisible();
  // 当前场景还原为刷新前激活的「书房」，其画布仍为 0 件。
  await expect(page.getByTestId('scene-chip').filter({ hasText: '书房' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('placement')).toHaveCount(0);

  // 切回「客厅」→ 布局状态完整还原（同一物件、同一位置/角度/层级）。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  const restored = page.getByTestId('placement');
  await expect(restored).toHaveCount(1);
  await expect(restored).toHaveAttribute('data-item-id', firstItemId!);
  expect(await restored.getAttribute('style')).toBe(styleBefore);
});

test('物件抽屉列出全部 14 件物件', async ({ page }) => {
  await expect(page.getByTestId('tray')).toBeVisible();
  await expect(page.getByTestId('tray-item')).toHaveCount(14);
});

test('场景背景不可重复且最多 3 个：第 4 个被阻止并置灰“素材已用完”', async ({ page }) => {
  // 初始：可建，picker 提供全部 3 张背景。
  await openPicker(page);
  await expect(page.getByTestId('bg-option')).toHaveCount(3);
  await page.getByTestId('bg-option').filter({ hasText: '客厅' }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);

  // 建完「客厅」后：picker 只剩 2 张，且「客厅」不再出现（背景不可重复）。
  await openPicker(page);
  await expect(page.getByTestId('bg-option')).toHaveCount(2);
  await expect(page.getByTestId('bg-option').filter({ hasText: '客厅' })).toHaveCount(0);
  await page.getByTestId('bg-option').filter({ hasText: '书房' }).click();

  // 建完第 2 个：picker 只剩 1 张（卧室）。
  await openPicker(page);
  await expect(page.getByTestId('bg-option')).toHaveCount(1);
  await page.getByTestId('bg-option').filter({ hasText: '卧室' }).click();

  // 3 个场景到顶，且三者背景互不相同。
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  const names = await page.getByTestId('scene-chip').allInnerTexts();
  expect(new Set(names)).toEqual(new Set(['客厅', '书房', '卧室']));

  // 第 4 个被阻止：＋新场景 置灰不可点，并常驻提示“素材已用完”。
  await expect(page.getByTestId('add-scene')).toBeDisabled();
  await expect(page.getByTestId('scenes-exhausted')).toBeVisible();
  await expect(page.getByTestId('scenes-exhausted')).toHaveText('素材已用完');
  // 阻止后 picker 打不开（点不动）。
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
});
