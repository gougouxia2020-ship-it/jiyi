# review-evidence · M2-S1 · reviewer

尺子：`.opc/sprints/M2-S1.json` 的 `goal` 字段（本 sprint 子集，不苛以 M2 全量标准；角手柄缩放/顶部手柄旋转/抽屉拖入画布明确是 M2-S2 的活，本次不查）。

对照材料：
- `.opc/phase1/milestones.json`（M2 条目）
- `.opc/phase1/success.json`
- `.opc/sprints/M2-S1.json`
- `receipts/M2-S1/receipt-builder.md`
- 源码：`src/components/Canvas.tsx`、`src/state/gallery.ts`、`src/components/Workbench.tsx`、`src/App.css`、`src/styles/tokens.css`

方法：亲手读代码 + 亲跑 `npm run build`/`npx playwright test e2e/m1-shell.spec.ts` + 自己写临时 Playwright 脚本（`e2e/_review-m2s1-temp.spec.ts`，验完已删，非交付物）驱动真实浏览器操作，核完全部结论后清理干净。

---

## 逐条核查

### 1. 物件可被选中，有视觉反馈（陶土红强调色，走 tokens.css）

**结论：过。**

- 代码：`Canvas.tsx` `handlePointerDown` 里 `setSelectedId(placementId)`；渲染时 `img` 加 `is-selected` class；`App.css` `.stage__node.is-selected { outline: 2px solid var(--color-accent); ... }`。`tokens.css` 里 `--color-accent:#a8572f` 是 M1 就有的既有 token，本 sprint 未新增/修改任何 token（读过 `tokens.css` 全文确认）。
- 实测：临时 spec 用鼠标点选一个物件后，读取 `getComputedStyle(node).outlineColor`，输出：
  ```
  REVIEW outlineColor= rgb(168, 87, 47) accentVar(hex)= #a8572f
  ```
  `#a8572f` = `rgb(168,87,47)`，逐字节匹配，确认选中态描边就是 tokens 里的陶土红，非新造配色。

### 2. 选中后按住可拖动改变位置；PC 鼠标与横屏触摸走同一套 Pointer Events

**结论：过。**

- 代码核查：`Canvas.tsx` 只挂 `onPointerDown/onPointerMove/onPointerUp/onPointerCancel` 四个回调，未见任何 `onMouseDown`/`onTouchStart` 分支，鼠标与触摸经浏览器统一成同一套 PointerEvent。
- PC 鼠标实测：`page.mouse.down()` → 移动 10 步 → `page.mouse.up()`，`.stage__item` 的 `style` 从
  `transform: translate(90px, 90px); z-index: 1;` 变为 `transform: translate(170px, 130px); z-index: 1;`，位置确实随拖动改变。
- 横屏触摸实测（关键：第一轮用原始 `boundingBox()` 坐标 + CDP `Input.dispatchTouchEvent` 失败，是我测试脚本的坐标未考虑「844×390 横屏视口下画布在折叠线以下、需要滚动」这一前提，不是产品缺陷；改用 `scrollIntoViewIfNeeded()` 校正坐标后复测，触摸路径与鼠标路径行为一致）：
  ```
  REVIEW touch node box (after scroll into view)= { x: 95.2, y: 243.7, width: 121.6, height: 146.6 } viewport= { width: 844, height: 390 }
  REVIEW touch styleBefore= transform: translate(90px, 90px); z-index: 1; styleAfter= transform: translate(138px, 114px); z-index: 1;
  ```
  同一测试里紧接着触摸点击删除按钮（`Input.dispatchTouchEvent` 落在 remove 按钮坐标上）也成功让 `placement` 数量归零 —— 触摸路径选中、拖动、删除全部走通，且与鼠标复用同一套回调（`handlePointerDown/Move/Up/Cancel`），未见分叉逻辑。判定：这条硬指标达标。

### 3. 有移除入口，点击后 placement 从状态删除、画布消失，刷新后不再出现（真删除）

**结论：不过（打回项）。** 单个孤立物件的删除链路本身没问题，但默认摆放流程下大概率出现的两件相邻物件场景，前一件的删除按钮会被后一件遮住，点不到。

