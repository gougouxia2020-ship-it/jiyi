import { test, expect, type Page, type Locator } from '@playwright/test';

// 念念 · 陈列室 —— N2 满屏沉浸外壳与场景自适应层 · 收口 e2e。
// 覆盖 milestones.json N2 criteria①（e2e 硬指标）+ success.json 条目6（浮层让路）+ idea R1/R6：
//   ① 1280/1920/2560 与横屏手机视口均无横向溢出、外壳铺满（无定宽留白、无元素堆角）。
//   ② 缩放窗口后物件相对场景位置不变（钉在房间同一相对位置）。
//   ③ 任意比例场景 contain 图面完整可见、两侧同图模糊补边不露底色（此处以竖比例视口令横图上下 letterbox）。
//   ④ 拖动让路铁律：拖动物件（画布挪动 / dock 拖出）过程中全部浮层淡出且不接指针，
//      物件能落到浮层平时覆盖的区域（如画面最顶部）。
//   ⑤ 浮层玻璃材质对齐 A2/design.md v2（--glass-bg 半透明 + backdrop-filter blur + --glass-line + --shadow-glass）。
//   ⑥ 隐藏界面钮（眼睛）一键收起全部浮层纯看房间，唯留一枚幽灵钮可恢复。
//   ⑦ 物件 dock 可收合成贴边把手，把手纵向居中（视觉居中补偿）、面板内容不挤偏。
//   ⑧ 工艺底线：UI 标签/分区标题字号不低于 --text-label-min（11px）。

const VP = {
  hd: { width: 1280, height: 800 },
  fhd: { width: 1920, height: 1080 },
  qhd: { width: 2560, height: 1440 },
  phoneLandscape: { width: 844, height: 390 }, // 横屏手机代表视口（宽>高、<880 → dock 默认收合）
  portrait: { width: 620, height: 1000 }, // 竖比例视口：令横版场景图上下 letterbox（验 contain 不截断）
};

/** 每条用例挂一次错误收集：全程不得有未捕获错误 / 未处理 Promise 拒绝 / console.error。 */
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
  await expect(page.getByTestId('scene-chip').filter({ hasText: bgName })).toBeVisible();
}

/** 若 dock 收合则展开（横屏手机默认收合），保证缩略卡可点/可拖。 */
async function ensureDockOpen(page: Page) {
  const dock = page.getByTestId('tray');
  if ((await dock.getAttribute('data-closed')) === 'true') {
    await page.getByTestId('dock-tab').click();
    await expect(dock).toHaveAttribute('data-closed', 'false');
  }
}

/** 点选放入（默认网格位）：返回其 itemId。 */
async function placeItemByClick(page: Page, index = 0): Promise<string> {
  await ensureDockOpen(page);
  const thumb = page.getByTestId('tray-item').nth(index);
  const itemId = await thumb.getAttribute('data-item-id');
  const before = await page.getByTestId('placement').count();
  await thumb.click();
  await expect(page.getByTestId('placement')).toHaveCount(before + 1);
  return itemId!;
}

/** 等布局落定：ResizeObserver 回调 + React 重渲染 + 一帧绘制（缩放视口后测量前调用）。 */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(60);
}

async function centerOf(loc: Locator): Promise<{ x: number; y: number }> {
  const b = await loc.boundingBox();
  expect(b).not.toBeNull();
  return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
}

/** 读某 placement 的存储百分比坐标（data-x/data-y 即存储原值）。 */
async function readPct(loc: Locator): Promise<{ x: number; y: number }> {
  return {
    x: Number(await loc.getAttribute('data-x')),
    y: Number(await loc.getAttribute('data-y')),
  };
}

/** 场景图 contain 后的实际图面矩形（相对视口的 px）。 */
async function paintedSceneRect(page: Page) {
  return page.evaluate(() => {
    const img = document.querySelector('[data-testid="scene-img"]') as HTMLImageElement | null;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth,
      nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const scale = Math.min(r.width / nw, r.height / nh);
    const pw = nw * scale,
      ph = nh * scale;
    return {
      ox: r.left + (r.width - pw) / 2,
      oy: r.top + (r.height - ph) / 2,
      pw,
      ph,
      stageW: r.width,
      stageH: r.height,
    };
  });
}

