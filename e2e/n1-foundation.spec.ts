import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— N1 素材与数据地基 e2e（schema v2）。
// 覆盖 milestones.json N1 criteria③ 点名的三点：
//   ① 百分比坐标读写与刷新还原：placement.x/y 存「场景图坐标系百分比」，写入/拖动后刷新完整还原；
//   ② 预置 v1 旧数据启动不崩溃、按作废处理：旧像素坐标数据不迁移，重置为初始空状态（清空重摆）；
//   ③ 故事字段结构保留：Item.story 结构（{id,name,imageSrc,story}）跨 v2 读写不丢、刷新还原。
//
// 契约要点（对齐 idea/goal）：
//  - SCHEMA_VERSION = 2；Placement.x/y 语义 = 场景图坐标系内百分比（相对可视区宽/高，常规落 0–100）。
//  - 旧 v1 数据（schemaVersion=1，像素坐标）加载即作废重置（不崩溃、清空重摆），故事结构不变。
//  - 本 sprint 只做数据存储格式与素材本体；contain 居中＋模糊补边＋缩放钉位的自适应层是 N2 的活。

const STORAGE_KEY = 'memories.gallery';

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

/** 点选放入（默认网格位）：点抽屉第 index 件缩略卡，在当前场景建一条 placement，返回其 itemId。 */
async function placeItemByClick(page: Page, index: number): Promise<string> {
  const tray = page.getByTestId('tray-item').nth(index);
  const itemId = await tray.getAttribute('data-item-id');
  expect(itemId).toBeTruthy();
  const before = await page.getByTestId('placement').count();
  await tray.click();
  await expect(page.getByTestId('placement')).toHaveCount(before + 1);
  return itemId!;
}

function itemLocator(page: Page, itemId: string): Locator {
  return page.locator(`.stage__item[data-item-id="${itemId}"]`);
}

/** 读回某 placement 的百分比坐标（data-x/data-y 暴露的即存储的百分比原值）。 */
async function readPct(loc: Locator): Promise<{ x: number; y: number }> {
  return {
    x: Number(await loc.getAttribute('data-x')),
    y: Number(await loc.getAttribute('data-y')),
  };
}

/** 真实拖拽：从元素中心拖到 (+dx, +dy)。 */
async function dragBy(page: Page, loc: Locator, dx: number, dy: number) {
  const b = await loc.boundingBox();
  expect(b).not.toBeNull();
  const cx = b!.x + b!.width / 2;
  const cy = b!.y + b!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 14 });
  await page.mouse.up();
}

/** 读回 localStorage 里的整棵状态树（JSON）。 */
async function readStore(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORAGE_KEY);
}

// —— 故事编辑（对齐 M3 交互）——
async function openStoryEditor(page: Page, itemId: string) {
  const item = itemLocator(page, itemId);
  await expect(item).toHaveCount(1);
  await item.locator('.stage__node').click(); // 选中 → 手柄链出现
  const storyBtn = item.locator('[data-testid="placement-story"]');
  await expect(storyBtn).toBeVisible();
  await storyBtn.click();
  await expect(page.getByTestId('story-modal')).toBeVisible();
  await expect(page.getByTestId('story-input')).toBeVisible();
}

async function writeStory(page: Page, itemId: string, text: string) {
  await openStoryEditor(page, itemId);
  await page.getByTestId('story-input').fill(text);
  await page.getByTestId('story-save').click();
  await expect(page.getByTestId('story-modal')).toHaveCount(0);
}

async function readStoryViaEditor(page: Page, itemId: string): Promise<string> {
  await openStoryEditor(page, itemId);
  const value = await page.getByTestId('story-input').inputValue();
  await page.getByTestId('story-cancel').click();
  await expect(page.getByTestId('story-modal')).toHaveCount(0);
  return value;
}

