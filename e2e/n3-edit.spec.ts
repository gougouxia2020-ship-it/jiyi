import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— N3 编辑交互与管理全量 · 收口 e2e（里程碑 N3 验收门）。
// 逐条覆盖 milestones.json N3 criteria① + success.json 条目8 + taste 命名与管理段：
//   A. 编辑全链路回归（N3-S1）：dock 拖入 → 挪位 → 角手柄缩放 → 旋转钮旋转 → 工具条移除 → 刷新完整还原。
//   B. 场景重命名：chip 点进去改、回车即存 / 失焦即存；刷新后不丢。
//   C. 场景删除（chip 次级入口 + 一句话确认）：删除即释放该背景配额、可再建；删除与再建刷新后还原。
//   D. 物件重命名（dock 缩略卡）：改名挂 Item、跨场景同步（另一场景的摆放读到新名）；刷新后不丢。
//   E. 陈列室名（品牌章）就地编辑：点进去改、失焦即存；刷新后不丢。
//   F. 手感/工艺可自动化项：手柄触摸命中区 ≥ --h2-hit（26px）、无字符图标残留（PC 与横屏手机）。

const VP = {
  hd: { width: 1280, height: 800 },
  phoneLandscape: { width: 844, height: 390 }, // 横屏手机代表视口（<880 → dock 默认收合）
};

/** 每条用例挂一次错误收集：全程不得有未捕获错误 / 未处理 Promise 拒绝 / console.error。 */
function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  return problems;
}

async function freshApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
}

async function createScene(page: Page, bgName: string) {
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
  await page.getByTestId('bg-option').filter({ hasText: bgName }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip').filter({ hasText: bgName })).toBeVisible();
}

/** 若 dock 收合则展开（横屏手机默认收合），保证缩略卡可点/可拖。 */
async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

/** 点选放入（默认网格位）：返回其 itemId。 */
async function placeItemByClick(page: Page, index = 0): Promise<string> {
  await ensureDockOpen(page);
  const thumb = page.getByTestId('tray-item').nth(index);
  const itemId = await thumb.getAttribute('data-item-id');
  const before = await page.getByTestId('placement').count();
  await thumb.click();
  await expect(page.getByTestId('placement')).toHaveCount(before + 1);
  return itemId!;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function boxOf(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  expect(b, 'boundingBox 不应为空（元素须可见）').not.toBeNull();
  return b!;
}

/** 真实拖拽：从抽屉第 index 件缩略卡拖到视口坐标 (dropX, dropY)。 */
async function dragInItem(page: Page, index: number, dropX: number, dropY: number) {
  const item = page.getByTestId('tray-item').nth(index);
  const b = await boxOf(item);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 24, b.y + b.height / 2 + 12, { steps: 4 });
  await page.mouse.move(dropX, dropY, { steps: 14 });
  await page.mouse.up();
}

/** 真实拖拽：从元素中心拖到 (+dx, +dy)。 */
async function dragBy(page: Page, loc: Locator, dx: number, dy: number) {
  const b = await boxOf(loc);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 14 });
  await page.mouse.up();
}

interface PlacementData {
  x: number;
  y: number;
  w: number;
  rotation: number;
  z: number;
}
/** 读某 placement 存储的 (x,y,w,rotation,z)——data-* 即存储原值（schema v3 用 w，不再有 scale）。 */
async function readPl(loc: Locator): Promise<PlacementData> {
  return {
    x: Number(await loc.getAttribute('data-x')),
    y: Number(await loc.getAttribute('data-y')),
    w: Number(await loc.getAttribute('data-w')),
    rotation: Number(await loc.getAttribute('data-rotation')),
    z: Number(await loc.getAttribute('data-z')),
  };
}

function itemLocator(page: Page, itemId: string): Locator {
  return page.locator(`.stage__item[data-item-id="${itemId}"]`);
}

