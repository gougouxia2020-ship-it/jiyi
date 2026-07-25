import { test, expect, type Page } from '@playwright/test';

// 念念 · 陈列室 —— U1 里程碑收口 e2e（数据与存储地基·三版第一块）。
//
// 覆盖 milestones.json U1 criteria[1]「双源目录与 v4 持久化」点名的四点，逐条落成断言：
//   ① 注入一件「不在内置清单里」的 user Item，reconcile 后它仍出现在 dock（不被 reconcileItems 丢弃）。
//   ② 内置 14 件仍与 manifest 对齐、逐件出现在 dock（持久化里一件都没写也从清单补齐、名字对齐）。
//   ③ 预置一份 schemaVersion=3 的旧状态启动：页面正常渲染、无 pageerror/console.error，且按既有作废
//      重置路径处理——回到初始态，不得读出 / 复现 v3 的场景、物件、摆放数据。
//   ④ 图片二进制写进 IndexedDB（memories.images 库），LocalStorage 序列化内容里查不到该图的二进制 / base64。
//
// 契约锚点（均为已过评审的实现，本文件只验、不改）：
//   - STORAGE_KEY='memories.gallery'、SCHEMA_VERSION=4；schemaVersion 不等于 4 → loadState 作废重置为初始态。
//   - reconcileItems：内置 14 件对齐 manifest 补齐、用户物件（id 不在清单里）原样保留。
//   - saveState：内联图片（data:/blob:）二进制搬进 IndexedDB（键=imageRef=`img-<id>`），LocalStorage 只留引用。

const STORAGE_KEY = 'memories.gallery';
const IMAGE_DB = 'memories.images';
const IMAGE_STORE = 'images';

// manifest.ts ITEMS 的 14 件内置物件（id + name，顺序对齐清单）——用于验证「逐件对齐」。
const BUILTINS = [
  { id: 'bedroom-1', name: '全家福旧照' },
  { id: 'bedroom-2', name: '旧时书信' },
  { id: 'bedroom-3', name: '复古毡帽' },
  { id: 'bedroom-4', name: '旅行背包' },
  { id: 'bedroom-5', name: '泛黄旧书' },
  { id: 'bedroom-6', name: '复古闹钟' },
  { id: 'living-1', name: '相机镜头' },
  { id: 'living-2', name: '荣誉奖杯' },
  { id: 'living-3', name: '老式收音机' },
  { id: 'living-4', name: '黄色甲壳虫' },
  { id: 'living-5', name: '潮玩公仔' },
  { id: 'living-6', name: '旧地球仪' },
  { id: 'living-7', name: '掌上游戏机' },
  { id: 'living-8', name: '一杯咖啡' },
] as const;

// 1×1 透明 PNG data URL：给注入的用户物件当图源（dock <img> 不报网络错误），其 base64 体用于「查不到」断言。
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_BASE64_BODY = PNG_1PX.split(',')[1];

/** 读回 localStorage 里的整棵状态树（JSON）。 */
async function readStore(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORAGE_KEY);
}

/** 读回 localStorage 里的原始字符串（做「查不到某子串」的断言）。 */
async function readRaw(page: Page): Promise<string> {
  return page.evaluate((k) => localStorage.getItem(k) || '', STORAGE_KEY);
}

/** 预置一份状态到 localStorage（在首帧渲染前注入，reload 后由 loadState 读取）。 */
async function seedState(page: Page, state: unknown): Promise<void> {
  await page.evaluate(
    ({ k, s }) => localStorage.setItem(k, JSON.stringify(s)),
    { k: STORAGE_KEY, s: state },
  );
}