test('① 百分比坐标读写与刷新还原：placement.x/y 存场景图坐标系百分比，拖动改位后刷新完整还原', async ({
  page,
}) => {
  await freshApp(page);
  await createScene(page, '客厅');
  await placeItemByClick(page, 0);
  const placement = page.getByTestId('placement');

  // —— data-x/data-y 是场景图坐标系「百分比」（常规摆放落 0–100），不是像素。——
  const pct = await readPct(placement);
  expect(pct.x).toBeGreaterThanOrEqual(0);
  expect(pct.x).toBeLessThanOrEqual(100);
  expect(pct.y).toBeGreaterThanOrEqual(0);
  expect(pct.y).toBeLessThanOrEqual(100);

  // —— 存储即百分比：localStorage 为 schema v4（N1 立的百分比坐标语义延续至今），placements[0].x/y == data-*，且落在 [0,100]。——
  const stored = await readStore(page);
  expect(stored.schemaVersion).toBe(4);
  expect(stored.placements).toHaveLength(1);
  expect(stored.placements[0].x).toBeCloseTo(pct.x, 5);
  expect(stored.placements[0].y).toBeCloseTo(pct.y, 5);
  expect(stored.placements[0].x).toBeGreaterThanOrEqual(0);
  expect(stored.placements[0].x).toBeLessThanOrEqual(100);

  // —— 读路径：百分比 → 像素换算成立。N2 起坐标锚定「场景图矩形」（contain 几何）：物件中心 =
  //  imgRect 原点 + 百分比 × imgRect 宽/高。渲染出的物件中心应落在该换算点上（inline 位移仍只经 translate）。——
  const style = (await placement.getAttribute('style')) ?? '';
  expect(
    /translate\(\s*[-\d.]+px\s*,\s*[-\d.]+px\s*\)/.test(style),
    `inline transform 应为 translate(px,px)：${style}`,
  ).toBe(true);
  // 场景图须已加载（其 natural 尺寸定 contain 几何，也是物件百分比的参照系）。
  const sceneImg = page.getByTestId('scene-img');
  await expect(sceneImg).toHaveJSProperty('complete', true);
  const cbox = (await page.getByTestId('canvas').boundingBox())!;
  const nat = await sceneImg.evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }));
  expect(nat.w).toBeGreaterThan(0);
  // 与 Canvas.containRect 同式：场景图 contain 居中后占据的矩形（相对画布左上角 px）。
  const aspect = nat.w / nat.h;
  const iw = Math.min(cbox.width, cbox.height * aspect);
  const ih = iw / aspect;
  const ox = (cbox.width - iw) / 2;
  const oy = (cbox.height - ih) / 2;
  // 物件渲染中心（相对画布左上角）——旋转绕中心，boundingBox 中心即物件中心。
  const nb = (await placement.locator('.stage__node').boundingBox())!;
  const centerX = nb.x + nb.width / 2 - cbox.x;
  const centerY = nb.y + nb.height / 2 - cbox.y;
  expect(Math.abs(centerX - (ox + (pct.x / 100) * iw))).toBeLessThan(2);
  expect(Math.abs(centerY - (oy + (pct.y / 100) * ih))).toBeLessThan(2);

  // —— 写路径：拖动改位 → 写入新百分比（与初值不同、仍在合理域）。——
  await dragBy(page, placement.locator('.stage__node'), 80, 56);
  const moved = await readPct(placement);
  expect(moved.x).not.toBe(pct.x);
  expect(moved.y).not.toBe(pct.y);
  expect(moved.x).toBeGreaterThanOrEqual(0);
  expect(moved.x).toBeLessThanOrEqual(100);
  const storedMoved = await readStore(page);
  expect(storedMoved.placements[0].x).toBeCloseTo(moved.x, 5);

  // —— 刷新还原：百分比坐标逐字段精确还原。——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('placement')).toHaveCount(1);
  const restored = await readPct(page.getByTestId('placement'));
  expect(restored.x).toBe(moved.x);
  expect(restored.y).toBe(moved.y);
});

