import { test, expect, type Page, type Locator, type ConsoleMessage } from '@playwright/test';

// 念念 · 陈列室 —— U4 收口 · 全流程主链路 e2e（双视口：PC 1920×1080 + 横屏手机 844×390）。
//
// 把 U 代际新增的**上传管线**串进 M/N 既有主链路，端到端跑通老板定调的这条全链路：
//   传照片 → 建场景 → 摆物件 → 写故事 → 切游客看故事。
// U4-S1 只在 PC（1920×1080）收口；U4-S2 把**同一条**主链路扩到横屏手机（844×390）视口——
//   两个视口逐一各自完整跑一遍（milestones.json U4 criteria「在 PC 与横屏手机视口下均跑通、布局
//   不错乱；过程中无 console 未捕获错误、无横向滚动条」）。
//
// —— 主链路覆盖点（对齐 U4 goal 的上传/摆放/故事/游客四段硬指标）——
//   ① 传照片：dock「＋」选图 → 弹预览 → 确认入库 → 物件出现在 dock、「已传 N/50」计数由 0/50 升到 1/50。
//   ② 建场景：绑定一张背景，进入可摆放态。
//   ③ 摆物件：把**刚上传的那件**从 dock 拖入场景（落成 placement、渲出真实图），再挪位、角手柄缩放。
//   ④ 写故事：给该上传物件写故事，保存后全量落 LocalStorage（schema v4）。
//   ⑤ 刷新还原：物件 / 摆放(x,y,w,rotation,z) / 故事全在，用户件图片经 IndexedDB hydrate 回填。
//   ⑥ 切游客看故事：切游客模式点该物件，只读弹出「故事 + 原图」，无任何编辑入口。
//
// 贯穿全程的运行时守卫（沿用 M4/N4 收口 spec 口径）：无未捕获运行时错误（pageerror）、无未处理的
//   Promise 拒绝、无 console error；资源 404 之类网络失败按验收原文口径排除。全程另断言无横向溢出
//   （真实测量 documentElement.scrollWidth ≤ clientWidth）。
//
// —— 视口选取 ——
//   · PC：1920×1080（U4-S1 收口视口，宽屏 dock 默认展开）。
//   · 横屏手机：844×390——宽>高的横屏（宽 844 < 响应式断点 880，命中窄屏一套交互；高 390 < 560，命中
//     矮视口收紧）。dock 在窄屏默认收合成把手、故事弹窗贴底近满宽——本轮首次把「上传 UI（＋入口 /
//     预览弹窗 / 已传 N/50）」放到这套横屏收紧布局下端到端验证。
//
// 手法：全程驱动真实 UI（真 UploadEntry → 真上传管线 → 真预览 → 真 dispatch add-item → 真 Canvas
//   拖放/变换/故事 → 真模式开关）。注入文件只在隐藏 file input 上灌一张页内合成图，触发真实 onChange，
//   零测试钩子进生产码（与 U2/U3 官方 spec 同款手法）。窄屏共用的浮层规避 helper（ensureDockOpen /
//   withUiHidden / boxOf 先 scrollIntoViewIfNeeded）沿用 M4-S2 收口 spec 已验证的写法。

const STORAGE_KEY = 'memories.gallery';

interface ViewportSpec {
  width: number;
  height: number;
  label: string;
}

// 双视口：PC 宽屏 + 横屏手机窄矮屏。两者逐一各自完整跑一遍同一条主链路。
const VIEWPORTS: ViewportSpec[] = [
  { width: 1920, height: 1080, label: 'PC1920' },
  { width: 844, height: 390, label: '横屏手机844×390' },
];

// —— 运行时错误守卫 ——
interface ErrorSink {
  pageErrors: string[];
  consoleErrors: string[];
}

/**
 * 挂三类运行时错误收集：未捕获运行时错误（pageerror）、未处理的 Promise 拒绝（页面内监听）、
 * console error。addInitScript 在每次导航（含 reload）后重跑，保证刷新后仍在收集。
 */
