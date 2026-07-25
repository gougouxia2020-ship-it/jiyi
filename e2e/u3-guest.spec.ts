import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— U3 里程碑官方 e2e 之三：游客模式只读复核。
//
// 验收硬指标（milestones.json U3 criteria[2] / success.json「游客模式无上传入口」）：
//   切到游客模式后看不到也用不到任何**上传 / 删除 / 重命名**入口，点物件只弹故事与原图（只读），
//   无法改动任何数据；在游客模式下找得到任一上传/删除/重命名入口，或能改动任何数据，即判失败。
//
// 尤其覆盖本代际新增的**删除入口**（U3-S1）——它必须和上传入口一样在游客模式下彻底不可见、不可用。
//
// 手法：先在编辑模式把料备齐（建场景 + 上传一件用户物件 + 摆入场景 + 写故事——这样删除/重命名/上传/
//   变换等入口在编辑态都真实存在），记录一份数据基线；再切到游客模式，逐项复核所有写入口消失、
//   逐项尝试改动并断言数据分毫未动，最后核对 LocalStorage 与切换前完全一致。

const STORAGE_KEY = 'memories.gallery';
const VP = { width: 1280, height: 800 };

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

async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

async function injectFile(page: Page, name: string) {
  await page.evaluate(async (fname) => {
    const c = document.createElement('canvas');
    c.width = 260;
    c.height = 200;
    const cx = c.getContext('2d')!;
    cx.fillStyle = 'rgb(150,110,70)';
    cx.fillRect(0, 0, c.width, c.height);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    const file = new File([blob], fname, { type: 'image/jpeg' });
    const input = document.querySelector('[data-testid="upload-input"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
}

async function uploadUserItem(page: Page, name: string): Promise<string> {
  await ensureDockOpen(page);
  const items = page.getByTestId('tray-item');
  const before = await items.count();
  await page.getByTestId('upload-add').click();
  await injectFile(page, `${name}.jpg`);
  await expect(page.getByTestId('upload-preview')).toBeVisible();
  await page.getByTestId('upload-preview-name').fill(name);
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  await expect(items).toHaveCount(before + 1);
  const id = await items.nth(before).getAttribute('data-item-id');
  expect(id).toBeTruthy();
  return id!;
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

async function dragFromTo(page: Page, src: Locator, dropX: number, dropY: number) {
  await src.scrollIntoViewIfNeeded();
  const b = await boxOf(src);
  const sx = b.x + b.width / 2;
  const sy = b.y + b.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 24, sy + 12, { steps: 4 });
  await page.mouse.move(dropX, dropY, { steps: 16 });
  await page.mouse.up();
}

async function dragBy(page: Page, loc: Locator, dx: number, dy: number) {
  const b = await boxOf(loc);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 14 });
  await page.mouse.up();
}

function itemLocator(page: Page, itemId: string): Locator {
  return page.locator(`.stage__item[data-item-id="${itemId}"]`);
}

interface Snapshot {
  galleryName: string;
  items: { id: string; name: string; story: string }[];
  placements: { id: string; x: number; y: number; w: number; rotation: number }[];
}
async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null') || {};
    return {
      galleryName: s.galleryName ?? '',
      items: (s.items ?? []).map((i: { id: string; name: string; story?: string }) => ({
        id: i.id,
        name: i.name,
        story: i.story ?? '',
      })),
      placements: (s.placements ?? []).map(
        (p: { id: string; x: number; y: number; w: number; rotation: number }) => ({
          id: p.id,
          x: p.x,
          y: p.y,
          w: p.w,
          rotation: p.rotation,
        }),
      ),
    };
  }, STORAGE_KEY);
}

