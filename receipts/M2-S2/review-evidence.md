# review-evidence · M2-S2

评审员亲手核查记录。裁决：**reject**。

尺子（本 sprint 硬指标子集，逐字摘自任务书 / milestones.json M2 criteria）：
1. e2e：`npx playwright test e2e/m2-transform.spec.ts --reporter=line` 须 exit 0，覆盖「抽屉拖入→拖动改位→角手柄缩放→顶部手柄旋转→移除→刷新还原」全链路。
2. 顺滑手感（manual）：拖/缩/转跟手、无肉眼可见掉帧或位置/角度跳变、手柄命中准；**在 PC 与横屏手机各验一遍**。
3. 抽屉拖入须是真实拖拽（非仅点选）。
4. 变换仅走 transform/opacity、合成层 + rAF 提交（不触发布局重排）。

---

## 1. 生产构建

```
$ npm run build
> tsc -b && vite build
✓ 55 modules transformed.
✓ built in 322ms
EXIT:0
```
过。无类型错误。

## 2. 验收 e2e 命令（亲手跑，非采信builder自报）

```
$ npx playwright test e2e/m2-transform.spec.ts --reporter=line
Running 2 tests using 1 worker
[1/2] [chromium] › e2e/m2-transform.spec.ts:84:1 › 全链路变换：抽屉拖入 → 拖动改位 → 角手柄缩放 → 顶部手柄旋转 → 移除 → 刷新完整还原
[2/2] [chromium] › e2e/m2-transform.spec.ts:198:1 › 抽屉拖入落到画布外 → 不建 placement（真实拖拽的落点判定）
  2 passed (3.8s)
EXIT:0
```

全套回归（含 M1）：
```
$ npx playwright test --reporter=line
  5 passed (4.3s)
EXIT:0
```
**过**。命令、exit code、用例数与 builder 自报一致，独立复核通过。

## 3. 代码核查：变换是否只经 transform（不触发重排）

`src/components/Canvas.tsx`（读取原文确认）：
- 每个 placement 渲染为三层：`.stage__item`（`style={{ transform: translate(x,y), zIndex }}`）→ `.stage__tf`（`style={{ transform: rotate(r) scale(s) }}`）→ `<img class="stage__node">`。
- 手势中间态（`onGesturePointerMove`）：
  ```js
  if (g.rafId == null) {
    g.rafId = requestAnimationFrame(() => {
      ...
      if (cur.mode === 'move') cur.itemEl.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      else cur.tfEl.style.transform = `rotate(${cur.rotation}deg) scale(${cur.scale})`;
    });
  }
  ```
  全程只写 `style.transform`，经 rAF 节流，不写 React state（零重渲染）；松手才 `dispatch` 一次性提交。
- `src/App.css`：`.stage__item{position:absolute;left:0;top:0}`（left/top 固定为 0，从不被 JS 改写）、`.stage__tf{position:relative;transform-origin:center}`、`.stage__item.is-active{will-change:transform}`（手势中才挂，结束摘掉）。全仓搜索确认手势路径上无 `left`/`top`/`width`/`height` 写入。
- e2e 亦断言 `.stage__item` inline style 含 `translate(` 不含 `left`/`top`；`.stage__tf` 含 `rotate(`+`scale(`。

**过**。代码原文与 e2e 断言双重确认，非仅采信 builder 描述。

## 4. 手动核验 · PC（1280×800，鼠标，独立 Playwright 脚本驱动真实指针事件，非 builder 自报脚本）

方法：起 `npm run dev`（独立端口 5179），写临时脚本（跑完已删，非交付物）用真实 `page.mouse.down/move/up` 驱动：建场景 → 拖入 → 选中 → 移动 → 角手柄缩放 → 顶部手柄旋转 → 移除 → 刷新。

关键结果（截图存于会话 scratchpad `shots/pc-*.png`）：
- 拖入：`dragInMs=304`，落点 `x=120.37,y=213.8`，与「画布内坐标换算」公式精确吻合；inline style 只含 `translate(`，不含 `left/top`。
- 选中后 4 个 `handle-scale` + 1 个 `handle-rotate` 全部出现，且逐一用 `document.elementFromPoint(中心点)` 命中测试，**4 角手柄 + 旋转手柄命中全部为真**（`hit:true`），无手柄被其他元素遮挡/点不中。
- 移动：`x/y` 变（120.37→160.37, 213.8→247.8），`scale/rotation/z` 原样不变。
- 缩放（拖右下角手柄）：`scale` 1→1.643，仅 `scale` 变，`x/y/rotation/z` 不变。
- 旋转（拖 ⟳ 钮）：`rotation` -5→17.49，仅 `rotation` 变，其余不变。
- 最终 `.stage__item` inline style：`transform: translate(160.367px, 247.8px); z-index: 2;`；`.stage__tf`：`transform: rotate(17.4897deg) scale(1.64275);`——只经 transform。
- 移除后 placement 计数归零；刷新后仍为 0（持久化生效）。
- 全程 `consoleErrors: []`、`pageErrors: []`；`overflow0`/`overflow1`（`documentElement.scrollWidth - clientWidth`）均为 `0`。

**PC 端「顺滑手感」——过**，与 builder 自报一致。

## 5. 手动核验 · 横屏手机（844×390，`hasTouch:true, isMobile:true`，CDP `Input.dispatchTouchEvent` 派发真实触摸序列，`pointerType==='touch'`）—— **不达标，此为打回主因**

### 5.1 复现：从初始视图做一次真实的「抽屉拖入」手势，不建 placement

脚本对首个抽屉物件做真实触摸序列：`touchStart`（抽屉物件中心）→ `touchMove`×N → 落到画布中心相对坐标（`cbox.x+width*0.5, cbox.y+height*0.42`，与 e2e spec 同一套换算公式）→ `touchEnd`。

```
canvas box { x: 11, y: 299.25, width: 822, height: 365.5 }
tray item box { x: 23, y: 160.75, width: 798, height: 121.5 }
dispatch touchStart 422 221.5
dispatch touchMove ×2
dispatch touchEnd
placement count 0
```

即：**在 844×390 视口下，从初始（未滚动）视图对抽屉第一件物件做一次贴近真实用户直觉的拖拽手势，落点在画布内的合理位置，却没有建出 placement。**（对照脚本在 PC 端跑同款逻辑是必过的——已见 §4。）

