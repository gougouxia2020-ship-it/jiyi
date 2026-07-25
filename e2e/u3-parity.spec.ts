import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— U3 里程碑官方 e2e 之一：用户物件平权与删除管理。
// 验收命令：npx playwright test e2e/u3-parity.spec.ts --reporter=line（expect_exit 0）。
//
// 逐条覆盖 milestones.json U3 criteria[0]（平权与管理）这一条：
//   ① 删除入口只挂用户件：内置 14 件无删除入口；上传一件 user 件才出现一个删除入口。
//   ② 用户件平权：对同一件上传物件施加内置件的全部操作（拖入/挪位/角手柄缩放/旋转钮旋转/写故事/
//      重命名/跨场景摆放且故事同步）均可用且行为一致。
//   ③ 删除干净不留尸：把同一件上传物件摆进两个场景后删除它 → 两场景摆放一并消失、dock 里物件消失、
//      IndexedDB 里对应图片二进制被清除、刷新后不复活（物件与摆放都不回来）。
//
// 手法：全程驱动真实 UI（真 UploadEntry → 真上传管线 → 真预览 → 真 dispatch → 真 Canvas 拖放/变换/故事 →
//   真删除入口 + 就地确认）。注入文件只在隐藏 file input 上灌一张页内合成图，零测试钩子进生产码。

const STORAGE_KEY = 'memories.gallery';
const IMAGE_DB = 'memories.images';
const IMAGE_STORE = 'images';
const VP = { width: 1280, height: 800 };

/** 全程不得有未捕获错误 / 未处理 Promise 拒绝 / console.error。 */
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

/** 在隐藏 file input 上灌一张页内合成的纯色 JPEG，驱动真实 onChange → 上传管线 → 预览。 */
async function injectFile(page: Page, name: string, w = 320, h = 240, rgb = '120,170,90') {
  await page.evaluate(
    async ({ fname, cw, ch, color }) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const cx = c.getContext('2d')!;
      cx.fillStyle = `rgb(${color})`;
      cx.fillRect(0, 0, cw, ch);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
      const file = new File([blob], fname, { type: 'image/jpeg' });
      const input = document.querySelector('[data-testid="upload-input"]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { fname: name, cw: w, ch: h, color: rgb },
  );
}

/** 走完上传闭环：选图 → 预览 → 改名 → 确认入库；返回新 user 件的 itemId（dock 末位缩略卡）。 */
async function uploadUserItem(page: Page, name: string): Promise<string> {
  await ensureDockOpen(page);
  const items = page.getByTestId('tray-item');
  const before = await items.count();
  await injectFile(page, `${name}.jpg`, 320, 240, '110,150,80');
  await expect(page.getByTestId('upload-preview')).toBeVisible();
  await page.getByTestId('upload-preview-name').fill(name);
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  await expect(items).toHaveCount(before + 1);
  const userThumb = items.nth(before); // 新件排在内置 14 件之后
  const id = await userThumb.getAttribute('data-item-id');
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

/** 真实拖拽：从缩略卡（locator）中心拖到视口坐标 (dropX, dropY)。 */
async function dragFromTo(page: Page, src: Locator, dropX: number, dropY: number) {
  await src.scrollIntoViewIfNeeded();
  const b = await boxOf(src);
  const sx = b.x + b.width / 2;
  const sy = b.y + b.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 24, sy + 12, { steps: 4 }); // 越过拖拽阈值
  await page.mouse.move(dropX, dropY, { steps: 16 });
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

/** 直查 IndexedDB：某图片引用键在 memories.images 里的记录数（0 = 已清除 / 从未存在）。 */
async function idbCount(page: Page, ref: string): Promise<number> {
  return page.evaluate(
    ({ db, store, key }) =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open(db, 1);
        req.onsuccess = () => {
          const conn = req.result;
          if (!conn.objectStoreNames.contains(store)) {
            conn.close();
            resolve(0);
            return;
          }
          const tx = conn.transaction(store, 'readonly');
          const cnt = tx.objectStore(store).count(key);
          cnt.onsuccess = () => {
            resolve(cnt.result);
            conn.close();
          };
          cnt.onerror = () => {
            resolve(-1);
            conn.close();
          };
        };
        req.onerror = () => resolve(-2);
      }),
    { db: IMAGE_DB, store: IMAGE_STORE, key: ref },
  );
}

/** 读落盘状态树（用于删除后核对 items / placements 里都不再有该 itemId）。 */
async function readStore(page: Page): Promise<{ items: { id: string; source?: string }[]; placements: { itemId: string }[] }> {
  return page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null');
    return { items: s?.items ?? [], placements: s?.placements ?? [] };
  }, STORAGE_KEY);
}

