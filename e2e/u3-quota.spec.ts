import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— U3 里程碑官方 e2e 之二：上传配额（50 件上限 · 到顶前置阻止）。
//
// 验收硬指标（milestones.json U3 criteria[1] / success.json「上传配额是 50 件且到顶提前告知」）：
//   · dock 显示「已传 N/50」并随每次上传/删除实时更新数字；
//   · 传到第 50 件后，上传入口在用户点开选图流程**之前**就前置阻止并给出说明
//     （而非让用户选完图、走完预览才被告知传不进去）；
//   · 传到第 51 件仍能成功、或 dock 不显示已用数量、或传满后仍让用户走完选图流程才失败——即判失败。
//
// 手法：全程驱动真实 UI（真 UploadEntry → 真上传管线 → 真预览 → 真 dispatch）。为避免走 50 遍真实上传，
//   配额到顶用例把 49 件用户物件直接种进 LocalStorage（source:'user'，无内联图故不碰 IndexedDB），
//   再走**一次真实上传**触到第 50 件、观察入口切到前置阻止态——既省时又如实覆盖「到顶」这一刻。

const STORAGE_KEY = 'memories.gallery';
const SCHEMA_VERSION = 4;
const MAX = 50;
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

/** 直接种入 N 件用户物件（source:'user'，空图位——不含内联二进制，故 saveState 不碰 IndexedDB、
 *  hydrate 也不会去查图），reconcile 会自动在其前补齐 14 件内置物件。用于免去成批真实上传。 */
async function seedUserItems(page: Page, n: number) {
  await page.goto('/');
  await page.evaluate(
    ({ key, ver, count }) => {
      const items = [];
      for (let i = 0; i < count; i++) {
        items.push({
          id: `item-seed-${i}`,
          name: `旧物${i}`,
          source: 'user',
          aspectRatio: 1,
          originalImageSrc: '',
          displayImageSrc: '',
          imageSrc: '',
          story: '',
        });
      }
      const state = {
        schemaVersion: ver,
        galleryName: '念念 · 陈列室',
        scenes: [],
        items,
        placements: [],
        activeSceneId: null,
        mode: 'edit',
      };
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, ver: SCHEMA_VERSION, count: n },
  );
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

/** 在隐藏 file input 上灌一张页内合成 JPEG，驱动真实 onChange → 上传管线 → 预览。 */
async function injectFile(page: Page, name: string) {
  await page.evaluate(async (fname) => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 180;
    const cx = c.getContext('2d')!;
    cx.fillStyle = 'rgb(120,150,90)';
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

/** 走完真实上传闭环：点＋卡 → 选图 → 预览 → 确认入库。返回入库后的 tray-item 总数。 */
async function uploadViaUI(page: Page, name: string): Promise<number> {
  await ensureDockOpen(page);
  const items = page.getByTestId('tray-item');
  const before = await items.count();
  await page.getByTestId('upload-add').click(); // 真实点入口（未满才会开选图）
  await injectFile(page, `${name}.jpg`);
  await expect(page.getByTestId('upload-preview')).toBeVisible();
  await page.getByTestId('upload-preview-name').fill(name);
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  await expect(items).toHaveCount(before + 1);
  return before + 1;
}

function quota(page: Page): Locator {
  return page.getByTestId('upload-quota');
}

// ————————————————————————————————————————————————————————————————
// ① dock 显示「已传 N/50」并随每次上传/删除实时更新数字
// ————————————————————————————————————————————————————————————————
test('① dock 显示「已传 N/50」并随上传/删除实时更新', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  // 起始零上传：dock 明确显示「已传 0/50」。
  await expect(quota(page)).toBeVisible();
  await expect(quota(page)).toHaveText('已传 0/50');

  // 上传第一件 → 计数升到 1/50。
  await uploadViaUI(page, '外婆的信');
  await expect(quota(page)).toHaveText('已传 1/50');

  // 再上传一件 → 计数升到 2/50。
  await uploadViaUI(page, '爷爷的怀表');
  await expect(quota(page)).toHaveText('已传 2/50');
  await expect(page.getByTestId('tray-item')).toHaveCount(16); // 14 内置 + 2 用户

  // —— 删除一件用户件：计数应实时回落到 1/50（验「随删除更新」）——
  const lastThumb = page.getByTestId('tray-item').nth(15);
  await lastThumb.getByTestId('item-delete').click();
  await page.getByTestId('item-delete-confirm').click();
  await expect(page.getByTestId('tray-item')).toHaveCount(15);
  await expect(quota(page)).toHaveText('已传 1/50');

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ② 传到第 50 件后上传入口前置阻止并说明，无法传入第 51 件
// ————————————————————————————————————————————————————————————————
test('② 到顶（50/50）后上传入口前置阻止并给出说明，第 51 件传不进', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);

  // 种 49 件用户物件（省去 49 遍真实上传），reload 后有 14 内置 + 49 用户 = 63 件。
  await seedUserItems(page, MAX - 1);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  const uploadAdd = page.getByTestId('upload-add');
  const items = page.getByTestId('tray-item');

  // 49/50：入口仍可用（未满、未前置阻止），无「已满说明」。
  await expect(items).toHaveCount(63);
  await expect(quota(page)).toHaveText('已传 49/50');
  await expect(uploadAdd).toHaveAttribute('data-full', 'false');
  await expect(uploadAdd).toBeEnabled();
  await expect(page.getByTestId('upload-quota-block')).toHaveCount(0);

  // —— 走一次真实上传触到第 50 件——
  await uploadViaUI(page, '压线的第50件');
  await expect(items).toHaveCount(64);
  await expect(quota(page)).toHaveText('已传 50/50');

  // —— 到顶：入口切到前置阻止态 + 常驻说明（在选图之前就告知，指明出路）——
  await expect(uploadAdd).toHaveAttribute('data-full', 'true');
  await expect(uploadAdd).toBeDisabled(); // 前置阻止：入口不再打开选图流程
  const block = page.getByTestId('upload-quota-block');
  await expect(block).toBeVisible();
  await expect(block).toContainText('50');
  await expect(block).toContainText('上限');

  // —— 点入口（强制点已禁用的按钮）：不得开启任何选图/预览流程；计数与数量岿然不动 ——
  await uploadAdd.click({ force: true });
  await page.waitForTimeout(150);
  await expect(page.getByTestId('upload-preview')).toHaveCount(0); // 选图流程根本没启动
  await expect(items).toHaveCount(64);
  await expect(quota(page)).toHaveText('已传 50/50');

  // —— 纵深防御：即便绕过入口、把文件直灌进隐藏 input 并走完预览确认，reducer 也拒收第 51 件 ——
  await injectFile(page, '越界的第51件.jpg');
  await expect(page.getByTestId('upload-preview')).toBeVisible();
  await page.getByTestId('upload-preview-name').fill('越界的第51件');
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  // 第 51 件被拒：数量仍 64、计数仍 50/50（未能传入第 51 件）。
  await expect(items).toHaveCount(64);
  await expect(quota(page)).toHaveText('已传 50/50');

  // 刷新后仍是 50/50、仍前置阻止（配额持久、非会话内幻象）。
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await ensureDockOpen(page);
  await expect(quota(page)).toHaveText('已传 50/50');
  await expect(page.getByTestId('upload-add')).toHaveAttribute('data-full', 'true');

  expect(problems, problems.join('\n')).toEqual([]);
});
