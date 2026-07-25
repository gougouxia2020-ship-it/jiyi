# receipt-builder · M2-S1

Sprint 契约（M2-S1.json goal，逐字核对过）：补齐画布内核心变换机制底座——
物件可被选中、按住拖动改变位置，提供移除入口并可移除；变换渲染只经 CSS transform 落位，
走合成层 + requestAnimationFrame 提交、不触发布局重排；PC 鼠标与横屏手机触摸统一走 Pointer Events 处理；
拖动结束后 x/y 落回状态经 LocalStorage 持久化，刷新完整还原。

> 本 sprint **不做**：角手柄缩放、顶部手柄旋转、抽屉拖入画布（M2-S2 的活）；
> scale/rotation 字段渲染值本 sprint 未改动，原样保留 M1 写入的值。
> 本 sprint 不新写 e2e spec 文件（e2e/m2-transform.spec.ts 属下个 sprint）。

---

## 一、改动清单（全部落在 .opc/ 之外）

改写源码：

- `src/state/gallery.ts`
  - `GalleryAction` 新增两个动作：`move-placement`（拖动松手提交 x/y）、`remove-placement`（移除某条 placement）。
  - reducer 新增对应两个 case：
    - `move-placement`：只在 `state.mode === 'edit'` 生效（与 `place-item` 同款守卫，为 M3 的双模式只读留口子）；命中的 placement 只改 `x/y`，`scale/rotation/z` 原样保留（未越界碰 M2-S2 的字段）。
    - `remove-placement`：同样只在编辑模式生效；从 `placements` 数组里 filter 掉该 id。
  - 未改动 `place-item`、`create-scene`、`select-scene`、`set-mode` 等既有逻辑与派生选择器。

- `src/components/Canvas.tsx`（改动最集中的文件，重写了渲染 + 交互部分）
  - 新增 `dispatch: Dispatch<GalleryAction>` prop。
  - 新增本地 UI 状态：`selectedId`（当前选中的 placement id）、`draggingId`（当前正在拖动的 placement id，仅用于 CSS class 切换，不参与位置计算）。
  - 每个 placement 现在渲染成两层结构：外层 `<div className="stage__item">` 只负责位移（`transform: translate(x, y)`），内层 `<img className="stage__node">` 只负责旋转/缩放（`transform: rotate(r) scale(s)`，值原样取自 placement，未改动）。两层嵌套在渲染结果上与单层 `translate+rotate+scale` 数学等价（平移与「绕自身中心旋转缩放」可交换），视觉与原来完全一致。
  - 选中：`img` 的 `onPointerDown` 触发 `setSelectedId`，并给选中的 `img` 加 `is-selected` class（CSS 描边用 tokens 已有的 `--color-accent` 陶土红，未新造配色）；点击画布空白处（`.stage` 的 `onPointerDown`）清空选中（子元素的 pointerdown 都 `stopPropagation`，避免误触发）。
  - 拖动：Pointer Events 统一处理（`onPointerDown/onPointerMove/onPointerUp/onPointerCancel`，鼠标与触摸走同一套回调，未写任何 `mouse*`/`touch*` 专属分支）；`onPointerDown` 里 `setPointerCapture`，保证指针移出元素范围时仍能收到后续事件。拖动路径上：
    - 中间态只经 `requestAnimationFrame` 直接改外层 wrapper 的 `style.transform`（原生 DOM API，不写 React state），避免拖动路径上每帧触发 React 重渲染；
    - 低于 3px 位移视为「点击选中」而非拖动（`DRAG_THRESHOLD`），过滤鼠标/手指的轻微抖动；
    - 松手（`pointerup`）才把最终 `x/y` 一次性 `dispatch({ type: 'move-placement', ... })` 提交进状态；`pointercancel`（如触摸被系统手势打断）不提交，并把手动改过的 DOM `transform` 还原回拖动前的值，避免脱离 state 的视觉残留；
    - 同一时刻只允许一路拖动（`dragRef` 是单一 ref，新的 `pointerdown` 若已有拖动在跑会被忽略），避免多点触控互相干扰状态。
  - 移除：选中态下、且编辑模式下，在 `.stage__item` 内浮出一个 `.stage__remove` 按钮（挂在外层 wrapper 下，随位移 `translate` 联动、不随内层的旋转缩放走，保持正立、好点击）；点击 `dispatch({ type: 'remove-placement', ... })` 并清空选中。按钮尺寸取自 tokens 里为手柄预留的 `--handle-hit`（24px 触摸命中区）、边框/底色取自 `--handle-border-w`/`--handle-bg`，图形色取 `--color-accent`——沿用已有 token，未新造视觉语言。
  - 切场景 / 切模式时用 `useEffect` 清空 `selectedId`（选中态不跨场景；游客模式下不可选中/拖动/删除——`editable = state.mode === 'edit'` 在 `handlePointerDown` 与删除按钮渲染上都做了守卫）。
  - 卸载兜底：`useEffect` cleanup 取消未跑完的 `rAF`。

