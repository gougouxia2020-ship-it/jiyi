import { test, expect, type Page, type Locator, type ConsoleMessage } from '@playwright/test';

// 念念 · 陈列室 —— N4 收口 · 全流程主链路 e2e（N4-S2，双视口）。
//
// 把 M/N 各里程碑各自精测过的功能点「串成一条端到端主链路」，在 **PC（1920×1080）与横屏手机
// （844×390）双视口** 各自端到端跑通 success.json 全部 9 条成功条件对应的主链路；两个视口下都断言
// 无横向溢出、无 console 未捕获错误 / 未处理 Promise 拒绝。窄屏另核验故事弹窗贴底近满宽、UI 标签
// 字号不低于 token 下限（工艺底线）。
//
// —— 9 条成功条件 ↔ 本链路覆盖点 ——
//   ① 主流程闭环：建场景 → dock 摆物件 → 写故事 → 切游客模式点开，看到刚写的故事 + 物件原图，不报错。
//   ⑥ 浮层让路：dock 拖出 / 画布挪动过程中全部浮层淡出且不接指针，物件可落到浮层平时覆盖处（画面最顶部）。
//   ⑦ 持久化 + 故事同步：摆放（场景图坐标系百分比 x/y/w/rotation/z）与故事刷新完好还原；
//      同一物件摆进两个场景，一处改故事、另一处（含反向）同步为最新值。
//   ⑧ 管理与命名：场景重命名与删除（删除释放该背景配额、可再建）；物件重命名（挂 Item、跨场景同步）；
//      陈列室名就地编辑；以上改动刷新后保留。
//   ⑨ 场景约束 + 双端可用：最多 3 个场景、背景不可重复、用满后新建被阻止（第 4 个），刷新后仍成立；
//      PC 与横屏手机都能完整走通同一条链路、布局不错乱。
//
// 说明：浮层让路/手柄顺滑/素材贴合的像素级细节已由 N1/N2/N3 各自 e2e 精测，本 sprint 主链路
//   串联「带过」即可（验其功能骨架成立、不报错），不在此重复精测。

interface Viewport {
  width: number;
  height: number;
  label: string;
  /** ≤880px 窄屏（横屏手机口径）：dock 默认收合、故事弹窗贴底近满宽。 */
  narrow: boolean;
}

const VP_PC: Viewport = { width: 1920, height: 1080, label: 'PC1920', narrow: false };
// 横屏手机代表视口（宽>高、<880 → dock 默认收合、故事弹窗贴底近满宽），与 N2/N3 取数惯例一致。
const VP_PHONE: Viewport = { width: 844, height: 390, label: 'phone844×390', narrow: true };

// —— 运行时错误守卫（沿用 M4 收口 spec 的口径）——
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
  expect(m.scrollW, `${label} 视口下页面不应横向溢出`).toBeLessThanOrEqual(m.clientW + 1);
}

/**
 * 工艺底线（design.md v2 / tokens.css v2）：UI 标签 / 分区标题字号不得低于 --text-label-min（11px）。
 * 逐一核验常驻标签的实际计算字号——demo 里 9.5px 被老板判太小，本 sprint 终验拿它当尺。
 */
async function assertLabelFloor(page: Page, label: string) {
  const sizes = await page.evaluate(() => {
    // 品牌章小标、dock 分区标题、场景条分区标签——三处常驻 UI 标签。
    const selectors = ['.brand small', '.dock-head', '.scenes .lbl'];
    return selectors.map((s) => {
      const el = document.querySelector(s);
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });
  });
  const measured = sizes.filter((px): px is number => px != null);
  expect(measured.length, `${label} 应能量到 UI 标签字号`).toBeGreaterThan(0);
  for (const px of measured) {
    expect(px, `${label} UI 标签/分区标题字号应 ≥ 11px（工艺底线）`).toBeGreaterThanOrEqual(11);
  }
}

// —— 通用操作 ——
async function freshApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
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

/** 若 dock 收合则展开（窄屏默认收合，宽屏兜底）。 */
async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

