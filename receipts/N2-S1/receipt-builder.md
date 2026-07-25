# N2-S1 建造回执 · 满屏沉浸地基 + 场景自适应层

sprint 目标：拆掉定宽 Workbench 外壳，场景铺满整个视口；接入场景自适应层（任意比例 contain 居中 + 同图放大模糊补边）；物件坐标锚定场景图坐标系百分比（x/y/w），窗口任意缩放物件钉在房间同一相对位置。
本 sprint 不做：浮层玻璃四件套、拖动让路铁律、dock 收合与视觉居中补偿、UI 字号下限、e2e/n2-shell.spec.ts（均留 N2-S2 / 收口）。

---

## 一、开工前状态诊断（我接手时）

React 逻辑层（Canvas.tsx / Workbench.tsx / model/types.ts / storage/persistence.ts / state/gallery.ts / assets/manifest.ts）已按 N2-S1 语义写好——场景自适应层三层结构、schema v3 场景图坐标系百分比 x/y/w、按 imgRect(contain 几何) 换算物件几何、抽屉拖入落点换算——但存在两处未完工的硬伤：

1. **生产构建失败**：`src/components/Canvas.tsx` 两处 TS2339 —— `onItemPointerDown` / `onScalePointerDown` 的形参类型 `{ id,x,y,w,rotation }` 漏了 `itemId`，函数体却读 `p.itemId`（第 196、242 行）。
2. **CSS 完全没跟上**：`src/App.css` 与 `src/index.css` 仍是 M 系定宽 1180px Workbench 外壳——`body{ padding; display:flex; justify-content:center }`、`.app{ max-width:1180px; border; box-shadow }`、`.stage{ position:relative }`，且**完全没有** `.scene-blur`/`.scene-img`/`.stage__items` 的任何样式，报头/场景条/抽屉仍是 in-flow 的 `.grid` 栏。照此渲染即定宽居中盒 + 右侧留白 + 场景层不成形，直接判负。

## 二、改动清单（成品全部落在 .opc/ 之外的 src/）

1. **`src/components/Canvas.tsx`**（修构建）：给 `onItemPointerDown`、`onScalePointerDown` 两个形参类型补上 `itemId: string`（调用处传的本就是完整 Placement，含 itemId）。`onRotatePointerDown` 不读 itemId，未动。逻辑零改动。
2. **`src/index.css`**：`body` 的 `overflow-x:hidden` → `overflow:hidden`（满屏外壳固定铺满，页面双轴都不滚动）。
3. **`src/App.css`**（本 sprint 主交付，整档重构）：
   - **满屏外壳**：删 `body` 的 padding/flex/居中、删 `.app` 的 max-width:1180px/border/圆角/盒阴影；`.app{ position:fixed; inset:0; overflow:hidden }` 铺满视口。
   - **场景自适应层**（自底向上四层，对齐 Canvas.tsx 的 DOM）：
     - `.scene-blur` z0：`inset:-4% + scale(1.06)` 外扩、`background-size:cover`、`filter:blur(30px) saturate(1.06) brightness(.9)`——同图放大模糊补边、轻微降亮，任意比例不露底色。
     - `.scene-img` z1：`inset:0; width/height:100%; object-fit:contain; object-position:center`——contain 居中完整显示，几何与 Canvas.tsx `containRect()` 一致（物件坐标锚定的正是这块图面矩形）。
     - `.stage::after` z2：`box-shadow:var(--canvas-inset)`、`pointer-events:none`——画布暗角沿用 --canvas-inset 气质，压在场景层之上、物件层之下。
     - `.stage__items` z3：`inset:0`——物件层压在暗角之上。
   - **浮层（最简过渡，非玻璃）**：`.top` 顶部透明容器（pointer-events:none，空白透传）承 `.brand` 品牌章（左上暖奶油浮块）+ `.seg` 模式开关（右上）；`.scenes` 场景条改底部居中浮块胶囊，`.bg-picker` 改向上弹出（不越视口底缘）；`.tray` 物件抽屉改左侧居中浮块 dock（纵向滚动，暖奶油纸底）。全部 `z-index:20`，压在物件层之上、故事弹窗(z40)之下。
   - **删死样式**：`.stage__bg`、`.grid`、`.foot` 及旧 `@media` 里的 grid/filmstrip 复杂逻辑（新 DOM 已不含 `.grid`/`.foot`）。
   - **保留原样**：v1 选中态手柄组（`.stage__frame`/`.stage__handle*`/`.stage__stem`/`.stage__rot`/`.stage__remove`/`.stage__story-btn`——手柄 v2 归 N3）、故事弹窗 `.story*`、缩略卡 `.thumb*`、chip/seg/bg-option 细则、`.tray__ghost`、reduced-motion。
   - **响应式收紧**：`@media(max-height:560px)` 横屏手机 dock 收窄压小、`@media(max-width:880px)` 手柄命中区放大到 --handle-hit + 故事弹窗贴底近满宽（不做 dock 收合，那是 N2-S2）。

