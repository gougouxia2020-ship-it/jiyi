# N3-S2 评审证据 · 管理与命名（评审员）

sprint：N3-S2 ｜ 里程碑：N3（收口） ｜ 团队：general ｜ 评审日期：2026-07-17

## 尺子（逐字抄自 .opc/sprints/N3-S2.json + milestones.json N3.criteria + success.json 条目8 + taste.json）

1. 陈列室名（品牌章）、场景名（chip）、物件名（dock 缩略卡）都支持就地编辑——点进去改、回车/失焦即存，不开独立设置页。
2. 场景删除走 chip 上的次级入口，删除即释放该背景配额；确认语气克制（一句话确认，不弹大警告框）。
3. success.json 条目8 反面：重命名/删除入口不缺失；重命名后刷新不丢；删除场景后该背景可用于新建；物件改名后另一场景同步。
4. `e2e/n3-edit.spec.ts` 需 `expect_exit 0`（timeout 180000ms）。
5. 手感验收（manual）：拖/缩/转在 PC 与横屏手机跟手、不掉帧、无跳变；手柄触摸命中区 ≥ `--h2-hit`；无字符图标残留。
6. `npm run build` 无类型错误（M1/N1 沿用的生产构建门槛，本轮仍适用）。
7. 历史红与本轮改动文件无关（独立复核，不轻信建造员自报）。

---

## 1. 三处就地编辑——逐条亲手核查

### 1a. 陈列室名（品牌章，Header.tsx）
- 代码：`Header.tsx` 用 `<InlineEdit>` 包住 `<h1 data-testid="gallery-name">`，点击/Enter/Space 触发 `beginEdit`；提交走 `onCommit` → `dispatch({type:'set-gallery-name', name})`。
- `InlineEdit.tsx`：Enter → `finish(true)`（提交）；Esc → `finish(false)`（撤销）；`onBlur` → `finish(true)`（失焦提交）；`doneRef` 防止 Enter 提交后卸载引发的 blur 二次提交。无路由/无独立页面（`package.json` 里没有任何路由库依赖，确认整个应用只有一个 `App`/`Workbench` 视图）。
- 截图核对（PC 1280，`review-hd-gallery-edit.png`）：点标题后原地弹出带陶土红聚焦描边的输入框，位置与展示态重合，非模态、非页面跳转。横屏手机（844×390，`review-phoneLandscape-*`）同样验证过其余三处编辑不受挤压（见 §5）。
- e2e：`n3-edit.spec.ts` test E——点开→填「老友记忆馆」→点画布空白失焦即存→刷新仍在；再验证回车即存→刷新仍在。**实测通过**（见 §4 命令输出）。

### 1b. 场景名（chip，SceneBar.tsx）
- 代码：`chip-wrap` 包 `InlineEdit` + chip 按钮；`onClick`：已激活→`beginEdit()`（点进去改），未激活→切场景；`onDoubleClick` 也进编辑。`onCommit` → `dispatch({type:'rename-scene', sceneId, name})`。`rename-scene` reducer 对空白名 trim 后忽略、其余字段不动。
- e2e：test B——点已激活 chip→填「温馨小屋」→回车即存→刷新仍在；再改「老宅」→失焦即存→刷新仍在。**实测通过**。

### 1c. 物件名（dock 缩略卡，ItemTray.tsx）
- 代码：`thumb`（`<div>`，非 `<button>`，避免"按钮套输入框"非法嵌套；`onPointerDown`/`onClick` 上 `stopPropagation`，图片 `pointer-events:none` 保证拖拽/点选手势不受影响）内嵌 `InlineEdit` 包住 `.thumb-name`。`onCommit` → `dispatch({type:'set-item-name', itemId, name})`，改的是 `Item.name`（非某条 Placement 的副本）。
- e2e：test D——dock 改名「爷爷的相机」→ dock 缩略卡即刻显示新名 → 当前场景（书房）故事弹窗标题读到新名 → 切客厅同一物件故事弹窗标题也读到新名（跨场景同步）→ 刷新后 dock 与两场景仍读到新名。**实测通过**。
- 截图核对（`review-hd-item-name-edit.png` / `review-phoneLandscape-item-name-edit.png`）：点名字进入编辑，输入框贴合缩略卡位置，未触发拖拽/选中。

**结论：三处就地编辑手感统一（共用 InlineEdit）、均无独立设置页，符合 taste.json 命名与管理段与验收硬指标第 1 条。**

---

## 2. 场景删除——次级入口 + 一句话确认 + 配额释放