test('② 预置 v1 旧数据启动不崩溃、按作废处理（不迁移、清空重摆，升为 v2 空态）', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/');
  // 预置一份 v1 旧格式数据：schemaVersion=1，像素坐标 placement + 场景 + 故事。
  await page.evaluate((k) => {
    const v1 = {
      schemaVersion: 1,
      scenes: [{ id: 'scene-old', name: '客厅', backgroundId: 'living-room' }],
      items: [{ id: 'bedroom-1', name: '全家福旧照', imageSrc: 'stale-url', story: '旧版故事' }],
      placements: [
        { id: 'pl-old', sceneId: 'scene-old', itemId: 'bedroom-1', x: 240, y: 180, scale: 1, rotation: 0, z: 1 },
      ],
      activeSceneId: 'scene-old',
      mode: 'edit',
    };
    localStorage.setItem(k, JSON.stringify(v1));
  }, STORAGE_KEY);
  await page.reload();

  // 不崩溃：外壳照常渲染。
  await expect(page.getByTestId('app')).toBeVisible();
  // 作废处理：v1 不迁移，重置为初始空状态——无场景、无摆放（清空重摆）。
  await expect(page.getByTestId('scene-chip')).toHaveCount(0);
  await expect(page.getByTestId('placement')).toHaveCount(0);
  // 抽屉 14 件仍在（初始物件目录就位）。
  await expect(page.getByTestId('tray-item')).toHaveCount(14);

  // 存储被作废重置后升为 v2 初始态（由 App 全量落盘）。
  const stored = await readStore(page);
  expect(stored.schemaVersion).toBe(4);
  expect(stored.scenes).toHaveLength(0);
  expect(stored.placements).toHaveLength(0);
  // 旧场景/旧摆放/旧像素坐标一律不残留。
  expect(stored.activeSceneId).toBeNull();

  // 全程无未捕获错误 / 无 console error（“启动不崩溃”）。
  expect(problems, `不应出现未捕获错误：\n${problems.join('\n')}`).toEqual([]);
});

test('③ 故事字段结构保留：写故事→刷新还原，Item.story 结构（{id,name,imageSrc,story}）不丢', async ({
  page,
}) => {
  await freshApp(page);
  await createScene(page, '书房');
  const itemId = await placeItemByClick(page, 0);
  const STORY = '外婆的旧照片：泛黄的边角，笑得很暖。';

  await writeStory(page, itemId, STORY);

  // 刷新前：localStorage 为 v2，目标 Item 结构完整、story 为写入文本。
  const before = await readStore(page);
  expect(before.schemaVersion).toBe(4);
  const it0 = before.items.find((i: { id: string }) => i.id === itemId);
  expect(it0).toBeTruthy();
  // 故事结构保留：核心字段（id/name/imageSrc/story）跨版本读写不丢（U1 后 Item 另带 source/aspectRatio/
  //  originalImageSrc/displayImageSrc 等图位与来源标记，故按「含核心字段」核验而非旧的四字段全等）。
  expect(Object.keys(it0)).toEqual(expect.arrayContaining(['id', 'imageSrc', 'name', 'story']));
  expect(typeof it0.story).toBe('string');
  expect(it0.story).toBe(STORY);

  // —— 刷新还原 ——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('placement')).toHaveCount(1);

  // 故事仍在（结构保留、跨 v2 读写不丢）。
  const restored = await readStoryViaEditor(page, itemId);
  expect(restored).toBe(STORY);

  const after = await readStore(page);
  const it1 = after.items.find((i: { id: string }) => i.id === itemId);
  expect(it1).toBeTruthy();
  expect(Object.keys(it1)).toEqual(expect.arrayContaining(['id', 'imageSrc', 'name', 'story']));
  expect(typeof it1.story).toBe('string');
  expect(it1.story).toBe(STORY);
});
