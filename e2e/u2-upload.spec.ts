import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— U2 criteria[0] 官方 e2e：上传闭环 + 全链路持久化。
//
// 逐条覆盖 milestones.json U2 criteria[0]（= success.json 条目1）：
//   dock 选图 → 看到预览 → 确认入库 → 物件出现在 dock → 拖进场景 → 写故事 → 刷新后物件/摆放/故事全在；
//   预览里取消则不入库、dock 无残留。
//
// 手法：全程驱动真实 UI（真 UploadEntry → 真上传管线 → 真预览 → 真 dispatch add-item → 真 Canvas 拖放/故事）。
//   注入文件只在隐藏 file input 上灌一张页内合成图，触发真实 onChange，零测试钩子进生产码。

const STORAGE_KEY = 'memories.gallery';
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
  await page.mouse.move(sx + 22, sy + 12, { steps: 4 }); // 越过拖拽阈值
  await page.mouse.move(dropX, dropY, { steps: 16 });
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

/** 读落盘里某 source==='user' 物件（无则 undefined）。 */
async function readUserItem(page: Page): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null');
    return (s?.items ?? []).find((i: { source?: string }) => i.source === 'user');
  }, STORAGE_KEY);
}

// ————————————————————————————————————————————————————————————————
// ① 取消路径：预览弹出 → 取消 → 不入库、dock 无残留、落盘无 user 件
// ————————————————————————————————————————————————————————————————
test('① 预览里取消 → 不入库、dock 无残留', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);
  await freshApp(page);
  await ensureDockOpen(page);

  await expect(page.getByTestId('upload-add')).toBeVisible();
  const items = page.getByTestId('tray-item');
  await expect(items).toHaveCount(14);

  await injectFile(page, 'cancel-me.jpg');
  await expect(page.getByTestId('upload-preview')).toBeVisible();

  await page.getByTestId('upload-cancel').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  await expect(items).toHaveCount(14); // 无新增
  expect(await readUserItem(page)).toBeUndefined(); // 落盘也无 user 件

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ② 上传闭环全链路：选图→预览→确认入库→出现在 dock→拖进场景→写故事→刷新后物件/摆放/故事全在
// ————————————————————————————————————————————————————————————————
test('② 上传闭环：确认入库 → 拖进场景 → 写故事 → 刷新后物件/摆放/故事全在', async ({ page }) => {
  const problems = watchErrors(page);
  const STORY = '外婆 1980 年从上海寄来的信，字迹已经淡了。';
  await page.setViewportSize(VP);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  const items = page.getByTestId('tray-item');
  await expect(items).toHaveCount(14);

  // —— 选图 → 预览 —— （宽>高的绿图，便于刷新后按宽高比核对）
  await injectFile(page, 'grandma-letter.jpg', 320, 240, '110,150,80');
  await expect(page.getByTestId('upload-preview')).toBeVisible();
  await expect(page.getByTestId('upload-preview-img')).toBeVisible();

  // —— 改名 → 确认入库 → 出现在 dock ——
  await page.getByTestId('upload-preview-name').fill('外婆的信');
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  await expect(items).toHaveCount(15);

  // 新入库的 user 件是 dock 末位缩略卡；拿到它的 itemId 全程锚定。
  const userThumb = items.nth(14);
  const userItemId = await userThumb.getAttribute('data-item-id');
  expect(userItemId).toBeTruthy();
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${userItemId}"] [data-testid="item-name"]`),
  ).toHaveText('外婆的信');

  // —— 拖进场景：与内置 14 件走同一条 place-item 链路 ——
  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);
  await dragFromTo(page, userThumb, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.44);

  const placement = page.locator(`.stage__item[data-item-id="${userItemId}"]`);
  await expect(placement).toHaveCount(1);
  await expect(page.getByTestId('placement')).toHaveCount(1);
  // 用户件确实渲染出图（不是空占位）：canvas 节点带真实 src。
  const nodeImg = placement.locator('.stage__node');
  await expect(nodeImg).toHaveJSProperty('complete', true);
  expect(await nodeImg.getAttribute('src')).toBeTruthy();
  const plBefore = await readPl(placement);

  // —— 写故事：选中 → 故事手柄 → 写 → 保存 ——
  await nodeImg.click();
  await placement.locator('[data-testid="placement-story"]').click();
  const modal = page.getByTestId('story-modal');
  await expect(modal).toBeVisible();
  await modal.getByTestId('story-input').fill(STORY);
  await modal.getByTestId('story-save').click();
  await expect(modal).toHaveCount(0);

  // 等最终状态落盘完成（saveState 异步：要把图片二进制搬进 IndexedDB）：user 件故事 + 摆放均已写入。
  await expect
    .poll(async () =>
      page.evaluate(
        ({ k, id }) => {
          const s = JSON.parse(localStorage.getItem(k) || 'null');
          const it = (s?.items ?? []).find((i: { id: string }) => i.id === id);
          const plCount = (s?.placements ?? []).filter((p: { itemId: string }) => p.itemId === id).length;
          return { story: it?.story ?? null, imageRef: it?.imageRef ?? null, plCount };
        },
        { k: STORAGE_KEY, id: userItemId },
      ),
    )
    .toEqual({ story: STORY, imageRef: expect.stringContaining('img-'), plCount: 1 });

  // —— 刷新：物件 / 摆放 / 故事 全在 ——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();

  // 物件全在：dock 仍 15 件、user 件在。
  await expect(page.getByTestId('tray-item')).toHaveCount(15);
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${userItemId}"]`),
  ).toHaveCount(1);

  // 摆放全在：placement 逐字段还原。
  const plAfter = page.locator(`.stage__item[data-item-id="${userItemId}"]`);
  await expect(plAfter).toHaveCount(1);
  expect(await readPl(plAfter)).toEqual(plBefore);

  // 图片全在（刷新后经 IndexedDB hydrate 回填）：dock 缩略 + canvas 节点都拿回真实图（object URL）。
  const restoredThumb = page.locator(
    `[data-testid="tray-item"][data-item-id="${userItemId}"] img.itm`,
  );
  await expect
    .poll(async () => (await restoredThumb.getAttribute('src')) ?? '')
    .toContain('blob:');
  const restoredNode = plAfter.locator('.stage__node');
  await expect.poll(async () => (await restoredNode.getAttribute('src')) ?? '').toContain('blob:');
  await expect(restoredNode).toHaveJSProperty('complete', true);
  expect(
    await restoredNode.evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);

  // 故事全在：点开故事弹窗读回文本；原始照片也已 hydrate。
  await restoredNode.click();
  await plAfter.locator('[data-testid="placement-story"]').click();
  const modal2 = page.getByTestId('story-modal');
  await expect(modal2).toBeVisible();
  await expect(modal2.getByTestId('story-input')).toHaveValue(STORY);
  const photo = modal2.getByTestId('story-photo');
  expect(await photo.getAttribute('src')).toContain('blob:');

  expect(problems, problems.join('\n')).toEqual([]);
});