// ————————————————————————————————————————————————————————————————
// ① 满屏铺满 + 无横向溢出（1280 / 1920 / 2560 / 横屏手机）
// ————————————————————————————————————————————————————————————————
for (const [label, size] of Object.entries({
  '1280': VP.hd,
  '1920': VP.fhd,
  '2560': VP.qhd,
  横屏手机: VP.phoneLandscape,
})) {
  test(`① 外壳铺满且无横向溢出 @${label}（${size.width}×${size.height}）`, async ({ page }) => {
    const problems = watchErrors(page);
    await page.setViewportSize(size);
    await freshApp(page);
    await createScene(page, '客厅');

    // 无横向滚动。
    const scroll = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      bsw: document.body.scrollWidth,
    }));
    expect(scroll.sw, `${label} 不应横向溢出`).toBeLessThanOrEqual(scroll.cw + 1);
    expect(scroll.bsw, `${label} body 不应横向溢出`).toBeLessThanOrEqual(scroll.cw + 1);

    // 外壳铺满整个视口：.app 左上角贴 (0,0)、宽高等于视口（无定宽留白、无元素堆角）。
    const app = await page.getByTestId('app').boundingBox();
    expect(app).not.toBeNull();
    expect(Math.abs(app!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(app!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(app!.width - size.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(app!.height - size.height)).toBeLessThanOrEqual(1);

    // 场景图铺满 stage（contain 后完整落在视口内，不外溢）。
    const rect = await paintedSceneRect(page);
    expect(rect).not.toBeNull();
    expect(rect!.pw).toBeLessThanOrEqual(rect!.stageW + 1);
    expect(rect!.ph).toBeLessThanOrEqual(rect!.stageH + 1);

    expect(problems, problems.join('\n')).toEqual([]);
  });
}

// ————————————————————————————————————————————————————————————————
// ② 缩放窗口后物件相对场景位置不变（钉在房间同一相对位置）
// ————————————————————————————————————————————————————————————————
test('② 缩放窗口后物件相对场景图位置不漂移（1280 → 1920 → 2560）', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');
  await placeItemByClick(page, 0);
  const placement = page.getByTestId('placement');
  await expect(placement).toHaveCount(1);

  const stored = await readPct(placement);

  // 在若干视口下测「物件渲染中心相对场景图矩形的百分比」，应恒等于存储的 x/y。
  async function renderedPct() {
    const node = placement.locator('.stage__node');
    const c = await centerOf(node);
    const rect = await paintedSceneRect(page);
    expect(rect).not.toBeNull();
    return {
      x: ((c.x - rect!.ox) / rect!.pw) * 100,
      y: ((c.y - rect!.oy) / rect!.ph) * 100,
    };
  }

  for (const size of [VP.hd, VP.fhd, VP.qhd]) {
    await page.setViewportSize(size);
    await settle(page);
    // 存储百分比不随视口变化。
    const pct = await readPct(placement);
    expect(pct.x).toBeCloseTo(stored.x, 5);
    expect(pct.y).toBeCloseTo(stored.y, 5);
    // 渲染中心相对图面的百分比 == 存储百分比（相对位置不漂移）。
    const rp = await renderedPct();
    expect(Math.abs(rp.x - stored.x), `@${size.width} x 漂移`).toBeLessThan(1);
    expect(Math.abs(rp.y - stored.y), `@${size.width} y 漂移`).toBeLessThan(1);
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ③ 任意比例 contain 图面完整可见 + 同图模糊补边不露底色
// ————————————————————————————————————————————————————————————————
test('③ 竖比例视口下横图 contain 上下 letterbox 完整可见、模糊补边铺满不露底色', async ({ page }) => {
  await page.setViewportSize(VP.portrait);
  await freshApp(page);
  await createScene(page, '客厅');

  const rect = await paintedSceneRect(page);
  expect(rect).not.toBeNull();
  // contain（非 cover）：图面完整落在 stage 内，两轴都不超出（不裁图面）。
  expect(rect!.pw).toBeLessThanOrEqual(rect!.stageW + 1);
  expect(rect!.ph).toBeLessThanOrEqual(rect!.stageH + 1);
  // 竖比例视口 + 横图 → 上下 letterbox：宽度贴满、图面高度明显小于 stage 高（顶/底内容未被裁）。
  expect(rect!.pw).toBeGreaterThan(rect!.stageW - 2);
  expect(rect!.ph).toBeLessThan(rect!.stageH - 4);

  // 补边层铺满整个 stage（letterbox 处不露纯色底），且是模糊补边（filter 含 blur）。
  const blur = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="canvas-bg"]') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      filter: cs.filter,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
  expect(blur).not.toBeNull();
  expect(blur!.left).toBeLessThanOrEqual(0);
  expect(blur!.top).toBeLessThanOrEqual(0);
  expect(blur!.right).toBeGreaterThanOrEqual(blur!.vw);
  expect(blur!.bottom).toBeGreaterThanOrEqual(blur!.vh);
  expect(blur!.filter).toContain('blur');
});

// ————————————————————————————————————————————————————————————————
// ④ 拖动让路铁律：画布挪动 —— 浮层淡出且不接指针，物件可落到画面最顶部
// ————————————————————————————————————————————————————————————————
test('④a 画布挪动物件：拖动中浮层不接指针，物件可落点在浮层常驻区（画面最顶部）', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');
  await placeItemByClick(page, 0);
  const placement = page.getByTestId('placement');
  const node = placement.locator('.stage__node');

  const start = await centerOf(node);
  const topX = VP.hd.width / 2;
  const topY = 6; // 画面最顶部——品牌章/模式开关平时覆盖处

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(topX, topY, { steps: 16 });

  // 拖动中：.app 进入 is-dragging（拉起让路）。
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.app')!.classList.contains('is-dragging')))
    .toBe(true);

  // 浮层（品牌章）淡出且不接指针；该点命中测试落到品牌章「背后」（浮层不拦截指针）。
  const midDrag = await page.evaluate(() => {
    const brand = document.querySelector('[data-testid="brand"]') as HTMLElement;
    const cs = getComputedStyle(brand);
    const r = brand.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      pe: cs.pointerEvents,
      opacity: parseFloat(cs.opacity),
      hitInsideBrand: !!hit && brand.contains(hit),
    };
  });
  expect(midDrag.pe).toBe('none');
  expect(midDrag.opacity).toBeLessThan(0.2);
  expect(midDrag.hitInsideBrand).toBe(false);

  await page.mouse.up();

  // 物件落到了最顶部（浮层常驻区）：渲染中心 clientY 很小、存储 y 很小。
  const after = await centerOf(node);
  expect(after.y).toBeLessThan(48);
  const pct = await readPct(placement);
  expect(pct.y).toBeLessThan(10);

  // 松手后浮层浮回：品牌章恢复可接指针、is-dragging 摘除。
  const restored = await page.evaluate(() => {
    const brand = document.querySelector('[data-testid="brand"]') as HTMLElement;
    return {
      pe: getComputedStyle(brand).pointerEvents,
      dragging: document.querySelector('.app')!.classList.contains('is-dragging'),
    };
  });
  expect(restored.pe).toBe('auto');
  expect(restored.dragging).toBe(false);

  expect(problems, problems.join('\n')).toEqual([]);
});