- 单件隔离场景：确认过，选中 → 点 `[data-testid="placement-remove"]` → `placement` 数量 2→0 → 刷新后仍是 0。删除本身、持久化本身没问题。
- **但默认场景（这才是 demo 主流程会天天撞见的操作）：从抽屉连点两个物件（`tray-item.nth(0)` 与 `.nth(1)`，即最朴素的"放两件东西进房间"）后**，用真实（非 force）鼠标点击第一件的删除按钮：
  ```
  Error: locator.click: Test timeout of 30000ms exceeded.
  ...
  - <img alt="旧时书信" ...> from <div class="stage__item" ... data-placement-id="pl-...">…</div> subtree intercepts pointer events
  - retrying click action ×56 次，30s 后超时失败
  ```
  Playwright 的自动重试机制反复检测到「remove 按钮被兄弟节点的 `<img>` 挡住」，拒绝执行点击（这正是真实鼠标点击会撞到的情况，不是我测试脚本的问题）。
- 用 `elementFromPoint` 精确定位第一件删除按钮的几何中心，坐标处真正渲染的元素是第二件物件的图片，不是按钮本身：
  ```
  REVIEW box0= { x: 620.6, y: 246.75, width: 110, height: 137.5 }
  REVIEW box1= { x: 716.6, y: 246.75, width: 110, height: 73.3 }
  REVIEW removeBtnBox= { x: 718.6, y: 234.75, width: 24, height: 24 }
  REVIEW elementFromPoint at removeBtn center= <img class="stage__node" alt="旧时书信" src="/items/bedroom-2.png" style="transform: rotate(4deg) scale(1);">
  ```
  两件默认摆放物件的水平间距是 96px（`gallery.ts` 里 `x: 90 + (n % 4) * 96`），但每个物件宽度是 110px（`App.css` `.stage__node { width: 110px }`），间距天生小于宽度，同一行相邻物件必然互相压边。截图佐证（选中态描边清晰可见，右上角删除按钮的位置被第二件物件的照片压在下面）：`/private/tmp/claude-501/-Users-yuriiiz-Projects-Memories/d6a3566f-0dc2-4a92-a17e-44aeae306eff/scratchpad/m2s1-remove-overlap-evidence.png`。
- 根因是结构性的，不是巧合：`.stage__item` 在行内样式里各自带 `zIndex: p.z`，这让每个 `.stage__item` 成为独立的层叠上下文——后放的物件（z 更大）的整个子树，包括它的图片，天然叠在先放物件（z 更小）的子树之上，无论先放物件的删除按钮自身 CSS `z-index` 写多少都无法穿透到上层。也就是说：**只要默认摆放让两个物件在同一行相邻（同一行内几乎必然如此，因为 96px 间距 < 110px 宽度），先放的那个物件的删除按钮就永久点不到**，这不是边界样本，是默认流程的常态路径。
- 结论：这条不算过。这正是「有移除入口，点击后 placement 从状态删除」这条验收指标失败的具体场景——不是删除逻辑本身错，是删除入口的可点中性在最基本的多物件场景下就失效。

### 4. 变换只经 CSS transform 落位，无重排写法；拖动走合成层 + rAF 提交

**结论：过。**

- `grep` 全文确认 `Canvas.tsx` 里不存在任何动态改 `left`/`top` 的代码；`App.css` 里唯一出现 `left:0; top:0` 的地方是 `.stage__item` 的静态基准值（从不被 JS 改写），落位全部通过内联 `transform: translate(...)`。
- `handlePointerMove` 读过：中间态不调用 `setState`，判重后用 `requestAnimationFrame` 一帧最多改一次 `wrapperEl.style.transform`（直改 DOM，不经 React）；只有 `pointerdown`（选中，跨过阈值判定为拖动时再触发一次 `setDraggingId`）和 `pointerup`（提交 dispatch）才触发 React 重渲染。`.stage__item.is-dragging` 时才加 `will-change:transform`，拖完摘掉。实现思路与「合成层 + rAF 提交、不逐帧写 state」的要求一致。

### 5. 拖动结束后新位置持久化进 LocalStorage，刷新后还原

**结论：过。**

- 实测：拖动前 `style="transform: translate(90px, 90px); z-index: 1;"`，拖动后变为 `translate(170px, 130px)`，`page.reload()` 后再读同一 placement 的 `style`，逐字节等于拖动后的值：
  ```
  REVIEW styleReloaded= transform: translate(170px, 130px); z-index: 1;
  ```

