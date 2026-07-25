import { test, expect, type Page } from '@playwright/test';

// 念念 · 陈列室 —— U1-S1 双源目录 e2e（数据结构双源化 + reconcileItems 修复）。
//
// 只覆盖 U1-S1 goal 点名的那一块（数据地基），对齐 sprint【验收硬指标】：
//   ① 在 loadState 注入一个「不在 ITEMS 清单里的 user Item」，reconcile 后该 Item 必须仍存在
//      （旧版 reconcileItems 拿内置清单当基准 map，会把它直接丢弃 → 刷新即蒸发；此为本 sprint 修的 bug）。
//   ② 内置 14 件仍与 manifest.ts 的 ITEMS 对齐（恒在、缺失从清单补齐）。
//   ③ 注入用户物件后应用不崩（无 pageerror / console.error）。
//
// 边界：图片二进制入 IndexedDB、schema 升 v4、saveState 静默失败终结属 U1-S2；本 sprint 只动
//   数据结构与 reconcile 逻辑，schema 仍为 v3，图片仍走现有存法（此处用 data URL 过渡）。
//   完整的 U1 收口（IndexedDB / v4 / 存储报错）由里程碑 e2e u1-foundation.spec.ts 覆盖，非本文件职责。

const STORAGE_KEY = 'memories.gallery';

// manifest.ts ITEMS 的 14 件内置物件 id（顺序对齐）。
const BUILTIN_IDS = [
  'bedroom-1', 'bedroom-2', 'bedroom-3', 'bedroom-4', 'bedroom-5', 'bedroom-6',
  'living-1', 'living-2', 'living-3', 'living-4', 'living-5', 'living-6', 'living-7', 'living-8',
] as const;

// 1×1 透明 PNG 的 data URL——给注入的用户物件当 imageSrc，dock 渲染 <img> 不报网络错误。
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const USER_ITEM_ID = 'user-friend-photo-1';

/** 读回 localStorage 里的整棵状态树（JSON）。 */
async function readStore(page: Page): Promise<any> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORAGE_KEY);
}

test('双源目录：注入不在清单里的 user Item，reconcile 后仍在；内置 14 件仍对齐清单、应用不崩', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/');

  // —— 预置一份 v3 状态：items 里只有一件「不在 ITEMS 清单里」的用户物件（source='user'）。——
  // 内置 14 件故意不写进 items，用来验证 reconcile 会从清单把它们补齐（对齐），
  // 同时用户物件必须原样保留、不被丢弃。
  await page.evaluate(
    ({ k, uid, png }) => {
      const state = {
        // U1-S2 起 schema 为 v4（存储换血）。这份夹具随之升 v4，才能被 loadState 接受（v3 会作废重置），
        // 从而继续验证本文件的本职：reconcile 保留不在清单里的用户物件、内置 14 件对齐。
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

  // 不崩：外壳照常渲染。
  await expect(page.getByTestId('app')).toBeVisible();

  // ① 用户物件存活：dock 里出现注入的那件（它由 loadState→reconcile 保留后进入 state.items 渲染）。
  const userTile = page.locator(`[data-testid="tray-item"][data-item-id="${USER_ITEM_ID}"]`);
  await expect(userTile).toHaveCount(1);
  // 它确实是用户上传那张（imageSrc 为注入的 data URL），名字保留。
  await expect(userTile.locator('img.itm')).toHaveAttribute('src', PNG_1PX);
  await expect(userTile.getByTestId('item-name')).toHaveText('朋友的照片');

  // ② 内置 14 件仍与 manifest 对齐：14 个内置 id 逐件在 dock 出现（即使持久化里一件都没写，也从清单补齐）。
  for (const id of BUILTIN_IDS) {
    await expect(
      page.locator(`[data-testid="tray-item"][data-item-id="${id}"]`),
      `内置物件 ${id} 应对齐清单出现在 dock`,
    ).toHaveCount(1);
  }

  // dock 总数 = 14 内置 + 1 用户 = 15（用户物件与内置平级并列，未被丢弃、也未挤掉任一内置件）。
  await expect(page.getByTestId('tray-item')).toHaveCount(BUILTIN_IDS.length + 1);

  // schema 为 v4（U1-S2 存储换血后落盘版本；本文件夹具亦已升 v4）。
  const stored = await readStore(page);
  expect(stored?.schemaVersion).toBe(4);

  // ③ 全程无未捕获错误 / console.error（注入用户物件后应用不崩）。
  expect(problems, `不应出现未捕获错误：\n${problems.join('\n')}`).toEqual([]);
});
