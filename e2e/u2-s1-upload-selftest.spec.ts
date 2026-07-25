import { test, expect, type Page } from '@playwright/test';

// 念念 · 陈列室 —— U2-S1 建造员自证（非里程碑官方 e2e；官方三份 u2-*.spec 留给 U2-S2）。
//
// 逐条自证 U2-S1.json 的验收硬指标：
//  A. 超大竖拍 EXIF 图（4000×3000、orientation=6）走上传管线：页面不崩、落库图长边 ≤1600px、方向不躺倒。
//  B. 注入反例（灰度处理器）不改上下游任何一行代码即可让产出变灰度——只给 runUploadPipeline 传第二参。
//  C. 处理接口留在正确位置：同一 file、只换 processor（identity ↔ 灰度）即改变产出，normalize/测宽高比/入库一行不动。
//  D. dock 出现上传入口；预览取消 → 不入库、dock 无残留；预览确认 → 落成一件 source:'user' 的 Item 出现在 dock。
//
// 手法：Test A/B/C 直接在页面里 dynamic import 真实管线模块（Vite dev 现转 TS），零测试钩子进生产码；
//       Test D 驱动真实 UI（真 UploadEntry → 真管线 → 真预览 → 真 dispatch add-item）。

const STORAGE_KEY = 'memories.gallery';

// 在页面上下文里跑管线自证（EXIF 方向 + 降采样 + 灰度反例注入）。返回给测试断言的纯数据。
async function runPipelineProbe(page: Page) {
  return page.evaluate(async () => {
    // —— 造一张 4000×3000 的「相机直出」JPEG，写 EXIF orientation=6（竖拍横存，显示应转正为竖图）——
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

    // 在 SOI(FFD8) 后插入一段 APP1(Exif)，Orientation(0x0112)=6（big-endian TIFF）。
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
    const file = new File([withExif], 'portrait.jpg', { type: 'image/jpeg' });

    // 采样某 data:URL 的一个像素。
    async function sample(dataUrl: string, x: number, y: number) {
      const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const cx = c.getContext('2d')!;
      cx.drawImage(bmp, 0, 0);
      bmp.close();
      const d = cx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    }

    // 真实管线模块（Vite dev 现转），零改动直接用。
    const { runUploadPipeline } = await import('/src/upload/pipeline.ts');
    const { identityProcessor } = await import('/src/upload/processor.ts');

    // 反例处理器：灰度。仅作第二参注入——normalize / 测宽高比 / 入库上下游一行不动。
    const grayscaleProcessor = async (input: { dataUrl: string; width: number; height: number }) => {
      const bmp = await createImageBitmap(await (await fetch(input.dataUrl)).blob());
      const c = document.createElement('canvas');
      c.width = input.width;
      c.height = input.height;
      const cx = c.getContext('2d')!;
      cx.filter = 'grayscale(1)';
      cx.drawImage(bmp, 0, 0);
      bmp.close();
      return { dataUrl: c.toDataURL('image/jpeg', 0.9), width: input.width, height: input.height };
    };

    // 同一 file、只换 processor：产线默认(identity) vs 注入反例(灰度)。
    const identity = await runUploadPipeline(file, identityProcessor);
    const gray = await runUploadPipeline(file, grayscaleProcessor);
    const dfault = await runUploadPipeline(file); // 不传 → 走 defaultProcessor（恒等）

    const w = identity.width;
    const h = identity.height;
    const idCenter = await sample(identity.imageSrc, Math.round(w / 2), Math.round(h / 2));
    const idLeft = await sample(identity.imageSrc, 20, Math.round(h / 2));
    const idRight = await sample(identity.imageSrc, w - 20, Math.round(h / 2));
    const grayCenter = await sample(gray.imageSrc, Math.round(w / 2), Math.round(h / 2));

    return {
      identity: { w, h, aspectRatio: identity.aspectRatio },
      dfault: { w: dfault.width, h: dfault.height },
      idCenter,
      idLeft,
      idRight,
      grayCenter,
    };
  });
}

