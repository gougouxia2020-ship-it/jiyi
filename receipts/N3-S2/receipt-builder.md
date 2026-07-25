# N3-S2 建造回执 · 管理与命名（建造员）

sprint：N3-S2 ｜ 里程碑：N3（收口） ｜ 团队：general ｜ 日期：2026-07-17

## 一、任务范围（照 .opc/sprints/N3-S2.json，逐字契约）
加上管理与命名——场景可重命名与删除（删除释放该背景配额、可再建）、物件可重命名（挂 Item、跨场景同步）、
陈列室名可就地编辑；三处编辑统一手感：点进去改、回车/失焦即存，不开独立设置页；删除一句话确认、不弹大警告框；
全部改动刷新后持久化。收口本里程碑：跑通 e2e/n3-edit.spec.ts 全量（含 N3-S1 已实现的 dock 拖入→挪位→缩放→
旋转→移除全链路回归），expect_exit 0。N3-S1 已交付的手柄/变换全链路不重做。

## 二、改动文件清单
- `src/model/types.ts` —— GalleryState 新增 `galleryName: string`（陈列室名，持久化）。
- `src/state/gallery.ts` —— 新增 4 个 action（纯追加，未动既有）：`rename-scene` / `delete-scene`（删场景 +
  其名下摆放，激活位交给剩余场景首个 / null；配额由 availableBackgrounds 派生自动释放）/ `set-item-name`
  （改 Item.name，编辑模式守卫，空白名忽略）/ `set-gallery-name`。
- `src/storage/persistence.ts` —— 新增 `DEFAULT_GALLERY_NAME`；createInitialState/loadState 补 galleryName
  读写（非空以持久化为准、缺损回退默认）；`reconcileItems` 增补 name 以持久化为准（原来只保 story）——
  物件重命名刷新不丢的关键。
- `src/components/InlineEdit.tsx` —— 新增。三处命名统一手感的唯一实现：render-prop 展示态点进去改 →
  受控 input，Enter/失焦即存、Esc 撤销；doneRef 去重（Enter 提交后 input 卸载的 blur 不二次提交）；
  input 指针/点击 stopPropagation（不触发画布/chip/dock 的选中/拖拽/切场景）。
- `src/components/Header.tsx` —— 品牌章 `<h1>` 接 InlineEdit（testid `gallery-name` / `gallery-name-input`），
  点标题就地改陈列室名。
- `src/components/SceneBar.tsx` —— chip 包一层 `.chip-wrap`：名字接 InlineEdit（点已激活 chip 或双击进编辑，
  testid `scene-name-input`）；激活 chip 上浮出 `SceneDelete` 次级入口（× 触发 → 一句话玻璃气泡确认
  `删除「X」？ 删除/取消`，testid `scene-delete` / `scene-delete-confirm` / `scene-delete-cancel`）。
- `src/components/ItemTray.tsx` —— dock 改吃 state.items（name 可重命名、跨场景同步）；缩略卡由 `<button>`
  改 `<div>`（避免「按钮里套输入框」的非法嵌套；手势守卫/阈值/逻辑一字未改，图片 pointer-events:none 使指针
  仍落整卡）；名字接 InlineEdit（testid `item-name` / `item-name-input`），点名字进编辑、指针不冒泡到拖拽。
- `src/components/Workbench.tsx` —— 接线：Header 传 galleryName/onRenameGallery；SceneBar 传 onRenameScene/
  onDeleteScene；ItemTray 传 items/onRenameItem。
- `src/App.css` —— 新增命名/管理段样式（.brand__name(-input)/.chip-wrap/.chip.chip-input/.chip-del/
  .chip-confirm*/.thumb-name(-input)）；把 `.thumb:disabled`/`:hover:not(:disabled)` 改为 `.is-disabled`
  类（div 化后 `:disabled` 伪类不再适用）。
- `.opc/` 全程未碰（禁区）。

## 三、逐条对齐【验收硬指标】自检

