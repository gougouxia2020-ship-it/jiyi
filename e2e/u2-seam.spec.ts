import { test, expect, type Page } from '@playwright/test';

// 念念 · 陈列室 —— U2 criteria[2] 官方 e2e：处理接口是唯一插入点（本轮关键架构保证）。
//
// 逐条覆盖 milestones.json U2 criteria[2]（= success.json 条目7）：
//   把一个反例实现（灰度处理器）注入该接口，不改上下游任何一行代码，上传产出的物件即变为灰度；
//   若必须改动管线上下游 / 存储 / UI 才能生效，即判失败。
//
// 手法：【处理接口】= src/upload/processor.ts 的 defaultProcessor 槽，是「唯一插入点」的运行期实现槽。
//   测试只调 processor.setImageProcessor(灰度) 整层替换该槽——normalize（上游）、测宽高比 / add-item 入库 /
//   persistence 存储 / ItemTray / Canvas（下游/存储/UI）一行不碰——随后驱动完全相同的真实上传 UI，
//   产出的物件即变灰度；复位后同一张源图产出即回彩色。证明产出只由处理接口决定，上下游与它无关。

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
}

async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

/** 灌一张页内合成的强红 JPEG（同一源图两次上传共用），驱动真实 onChange → 真实上传管线 → 预览。 */
async function injectRedFile(page: Page, name: string) {
  await page.evaluate(async (fname) => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const cx = c.getContext('2d')!;
    cx.fillStyle = 'rgb(200,30,30)'; // 强红：彩色态 R≫B；灰度态 R≈G≈B
    cx.fillRect(0, 0, 320, 240);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92));
    const file = new File([blob], fname, { type: 'image/jpeg' });
    const input = document.querySelector('[data-testid="upload-input"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
}

/** 整层替换【处理接口】为灰度反例——只碰 processor.ts 的槽，不碰上下游一行。 */
async function injectGrayscaleProcessor(page: Page) {
  await page.evaluate(async () => {
    const mod = await import('/src/upload/processor.ts');
    const grayscale = async (input: { dataUrl: string; width: number; height: number }) => {
      const bmp = await createImageBitmap(await (await fetch(input.dataUrl)).blob());
      const c = document.createElement('canvas');
      c.width = input.width;
      c.height = input.height;
      const cx = c.getContext('2d')!;
      cx.filter = 'grayscale(1)';
      cx.drawImage(bmp, 0, 0);
      bmp.close();
      return { dataUrl: c.toDataURL('image/jpeg', 0.92), width: input.width, height: input.height };
    };
    mod.setImageProcessor(grayscale);
  });
}

/** 复位【处理接口】为恒等直通（本期生产默认）。 */
async function resetProcessor(page: Page) {
  await page.evaluate(async () => {
    const mod = await import('/src/upload/processor.ts');
    mod.resetImageProcessor();
  });
}

/** 采样某图片元素中心像素（解码其 src）。 */
async function sampleCenter(page: Page, selector: string): Promise<{ r: number; g: number; b: number }> {
  const px = await page.evaluate(async (sel) => {
    const img = document.querySelector(sel) as HTMLImageElement | null;
    const src = img?.getAttribute('src');
    if (!src) return null;
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const cx = c.getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    bmp.close();
    const d = cx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }, selector);
  expect(px, `元素 ${selector} 应有可解码的 src`).not.toBeNull();
  return px!;
}

/** 走一遍真实上传 UI：注入源图 → 预览 → 确认入库；返回新 user 件的 itemId。 */
async function uploadThroughUI(page: Page, fileName: string, itemName: string): Promise<string> {
  const items = page.getByTestId('tray-item');
  const before = await items.count();
  await injectRedFile(page, fileName);
  await expect(page.getByTestId('upload-preview')).toBeVisible();
  await page.getByTestId('upload-preview-name').fill(itemName);
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  await expect(items).toHaveCount(before + 1);
  const id = await items.nth(before).getAttribute('data-item-id');
  expect(id).toBeTruthy();
  return id!;
}

const isColorful = (p: { r: number; b: number }) => p.r > p.b + 40; // 明显偏红 = 彩色
const isGray = (p: { r: number; g: number; b: number }) =>
  Math.abs(p.r - p.g) <= 12 && Math.abs(p.g - p.b) <= 12 && Math.abs(p.r - p.b) <= 12;