- `src/components/Workbench.tsx`：`<Canvas>` 多传一个 `dispatch={dispatch}` prop（Canvas 现在要能派发 move/remove 动作）。

- `src/App.css`
  - `.stage__node`：去掉旧的 `position:absolute` + `pointer-events:none`（原来画布上的物件完全不可交互，现在要能收到指针事件）；新增 `cursor:grab`、`touch-action:none`（触摸拖动时不让浏览器把手势当页面滚动/缩放处理）、`display:block`。
  - 新增 `.stage__item`（位移容器，`position:absolute;left:0;top:0`，配合内联 `transform:translate` 落位，不用 `left/top` 触发重排）与 `.stage__item.is-dragging { will-change: transform }`（只在实际拖动时提示合成层，不常驻）。
  - 新增 `.stage__node.is-selected`（`outline` 描边，`--color-accent` 陶土红——`outline` 不占布局盒、不触发重排，比 `border` 更合适）与 `.stage__node.is-dragging`（`cursor:grabbing`）。
  - 新增 `.stage__remove`（删除按钮样式，全部变量取自 tokens：`--handle-hit`/`--handle-border-w`/`--handle-bg`/`--color-accent`/`--radius-pill`/`--shadow-card`/`--dur-fast`/`--ease-out`）。

未改：`src/model/types.ts`（Placement 字段本 sprint 未变）、`src/storage/persistence.ts`（persist 机制沿用 M1 契约，move/remove 走的还是同一条 `useEffect(saveState)` 全量落盘路径，未新增任何字段级/增量持久化）、`src/assets/manifest.ts`、`src/components/ItemTray.tsx`（点击放入画布机制本 sprint 明确不动）、`e2e/m1-shell.spec.ts`（未碰，回归照跑）、`src/styles/tokens.css`（未新增/修改任何 token，全部复用既有变量）。

---

## 二、关键设计取舍

1. **为什么位移单独拆一层 wrapper，而不是像 M1 那样单元素 `translate+rotate+scale` 全塞一行 style？**
   数学上两者等价（平移与「绕自身中心旋转缩放」可交换，验证过：单元素 `transform: translate(x,y) rotate(r) scale(s)` 在 `left:0;top:0` 基准下与旧写法 `left:x;top:y; transform:rotate(r) scale(s)` 渲染结果逐像素一致）。拆两层的实际收益：
   - 删除按钮需要「跟着位移走、但不跟着旋转/缩放走」（按钮本身要保持正立、方便点击，不应该随物件倾斜）。把按钮放进只有 `translate` 的外层容器里，它会自动继承外层的位移（浏览器渲染时天然复合），完全不需要额外 JS 去同步按钮位置——拖动时 rAF 只改外层一个 `transform`，内层图和按钮都跟着走，零额外计算。
   - 选中态描边（`outline`）加在内层 `<img>` 上，天然贴合旋转/缴放后的图形轮廓（看起来像是「框住了这张倾斜的照片」），而不是框住一个不旋转的外框。
   - 代价：多了一层 DOM，可忽略（当前场景内物件数量级是个位数到十位数）。

2. **怎么统一 Pointer Events（不分鼠标/触摸两套）？**
   所有交互只挂 `onPointerDown/onPointerMove/onPointerUp/onPointerCancel` 四个回调，配合 `setPointerCapture`（保证指针滑出元素边界后仍持续收到该指针的后续事件，鼠标拖出图片外、手指划出图片外都一样处理）。没有任何 `onMouseDown`/`onTouchStart` 之类的分支代码。用 Chrome DevTools Protocol 的 `Input.dispatchTouchEvent` 模拟真实触摸序列验证过：触摸落下触发的是同一个 `pointerdown`（`event.pointerType === 'touch'`），选中态、拖动、删除全部走通，和鼠标路径复用同一份处理函数。

