# receipt-builder · M3-S1

## Sprint 契约（逐字对照 `.opc/sprints/M3-S1.json` 的 goal + 【验收硬指标】）

编辑模式下选中物件可写/改故事，**故事字段挂在 Item 本身（不挂 Placement）**，落 LocalStorage
全量持久化、刷新后完好还原；同一 Item 被摆入多个场景时故事**跨场景同步**更新。硬指标逐条：

1. `Item{id,name,imageSrc,story}` —— story 挂 Item，多对多经 Placement，**故事挂 Item 不挂 Placement**。
2. 编辑模式选中画布物件 → 有办法**输入/修改故事文本并保存**。
3. 保存故事 → 触发现有持久化机制**全量落 LocalStorage（带 schema 版本号）**。
4. 摆好物件写好故事后**刷新** → 故事文本不丢失、不错乱、完整还原。
5. 同一 Item 放入两个场景的 Placement，改其中一处的故事 → 另一处**同步为最新值**，不得新旧不一致
   （重点：**别把 story 误存成 per-Placement 副本**）。
6. 落成 `e2e/m3-story.spec.ts` 的**前三步**（选中写故事 → 刷新还原 → 另一场景同步）须可跑通。
   第四步「游客模式只读弹故事+原图」属 **M3-S2**，本 sprint 不含。
7. 本 sprint **不做**故事弹窗最终视觉打磨（奶油弹窗/游客只读 = M3-S2），但需提供一个**最小可用入口**，
   让评审员实际走通「选中物件 → 写故事 → 保存 → 刷新 → 还原 → 跨场景同步」全链路。

> **地基复用**：M1-S1 的数据模型里 `Item.story` 字段与「故事挂 Item」的关系注释**早已就位**；
> persistence.ts 的 `reconcileItems` 在 loadState 时**已经**以持久化的 `story` 为准回填（imageSrc 对齐清单、
> story 取用户值）；App.tsx 的 `useEffect(() => saveState(state), [state])` **已经**做状态树任一变化即全量落盘。
> 因此本 sprint 的持久化/还原能力是**接线既有机制**，而非新造 —— 我只补了「写入路径」（reducer action + 编辑入口 UI）。

---

## 一、改动清单（全部落在 `.opc/` 之外，项目根内）

### 新增
- `src/components/StoryEditor.tsx` —— 最小故事编辑面板组件（B5 入口）。
- `e2e/m3-story.spec.ts` —— 本 sprint 验收 e2e（2 条用例，覆盖前三步 + 双向同步 + 刷新）。
- `receipts/M3-S1/receipt-builder.md` —— 本文件。

### 改写源码
- `src/model/types.ts` —— **未改**（`Item.story` 字段 M1-S1 已定义，关系注释已写明「故事挂 Item 跨场景同步」）。
- `src/storage/persistence.ts` —— **未改**（`reconcileItems` 已按持久化 story 回填、带 `SCHEMA_VERSION=1`）。
- `src/App.tsx` —— **未改**（`saveState(state)` 的全量落盘 effect 已覆盖 story 变更）。
- `src/state/gallery.ts` —— 新增 `set-item-story` action + reducer case（见下）。
- `src/components/Canvas.tsx` —— 加故事编辑入口（选中态「✎ 故事」钮）与面板渲染（见下）。
- `src/App.css` —— 加 `.stage__story-btn`（左上 ✎，与右上 ✕ 对称）+ `.story*` 面板样式（见下）。

---

## 二、怎么实现的

### 1) 数据模型层：`set-item-story`（`src/state/gallery.ts`）
```ts
| { type: 'set-item-story'; itemId: string; story: string }
```
reducer case：
- 守卫 `state.mode !== 'edit'` → 拒绝（游客模式不可写，为 M3-S2 只读留口子，与其他 mutation 同款守卫）。
- 目标 Item 不存在 → 拒绝。
- `target.story === action.story`（无变化）→ 原样返回，免去一次无谓全量落盘。
- 命中 → **只改 `state.items` 里该 Item 的 `story` 字段**，`placements` 与其余字段一律不动。

**「跨场景同步」是数据模型层天然结果**：故事写在 Item 上，而不是某条 Placement 上。同一 Item 无论被
哪个 Scene 的哪条 Placement 引用，读回的都是 `state.items` 里那**一份** story。改一次 = 所有引用处同步。
全代码路径里 story **只此一处**读写、且只挂在 Item —— 从数据结构上就杜绝了 per-Placement 副本导致的新旧不一致。

### 2) 编辑入口：`StoryEditor` + Canvas 接线
- `StoryEditor.tsx`：受控 `<textarea>`（`data-testid="story-input"`）+「保存故事」（`story-save`）+「取消/关闭」
  （`story-cancel` / `story-cancel-btn`）+ 物件名与小预览图。草稿 `draft` 在**挂载时**从 `item.story` 初始化。
