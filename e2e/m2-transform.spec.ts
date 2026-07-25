import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— M2 变换交互 e2e。
// 覆盖 M2 验收硬指标点名的全链路：
//   物件从抽屉「拖入」画布 → 拖动改位 → 角手柄缩放 → 顶部手柄旋转 → 移除
//   → 刷新后 placement(x,y,w,rotation,z) 完整还原。
//
// 每步变换只经 CSS transform 落位：位移在 .stage__item 的 translate、旋转在 .stage__tf 的 rotate；
// 缩放折算成宽度（w，占场景图宽百分比，img 的 style.width）。持久化字段全量暴露为 .stage__item 的
// data-x/y/w/rotation/z，据此核对刷新还原。
//
// —— 与 M2 立项时（schema v2）的差异（后续里程碑刻意演进、本 spec 随之校准）——
//  · N1(v2)→N2(v3)：坐标系从「可视区百分比 + scale 倍率」改为「场景图矩形（contain 几何）百分比 + w
//    宽度百分比」——不再有 scale 字段，缩放改记 w；落点/位移锚定 contain 后的场景图矩形 imgRect。
//  · N2：满屏沉浸——画布铺满整个视口，报头/场景条/dock 均为浮在画布之上的浮层；故「落到画布外」
//    的唯一无效区是视口之外（浮层区在拖动中让路、pointer-events:none，落在其上即落到其下的画布）。
//  · U1(v4)：照片二进制迁 IndexedDB、状态树只存引用；schemaVersion=4。

/** 新摆放的默认宽度（占场景图宽的百分比，见 state/gallery.DEFAULT_ITEM_W）。 */
const DEFAULT_ITEM_W = 12;

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
  // 先越过拖动阈值（触发幽灵），再走到落点。
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

async function readPlacement(loc: Locator): Promise<PlacementData> {
  return {
    x: Number(await loc.getAttribute('data-x')),
    y: Number(await loc.getAttribute('data-y')),
    w: Number(await loc.getAttribute('data-w')),
    rotation: Number(await loc.getAttribute('data-rotation')),
    z: Number(await loc.getAttribute('data-z')),
  };
}