// ————————————————————————————————————————————————————————————————
// A. 编辑全链路（N3-S1 回归，里程碑级全量）：dock 拖入 → 挪位 → 缩放 → 旋转 → 移除 → 刷新还原
// ————————————————————————————————————————————————————————————————
test('A 全链路：dock 拖入 → 挪位 → 角手柄缩放 → 旋转钮旋转 → 工具条移除 → 刷新逐字段还原', async ({
  page,
}) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);
  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);

  // —— 1. dock 拖入画布（真实拖拽，落点由终点决定）——
  const itemAId = await page.getByTestId('tray-item').nth(0).getAttribute('data-item-id');
  expect(itemAId).toBeTruthy();
  await dragInItem(page, 0, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.42);

  const placement = page.getByTestId('placement');
  await expect(placement).toHaveCount(1);
  await expect(placement).toHaveAttribute('data-item-id', itemAId!);
  const dropped = await readPl(placement);
  // 落位只经 transform：inline style 是 translate + z-index，不含 left/top（不重排）。
  const itemStyle = (await placement.getAttribute('style')) ?? '';
  expect(itemStyle).toContain('translate(');
  expect(itemStyle).not.toContain('left');
  expect(itemStyle).not.toContain('top');

  // —— 2. 挪位（选中 + 拖 <img>）：只改 x/y ——
  const img = placement.locator('.stage__node');
  await dragBy(page, img, 40, 34);
  const afterMove = await readPl(placement);
  expect(afterMove.x).not.toBe(dropped.x);
  expect(afterMove.y).not.toBe(dropped.y);
  expect(afterMove.w).toBe(dropped.w);
  expect(afterMove.rotation).toBe(dropped.rotation);
  expect(afterMove.z).toBe(dropped.z);

  // 手柄随选中态出现（缩放 ×4 + 旋转 ×1）。
  await expect(page.getByTestId('handle-scale')).toHaveCount(4);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(1);

  // —— 3. 角手柄缩放（拖右下角向外 → 放大）：只改 w ——
  const brHandle = page.locator('[data-testid="handle-scale"][data-corner="br"]');
  await dragBy(page, brHandle, 46, 38);
  const afterScale = await readPl(placement);
  expect(afterScale.w).toBeGreaterThan(afterMove.w);
  expect(afterScale.x).toBe(afterMove.x);
  expect(afterScale.y).toBe(afterMove.y);
  expect(afterScale.rotation).toBe(afterMove.rotation);
  expect(afterScale.z).toBe(afterMove.z);
  // 旋转/缩放只经 .stage__tf 的 transform（rotate + scale）。
  const tfStyle = (await placement.locator('.stage__tf').getAttribute('style')) ?? '';
  expect(tfStyle).toContain('rotate(');

  // —— 4. 旋转钮旋转（拖旋转圆钮横向 → 转角变化）：只改 rotation ——
  const rotHandle = page.getByTestId('handle-rotate');
  await dragBy(page, rotHandle, 64, 20);
  const afterRotate = await readPl(placement);
  expect(afterRotate.rotation).not.toBe(afterScale.rotation);
  expect(afterRotate.x).toBe(afterScale.x);
  expect(afterRotate.y).toBe(afterScale.y);
  expect(afterRotate.w).toBe(afterScale.w);
  expect(afterRotate.z).toBe(afterScale.z);

  const aBefore = afterRotate;

  // —— 5. 再拖入 B，用工具条垃圾桶移除 B（验证移除 + 移除持久化）——
  await page.mouse.click(cbox.x + cbox.width - 20, cbox.y + cbox.height - 20); // 点空白取消选中 A
  const itemBId = await page.getByTestId('tray-item').nth(1).getAttribute('data-item-id');
  expect(itemBId).toBeTruthy();
  await dragInItem(page, 1, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.86);
  await expect(page.getByTestId('placement')).toHaveCount(2);

  const bItem = itemLocator(page, itemBId!);
  await bItem.locator('.stage__node').click(); // 选中 B
  const bRemove = bItem.locator('[data-testid="placement-remove"]');
  await expect(bRemove).toBeVisible();
  await bRemove.click();
  await expect(page.getByTestId('placement')).toHaveCount(1);
  await expect(bItem).toHaveCount(0);

  // —— 6. 刷新：A 的 (x,y,w,rotation,z) 逐字段还原；B 保持已移除 ——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('placement')).toHaveCount(1);
  const aRestored = itemLocator(page, itemAId!);
  await expect(aRestored).toHaveCount(1);
  expect(await readPl(aRestored)).toEqual(aBefore);
  await expect(itemLocator(page, itemBId!)).toHaveCount(0);

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// B. 场景重命名：点进去改、回车即存 / 失焦即存；刷新后不丢
// ————————————————————————————————————————————————————————————————
test('B 场景重命名：chip 点进去改、回车即存与失焦即存、刷新持久化', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');

  // 点已激活的 chip 进入就地编辑（不开独立设置页）。
  const chip = page.getByTestId('scene-chip');
  await expect(chip).toHaveText('客厅');
  await chip.click();
  const input = page.getByTestId('scene-name-input');
  await expect(input).toBeVisible();

  // —— 回车即存 ——
  await input.fill('温馨小屋');
  await input.press('Enter');
  await expect(page.getByTestId('scene-name-input')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip')).toHaveText('温馨小屋');

  // 刷新后不丢。
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('scene-chip')).toHaveText('温馨小屋');

  // —— 失焦即存（点画布空白使输入框失焦）——
  await page.getByTestId('scene-chip').click();
  const input2 = page.getByTestId('scene-name-input');
  await expect(input2).toBeVisible();
  await input2.fill('老宅');
  await page.mouse.click(VP.hd.width / 2, VP.hd.height / 2); // 点画布空白 → 失焦提交
  await expect(page.getByTestId('scene-name-input')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip')).toHaveText('老宅');

  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('scene-chip')).toHaveText('老宅');

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// C. 场景删除（chip 次级入口 + 一句话确认）：删除即释放该背景配额、可再建；刷新还原
// ————————————————————————————————————————————————————————————————
test('C 场景删除：次级入口 + 一句话确认 → 释放背景配额可再建 → 删除与再建刷新还原', async ({
  page,
}) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');
  await createScene(page, '书房');
  await createScene(page, '卧室'); // 三张背景用满
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  await expect(page.getByTestId('add-scene')).toBeDisabled();
  await expect(page.getByTestId('scenes-exhausted')).toBeVisible();

  // 卧室为当前激活场景 → 其 chip 上浮出删除次级入口（×）。
  await expect(page.getByTestId('scene-chip').filter({ hasText: '卧室' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByTestId('scene-delete').click();

  // 一句话就地确认（克制语气、非大警告框）：确认框内含一句提示 + 删除/取消。
  await expect(page.getByTestId('scene-delete-confirm-box')).toBeVisible();
  await expect(page.getByTestId('scene-delete-confirm-box')).toContainText('删除');
  // 先取消一次（确认可撤销、不误删）。
  await page.getByTestId('scene-delete-cancel').click();
  await expect(page.getByTestId('scene-delete-confirm-box')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);

  // 再删一次并确认。
  await page.getByTestId('scene-delete').click();
  await page.getByTestId('scene-delete-confirm').click();
  await expect(page.getByTestId('scene-chip')).toHaveCount(2);
  await expect(page.getByTestId('scene-chip').filter({ hasText: '卧室' })).toHaveCount(0);

  // 配额释放：＋新场景重新可用，picker 里「卧室」背景回到可选池。
  await expect(page.getByTestId('add-scene')).toBeEnabled();
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
  await expect(page.getByTestId('bg-option')).toHaveCount(1);
  await expect(page.getByTestId('bg-option').filter({ hasText: '卧室' })).toBeVisible();
  // 关掉 picker，先验「删除」这一步刷新后仍在（不是靠再建掩盖）。
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(20, 20);
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('scene-chip')).toHaveCount(2); // 删除持久化
  await expect(page.getByTestId('scene-chip').filter({ hasText: '卧室' })).toHaveCount(0);
  await expect(page.getByTestId('add-scene')).toBeEnabled();

  // 用释放出的背景再建「卧室」→ 回到 3 个；再建刷新后仍在。
  await createScene(page, '卧室');
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  const names = await page.getByTestId('scene-chip').allInnerTexts();
  expect(new Set(names)).toEqual(new Set(['客厅', '书房', '卧室']));

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// D. 物件重命名（dock 缩略卡）：改名挂 Item、跨场景同步；刷新后不丢
// ————————————————————————————————————————————————————————————————
test('D 物件重命名：dock 点名字改、跨场景同步（另一场景摆放读到新名）、刷新持久化', async ({
  page,
}) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);

  // 同一物件摆进两个场景。
  await createScene(page, '客厅');
  const itemId = await placeItemByClick(page, 0);
  await createScene(page, '书房');
  const itemIdInStudy = await placeItemByClick(page, 0);
  expect(itemIdInStudy).toBe(itemId); // 同一件物件

  // 在 dock 就地改名（当前激活场景为「书房」）。
  const nameSpan = page.locator(
    `[data-testid="tray-item"][data-item-id="${itemId}"] [data-testid="item-name"]`,
  );
  await nameSpan.click();
  const nameInput = page.getByTestId('item-name-input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('爷爷的相机');
  await nameInput.press('Enter');
  await expect(page.getByTestId('item-name-input')).toHaveCount(0);
  // dock 缩略卡即刻显示新名。
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${itemId}"] [data-testid="item-name"]`),
  ).toHaveText('爷爷的相机');

  // 书房内该物件的故事弹窗标题读到新名。
  async function storyNameInCurrentScene(): Promise<string> {
    await itemLocator(page, itemId).locator('.stage__node').click();
    await itemLocator(page, itemId).locator('[data-testid="placement-story"]').click();
    const modal = page.getByTestId('story-modal');
    await expect(modal).toBeVisible();
    const name = (await modal.locator('.story__name').textContent())?.trim() ?? '';
    await page.getByTestId('story-close').click();
    await expect(modal).toHaveCount(0);
    return name;
  }
  expect(await storyNameInCurrentScene()).toBe('爷爷的相机');

  // 切回「客厅」→ 另一场景的同一物件也读到新名（跨场景同步）。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  await expect(page.getByTestId('scene-chip').filter({ hasText: '客厅' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await storyNameInCurrentScene()).toBe('爷爷的相机');

  // 刷新后新名仍在（dock 与两场景）。
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${itemId}"] [data-testid="item-name"]`),
  ).toHaveText('爷爷的相机');
  expect(await storyNameInCurrentScene()).toBe('爷爷的相机'); // 还原后仍是客厅（activeSceneId 持久化）
  await page.getByTestId('scene-chip').filter({ hasText: '书房' }).click();
  expect(await storyNameInCurrentScene()).toBe('爷爷的相机');

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// E. 陈列室名（品牌章）就地编辑：点进去改、失焦即存；刷新后不丢
// ————————————————————————————————————————————————————————————————
test('E 陈列室名（品牌章）就地编辑：点进去改、失焦即存、刷新持久化', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');

  const brandName = page.getByTestId('gallery-name');
  await expect(brandName).toHaveText('念念 · 陈列室');
  await brandName.click(); // 点进去改（就地，不开独立设置页）
  const input = page.getByTestId('gallery-name-input');
  await expect(input).toBeVisible();
  await input.fill('老友记忆馆');
  // 失焦即存：点画布空白使输入框失焦。
  await page.mouse.click(VP.hd.width / 2, VP.hd.height / 2);
  await expect(page.getByTestId('gallery-name-input')).toHaveCount(0);
  await expect(page.getByTestId('gallery-name')).toHaveText('老友记忆馆');

  // 刷新后不丢。
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('gallery-name')).toHaveText('老友记忆馆');

  // 再改一次用回车即存，确认两种提交都对陈列室名生效。
  await page.getByTestId('gallery-name').click();
  const input2 = page.getByTestId('gallery-name-input');
  await input2.fill('时光陈列室');
  await input2.press('Enter');
  await expect(page.getByTestId('gallery-name')).toHaveText('时光陈列室');
  await page.reload();
  await expect(page.getByTestId('gallery-name')).toHaveText('时光陈列室');

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// F. 手感/工艺（可自动化项）：手柄触摸命中区 ≥ --h2-hit、无字符图标残留（PC 与横屏手机）
// ————————————————————————————————————————————————————————————————
for (const [label, size] of Object.entries({ PC: VP.hd, 横屏手机: VP.phoneLandscape })) {
  test(`F 手柄命中区 ≥ --h2-hit 且无字符图标残留 @${label}`, async ({ page }) => {
    const problems = watchErrors(page);
    await page.setViewportSize(size);
    await freshApp(page);
    await createScene(page, '客厅');
    await placeItemByClick(page, 0);

    // 选中物件 → 出手柄与工具条。
    const placement = page.getByTestId('placement');
    await placement.locator('.stage__node').click();
    await expect(page.getByTestId('handle-scale')).toHaveCount(4);
    await expect(page.getByTestId('handle-rotate')).toHaveCount(1);
    await expect(page.getByTestId('placement-toolbar')).toBeVisible();

    // 手柄触摸命中区 ≥ --h2-hit：圆点视觉可小，但 ::after 命中区撑到 26px；旋转钮/工具条按钮本体亦 ≥ 26px。
    const hit = await page.evaluate(() => {
      const hitVar = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--h2-hit'),
      );
      const handle = document.querySelector('.stage__handle') as HTMLElement;
      const after = getComputedStyle(handle, '::after');
      const rot = (document.querySelector('.stage__rot') as HTMLElement).getBoundingClientRect();
      const btn = (
        document.querySelector('.stage__toolbar-btn') as HTMLElement
      ).getBoundingClientRect();
      return {
        hitVar,
        afterW: parseFloat(after.width),
        afterH: parseFloat(after.height),
        rotMin: Math.min(rot.width, rot.height),
        btnMin: Math.min(btn.width, btn.height),
      };
    });
    expect(hit.hitVar).toBeGreaterThanOrEqual(26);
    expect(hit.afterW).toBeGreaterThanOrEqual(hit.hitVar - 0.5);
    expect(hit.afterH).toBeGreaterThanOrEqual(hit.hitVar - 0.5);
    expect(hit.rotMin).toBeGreaterThanOrEqual(hit.hitVar - 0.5);
    expect(hit.btnMin).toBeGreaterThanOrEqual(hit.hitVar - 0.5);

    // 无字符图标残留：选中态 chrome 全用真 SVG；物件层文本不含 ⟳ / ✎ / ×。
    const svgOk = await page.evaluate(() => {
      const has = (sel: string) => {
        const el = document.querySelector(sel);
        return !!el && el.querySelector('svg') !== null;
      };
      const itemsText =
        (document.querySelector('.stage__items') as HTMLElement)?.innerText ?? '';
      return {
        rotSvg: has('[data-testid="handle-rotate"]'),
        storySvg: has('[data-testid="placement-story"]'),
        removeSvg: has('[data-testid="placement-remove"]'),
        hasGlyph: /[⟳✎×]/.test(itemsText),
      };
    });
    expect(svgOk.rotSvg).toBe(true);
    expect(svgOk.storySvg).toBe(true);
    expect(svgOk.removeSvg).toBe(true);
    expect(svgOk.hasGlyph).toBe(false);

    expect(problems, problems.join('\n')).toEqual([]);
  });
}