### 5.2 根因：抽屉缩略卡在窄屏被撑到近全宽 + 画布被推到折叠线以下，两者无法同屏可见

`page.evaluate(getComputedStyle)` 实测：

```
tray-item[0] box after scroll { x: 23, y: 158.75, width: 798, height: 121.5 }   // 期望 ~96-110px
tray box { x: 11, y: 144.75, width: 822, height: 154.5 }
thumbComputed: { width: "798px", flex: "0 0 auto", minWidth: "96px" }
gridRect: { width: 822, height: 520 }   // .grid 的 min-height:520 在窄屏未被下调
canvas box (未滚动): { x: 11, y: 299.25, width: 822, height: 365.5 }  // 下沿 664.75，超出 390 视口 274.75px
```

截图 `phone-0-shell.png`（会话 scratchpad `shots/`）可视化确认：初始视图里抽屉只显示 1 张近乎占满屏宽的缩略卡（「全家福旧照」），画布仅露出顶部约 90px 的一条缝；截图 `debug7-afterscroll.png` 确认：把画布滚动到完整可见后，抽屉整体已滚出视口（`tray-item[0].y = -114px`，即抽屉此时一点都看不见）。**两者在 390px 高的视口内永远无法同屏。**

**代码定位**（`src/App.css`）：
- 第 233-235 行，`.thumb` 基础规则（PC 竖版抽屉专用）：
  ```css
  .thumb {
    display: block;
    width: 100%;
    ...
  }
  ```
- 第 533-569 行，窄屏媒体查询 `@media (max-width: 880px)` 只重设了：
  ```css
  .thumb {
    min-width: 96px;
    margin: 0;
    flex: none;      /* = flex: 0 0 auto，flex-basis:auto */
    touch-action: pan-x;
  }
  ```
  **没有把 `width` 重置回 `auto`**。`.tray` 在窄屏是 `display:flex`，`.thumb` 的 `flex:none`→`flex-basis:auto`，而 `width` 属性非 auto 时 flex-basis 实际取该 `width` 值——即每张缩略卡的 flex-basis 被基础规则的 `width:100%` 钉死为「抽屉可用宽度的 100%」，导致横向抽屉里每张卡近乎撑满整条抽屉（实测 798px），而不是设计注释里说的紧凑 filmstrip。
- 第 204-208 行 `.grid { grid-template-columns: 132px 1fr; min-height: 520px; }`：窄屏媒体查询只覆盖了 `grid-template-columns`，未下调 `min-height`；配合 CSS Grid 对 `align-content:normal` 的默认拉伸行为，报头+场景条+抽屉+画布纵向堆叠后总高被撑到 ~700px（实测 `document.documentElement.scrollHeight = 703`），画布区域大半落在 390px 视口折叠线以下。

两个问题叠加的直接后果：横屏手机（844×390）初始视图里，抽屉与画布**不能同屏可见**，"从抽屉真实拖拽物件到画布"这个动作因此在不预先滚动页面的前提下无法一次性连续完成——这正是本 sprint 点名要补的核心能力（"物件从抽屉拖入画布"）。

### 5.3 补充验证：一旦绕过"拖入"这一步（改用点选放入把物件放上画布），移动/缩放/旋转/移除本身的触摸手势是正常的

为把"抽屉拖入布局缺陷"和"变换手势机制本身对不对"分开验证，追加一次测试：先用点选（非拖拽）放入物件（这条路径不依赖画布可见），再滚动画布入视区，用真实触摸依次移动/缩放/旋转/移除：

```
placement count after tap-select (no drag) 1
canvas box (滚动后) { x: 11, y: 24.25, width: 822, height: 365.5 }
placement before { x: 90, y: 90, scale: 1, rotation: -5 }
handle-scale count 4  handle-rotate count 1
afterMove { x: 117.5, y: 108.33 }
br handle box {...} within viewport? true
afterScale { scale: 1.397 }
rot handle box {...} within viewport? true
afterRotate { rotation: 9.497 }
remove btn box {...} within viewport? true
errors []
```

即：移动/缩放/旋转/移除的触摸手势机制本身（一旦物件已经在画布上）在横屏手机上是好的，手柄命中、字段隔离均正常，无 console 错误。**问题精确定位在"抽屉→画布"这一步的拖入手势，因为窄屏布局缺陷导致源（抽屉物件）和目的地（画布）无法同屏可及。**

### 5.4 为什么 builder 自报「过」但复核发现不达标

builder 自检记录的唯一溢出判据是 `documentElement.scrollWidth ≤ clientWidth`（横向文档级溢出）——这条本身是真的成立（`scrollWidth=844=clientWidth`，因为抽屉内部用 `overflow-x:auto` 吸收了缩略卡超宽，不会外溢到文档级别），**但这个判据测不出「抽屉缩略卡被撑到近全宽」与「画布被推到折叠线以下」这两个问题**，两者都不产生文档级横向溢出，只有纵向布局比例失衡 + 抽屉内部卡片尺寸失控。builder 的手动横屏验证描述（"触摸拖入落一件...全部命中"）大概率是在已经滚动到能同时兼顾抽屉与画布某个中间状态下测的，或未覆盖"从最初视图直接拖入"这个最基本、最贴近真实用户第一次打开页面时的操作路径。

**横屏手机端「顺滑手感」——不达标**：抽屉拖入这一步在 844×390 视口初始视图下不可靠地失败（可复现、非偶发——布局尺寸是确定性的 CSS 结果，不是时序竞争）。

## 6. 结论

| 硬指标 | 结论 |
|---|---|
| e2e 命令 exit 0 | 过 |
| 变换仅经 transform/opacity + rAF | 过 |
| 抽屉拖入为真实拖拽（代码机制） | 过（机制是真实拖拽，非点选） |
| 顺滑手感 · PC | 过 |
| 顺滑手感 · 横屏手机（844×390） | **不达标**——抽屉拖入在初始视图下因窄屏布局缺陷（缩略卡被撑到近全宽 + 画布被推出折叠线）无法同屏完成 |

四条过、一条不过。裁决：**reject**。

---

## 复现命令 / 脚本（供建造员或复核参考，非交付物，已在评审完成后从项目目录清理）