async function attachErrorGuards(page: Page): Promise<ErrorSink> {
  const sink: ErrorSink = { pageErrors: [], consoleErrors: [] };
  await page.addInitScript(() => {
    (window as unknown as { __rejections: string[] }).__rejections = [];
    window.addEventListener('unhandledrejection', (ev) => {
      (window as unknown as { __rejections: string[] }).__rejections.push(
        String((ev as PromiseRejectionEvent).reason),
      );
    });
  });
  page.on('pageerror', (err) => sink.pageErrors.push(String(err)));
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 资源加载失败（如缺省 favicon 的 404）属网络失败，非「未捕获错误 / Promise 拒绝」，按验收原文排除。
    if (text.includes('Failed to load resource')) return;
    sink.consoleErrors.push(text);
  });
  return sink;
}

async function assertNoRuntimeErrors(page: Page, sink: ErrorSink) {
  const rejections = await page.evaluate(
    () => (window as unknown as { __rejections?: string[] }).__rejections ?? [],
  );
  expect(sink.pageErrors, '全程不应有未捕获运行时错误').toEqual([]);
  expect(rejections, '全程不应有未处理的 Promise 拒绝').toEqual([]);
  expect(sink.consoleErrors, '全程不应有 console error').toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  // 容 1px 亚像素误差。
  expect(m.scrollW, `${label} 视口下页面不应横向溢出`).toBeLessThanOrEqual(m.clientW + 1);
}

// —— 通用操作 ——
async function freshApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
}

/** 若 dock 收合则展开（PC 默认展开；窄屏 <880px 默认收合成把手，兜底）。 */
async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

