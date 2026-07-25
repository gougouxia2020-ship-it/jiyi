# review-evidence · M1-S2 · reviewer

角色：general 队 reviewer。对照 `.opc/sprints/M1-S2.json` goal 与 `.opc/phase1/milestones.json` M1 条目验收标准，
逐条亲手核查建造员交付物（不采信 `receipts/M1-S2/receipt-builder.md` 自述，全部重跑/重看）。

裁决：**pass**（挑不出可对照标准站住的问题，可定稿）。

---

## 0. 读档确认（无遗漏）

- `.opc/sprints/M1-S2.json` goal 与 `.opc/phase1/milestones.json` M1 条目文字逐字一致（三条 criteria：build / e2e / manual 视觉）。
- `.opc/phase1/success.json` 6 条成功条件里，本 sprint 只需不违背「多场景+背景不可重复」「数据持久化」两条的地基部分（故事/双模式属 M3/M4，未越界不算缺项）。
- 角色说明书 `roles/reviewer.md` 与技能 `skills/review-against-criteria.md` 已读：只认标准不认口味、亲手验证、逐条留证、打回需四件套（本次为 pass，不涉及打回）。
- 视觉参考 `taste/taste.json`、`taste/examples/design.md`、`taste/examples/tokens.css`、`taste/examples/A-旧信.html`（171K 行内含 base64 图片，用脚本剥离后读取结构化 CSS/HTML，见下）已读。

---

## 1. 生产构建（亲跑）

```
$ rm -rf dist && npm run build
> tsc -b && vite build
✓ 55 modules transformed.
✓ built in 335ms
BUILD_EXIT=0
```

- exit 0。`tsconfig.app.json` 确认 `strict: true` + `noUnusedLocals/Parameters` 全开，`tsc -b` 是真严格检查，非空转。
- 产物 `dist/assets`：3 张背景 jpg + 14 张物件 png（带哈希）+ index js/css，与素材清单数量吻合。

**判定：达标。**

---

## 2. e2e（亲跑，并逐句核对用例是否真测了硬指标三块）

```
$ npx playwright test e2e/m1-shell.spec.ts --reporter=line
Running 3 tests using 1 worker
[1/3] 建场景 → 切场景 → 刷新后场景与布局状态完整还原
[2/3] 物件抽屉列出全部 14 件物件
[3/3] 场景背景不可重复且最多 3 个：第 4 个被阻止并置灰"素材已用完"
3 passed (2.2s)
E2E_EXIT=0
```

逐条核对 `e2e/m1-shell.spec.ts` 断言强度（防止「测了别的凑数」或「断言太松放水」）：

- **建/切/刷新还原**：建「客厅」→放第一件物件→记录 `placement` 的完整 inline `style`（含 x/y/rotation/scale/z）→建「书房」（自动切走，断言 `aria-pressed=true` 且书房画布 0 件）→`page.reload()` 真刷新→断言两个 chip 都在、当前场景仍是刷新前激活的「书房」、切回「客厅」后 placement 数量、`data-item-id`、且 `style` 字符串与刷新前**逐字节相等**（`expect(...).toBe(styleBefore)`，不是宽松的「存在即可」）。这是过硬的还原验证，不是凑数。
- **抽屉 14 件**：`getByTestId('tray-item')` `toHaveCount(14)`，直接对应 manifest 里 `ITEMS` 长度，非近似值。
- **背景不可重复+上限3+第4个阻止**：分三步建场景，每步之后重新打开 picker 断言剩余选项数（3→2→1→0）且已用背景名不再出现（不可重复的正向证据，而非只测数量）；建满 3 个后断言 `add-scene` `toBeDisabled()`、`scenes-exhausted` 文本精确等于「素材已用完」、且此时 picker 打不开（`toHaveCount(0)`）。三处断言分别覆盖「不可重复」「上限3」「第4个被阻止+置灰提示」，未偷工减料。

**判定：达标，且断言强度经得起复核，非放水测试。**

---

## 3. 视觉「旧信」DNA 走查（亲自起 dev server + Playwright 截图比对，非采信建造员自述）

```
$ npm run dev -- --port 5179 --strictPort   # 后台起
$ node shot.mjs   # 用项目自带 playwright 截图 5 态
```

截图核对（`/private/tmp/.../scratchpad/shots/01~05.png`，已逐张肉眼看过）：

