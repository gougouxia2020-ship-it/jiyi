import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— E1 里程碑官方 e2e：拖拽与回填的自动兜底。
// 验收命令：npx playwright test e2e/e1-hydrate.spec.ts --reporter=line（expect_exit 0）。
//
// 逐条覆盖 milestones.json E1 criteria「拖拽与回填的自动兜底」这一条的两点：
//   ① hydrate 尚未把图回填到用户物件时，该物件的 dock 卡片**不可拖、不可摆**——不会摆出一个看不见
//      的物件（图片渲染不出、却占一条 placement）。对照：已 ready 的内置件仍可正常拖入（证明拦的是
//      「未回填」这一态，而非拖拽系统坏了）。
//   ② 物件被删除后，其 hydrate 生成的 objectURL 被 **revoke**（不再泄漏）。
//
// 手法：直接把「刷新后待 hydrate」的持久化态灌进 LocalStorage + IndexedDB，reload 触发真实 hydrate 路径。
//   ①的用户件 imageRef 指向 IndexedDB 里**不存在**的键 → hydrate 取不到图 → 稳定停在「未回填」态。
//   ②的用户件 imageRef 指向**已灌入**的真实图 → hydrate 生成 blob: objectURL 回填；用 addInitScript
//   在页内劫持 URL.revokeObjectURL 记录所有被 revoke 的 URL，删除后核对该件的 blob URL 确已被 revoke。

const STORAGE_KEY = 'memories.gallery';
const IMAGE_DB = 'memories.images';
const IMAGE_STORE = 'images';
const SCHEMA_VERSION = 4; // 对齐 src/storage/persistence.ts 的 SCHEMA_VERSION（不匹配即被作废重置）。
const VP = { width: 1280, height: 800 }; // 宽视口：dock 默认展开（收合阈值 <880px）。

/** 全程不得有未捕获错误 / 未处理 Promise 拒绝 / console.error。 */
function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  return problems;
}

interface SeedItem {
  id: string;
  name: string;
  source: 'builtin' | 'user';
  aspectRatio: number;
  originalImageSrc: string;
  displayImageSrc: string;
  imageSrc: string;
  imageRef?: string;
  story: string;
}

/** 灌一份「刷新后待 hydrate」的持久化态进 LocalStorage（含一个场景 + 一件待回填 user 物件）。 */
async function seedState(page: Page, userItem: SeedItem) {
  await page.evaluate(
    ({ key, version, item }) => {
      const state = {
        schemaVersion: version,
        galleryName: '念念 · 陈列室',
        scenes: [{ id: 'scene-1', name: '客厅', backgroundId: 'living-room' }],
        // 只放这件 user 物件；loadState 的 reconcileItems 会把 14 件内置物件补回来。
        items: [item],
        placements: [],
        activeSceneId: 'scene-1',
        mode: 'edit',
      };
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, version: SCHEMA_VERSION, item: userItem },
  );
}