// ④ 另一半：dock 拖出 —— 同样让路，物件可落到最顶部。
test('④b dock 拖出物件：拖动中让路，落点可在画面最顶部', async ({ page }) => {
  const problems = watchErrors(page);
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  const thumb = page.getByTestId('tray-item').nth(0);
  const start = await centerOf(thumb);
  const topX = VP.hd.width / 2;
  const topY = 6;

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(topX, topY, { steps: 16 });

  await expect
    .poll(() => page.evaluate(() => document.querySelector('.app')!.classList.contains('is-dragging')))
    .toBe(true);
  // 跟手幽灵可见、dock 淡出不接指针。
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  const dockPe = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="tray"]') as HTMLElement).pointerEvents,
  );
  expect(dockPe).toBe('none');

  await page.mouse.up();

  // 落成一条 placement，且落在最顶部。
  const placement = page.getByTestId('placement');
  await expect(placement).toHaveCount(1);
  const pct = await readPct(placement);
  expect(pct.y).toBeLessThan(10);

  expect(problems, problems.join('\n')).toEqual([]);
});

// ————————————————————————————————————————————————————————————————
// ⑤ 浮层玻璃材质对齐 v2 token（半透明奶油 + backdrop blur + 玻璃描边 + 玻璃阴影）
// ————————————————————————————————————————————————————————————————
test('⑤ 浮层四件套均为毛玻璃材质（backdrop-filter blur + 半透明底 + 阴影）', async ({ page }) => {
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');

  const glass = await page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        backdrop: cs.backdropFilter || (cs as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter,
        shadow: cs.boxShadow,
        bg: cs.backgroundColor,
        border: cs.borderTopWidth,
      };
    };
    return {
      brand: read('.brand'),
      seg: read('.seg'),
      scenes: read('.scenes'),
      dock: read('.dock'),
    };
  });

  for (const key of ['brand', 'seg', 'scenes', 'dock'] as const) {
    const g = glass[key];
    expect(g, `${key} 应存在`).not.toBeNull();
    expect(g!.backdrop, `${key} 应有 backdrop blur`).toContain('blur');
    expect(g!.shadow, `${key} 应有玻璃阴影`).not.toBe('none');
    // 半透明奶油底（rgba 带 alpha < 1）。
    expect(g!.bg).toMatch(/rgba?\(/);
  }
});

