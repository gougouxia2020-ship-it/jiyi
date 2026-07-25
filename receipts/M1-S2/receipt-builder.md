# receipt-builder · M1-S2

Sprint 契约（M1-S2.json goal）：搭起应用外壳（报头 + 模式开关 + 场景条 + 物件抽屉 + 画布），
接上 M1-S1 的数据模型与素材库，实现创建/切换场景、背景不可重复约束（上限 3，用尽置灰提示），
刷新后场景与布局状态完整还原；整体视觉对齐「旧信」DNA。

> 本 sprint 在 M1-S1 地基（types / manifest / persistence / tokens）之上搭外壳，
> **未重造**数据模型、持久化、素材清单。变换手柄（拖/缩/转）属 M2、故事弹窗/双模式只读细节属 M3，
> 本 sprint 未越界去做，只把「点选放入画布」作为画布展示与「布局状态可持久化还原」的最小落点。

---

## 一、改动清单（全部落在 .opc/ 之外）

新增源码：
- `src/state/gallery.ts` —— 外壳状态。纯函数 `galleryReducer`（create-scene / select-scene / set-mode / place-item）
  + 派生选择器（`availableBackgrounds` / `canAddScene` / `activeScene` / `placementsOfScene`）。
  架在 M1-S1 的 `model/types` 与 `assets/manifest` 之上；`create-scene` 三重守卫（达上限 / 背景已占用 / 背景不存在 → 拒绝）落实**背景不可重复 + 上限 3**。
- `src/components/Header.tsx` —— 报头：衬线品牌名「念念 · 陈列室」+ `MEMORY ROOM` kicker + 模式开关胶囊（编辑 / 游客）。
- `src/components/SceneBar.tsx` —— 场景条：场景 chip（切换）+ ＋新场景（开背景 picker，**只列未占用背景**）；
  用满 3 个 → ＋新场景 `disabled` 置灰 + 常驻「素材已用完」提示。点外部关 picker。
- `src/components/ItemTray.tsx` —— 物件抽屉：`ITEMS.map` 列出**全部 14 件**缩略卡；编辑模式 + 有激活场景时点卡放入画布。
- `src/components/Canvas.tsx` —— 画布：当前场景背景 `cover` 铺满 + 暗角；`placements` 绝对定位 + `transform`；
  无场景时空态占位；空场景（编辑态）给放入提示。
- `src/components/Workbench.tsx` —— 工作台外壳组合：报头 + 场景条 + `[抽屉 | 画布]` grid + 页脚。

改写源码：
- `src/App.tsx` —— 由 M1-S1「地基自检面板」改为真正外壳：`useReducer(galleryReducer, undefined, loadState)`
  持有单一 `GalleryState`，`useEffect` 里 `saveState(state)` 全量落盘（非增量），挂载 `<Workbench>`。
- `src/App.css` —— 全量重写为 Workbench 外壳样式，逐一对齐 `A-旧信.html` + `tokens.css`：
  `.app/.top/.brand/.seg/.scenes/.chip/.chip.add/.exhausted/.bg-picker/.grid/.tray/.thumb/.stage/.stage__node/.foot`
  全部走 tokens 变量（暖奶油纸底、衬线、陶土红唯一强调）；含 `@media(max-width:880px)` 窄屏（抽屉转横向滚动、画布压低）与 `prefers-reduced-motion` 降级。

工程/测试配置：
- `package.json` —— 增 devDep `@playwright/test`；增 `e2e` 脚本（`playwright test`）。
- `playwright.config.ts` —— 新增。testDir `./e2e`，chromium 单项目，`webServer` 起 `vite --port 5178 --strictPort`，line reporter，workers=1。
- `e2e/m1-shell.spec.ts` —— 新增。3 条用例覆盖验收点名场景（详见下）。
- `.gitignore` —— 追加 Playwright 产物目录（test-results / playwright-report 等）。

未改：`src/model/types.ts`、`src/assets/manifest.ts`、`src/storage/persistence.ts`、`src/styles/tokens.css`、`src/main.tsx`、`src/index.css`、`index.html`、`vite.config.ts`、`tsconfig*.json`（沿用 M1-S1 地基）。

---

## 二、逐条自检（对照 M1-S2 验收硬指标）

1. **生产构建通过（`npm run build` exit 0，无类型错误）** —— 过。
   - `tsc -b && vite build` 输出 `✓ built in ~340ms`，`build exit: 0`。strict + noUnusedLocals/Parameters 下无告警。
   - 产物 `dist/assets`：17 张素材（3 jpg 背景 + 14 png 物件，带哈希）+ index js/css。