```bash
cd /Users/yuriiiz/Projects/Memories
npm run build
npx playwright test e2e/m2-transform.spec.ts --reporter=line
npx playwright test --reporter=line
npm run dev -- --port 5179 --strictPort
# 另开：用 @playwright/test 的 chromium.launch() + newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true})
# + context.newCDPSession(page) 派发 Input.dispatchTouchEvent 复现 §5.1/§5.2/§5.3。
```

截图证据（会话 scratchpad，未落盘进仓库）：
`shots/pc-0-shell.png` ~ `pc-4-removed.png`（PC 全链路）、
`shots/phone-0-shell.png`（横屏手机初始视图，抽屉撑满 + 画布仅露一条缝）、
`debug7-afterscroll.png`（滚动到画布可见后抽屉完全滚出视口）——
均存于 `/private/tmp/claude-501/-Users-yuriiiz-Projects-Memories/61df20fa-e2cd-414a-8fa7-c0c01c35914c/scratchpad/`（本机会话临时目录）。

---

# 第 2 轮复核（builder 针对第 1 次打回返工后）

日期：2026-07-16。裁决：**reject**（第 2 次打回）。

沿用同一把尺（本 sprint 硬指标子集，见上）。方法论沿用第 1 轮：起 `npm run dev`、亲手写独立
Playwright/CDP 脚本（不采信 builder 自报脚本与自报数据）、横屏手机走 CDP `Input.dispatchTouchEvent`
真实触摸序列、PC 走真实 `page.mouse` 事件。全部复核脚本存于会话 scratchpad
`/private/tmp/claude-501/-Users-yuriiiz-Projects-Memories/61df20fa-e2cd-414a-8fa7-c0c01c35914c/scratchpad/`
（`review2-*.mjs`，非交付物，跑完未清理、供追溯）。

## 1. 生产构建 + e2e（亲手跑）

```
$ npm run build
> tsc -b && vite build
✓ 55 modules transformed.
✓ built in 333ms
EXIT:0

$ npx playwright test e2e/m2-transform.spec.ts --reporter=line
Running 2 tests using 1 worker
[1/2] … 全链路变换：抽屉拖入 → 拖动改位 → 角手柄缩放 → 顶部手柄旋转 → 移除 → 刷新完整还原
[2/2] … 抽屉拖入落到画布外 → 不建 placement（真实拖拽的落点判定）
  2 passed (3.9s)
EXIT:0

$ npx playwright test --reporter=line   # 全套（含 M1）
  5 passed (4.3s)
EXIT:0
```
**过**。与 builder 自报一致，独立复核通过。

## 2. App.css 改动范围核查（读原文，非采信 builder 描述）

读取 `/Users/yuriiiz/Projects/Memories/src/App.css` 全文确认：
- PC/宽屏基础规则 `.thumb`（第 233-247 行，含 `width:100%`）、`.grid`（第 204-208 行，`min-height:520px`）、
  `.tray`（第 211-217 行）**原样未动**，与第 1 轮读到的原文逐字节一致。
- 本轮改动确认全部落在 `@media (max-width: 880px)` 块内（第 533-590 行）：`.grid{min-height:0}`（新增）、
  `.thumb{width:96px; padding:6px}`（新增/改）、`.thumb .itm{height:42px}`（新增）、
  `.thumb span{margin-top:3px;font-size:11px}`（新增）、`.tray{padding/align-items 收紧}`（改）。
  与 builder 回执「改动清单」表格逐条核对一致，**未发现改动溢出媒体查询边界**。

**过**——改动范围确属限定在窄屏媒体查询内，未碰 PC 基础规则。

## 3. 横屏手机（844×390）初始视图布局复核——第 1 轮问题是否解决

独立脚本 `review2-phone.mjs`（非 builder 脚本），起 dev（独立端口 5199），
`hasTouch:true, isMobile:true`，`getBoundingClientRect` 实测：

```
LAYOUT0 (initial, unscrolled): {
  trayBox:   { y: 144.75, width: 822, height: 96 },
  canvasBox: { y: 240.75, width: 822, height: 340 },
  viewportH: 390,
  canvasVisiblePx: 149.25,
  trayVisiblePx: 96,
  docScrollWidth: 844, docClientWidth: 844   // 横向仍无溢出
}
DRAWER_AND_CANVAS_BOTH_VISIBLE_INITIAL: true
```

与 builder 回执 C 节实测数字（抽屉可见 96px / 画布可见 149.3px）**精确吻合**。
**第 1 轮打回的核心问题（抽屉与画布不能同屏可见）确认已解决。**

## 4. 横屏手机真实触摸全链路复核——发现新问题，此为第 2 次打回主因

### 4.1 用与 builder 相同套路（不预先滚动，从初始视图触摸拖入）复测：不稳定复现失败

第一次尝试（`review2-phone.mjs` 早期版本，落点取「整个画布盒」纵向中点 `dropY=315.375`，
在 844×390 视口内本身合法可见）：

```
drag-in from { startX: 71, startY: 192.25 } to { dropX: 422, dropY: 315.375 }
placementCountAfterDrop (no pre-scroll): 0   ← 失败
```

排除脚本自身错误后（落点确认在可见视口内、非我此前一版脚本误取了视口外坐标的低级错误——
已修正并复核排除），确认这不是我的脚本 bug，而是应用的真实行为。继续深挖根因。

### 4.2 根因定位：`.thumb` 在窄屏的 `touch-action: pan-x` 会按「首次滑动方向」把手势判给原生横向滚动，
而非交给 JS 拖拽逻辑——一旦被判给原生滚动，浏览器直接对该指针发 `pointercancel`，
JS 侧的拖拽状态机（`ItemTray.tsx` 的 `onPointerMove`）永远等不到越过 6px 阈值的后续 `pointermove`，
`dragging` 永远置不成 `true`，幽灵不出现、不会调用 `onDropItemAt`，因此不建 placement——且**全程无
console error / 无 pageerror**，对用户是**完全静默的失败**（看起来像什么都没发生）。

**低层事件日志实证**（`review2-phone-events.mjs`，在 `tray-item[0]` 上挂 `pointerdown/move/up/cancel`
监听后重放一次「朝画布右侧 3/4 处」的直线触摸拖拽）：