- 代码核查（`SceneBar.tsx` 内 `SceneDelete` 组件）：
  - 次级入口：仅当 chip 为当前激活场景时才浮出的 18×18px 圆钮（`chip-del`），非常驻、不喧宾夺主。
  - 确认：点击后 `confirming=true`，渲染 `chip-confirm.glass`（`role="alertdialog"`），内容为**一行文字**「删除「{sceneName}」？」+「删除」/「取消」两个按钮——不是 `window.confirm()`、不是全屏遮罩/大警告框。
  - 确认取消可撤销（`onConfirm` 只在点「删除」时才 `dispatch({type:'delete-scene', sceneId})`）。
- `gallery.ts` 的 `delete-scene`：从 `scenes` 中摘除该场景 + 过滤掉其名下所有 placements；`availableBackgrounds`/`canAddScene` 都是从 `scenes` 派生的选择器，故删除后背景自动回到可选池（零额外回收代码路径，无状态不一致风险）。
- e2e test C 逐步验证：建满 3 个场景（客厅/书房/卧室）→ `add-scene` disabled + "素材已用完" 可见 → 点卧室 chip 的 `scene-delete` → 确认气泡可见且内容含"删除" → **先点取消**（验证可撤销、chip 数仍 3）→ 再点删除并确认 → chip 数变 2、卧室消失 → `add-scene` 变 enabled → 打开 picker 只列出「卧室」背景（配额确实释放）→ 刷新后删除仍持久化（chip 数仍 2）→ 用释放的背景重新建回「卧室」→ chip 数回到 3 → 刷新后仍是 3 个（客厅/书房/卧室）。**实测通过**。
- 截图核对（`review-hd-delete-confirm.png` / `review-phoneLandscape-delete-confirm.png`）：气泡为胶囊状玻璃小条，单行文字 + 两个按钮，视觉克制，非大警告框；横屏手机下气泡文字与按钮略紧凑但仍可读、可点（未溢出视口）。

**结论：删除入口位置、确认语气、配额释放机制均符合验收硬指标第 2 条与 success.json 条目8反面。**

---

## 3. 物件改名跨场景同步 + 全部改动刷新持久化

- 代码核查：`set-item-name` 只改 `state.items` 中目标 `Item.name`，不写入/复制到任何 `Placement`；`Item.name` 是所有场景共享的唯一数据源，天然跨场景同步（`persistence.ts` 的 `reconcileItems` 明确注释："同一 Item 在多个场景的多条 Placement 天然共享同一段故事/名字"）。
- 持久化核查：
  - `GalleryState.galleryName`（`types.ts` 新增字段）随整棵状态树 `saveState` 全量落盘；`loadState` 对 `galleryName` 做"非空以持久化为准，缺失回退默认"处理。
  - `scene.name` 本就在 `scenes` 数组内，随整棵状态树落盘，无需额外处理。
  - `item.name` 原实现（N3-S2 之前）只保留 `story`、`name` 每次从素材清单重置——**这是本轮修的关键点**：`reconcileItems` 新增 `name` 字段以持久化内容为准（空白/非法回退素材清单默认名），核对 `persistence.ts` 第 127-138 行代码，逻辑正确。
- e2e test B/C/D/E 均含 `page.reload()` 后的断言，全部通过（见 §4）。

**结论：物件改名跨场景同步、四类改动刷新后持久化，均验证通过，符合验收硬指标第 3、4 条。**

---

## 4. 命令实测（亲手跑，非建造员自报）

### 4.1 生产构建
```
$ npm run build
> memories@0.1.0 build
> tsc -b && vite build
...
✓ built in 364ms
EXIT_CODE=0
```
**通过，无类型错误。**

### 4.2 本里程碑验收门 e2e/n3-edit.spec.ts
```
$ npx playwright test e2e/n3-edit.spec.ts --reporter=line
Running 7 tests using 1 worker
[1/7] A 全链路：dock 拖入 → 挪位 → 角手柄缩放 → 旋转钮旋转 → 工具条移除 → 刷新逐字段还原
[2/7] B 场景重命名：chip 点进去改、回车即存与失焦即存、刷新持久化
[3/7] C 场景删除：次级入口 + 一句话确认 → 释放背景配额可再建 → 删除与再建刷新还原
[4/7] D 物件重命名：dock 点名字改、跨场景同步（另一场景摆放读到新名）、刷新持久化
[5/7] E 陈列室名（品牌章）就地编辑：点进去改、失焦即存、刷新持久化
[6/7] F 手柄命中区 ≥ --h2-hit 且无字符图标残留 @PC
[7/7] F 手柄命中区 ≥ --h2-hit 且无字符图标残留 @横屏手机
  7 passed (5.8s)
EXIT_CODE=0
```
**全量 7/7 通过，exit=0，用时远低于 180000ms 超时。**

---

## 5. 手感验收（manual，viewport 模拟核对）

因无真机，按任务要求用 viewport 模拟核对布局与命中区尺寸：