### 6. scale/rotation 现有渲染值本 sprint 不应受影响

**结论：过。**

- `gallery.ts` 的 `move-placement` reducer 只 `{ ...p, x, y }`，未碰 `scale/rotation/z`。
- 实测：拖动前后读取内层 `<img>` 的 `style`，逐字节一致：
  ```
  REVIEW nodeStyleBefore(rotate/scale)= transform: rotate(-5deg) scale(1);
  REVIEW nodeStyleAfter(rotate/scale)= transform: rotate(-5deg) scale(1);
  ```

### 7. 亲跑 `npm run build` 与 `npx playwright test e2e/m1-shell.spec.ts`

**结论：过。**

```
$ npm run build
✓ 55 modules transformed.
✓ built in 315ms
EXIT_CODE=0
```

```
$ npx playwright test e2e/m1-shell.spec.ts --reporter=line
[1/3] 建场景 → 切场景 → 刷新后场景与布局状态完整还原
[2/3] 物件抽屉列出全部 14 件物件
[3/3] 场景背景不可重复且最多 3 个：第 4 个被阻止并置灰"素材已用完"
3 passed (1.9s)
EXIT_CODE=0
```

M1 无回归。

### 8. 亲自起 dev server + 浏览器自动化走一遍真实场景

**结论：已做，见上。** `playwright.config.ts` 的 `webServer` 配置会自动拉起 `npm run dev -- --port 5178 --strictPort`；我写的临时 spec（`e2e/_review-m2s1-temp.spec.ts`，验完已删）跑在这个真实 dev server + 真实 Chromium 上，覆盖了：建场景→放物件→选中（视觉反馈校验）→拖动→松手位置变化→刷新→位置还原；选中→删除→消失→刷新→仍不在（单件场景过，两件相邻场景不过，见第 3 条）；触摸路径全链路（选中/拖动/删除）。全部是真实操作证据，非只读代码判过。

---

## 打回理由（四件套）

- **缺什么 / 错在哪**：移除入口（`.stage__remove` 删除按钮）在默认摆放产生的相邻物件重叠场景下点不中——按钮被同一行内后放置的物件的 `<img>` 挡住，`elementFromPoint` 与真实点击（Playwright 非强制 click 重试 30s 超时）双重证实。根因结构性：`.stage__item` 各自用行内 `zIndex` 建立独立层叠上下文，先放物件的删除按钮无法穿透到后放物件之上；而默认打包间距 96px < 物件宽度 110px，同一行相邻物件必然互相压边，这不是边界情况，是最基本的"放两件东西"就会撞见的路径。
- **对照哪条标准**：`M2-S1.json` goal 字段——"提供移除入口并可移除"；`milestones.json` M2 criteria 的移除能力要求；这条在默认使用路径下不成立。
- **改到什么程度算过**：至少要保证「选中态/正在操作的物件浮到最上层」（比如选中时临时把该物件的 z-index 提到比同场景所有其他物件都高，业界画布类交互的常见做法），使删除按钮在物件重叠时依然可点中；重做后需要用与本次相同的"默认两件相邻摆放"场景复测，`elementFromPoint` 在按钮几何中心应命中按钮本身而非邻居物件，且真实（非 force）click 应在正常超时内成功。

## 其余各条结论

1 选中视觉反馈：过。2 拖动改位 + PC/触摸统一 Pointer Events：过。3 移除入口：**不过**（见上）。4 CSS transform 落位 + 合成层/rAF：过。5 拖动持久化刷新还原：过。6 scale/rotation 不受影响：过。7 build + e2e 无回归：过。8 亲手操作证据：已完成。

## 现场清理

临时核验用文件 `e2e/_review-m2s1-temp.spec.ts` 已删除，不作为交付物遗留；证据截图留在
`/private/tmp/claude-501/-Users-yuriiiz-Projects-Memories/d6a3566f-0dc2-4a92-a17e-44aeae306eff/scratchpad/m2s1-remove-overlap-evidence.png`（临时目录，仅供本轮评审引用）。

---

# 第 2 轮复核（回应建造员返工 · at_tick 5）

尺子不变：`.opc/sprints/M2-S1.json` 的 `goal` 字段。本轮核对建造员针对上一轮打回（`rework[0]`：删除入口在默认相邻摆放场景下被遮挡）提交的返工，改动只有一处——`src/components/Canvas.tsx` 引入 `maxZ` + 选中态临时 `renderZ = selected ? maxZ + 1 : p.z`，纯渲染值、不写 `dispatch`、不进 `GalleryState`。

