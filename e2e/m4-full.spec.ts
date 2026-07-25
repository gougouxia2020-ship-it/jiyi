import { test, expect, type Page, type Locator, type ConsoleMessage } from '@playwright/test';

// 念念 · 陈列室 —— M4 收口 · 全流程 e2e（M4-S2，三视口）。
//
// 本 spec 把 M1/M2/M3 各自验过的功能点「串成一条完整主链路」，端到端跑通 success.json 六条
// 成功条件对应的主链路，且在 PC / 768px / 375px（横屏手机代表视口）三视口各自完整跑一遍：
//   ① 主流程闭环：从零建场景 → 摆上至少一件物件 → 写故事 → 切游客模式点开看到故事+原图，全程不报错。
//   ② 拖动/缩放/旋转：对物件做拖动改位、角手柄缩放、顶部手柄旋转，各字段按预期变化（顺滑手感是
//      manual 项，此处验其功能骨架不报错、值确有变化）。
//   ③ 多场景 + 背景不可重复上限 3：建满 3 个场景、每个用不同背景；picker 从不列已用背景；
//      用满后新建被阻止（add-scene 置灰 + “素材已用完”）。
//   ④ 数据持久化：变换后的布局 + 故事，刷新后完整还原。
//   ⑤ 故事挂物件、跨场景同步：同一物件摆进两个场景，一处改故事、另一处（含反向）同步。
//   ⑥ 双端可用：以上完整流程在 PC / 768px / 375px 三视口分别跑通、各自无横向溢出、无 console
//      未捕获错误/未处理拒绝。
//
// 贯穿全程的运行时守卫：无未捕获运行时错误（pageerror）、无未处理的 Promise 拒绝、无 console error
// （资源 404 之类网络失败按验收原文口径「未捕获错误/Promise 拒绝」排除）。
//
// —— 视口选取（对齐 milestones.json M4 criteria 原文「PC / 768px / 375px 三视口」+ 本 sprint goal
//    「375px（横屏手机代表视口）」）——
//   · PC：沿用 playwright.config.ts 的 chromium 项目默认（Desktop Chrome，1280×720），与 M4-S1 一致。
//   · 768px：768×1024——刚好落在 design.md 响应式断点「窄屏 ≤880px」内、贴近断点上沿的中间态。
//   · 375px（横屏手机代表视口）：667×375——横屏（宽>高），短边 375 对齐该数字标签；这也是
//     M2-S2 手动验证「横屏手机」时确立的取数惯例（用设备识别号做短边，如彼时的 844×390），
//     与 design.md「PC + 横屏手机」的双端支持范围直接对应（而非再验一次未支持的竖屏手机）。

// —— 运行时错误守卫 ——

interface ErrorSink {
  pageErrors: string[];
  consoleErrors: string[];
}

async function attachErrorGuards(page: Page): Promise<ErrorSink> {
  const sink: ErrorSink = { pageErrors: [], consoleErrors: [] };
  // 未处理的 Promise 拒绝：页面内挂监听收集，测试末尾读回核对。addInitScript 在每次导航（含 reload）后重跑。
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

async function assertNoHorizontalOverflow(page: Page, viewportLabel: string) {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  // 容 1px 亚像素误差。
  expect(m.scrollW, `${viewportLabel} 视口下页面不应横向溢出`).toBeLessThanOrEqual(m.clientW + 1);
}

// —— 通用操作 ——

async function freshApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
}

async function openPicker(page: Page) {
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
}