3. **怎么避免拖动路径触发重排 / 频繁重渲染？**
   - 落位只用 `transform`（`translate`/`rotate`/`scale`），没有任何地方再写 `left`/`top`/`width`/`height` 之类会触发布局重排的属性变更。
   - 拖动中间态：`pointermove` 里算出新坐标后，不调用 `setState`，而是在 `requestAnimationFrame` 回调里直接对 DOM 元素的 `style.transform` 赋值（`cur.wrapperEl.style.transform = ...`），一帧最多改一次（用 `rafId` 判重，避免同一帧内因多次 `pointermove` 重复排队）。整个拖动过程中 React 只在手势开始（选中 + 若干毫秒后越过阈值判定为拖动）与结束（清 `draggingId`、`dispatch` 提交）各触发一两次重渲染，拖动路径本身零 `setState`。
   - `.stage__item.is-dragging` 时才加 `will-change:transform` 提示合成层，拖完就摘掉，不长期占用合成层资源。

4. **为什么 3px 拖动阈值？**
   区分「点击=选中」与「拖动=改位」：如果一按下就无阈值地开始按位移写状态，鼠标点击时的像素级抖动会被误判成一次「拖动」，导致每次点击都产生一条不必要的 `move-placement` dispatch（哪怕位置没变化多少，也会污染状态更新与 LocalStorage 写入）。阈值内只做选中，不产生位移提交。

5. **持久化路径完全复用 M1 既有机制**：`move-placement`/`remove-placement` 和 `create-scene`/`place-item` 等一样，只是改了 `GalleryState.placements`，走的还是 `App.tsx` 里那条 `useEffect(() => saveState(state), [state])` 全量落盘路径，没有新增任何存储代码。刷新后 `loadState` 全量读回，位置/删除结果自然还原——这条链路本 sprint 未新增代码，只是新的 action 走了已有的落盘管道。

6. **游客模式守卫**：`move-placement`/`remove-placement` 在 reducer 层和 Canvas 交互层做了双重守卫（`state.mode !== 'edit'` 直接拒绝/不触发），选中态在切模式时也会被清空。这不是本 sprint 的验收点，但为 M3「游客模式只读，点物件只弹故事」预留了口子，不需要下个 sprint 再回来加这层判断。

---

## 三、自检（逐条对照 sprint 契约）

1. **`npm run build`（exit 0，无类型错误）** —— 过。
   `tsc -b && vite build` 干净通过，`✓ built in 338ms`，无 TS 报错。

2. **`npx playwright test e2e/m1-shell.spec.ts --reporter=line`（exit 0，未回归）** —— 过。
   `3 passed`。三条 M1 用例（建/切场景+刷新还原、抽屉 14 件、背景不可重复上限 3）全绿，改动未破坏既有外壳/持久化行为。

3. **手动核验：选中 → 拖动 → 松手位置改变 → 刷新后位置还原**（PC 鼠标路径） —— 过。
   写了一个临时 Playwright spec（验完已删除，非交付物）跑通整条链路：
   - 建场景 + 放两件物件 → 点第一件 → `.stage__node` 出现 `is-selected` class（陶土红描边）→ 记录初始 `style="transform: translate(90px, 90px); z-index: 1;"`。
   - `page.mouse.down()` → 移动 80/40px（12 步）→ `page.mouse.up()` → style 变为 `translate(170px, 130px)`，且确认 style 字符串里只含 `translate(`、不含 `left:`/`top:`（验证「全程只经 transform 落位」）。
   - `page.reload()` → 两条 placement 仍在，位置 `style` 与拖动后逐字节一致（LocalStorage 完整还原）。

4. **手动核验：选中 → 点删除 → 物件消失 → 刷新后不再出现** —— 过。
   同一临时脚本里：选中第二件物件 → 点其 `[data-testid="placement-remove"]` → `placement` 数量从 2 降到 1 → 刷新后仍是 1（删除结果持久化）。

5. **手动核验：点画布空白处取消选中** —— 过（同脚本）：重新选中剩余物件后点 `canvas-bg` 空白处，`is-selected` class 消失、删除按钮同步消失。

6. **手动核验：横屏手机触摸路径与 PC 鼠标走同一套逻辑** —— 过。
   另一个临时 Playwright spec（验完已删除）：viewport 设为 844×390 + `hasTouch:true` + `isMobile:true`，用 Chrome DevTools Protocol 的 `Input.dispatchTouchEvent` 派发真实触摸序列（`touchStart`/`touchMove`×8/`touchEnd`）：
   - 单指触摸落下即选中（`is-selected` 出现，删除按钮浮出）；
   - 触摸拖动序列后 `style` 从 `translate(90px, 90px)` 变为 `translate(154px, 122px)`，含 `translate(`；
   - 触摸点击删除按钮（`.tap()`）→ 物件消失。
   全程复用与鼠标路径完全相同的 `onPointerDown/Move/Up/Cancel` 回调，未写任何触摸专属分支代码——这就是「PC 与触摸统一手柄」要验的东西。