### 5.1 命中区尺寸——自动化断言（test F，两视口）
- `--h2-hit` 读取值 = 26px（`tokens.css:72`）。
- `.stage__handle::after`（透明命中区）宽高均 ≥ 26px（PC 与 844×390 横屏手机两视口分别断言，均通过）。
- 旋转钮 `.stage__rot` 本体最短边 ≥ 26px；工具条按钮 `.stage__toolbar-btn` 本体最短边 ≥ 26px。两视口均通过。

### 5.2 无字符图标残留——自动化断言（test F，两视口）
- `handle-rotate` / `placement-story` / `placement-remove` 均含真实 `<svg>` 子元素。
- `.stage__items` 全部 `innerText` 正则匹配 `/[⟳✎×]/` 结果为 `false`（无残留字符图标）。两视口均通过。

### 5.3 视觉截图核对（本人用 Playwright 截图，viewport 分别 1280×800 与 844×390）
- 陈列室名/场景名/物件名三处编辑态：输入框陶土红聚焦描边、原地展开，非弹窗非跳转（`review-hd-gallery-edit.png`、`review-hd-item-name-edit.png` 及横屏手机对应图）。
- 场景删除一句话确认气泡：胶囊状玻璃小条，单行文案+删除/取消按钮，克制不喧宾夺主（`review-hd-delete-confirm.png`、`review-phoneLandscape-delete-confirm.png`）。横屏手机下气泡略紧凑但未溢出、按钮可点，未见布局错乱或裁切。
- 选中态手柄（`review-hd-handles.png`、`review-phoneLandscape-handles.png`）：陶土红细选框 + 四角白色圆点 + 选框下方圆形旋转钮（内含旋转 SVG）+ 选框上方毛玻璃工具条（铅笔/垃圾桶 SVG），无字符图标（⟳/✎/×）残留，两视口观感一致、未见错位。

### 5.4 跟手/不掉帧/无跳变（推理佐证，非可自动化肉眼项）
- 本 sprint 改动文件清单不含 `Canvas.tsx`（手势引擎所在文件）——核对改动文件清单（types.ts/gallery.ts/persistence.ts/InlineEdit.tsx/Header.tsx/SceneBar.tsx/ItemTray.tsx/Workbench.tsx/App.css/e2e 新 spec），确认手势路径（Pointer Events + rAF 直改 transform、松手提交）未被触碰。
- `n3-edit.spec.ts` test A 的字段隔离断言（挪位只改 x/y、缩放只改 w、旋转只改 rotation，互不串扰）间接印证手势提交无跳变/无脏写。
- 该手势引擎在 M2、N2 两个更早里程碑已通过手感 manual 验收（milestones.json 记录 verdict pass），本轮未改动此路径，判定手感风险低。

**结论：命中区与图标两项硬指标已用自动化 + 截图双重核实通过；跟手/掉帧因架构未改动且历史已验收，判定继承通过，风险低。**

---

## 6. 历史红独立复核（不轻信建造员自报）

建造员回执声称有 7 项历史失败与本 sprint 无关（m3-story①、n1-foundation①②③、m4-full PC/768/375）。本人亲手复核：

### 6.1 m3-story.spec.ts + n1-foundation.spec.ts
```
$ npx playwright test e2e/m3-story.spec.ts e2e/n1-foundation.spec.ts --reporter=line
...
4 failed
  m3-story.spec.ts:110 ① ... Expected: 2 / Received: 3   (schemaVersion)
  n1-foundation.spec.ts:98 ①  ... Expected: 2 / Received: 3
  n1-foundation.spec.ts:152 ②  ... Expected: 2 / Received: 3
  n1-foundation.spec.ts:196 ③  ... Expected: 2 / Received: 3
2 passed
EXIT_CODE=1
```
逐一核实：4 项失败断言全部是 `expect(schemaVersion).toBe(2)`，而 `src/storage/persistence.ts` 的 `SCHEMA_VERSION = 3`（第 24 行，注释明确写"v2 → v3：坐标系改为场景图矩形...N2（schema v3）"）。**本 sprint 未改动 SCHEMA_VERSION 常量**（改动文件清单中的 persistence.ts 改动只涉及 `DEFAULT_GALLERY_NAME`/`galleryName` 读写/`reconcileItems` 补 name，未碰版本号）。判定：确系 N1/N2 遗留的陈旧断言，与本 sprint 改动文件无关，非本轮引入。

