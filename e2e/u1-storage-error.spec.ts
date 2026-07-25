import { test, expect, type Page } from '@playwright/test';

// 念念 · 陈列室 —— U1-S2 存储换血 e2e（对齐 sprint【验收硬指标】/ criteria）。
//
// 只覆盖 U1-S2 goal 点名的两块收口，逐条对齐 sprint 验收：
//   ① 终结 saveState 静默失败：人为让底层写入（localStorage.setItem）抛错（配额超限 / 隐私模式），
//      错误能冒泡到上层并被界面感知（弹明确提示），不出现「提示成功、刷新就没」的静默丢失；应用不崩。
//   ② 照片二进制入 IndexedDB、LocalStorage 只存引用：带内联图片（data: base64）的用户物件落盘后，
//      二进制写进 IndexedDB，LocalStorage 序列化内容里查不到该图片的二进制 / base64（只留 imageRef）。
//
// 边界：用户上传 UI、渲染层据 imageRef 取图 hydrate 属 U2/U3；本文件只验存储层的换血与错误冒泡。

const STORAGE_KEY = 'memories.gallery';
const IMAGE_DB = 'memories.images';
const IMAGE_STORE = 'images';

// 一张可辨识的 1×1 透明 PNG data URL；其 base64 体用于在 LocalStorage 里做「查不到」断言。
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_BASE64_BODY = PNG_1PX.split(',')[1];

const USER_ITEM_ID = 'user-photo-1';
const EXPECTED_REF = `img-${USER_ITEM_ID}`;

/** 读回 localStorage 里整棵状态树（JSON）。 */
async function readStore(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORAGE_KEY);
}

/** 读回 localStorage 里的原始字符串（做「查不到 base64」的子串断言）。 */
async function readRaw(page: Page): Promise<string> {
  return page.evaluate((k) => localStorage.getItem(k) || '', STORAGE_KEY);
}

// ============================================================
// ① 终结静默失败：写入抛错 → 冒泡 → 界面感知（弹提示），应用不崩
// ============================================================
test('① 存储写入失败不再静默：setItem 抛错时冒泡到上层、界面弹明确提示，应用不崩', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));

  // 人为让底层写入抛错（模拟配额超限 / 隐私模式）：只对本应用的 key 抛，不误伤其它 setItem。
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'memories.gallery') {
        throw new DOMException('模拟配额超限', 'QuotaExceededError');
      }
      return orig.call(this, key, value);
    };
  });

  await page.goto('/');

  // 应用不崩：外壳照常渲染。
  await expect(page.getByTestId('app')).toBeVisible();

  // 写入失败被界面感知：明确的失败提示浮现（挂载即触发的首个 saveState 就已失败）。
  const banner = page.getByTestId('save-error');
  await expect(banner).toBeVisible();
  await expect(page.getByTestId('save-error-msg')).toContainText('没能保存');

  // 「不是提示成功、刷新就没」：LocalStorage 里确实没有本应用的状态（写入被拒、无声吞不掉数据——用户看得见）。
  const raw = await readRaw(page);
  expect(raw).toBe('');

  // 每一次失败的落盘都被感知：关掉提示后再触发一次状态变更（切游客模式）→ 提示复现。
  await page.getByTestId('save-error-dismiss').click();
  await expect(banner).toHaveCount(0);

  await page.getByTestId('mode-guest').click();
  await expect(banner).toBeVisible();
  await expect(page.getByTestId('save-error-msg')).toContainText('没能保存');

  // 全程无未捕获错误（错误是被 App 捕获并转成提示的，不是抛到 window 崩掉页面）。
  expect(pageErrors, `不应出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([]);
});

// ============================================================
// ② 图片二进制入 IndexedDB、LocalStorage 只存引用（查不到 base64）
// ============================================================
test('② 内联图片落盘：二进制写进 IndexedDB，LocalStorage 里查不到该图的 base64（只留 imageRef）', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await expect(page.getByTestId('app')).toBeVisible();

  // 预置一份 v4 状态：含一件「带内联 data: base64 图片」的用户物件（模拟 U2/U3 上传前的内联形态）。
  await page.evaluate(
    ({ k, uid, png }) => {
      const state = {
        schemaVersion: 4,
        galleryName: '念念 · 陈列室',
        scenes: [],
        items: [
          {
            id: uid,
            name: '朋友的照片',
            source: 'user',
            aspectRatio: 1,
            originalImageSrc: png,
            displayImageSrc: png,
            imageSrc: png,
            story: '',
          },
        ],
        placements: [],
        activeSceneId: null,
        mode: 'edit',
      };
      localStorage.setItem(k, JSON.stringify(state));
    },
    { k: STORAGE_KEY, uid: USER_ITEM_ID, png: PNG_1PX },
  );
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();

  // 应用挂载后 saveState 会把内联图片二进制搬进 IndexedDB、并把 base64 从 LocalStorage 剥掉。
  // 轮询等这次异步落盘完成：LocalStorage 里已查不到该图的 base64 体。
  await expect
    .poll(async () => (await readRaw(page)).includes(PNG_BASE64_BODY), { timeout: 10_000 })
    .toBe(false);

  // 硬指标：LocalStorage 序列化内容里查不到该图片的二进制 / base64（连 data:image 前缀都不该出现）。
  const raw = await readRaw(page);
  expect(raw).not.toContain(PNG_BASE64_BODY);
  expect(raw).not.toContain('data:image');

  // 状态树只存引用：该用户物件在 LocalStorage 里图片位被清空、改挂 imageRef。
  const stored = await readStore(page);
  const it = (stored?.items ?? []).find((i: { id: string }) => i.id === USER_ITEM_ID);
  expect(it, '用户物件应仍在状态树内（reconcile 保留）').toBeTruthy();
  expect(it.imageRef).toBe(EXPECTED_REF);
  expect(it.imageSrc).toBe('');
  expect(it.originalImageSrc).toBe('');
  expect(it.displayImageSrc).toBe('');
  expect(stored.schemaVersion).toBe(4);

  // 硬指标：图片二进制确实写进了 IndexedDB（memories.images 库、键 = imageRef，取回是非空 Blob）。
  const idb = await page.evaluate(
    ({ dbName, storeName, key }) =>
      new Promise<{ ok: boolean; size: number; reason?: string }>((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            resolve({ ok: false, size: 0, reason: 'no-store' });
            return;
          }
          const tx = db.transaction(storeName, 'readonly');
          const g = tx.objectStore(storeName).get(key);
          g.onsuccess = () => {
            const v = g.result as Blob | undefined;
            resolve({ ok: !!v && typeof v.size === 'number' && v.size > 0, size: v?.size ?? 0 });
          };
          g.onerror = () => resolve({ ok: false, size: 0, reason: 'get-error' });
        };
        req.onerror = () => resolve({ ok: false, size: 0, reason: 'open-error' });
      }),
    { dbName: IMAGE_DB, storeName: IMAGE_STORE, key: EXPECTED_REF },
  );
  expect(idb.ok, `IndexedDB 应存有该图二进制（size=${idb.size}, reason=${idb.reason ?? '-'}）`).toBe(
    true,
  );

  // 应用不崩。
  expect(pageErrors, `不应出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([]);
});