/** 建场景：开 picker → 选背景 → 断言 picker 关、该 chip 成为当前激活场景。 */
async function createScene(page: Page, bgName: string) {
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
  await page.getByTestId('bg-option').filter({ hasText: bgName }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip').filter({ hasText: bgName })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

/** 在隐藏 file input 上灌一张页内合成的纯色 JPEG，驱动真实 onChange → 上传管线 → 预览。 */
async function injectFile(page: Page, name: string, w: number, h: number, rgb: string) {
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

/**
 * 取元素真实渲染坐标，供后续 `page.mouse.*` 系列原始指针操作使用。
 * 先 `scrollIntoViewIfNeeded`：窄矮视口（横屏手机 844×390）下 dock 列表纵向滚动、故事弹窗贴底等
 *  会让目标元素落在初始可视范围外——`page.mouse` 按视口坐标派发原始事件，不像 `locator.click()`
 *  自带滚动步骤，若不先滚入视口，算出的坐标点根本点不到东西。PC 下元素本在视口内，此调用为空操作。
 */
async function boxOf(loc: Locator): Promise<Box> {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  expect(b, 'boundingBox 不应为空（元素须可见）').not.toBeNull();
  return b!;
}

/** 真实拖拽：从缩略卡中心拖到视口坐标 (dropX, dropY)（先越拖动阈值，再到落点，松手落成 placement）。 */
async function dragFromTo(page: Page, src: Locator, dropX: number, dropY: number) {
  const b = await boxOf(src);
  const sx = b.x + b.width / 2;
  const sy = b.y + b.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 24, sy + 14, { steps: 6 }); // 越过拖拽阈值
  await page.mouse.move(dropX, dropY, { steps: 16 });
  await page.mouse.up();
}

/** 真实拖拽：把元素中心拖到视口坐标 (tx, ty)（既选中又移位）。 */
async function dragCenterTo(page: Page, loc: Locator, tx: number, ty: number) {
  const b = await boxOf(loc);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 16 });
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
/** 读某 placement 存储的 (x,y,w,rotation,z)——data-* 即存储原值（schema v3/v4 用 w，不再有 scale）。 */
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

/**
 * 隐藏界面包裹一段故事操作（N2 满屏后的浮层规避，沿用 M4-S2 收口 spec 写法）。
 * 报头/品牌章/场景条/dock 都是浮在画布之上的浮层，而选中态的故事工具条「悬于选框上方」属画布内元素——
 *  窄矮视口（横屏手机 844×390）或高位物件下，工具条会被顶部报头等浮层盖住而不可点。用应用自带的
 *  「隐藏界面」（眼睛钮·.eye-keeper）一键收起全部浮层：整段故事操作期间浮层都不挡道；操作完（弹窗
 *  已关、眼睛可点）再恢复。位置无关、双视口通吃，不改任何摆放数据。PC 下浮层本不挡道，包裹亦无害。
 *  —— 恢复放在操作末尾而非弹窗一打开就恢复：窄屏下近满宽的故事弹窗会盖住右上角眼睛钮，弹窗未关时点不到它。
 */
async function withUiHidden(page: Page, fn: () => Promise<void>) {
  const eye = page.getByTestId('toggle-ui');
  const wasHidden = (await eye.getAttribute('aria-pressed')) === 'true';
  if (!wasHidden) await eye.click(); // 隐藏界面：收起全部浮层
  try {
    await fn();
  } finally {
    if (!wasHidden) await eye.click(); // 恢复界面（此时弹窗已关，眼睛钮可点）
  }
}

/** 编辑模式：选中物件的 placement → 点「✎ 故事」手柄 → 打开可编辑弹窗（须在 withUiHidden 内调用）。 */
async function openStoryEditor(page: Page, itemId: string) {
  const item = itemLocator(page, itemId);
  await expect(item).toHaveCount(1);
  await item.locator('.stage__node').click(); // 选中 → 手柄/工具条出现（浮层已隐藏、不被拦截）
  const storyBtn = item.locator('[data-testid="placement-story"]');
  await expect(storyBtn).toBeVisible();
  await storyBtn.click();
  const modal = page.getByTestId('story-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('data-item-id', itemId);
  await expect(modal).toHaveAttribute('data-mode', 'edit');
  await expect(page.getByTestId('story-input')).toBeVisible();
}

/** 编辑模式：打开弹窗 → 写入 text → 保存 → 弹窗关闭。 */
async function writeStory(page: Page, itemId: string, text: string) {
  await withUiHidden(page, async () => {
    await openStoryEditor(page, itemId);
    await page.getByTestId('story-input').fill(text);
    await page.getByTestId('story-save').click();
    await expect(page.getByTestId('story-modal')).toHaveCount(0);
  });
}

/** 编辑模式：打开弹窗读回当前故事文本（不改动）→ 取消关闭。 */
async function readStoryViaEditor(page: Page, itemId: string): Promise<string> {
  let value = '';
  await withUiHidden(page, async () => {
    await openStoryEditor(page, itemId);
    value = await page.getByTestId('story-input').inputValue();
    await page.getByTestId('story-cancel').click();
    await expect(page.getByTestId('story-modal')).toHaveCount(0);
  });
  return value;
}

// ————————————————————————————————————————————————————————————————
// 双视口共用的完整主链路：传照片 → 建场景 → 摆物件 → 写故事 → 刷新还原 → 切游客看故事
// ————————————————————————————————————————————————————————————————
async function runFullChain(page: Page, vp: ViewportSpec) {
  const sink = await attachErrorGuards(page);
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await freshApp(page);

  const STORY = '这是外婆 1980 年从上海寄来的青花瓷碗，碗底还留着她的名字。';
  const ITEM_NAME = '外婆的青花瓷碗';

  // ============================================================
  // ① 传照片：dock「＋」选图 → 预览 → 确认入库 → 出现在 dock、「已传 N/50」由 0/50 升到 1/50
  //   （上传入口在 dock，编辑模式下无需先建场景即在——faithful 地把「传照片」放在链路最前）
  // ============================================================
  await ensureDockOpen(page); // 窄屏 dock 默认收合，先展开
  const tray = page.getByTestId('tray-item');
  await expect(tray).toHaveCount(14); // 内置 14 件
  await expect(page.getByTestId('upload-add')).toBeVisible();
  await expect(page.getByTestId('upload-quota')).toHaveText('已传 0/50');

  // 选图（点＋入口开选图流程 → 灌一张宽>高的绿图，触发真实 onChange 走上传管线）。
  await page.getByTestId('upload-add').click();
  await injectFile(page, 'grandma-bowl.jpg', 480, 360, '110,150,80');

  // 看到预览（含预览图）。
  await expect(page.getByTestId('upload-preview')).toBeVisible();
  await expect(page.getByTestId('upload-preview-img')).toBeVisible();
  // 预览弹窗在双视口下都不撑破横向（窄屏 min(92vw,340px) 居中 + 满屏 scrim）。
  await assertNoHorizontalOverflow(page, vp.label);

  // 改名 → 确认入库 → 预览关闭、物件出现在 dock（14 → 15）。
  await page.getByTestId('upload-preview-name').fill(ITEM_NAME);
  await page.getByTestId('upload-confirm').click();
  await expect(page.getByTestId('upload-preview')).toHaveCount(0);
  await expect(tray).toHaveCount(15);

  // 「已传 N/50」计数更新到 1/50。
  await expect(page.getByTestId('upload-quota')).toHaveText('已传 1/50');

  // 新入库的 user 件是 dock 末位缩略卡；拿到它的 itemId 全程锚定，并核对名字已入库。
  const userThumb = tray.nth(14);
  const userItemId = await userThumb.getAttribute('data-item-id');
  expect(userItemId).toBeTruthy();
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${userItemId}"] [data-testid="item-name"]`),
  ).toHaveText(ITEM_NAME);
  // 落盘确有一件 source:'user' 的物件（schema v4）——saveState 异步（把二进制搬进 IndexedDB），poll 等落定。
  await expect
    .poll(async () =>
      page.evaluate((k) => {
        const s = JSON.parse(localStorage.getItem(k) || 'null');
        const user = (s?.items ?? []).filter((i: { source?: string }) => i.source === 'user');
        return { schemaVersion: s?.schemaVersion ?? null, userCount: user.length };
      }, STORAGE_KEY),
    )
    .toEqual({ schemaVersion: 4, userCount: 1 });
  await assertNoHorizontalOverflow(page, vp.label);

  // ============================================================
  // ② 建场景「客厅」：进入可摆放态
  // ============================================================
  await createScene(page, '客厅');
  await assertNoHorizontalOverflow(page, vp.label);

  // ============================================================
  // ③ 摆物件：把刚上传的物件从 dock 拖入场景 → 挪位 → 角手柄缩放
  // ============================================================
  await ensureDockOpen(page);
  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);

  // —— 拖入：从 dock 末位缩略卡拖到画布偏左上一点，落成一条 placement ——
  await dragFromTo(page, userThumb, cbox.x + cbox.width * 0.42, cbox.y + cbox.height * 0.38);
  const placement = itemLocator(page, userItemId!);
  await expect(placement).toHaveCount(1);
  await expect(page.getByTestId('placement')).toHaveCount(1);
  await expect(placement).toHaveAttribute('data-item-id', userItemId!);

  // 落位只经 transform（不重排）：inline style 是 translate + z-index，不含 left/top。
  const dropStyle = (await placement.getAttribute('style')) ?? '';
  expect(dropStyle).toContain('translate(');
  expect(dropStyle).not.toContain('left');
  expect(dropStyle).not.toContain('top');

  // 用户件确实渲出真实图（不是空占位）：canvas 节点带真实 src、已加载。
  const node = placement.locator('.stage__node');
  await expect(node).toHaveJSProperty('complete', true);
  expect(await node.getAttribute('src')).toBeTruthy();
  expect(await node.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const dropped = await readPl(placement);

  // —— 挪位：把物件拖到画布中部（既选中又移位）——x/y 变、w/rotation 不变 ——
  //   居中而非高位：窄矮视口下上下留白最小，正中让四角手柄都稳落在画布可点区（下面手柄断言即验此）。
  await dragCenterTo(page, node, cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.5);
  const afterMove = await readPl(placement);
  expect(afterMove.x).not.toBe(dropped.x);
  expect(afterMove.y).not.toBe(dropped.y);
  expect(afterMove.w).toBe(dropped.w);
  expect(afterMove.rotation).toBe(dropped.rotation);

  // 挪位后物件保持选中：Canva 式手柄链出现（四角缩放 ×4 + 旋转 ×1）。
  await expect(page.getByTestId('handle-scale')).toHaveCount(4);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(1);

  // —— 缩放：拖右下角手柄向外 → 只放大 w，x/y/rotation 不变 ——
  await dragBy(page, page.locator('[data-testid="handle-scale"][data-corner="br"]'), 40, 30);
  const afterScale = await readPl(placement);
  expect(afterScale.w, '角手柄向外拖应放大 w').toBeGreaterThan(afterMove.w);
  expect(afterScale.x).toBe(afterMove.x);
  expect(afterScale.y).toBe(afterMove.y);
  expect(afterScale.rotation).toBe(afterMove.rotation);
  await assertNoHorizontalOverflow(page, vp.label);

  // 变换后的落位——留作刷新持久化逐字段核对的基线。
  const placedState = await readPl(placement);

  // ============================================================
  // ④ 写故事：给该上传物件写故事，保存后全量落 LocalStorage（schema v4）
  // ============================================================
  await writeStory(page, userItemId!, STORY);
  // 等最终状态落盘完成（saveState 异步：要把图片二进制搬进 IndexedDB）：user 件故事 + 摆放 + 图片引用均已写入。
  await expect
    .poll(async () =>
      page.evaluate(
        ({ k, id }) => {
          const s = JSON.parse(localStorage.getItem(k) || 'null');
          const it = (s?.items ?? []).find((i: { id: string }) => i.id === id);
          const plCount = (s?.placements ?? []).filter((p: { itemId: string }) => p.itemId === id).length;
          return {
            story: it?.story ?? null,
            imageRef: it?.imageRef ?? null,
            plCount,
            schemaVersion: s?.schemaVersion ?? null,
          };
        },
        { k: STORAGE_KEY, id: userItemId },
      ),
    )
    .toEqual({ story: STORY, imageRef: expect.stringContaining('img-'), plCount: 1, schemaVersion: 4 });

  // ============================================================
  // ⑤ 刷新还原：物件 / 摆放(x,y,w,rotation,z) / 故事全在，用户件图片经 IndexedDB hydrate 回填
  // ============================================================
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();

  // 物件全在：dock 仍 15 件、user 件在、名字还原、配额仍 1/50。
  await ensureDockOpen(page);
  await expect(page.getByTestId('tray-item')).toHaveCount(15);
  await expect(page.getByTestId('upload-quota')).toHaveText('已传 1/50');
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${userItemId}"] [data-testid="item-name"]`),
  ).toHaveText(ITEM_NAME);
  // dock 缩略图经 hydrate 回填成 object URL（blob:）。
  const restoredThumb = page.locator(
    `[data-testid="tray-item"][data-item-id="${userItemId}"] img.itm`,
  );
  await expect.poll(async () => (await restoredThumb.getAttribute('src')) ?? '').toContain('blob:');

  // 摆放全在：placement 逐字段还原（唯一场景「客厅」为激活场景，无需切换）。
  const restored = itemLocator(page, userItemId!);
  await expect(restored).toHaveCount(1);
  expect(await readPl(restored)).toEqual(placedState);

  // 图片全在：canvas 节点经 hydrate 回填真实图（object URL），已加载、有自然尺寸。
  const restoredNode = restored.locator('.stage__node');
  await expect.poll(async () => (await restoredNode.getAttribute('src')) ?? '').toContain('blob:');
  await expect(restoredNode).toHaveJSProperty('complete', true);
  expect(
    await restoredNode.evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);

  // 故事全在：编辑弹窗读回文本为 STORY。
  expect(await readStoryViaEditor(page, userItemId!)).toBe(STORY);
  await assertNoHorizontalOverflow(page, vp.label);

  // ============================================================
  // ⑥ 切游客看故事：切游客模式点该物件，只读弹「故事 + 原图」，无任何编辑入口
  // ============================================================
  await page.getByTestId('mode-guest').click();
  // E1-S2·游客不可逆守卫：切到 guest 后「模式开关」整组按钮整体不再渲染（从 DOM 消失，非 disabled/隐藏）——
  //   旧写法断言刚点击的 mode-guest 自身 aria-pressed，但该按钮已随切换消失、断言前提被推翻。改为断言
  //   两枚模式按钮均已不存在，即已确认切到 guest（无按钮可切回编辑）；下方只读看故事+原图的业务意图不变。
  await expect(page.getByTestId('mode-guest')).toHaveCount(0);
  await expect(page.getByTestId('mode-edit')).toHaveCount(0);
  await expect(page.getByTestId('story-modal')).toHaveCount(0); // 切模式即关任何弹窗
  await expect(page.getByTestId('tray')).toHaveCount(0); // dock 整体不渲染（无上传/删除/重命名入口）

  // 点物件 → 只读故事弹窗（游客态）。
  await itemLocator(page, userItemId!).locator('.stage__node').click();
  const guestModal = page.getByTestId('story-modal');
  await expect(guestModal).toBeVisible();
  await expect(guestModal).toHaveAttribute('data-item-id', userItemId!);
  await expect(guestModal).toHaveAttribute('data-mode', 'guest');

  // 看到刚写的故事 + 物件原图（原图经 hydrate 为 object URL）。
  await expect(guestModal.getByText('它的故事')).toBeVisible();
  await expect(page.getByTestId('story-body')).toHaveText(STORY);
  const photo = page.getByTestId('story-photo');
  await expect(photo).toBeVisible();
  await expect.poll(async () => (await photo.getAttribute('src')) ?? '').toContain('blob:');
  await expect(photo).toHaveJSProperty('complete', true);
  expect(await photo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // 游客只读：无输入 / 保存 / 取消，无选中态手柄与选框（点物件只弹故事+原图、改不动数据）。
  await expect(page.getByTestId('story-input')).toHaveCount(0);
  await expect(page.getByTestId('story-save')).toHaveCount(0);
  await expect(page.getByTestId('story-cancel')).toHaveCount(0);
  await expect(page.getByTestId('handle-scale')).toHaveCount(0);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(0);
  await expect(page.locator('.stage__frame')).toHaveCount(0);

  await page.getByTestId('story-close').click();
  await expect(guestModal).toHaveCount(0);
  await assertNoHorizontalOverflow(page, vp.label);

  // —— 贯穿全程：无未捕获运行时错误 / 未处理拒绝 / console error ——
  await assertNoRuntimeErrors(page, sink);
}

// —— 双视口逐一跑通同一条主链路（milestones.json U4 criteria「在 PC 与横屏手机视口下均跑通」）——
for (const vp of VIEWPORTS) {
  test(`U4 全流程主链路 @${vp.label}：传照片(选图→预览→确认入库→已传1/50)→建场景→拖入摆放/挪位/缩放→写故事→刷新全还原→切游客只读看故事+原图`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await runFullChain(page, vp);
  });
}