test.describe('U2-S1 · 上传管线主链路自证', () => {
  test('A/B/C · EXIF 方向校正 + 长边降采样 ≤1600 + 灰度反例注入（处理接口在正确位置）', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');

    const r = await runPipelineProbe(page);

    // 页面没崩（无未捕获错误）。
    expect(errors, errors.join('\n')).toEqual([]);

    // 降采样：长边 ≤ 1600。
    expect(Math.max(r.identity.w, r.identity.h)).toBeLessThanOrEqual(1600);

    // 方向不躺倒：4000×3000 横存 + orientation=6 → 转正为竖图（h>w），实测约 1200×1600、宽高比<1。
    expect(r.identity.h).toBeGreaterThan(r.identity.w);
    expect(r.identity.aspectRatio).toBeLessThan(1);
    expect(r.identity.w).toBe(1200);
    expect(r.identity.h).toBe(1600);

    // 方向确实转了 90°：横存图「顶部」蓝带被转到某一侧成竖带（恰有一侧蓝、另一侧红、中心红）。
    const isBlue = (p: { r: number; b: number }) => p.b > p.r + 30;
    const isRed = (p: { r: number; b: number }) => p.r > p.b + 30;
    expect(isBlue(r.idLeft)).not.toBe(isBlue(r.idRight)); // 恰一侧蓝
    expect(isRed(r.idCenter)).toBe(true);

    // 恒等直通：产出仍是彩色（中心明显偏红，R 远大于 G/B）。
    expect(r.idCenter.r).toBeGreaterThan(r.idCenter.g + 40);

    // 灰度反例：同一 file、只换 processor，中心像素 R≈G≈B（变灰）——上下游一行未改。
    expect(Math.abs(r.grayCenter.r - r.grayCenter.g)).toBeLessThanOrEqual(6);
    expect(Math.abs(r.grayCenter.g - r.grayCenter.b)).toBeLessThanOrEqual(6);

    // 默认处理器（不传第二参）与显式恒等同产出尺寸——证明生产链默认走恒等直通。
    expect(r.dfault.w).toBe(r.identity.w);
    expect(r.dfault.h).toBe(r.identity.h);
  });

  test('D · dock 有上传入口；预览取消不入库、无残留；预览确认落成 source:user 的 Item 出现在 dock', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // dock 出现上传入口。
    await expect(page.getByTestId('upload-add')).toBeVisible();

    // 初始 14 件内置物件。
    const items = page.getByTestId('tray-item');
    await expect(items).toHaveCount(14);

    // 在隐藏 file input 上注入一张小图，驱动真实 onChange → 管线 → 预览。
    async function injectFile(name: string) {
      await page.evaluate(async (fname) => {
        const c = document.createElement('canvas');
        c.width = 240;
        c.height = 180;
        const cx = c.getContext('2d')!;
        cx.fillStyle = 'rgb(120,170,90)';
        cx.fillRect(0, 0, 240, 180);
        const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
        const file = new File([blob], fname, { type: 'image/jpeg' });
        const input = document.querySelector('[data-testid="upload-input"]') as HTMLInputElement;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, name);
    }

    // —— 取消路径：预览弹出 → 点取消 → 不入库、dock 无残留 ——
    await injectFile('cancel-me.jpg');
    await expect(page.getByTestId('upload-preview')).toBeVisible();
    await page.getByTestId('upload-cancel').click();
    await expect(page.getByTestId('upload-preview')).toHaveCount(0);
    await expect(items).toHaveCount(14); // 无新增
    const afterCancel = await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      return (s?.items ?? []).filter((i: { source?: string }) => i.source === 'user').length;
    }, STORAGE_KEY);
    expect(afterCancel).toBe(0); // 落盘里也没有 user 件

    // —— 确认路径：预览弹出 → 改名 → 加入陈列 → 落成 source:'user' 的 Item 出现在 dock ——
    await injectFile('grandpa-watch.jpg');
    await expect(page.getByTestId('upload-preview')).toBeVisible();
    // 预览名默认取自文件名。
    await expect(page.getByTestId('upload-preview-name')).toHaveValue('grandpa-watch');
    await page.getByTestId('upload-preview-name').fill('爷爷的怀表');
    await page.getByTestId('upload-confirm').click();
    await expect(page.getByTestId('upload-preview')).toHaveCount(0);
    await expect(items).toHaveCount(15); // dock 多了一件

    // 落盘校验：saveState 异步（要写 IndexedDB），poll 等 user 件落盘。
    await expect
      .poll(async () =>
        page.evaluate((k) => {
          const s = JSON.parse(localStorage.getItem(k) || 'null');
          return (s?.items ?? []).filter((i: { source?: string }) => i.source === 'user').length;
        }, STORAGE_KEY),
      )
      .toBe(1);
    // 取该 user 件做字段细断言：name/source/aspectRatio 已填，图走引用（imageRef，不含内联二进制）。
    const u = await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      return (s?.items ?? []).find((i: { source?: string }) => i.source === 'user');
    }, STORAGE_KEY);
    expect(u.name).toBe('爷爷的怀表');
    expect(u.source).toBe('user');
    expect(typeof u.imageRef).toBe('string');
    expect(u.imageRef.length).toBeGreaterThan(0);
    // 240×180 → 未超 1600 不降采样，宽高比 ≈ 1.333。
    expect(u.aspectRatio).toBeGreaterThan(1.2);
    expect(u.aspectRatio).toBeLessThan(1.45);
  });
});