// ============================================================
// ① 用户物件存活：注入不在清单里的 user Item，reconcile 后仍在 dock（不被丢弃）
// ============================================================
test('① 注入不在内置清单里的 user Item，reconcile 后仍出现在 dock（不被 reconcileItems 丢弃）', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });

  const USER_ITEM_ID = 'user-friend-photo-1';

  await page.goto('/');
  // 预置一份 v4 状态：items 里只有一件「不在 ITEMS 清单里」的用户物件（source='user'）。
  await seedState(page, {
    schemaVersion: 4,
    galleryName: '念念 · 陈列室',
    scenes: [],
    items: [
      {
        id: USER_ITEM_ID,
        name: '朋友的照片',
        source: 'user',
        aspectRatio: 1,
        originalImageSrc: PNG_1PX,
        displayImageSrc: PNG_1PX,
        imageSrc: PNG_1PX,
        story: '',
      },
    ],
    placements: [],
    activeSceneId: null,
    mode: 'edit',
  });
  await page.reload();

  // 不崩：外壳照常渲染。
  await expect(page.getByTestId('app')).toBeVisible();

  // 用户物件存活：dock 里出现注入的那件（loadState→reconcile 保留后进入 state.items 渲染）。
  const userTile = page.locator(`[data-testid="tray-item"][data-item-id="${USER_ITEM_ID}"]`);
  await expect(userTile).toHaveCount(1);
  // 它确实是用户上传那张（imageSrc 为注入的 data URL），名字保留。
  await expect(userTile.locator('img.itm')).toHaveAttribute('src', PNG_1PX);
  await expect(userTile.getByTestId('item-name')).toHaveText('朋友的照片');

  // dock 总数 = 14 内置 + 1 用户 = 15（用户物件与内置平级并列，未被丢弃、也未挤掉任一内置件）。
  await expect(page.getByTestId('tray-item')).toHaveCount(BUILTINS.length + 1);

  // 状态树里用户物件仍在（reconcile 保留），schema 落盘为 v4。
  const stored = await readStore(page);
  expect(stored?.schemaVersion).toBe(4);
  expect((stored?.items ?? []).some((i: { id: string }) => i.id === USER_ITEM_ID)).toBe(true);

  expect(problems, `不应出现未捕获错误：\n${problems.join('\n')}`).toEqual([]);
});

// ============================================================
// ② 内置 14 件仍与 manifest 对齐、逐件出现在 dock（持久化零 items 也从清单补齐）
// ============================================================
test('② 内置 14 件仍与 manifest 对齐、逐件出现在 dock（持久化里一件都没写也从清单补齐、名字对齐）', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/');
  // 预置一份 v4 状态，items 故意为空：验证 reconcile 会从清单把 14 件内置物件全数补齐、对齐。
  await seedState(page, {
    schemaVersion: 4,
    galleryName: '念念 · 陈列室',
    scenes: [],
    items: [],
    placements: [],
    activeSceneId: null,
    mode: 'edit',
  });
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();

  // 逐件对齐：14 个内置 id 各出现一次，且 dock 上的名字与 manifest 清单一致。
  for (const { id, name } of BUILTINS) {
    const tile = page.locator(`[data-testid="tray-item"][data-item-id="${id}"]`);
    await expect(tile, `内置物件 ${id} 应对齐清单出现在 dock`).toHaveCount(1);
    await expect(tile.getByTestId('item-name'), `内置物件 ${id} 名字应对齐清单`).toHaveText(name);
  }

  // dock 恰为 14 件内置（无多、无少、无用户件）。
  await expect(page.getByTestId('tray-item')).toHaveCount(BUILTINS.length);

  // 状态树落盘为 v4，items 恰为 14 件内置，且 id 顺序对齐清单。
  const stored = await readStore(page);
  expect(stored?.schemaVersion).toBe(4);
  const ids = (stored?.items ?? []).map((i: { id: string }) => i.id);
  expect(ids).toEqual(BUILTINS.map((b) => b.id));

  expect(problems, `不应出现未捕获错误：\n${problems.join('\n')}`).toEqual([]);
});