```
pointerdown  x=71    y=192.25
pointermove  x=98.8  y=198.4   (dx=27.8, dy=6.15 —— 明显偏横向)
pointercancel x=0    y=0        ← 浏览器在第一次 move 后立即取消，JS 再收不到任何后续事件
total events: 3
placementCount: 0
```

### 4.3 量化「安全锥角」——这不是偶发的时序竞争，是确定性的、按方向触发的功能缺陷

`review2-phone-sweep.mjs`：以抽屉物件为起点，固定滑动距离 120px，扫 `0°`（正下方）到 `90°`（正横向）
共 10 个角度，逐一走真实触摸拖拽序列，读 `placementCount`：

```
angleFromVertical=0°  => placementCount=1  OK
angleFromVertical=15° => placementCount=1  OK
angleFromVertical=30° => placementCount=1  OK
angleFromVertical=40° => placementCount=1  OK
angleFromVertical=45° => placementCount=1  OK
angleFromVertical=50° => placementCount=0  HIJACKED/FAILED
angleFromVertical=55° => placementCount=0  HIJACKED/FAILED
angleFromVertical=60° => placementCount=0  HIJACKED/FAILED
angleFromVertical=75° => placementCount=0  HIJACKED/FAILED
angleFromVertical=90° => placementCount=0  HIJACKED/FAILED
```

边界清晰、可重复：**只要首次滑动方向偏离「正下方」超过约 45°~50°，拖入必然失败**（多次重跑同一角度
结果稳定一致，非偶发抖动）。

### 4.4 用「贴近真实手指的直线插值路径」复核（非人为设计折线），确认这不是路径形状的伪影

`review2-phone-linear.mjs`：从抽屉首件物件直线滑向画布上三个不同落点（每步 12ms 间隔、20 步插值，
模拟真实触摸采样）：

```
[linear-toward-right]            start(71,192) → end(628,315) => placementCount=0   失败
[linear-toward-directly-below]   start(71,192) → end(81,315)  => placementCount=1   成功
[linear-toward-45deg]            start(71,192) → end(194,315) => placementCount=1   成功
```

「往画布右侧拖」——**这正是把物件摆到画布右半边这个最基本、最常见的使用场景**——在 844×390
横屏手机上用真实触摸**必然失败**。因为画布可见区宽 822px、高只有 149px（纵横比约 5.5:1），
起点（抽屉物件）到多数画布落点的连线角度天然会超过 45° 安全锥角——即：**在这个宽高比极端的视口下，
横向大范围拖放物件这个核心操作，按现状实现是不可靠的、方向敏感的**，而不是小概率边缘情况。

### 4.5 静默失败核对（无错误提示，用户会以为「什么都没发生」）

```
placementCount after right-leaning drag: 0
consoleErrors: []
pageErrors: []
=> silent failure (no error surfaced to user): true
```

### 4.6 一旦「首次滑动方向」在安全锥角内，后续链路（移动/缩放/旋转/移除/刷新）本身是好的

用安全角度（起点附近，几乎正下方）拖入后重走全链路（`review2-phone.mjs` 修正版）：

```
dropped placement: { x: 15, y: 19.625, scale: 1, rotation: -5, z: 1 }   dxErr=0 dyErr=0
afterMove:   { x: 45, y: 39.625, scale: 1, rotation: -5, z: 1 }
afterRotate: { x: 45, y: 39.625, scale: 1, rotation: 24.06, z: 1 }
itemStyle: transform: translate(45px, 39.625px); z-index: 2;   // 只经 transform
tfStyle:   transform: rotate(24.059deg) scale(1);
countAfterRemove: 0
```
（缩放字段在这一次链式跑法里恰好落在视口边缘导致手柄触点出视区、复测另有干净的 6/6 独立缩放验证
全部成功——见下节；不作为本次打回理由，仅记录以免误判为"缩放本身坏了"。）

补充：`review2-phone-chain-isolate.mjs` 把「触摸拖动改位」紧接「触摸缩放」的手势链在**未逼近视口边缘**
的位置复测 6 次，**6/6 全部缩放成功**（`scaleChanged:true`）——证明缩放/旋转手势机制本身在横屏手机上
是可靠的，第 1 轮 §5.3 与 builder 回执 D.4 的结论（变换手势本身没问题、短视口边缘手柄裁切是已知取舍）
在本轮依然成立，**不是本次打回的理由**。本次打回理由**只针对「抽屉拖入」这一步的方向敏感性缺陷**。

### 4.7 结论

`src/App.css` 第 575 行（`@media (max-width: 880px)` 内）`.thumb{touch-action:pan-x}`
——这条规则本身在**第 1 轮**已写入（round 1 的「改写源码」清单，非本轮新增改动），
第 2 轮的返工diff未触碰它。但第 1 轮时抽屉与画布根本不同屏可见，这个方向敏感性缺陷**从未被
真正跑到过、也不可能被跑到**——是本轮修完布局问题后才第一次具备了可测试的前提。
按本岗任务书「确认…没有引入新问题」是就**可测试到的结果**判断，不是按 diff 归属判断：
**現在**从抽屉真实拖拽到画布这个核心动作，在 844×390 横屏手机初始视图下，
对超过安全锥角（约 45°~50°）的滑动方向必然静默失败——不是「引入的新问题」，
而是「第 1 轮打回的同一个验收点（抽屉拖入的真实拖拽可靠性）在本轮修复后依然不达标，
只是失败诱因从『目标不可见』换成了『方向被原生滚动劫持』」。

## 5. PC 端（1280×800）抽查——无回归

独立脚本 `review2-pc.mjs`，真实 `page.mouse` 事件：

```
PC layout computed: { thumbWidth: '107px', thumbMinWidth: '0px', gridMinHeight: '520px', … }  // PC 基础规则未变
PC dropped:     { x: 120.37, y: 265,    scale: 1,      rotation: -5,    z: 1 }
PC afterMove:   { x: 160.37, y: 295,    scale: 1,      rotation: -5,    z: 1 }
PC afterScale:  { x: 160.37, y: 295,    scale: 1.6427, rotation: -5,    z: 1 }
PC afterRotate: { x: 160.37, y: 295,    scale: 1.6427, rotation: 15.94, z: 1 }
PC countAfterRemove: 0
PC overflow: 0
PC consoleErrors: []  PC pageErrors: []
moveOnlyXY: true  scaleOnlyScale: true  rotateOnlyRotation: true  removedOk: true  overflow0: true  noErrors: true
```