- `Canvas.tsx`：
  - 新增 `storyEditId: string|null`（正在编辑故事的 placement id）。
  - 选中态手柄链里加**左上「✎ 故事」钮**（`data-testid="placement-story"`），点击 `setStoryEditId(p.id)`。
    与既有右上「✕」对称，同款陶土红手柄样式。
  - 从 `storyEditId` → 当前场景内 `placements.find` 解到 Placement → `state.items.find` 解到 **Item**，
    渲染 `<StoryEditor key={item.id} … />`。`key=item.id` 保证换物件/换场景重开时重新挂载、草稿从最新 story 取值。
  - `onSave` → `dispatch({type:'set-item-story', itemId, story})` 再关面板；`onClose` → 只关面板。
  - 面板/入口整体由 `editable`（`state.mode==='edit'`）门控 —— 游客模式两者都不出现。
  - 既有 `useEffect([scene?.id, state.mode])` 里补 `setStoryEditId(null)`：切场景/切模式清面板（选中态不跨场景）。
  - 移除某 placement 时若其面板正开 → 一并 `setStoryEditId(null)`。
  - 面板 `onPointerDown` `stopPropagation`，避免冒泡到 `.stage` 的清选中逻辑，编辑期间选中态稳定。

### 3) 持久化/还原（**接既有机制，未改持久化代码**）
- 保存 → dispatch 改 `state.items[*].story` → App 的 `useEffect(saveState, [state])` 把**整棵状态树**（含 items 的
  story）序列化写入 `localStorage['memories.gallery']`，payload 带 `schemaVersion: SCHEMA_VERSION(=1)`。
- 刷新 → `loadState` 读回，`reconcileItems` 以持久化 story 为准回填到内置物件目录（imageSrc 对齐最新清单哈希 URL）。

### 4) 样式（`src/App.css`）
- `.stage__story-btn`：镜像 `.stage__remove`，左上、陶土红描边、hover 反色。
- `.story*`：绝对定位于 stage 底部居中、`width:min(440px, 100%-32px)`（**浮于画布之上、不占画布宽度**），
  半透明奶油底 `--color-popup` + `backdrop-filter:blur(8px)` 起步、`--color-popup-line` 描边、衬线正文。
  **最终奶油弹窗视觉/游客只读按契约留给 M3-S2**，本 sprint 只求「能操作、能验证」。

---

## 三、怎么自检的 & 自检结果

### 自检 1 · 生产构建（对照 M1 criteria「无类型错误、构建通过」）
```
npm run build
```
结果：**过**。`tsc -b` 无类型错误，`vite build` 成功（56 modules，built in ~0.3s）。

### 自检 2 · M3-S1 验收 e2e（对照硬指标 6，前三步全链路）
```
npx playwright test e2e/m3-story.spec.ts --reporter=line
```
结果：**过**，2 passed。两条用例：
1. **写故事 → 保存 → 刷新还原**：建客厅场景 → 点选放入物件 → ✎ 打开面板 → 写故事 → 保存 → 面板关闭；
   直接读 `localStorage['memories.gallery']` 断言该 Item 的 `story` == 写入值、`schemaVersion==1`（证明**带版本号
   的全量落盘**，硬指标 3）；`reload` 后重开面板断言 textarea 值 == 原文（硬指标 4，刷新完整还原）。
2. **跨场景双向同步 + 刷新**（硬指标 5）：
   - 客厅放物件 X 写 S1 → 建书房场景、放**同一物件 X**（断言 `itemIdB===itemId`）→ 书房重开面板读到 **S1**
     （A 写的、B 已同步，证明**故事挂 Item 而非 Placement 副本**）；
   - 书房把故事改成 S2 → 切回客厅读到 **S2**（**反方向同步**）；
   - 再 `reload` → 客厅、书房两处读回都是 **S2**（无丢失、无新旧不一致）。

### 自检 3 · 回归（不推倒 M1/M2 地基）
```
npx playwright test e2e/m1-shell.spec.ts e2e/m2-transform.spec.ts --reporter=line
```
结果：**过**，5 passed（M1 外壳/持久化/背景上限 3 条 + M2 变换全链路/拖入画布外 2 条）。
新增的选中态「✎」钮、面板与 CSS **未回归**既有拖动/缩放/旋转/移除/持久化链路。

### 自检 4 · 契约点逐条核对
- [x] story 挂 Item（`state.items[*].story`），全路径 story 只此一处读写、不挂 Placement。
- [x] 编辑模式选中物件 → ✎ 打开面板 → textarea 输入/改 → 保存。
- [x] 保存走 App 既有 `saveState` 全量落盘、带 `schemaVersion:1`。
- [x] 刷新经 `loadState`/`reconcileItems` 完整还原 story。
- [x] 同一 Item 两场景，一处改、另一处同步最新值（e2e 双向 + 刷新验证）。
- [x] 游客模式：入口与面板由 `editable` 门控、`set-item-story` 有 edit 守卫 → 只读（M3-S2 收口只读弹窗时可继续接线）。
- [x] 视觉打磨（奶油弹窗最终态/游客只读）按契约**留给 M3-S2**，本 sprint 仅交付最小可用入口。

---

## 四、给 M3-S2 的交接提示
- 面板已用 `--color-popup`/`--color-popup-line`/`backdrop-blur` 起步，可在此基础上做奶油弹窗最终视觉。
- 游客模式（`mode==='guest'`）目前入口/面板被 `editable` 屏蔽；M3-S2 要做「点物件只弹故事+原图、只读不可编辑」，
  可复用 `StoryEditor` 的结构，加一个只读变体（隐藏 textarea 编辑/保存、展示 story 文本 + 原始照片），
  并把「点物件即弹」的触发从「选中态 ✎ 钮」扩展到「游客模式点击物件本体」。
- `e2e/m3-story.spec.ts` 目前是前三步；M3-S2 在此文件**追加**第四步（游客只读）即可拼成 M3 完整 criteria。
