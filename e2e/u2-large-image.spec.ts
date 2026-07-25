import { test, expect, type Page } from '@playwright/test';

// 念念 · 陈列室 —— U2 criteria[1] 官方 e2e：大图与 EXIF。
//
// 逐条覆盖 milestones.json U2 criteria[1]（= success.json 条目5）：
//   传一张 4000×3000 以上、EXIF orientation=6 的竖拍原图，页面不崩溃、标签页不被杀，
//   落库图长边 ≤1600px 且显示方向正确（不躺倒）。
//
// 手法：驱动真实 UI（真 UploadEntry → 真 normalize/管线 → 真预览 → 真 add-item → 真 Canvas）。
//   页内合成一张 4000×3000 相机直出 JPEG，并在 SOI 后插一段 APP1(Exif) 写 Orientation=6，
//   经真实上传管线走全程；断言不崩、长边 ≤1600、方向转正（横存的「顶部」蓝带被转到一侧成竖带）。

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
}

async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

/**
 * 页内合成一张 4000×3000「相机直出」JPEG（红底 + 横存顶部一条蓝带），
 * 在 SOI(FFD8) 后插入 APP1(Exif)、Orientation(0x0112)=6，灌进隐藏 file input 驱动真实 onChange。
 * 竖拍横存：orientation=6 表示显示时须顺时针转 90° → 显示为竖图（h>w），顶部蓝带转到某一侧成竖带。
 */
async function injectExifPortrait(page: Page, name: string) {
  await page.evaluate(async (fname) => {
    const SW = 4000;
    const SH = 3000;
    const canvas = document.createElement('canvas');
    canvas.width = SW;
    canvas.height = SH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(200,30,30)'; // 整幅红
    ctx.fillRect(0, 0, SW, SH);
    ctx.fillStyle = 'rgb(30,60,200)'; // 横存图「顶部」蓝带——orientation 转正后应变成一侧竖带
    ctx.fillRect(0, 0, SW, 360);

    const baseBlob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.92));
    const baseBytes = new Uint8Array(await baseBlob.arrayBuffer());

    // SOI 后插入 APP1(Exif)：IFD0 单条目 Orientation=6（big-endian TIFF）。
    const app1 = new Uint8Array([
      0xff, 0xe1, 0x00, 0x22, // APP1 marker + 段长 34
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF header(MM) + IFD0 offset=8
      0x00, 0x01, // 1 个条目
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation=6
      0x00, 0x00, 0x00, 0x00, // 下一个 IFD offset=0
    ]);
    const withExif = new Uint8Array(baseBytes.length + app1.length);
    withExif.set(baseBytes.subarray(0, 2), 0); // FFD8
    withExif.set(app1, 2);
    withExif.set(baseBytes.subarray(2), 2 + app1.length);
    const file = new File([withExif], fname, { type: 'image/jpeg' });

    const input = document.querySelector('[data-testid="upload-input"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);
}

/** 采样某图片元素中心与左右两侧的像素（解码其 src 后逐点取色）。 */
async function sampleNode(page: Page, selector: string) {
  return page.evaluate(async (sel) => {
    const img = document.querySelector(sel) as HTMLImageElement | null;
    if (!img) return null;
    const src = img.getAttribute('src');
    if (!src) return null;
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const cx = c.getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    bmp.close();
    const px = (x: number, y: number) => {
      const d = cx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    };
    const w = c.width;
    const h = c.height;
    return {
      w,
      h,
      center: px(Math.floor(w / 2), Math.floor(h / 2)),
      left: px(6, Math.floor(h / 2)),
      right: px(w - 6, Math.floor(h / 2)),
    };
  }, selector);
}

test('大图 4000×3000 + EXIF orientation=6：不崩、长边 ≤1600、方向转正（不躺倒）', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  // —— 传 48MP 竖拍原图，走真实上传管线 → 预览 ——
  await injectExifPortrait(page, 'phone-portrait.jpg');
  await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });

  // 页面没崩、标签页还活着：预览已渲染，且能继续对页面求值（realm 未被杀）。
  expect(await page.evaluate(() => 1 + 1)).toBe(2);
  expect(problems, problems.join('\n')).toEqual([]);

  // 预览图落库尺寸：长边 ≤1600、且为竖图（h>w，不躺倒）。读预览 <img> 的解码 natural 尺寸。
  const previewImg = page.getByTestId('upload-preview-img');
  const dims = await previewImg.evaluate((el) => {
    const img = el as HTMLImageElement;
    return { w: img.naturalWidth, h: img.naturalHeight };
  });
  expect(Math.max(dims.w, dims.h)).toBeLessThanOrEqual(1600);
  expect(dims.h).toBeGreaterThan(dims.w); // 竖图：显示方向已转正（不躺倒）
  // 精确落点：4000×3000 长边压到 1600 → 1600×1200，转正后 1200×1600。
  expect(dims.w).toBe(1200);
  expect(dims.h).toBe(1600);

  // meta 行也报出落库尺寸与宽高比（<1 为竖）。
  await expect(page.getByTestId('upload-preview-meta')).toContainText('1200×1600');

  // —— 确认入库 → 出现在 dock；对落库图采样验方向确实转了 90° ——
  await page.getByTestId('upload-preview-name').fill('外公的旧照');
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  const items = page.getByTestId('tray-item');
  await expect(items).toHaveCount(15);
  const userItemId = await items.nth(14).getAttribute('data-item-id');
  expect(userItemId).toBeTruthy();

  // 落库图长边 ≤1600（对 dock 缩略卡的真实图解码核对）。
  const sample = await sampleNode(
    page,
    `[data-testid="tray-item"][data-item-id="${userItemId}"] img.itm`,
  );
  expect(sample, 'dock 缩略卡应有可解码的图').not.toBeNull();
  expect(Math.max(sample!.w, sample!.h)).toBeLessThanOrEqual(1600);
  expect(sample!.h).toBeGreaterThan(sample!.w); // 竖图不躺倒

  // 方向确实转了 90°：横存图「顶部」蓝带被转到某一侧成竖带（恰一侧蓝、另一侧红、中心红）。
  const isBlue = (p: { r: number; b: number }) => p.b > p.r + 30;
  const isRed = (p: { r: number; b: number }) => p.r > p.b + 30;
  expect(isBlue(sample!.left)).not.toBe(isBlue(sample!.right)); // 恰一侧蓝
  expect(isRed(sample!.center)).toBe(true); // 中心仍是红底

  // 落盘校验：user 件宽高比 <1（竖），图走引用（imageRef，不含内联二进制）。
  const u = await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null');
    return (s?.items ?? []).find((i: { source?: string }) => i.source === 'user');
  }, STORAGE_KEY);
  expect(u.aspectRatio).toBeLessThan(1);
  expect(typeof u.imageRef).toBe('string');

  expect(problems, problems.join('\n')).toEqual([]);
});