**过**，与第 1 轮结论一致，PC 端无回归。

## 6. 结论表

| 硬指标 | 结论 |
|---|---|
| `npx playwright test e2e/m2-transform.spec.ts` exit 0 | 过 |
| 全套回归 exit 0 | 过 |
| `npm run build` exit 0 | 过 |
| App.css 改动限定窄屏媒体查询、未碰 PC 基础规则 | 过 |
| 变换仅经 transform/opacity + rAF | 过（代码未变，沿用第 1 轮已核实结论） |
| 第 1 轮问题·抽屉与画布 844×390 初始视图同屏可见 | **过，已解决** |
| 抽屉拖入 · 真实拖拽（机制存在） | 过 |
| 抽屉拖入 · 横屏手机下方向可靠性（"跟手"） | **不达标**——`touch-action:pan-x` 导致滑动方向偏离正下方超过约 45°~50° 时必然静默失败（`pointercancel`，无错误提示），而画布可见区宽高比 ~5.5:1 使得"拖到画布中远处"这类常见落点天然超出安全锥角 |
| 顺滑手感 · PC | 过 |
| 顺滑手感 · 横屏手机 | **不达标**（原因同上，拖入这一步不可靠） |

七过、两不过（后一条是前一条在"横屏手机"维度上的直接后果）。裁决：**reject**。

## 7. 打回四件套（第 2 次）

1. **缺什么**：横屏手机（844×390）下，抽屉与画布已同屏可见（第 1 轮问题已解决，予以确认），
   但「真实拖拽」这个动作本身对滑动方向敏感——只有首次滑动方向落在「正下方 ±45°~50°」的安全锥角内
   才能成功拖入，超出此锥角的方向（包括很常见的"往画布中远处横向摆放物件"）会被浏览器原生横向
   滚动（`touch-action:pan-x`）静默劫持、拖入失败且无任何错误提示。

2. **错在哪**：`src/App.css` 第 575 行、`@media (max-width: 880px)` 内 `.thumb{touch-action:pan-x}`
   —— 该规则允许浏览器把「首次滑动方向偏横向」的触摸手势判给原生横向滚动（用于滚抽屉），
   但抽屉里的可拖拽缩略卡与「拖入画布」共用同一手势入口，原生滚动一旦接管就会对该指针发
   `pointercancel`，`ItemTray.tsx` 里判断拖拽/点选的状态机（6px 阈值）永远等不到后续
   `pointermove`，因此永远不会置 `dragging=true`、不会调用 `onDropItemAt`。
   已用真实触摸序列的角度扫描（0°~90°，10 个采样点）验证边界精确落在 45°~50° 之间，
   且用直线插值（贴近真实手指轨迹）复核「拖到画布右侧」这一常见落点必然失败——非我方测试脚本的
   路径设计伪影，是确定性、可重复的功能缺陷。（此规则本身写于第 1 轮，第 2 轮回执未改动它；
   但布局问题在第 1 轮时挡住了这条路径从未被真正验证过——问题在本轮才第一次具备可测试前提，
   仍算作「抽屉拖入真实拖拽在横屏手机下不达标」这条验收点尚未清干净。）

3. **对照哪条**：milestones.json M2 criteria 第二条（manual）「顺滑手感：拖…跟手…；在 PC 与横屏手机
   各验一遍」——原生滚动劫持发生时物件完全不跟手（不出现幽灵、不建 placement）；以及任务书
   「抽屉拖入须实现真实拖拽而非仅点选」——目前的拖拽机制在横屏手机上对滑动方向可靠性不完整，
   仅在小于一半的方向范围内可靠工作。

4. **改到什么程度算过**：横屏手机（844×390）下，从抽屉任一物件出发、朝画布内任意方向
   （不只是正下方 ±45°）的真实触摸拖拽都能可靠建出 placement，落点与滑动终点换算一致；
   建议方向：让 `.thumb`（或其可拖拽子区域）在窄屏下改用 `touch-action:none`
   （拖拽状态机已用 JS 判断 6px 阈值做「点选 vs 拖拽」的区分，不再需要靠 `touch-action:pan-x`
   把横向判给原生滚动），抽屉横向浏览改由物件之间的空白区或专门的滚动手柄承担，
   或改造拖拽状态机使其在原生 pan 生效前就抢先 `preventDefault`/建立更早的判定；
   具体方案由建造员自行决定，但验收时须能在安全锥角之外的方向（如朝画布右侧、左侧、
   任意大幅偏横向的落点）也稳定拖入成功，并附带一次角度扫描或等效证据证明「无方向死角」。

## 8. 复核脚本（供建造员或再次复核参考，非交付物）

存于会话 scratchpad（不在仓库内）：
`review2-phone.mjs`（完整链路，含 §0 布局实测）、`review2-phone-vertical.mjs`（方向对照）、
`review2-phone-linear.mjs`（直线插值对照）、`review2-phone-rootcause.mjs`（scrollLeft/ghost 探测）、
`review2-phone-events.mjs`（低层 pointer 事件日志）、`review2-phone-sweep.mjs`（角度扫描）、
`review2-phone-final-evidence.mjs`（静默失败截图证据）、`review2-phone-scale-isolate.mjs` /
`review2-phone-chain-isolate.mjs`（缩放/手势链排查，用于排除误判）、`review2-pc.mjs`（PC 抽查）。

```bash
cd /Users/yuriiiz/Projects/Memories
npm run build
npx playwright test e2e/m2-transform.spec.ts --reporter=line
npx playwright test --reporter=line
npm run dev -- --port 5199 --strictPort
# 另开：node <scratchpad>/review2-phone-sweep.mjs   # 角度扫描，复现 45°~50° 边界
```

截图（会话 scratchpad `shots/`，非交付物）：
`r2-phone-0-initial.png`、`r2-phone-before-failed-drag.png` / `r2-phone-after-failed-drag.png`
（失败前后对比，肉眼确认「什么都没发生」）、`r2-phone-vertical-1.png`、`r2-phone-scale-isolate.png`、
`r2-pc-transformed.png`。