/** 点选放入（默认网格位）：点抽屉第 index 件缩略卡，在当前场景建一条 placement，返回其 itemId。 */
async function placeItemByClick(page: Page, index = 0): Promise<string> {
  await ensureDockOpen(page);
  const thumb = page.getByTestId('tray-item').nth(index);
  const itemId = await thumb.getAttribute('data-item-id');
  expect(itemId).toBeTruthy();
  const before = await page.getByTestId('placement').count();
  await thumb.click();
  await expect(page.getByTestId('placement')).toHaveCount(before + 1);
  return itemId!;
}

function itemLocator(page: Page, itemId: string): Locator {
  return page.locator(`.stage__item[data-item-id="${itemId}"]`);
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
async function centerOf(loc: Locator): Promise<{ x: number; y: number }> {
  const b = await boxOf(loc);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/**
 * 在物件当前**可见部分**内取一个稳妥抓取点：水平取本体中心、垂直取可见区间中点。
 * 物件被拖到画面最顶部（部分露在视口外）后，其真实中心可能落在视口上缘之外——固定偏移会抓空；
 * 取可见区间中点保证抓取点始终落在物件本体上，PC 与横屏手机（矮视口）通吃。
 */
async function visibleGrabPoint(loc: Locator, vp: Viewport): Promise<{ x: number; y: number }> {
  const b = await boxOf(loc);
  const visTop = Math.max(b.y, 4);
  const visBottom = Math.min(b.y + b.height, vp.height - 4);
  return { x: b.x + b.width / 2, y: (visTop + visBottom) / 2 };
}

interface PlacementData {
  x: number;
  y: number;
  w: number;
  rotation: number;
  z: number;
}
/** 读某 placement 存储的 (x,y,w,rotation,z)——data-* 即存储原值（schema v3 用 w，不再有 scale）。 */
async function readPl(loc: Locator): Promise<PlacementData> {
  return {
    x: Number(await loc.getAttribute('data-x')),
    y: Number(await loc.getAttribute('data-y')),
    w: Number(await loc.getAttribute('data-w')),
    rotation: Number(await loc.getAttribute('data-rotation')),
    z: Number(await loc.getAttribute('data-z')),
  };
}
async function readPct(loc: Locator): Promise<{ x: number; y: number }> {
  return {
    x: Number(await loc.getAttribute('data-x')),
    y: Number(await loc.getAttribute('data-y')),
  };
}

// —— 故事编辑（对齐 M3/N3 交互）——
/** 编辑模式：选中物件的 placement → 点「✎ 故事」手柄 → 打开可编辑弹窗。 */
async function openStoryEditor(page: Page, itemId: string) {
  const item = itemLocator(page, itemId);
  await expect(item).toHaveCount(1);
  await item.locator('.stage__node').click(); // 选中 → 手柄/工具条出现
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
  await openStoryEditor(page, itemId);
  await page.getByTestId('story-input').fill(text);
  await page.getByTestId('story-save').click();
  await expect(page.getByTestId('story-modal')).toHaveCount(0);
}

/** 编辑模式：打开弹窗读回当前故事文本（不改动）→ 关闭。 */
async function readStoryViaEditor(page: Page, itemId: string): Promise<string> {
  await openStoryEditor(page, itemId);
  const value = await page.getByTestId('story-input').inputValue();
  await page.getByTestId('story-close').click();
  await expect(page.getByTestId('story-modal')).toHaveCount(0);
  return value;
}

/** 编辑模式：打开弹窗读回弹窗标题里的物件名（验物件重命名跨场景同步）→ 关闭。 */
async function itemNameViaStory(page: Page, itemId: string): Promise<string> {
  await openStoryEditor(page, itemId);
  const modal = page.getByTestId('story-modal');
  const name = (await modal.locator('.story__name').textContent())?.trim() ?? '';
  await page.getByTestId('story-close').click();
  await expect(modal).toHaveCount(0);
  return name;
}

// ————————————————————————————————————————————————————————————————
// N4 全流程主链路：一条端到端流程串起 9 条成功条件；PC 与横屏手机各跑一遍
// ————————————————————————————————————————————————————————————————
async function runMainFlow(page: Page, vp: Viewport) {
  const S1 = '这是奶奶留下的那张全家福，1987 年春节拍的。';
  const S2 = '后来在书房里，我把它的故事改写得更完整了一些。';
  const NEW_ITEM_NAME = '爷爷的相机';
  const NEW_GALLERY_NAME = '时光陈列室';

  // 起点：无场景、空态、无横向溢出。
  await expect(page.getByTestId('scene-chip')).toHaveCount(0);
  await expect(page.getByTestId('canvas')).toBeVisible();
  await assertNoHorizontalOverflow(page, vp.label);

  // ============================================================
  // ① 建场景「客厅」+ ⑥ 浮层让路（dock 拖出）：dock 拖出物件落进画布
  // ============================================================
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  const itemId = await page.getByTestId('tray-item').nth(0).getAttribute('data-item-id');
  expect(itemId).toBeTruthy();

  // dock 拖出 —— 拖动中断言让路铁律：.app.is-dragging、dock 不接指针、跟手幽灵可见；松手落成一条 placement。
  {
    const thumb = page.getByTestId('tray-item').nth(0);
    const start = await centerOf(thumb);
    const dropX = vp.width * 0.5;
    const dropY = vp.height * 0.5;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 24, { steps: 6 }); // 越过拖拽阈值
    await expect
      .poll(() => page.evaluate(() => document.querySelector('.app')!.classList.contains('is-dragging')))
      .toBe(true);
    await expect(page.getByTestId('drag-ghost')).toBeVisible();
    const dockPe = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-testid="tray"]') as HTMLElement).pointerEvents,
    );
    expect(dockPe, 'dock 拖动中不接指针').toBe('none');
    await page.mouse.move(dropX, dropY, { steps: 14 });
    await page.mouse.up();
  }

  const placement = page.getByTestId('placement');
  await expect(placement).toHaveCount(1);
  await expect(placement).toHaveAttribute('data-item-id', itemId!);

  // 落位只经 transform（不重排）：inline style 是 translate + z-index，不含 left/top。
  const dropStyle = (await placement.getAttribute('style')) ?? '';
  expect(dropStyle).toContain('translate(');
  expect(dropStyle).not.toContain('left');
  expect(dropStyle).not.toContain('top');
  // 存储的坐标是场景图坐标系百分比（常规落点 0–100）。
  const dropped = await readPl(placement);
  expect(dropped.x).toBeGreaterThanOrEqual(0);
  expect(dropped.x).toBeLessThanOrEqual(100);
  expect(dropped.y).toBeGreaterThanOrEqual(0);
  expect(dropped.y).toBeLessThanOrEqual(100);

  // ============================================================
  // ⑥ 浮层让路（画布挪动）：把物件拖到画面最顶部（品牌章/模式开关平时覆盖处）
  // ============================================================
  {
    const node = placement.locator('.stage__node');
    const start = await centerOf(node);
    const topX = vp.width / 2;
    const topY = 6;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(topX, topY, { steps: 16 });

    await expect
      .poll(() => page.evaluate(() => document.querySelector('.app')!.classList.contains('is-dragging')))
      .toBe(true);
    // 品牌章（顶部浮层）淡出且不接指针，指针命中不落在品牌章内（浮层让路、物件可落到其覆盖处）。
    const midDrag = await page.evaluate(() => {
      const brand = document.querySelector('[data-testid="brand"]') as HTMLElement;
      const cs = getComputedStyle(brand);
      const r = brand.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { pe: cs.pointerEvents, opacity: parseFloat(cs.opacity), hitInsideBrand: !!hit && brand.contains(hit) };
    });
    expect(midDrag.pe).toBe('none');
    expect(midDrag.opacity).toBeLessThan(0.2);
    expect(midDrag.hitInsideBrand).toBe(false);

    await page.mouse.up();

    // 物件落到了最顶部（浮层常驻区）：存储 y 很小。
    const pct = await readPct(placement);
    expect(pct.y, '物件应能落到画面最顶部（浮层平时覆盖处）').toBeLessThan(10);

    // 松手后浮层浮回：品牌章恢复可接指针、is-dragging 摘除。
    const restored = await page.evaluate(() => ({
      pe: getComputedStyle(document.querySelector('[data-testid="brand"]') as HTMLElement).pointerEvents,
      dragging: document.querySelector('.app')!.classList.contains('is-dragging'),
    }));
    expect(restored.pe).toBe('auto');
    expect(restored.dragging).toBe(false);
  }

  // 复位到画布中部：故事工具条悬于选框上方（.stage__toolbar bottom:100%），物件贴顶时工具条会溢出
  // 视口顶边不可点——把物件挪回中部，让后续「写故事」的工具条完整落在视口内可点（属主链路自然一步）。
  // 抓取点取物件**可见部分**的中点（矮视口下物件贴顶后部分露出视口外，固定偏移会抓空）。
  {
    const g = await visibleGrabPoint(placement.locator('.stage__node'), vp);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2, vp.height * 0.5, { steps: 16 });
    await page.mouse.up();
    const midPct = await readPct(placement);
    expect(midPct.y, '已复位到画布中部（工具条不再溢出顶边）').toBeGreaterThan(20);
  }

  // 变换后的落位（含挪动改的 x/y，w/rotation/z 保持默认）——留作刷新持久化逐字段核对的基线。
  const placedState = await readPl(placement);

  // ============================================================
  // ③ 写故事 S1（挂 Item、全量落 LocalStorage、schema v3）
  // ============================================================
  await writeStory(page, itemId!, S1);
  const persisted = await page.evaluate((id) => {
    const raw = localStorage.getItem('memories.gallery');
    if (!raw) return null;
    const s = JSON.parse(raw);
    const it = (s.items ?? []).find((i: { id: string }) => i.id === id);
    return { story: it?.story ?? null, schemaVersion: s.schemaVersion };
  }, itemId!);
  expect(persisted?.story).toBe(S1);
  expect(persisted?.schemaVersion).toBe(4); // U1-S2 升 v4：照片二进制迁 IndexedDB、状态树只存引用

  // ============================================================
  // ① 切游客模式：点物件只弹「故事 + 原图」（只读），不出手柄、不可编辑
  // ============================================================
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
  await expect(guestModal).toHaveAttribute('data-item-id', itemId!);
  await expect(guestModal).toHaveAttribute('data-mode', 'guest');
  // 看到刚写的故事 + 物件原图。
  await expect(page.getByTestId('story-body')).toHaveText(S1);
  const photo = page.getByTestId('story-photo');
  await expect(photo).toBeVisible();
  expect(await photo.getAttribute('src')).toBeTruthy();
  await expect(guestModal.getByText('它的故事')).toBeVisible();
  // 游客只读：无输入/保存/取消、无选中态手柄与选框。
  await expect(page.getByTestId('story-input')).toHaveCount(0);
  await expect(page.getByTestId('story-save')).toHaveCount(0);
  await expect(page.getByTestId('story-cancel')).toHaveCount(0);
  await expect(page.getByTestId('handle-scale')).toHaveCount(0);
  await expect(page.getByTestId('handle-rotate')).toHaveCount(0);
  await expect(page.locator('.stage__frame')).toHaveCount(0);

  // ⑨（窄屏专属）故事弹窗贴底近满宽：横屏手机下弹窗改为贴视口底缘、左右仅留小边距（design.md v2 响应式）。
  if (vp.narrow) {
    const mb = await boxOf(guestModal);
    expect(mb.width, '窄屏故事弹窗应近满宽').toBeGreaterThan(vp.width * 0.9);
    expect(mb.y + mb.height, '窄屏故事弹窗应贴视口底缘').toBeGreaterThan(vp.height - 40);
    expect(mb.x + mb.width, '窄屏故事弹窗不应横向溢出').toBeLessThanOrEqual(vp.width + 1);
  }

  await page.getByTestId('story-close').click();
  await expect(guestModal).toHaveCount(0);

  // 回编辑模式，继续搭多场景。E1-S2·游客不可逆守卫下模式开关整组在 guest 已不渲染、界面上无按钮可切回，
  //   唯一退出路径是 ?edit URL 后门（App 顶层初始化器识别后启动即强制 edit）。故改走该后门回编辑；此前状态
  //   已全量落盘，reload 后场景/物件/故事逐字段还原，下文继续搭多场景不受影响。回到编辑模式后模式开关整组
  //   重新渲染，mode-edit 恒为激活态——沿用它确认已回到编辑模式。
  await page.goto('/?edit');
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('mode-edit')).toHaveAttribute('aria-pressed', 'true');

  // ============================================================
  // ⑦ 跨场景故事同步 + ⑨ 背景不可重复：建「书房」，摆同一物件，一处改另一处同步
  // ============================================================
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
  await expect(page.getByTestId('bg-option'), 'picker 不再列已用的「客厅」').toHaveCount(2);
  await expect(page.getByTestId('bg-option').filter({ hasText: '客厅' })).toHaveCount(0);
  await page.getByTestId('bg-option').filter({ hasText: '书房' }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip').filter({ hasText: '书房' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('placement')).toHaveCount(0); // 新场景空

  // 同一物件摆进「书房」→ 读到的故事应是「客厅」写的 S1（故事挂 Item、跨场景同步）。
  const itemIdInStudy = await placeItemByClick(page, 0);
  expect(itemIdInStudy).toBe(itemId);
  expect(await readStoryViaEditor(page, itemId!)).toBe(S1);

  // 在「书房」把故事改成 S2。
  await writeStory(page, itemId!, S2);

  // 切回「客厅」→ 同一物件故事已反向同步为 S2。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  await expect(page.getByTestId('scene-chip').filter({ hasText: '客厅' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await readStoryViaEditor(page, itemId!)).toBe(S2);

  // ============================================================
  // ⑨ 建第 3 个场景「卧室」→ 3 场景到顶、背景互不相同、第 4 个被阻止
  // ============================================================
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
  await expect(page.getByTestId('bg-option')).toHaveCount(1); // 只剩卧室
  await expect(page.getByTestId('bg-option').filter({ hasText: '卧室' })).toBeVisible();
  await page.getByTestId('bg-option').filter({ hasText: '卧室' }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);

  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  {
    const names = await page.getByTestId('scene-chip').allInnerTexts();
    expect(new Set(names)).toEqual(new Set(['客厅', '书房', '卧室']));
  }
  // 第 4 个被阻止：＋新场景 置灰、常驻「素材已用完」、picker 打不开。
  await expect(page.getByTestId('add-scene')).toBeDisabled();
  await expect(page.getByTestId('scenes-exhausted')).toBeVisible();
  await expect(page.getByTestId('scenes-exhausted')).toHaveText('素材已用完');
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await assertNoHorizontalOverflow(page, vp.label);
  // 工艺底线：满态（场景条/dock 都在）下核验 UI 标签字号不低于 token 下限。
  await assertLabelFloor(page, vp.label);

  // ============================================================
  // ⑧ 管理与命名（一）：场景重命名 + 删除（释放背景配额、可再建）
  //   —— 对「卧室」操作，避开被故事同步断言按名筛选的「客厅/书房」。
  // ============================================================
  // 卧室为当前激活场景 → 点其 chip 进入就地编辑，改名「主卧」，回车即存。
  const bedroomChip = page.getByTestId('scene-chip').filter({ hasText: '卧室' });
  await expect(bedroomChip).toHaveAttribute('aria-pressed', 'true');
  await bedroomChip.click();
  const sceneInput = page.getByTestId('scene-name-input');
  await expect(sceneInput).toBeVisible();
  await sceneInput.fill('主卧');
  await sceneInput.press('Enter');
  await expect(page.getByTestId('scene-name-input')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip').filter({ hasText: '主卧' })).toBeVisible();

  // 删除「主卧」（次级入口 × → 一句话确认）→ 释放卧室背景配额、可再建。
  await page.getByTestId('scene-delete').click();
  await expect(page.getByTestId('scene-delete-confirm-box')).toBeVisible();
  await page.getByTestId('scene-delete-confirm').click();
  await expect(page.getByTestId('scene-chip')).toHaveCount(2);
  await expect(page.getByTestId('scene-chip').filter({ hasText: '主卧' })).toHaveCount(0);

  // 配额释放：＋新场景重新可用，picker 里卧室背景回到可选池。
  await expect(page.getByTestId('add-scene')).toBeEnabled();
  await page.getByTestId('add-scene').click();
  await expect(page.getByTestId('bg-picker')).toBeVisible();
  await expect(page.getByTestId('bg-option')).toHaveCount(1);
  await expect(page.getByTestId('bg-option').filter({ hasText: '卧室' })).toBeVisible();
  // 用释放出的背景再建「卧室」→ 回到 3 个场景。
  await page.getByTestId('bg-option').filter({ hasText: '卧室' }).click();
  await expect(page.getByTestId('bg-picker')).toHaveCount(0);
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);

  // ============================================================
  // ⑧ 管理与命名（二）：物件重命名（挂 Item、跨场景同步）
  // ============================================================
  await ensureDockOpen(page);
  const nameSpan = page.locator(
    `[data-testid="tray-item"][data-item-id="${itemId}"] [data-testid="item-name"]`,
  );
  await nameSpan.click();
  const itemInput = page.getByTestId('item-name-input');
  await expect(itemInput).toBeVisible();
  await itemInput.fill(NEW_ITEM_NAME);
  await itemInput.press('Enter');
  await expect(page.getByTestId('item-name-input')).toHaveCount(0);
  await expect(nameSpan).toHaveText(NEW_ITEM_NAME);
  // 跨场景同步：客厅、书房两处摆放的故事弹窗标题都读到新名。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  expect(await itemNameViaStory(page, itemId!)).toBe(NEW_ITEM_NAME);
  await page.getByTestId('scene-chip').filter({ hasText: '书房' }).click();
  expect(await itemNameViaStory(page, itemId!)).toBe(NEW_ITEM_NAME);

  // ============================================================
  // ⑧ 管理与命名（三）：陈列室名（品牌章）就地编辑
  // ============================================================
  const brandName = page.getByTestId('gallery-name');
  await expect(brandName).toHaveText('念念 · 陈列室');
  await brandName.click();
  const galleryInput = page.getByTestId('gallery-name-input');
  await expect(galleryInput).toBeVisible();
  await galleryInput.fill(NEW_GALLERY_NAME);
  await galleryInput.press('Enter');
  await expect(page.getByTestId('gallery-name-input')).toHaveCount(0);
  await expect(page.getByTestId('gallery-name')).toHaveText(NEW_GALLERY_NAME);

  // ============================================================
  // ⑦⑧ 刷新持久化 + 跨场景故事同步全还原
  // ============================================================
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();

  // 陈列室名还原。
  await expect(page.getByTestId('gallery-name')).toHaveText(NEW_GALLERY_NAME);
  // 场景列表还原（含删除+再建后的卧室，默认名）。
  await expect(page.getByTestId('scene-chip')).toHaveCount(3);
  {
    const names = await page.getByTestId('scene-chip').allInnerTexts();
    expect(new Set(names)).toEqual(new Set(['客厅', '书房', '卧室']));
  }
  // 物件名还原（dock）。
  await ensureDockOpen(page);
  await expect(
    page.locator(`[data-testid="tray-item"][data-item-id="${itemId}"] [data-testid="item-name"]`),
  ).toHaveText(NEW_ITEM_NAME);

  // 客厅：摆放 (x,y,w,rotation,z) 逐字段还原；故事同步为最新 S2；物件名跨场景为新名。
  await page.getByTestId('scene-chip').filter({ hasText: '客厅' }).click();
  const restored = itemLocator(page, itemId!);
  await expect(restored).toHaveCount(1);
  expect(await readPl(restored)).toEqual(placedState);
  expect(await readStoryViaEditor(page, itemId!)).toBe(S2);
  expect(await itemNameViaStory(page, itemId!)).toBe(NEW_ITEM_NAME);

  // 书房：故事同步为最新 S2（另一场景），无新旧不一致。
  await page.getByTestId('scene-chip').filter({ hasText: '书房' }).click();
  expect(await readStoryViaEditor(page, itemId!)).toBe(S2);

  // ============================================================
  // ⑨ 刷新后仍成立：3 场景到顶、第 4 个被阻止
  // ============================================================
  await expect(page.getByTestId('add-scene')).toBeDisabled();
  await expect(page.getByTestId('scenes-exhausted')).toBeVisible();
  await assertNoHorizontalOverflow(page, vp.label);
}

// —— 双视口逐一跑通同一条主链路（milestones.json N4 criteria①「PC（1920）与横屏手机（844×390）双视口」）——
for (const vp of [VP_PC, VP_PHONE]) {
  test(`N4 全流程主链路 @${vp.label}：建场景→dock摆物件(让路)→画布挪动(让路)→写故事→游客只读看故事+原图→跨场景故事同步→3场景上限第4被阻→场景改名/删除(配额释放可再建)→物件改名跨场景同步→陈列室名就地编辑→刷新全还原`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const sink = await attachErrorGuards(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await freshApp(page);
    await runMainFlow(page, vp);
    // —— 贯穿全程：无未捕获运行时错误 / 未处理拒绝 / console error ——
    await assertNoRuntimeErrors(page, sink);
  });
}