### 6.2 m4-full.spec.ts
```
$ npx playwright test e2e/m4-full.spec.ts --reporter=line
...
3 failed（PC / 768px / 375px）
```
- PC 失败于 `e2e/m4-full.spec.ts:262`：`expect(afterScale.scale).toBeGreaterThan(...)`，读取的是 `loc.getAttribute('data-scale')`（第 171 行）——但 schema v3（N2 引入）已把该字段改名为 `w`（`data-w`），Canvas 渲染层不再输出 `data-scale`。核对 `n3-edit.spec.ts` 自身的 `readPl()` 助手已改读 `data-w`（第 108 行），印证 `data-scale` 属 N1/N2 迁移后的陈旧读取，非本 sprint 引入。
- 768px/375px 失败均为 `tray-item` 点击超时（元素不可见）：`ItemTray.tsx` 第 59-61 行 `closed` 初值为 `window.innerWidth < 880`（N2 引入的窄屏默认收合行为，本 sprint 未改此行）；`m4-full.spec.ts` 的 `placeItemByClick` 助手未展开 dock 就直接点击，故在窄屏下超时。核对 `n3-edit.spec.ts` 自身的 `ensureDockOpen()` 助手（第 42-49 行）已处理此情况，进一步印证 N3-S2 明确知晓并规避了此项 N2 遗留行为、未在自己的验收门里重蹈。
判定：3 项失败均源于 N1/N2 引入的字段改名与窄屏收合行为，与本 sprint 改动文件（types.ts/gallery.ts/persistence.ts/InlineEdit.tsx/Header.tsx/SceneBar.tsx/ItemTray.tsx/Workbench.tsx/App.css）无关，非本轮引入。

### 6.3 独立发现：m2-transform.spec.ts 另有 2 项失败（建造员回执未提及）
本人额外跑了 `m2-transform.spec.ts`（建造员回执未涉及该套件）：
```
$ npx playwright test e2e/n2-shell.spec.ts e2e/m1-shell.spec.ts e2e/m2-transform.spec.ts --reporter=line
...
2 failed
  m2-transform.spec.ts:84  "全链路变换" —— expect(Math.abs(dropped.x-expectXPct)).toBeLessThan(1) 实际 4.296875（百分比计算基准漂移）
  m2-transform.spec.ts:199 "拖入画布外不建 placement" —— expect(placement count).toBe(0) 实际收到 1
  15 passed（其中 m1-shell 3/3、n2-shell 11/11 全绿）
```
核实：
- 84 行失败：`expectXPct` 公式按"整块 canvas 宽度"折算百分比，而 N2（schema v3）已把坐标系改为"contain 后的场景图矩形（imgRect）"，两者在背景图未铺满画布时存在偏移——这是 N2 架构调整遗留的陈旧断言基准，`Workbench.tsx` 的 `handleDropItemAt`（图内百分比换算逻辑）本 sprint 未改动（只改了函数外的 props 接线）。
- 199 行失败：该用例假设"拖到 header 区域"落在画布之外，但 N2 已把整个视口做成满屏画布（Canvas 铺满视口、Header 只是浮在其上的浮层），落点在 DOM 结构上仍落在 stage 内——这也是 N2 满屏外壳架构改动导致的陈旧假设，`Canvas.tsx`（stage 边界判定所在）不在本 sprint 改动文件清单内。
判定：这 2 项失败同样源自 N1/N2 架构调整、与本 sprint 改动文件无关，不构成本轮新引入的回归。**但建造员自检回执未提及/未测这两项，是自检覆盖面的小疏漏（非本 sprint 硬指标要求覆盖的套件，不影响本次 pass/fail 判定，仅记录在案）。**

**结论：全部历史红（含建造员未提及的 2 项）均独立复核确认与本 sprint 改动文件无关，非本轮引入的新问题。**

---

## 7. 越界/禁区核查

- `.opc/` 目录下时间戳较新的文件均为 OPC 引擎自身的 ledger/state（`state.json`/`lock.json`/`ledger/*`），未见 `phase1/`、`sprints/`、`milestones.json` 等契约文件被建造员改动的痕迹——核对内容与预期契约原文一致（已在开工读档阶段逐字核对）。
- 未见建造员越界改动 `.opc/` 契约文件。

---

## 8. 总裁定

逐条对照【验收硬指标】：
1. 三处就地编辑齐全、手感统一、无独立设置页 —— **过**（§1）
2. 场景删除次级入口 + 一句话确认 + 配额释放可再建 —— **过**（§2）
3. success.json 条目8 反面全部满足 —— **过**（§2、§3）
4. `e2e/n3-edit.spec.ts` 7/7 passed，exit=0 —— **过**（§4.2）
5. 手感验收（命中区/无字符图标自动化 + 截图核对；跟手/掉帧继承未改动路径）—— **过**（§5）
6. `npm run build` 无类型错误 —— **过**（§4.1）
7. 历史红与本轮改动文件无关，独立复核确认（含建造员未提及的 2 项）—— **过**（§6）

未挑出不达标项。**裁决：pass。**