---

# 第 3 轮复核（builder 针对第 2 次打回返工后）

日期：2026-07-16。裁决：**pass**（放行定稿）。

沿用同一把尺（本 sprint 硬指标子集，见文首）。方法论沿用第 1/2 轮：起 `npm run dev`（独立端口
5321）、亲手写全新独立脚本（不采信 builder 自报脚本与自报数据，也不复用第 1/2 轮遗留脚本，
只参考其方法论）、横屏手机走 CDP `Input.dispatchTouchEvent` 真实触摸序列、PC 走真实
`page.mouse` 事件。全部复核脚本存于会话 scratchpad
`/private/tmp/claude-501/-Users-yuriiiz-Projects-Memories/61df20fa-e2cd-414a-8fa7-c0c01c35914c/scratchpad/`
（`r3-*.mjs`，非交付物）。

## 0. 代码核查：本轮改动是否确属限定在 `App.css` + `ItemTray.tsx`

读取 `src/App.css`、`src/components/ItemTray.tsx`、`src/components/Canvas.tsx`、
`src/components/Workbench.tsx` 全文，并核对文件 mtime：

```
16 Jul 00:29 src/model/types.ts
16 Jul 00:30 src/storage/persistence.ts
16 Jul 00:31 src/styles/tokens.css
16 Jul 00:51 e2e/m1-shell.spec.ts
16 Jul 02:04 src/state/gallery.ts
16 Jul 02:05 src/components/Canvas.tsx
16 Jul 02:06 src/components/Workbench.tsx
16 Jul 02:13 e2e/m2-transform.spec.ts
16 Jul 03:56 src/components/ItemTray.tsx   ← 本轮最新改动
16 Jul 04:03 src/App.css                    ← 本轮最新改动
```

mtime 分布与 builder 回执「本次只动 App.css 与 ItemTray.tsx」的声明一致：`Canvas.tsx`/
`Workbench.tsx`/`gallery.ts`/`m2-transform.spec.ts` 的 mtime 全部早于本轮，与第 1/2 轮时间戳同批，
本轮未被触碰；`model/types.ts`/`persistence.ts`/`tokens.css`/`m1-shell.spec.ts` 更早（M1/M2-S1 遗留）。

关键代码原文核对（读原文，非采信描述）：
- `src/App.css` 第 595 行（窄屏 `@media (max-width:880px)` 内 `.thumb`）：`touch-action: none;`
  ——第 2 轮打回时是 `pan-x`，现已改。宽屏基础规则 `.thumb`（第 233-247 行）仍是
  `touch-action: pan-y`，**未被本轮改动波及**（第 244 行原文核对一致）。
- `src/App.css` 第 568-569 行，窄屏 `.tray` 新增 `touch-action: none; overscroll-behavior-x: contain;`
  ——抽屉背景横滚交给 JS 独占。
- `src/App.css` 第 274-277 行 + 第 607-647 行：新增 `.tray__nav`（基础 `display:none`，仅窄屏媒体查询内
  `display:flex` + sticky 定位 + `.is-hidden`）——翻页箭头只在窄屏出现，核对与 PC 计算样式一致（见 §5）。
- `src/components/ItemTray.tsx`：`onPointerDown/Move/Up/Cancel` 用**欧氏距离**
  `Math.hypot(dx,dy) < DRAG_THRESHOLD(6px)` 判点选 vs 拖拽——对任意方向一视同仁，无方向偏置；
  新增 `updateNav`/`scrollByPage`/`onTrayPointerDown/Move/Up`（背景 drag-to-scroll）、
  `trayElRef`/`prevNavRef`/`nextNavRef`。
- `src/components/Canvas.tsx`、`src/components/Workbench.tsx`：逐行核对与第 1/2 轮读到的原文
  **逐字节一致**，本轮未改一行。

**过**——改动范围确属限定在 `App.css` + `ItemTray.tsx`，未波及已验收的 PC 基础规则、
`Canvas.tsx`（变换手势机）、`Workbench.tsx`（落点换算）、state/model/storage/tokens。

## 1. 生产构建 + e2e（亲手跑，独立于 builder 自报）

```
$ npm run build
> tsc -b && vite build
✓ 55 modules transformed.
✓ built in 323ms
BUILD_EXIT:0

$ npx playwright test e2e/m2-transform.spec.ts --reporter=line
Running 2 tests using 1 worker
[1/2] … 全链路变换：抽屉拖入 → 拖动改位 → 角手柄缩放 → 顶部手柄旋转 → 移除 → 刷新完整还原
[2/2] … 抽屉拖入落到画布外 → 不建 placement（真实拖拽的落点判定）
  2 passed (3.5s)
E2E_EXIT:0

$ npx playwright test --reporter=line   # 全套（含 M1）
  5 passed (4.3s)
FULL_E2E_EXIT:0
```

**过**——与 builder 自报一致，独立复核通过。

## 2. 横屏手机（844×390）方向死角复核——第 2 轮打回主因是否解决

独立脚本 `r3-angle-sweep.mjs`（全新写，非沿用 round2 脚本）：从抽屉首件物件出发，固定半径
200px，扫 **12 个角度**（-90°/-60°/-45°/-30°/-15°/0°/15°/30°/45°/60°/75°/90°，覆盖左右两侧，
比 round2 只扫单侧 0°~90° 更全面），每个角度前先 `freshApp` 清场景重建，逐一走真实触摸拖拽序列，
读 `placementCount`：

```
canvasBox { x: 11, y: 240.75, width: 822, height: 340 }
angle=-90° end=(26,256)  placementCount=1 OK
angle=-60° end=(26,292)  placementCount=1 OK
angle=-45° end=(26,334)  placementCount=1 OK
angle=-30° end=(26,365)  placementCount=1 OK
angle=-15° end=(26,385)  placementCount=1 OK
angle=0°   end=(71,392)  placementCount=1 OK
angle=15°  end=(123,385) placementCount=1 OK
angle=30°  end=(171,365) placementCount=1 OK
angle=45°  end=(212,334) placementCount=1 OK
angle=60°  end=(244,292) placementCount=1 OK
angle=75°  end=(264,256) placementCount=1 OK
angle=90°  end=(271,256) placementCount=1 OK
failedCount: 0 / 12
consoleErrors: [] pageErrors: []
```