/** 往 IndexedDB(memories.images) 灌一张真实图片二进制（键 = ref）——供 hydrate 取回生成 objectURL。 */
async function seedImage(page: Page, ref: string) {
  await page.evaluate(
    async ({ db, store, key }) => {
      const c = document.createElement('canvas');
      c.width = 12;
      c.height = 9;
      const cx = c.getContext('2d')!;
      cx.fillStyle = '#b5462e';
      cx.fillRect(0, 0, 12, 9);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(db, 1);
        req.onupgradeneeded = () => {
          const conn = req.result;
          if (!conn.objectStoreNames.contains(store)) conn.createObjectStore(store);
        };
        req.onsuccess = () => {
          const conn = req.result;
          const tx = conn.transaction(store, 'readwrite');
          tx.objectStore(store).put(blob, key);
          tx.oncomplete = () => {
            conn.close();
            resolve();
          };
          tx.onerror = () => {
            conn.close();
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    },
    { db: IMAGE_DB, store: IMAGE_STORE, key: ref },
  );
}

async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  await expect(dock).toBeVisible();
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
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

function thumb(page: Page, itemId: string): Locator {
  return page.locator(`[data-testid="tray-item"][data-item-id="${itemId}"]`);
}

// ————————————————————————————————————————————————————————————————
// ① hydrate 未回填图的用户件不可拖、不可摆（不会摆出看不见的物件）；已 ready 的内置件仍可正常拖入
// ————————————————————————————————————————————————————————————————
test('① 未回填图的用户件不可拖不可摆；ready 的内置件仍可拖入', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);

  // 先落地一次（拿到同源上下文），清干净，灌「待 hydrate」态，reload 触发真实 hydrate。
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  const PENDING_ID = 'item-pending-1';
  await seedState(page, {
    id: PENDING_ID,
    name: '待回填的信',
    source: 'user',
    aspectRatio: 1.33,
    originalImageSrc: '',
    displayImageSrc: '',
    imageSrc: '',
    imageRef: 'img-not-in-idb', // 故意指向 IndexedDB 里不存在的键 → hydrate 取不到 → 稳定停在未回填态
    story: '',
  });
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await ensureDockOpen(page);

  // dock 里 15 件（14 内置 + 1 待回填 user 件）。
  await expect(page.getByTestId('tray-item')).toHaveCount(15);

  // 待回填件：data-ready=false、aria-disabled=true（缩略图位为空、不可拖）。
  const pending = thumb(page, PENDING_ID);
  await expect(pending).toHaveAttribute('data-ready', 'false');
  await expect(pending).toHaveAttribute('aria-disabled', 'true');

  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);

  // —— 尝试拖拽这件待回填物件进画布 —— 预期：不起手、无幽灵、松手后不产生任何 placement。
  const pb = await boxOf(pending);
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width / 2 + 24, pb.y + pb.height / 2 + 14, { steps: 5 }); // 越过拖拽阈值
  // 跟手幽灵根本不该挂载（未起手）。
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  await page.mouse.move(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.5, { steps: 12 });
  await page.mouse.up();
  // 没有摆出任何物件（更没有「看不见的物件」）。
  await expect(page.getByTestId('placement')).toHaveCount(0);

  // 点选它（未越阈值＝点选放入）同样不该摆出物件。
  await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await expect(page.getByTestId('placement')).toHaveCount(0);

  // —— 对照：一件 ready 的内置件可正常拖入，产生 1 条 placement（证明拦的是「未回填」态，非拖拽系统坏了）——
  const ready = page.locator('[data-testid="tray-item"][data-ready="true"]').first();
  await expect(ready).toHaveAttribute('data-ready', 'true');
  const rb = await boxOf(ready);
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + 24, rb.y + rb.height / 2 + 14, { steps: 5 });
  await expect(page.getByTestId('drag-ghost')).toHaveCount(1); // ready 件拖动时幽灵可见跟手
  await page.mouse.move(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.5, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('placement')).toHaveCount(1);

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ② 物件被删除后其 hydrate 生成的 objectURL 被 revoke（补内存泄漏）
// ————————————————————————————————————————————————————————————————
test('② 删除用户件后其 objectURL 被 revoke', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP);

  // 在页内劫持 URL.revokeObjectURL，记录所有被 revoke 的 URL（每次导航/刷新都重装）。
  await page.addInitScript(() => {
    (window as unknown as { __revoked: string[] }).__revoked = [];
    const orig = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      (window as unknown as { __revoked: string[] }).__revoked.push(url);
      return orig(url);
    };
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  const REVOKE_ID = 'item-revoke-1';
  const REF = 'img-revoke-1';
  await seedImage(page, REF); // 先把真实图片二进制灌进 IndexedDB（键 = REF）
  await seedState(page, {
    id: REVOKE_ID,
    name: '要删掉的信',
    source: 'user',
    aspectRatio: 1.33,
    originalImageSrc: '',
    displayImageSrc: '',
    imageSrc: '',
    imageRef: REF,
    story: '',
  });
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await ensureDockOpen(page);

  // hydrate 完成：该件缩略图拿到 blob: objectURL。
  const img = thumb(page, REVOKE_ID).locator('img.itm');
  await expect
    .poll(async () => (await img.getAttribute('src')) ?? '')
    .toMatch(/^blob:/);
  const blobUrl = (await img.getAttribute('src'))!;
  expect(blobUrl.startsWith('blob:')).toBe(true);

  // 删除前：这个 blob URL 尚未被 revoke。
  const revokedBefore = await page.evaluate(
    () => (window as unknown as { __revoked: string[] }).__revoked.slice(),
  );
  expect(revokedBefore).not.toContain(blobUrl);

  // —— 删除该 user 件：缩略卡右上角垃圾桶 → 一句话确认 → 删除 ——
  await thumb(page, REVOKE_ID).getByTestId('item-delete').click();
  await expect(page.getByTestId('item-delete-confirm-box')).toBeVisible();
  await page.getByTestId('item-delete-confirm').click();

  // 物件从 dock 消失。
  await expect(thumb(page, REVOKE_ID)).toHaveCount(0);
  await expect(page.getByTestId('tray-item')).toHaveCount(14);

  // 删除后：该件的 blob objectURL 已被 revoke（不再泄漏）。
  await expect
    .poll(() =>
      page.evaluate(
        (u) => (window as unknown as { __revoked: string[] }).__revoked.includes(u),
        blobUrl,
      ),
    )
    .toBe(true);

  expect(problems, problems.join('\n')).toEqual([]);
});