// ————————————————————————————————————————————————————————————————
// ① 端到端：注入灰度反例（只碰处理接口）→ 走完全相同的真实上传 UI → 产出物件即灰度；复位即回彩色
// ————————————————————————————————————————————————————————————————
test('① 注入灰度反例（唯一插入点）不改上下游一行 → 上传产出的物件即变灰度', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  // —— 对照：默认（恒等直通），同一张强红源图 → 入库物件是彩色 ——
  const colorId = await uploadThroughUI(page, 'red.jpg', '彩色件');
  const colorThumb = await sampleCenter(
    page,
    `[data-testid="tray-item"][data-item-id="${colorId}"] img.itm`,
  );
  expect(isColorful(colorThumb), `对照件应为彩色，实测 ${JSON.stringify(colorThumb)}`).toBe(true);

  // —— 注入灰度反例：只调 setImageProcessor 整层替换处理接口，normalize/入库/存储/UI 一行不碰 ——
  await injectGrayscaleProcessor(page);

  // —— 同一张强红源图、同一套真实上传 UI → 入库物件变灰度 ——
  const grayId = await uploadThroughUI(page, 'red.jpg', '灰度件');
  const grayThumb = await sampleCenter(
    page,
    `[data-testid="tray-item"][data-item-id="${grayId}"] img.itm`,
  );
  expect(isGray(grayThumb), `灰度件缩略应为灰度，实测 ${JSON.stringify(grayThumb)}`).toBe(true);

  // —— 拖进场景：入场景渲染的图（下游 UI 未改）同样是灰度（产出即物件、贯穿到画布）——
  const canvas = page.getByTestId('canvas');
  const cbox = (await canvas.boundingBox())!;
  const grayThumbLoc = page.locator(`[data-testid="tray-item"][data-item-id="${grayId}"]`);
  await grayThumbLoc.scrollIntoViewIfNeeded();
  const tb = (await grayThumbLoc.boundingBox())!;
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 24, tb.y + tb.height / 2 + 12, { steps: 4 });
  await page.mouse.move(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.5, { steps: 16 });
  await page.mouse.up();
  const node = page.locator(`.stage__item[data-item-id="${grayId}"] .stage__node`);
  await expect(node).toHaveCount(1);
  await expect(node).toHaveJSProperty('complete', true);
  const grayCanvas = await sampleCenter(page, `.stage__item[data-item-id="${grayId}"] .stage__node`);
  expect(isGray(grayCanvas), `入场景的灰度件应为灰度，实测 ${JSON.stringify(grayCanvas)}`).toBe(true);

  // —— 复位处理接口 → 同一张强红源图产出又回彩色（证明灰度只由处理接口决定，非源图/上下游）——
  await resetProcessor(page);
  const colorId2 = await uploadThroughUI(page, 'red.jpg', '复位彩色件');
  const colorThumb2 = await sampleCenter(
    page,
    `[data-testid="tray-item"][data-item-id="${colorId2}"] img.itm`,
  );
  expect(isColorful(colorThumb2), `复位后应回彩色，实测 ${JSON.stringify(colorThumb2)}`).toBe(true);

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ② 管线级证：同一 file、只换 processor（恒等 ↔ 灰度）→ 上游/测宽高比不变、仅产出颜色变
// ————————————————————————————————————————————————————————————————
test('② 同一源图、仅换处理接口：尺寸/宽高比不变（上游未动），仅产出颜色由彩转灰', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);
  await freshApp(page);

  const r = await page.evaluate(async () => {
    // 同一张强红源图。
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const cx = c.getContext('2d')!;
    cx.fillStyle = 'rgb(200,30,30)';
    cx.fillRect(0, 0, 320, 240);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.92));
    const file = new File([blob], 'red.jpg', { type: 'image/jpeg' });

    const { runUploadPipeline } = await import('/src/upload/pipeline.ts');
    const { identityProcessor } = await import('/src/upload/processor.ts');
    const grayscale = async (input: { dataUrl: string; width: number; height: number }) => {
      const bmp = await createImageBitmap(await (await fetch(input.dataUrl)).blob());
      const cc = document.createElement('canvas');
      cc.width = input.width;
      cc.height = input.height;
      const gx = cc.getContext('2d')!;
      gx.filter = 'grayscale(1)';
      gx.drawImage(bmp, 0, 0);
      bmp.close();
      return { dataUrl: cc.toDataURL('image/jpeg', 0.92), width: input.width, height: input.height };
    };

    async function centerOf(dataUrl: string) {
      const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const cc = document.createElement('canvas');
      cc.width = bmp.width;
      cc.height = bmp.height;
      const gx = cc.getContext('2d')!;
      gx.drawImage(bmp, 0, 0);
      bmp.close();
      const d = gx.getImageData(Math.floor(cc.width / 2), Math.floor(cc.height / 2), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    }

    // 同一 file、只换 processor：上游 normalize 与下游测宽高比一行不动。
    const identity = await runUploadPipeline(file, identityProcessor);
    const gray = await runUploadPipeline(file, grayscale);
    return {
      identity: { w: identity.width, h: identity.height, ar: identity.aspectRatio },
      gray: { w: gray.width, h: gray.height, ar: gray.aspectRatio },
      idCenter: await centerOf(identity.imageSrc),
      grayCenter: await centerOf(gray.imageSrc),
    };
  });

  // 上游未动：尺寸与宽高比完全一致（只有处理接口不同）。
  expect(r.gray.w).toBe(r.identity.w);
  expect(r.gray.h).toBe(r.identity.h);
  expect(r.gray.ar).toBeCloseTo(r.identity.ar, 5);

  // 仅产出颜色变：恒等偏红、灰度 R≈G≈B。
  expect(r.idCenter.r).toBeGreaterThan(r.idCenter.b + 40);
  expect(Math.abs(r.grayCenter.r - r.grayCenter.g)).toBeLessThanOrEqual(12);
  expect(Math.abs(r.grayCenter.g - r.grayCenter.b)).toBeLessThanOrEqual(12);

  expect(problems, problems.join('\n')).toEqual([]);
});