**12/12 全绿**，round2 记录的 45°成功/50°失败的确定性分界**已消失**。

补充：`r3-extreme-horizontal.mjs`——不满足于「固定小半径」的扫描，直接复刻 round2 §4.4
「拖到画布远处」这个最贴近真实用户操作的场景，测「从抽屉拖到画布四个远角/中点」，落点角度
最高达 **82.5°（几乎纯水平）**：

```
far-right-near-far-corner:   angle=64.3° end=(808,547)  placementCount=1 OK
far-left-far-corner:         angle=5.7°  end=(36,547)   placementCount=1 OK
far-right-mid:                angle=73.1° end=(792,411)  placementCount=1 OK
far-left-mid:                 angle=4.9°  end=(52,411)   placementCount=1 OK
almost-pure-horizontal-right: angle=82.5° end=(825,292)  placementCount=1 OK
failedCount: 0 / 5
```

**低层事件核对**（`r3-pointer-events-log.mjs`，在 `tray-item[0]` 挂
`pointerdown/move/up/cancel` 监听，重放「朝画布右侧远处」82° 偏横向的真实触摸拖拽）：

```
startX,startY 71 192.25  endX,endY 791.9 342.75
event counts: { pointerdown: 1, pointermove: 23, pointerup: 1 }   ← pointercancel: 0
total events: 25
placementCount: 1
```

round2 记录的失败模式是「`pointerdown → 一次 pointermove → 立即 pointercancel`（3 事件、
拖入失败）」；本轮同类路径 **`pointercancel` 归零、23 个 `pointermove` 全数送达**，与
`getComputedStyle` 实测 `.thumb` 的 `touchAction: 'none'`（见下）互相印证，根因确认已清除。

**过**——方向死角（round2 打回主因）已解决，无遗留边界。

## 3. `touch-action` 计算值核对（不采信 builder 描述，直接读浏览器计算样式）

`r3-computed-style-check.mjs`：

```
844x390 computed styles: {
  thumbTouchAction: 'none',
  thumbWidth: '96px',
  trayTouchAction: 'none',
  trayOverscrollX: 'contain'
}
```

与 §0 代码原文、§2 事件日志三方吻合。**过**。

## 4. 翻页箭头（横向浏览承载区）复核——是否可用、是否遮挡关键交互

独立脚本 `r3-nav-arrows.mjs`：

```
total tray items: 14
prev class at start: tray__nav tray__nav--prev is-hidden   （起始隐藏，符合预期）
next class at start: tray__nav tray__nav--next             （无 is-hidden，说明检测到溢出）
scrollLeft at start: 0

card0 box: { x:23, y:154.75, width:96, height:75 }
card0 drag => placementCount: 1 OK   ← 首卡在起始态（prev 隐藏时）仍可正常拖拽，未被箭头遮挡

next arrow box: { x:789, y:154.75, width:30, height:75 }
scrollLeft after tapping next: 658
prev class after next-tap: tray__nav tray__nav--prev        （prev 变可见，无 is-hidden）

prev arrow box: { x:25, y:154.75, width:30, height:75 }
scrollLeft after tapping prev: 0                              ← 翻回起点

after repeated next taps: scrollLeft=686 maxScroll=686        ← 滚到底
next class at end: tray__nav tray__nav--next is-hidden        ← 到底自动隐藏

last card box (after scroll to end): { x:725, y:154.75, width:96, height:75 }
lastCard drag => placementCount: 2 OK   ← 末卡在滚到底、prev 可见时仍可正常拖拽，未被遮挡

consoleErrors: []
```

与 builder 自报 `scrollLeft 0→658→0` 精确吻合；额外验证了「滚到底部箭头自动隐藏」
（`686/686`）与「首卡/末卡在箭头出现时仍可正常拖拽入画布」（builder 自报只提到首卡）。

**过**——翻页箭头承载的横向浏览能力确实可用、不遮挡首尾卡片的拖拽交互。

**裁决判据说明（对照 builder 自陈的关注点 1）**：milestones.json M2 criteria 原文「顺滑手感：
拖/缩/转跟手…手柄命中准」与任务书「抽屉拖入须实现真实拖拽」均未点名交互形式必须是原生横滑
手势——只要求「横向浏览这个能力本身可用」。第 2 轮打回的技术死结是「同一张卡片、同一次触摸
不可能既属于拖拽入口又属于原生横滑手势」；builder 把两者拆成独立入口（卡片=纯拖拽、
两端箭头+背景 drag-to-scroll=纯浏览），经本轮独立复核确认两条路径互不干扰、都可靠可用。
**判定满足验收意图，不因「非原生手势」这一点回口味挑错。**

## 5. PC 端（1280×800，真实鼠标事件）抽查——无回归

独立脚本 `r3-pc-check.mjs`：

```
PC thumbComputed: { width: '107px', touchAction: 'pan-y', flex: '0 1 auto' }   ← 宽屏基础规则未变
PC tray-nav-prev display: none                                                  ← 翻页箭头 PC 端不出现
after drag-in placementCount: 1
dropped:     { x:120.37, y:201,   scale:1,      rotation:-5,    z:1 }
afterMove:   { x:160.37, y:231,   scale:1,      rotation:-5,    z:1 }
handle-scale count: 4  handle-rotate count: 1
scale handle hit-test (elementFromPoint): [ 'handle-scale' ×4 ]   ← 4 角手柄逐一命中测试全部为真
afterScale:  { x:160.37, y:231,   scale:1.563,  rotation:-5,    z:1 }
afterRotate: { x:160.37, y:231,   scale:1.563,  rotation:16.94, z:1 }
itemStyle: transform: translate(160.367px, 231px); z-index: 2;
tfStyle:   transform: rotate(16.9442deg) scale(1.56296);
countAfterRemove: 0
overflow: 0
consoleErrors: [] pageErrors: []
```

**过**——PC 端逐字段隔离正确（每步只变对应字段）、手柄命中全绿、只经 transform、无溢出无报错，
与第 1/2 轮结论一致，本轮无回归。

## 6. 横屏手机全链路（移动/缩放/旋转/移除/刷新还原）复核——含一次自我纠偏