2. **e2e `npx playwright test e2e/m1-shell.spec.ts --reporter=line` 通过、exit 0** —— 过。`3 passed`，`e2e exit: 0`。
   覆盖硬指标点名的三组场景：
   - **建场景→切场景→刷新后场景与布局状态完整还原**：建「客厅」→点第一件物件放入（1 个 placement，记录其 inline style=位置/角度/缩放/层级）→建「书房」自动切走（画布 0 件）→**刷新**→断言两 chip 都在、当前场景还原为「书房」（aria-pressed=true）、书房画布 0 件→切回「客厅」→断言 placement 仍 1 个、`data-item-id` 一致、inline style **逐字节相同**（位置/角度/层级完整还原）。
   - **物件抽屉列出 14 件**：`getByTestId('tray-item')` `toHaveCount(14)`。
   - **背景不可重复且最多 3 个，第 4 个被阻止 + 置灰「素材已用完」**：初始 picker 3 张 → 建客厅后 picker 剩 2 张且「客厅」不再出现（不可重复）→ 建书房后剩 1 张 → 建卧室后 3 场景到顶、三者背景名互异 → `add-scene` `toBeDisabled`、`scenes-exhausted` 可见且文本=「素材已用完」、picker 打不开。

3. **视觉还原「旧信」DNA（暖奶油纸底、衬线品牌/场景名、陶土红唯一强调色、Workbench 布局，对齐 A-旧信.html 与 tokens.css）** —— 自检过（交评审终裁）。
   - Playwright 截图肉眼比对 4 态（空态 / 客厅放物件 / 三场景用尽 / 窄屏）：
     - 暖奶油：外层 `--color-sand` 暖沙、`.app` `--color-paper` 纸面、卡片 `--color-card`，无纯白。
     - 衬线：品牌名、场景 chip、物件名、空态标题均 `--font-serif`（Georgia 系）；UI 标签/kicker 用 `--font-sans`。
     - 陶土红唯一强调：模式开关激活段填充 `--color-accent`、激活 chip 陶土红描边 + `--color-accent-tint`、＋新场景虚线陶土红、页脚 `「旧信」` 加粗陶土红——未见第二强调色。
     - Workbench：报头 + 场景条 + `[抽屉 132px | 画布 1fr]`，画布背景 cover + `--canvas-inset` 暗角、物件 `--shadow-item` 投影。
     - 「素材已用完」提示为深墨底浅字胶囊，浮于置灰 ＋新场景 之上（对齐 demo `.chip.add::after`）。
     - 窄屏（≤880px）抽屉转横向滚动条、画布压低，无横向溢出（body `overflow-x:hidden` + 抽屉内部 `overflow-x:auto`）。
   - 变量全部取自 `src/styles/tokens.css`（M1-S1 已从 `.opc/.../tokens.css` 逐字复制的工程副本），未引用 .opc 内文件。

---

## 三、设计取舍与实现说明

- **场景创建 = 绑定背景**：＋新场景开一个 picker，只列**未被占用**的背景（背景不可重复的直接可视化）；选中即建场景，场景名取背景名（客厅/书房/卧室，衬线呈现）并置为当前。用满 3 张 → 按钮 `disabled` 置灰 + 常驻「素材已用完」。
- **「布局状态」的最小落点**：M1-S2 画布需可展示且布局可持久化还原。故实现「点物件抽屉缩略卡 → 在当前场景新增一条 `Placement`（默认错位摆放，`x/y/scale/rotation/z` 全写入模型）」。这是画布展示与刷新还原的载体；**拖动/角手柄缩放/顶部旋转手柄等变换交互不在本 sprint**（属 M2），未实现。
- **模式开关**：切换并持久化 `mode`；游客态下隐藏 ＋新场景、禁用放物件（只读外壳）。游客态点物件弹故事+原图属 M3，本 sprint 未做。
- **持久化路径**：所有变更经单一 `GalleryState` → `useEffect` 全量 `saveState`；刷新经 `loadState` 全量读回。未新增任何增量/字段级落盘路径，沿用 M1-S1 契约。
- **e2e 稳定性**：组件挂 `data-testid`（app/header/brand/mode-*/scene-bar/scene-chip/add-scene/bg-picker/bg-option/scenes-exhausted/tray/tray-item/canvas/placement）供测试稳定定位；每例 `beforeEach` 清 LocalStorage + reload 保证隔离。

---

## 四、复核可复现命令

```
npm run build                                              # 期望 exit 0
npx playwright test e2e/m1-shell.spec.ts --reporter=line   # 期望 exit 0，3 passed
npm run dev                                                # 本地肉眼过视觉
```

## 五、自评

自检对照验收硬指标逐条可对上：build exit 0、e2e 3 passed exit 0（覆盖建/切/刷新还原、抽屉 14 件、背景不可重复上限 3 + 第 4 个置灰「素材已用完」）、视觉四态截图比对对齐「旧信」DNA。过不过以评审为准。