7. **视觉核对（人工看）** —— 过。截图确认：选中态是陶土红 `outline`（`--color-accent`），删除按钮是陶土红描边圆形「×」（奶油底、`--handle-bg`），与场景 chip 的选中态用色一致，未引入新配色；未破坏「旧信」暖奶油纸底/衬线/整体 Workbench 布局。

8. **scale/rotation 不受本 sprint 改动影响** —— 过。reducer 里 `move-placement` 只 `{ ...p, x, y }`，未碰 `scale`/`rotation`/`z`；Canvas 渲染里内层 `<img>` 的 `transform: rotate(${p.rotation}deg) scale(${p.scale})` 原样取自 placement，未做任何改写。M1 e2e 里比对整条 `style` 字符串前后一致的用例仍然绿，间接印证了这一点（该用例没有触发任何拖动/删除，只是切场景来回，style 字符串本该原样不变，也确实原样不变）。

---

## 四、已知限制（有意不做，留给后续 sprint 或已在设计里预留口子）

- 角手柄缩放、顶部手柄旋转、抽屉拖入画布：本 sprint 明确排除，M2-S2 的活。
- 同时多指分别拖动两个不同物件：`dragRef` 是单一引用，同一时刻只支持一路拖动生效，第二根手指按下会被忽略（不会导致状态错乱，但也不支持双物件同时被两指分别拖动）。这不在本 sprint 验收范围内，双人协作/多点触控编辑不是「陈列室 demo」的场景。
- 键盘可达性（方向键移动选中物件、Tab 聚焦、Delete 键删除）未做，本 sprint 验收只要求指针交互（鼠标/触摸），未要求键盘操作。

---

## 五、复核可复现命令

```bash
cd /Users/yuriiiz/Projects/Memories
npm run build
npx playwright test e2e/m1-shell.spec.ts --reporter=line
npm run dev -- --port 5178 --strictPort   # 另开终端手动核验选中/拖动/删除/刷新还原
```

---

## 六、返工记录（第 2 轮，回应 reviewer 打回 · at_tick 4）

### 打回原文回顾

`receipts/M2-S1/review-evidence.md` 第 3 条与 `.opc/sprints/M2-S1.json` 的 `rework[0]`：默认摆放间距（`gallery.ts` 里 `x: 90 + (n % 4) * 96`，96px）小于物件宽度（`App.css` `.stage__node { width: 110px }`，110px），同一行相邻两件物件必然互相压边；`.stage__item` 各自用行内 `zIndex: p.z` 建立独立层叠上下文，后放物件（z 更大）的整个子树天然叠在先放物件（z 更小）之上——先放物件的删除按钮无法穿透到上层。真实（非 force）Playwright 点击在这个场景下 30s 超时失败，`elementFromPoint` 在删除按钮几何中心命中的是邻居的 `<img>`。这是最基本的"放两件东西"路径，不是边界样本。

### 改了什么

只改了一处渲染逻辑，`src/components/Canvas.tsx`：

1. 在 `placements` 取出之后，算一个 `maxZ`（当前场景内所有 placement 持久化 `z` 字段的最大值）：
   ```ts
   const maxZ = placements.reduce((max, pl) => (pl.z > max ? pl.z : max), 0);
   ```
2. 每个 `.stage__item` 的行内 `zIndex` 从原来直接用 `p.z`，改成按选中态分支：
   ```ts
   const renderZ = selected ? maxZ + 1 : p.z;
   // ... style={{ transform: ..., zIndex: renderZ }}
   ```
   选中的 placement 渲染层叠永远是「本场景当前最大 z + 1」，保证它盖过场景内所有其他物件（无论那些物件的 z 是多少、是先放还是后放）；未选中的 placement 渲染层叠仍然用它自己的 `p.z`，物件之间原有的相对层级不受影响。

3. 没有改 `src/state/gallery.ts` 的 reducer、没有新增 dispatch action、没有碰 `placement.z` 字段本身——`move-placement` 仍然只改 `x/y`，`remove-placement` 仍然只是 filter。`maxZ`/`renderZ` 都是每次渲染时现算的本地变量，不进 `GalleryState`，不经 `saveState` 落 LocalStorage。取消选中后（切场景/切模式的 `useEffect` 清空 `selectedId`，或点画布空白处），该物件下一次渲染读到 `selected === false`，`renderZ` 自动回落回 `p.z`，物理上没有"复原"这个操作要做——因为从来没有状态被改过，只是这一帧不再套用临时值。