首次尝试（`r3-phone-full-chain.mjs`）把物件落点放在画布靠上/靠下区域后，缩放/旋转/移除出现
不稳定：`afterRotate` 未变、`countAfterRemove` 从 0 变 2。逐层排查（`r3-phone-rotate-debug.mjs`，
挂低层事件监听 + `elementFromPoint` 双重核对）定位到根因：**这不是本轮改动引入的新问题**，而是
round1 §5.3 / round2 §4.6 已经记录并接受的**已知短视口限制**——844×390 视口下画布可见区仅
~149px（画布总高 340px 需要滚动），物件落点靠近画布上/下边缘再放大后，旋转杆/角手柄的实际
渲染位置会被 `.stage{overflow:hidden}` 裁出可视区，`elementFromPoint` 在该坐标命中的是裁剪区
之外「碰巧叠在同一屏幕坐标」的其他元素（抽屉缩略图），而非手柄本身——`Canvas.tsx`（手柄渲染/
裁剪相关的 `.stage` 规则）本轮完全未改（见 §0），此限制与本轮 `touch-action` 修复无关。

**验证结论合并复核**（`r3-phone-full-chain-v3.mjs`，先滚动使画布完整入视区，复刻 round1/round2
已验证通过的方法论）：

```
placed (tap-select path): { x:90, y:90, scale:1, rotation:-5, z:1 }
handle-scale count: 4
afterMove:   { x:112.9, y:103.75, scale:1,      rotation:-5,   z:1 }
br handle box (viewport 内?): {...} true
afterScale:  { x:112.9, y:103.75, scale:1.2208, rotation:-5,   z:1 }
rot handle box (viewport 内?): {...} true
afterRotate: { x:112.9, y:103.75, scale:1.2208, rotation:6.78, z:1 }
remove btn box (viewport 内?): {...} true
countAfterRemove: 0
consoleErrors: []
```

移动/缩放/旋转/移除逐一只改对应字段、手柄全部在视区内命中成功、移除归零、无报错——一旦手柄
不落在已知裁剪区内，链路可靠。另用 `r3-phone-full-chain-v2.mjs`（落点居中、真实触摸拖入→
选中→移动→缩放→旋转→移除→**刷新**）核对持久化：

```
before reload: { x:257, y:0, scale:1, rotation:-5, z:1 }
after reload:  { x:257, y:0, scale:1, rotation:-5, z:1 }
restoredExact: true
overflow: 0
```

**过**——「短视口手柄裁切」是已知、经两轮复核确认接受的固有限制（非本轮引入，非本轮验收范围），
不作为本轮打回理由；一旦规避该已知限制，全链路（移动/缩放/旋转/移除/刷新还原）在触摸端可靠、
无回归。

## 7. 结论表

| 硬指标 | 结论 |
|---|---|
| `npx playwright test e2e/m2-transform.spec.ts` exit 0 | 过 |
| 全套回归 exit 0 | 过 |
| `npm run build` exit 0 | 过 |
| 改动范围限定 `App.css`+`ItemTray.tsx`、未碰 Canvas/Workbench/state/model/storage/tokens | 过（mtime + 逐字核对） |
| 横屏手机抽屉拖入·方向可靠性（round2 打回主因） | **过，已解决**（12 角度扫描 + 5 组远角落点 + 低层事件日志三方印证，`pointercancel` 归零，无方向死角） |
| 翻页箭头承载横向浏览·可用且不遮挡关键交互 | 过（scrollLeft 0→658→686→0 全链路验证，首尾卡拖拽不受遮挡） |
| PC 端顺滑手感·无回归 | 过（手柄命中全绿、字段隔离正确、只经 transform） |
| 横屏手机全链路（移动/缩放/旋转/移除/刷新还原） | 过（短视口手柄裁切是已知、非本轮范围的固有限制，规避后链路可靠） |
| 变换仅经 transform/opacity + 合成层 + rAF | 过（`Canvas.tsx` 本轮未改，沿用已核实结论；本轮 inline style 复核仍只含 translate/rotate/scale） |
| 抽屉拖入为真实拖拽（非仅点选） | 过（`Pointer Events` + `setPointerCapture` + 6px 欧氏距离阈值，机制对任意方向一视同仁） |

九条全过，零条不过。**裁决：pass，放行定稿。**

builder 自陈的两个关注点均已按标准裁决：(1) 翻页箭头替代原生横滑手势——标准未强制手势形式，
只要求横向浏览能力可用且不遮挡，已独立验证满足，不做口味挑错；(2) 角度扫描落点均落在可见画布
内——本轮独立扫描额外覆盖了负角（左侧）与「拖到画布四个远角」两类 builder 未覆盖的场景，
结论一致（无方向死角），予以采信。

## 8. 复核脚本（供追溯，非交付物）

存于会话 scratchpad（不在仓库内）：
`r3-angle-sweep.mjs`（12 角度扫描）、`r3-extreme-horizontal.mjs`（拖到画布远角）、
`r3-pointer-events-log.mjs`（低层事件日志）、`r3-nav-arrows.mjs`（翻页箭头）、
`r3-pc-check.mjs`（PC 抽查）、`r3-computed-style-check.mjs`（touch-action 计算值核对）、
`r3-phone-full-chain.mjs`/`r3-phone-full-chain-v2.mjs`/`r3-phone-full-chain-v3.mjs`
（全链路，含一次自我纠偏排查短视口裁剪伪影）、`r3-phone-isolate.mjs`/`r3-phone-rotate-debug.mjs`
（排查用，定位「短视口手柄裁切」非本轮回归）。

```bash
cd /Users/yuriiiz/Projects/Memories
npm run build                                                  # exit 0
npx playwright test e2e/m2-transform.spec.ts --reporter=line   # 2 passed, exit 0
npx playwright test --reporter=line                            # 5 passed, exit 0
npm run dev -- --port 5321 --strictPort                        # 另开：角度扫描/翻页箭头/PC 抽查脚本打这个端口
```

截图（会话 scratchpad `shots/`，非交付物）：`r3-phone-0-initial.png`、`r3-phone-1-dropped.png`、
`r3-phone-2-transformed.png`、`r3-phone-2b-transformed.png`、`r3-phone-3-removed.png`。