方法：亲手读改动后的 `Canvas.tsx`/`gallery.ts`/`App.css`/`App.tsx`/`storage/persistence.ts` 全文 + 亲跑 `npm run build`/`npx playwright test e2e/m1-shell.spec.ts` + 自己独立写两份临时 Playwright spec（`e2e/_review-m2s1-rework-temp.spec.ts` 6 条、`e2e/_review-m2s1-rework-temp2.spec.ts` 2 条，均验完已删，非交付物）驱动真实浏览器操作复现打回场景与全部 goal 检查点，不依赖建造员回执里的截图/输出，自己重新打靶。

## 逐条核查

### 1（原打回项复测）两件默认相邻摆放，选中先放者，真实（非 force）点击删除按钮

**结论：过，打回项已解决。**

复现与上一轮打回完全一致的路径：从抽屉连点两个物件（默认间距 96px < 物件宽度 110px，同一行天然压边）→ 真实点击选中先放的那个 → 真实（非 force、5s 超时预算）点击其删除按钮：

```
REVIEW hitAtRemoveBtnCenter= {"tag":"BUTTON","testid":"placement-remove","cls":"stage__remove"}
REVIEW test1 PASS
```

`elementFromPoint` 在删除按钮几何中心命中的是按钮本身（上一轮是邻居的 `<img>`）；`placements` 数量 2→1；`page.reload()` 后仍是 1（真删除、持久化未受影响）。与上一轮 30s 超时失败形成对照，本轮点击在预算内即时成功。

### 2. 单物件场景删除未被破坏

**结论：过。**

单 placement 场景：选中 → 真实点击删除按钮 → 数量 1→0 → 刷新后仍是 0：

```
REVIEW test2 PASS
```

### 3. 取消选中后 z 层级回落是否合理，是否污染持久化/相对层级

**结论：过，是有意为之的纯渲染层修复，未产生副作用。**

三层证据：

- 直接读源码：`Canvas.tsx` 里 `maxZ`/`renderZ` 都是渲染函数内的局部变量，`gallery.ts` 的 `move-placement`/`remove-placement` reducer 未新增任何碰 `z` 字段的分支；`App.tsx`/`storage/persistence.ts` 的 `GalleryState` 类型与全量落盘路径本轮未改一行，`selectedId` 只存在于 `Canvas.tsx` 的 React 本地 `useState`，从未进入 `GalleryState`，物理上不可能被 `saveState` 落盘。
- 实测选中/取消选中的 z 变化轨迹（两件物件，先放 `z=1`、后放 `z=2`）：
  ```
  REVIEW zBeforeSelect= 1 2
  REVIEW zWhileSelected= 3 2      // maxZ(2)+1，仅选中物件临时置顶，邻居 z 不受影响
  REVIEW zAfterDeselect= 1 2      // 点画布空白处取消选中后，严格回落到各自持久化值
  REVIEW test3 PASS
  ```
- 补验「拖动后不取消选中就刷新」与「拖动后先取消选中再刷新」两种时序，确认位移(x/y)与 z 的持久化边界：
  ```
  REVIEW styleWhileStillSelected= transform: translate(170px, 130px); z-index: 2;   // 松手后仍选中，z 临时值仍生效（预期内，选中态未清空）
  REVIEW styleAfterDeselect=      transform: translate(170px, 130px); z-index: 1;   // 主动取消选中 → 回落到持久化 z=1
  REVIEW styleReloaded=           transform: translate(170px, 130px); z-index: 1;   // 刷新后（selectedId 是本地 state，刷新必然清空）与取消选中后逐字节一致
  REVIEW test5b PASS
  ```
  刷新页面本身必然清空 `selectedId`（组件重新挂载，`useState` 初值 `null`），所以「刷新后 z 回到持久化值」与「主动取消选中」是同一条回落路径，不存在“选中态被意外持久化”的可能。position（`translate(x,y)`）分量在两种时序下逐字节一致，未受 z 改动影响——这才是 goal 里“位置持久化刷新还原”真正要求的部分。