// ————————————————————————————————————————————————————————————————
// ① 删除入口只挂用户件：内置 14 件无删除入口；上传一件才出现一个删除入口
// ————————————————————————————————————————————————————————————————
test('① 删除入口分流：内置 14 件无删除入口，上传一件 user 件才出现删除入口', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  // 初始 14 件内置物件，零删除入口（内置件恒不可删）。
  await expect(page.getByTestId('tray-item')).toHaveCount(14);
  await expect(page.getByTestId('item-delete')).toHaveCount(0);

  // 上传一件 → dock 15 件、恰一个删除入口，且它落在 user 件缩略卡内部。
  const userId = await uploadUserItem(page, '外婆的信');
  await expect(page.getByTestId('tray-item')).toHaveCount(15);
  await expect(page.getByTestId('item-delete')).toHaveCount(1);
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${userId}"] [data-testid="item-delete"]`),
  ).toHaveCount(1);

  // 再上传一件 → 两个删除入口；内置件仍一个也没有。
  const userId2 = await uploadUserItem(page, '爷爷的怀表');
  await expect(page.getByTestId('item-delete')).toHaveCount(2);
  // 逐一核对：14 件内置缩略卡内部都没有删除入口。
  const builtinDeletes = await page.evaluate(() => {
    const thumbs = Array.from(document.querySelectorAll('[data-testid="tray-item"]'));
    return thumbs
      .filter((t) => {
        const id = t.getAttribute('data-item-id') ?? '';
        // 内置件 id 形如 bedroom-*/living-*；user 件 id 形如 item-...
        return !id.startsWith('item-');
      })
      .filter((t) => t.querySelector('[data-testid="item-delete"]') !== null).length;
  });
  expect(builtinDeletes).toBe(0);
  expect(userId2).not.toBe(userId);

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ② 用户件平权：拖入 / 挪位 / 缩放 / 旋转 / 写故事 / 重命名 / 跨场景故事同步——内置件能做的它都能做
// ————————————————————————————————————————————————————————————————
test('② 用户件平权：拖入 → 挪位 → 缩放 → 旋转 → 写故事 → 重命名 → 跨场景故事同步，行为一致', async ({
  page,
}) => {
  const problems = watchErrors(page);
  const STORY = '这封信外婆写了三页，落款是 1979 年冬。';
  const NEWNAME = '外婆的家书';
  await page.setViewportSize(VP);
  await freshApp(page);

  // 先建两个场景（活动场景=书房），再上传一件 user 件。
  await createScene(page, '客厅');
  await createScene(page, '书房');
  const userId = await uploadUserItem(page, '外婆的信');

  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);
  const userThumb = page.locator(`[data-testid="tray-item"][data-item-id="${userId}"]`);

  // —— 拖入（书房）——
  await dragFromTo(page, userThumb, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.44);
  const placement = itemLocator(page, userId);
  await expect(placement).toHaveCount(1);
  const dropped = await readPl(placement);
  // 落位只经 transform（不重排）——与内置件一致。
  const plStyle = (await placement.getAttribute('style')) ?? '';
  expect(plStyle).toContain('translate(');
  expect(plStyle).not.toContain('left');

  // —— 挪位：只改 x/y ——
  const node = placement.locator('.stage__node');
  await dragBy(page, node, 44, 32);
  const afterMove = await readPl(placement);
  expect(afterMove.x).not.toBe(dropped.x);
  expect(afterMove.y).not.toBe(dropped.y);
  expect(afterMove.w).toBe(dropped.w);
  expect(afterMove.rotation).toBe(dropped.rotation);

  // 选中态手柄出现（缩放 ×4 + 旋转 ×1）——与内置件一致。
  await expect(page.getByTestId('handle-scale')).toHaveCount(4);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(1);

  // —— 角手柄缩放：只改 w ——
  await dragBy(page, page.locator('[data-testid="handle-scale"][data-corner="br"]'), 46, 38);
  const afterScale = await readPl(placement);
  expect(afterScale.w).toBeGreaterThan(afterMove.w);
  expect(afterScale.x).toBe(afterMove.x);
  expect(afterScale.y).toBe(afterMove.y);

  // —— 旋转钮旋转：只改 rotation ——
  await dragBy(page, page.getByTestId('handle-rotate'), 64, 20);
  const afterRotate = await readPl(placement);
  expect(afterRotate.rotation).not.toBe(afterScale.rotation);
  expect(afterRotate.w).toBe(afterScale.w);

  // —— 写故事：选中 → 故事手柄 → 写 → 保存 ——
  await node.click();
  await placement.locator('[data-testid="placement-story"]').click();
  const modal = page.getByTestId('story-modal');
  await expect(modal).toBeVisible();
  await modal.getByTestId('story-input').fill(STORY);
  await modal.getByTestId('story-save').click();
  await expect(modal).toHaveCount(0);

  // —— 重命名（dock 就地改名）——
  const nameSpan = page.locator(
    `[data-testid="tray-item"][data-item-id="${userId}"] [data-testid="item-name"]`,
  );
  await nameSpan.click();
  const nameInput = page.getByTestId('item-name-input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill(NEWNAME);
  await nameInput.press('Enter');
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${userId}"] [data-testid="item-name"]`),
  ).toHaveText(NEWNAME);

  // —— 跨场景摆放 + 故事同步：切「客厅」再摆同一件，故事与新名都同步过来 ——
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  await expect(itemLocator(page, userId)).toHaveCount(0); // 客厅里还没摆
  await dragFromTo(page, userThumb, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.5);
  const plLiving = itemLocator(page, userId);
  await expect(plLiving).toHaveCount(1);
  await plLiving.locator('.stage__node').click();
  await plLiving.locator('[data-testid="placement-story"]').click();
  const modal2 = page.getByTestId('story-modal');
  await expect(modal2).toBeVisible();
  await expect(modal2.getByTestId('story-input')).toHaveValue(STORY); // 故事跨场景同步
  await expect(modal2.locator('.story__name')).toHaveText(NEWNAME); // 新名跨场景同步
  await page.getByTestId('story-close').click();

  // —— 刷新：物件 / 两场景摆放 / 故事 / 新名 全在（平权链路的持久化闭环）——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.locator(`[data-testid="tray-item"][data-item-id="${userId}"]`)).toHaveCount(1);
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${userId}"] [data-testid="item-name"]`),
  ).toHaveText(NEWNAME);

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ③ 删除干净不留尸：两场景摆放一并消失 + dock 消失 + IndexedDB 图片清除 + 刷新不复活
// ————————————————————————————————————————————————————————————————
test('③ 删除干净不留尸：两场景摆放消失 + IndexedDB 图片清除 + 刷新不复活', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);
  await freshApp(page);

  // 上传一件，摆进两个场景（客厅 + 书房）。
  await createScene(page, '客厅');
  const userId = await uploadUserItem(page, '要删掉的信');
  const ref = `img-${userId}`;
  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);
  const userThumb = page.locator(`[data-testid="tray-item"][data-item-id="${userId}"]`);

  // 客厅摆一件。
  await dragFromTo(page, userThumb, cbox.x + cbox.width * 0.4, cbox.y + cbox.height * 0.45);
  await expect(itemLocator(page, userId)).toHaveCount(1);

  // 书房摆一件（同一件物件）。
  await createScene(page, '书房');
  await ensureDockOpen(page);
  await dragFromTo(page, userThumb, cbox.x + cbox.width * 0.6, cbox.y + cbox.height * 0.55);
  await expect(itemLocator(page, userId)).toHaveCount(1);

  // 落盘已含两条该物件的摆放 + 图片已进 IndexedDB（saveState 异步，poll 等稳）。
  await expect
    .poll(async () => (await readStore(page)).placements.filter((p) => p.itemId === userId).length)
    .toBe(2);
  await expect.poll(async () => idbCount(page, ref)).toBe(1);

  // —— 删除：dock 缩略卡右上角垃圾桶 → 一句话确认 → 删除 ——
  // 先取消一次（确认可撤销、不误删）。
  await userThumb.getByTestId('item-delete').click();
  await expect(page.getByTestId('item-delete-confirm-box')).toBeVisible();
  await expect(page.getByTestId('item-delete-confirm-box')).toContainText('删除');
  await page.getByTestId('item-delete-cancel').click();
  await expect(page.getByTestId('item-delete-confirm-box')).toHaveCount(0);
  await expect(page.locator(`[data-testid="tray-item"][data-item-id="${userId}"]`)).toHaveCount(1);

  // 再删一次并确认。
  await userThumb.getByTestId('item-delete').click();
  await page.getByTestId('item-delete-confirm').click();

  // dock 里物件消失（回到 14 件、该 user 件不在、零删除入口）。
  await expect(page.getByTestId('tray-item')).toHaveCount(14);
  await expect(page.locator(`[data-testid="tray-item"][data-item-id="${userId}"]`)).toHaveCount(0);
  await expect(page.getByTestId('item-delete')).toHaveCount(0);

  // 当前场景（书房）摆放一并消失。
  await expect(itemLocator(page, userId)).toHaveCount(0);
  // 切到客厅：那边的摆放也一并消失（跨场景残影为零）。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  await expect(page.getByTestId('scene-chip').filter({ hasText: '客厅' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(itemLocator(page, userId)).toHaveCount(0);

  // 落盘里 items / placements 都不再有该 itemId；IndexedDB 图片记录被清除。
  await expect
    .poll(async () => {
      const s = await readStore(page);
      const itemGone = !s.items.some((i) => i.id === userId);
      const plGone = s.placements.filter((p) => p.itemId === userId).length === 0;
      return itemGone && plGone;
    })
    .toBe(true);
  await expect.poll(async () => idbCount(page, ref)).toBe(0);

  // —— 刷新：不复活（物件不在 dock、两场景都无摆放、IndexedDB 仍无该图）——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('tray-item')).toHaveCount(14);
  await expect(page.locator(`[data-testid="tray-item"][data-item-id="${userId}"]`)).toHaveCount(0);
  await expect(itemLocator(page, userId)).toHaveCount(0); // 当前场景无摆放
  await page.getByTestId('scene-chip').filter({ hasText: '书房' }).click();
  await expect(itemLocator(page, userId)).toHaveCount(0); // 另一场景也无摆放
  expect(await idbCount(page, ref)).toBe(0);

  expect(problems, problems.join('\n')).toEqual([]);
});
