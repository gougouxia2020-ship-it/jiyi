import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— M3 物件故事与编辑/游客双模式 e2e（M3-S2 全链路）。
// 覆盖 milestones.json M3 criteria 点名的完整链路：
//   ① 选中物件写故事 → 刷新后还原
//   ② 同一物件在另一场景故事同步更新（双向）
//   ③ 切游客模式点物件只弹故事+原图，且不可编辑故事、不可拖动/缩放/旋转/移除、不出选中态手柄
//
// 硬指标要点：
//  - 故事挂 Item 本身（非 Placement）；保存经既有全量持久化落 LocalStorage、刷新完整还原；
//    同一 Item 摆入两个场景，一处改、另一处同步为最新值（不得新旧不一致）。
//  - 编辑模式：选中物件 → 「✎ 故事」手柄打开半透明弹窗（含 textarea + 保存）写/改故事。
//  - 游客模式：点物件直接弹半透明弹窗，只读——只有故事正文 + 原始照片，无输入/保存；
//    弹窗以外物件不可拖动、无手柄；✕ 或点画布空白关闭。

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

/** 编辑模式：选中某物件的 placement（按 itemId 定位）→ 点「✎ 故事」手柄 → 打开可编辑弹窗。 */
async function openStoryEditor(page: Page, itemId: string) {
  const item = itemLocator(page, itemId);
  await expect(item).toHaveCount(1);
  await item.locator('.stage__node').click(); // 选中 → 手柄链出现
  const storyBtn = item.locator('[data-testid="placement-story"]');
  await expect(storyBtn).toBeVisible();
  await storyBtn.click();
  const modal = page.getByTestId('story-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('data-item-id', itemId);
  await expect(modal).toHaveAttribute('data-mode', 'edit');
  await expect(page.getByTestId('story-input')).toBeVisible();
}

function storyInput(page: Page): Locator {
  return page.getByTestId('story-input');
}

/** 编辑模式：打开弹窗 → 写入 text → 保存 → 弹窗关闭。 */
async function writeStory(page: Page, itemId: string, text: string) {
  await openStoryEditor(page, itemId);
  await storyInput(page).fill(text);
  await page.getByTestId('story-save').click();
  await expect(page.getByTestId('story-modal')).toHaveCount(0);
}

/** 编辑模式：打开弹窗读回当前故事文本（不改动）→ 取消关闭。 */
async function readStoryViaEditor(page: Page, itemId: string): Promise<string> {
  await openStoryEditor(page, itemId);
  const value = await storyInput(page).inputValue();
  await page.getByTestId('story-cancel').click();
  await expect(page.getByTestId('story-modal')).toHaveCount(0);
  return value;
}

interface XY {
  x: number;
  y: number;
}

async function readXY(item: Locator): Promise<XY> {
  return {
    x: Number(await item.getAttribute('data-x')),
    y: Number(await item.getAttribute('data-y')),
  };
}

/** 真实拖拽：从元素中心拖到 (+dx, +dy)。 */
async function dragBy(page: Page, loc: Locator, dx: number, dy: number) {
  const b = await loc.boundingBox();
  expect(b, 'boundingBox 不应为空（元素须可见）').not.toBeNull();
  const cx = b!.x + b!.width / 2;
  const cy = b!.y + b!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 14 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('① 选中物件写故事 → 保存 → 刷新后故事完整还原（故事挂 Item，全量持久化）', async ({ page }) => {
  await createScene(page, '客厅');
  const itemId = await placeItemByClick(page, 0);

  const STORY = '这是奶奶留下的那张全家福，1987 年春节拍的。';
  await writeStory(page, itemId, STORY);

  // 保存即经 App 的 saveState 全量落 LocalStorage：LocalStorage 里应能读到该物件的故事。
  const persisted = await page.evaluate((id) => {
    const raw = localStorage.getItem('memories.gallery');
    if (!raw) return null;
    const s = JSON.parse(raw);
    const it = (s.items ?? []).find((i: { id: string }) => i.id === id);
    return { story: it?.story ?? null, schemaVersion: s.schemaVersion };
  }, itemId);
  expect(persisted?.story).toBe(STORY);
  expect(persisted?.schemaVersion).toBe(4); // schema v4（U1-S2：照片二进制迁 IndexedDB、状态树只存引用；故事仍挂 Item、结构不变）

  // —— 刷新后故事完整还原 ——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(itemLocator(page, itemId)).toHaveCount(1);
  expect(await readStoryViaEditor(page, itemId)).toBe(STORY);
});

test('② 同一物件摆入两个场景：一处改故事 → 另一场景同步为最新值（跨场景同步，双向）', async ({
  page,
}) => {
  // 场景 A（客厅）放入物件 X，写故事 S1。
  await createScene(page, '客厅');
  const itemId = await placeItemByClick(page, 0);
  const S1 = '故事 S1 · 在客厅写下的第一版。';
  await writeStory(page, itemId, S1);

  // 场景 B（书房）放入同一物件 X（另一条 Placement）。切到 B 后打开弹窗，读到的应是 A 里写的 S1
  // ——证明故事挂 Item、随 Item 跨场景同步，而非某条 Placement 的本地副本。
  await createScene(page, '书房');
  await expect(page.getByTestId('placement')).toHaveCount(0); // B 是新场景，暂无摆放
  const itemIdB = await placeItemByClick(page, 0);
  expect(itemIdB).toBe(itemId); // 同一件物件
  expect(await readStoryViaEditor(page, itemId)).toBe(S1); // A 改的，B 已同步

  // 在 B 里把故事改成 S2，保存。
  const S2 = '故事 S2 · 在书房改成的第二版。';
  await writeStory(page, itemId, S2);

  // 切回场景 A，同一物件 X 的故事应已同步为 S2（反方向同步）。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  await expect(itemLocator(page, itemId)).toHaveCount(1);
  expect(await readStoryViaEditor(page, itemId)).toBe(S2);

  // 再刷新，两个场景读回的都是最新的 S2（无新旧不一致、无丢失）。
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  // 刷新后停在场景 A：读 A。
  expect(await readStoryViaEditor(page, itemId)).toBe(S2);
  // 切到 B：读 B。
  await page.getByTestId('scene-chip').filter({ hasText: '书房' }).click();
  expect(await readStoryViaEditor(page, itemId)).toBe(S2);
});

test('③ 切游客模式：点物件只弹故事+原图（只读），不出手柄、不可编辑、不可拖动/移除', async ({
  page,
}) => {
  // 编辑模式下先备好数据：放入物件、写好故事。
  await createScene(page, '客厅');
  const itemId = await placeItemByClick(page, 0);
  const STORY = '这台老式收音机是外公修了一辈子的营生，旋钮上还留着他的指痕。';
  await writeStory(page, itemId, STORY);

  const item = itemLocator(page, itemId);
  const before = await readXY(item); // 游客拖动前的落位（用于验证「不可拖动」）

  // —— 切到游客模式（一键切换）——
  await page.getByTestId('mode-guest').click();
  // E1-S2·游客不可逆守卫：切到 guest 后「模式开关」整组按钮整体不再渲染（从 DOM 消失，非 disabled/隐藏）——
  //   旧写法断言刚点击的 mode-guest 自身 aria-pressed，但该按钮已随切换消失、断言前提被推翻。改为断言
  //   两枚模式按钮均已不存在，即已确认切到 guest（无按钮可切回编辑）；下方只读复核的业务意图不变。
  await expect(page.getByTestId('mode-guest')).toHaveCount(0);
  await expect(page.getByTestId('mode-edit')).toHaveCount(0);
  // 切模式即关掉任何弹窗、清选中态。
  await expect(page.getByTestId('story-modal')).toHaveCount(0);

  // 点画布空白：稳定落在画布右上角小空档——弹窗垂直居中、占右侧，该点在弹窗上方/右侧的空隙里，
  // 且在视口内（画布高 640 会伸到 720 视口以下，故不能取底部角）。
  const canvas = page.getByTestId('canvas');
  const cbox = (await canvas.boundingBox())!;
  const clickBlank = () => page.mouse.click(cbox.x + cbox.width - 12, cbox.y + 12);

  // —— 点物件 → 弹出半透明故事弹窗（游客只读态）——
  await item.locator('.stage__node').click();
  const modal = page.getByTestId('story-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('data-item-id', itemId);
  await expect(modal).toHaveAttribute('data-mode', 'guest');

  // 只弹「故事 + 原图」：故事正文可见且为已写内容；原始照片缩略可见。
  await expect(page.getByTestId('story-body')).toHaveText(STORY);
  const photo = page.getByTestId('story-photo');
  await expect(photo).toBeVisible();
  expect(await photo.getAttribute('src')).toBeTruthy();
  // 弹窗含「它的故事」kicker（视觉硬指标之一）。
  await expect(modal.getByText('它的故事')).toBeVisible();

  // 不可编辑故事：游客弹窗内绝无输入区 / 保存 / 取消（只读）。
  await expect(page.getByTestId('story-input')).toHaveCount(0);
  await expect(page.getByTestId('story-save')).toHaveCount(0);
  await expect(page.getByTestId('story-cancel')).toHaveCount(0);
  // 仍不出选中态手柄。
  await expect(page.getByTestId('handle-scale')).toHaveCount(0);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(0);
  await expect(page.getByTestId('placement-remove')).toHaveCount(0);
  await expect(page.getByTestId('placement-story')).toHaveCount(0);
  await expect(page.locator('.stage__frame')).toHaveCount(0);

  // —— ✕ 关闭 ——
  await page.getByTestId('story-close').click();
  await expect(modal).toHaveCount(0);

  // —— 再点物件弹出 → 点画布空白关闭（交互铁律「再点空白/✕ 关闭」）——
  await item.locator('.stage__node').click();
  await expect(page.getByTestId('story-modal')).toBeVisible();
  await clickBlank();
  await expect(page.getByTestId('story-modal')).toHaveCount(0);

  // —— 不可拖动：拖物件后落位不变，且拖拽过程中不冒出任何选中态手柄 ——
  await dragBy(page, item.locator('.stage__node'), 46, 38);
  const after = await readXY(item);
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  await expect(page.getByTestId('handle-scale')).toHaveCount(0);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(0);
});