- **暖奶油纸底**：`--color-sand:#e7dcc7` 外层、`--color-paper:#f4ecdd` 应用纸面——与 `A-旧信.html` 里 `html,body{background:#e7dcc7}` / `--paper:#f4ecdd` 逐值相同（`src/styles/tokens.css` 与 `.opc/.../tokens.css` diff 为空，见下）。
- **衬线品牌/场景名**：品牌「念念 · 陈列室」、场景 chip「客厅/书房/卧室」均渲染为衬线（Georgia 系），UI 标签（MEMORY ROOM kicker、"物件"、hint）为无衬线，与 design.md 字体铁律一致。
- **陶土红唯一强调色**：模式开关激活段（`编辑`）填充陶土红反白字；场景 chip 激活态陶土红描边+浅底；＋新场景虚线陶土红；页脚「旧信」加粗陶土红。全站扫描 `App.css` 硬编码颜色（`grep -nE "#[0-9a-fA-F]{3,6}|rgba?\("`）只有中性灰/黑（`#b9ad97` 停用色、`#b0a487` hint 灰、`#000` 画布底、`rgba(44,38,32,.55)` 深色 tooltip 底），均是中性色非第二强调色，与 demo 里 `.chip.add::after`/`.sel .tag` 用 `var(--ink)` 做深色胶囊底同源，未违反"唯一强调色"。
- **Workbench 布局**：报头（品牌+模式开关）→场景条→`.grid{132px 1fr}`（抽屉|画布）→页脚，结构与 `A-旧信.html` 的 `.top/.scenes/.grid(.tray/.stage)/.foot` 一一对应。
- **窄屏响应式**（400×800 截图 05）：`.grid` 收为单列、`.tray` 转横向滚动条（`overflow-x:auto`）、`.tray h4/.hint` 隐藏，画布压到抽屉下方，截图宽度与 viewport 一致（`sips` 核验为 400px 无溢出）。`src/index.css` 确认 `body{overflow-x:hidden}`（M1-S1 地基，沿用未新增口子）。
- **素材已用完提示**：3 场景用尽后 `add-scene` 呈灰色禁用、上方浮出深墨底浅字胶囊「素材已用完」，与 demo `.chip.add::after` 视觉语言一致。

`diff` 核对 `src/styles/tokens.css` 与 `.opc/phase1/taste/examples/tokens.css`：两者内容逐字节相同（除头部一行"工程副本"注释），确认未凭空改动 token。

**判定：达标，视觉核对非只信自述截图描述，是本人另起 dev server + 独立脚本重新截图比对。**

---

## 4. 持久化路径核对（是否复用 M1-S1，而非另起炉灶）

- `src/App.tsx` 唯一持久化调用点：`useReducer(galleryReducer, undefined, loadState)` + `useEffect(() => saveState(state), [state])`，两个函数均 `import from '../` `./storage/persistence'`（即 M1-S1 `src/storage/persistence.ts`），未新建任何 storage 模块。
- 实测（脚本驱动浏览器）：建场景+放物件后 `Object.keys(localStorage)` 结果为 `['memories.gallery']`——恰好是 `persistence.ts` 里的 `STORAGE_KEY = 'memories.gallery'`，只有这一个键，未新增并行存储通道。
- `localStorage.getItem('memories.gallery')` 内容为 `{"schemaVersion":1,"scenes":[...],"items":[...]}`，字段结构与 `model/types.ts` 的 `GalleryState` 一致，`schemaVersion` 用的是 M1-S1 的 `SCHEMA_VERSION`。

**判定：达标，确认经 M1-S1 persistence.ts 存取，未重新发明。**

---

## 5. 素材/数据模型复用核对（未重新发明 M1-S1 地基）

- `src/model/types.ts`、`src/assets/manifest.ts`、`src/storage/persistence.ts`、`src/styles/tokens.css` 四份 M1-S1 地基文件内容与建造员声明的"未改"一致（本次评审读取的内容与自述改动清单吻合，未发现被绕过或复刻的迹象）。
- `src/state/gallery.ts` 的 `galleryReducer`/选择器都 `import` 自 `model/types` 与 `assets/manifest`，未重复定义 `Scene/Item/Placement` 等类型或另起素材清单。

**判定：达标。**

---

## 6. 运行时健壮性抽查（非硬指标，但顺手证伪）

- 脚本驱动：建场景 → 连续点满 14 件物件放入同一画布 → 切游客/切回编辑，全程监听 `console.error` 与 `pageerror`：结果为空数组，无未捕获运行时错误。（M4 才是硬性验收此项，这里只是顺手核实本 sprint 没有引入运行时报错，超出本 sprint 硬指标范围，仅作佐证不计入本 sprint 判据。）

---

## 7. receipts/M1-S2/receipt-builder.md 核对

- 文件存在，记录了改动清单、逐条自检（对照本 sprint 三条硬指标）、设计取舍说明（M2/M3 边界未越界的解释）、复核命令、自评。内容与本人亲自复核结果一致，未发现自述与实测不符之处。

---

## 结论

三条硬指标（build / e2e / 视觉）逐条亲手复核，均达标；持久化与素材/模型复用未偏离 M1-S1 地基；e2e 断言强度经检验非放水。**放行定稿（pass）**，无需打回。