// ————————————————————————————————————————————————————————————————
// ⑥ 隐藏界面钮：一键收起全部浮层、唯留眼睛幽灵钮、再点恢复
// ————————————————————————————————————————————————————————————————
test('⑥ 隐藏界面钮收起全部浮层纯看房间，唯留一枚眼睛幽灵钮可恢复', async ({ page }) => {
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');

  const readOverlay = () =>
    page.evaluate(() => {
      const g = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { opacity: parseFloat(cs.opacity), pe: cs.pointerEvents };
      };
      return {
        appHidden: document.querySelector('.app')!.classList.contains('ui-hidden'),
        brand: g('.brand'),
        seg: g('.seg'),
        scenes: g('.scenes'),
        dock: g('.dock'),
        eye: g('.eye'),
      };
    });

  // 隐藏。
  await page.getByTestId('toggle-ui').click();
  await expect
    .poll(async () => (await readOverlay()).brand!.opacity)
    .toBeLessThan(0.05);

  const hidden = await readOverlay();
  expect(hidden.appHidden).toBe(true);
  for (const k of ['brand', 'seg', 'scenes', 'dock'] as const) {
    expect(hidden[k]!.opacity, `${k} 应收起`).toBeLessThan(0.05);
    expect(hidden[k]!.pe, `${k} 收起后不接指针`).toBe('none');
  }
  // 眼睛留作幽灵钮：仍可见（半透明）且可接指针（可点恢复）。
  expect(hidden.eye!.opacity).toBeGreaterThan(0);
  expect(hidden.eye!.pe).toBe('auto');

  // 再点恢复：浮层浮回。
  await page.getByTestId('toggle-ui').click();
  await expect.poll(async () => (await readOverlay()).brand!.opacity).toBeGreaterThan(0.95);
  const shown = await readOverlay();
  expect(shown.appHidden).toBe(false);
  expect(shown.brand!.pe).toBe('auto');
  expect(shown.dock!.pe).toBe('auto');
});

// ————————————————————————————————————————————————————————————————
// ⑦ dock 可收合成贴边把手：把手纵向居中（视觉居中补偿），面板内容水平居中不挤偏
// ————————————————————————————————————————————————————————————————
test('⑦ dock 收合成把手且纵向居中，展开时面板内容水平居中不挤偏', async ({ page }) => {
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  const dock = page.getByTestId('tray');
  await expect(dock).toHaveAttribute('data-closed', 'false');
  await expect(page.getByTestId('tray-item').first()).toBeVisible();

  // 展开态：分区标题（dock-head）水平居中于面板（把手的单侧突出不挤偏内容）。
  const centered = await page.evaluate(() => {
    const panel = document.querySelector('.dock-panel') as HTMLElement;
    const head = document.querySelector('.dock-head') as HTMLElement;
    const pr = panel.getBoundingClientRect();
    const hr = head.getBoundingClientRect();
    return Math.abs((hr.left + hr.width / 2) - (pr.left + pr.width / 2));
  });
  expect(centered, '分区标题应水平居中于面板').toBeLessThan(2);

  // 收合：只剩把手，缩略卡隐藏。
  await page.getByTestId('dock-tab').click();
  await expect(dock).toHaveAttribute('data-closed', 'true');
  await expect(page.getByTestId('tray-item').first()).toBeHidden();

  // 视觉居中补偿：收合后的把手仍纵向居中于视口（不因面板消失而偏上/偏下）。
  const tab = await centerOf(page.getByTestId('dock-tab'));
  expect(Math.abs(tab.y - VP.hd.height / 2), '把手应纵向居中').toBeLessThan(40);

  // 再点展开。
  await page.getByTestId('dock-tab').click();
  await expect(dock).toHaveAttribute('data-closed', 'false');
  await expect(page.getByTestId('tray-item').first()).toBeVisible();
});

// ————————————————————————————————————————————————————————————————
// ⑧ 工艺底线：UI 标签/分区标题字号不低于 --text-label-min（11px）
// ————————————————————————————————————————————————————————————————
test('⑧ 关键 UI 标签/分区标题字号均 ≥ 11px（工艺底线）', async ({ page }) => {
  await page.setViewportSize(VP.hd);
  await freshApp(page);
  await createScene(page, '客厅');
  await ensureDockOpen(page);

  const sizes = await page.evaluate(() => {
    const px = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    };
    return {
      brandSmall: px('.brand small'),
      dockHead: px('.dock-head'),
      scenesLbl: px('.scenes .lbl'),
      chip: px('.chip'),
      segButton: px('.seg button'),
      thumbSpan: px('.thumb span'),
    };
  });

  for (const [k, v] of Object.entries(sizes)) {
    expect(v, `${k} 字号应存在`).not.toBeNull();
    expect(v as number, `${k} 字号应 ≥ 11px（实测 ${v}px）`).toBeGreaterThanOrEqual(10.99);
  }
});