async function createScene(page: Page, bgName: string) {
  await openPicker(page);
  await page.getByTestId('bg-option').filter({ hasText: bgName }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip').filter({ hasText: bgName })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

function itemLocator(page: Page, itemId: string): Locator {
  return page.locator(`.stage__item[data-item-id="${itemId}"]`);
}

/** 若 dock 收合则展开（N2 起窄屏 <880px 默认收合成把手，宽屏兜底）。 */
async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

/** 点选放入（默认网格位）：点抽屉第 index 件缩略卡，在当前场景建一条 placement，返回其 itemId。 */
async function placeItemByClick(page: Page, index: number): Promise<string> {
  await ensureDockOpen(page);
  const tray = page.getByTestId('tray-item').nth(index);
  const itemId = await tray.getAttribute('data-item-id');
  expect(itemId).toBeTruthy();
  const before = await page.getByTestId('placement').count();
  await tray.click();
  await expect(page.getByTestId('placement')).toHaveCount(before + 1);
  return itemId!;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 取元素真实渲染坐标，供后续 `page.mouse.*` 系列原始指针操作使用。
 *
 * 先 `scrollIntoViewIfNeeded`：窄屏（如 375px 横屏手机代表视口）下页面纵向总高常超出视口高度，
 * 元素可能落在初始折叠线以下——`page.mouse` 是按视口坐标派发的原始事件，不像 `locator.click()`
 * 那样自带滚动步骤，若不先把元素滚入视口，得到的坐标点在浏览器里根本点不到东西（同真实用户
 * 在短视口下需要先滚动到位）。三视口共用同一套手势 helper，PC/768px 下元素本就在视口内，
 * `scrollIntoViewIfNeeded` 是无操作的空调用，不影响既有行为。
 */
async function boxOf(loc: Locator): Promise<Box> {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  expect(b, 'boundingBox 不应为空（元素须可见）').not.toBeNull();
  return b!;
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

/** 真实拖拽：把元素中心拖到视口坐标 (tx, ty)（既选中又移位）。 */
async function dragCenterTo(page: Page, loc: Locator, tx: number, ty: number) {
  const b = await boxOf(loc);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 14 });
  await page.mouse.up();
}

interface PlacementData {
  x: number;
  y: number;
  w: number;
  rotation: number;
  z: number;
}

async function readPlacement(loc: Locator): Promise<PlacementData> {
  return {
    x: Number(await loc.getAttribute('data-x')),
    y: Number(await loc.getAttribute('data-y')),
    w: Number(await loc.getAttribute('data-w')),
    rotation: Number(await loc.getAttribute('data-rotation')),
    z: Number(await loc.getAttribute('data-z')),
  };
}

/**
 * 隐藏界面包裹一段故事操作（N2 满屏后的浮层规避）。
 *
 * 报头/品牌章/场景条/dock 都是浮在画布之上的浮层，而选中态的故事工具条「悬于选框上方」属画布内元素——
 *  高位物件（如默认网格位 y≈24%）或窄矮视口下，工具条会被顶部报头等浮层盖住而不可点。用应用自带的
 *  「隐藏界面」（眼睛钮·.eye-keeper）一键收起全部浮层：整段故事操作（选中→点手柄→读/写→关弹窗）期间
 *  浮层都不挡道；操作完（弹窗已关、眼睛可点）再恢复界面。位置无关、三视口通吃，不改任何摆放数据。
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

let sink: ErrorSink;

test.beforeEach(async ({ page }) => {
  sink = await attachErrorGuards(page);
  await freshApp(page);
});

/** 三视口共用的完整主链路：见文件头注释①~⑥。 */
async function runFullJourney(page: Page, viewportLabel: string) {
  const S1 = '这是奶奶留下的那张全家福，1987 年春节拍的。';
  const S2 = '后来在书房里，我把它的故事改写得更完整了一些。';

  // 起点：无场景、空态。
  await expect(page.getByTestId('scene-chip')).toHaveCount(0);
  await expect(page.getByTestId('canvas')).toBeVisible();
  await assertNoHorizontalOverflow(page, viewportLabel);

  // —— ① 建场景 客厅 ——
  await createScene(page, '客厅');

  // —— 摆上至少一件物件（先放物件、再取画布坐标：placeItemByClick 走 locator.click()，
  // 会按需把抽屉滚入视口；若先取画布坐标、后放物件，窄屏下这一步的滚动会让先取的坐标失效）——
  const itemId = await placeItemByClick(page, 0);
  const placement = itemLocator(page, itemId);
  await expect(placement).toHaveCount(1);
  const initial = await readPlacement(placement); // 默认网格位（场景图坐标系百分比 x/y，宽度 w=12）

  // —— ② 拖动改位 → 角手柄缩放 → 顶部手柄旋转（功能骨架，值确有变化）——
  // 画布坐标在这里取（紧邻拖动前，之间不再穿插会引发滚动的 .click()），三视口下坐标与
  // 随后 dragCenterTo/dragBy 内部的 scrollIntoViewIfNeeded 落在同一滚动位置，互不打架。
  const canvas = page.getByTestId('canvas');
  const cbox = await boxOf(canvas);

  // 先把物件拖到画布正中（既选中又移位，且让四角缩放手柄与底部旋转圆钮都留在画布可点区内——窄矮
  // 视口下上下留白最小，正中是手柄命中最稳的位置；下面的手柄断言即验此）。变换全部在此完成。
  await dragCenterTo(page, placement.locator('.stage__node'), cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.5);
  const afterMove = await readPlacement(placement);
  expect(afterMove.x).not.toBe(initial.x);
  expect(afterMove.y).not.toBe(initial.y);
  expect(afterMove.w).toBe(initial.w);
  expect(afterMove.rotation).toBe(initial.rotation);

  // 选中态手柄链出现（缩放 ×4 + 旋转 ×1）。
  await expect(page.getByTestId('handle-scale')).toHaveCount(4);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(1);

  // 角手柄缩放（右下角向外拖 → 放大），只改 scale。
  // 拖动幅度刻意收敛（相较 M4-S1 的 44,36）：窄屏（≤880px）下画布压低至 min-height:340px、
  // 单列布局把抽屉堆在画布上方——若放大幅度过猛，顶部旋转手柄会被推出画布可点区、上移到
  // 抽屉所在屏幕区域，命中测试会打在 .tray 上而非旋转手柄（已用 elementFromPoint 实测验证）。
  // 收窄到 16,12（PC headroom 更宽裕，同样安全）后，三视口下手柄命中区都稳定落在画布内。
  await dragBy(page, page.locator('[data-testid="handle-scale"][data-corner="br"]'), 16, 12);
  const afterScale = await readPlacement(placement);
  expect(afterScale.w).toBeGreaterThan(afterMove.w); // 缩放折算成宽度 w（取代旧 scale 倍率）
  expect(afterScale.x).toBe(afterMove.x);
  expect(afterScale.y).toBe(afterMove.y);
  expect(afterScale.rotation).toBe(afterMove.rotation);

  // 顶部手柄旋转，只改 rotation（幅度收敛原因同上）。
  await dragBy(page, page.getByTestId('handle-rotate'), 22, 6);
  const transformed = await readPlacement(placement);
  expect(transformed.rotation).not.toBe(afterScale.rotation);
  expect(transformed.x).toBe(afterScale.x);
  expect(transformed.y).toBe(afterScale.y);
  expect(transformed.w).toBe(afterScale.w);

  // —— ③ 写故事 ——
  await writeStory(page, itemId, S1);
  // 保存即全量落 LocalStorage：故事挂 Item 本身。
  const persisted = await page.evaluate((id) => {
    const raw = localStorage.getItem('memories.gallery');
    if (!raw) return null;
    const s = JSON.parse(raw);
    const it = (s.items ?? []).find((i: { id: string }) => i.id === id);
    return { story: it?.story ?? null, schemaVersion: s.schemaVersion };
  }, itemId);
  expect(persisted?.story).toBe(S1);
  expect(persisted?.schemaVersion).toBe(4); // schema v4（U1-S2：照片二进制迁 IndexedDB、状态树只存引用；故事结构不变）

  // —— ④ 切游客模式 → 点物件只弹「故事 + 原图」（只读）——
  await page.getByTestId('mode-guest').click();
  // E1-S2·游客不可逆守卫：切到 guest 后「模式开关」整组按钮整体不再渲染（从 DOM 消失，非 disabled/隐藏）——
  //   旧写法断言刚点击的 mode-guest 自身 aria-pressed，但该按钮已随切换消失、断言前提被推翻。改为断言
  //   两枚模式按钮均已不存在，即已确认切到 guest（无按钮可切回编辑）。
  await expect(page.getByTestId('mode-guest')).toHaveCount(0);
  await expect(page.getByTestId('mode-edit')).toHaveCount(0);
  await expect(page.getByTestId('story-modal')).toHaveCount(0); // 切模式即关任何弹窗

  await placement.locator('.stage__node').click();
  const guestModal = page.getByTestId('story-modal');
  await expect(guestModal).toBeVisible();
  await expect(guestModal).toHaveAttribute('data-item-id', itemId);
  await expect(guestModal).toHaveAttribute('data-mode', 'guest');
  await expect(page.getByTestId('story-body')).toHaveText(S1); // 看到刚写的故事
  const photo = page.getByTestId('story-photo');
  await expect(photo).toBeVisible();
  expect(await photo.getAttribute('src')).toBeTruthy(); // 看到物件原图
  // 游客只读：无输入/保存/手柄。
  await expect(page.getByTestId('story-input')).toHaveCount(0);
  await expect(page.getByTestId('story-save')).toHaveCount(0);
  await expect(page.getByTestId('handle-scale')).toHaveCount(0);
  await page.getByTestId('story-close').click();
  await expect(guestModal).toHaveCount(0);

  // 回编辑模式，继续搭多场景。E1-S2·游客不可逆守卫下模式开关整组在 guest 已不渲染、界面上无按钮可切回，
  //   唯一退出路径是 ?edit URL 后门（App 顶层初始化器识别后启动即强制 edit）。故改走该后门回编辑；此前状态
  //   已全量落盘，reload 后场景/物件/故事逐字段还原，下文继续搭多场景不受影响。回到编辑模式后模式开关整组
  //   重新渲染，mode-edit 恒为激活态——沿用它确认已回到编辑模式。
  await page.goto('/?edit');
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('mode-edit')).toHaveAttribute('aria-pressed', 'true');

  // —— ⑤ 多场景 + 背景不可重复：建「书房」（picker 不再列已用的「客厅」）——
  await openPicker(page);
  await expect(page.getByTestId('bg-option')).toHaveCount(2); // 客厅已用，只剩 书房 / 卧室
  await expect(page.getByTestId('bg-option').filter({ hasText: '客厅' })).toHaveCount(0);
  await page.getByTestId('bg-option').filter({ hasText: '书房' }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip').filter({ hasText: '书房' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('placement')).toHaveCount(0); // 新场景空

  // —— 同一物件摆进「书房」→ 读到的故事应是「客厅」写的 S1（故事跨场景同步）——
  const itemIdInStudy = await placeItemByClick(page, 0);
  expect(itemIdInStudy).toBe(itemId); // 同一件物件
  expect(await readStoryViaEditor(page, itemId)).toBe(S1);

  // —— 在「书房」把故事改成 S2 ——
  await writeStory(page, itemId, S2);

  // —— 切回「客厅」→ 同一物件故事已反向同步为 S2 ——
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  await expect(page.getByTestId('scene-chip').filter({ hasText: '客厅' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await readStoryViaEditor(page, itemId)).toBe(S2);

  // —— 建第 3 个场景「卧室」（picker 只剩 1 张，且互不重复）——
  await openPicker(page);
  await expect(page.getByTestId('bg-option')).toHaveCount(1);
  await expect(page.getByTestId('bg-option').filter({ hasText: '卧室' })).toBeVisible();
  await page.getByTestId('bg-option').filter({ hasText: '卧室' }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);

  // 3 个场景到顶、三者背景互不相同。
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  const names = await page.getByTestId('scene-chip').allInnerTexts();
  expect(new Set(names)).toEqual(new Set(['客厅', '书房', '卧室']));

  // 第 4 个被阻止：＋新场景 置灰、常驻“素材已用完”、picker 打不开。
  await expect(page.getByTestId('add-scene')).toBeDisabled();
  await expect(page.getByTestId('scenes-exhausted')).toBeVisible();
  await expect(page.getByTestId('scenes-exhausted')).toHaveText('素材已用完');
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);

  await assertNoHorizontalOverflow(page, viewportLabel);

  // —— ⑥ 刷新持久化还原：场景列表 + 变换后的布局 + 故事 全部完好 ——
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();

  // 场景列表完整还原。
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  const namesAfter = await page.getByTestId('scene-chip').allInnerTexts();
  expect(new Set(namesAfter)).toEqual(new Set(['客厅', '书房', '卧室']));

  // 切到「客厅」→ 变换后的 placement(x,y,scale,rotation,z) 逐字段还原。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  const restored = itemLocator(page, itemId);
  await expect(restored).toHaveCount(1);
  const restoredData = await readPlacement(restored);
  expect(restoredData.x).toBe(transformed.x);
  expect(restoredData.y).toBe(transformed.y);
  expect(restoredData.w).toBe(transformed.w);
  expect(restoredData.rotation).toBe(transformed.rotation);
  expect(restoredData.z).toBe(transformed.z);

  // 故事在两个场景都还原为最新的 S2（无丢失、无新旧不一致）。
  expect(await readStoryViaEditor(page, itemId)).toBe(S2);
  await page.getByTestId('scene-chip').filter({ hasText: '书房' }).click();
  expect(await readStoryViaEditor(page, itemId)).toBe(S2);

  await assertNoHorizontalOverflow(page, viewportLabel);

  // —— 贯穿全程：无未捕获运行时错误 / 未处理拒绝 / console error ——
  await assertNoRuntimeErrors(page, sink);
}

// —— 三视口逐一跑通同一条主链路（milestones.json M4 criteria「在 PC / 768px / 375px 三视口跑通」）——

interface ViewportSpec {
  label: string;
  /** null = 沿用 playwright.config.ts 的 chromium 项目默认（Desktop Chrome，PC）。 */
  size: { width: number; height: number } | null;
}

const VIEWPORTS: ViewportSpec[] = [
  { label: 'PC', size: null },
  { label: '768px', size: { width: 768, height: 1024 } },
  { label: '375px（横屏手机代表视口）', size: { width: 667, height: 375 } },
];

for (const vp of VIEWPORTS) {
  test.describe(`视口 ${vp.label}`, () => {
    if (vp.size) {
      test.use({ viewport: vp.size });
    }

    test(`全流程主链路（${vp.label}）：建场景→摆物件→变换→写故事→游客看故事+原图→多场景上限3→跨场景同步→刷新还原`, async ({
      page,
    }) => {
      await runFullJourney(page, vp.label);
    });
  });
}