### 1. 三处就地编辑入口齐全 + 点进去改、回车/失焦即存、不开独立设置页
- 陈列室名（品牌章）：`gallery-name` h1 点进入 `gallery-name-input`，回车即存 + 失焦即存均验过（test E）。
- 场景名（chip）：点已激活 chip 进 `scene-name-input`，回车即存 + 失焦即存均验过（test B）。
- 物件名（dock 缩略卡）：点 `item-name` 进 `item-name-input`，回车即存验过（test D）。
- 三者共用 InlineEdit → 手感统一；均为就地 input，无独立设置页/路由。截图逐一核对（见下）。

### 2. 场景删除走 chip 次级入口、删除即释放该背景配额、确认语气克制（一句话、不弹大警告框）
- 次级入口：激活 chip 右上角浮出 18px × 小圆钮（`scene-delete`），克制不喧宾夺主。
- 确认：点 × 弹一句话玻璃小气泡「删除「卧室」？ 删除 取消」（`scene-delete-confirm-box`）——非 window.confirm、
  非全屏警告框；可取消不误删（test C 先取消再删各验一次）。
- 配额释放可再建：删卧室后 add-scene 由 disabled→enabled、picker 重新列出卧室背景、再建回 3 个（test C）。
  → 对齐 success.json 条目8「删除场景后该背景仍不可用于新建 即失败」的反面。

### 3. 物件改名挂 Item、跨场景同步
- 同一物件摆进客厅+书房；在书房 dock 改名「爷爷的相机」→ 书房故事弹窗标题读到新名 → 切客厅同一物件故事弹窗
  标题也读到新名（test D）。因 set-item-name 只改 Item.name（不存 per-Placement 副本）→ 天然跨场景同步。

### 4. 全部改动刷新后持久化
- 场景重命名、场景删除、物件重命名、陈列室名，各自 reload 后仍在（test B/C/D/E 均含 reload 断言）。
- galleryName 进 GalleryState 全量落盘；scene.name 随 scenes 落盘；item.name 经 reconcileItems 以持久化为准。

### 5. e2e/n3-edit.spec.ts 全量 expect_exit 0（含 N3-S1 变换全链路回归）
- 新建 `e2e/n3-edit.spec.ts`，7 用例：
  - A 全链路回归：dock 拖入→挪位（只改 x/y）→角手柄缩放（只改 w）→旋转钮旋转（只改 rotation）→工具条移除→
    刷新逐字段 toEqual 还原、B 保持移除。字段隔离 + round-trip 断言（不写脆弱的绝对像素期望）。
  - B 场景重命名（回车即存 + 失焦即存 + 刷新）。
  - C 场景删除（次级入口 + 一句话确认 + 取消不误删 + 配额释放可再建 + 删除与再建刷新还原）。
  - D 物件重命名（dock 改名 + 跨场景同步 + 刷新）。
  - E 陈列室名就地编辑（点进去改 + 失焦即存 + 回车即存 + 刷新）。
  - F 手感/工艺可自动化项 ×2 视口（PC 1280 + 横屏手机 844×390）。
- 实测：`npx playwright test e2e/n3-edit.spec.ts --reporter=line` → **7 passed，exit=0**。

### 6. 手感验收（manual，尽力自测）
- **手柄触摸命中区 ≥ --h2-hit**：test F 断言 `.stage__handle::after` 命中区 = --h2-hit(26px)、旋转钮本体
  ≥26px、工具条按钮 ≥26px，PC 与横屏手机两视口各验一遍。
- **无字符图标残留**：test F 断言 handle-rotate/placement-story/placement-remove 内含 `<svg>`，`.stage__items`
  innerText 不含 ⟳/✎/×，两视口各验。
- **跟手/不掉帧/无跳变**：沿用 N3-S1 未改的手势引擎（Pointer Events + rAF 直改 transform、松手提交），本 sprint
  未触碰 Canvas 手势路径；test A 的字段隔离断言（move 只动 x/y、scale 只动 w、rotate 只动 rotation）间接佐证
  各手势不串扰、无跳变。掉帧属肉眼项，无法在 headless 断言，靠架构不变 + 截图观感兜底。