- 额外对照 M1 e2e 实际验的场景（从不点选物件、只切场景+刷新）：`styleBefore`/`styleAfter` 逐字节一致，`z-index: 1` 全程未变，证明 M1 用到的「刷新还原 inline style 逐字节比对」逻辑完全没有被这次改动触碰到：
  ```
  REVIEW m1StyleBefore= transform: translate(90px, 90px); z-index: 1; m1StyleAfter= transform: translate(90px, 90px); z-index: 1;
  REVIEW test7 PASS
  ```

结论：z 会在“选中”这一渲染帧被临时改写用于视觉置顶，但从不写回状态、从不持久化，取消选中（含刷新导致的选中态清空）后必定回落到 `placement.z` 的真实持久化值；未选中物件之间的相对层级全程不受影响。这是修复本身的设计意图（Canvas.tsx 顶部块注释已写明），不是意外副作用，不破坏任何已验收行为。

### 4. 选中视觉反馈（陶土红强调色，走 tokens.css）

**结论：过。**

```
REVIEW outlineColor= rgb(168, 87, 47) accentVar= #a8572f
REVIEW test4 PASS
```
`--color-accent:#a8572f` = `rgb(168,87,47)`，逐字节匹配；`tokens.css` 本轮未改。

### 5. 拖动改位（PC 鼠标）；变换只经 transform；位置持久化刷新还原；scale/rotation 不受影响

**结论：过。**

```
REVIEW styleBefore= transform: translate(90px, 90px); z-index: 1; nodeStyleBefore= transform: rotate(-5deg) scale(1);
REVIEW styleAfter=  transform: translate(170px, 130px); z-index: 2; nodeStyleAfter= transform: rotate(-5deg) scale(1);
```
`style` 全程不含 `left:`/`top:`，落位只经 `transform`；内层 `<img>` 的 `rotate/scale` 拖动前后逐字节一致，`move-placement` reducer 未碰这两个字段。位置(x/y)持久化刷新还原见上一条（3）里的 `test5b`，逐字节匹配。

### 6. 横屏触摸与 PC 鼠标走同一套 Pointer Events（选中/拖动/删除）

**结论：过。**

用 CDP `Input.dispatchTouchEvent` 派发真实触摸序列（844×390 视口）：
```
REVIEW touch styleBefore= transform: translate(90px, 90px); z-index: 1; styleAfter= transform: translate(138px, 114px); z-index: 2;
REVIEW test6 PASS
```
单指触摸落下即选中、拖动改位、点击删除按钮全部走通（复用与鼠标路径完全相同的 `handlePointerDown/Move/Up/Cancel`，`Canvas.tsx` 全文未见任何 `onTouchStart`/`onMouseDown` 分支）。

### 7. `npm run build` 与 `npx playwright test e2e/m1-shell.spec.ts`

**结论：过。**

```
$ npm run build
✓ 55 modules transformed.
✓ built in 316ms
BUILD_EXIT=0

$ npx playwright test e2e/m1-shell.spec.ts --reporter=line
[1/3] 建场景 → 切场景 → 刷新后场景与布局状态完整还原
[2/3] 物件抽屉列出全部 14 件物件
[3/3] 场景背景不可重复且最多 3 个：第 4 个被阻止并置灰"素材已用完"
3 passed (1.9s)
E2E_EXIT=0
```
M1 无回归，与建造员回执一致，自己独立重跑复现。

## 总裁决

打回项（删除入口默认相邻摆放场景下被遮挡）已用「选中态临时渲染层叠置顶」方案解决，亲手复现上一轮的确切失败路径确认已修复；该方案不写状态、不持久化，取消选中后层叠正确回落，未污染相对层级，也未触碰 M1 已验收的刷新还原逐字节比对逻辑。sprint goal 全部检查点（选中视觉反馈、拖动改位、PC/触摸统一 Pointer Events、移除、变换只经 transform、位置持久化刷新还原、scale/rotation 不受影响）逐条亲测过；`npm run build` 与 `e2e/m1-shell.spec.ts` 均 exit 0 无回归。

**裁决：pass，M2-S1 定稿放行。**

## 现场清理

本轮临时核验文件 `e2e/_review-m2s1-rework-temp.spec.ts`、`e2e/_review-m2s1-rework-temp2.spec.ts` 已删除，不作为交付物遗留；`test-results/` 临时产物已清理；未改动任何 `src/`、`.opc/` 之外或之内的源文件。