/** 场景图 contain 矩形（相对画布左上角 px）——与 Canvas.containRect / Workbench 落点换算同式。 */
async function imgRectOf(page: Page): Promise<{ ox: number; oy: number; iw: number; ih: number; cbox: Box }> {
  const cbox = await boxOf(page.getByTestId('canvas'));
  const sceneImg = page.getByTestId('scene-img');
  await expect(sceneImg).toHaveJSProperty('complete', true);
  const nat = await sceneImg.evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }));
  expect(nat.w).toBeGreaterThan(0);
  const aspect = nat.w / nat.h;
  const iw = Math.min(cbox.width, cbox.height * aspect);
  const ih = iw / aspect;
  const ox = (cbox.width - iw) / 2;
  const oy = (cbox.height - ih) / 2;
  return { ox, oy, iw, ih, cbox };
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('全链路变换：抽屉拖入 → 拖动改位 → 角手柄缩放 → 顶部手柄旋转 → 移除 → 刷新完整还原', async ({
  page,
}) => {
  await createScene(page, '客厅');
  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);

  // —— 1. 抽屉「拖入」画布（真实拖拽，落点由拖拽终点决定，不是默认网格位）——
  const itemAId = await page.getByTestId('tray-item').nth(0).getAttribute('data-item-id');
  expect(itemAId).toBeTruthy();
  // 落在画布中上部（居中，留足四周让手柄不越出可视区）。
  const dropFx = 0.5;
  const dropFy = 0.42;
  await dragInItem(page, 0, cbox.x + cbox.width * dropFx, cbox.y + cbox.height * dropFy);

  const placement = page.getByTestId('placement');
  await expect(placement).toHaveCount(1);
  await expect(placement).toHaveAttribute('data-item-id', itemAId!);

  const dropped = await readPlacement(placement);
  // N2（schema v3）：placement.x/y 存「场景图坐标系百分比」（相对 contain 后场景图矩形 imgRect 的中心
  //  百分比），非可视区百分比、非像素。落点坐标应等于「指针放手处换算到 imgRect 内的中心百分比」——
  //  证明是真实拖入落点，而非点选放入的默认网格首位（默认 x=18,y=24）。容差按百分比给（含鼠标整数取整）。
  const { ox, oy, iw, ih } = await imgRectOf(page);
  const dropCanvasX = cbox.width * dropFx; // 落点相对画布左上角 px
  const dropCanvasY = cbox.height * dropFy;
  const expectXPct = ((dropCanvasX - ox) / iw) * 100;
  const expectYPct = ((dropCanvasY - oy) / ih) * 100;
  expect(Math.abs(dropped.x - expectXPct)).toBeLessThan(1);
  expect(Math.abs(dropped.y - expectYPct)).toBeLessThan(1);
  expect(dropped.x).not.toBe(18); // 不是默认网格首位
  expect(dropped.w).toBe(DEFAULT_ITEM_W); // 新摆放默认宽度

  // 落位只经 transform：inline style 是 translate + z-index，不含 left/top。
  const itemStyle = (await placement.getAttribute('style')) ?? '';
  expect(itemStyle).toContain('translate(');
  expect(itemStyle).not.toContain('left');
  expect(itemStyle).not.toContain('top');

  // —— 2. 拖动改位（选中 + 拖 <img>）——
  const img = placement.locator('.stage__node');
  await dragBy(page, img, 40, 34);
  const afterMove = await readPlacement(placement);
  expect(afterMove.x).not.toBe(dropped.x);
  expect(afterMove.y).not.toBe(dropped.y);
  // 拖动只改 x/y，不动 w/rotation/z。
  expect(afterMove.w).toBe(dropped.w);
  expect(afterMove.rotation).toBe(dropped.rotation);
  expect(afterMove.z).toBe(dropped.z);

  // 手柄应已随选中态出现（缩放 ×4 + 旋转 ×1）。
  await expect(page.getByTestId('handle-scale')).toHaveCount(4);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(1);

  // —— 3. 角手柄缩放（拖右下角向外 → 放大宽度 w）——
  const brHandle = page.locator('[data-testid="handle-scale"][data-corner="br"]');
  await dragBy(page, brHandle, 44, 36);
  const afterScale = await readPlacement(placement);
  expect(afterScale.w).toBeGreaterThan(afterMove.w); // w 变大（缩放折算成宽度百分比）
  // 缩放只改 w，不动 x/y/rotation/z。
  expect(afterScale.x).toBe(afterMove.x);
  expect(afterScale.y).toBe(afterMove.y);
  expect(afterScale.rotation).toBe(afterMove.rotation);
  expect(afterScale.z).toBe(afterMove.z);

  // 旋转经 .stage__tf 的 transform（rotate）；缩放折算成 img 宽度（style.width，非 tf 的 scale()）。
  const tfStyle = (await placement.locator('.stage__tf').getAttribute('style')) ?? '';
  expect(tfStyle).toContain('rotate(');
  const nodeWidthStyle = await img.evaluate((el) => (el as HTMLElement).style.width);
  expect(nodeWidthStyle).toMatch(/px$/); // 宽度以 px 直接定尺（由 w 折算）

  // —— 4. 顶部手柄旋转（拖 ⟳ 钮横向 → 转角变化）——
  const rotHandle = page.getByTestId('handle-rotate');
  await dragBy(page, rotHandle, 64, 18);
  const afterRotate = await readPlacement(placement);
  expect(afterRotate.rotation).not.toBe(afterScale.rotation); // rotation 变化
  // 旋转只改 rotation，不动 x/y/w/z。
  expect(afterRotate.x).toBe(afterScale.x);
  expect(afterRotate.y).toBe(afterScale.y);
  expect(afterRotate.w).toBe(afterScale.w);
  expect(afterRotate.z).toBe(afterScale.z);

  // A 此刻的完整变换（刷新后须逐字段还原）。
  const aBefore = afterRotate;

  // —— 5. 再拖入 B，然后移除 B（验证移除 + 移除的持久化）——
  // 先点画布空白处取消选中 A（避免 A 的选中态置顶层叠影响后续对 B 的点选）。
  await page.mouse.click(cbox.x + cbox.width - 20, cbox.y + cbox.height - 20);
  const itemBId = await page.getByTestId('tray-item').nth(1).getAttribute('data-item-id');
  expect(itemBId).toBeTruthy();
  // B 落在画布下部，与 A 明显分离，便于独立点选。
  await dragInItem(page, 1, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.86);
  await expect(page.getByTestId('placement')).toHaveCount(2);

  const bItem = page.locator(`.stage__item[data-item-id="${itemBId}"]`);
  await bItem.locator('.stage__node').click(); // 选中 B
  const bRemove = bItem.locator('[data-testid="placement-remove"]');
  await expect(bRemove).toBeVisible();
  await bRemove.click();
  await expect(page.getByTestId('placement')).toHaveCount(1);
  await expect(bItem).toHaveCount(0);

  // —— 6. 刷新：A 的 placement(x,y,w,rotation,z) 完整还原；B 保持已移除 ——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('placement')).toHaveCount(1);

  const aRestored = page.locator(`.stage__item[data-item-id="${itemAId}"]`);
  await expect(aRestored).toHaveCount(1);
  const aAfter = await readPlacement(aRestored);
  expect(aAfter.x).toBe(aBefore.x);
  expect(aAfter.y).toBe(aBefore.y);
  expect(aAfter.w).toBe(aBefore.w);
  expect(aAfter.rotation).toBe(aBefore.rotation);
  expect(aAfter.z).toBe(aBefore.z);

  // B 仍不在（移除结果持久化）。
  await expect(page.locator(`.stage__item[data-item-id="${itemBId}"]`)).toHaveCount(0);
});

test('抽屉拖入落到视口外（画布之外）→ 不建 placement（真实拖拽的落点判定）', async ({ page }) => {
  await createScene(page, '书房');
  // N2 满屏后画布铺满整个视口、浮层拖动中让路——唯一「画布之外」的无效落点是视口之外。
  // 把物件拖到视口上缘之上（clientY<0，越出 stage 矩形上边）松手：Workbench.handleDropItemAt
  //  的边界判定拒收（clientY<rect.top）→ 不应建出 placement。
  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);
  await dragInItem(page, 0, cbox.x + cbox.width / 2, cbox.y - 60);
  await expect(page.getByTestId('placement')).toHaveCount(0);
});