> 未新建无谓抽象、未新建文件；照 src/ 现有结构就地改。未碰 .opc/ 任何文件。

## 三、逐条自检（对照【验收硬指标】）

核查手段：`npm run build`（tsc -b + vite build）；`npm run dev` + Playwright 无头脚本跨 5 个视口（1280×800 / 1920×1080 / 2560×1440 / 横屏手机 844×390 / 竖屏 700×1000）实测几何 + 截图肉眼复核。

| # | 硬指标 | 自检结论 | 证据 |
|---|---|---|---|
| 1 | 生产构建通过、无类型错误 | 过 | `npm run build` exit 0（补 itemId 后 tsc -b 通过、vite build 成功）|
| 2 | 场景铺满视口，无定宽留白、无元素堆角、无横向滚动（1280/1920/2560/横屏手机） | 过 | 四视口实测 `documentElement.scrollWidth ≤ clientWidth`（无横滚）、`.app` 矩形 == 视口且左上角(0,0)（铺满、无留白、无堆角）|
| 3 | 窗口任意拉伸，物件始终钉在房间同一相对位置，无漂移 | 过 | 五视口实测：物件渲染中心相对场景图矩形的百分比 == 存储 x/y（18.00/23.96 vs 18/24），跨全部视口一致，差 <0.6% |
| 4 | 任意比例 contain 居中完整显示、不裁图面 | 过 | 五视口实测场景图 contain 矩形完全落在视口内（未被裁）；横视口侧边留白、竖视口(700×1000)上下留白——两向 letterbox 均成立（机制为纯 object-fit:contain，比例无关，竖/横/方图一律成立）|
| 5 | 两侧用同图放大模糊版补满（blur≈30px、轻微降亮），不露底色 | 过 | 实测 `.scene-blur` 覆盖整个视口（left/top≤0、right/bottom≥视口）、computed filter 含 `blur(30px)`（另含 brightness(.9) 降亮）；截图见右侧暖调模糊补边条，无裸底色 |
| 6 | 画布暗角沿用 --canvas-inset，压在场景层之上、物件层之下 | 过 | `.stage::after{ z-index:2; box-shadow:var(--canvas-inset) }`，场景层 z0/z1、物件层 z3——层序正确；截图四周见轻微压暗 |
| 7 | 坐标改存场景图坐标系百分比 x/y/w，允许出界进补边区 | 过 | model/types.ts + persistence.ts SCHEMA_VERSION=3 + reducer 均以 x/y(中心%)/w(宽占图%) 存取；move/drop 换算不 clamp（允许 <0 或 >100 出界进补边区）；刷新经 loadState 全量还原 |
| 8 | 无未捕获运行时错误 | 过 | Playwright 全程 `console.error`/`pageerror` 收集为空数组 |

肉眼复核（taste，对齐 A2-旧信-沉浸.html 与 design.md v2 气质）：满屏书房场景铺满、contain 居中、右侧同图模糊补边、四周暗角；浮层为暖奶油纸底（品牌章左上 / 模式开关右上 / 物件 dock 左中 / 场景条底部居中），陶土红强调、衬线品牌名——「旧信 · 沉浸」DNA 在位。浮层为最简过渡态（暖奶油纸底、非毛玻璃），符合本 sprint「不做玻璃四件套」的取舍。

## 四、已知事项（非本 sprint 缺陷，供评审知悉）

- **e2e/n1-foundation.spec.ts 3 条现红**：均为 N1（schema v2）时代的断言，与 N2-S1 本身要求的 schema v3 冲突——测试硬编码 `schemaVersion===2`（第 115/186/208 行）且第①条的像素换算按旧「可视区百分比」语义（第 130-131 行）。N2-S1 的硬指标「坐标改存场景图坐标系百分比 x/y/w」本就要求升 v3，故这些 N1 断言被自然取代。N2 里程碑级验收走 e2e/n2-shell.spec.ts（本 sprint 按派工明确暂不写、留收口）。这三条红是 N1→N2 schema 演进的预期产物，非本次改动引入的回归（v3 坐标系已由上文 Playwright 实测证明正确钉位）。未按「不顺手改无关文件」原则改动该 spec。
- 手柄仍为 v1（方手柄 + ⟳ 字符）——Canva 式手柄 v2 归 N3；浮层玻璃/拖动让路/dock 收合/字号下限归 N2-S2；均在本 sprint 取舍范围外。