// ============================================================
// ③ 预置 schemaVersion=3 旧数据：启动不崩、按作废重置回初始态，v3 旧数据不复现
// ============================================================
test('③ 预置 schemaVersion=3 旧数据启动：页面正常渲染、无 pageerror/console.error，按作废重置回初始态、v3 旧数据不读出', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });

  // v3 旧状态里植入可辨识的标记串——用来断言它们不在作废重置后复现。
  const V3_SCENE_NAME = 'V3-STALE-场景-不该复现';
  const V3_STORY = 'V3-STALE-故事-不该复现';
  const V3_GALLERY_NAME = 'V3-STALE-陈列室名-不该复现';

  await page.goto('/');
  // 预置一份 v3 旧格式数据：含场景、带故事的物件、摆放（N2 语义的百分比坐标）。
  await seedState(page, {
    schemaVersion: 3,
    galleryName: V3_GALLERY_NAME,
    scenes: [{ id: 'scene-old', name: V3_SCENE_NAME, backgroundId: 'living-room' }],
    items: [{ id: 'bedroom-1', name: '全家福旧照', imageSrc: 'stale-url', story: V3_STORY }],
    placements: [
      { id: 'pl-old', sceneId: 'scene-old', itemId: 'bedroom-1', x: 40, y: 30, w: 20, rotation: 0, z: 1 },
    ],
    activeSceneId: 'scene-old',
    mode: 'edit',
  });
  await page.reload();

  // 启动不崩：外壳照常渲染。
  await expect(page.getByTestId('app')).toBeVisible();

  // 作废重置：v3 不迁移，回到初始空态——无场景、无摆放（清空重摆）。
  await expect(page.getByTestId('scene-chip')).toHaveCount(0);
  await expect(page.getByTestId('placement')).toHaveCount(0);
  // 物件目录回到初始 14 件内置，且 bedroom-1 的 v3 故事没有被读出（初始态故事为空）。
  await expect(page.getByTestId('tray-item')).toHaveCount(BUILTINS.length);

  // 等 App 挂载后把初始态（v4）全量落盘，覆盖掉原来的 v3 载荷。
  await expect.poll(async () => (await readStore(page))?.schemaVersion, { timeout: 10_000 }).toBe(4);

  // 存储被作废重置为 v4 初始态：无场景、无摆放、无当前场景、陈列室名回到默认。
  const stored = await readStore(page);
  expect(stored.schemaVersion).toBe(4);
  expect(stored.scenes).toHaveLength(0);
  expect(stored.placements).toHaveLength(0);
  expect(stored.activeSceneId).toBeNull();
  expect(stored.galleryName).not.toBe(V3_GALLERY_NAME);
  // bedroom-1 回到初始态、无 v3 故事残留。
  const b1 = (stored.items ?? []).find((i: { id: string }) => i.id === 'bedroom-1');
  expect(b1, 'bedroom-1 应回到初始态').toBeTruthy();
  expect(b1.story ?? '').toBe('');

  // 「不得读出 v3 旧数据本身」：作废重置后的 LocalStorage 里查不到任何 v3 标记串（场景名 / 故事 / 陈列室名）。
  const raw = await readRaw(page);
  expect(raw).not.toContain(V3_SCENE_NAME);
  expect(raw).not.toContain(V3_STORY);
  expect(raw).not.toContain(V3_GALLERY_NAME);
  expect(raw).not.toContain('scene-old');
  expect(raw).not.toContain('stale-url');

  // 全程无未捕获错误 / console.error（启动不崩）。
  expect(problems, `不应出现未捕获错误：\n${problems.join('\n')}`).toEqual([]);
});

// ============================================================
// ④ 图片二进制入 IndexedDB（memories.images），LocalStorage 里查不到该图的二进制 / base64
// ============================================================
test('④ 图片二进制写进 IndexedDB（memories.images 库），LocalStorage 序列化内容里查不到该图的二进制 / base64', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  const USER_ITEM_ID = 'user-photo-1';
  const EXPECTED_REF = `img-${USER_ITEM_ID}`;

  await page.goto('/');
  await expect(page.getByTestId('app')).toBeVisible();

  // 预置一份 v4 状态：含一件「带内联 data: base64 图片」的用户物件（模拟上传件的内联形态）。
  await seedState(page, {
    schemaVersion: 4,
    galleryName: '念念 · 陈列室',
    scenes: [],
    items: [
      {
        id: USER_ITEM_ID,
        name: '朋友的照片',
        source: 'user',
        aspectRatio: 1,
        originalImageSrc: PNG_1PX,
        displayImageSrc: PNG_1PX,
        imageSrc: PNG_1PX,
        story: '',
      },
    ],
    placements: [],
    activeSceneId: null,
    mode: 'edit',
  });
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

  expect(problems, `不应出现未捕获错误：\n${problems.join('\n')}`).toEqual([]);
});