- **视觉截图核对**（临时 spec 跑后即删）：PC 1280 与横屏手机 844×390 各截图，逐一确认——品牌章/chip/dock 三处
  就地编辑输入框（陶土红聚焦描边、就地不弹页）；chip × 次级入口 + 一句话玻璃确认气泡；选中态 Canva 手柄
  （陶土红细选框 + 四角白圆点 + 下方旋转 SVG 圆钮 + 上方玻璃工具条铅笔/垃圾桶 SVG），无字符图标残留；横屏手机
  下手柄、工具条、dock、场景条均可命中不错乱。观感与 A2-旧信-沉浸.html 一致。

## 四、构建与回归自检
- `npm run build`（tsc -b + vite build）：**过**，无类型错误。
- `e2e/n3-edit.spec.ts`（本里程碑验收门）：**7 passed，exit 0**。
- `e2e/n2-shell.spec.ts`（受本轮 tray/chip/brand 改动影响最大的既有套件）：**全绿**——无回归。
- `e2e/m1-shell.spec.ts`：**全绿**——建/切场景、14 件 dock、上限 3 无回归。
- `e2e/m3-story.spec.ts`：②③④ 绿；① 挂（见下·预存在红）。

### 预存在红（非本 sprint 引入，未触碰其代码路径，逐条溯源）
以下 7 项失败在本 sprint 开工前即为红，全部源于 N1/N2 的 schema v2→v3 迁移与 N2 的 dock 窄屏默认收合，
与 N3-S2「命名与管理」无关，且失败断言全落在我未改动的值/行为上：
- `m3-story ①` / `n1-foundation ①②③`：断言 `schemaVersion === 2`，但代码 `SCHEMA_VERSION = 3`（N2 升的，
  我未动 persistence 的版本号）。
- `m4-full`（PC）：line 262 读 `data-scale`（schema v3 已改名 `data-w`，N1 留下的回归，我未动 Canvas data-*）。
- `m4-full`（768/375）：窄屏 dock 默认收合（N2 行为，`innerWidth < 880`），m4 helper 未展开 dock → tray-item
  不可见超时。我保持了完全相同的收合初值逻辑，非新增。
这些属更早里程碑（M3/M4/N1，均已 verdict pass）的测试随 schema 漂移的陈旧断言，不在 N3-S2 交付范围，
按「不顺手改无关的东西」未去改动它们，仅在此如实记录规避误判。

## 五、架构性判断（自决，未中途提问）
1. **统一 InlineEdit 组件**：三处命名共用一份「点进去改 / 回车·失焦即存 / Esc 撤销」实现，正是 taste「三处编辑
   统一手感」的落点；doneRef 去重解决 Enter→卸载→blur 的二次提交。
2. **删除确认用就地玻璃气泡而非 window.confirm**：window.confirm 是浏览器级大对话框，正是「大警告框」；改用一句话
   玻璃胶囊气泡，语气克制、可测、贴 A2 玻璃 DNA。
3. **dock 缩略卡 button→div**：卡内要同时容纳拖拽/点选手势与可编辑 input，button 内嵌 input/span-role-button 是
   非法嵌套交互；div 化后手势守卫/阈值/rAF 逻辑一字未改，图片 pointer-events:none 保证点选/拖入落点行为不变
   （既有 tray-item 定位器/点击/拖拽全兼容，n2/m1 无回归佐证）。
4. **删除即释放配额靠派生而非显式回收**：availableBackgrounds/canAddScene 本就派生自 scenes，delete-scene 只需从
   scenes 摘掉该场景，配额自动回到可选池——零额外回收代码、无状态不一致风险。
5. **name 持久化补在 reconcileItems**：原实现只保 story、name 每次从素材清单重置；补 name 以持久化为准（空白回退
   默认）即让物件重命名刷新不丢，且不破坏 imageSrc 始终对齐构建哈希 URL 的既有约定。