// ————————————————————————————————————————————————————————————————
// 游客模式：无上传/删除/重命名入口，点物件只弹故事+原图（只读），不能改动任何数据
// ————————————————————————————————————————————————————————————————
test('游客模式只读复核：无上传/删除/重命名入口，点物件只弹故事+原图，改不动任何数据', async ({
  page,
}) => {
  const problems = watchErrors(page);
  const STORY = '这封信外婆写了三页，落款是 1979 年冬。';
  await page.setViewportSize(VP);
  await freshApp(page);

  // —— 编辑模式备料：建场景 → 上传一件用户物件 → 摆入场景 → 写故事 ——
  await createScene(page, '客厅');
  const userId = await uploadUserItem(page, '外婆的信');

  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);
  const userThumb = page.locator(`[data-testid="tray-item"][data-item-id="${userId}"]`);
  await dragFromTo(page, userThumb, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.45);
  const placement = itemLocator(page, userId);
  await expect(placement).toHaveCount(1);

  const node = placement.locator('.stage__node');
  await node.click();
  await placement.locator('[data-testid="placement-story"]').click();
  const editModal = page.getByTestId('story-modal');
  await expect(editModal).toBeVisible();
  await editModal.getByTestId('story-input').fill(STORY);
  await editModal.getByTestId('story-save').click();
  await expect(editModal).toHaveCount(0);

  // 编辑态先确认这些写入口/管理入口都**真实存在**（否则「游客下消失」就没有说服力）。
  await ensureDockOpen(page);
  await expect(page.getByTestId('upload-add')).toBeVisible(); // 上传入口
  await expect(userThumb.getByTestId('item-delete')).toBeVisible(); // 删除入口（本代际新增）
  await expect(userThumb.getByTestId('item-name')).toBeVisible(); // 物件重命名入口
  await expect(page.getByTestId('add-scene')).toBeVisible(); // 新建场景入口
  await expect(page.getByTestId('scene-delete')).toBeVisible(); // 场景删除入口
  await expect(page.getByTestId('gallery-name')).toBeVisible(); // 陈列室重命名入口

  // 数据基线（切游客前落盘的真值）：轮询等 saveState 落定。
  let base: Snapshot = { galleryName: '', items: [], placements: [] };
  await expect
    .poll(async () => {
      base = await snapshot(page);
      const it = base.items.find((i) => i.id === userId);
      return it?.story === STORY && base.placements.length === 1;
    })
    .toBe(true);

  // ============ 切到游客模式 ============
  await page.getByTestId('mode-guest').click();
  // E1-S2·游客不可逆守卫：切到 guest 后「模式开关」整组按钮整体不再渲染（从 DOM 消失，非 disabled/隐藏）——
  //   旧写法断言刚点击的 mode-guest 自身 aria-pressed，但该按钮已随切换消失、断言前提被推翻。改为断言
  //   两枚模式按钮均已不存在，正好也确认了「已切到 guest 且界面上无按钮可切回编辑」这一新行为；
  //   下方逐项复核「无上传/删除/重命名入口、改不动数据」的业务意图完全不变。
  await expect(page.getByTestId('mode-guest')).toHaveCount(0);
  await expect(page.getByTestId('mode-edit')).toHaveCount(0);

  // —— A. 逐项复核：所有上传/删除/重命名/管理/变换入口在游客模式下彻底消失 ——
  await expect(page.getByTestId('tray')).toHaveCount(0); // 整个 dock 不渲染
  await expect(page.getByTestId('upload-add')).toHaveCount(0); // 上传入口：无
  await expect(page.getByTestId('upload-quota')).toHaveCount(0); // 配额计数也随 dock 收起
  await expect(page.getByTestId('item-delete')).toHaveCount(0); // 删除入口：无（本代际新增，重点复核）
  await expect(page.getByTestId('item-name')).toHaveCount(0); // 物件重命名入口：无
  await expect(page.getByTestId('add-scene')).toHaveCount(0); // 新建场景入口：无
  await expect(page.getByTestId('scene-delete')).toHaveCount(0); // 场景删除入口：无
  // 画布上：无任何选中态手柄 / 工具条（不可变换、不可移除）。
  await expect(page.getByTestId('handle-scale')).toHaveCount(0);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(0);
  await expect(page.getByTestId('placement-toolbar')).toHaveCount(0);
  await expect(page.getByTestId('placement-remove')).toHaveCount(0);
  await expect(page.getByTestId('placement-story')).toHaveCount(0);

  // —— B. 陈列室名不可改：点品牌章不进入编辑（无 rename input），名字不变 ——
  await page.getByTestId('gallery-name').click({ force: true });
  await expect(page.getByTestId('gallery-name-input')).toHaveCount(0);

  // —— C. 场景名不可改：点/双击场景 chip 都不进入编辑（无 rename input）——
  const chip = page.getByTestId('scene-chip').filter({ hasText: '客厅' });
  await chip.click();
  await expect(page.getByTestId('scene-name-input')).toHaveCount(0);
  await chip.dblclick();
  await expect(page.getByTestId('scene-name-input')).toHaveCount(0);

  // —— D. 点物件只弹故事+原图（只读）：故事弹窗为游客态，无输入框/保存钮，只有故事正文 + 原始照片 ——
  await itemLocator(page, userId).locator('.stage__node').click();
  const guestModal = page.getByTestId('story-modal');
  await expect(guestModal).toBeVisible();
  await expect(guestModal).toHaveAttribute('data-mode', 'guest');
  await expect(guestModal.getByTestId('story-input')).toHaveCount(0); // 不可编辑
  await expect(guestModal.getByTestId('story-save')).toHaveCount(0); // 无保存钮
  await expect(guestModal.getByTestId('story-body')).toContainText(STORY); // 只读展示故事
  await expect(guestModal.getByTestId('story-photo')).toBeVisible(); // 展示原图
  await page.getByTestId('story-close').click();
  await expect(guestModal).toHaveCount(0);

  // —— E. 物件不可移动：拖动画布上的物件，placement 坐标分毫不动 ——
  const before = await itemLocator(page, userId).evaluate((el) => ({
    x: el.getAttribute('data-x'),
    y: el.getAttribute('data-y'),
  }));
  await dragBy(page, itemLocator(page, userId).locator('.stage__node'), 60, 40);
  // 拖动可能触发点击弹出只读故事弹窗——先关掉不影响后续断言。
  if (await page.getByTestId('story-modal').count()) {
    await page.getByTestId('story-close').click();
  }
  const after = await itemLocator(page, userId).evaluate((el) => ({
    x: el.getAttribute('data-x'),
    y: el.getAttribute('data-y'),
  }));
  expect(after).toEqual(before); // 没挪动

  // —— F. 收口：LocalStorage 与切游客前的数据基线**完全一致**（一个字节都没改动）——
  const now = await snapshot(page);
  expect(now.galleryName).toBe(base.galleryName);
  expect(now.items).toEqual(base.items);
  expect(now.placements).toEqual(base.placements);

  expect(problems, problems.join('\n')).toEqual([]);
});