4. 顺带在 `Canvas.tsx` 顶部块注释里补了一段说明这个修复的动机与机制（第 13-18 行），没有改其余文件。

`src/state/gallery.ts`、`src/components/Workbench.tsx`、`src/App.css`、`src/model/types.ts`、`src/storage/persistence.ts` 本轮均未改动。

### 为什么这样能解决遮挡问题

- 根因是"层叠顺序完全由各自的持久化 `z` 决定，且先放的物件 z 天生比后放的小"。选中态置顶把选中物件的渲染层叠临时提到「全场景最大值 + 1」，无论它原来的 `z` 多小、无论有几个物件在它周围，它这一帧一定是场景里视觉上最靠上的——包括正在拖动的情况（`selectedId` 在 `pointerdown` 时就设置，整个拖动过程中都保持选中，`renderZ` 全程有效，不会拖到一半又被邻居盖住）。
- 只影响 `style.zIndex` 这一个渲染值，不写 `dispatch`、不碰 `GalleryAction`、不碰 reducer、不落 LocalStorage——符合打回理由里"置顶应只影响视觉层叠，不能污染持久化 placement.z 数据"的要求。因为这次需求不要求"选中即置顶且松手后仍保持最上层"（sprint 契约里 `move-placement` 明确只改 x/y），所以选的是"临时层叠值，不写回状态"这一支，而不是真的把新 z 写回 state。
- `maxZ + 1` 而不是写死一个巨大常量：用真实数据现算，保证严格大于场景内任何一个物件当前的 `z`，不依赖"物件数量不会很多"之类的假设，也不会因为常量选得不够大而在极端场景下失效；同时因为只对选中的那一个物件生效，未选中物件之间的相对层叠关系（`p.z` 谁大谁小）完全没被打乱。

### 自检结果

1. `npm run build` —— 过，exit 0，`tsc -b && vite build` 干净通过，`✓ built in 306ms`，无类型错误。
2. `npx playwright test e2e/m1-shell.spec.ts --reporter=line` —— 过，`3 passed`，exit 0，M1 三条用例（建/切场景+刷新还原、抽屉 14 件、背景上限 3）全绿，未回归。
3. 亲自复现评审员的确切步骤并验证已修复：写了临时 spec `e2e/_verify-m2s1-rework-temp.spec.ts`（验完已删除，非交付物），起真实 dev server + 真实 Chromium，跑法与评审证据一致——从抽屉连点两个物件（默认相邻间距）→ 选中先放的那个 → 真实（非 force）点击其删除按钮：
   - `elementFromPoint` 在删除按钮几何中心的命中结果：`{ tag: 'BUTTON', testid: 'placement-remove', cls: 'stage__remove' }`（修复前是邻居的 `<img class="stage__node">`）。
   - 选中物件（先放，持久化 `z=1`）的渲染 `zIndex` 读到 `3`，后放邻居（`z=2`）读到 `2`，`3 > 2` 验证置顶生效（`maxZ=2`，`renderZ = 2+1 = 3`）。
   - `removeBtn.click({ force: false, timeout: 5000 })` 在 5s 超时内成功（对照打回记录里的 30s 超时失败），`placement` 数量 2→1，刷新后仍是 1（真删除、持久化未受影响）。
   - 额外验证取消选中后层叠回落：选中再点画布空白处取消选中，读到 `firstZ=1`、`secondZ=2`——严格等于两者各自的持久化 `z` 值，证明临时置顶值不会污染物件间原有的相对层级、也没有任何残留状态。
   - 额外验证单物件场景（防止"只修好多物件、单物件又漏了"）：单个 placement 场景下选中 → 真实点击删除按钮 → 5s 内成功 → 数量归零 → 刷新后仍为 0。
   - 额外验证拖动改位未被这次改动破坏：两件物件场景下选中第一件、`page.mouse` 真实拖动 10 步、松手，`style.transform` 从 `translate(90px, 90px)` 变为 `translate(150px, 120px)`，刷新后 `style` 与拖动后逐字节一致——上一轮已过的拖动+持久化行为未受影响。
   - 4 条临时用例全部 `4 passed`，之后按现场清理惯例删除该临时 spec，未留作交付物。
4. 结论：`.stage__remove` 删除按钮在默认多物件相邻摆放路径下现在可以被真实（非 force）鼠标点击命中；单物件场景、拖动改位、持久化刷新还原均未回归。
