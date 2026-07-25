# N2-S2 建造回执 · 浮层玻璃四件套 + 拖动让路 + 字号下限 + N2 收口

sprint 目标：在 N2-S1 的满屏沉浸自适应地基上叠「浮层玻璃四件套」——品牌章 / 模式开关＋隐藏界面钮 / 场景条 / 物件 dock（可收合成贴边把手、做视觉居中补偿）；落实拖动让路铁律；UI 标签/分区标题字号达到下限（≥11px）；新建并跑通 e2e/n2-shell.spec.ts，收口整个 N2 里程碑。
本 sprint 不做：场景/物件的重命名与删除管理入口（属 N3）；Canva 式手柄 v2（属 N3）。

---

## 一、开工前状态诊断（我接手时）

N2-S1 已落地满屏沉浸地基（场景自适应层三层 + schema v3 场景图坐标系百分比 x/y/w + 物件钉位），但浮层仍是「最简过渡态」：报头/场景条/物件抽屉是暖奶油纸底浮块、**非毛玻璃**，无拖动让路、无隐藏界面钮、dock 不可收合、e2e/n2-shell.spec.ts 不存在。另：`src/styles/tokens.css` 缺 v2 token 块（--glass-* / --h2-* / --sel-line / --text-label-min），源真值在 .opc/phase1/taste/examples/tokens.css v2 段。

基线 e2e（改动前）：`npx playwright test` = 5 passed / 9 failed。9 条红均为既有、与本 sprint 无关：
- n1-foundation ×3、m3:110①、m2:84、m4×3：断言 schemaVersion===2 或 v2 的 scale 字段——被 N1/N2-S1 的 schema v3 升级自然取代（N2-S1 回执已记录）。
- m2:199「抽屉拖入落到画布外→不建 placement」：它把落点打在报头上、期望**不**建 placement——而 N2 的成功条件6（拖动让路）恰恰要求顶部浮层区**可**落点，故该断言语义上已被本轮铁律作废（预期红）。

## 二、改动清单（成品全部落在 .opc/ 之外的 src/、e2e/）

1. **`src/styles/tokens.css`**：补齐 v2 token 块（--glass-bg/-soft/-line、--glass-blur、--shadow-glass、--h2-*、--sel-line、--h2-hit、--text-label-min:11px），逐字对齐源真值。

2. **`src/components/Header.tsx`**（重构）：拆成品牌章（`.brand.chrome.glass`，衬线名 + 大写小标）+ 右上控件组 `.ctl`（模式开关 `.seg.chrome.glass` + 隐藏界面钮 `.eye.chrome.glass.eye-keeper`）。新增 `uiHidden`/`onToggleUi` 两个 props；眼睛按 uiHidden 切换「开眼/闭眼」真 SVG 图标（无字符图标）。

3. **`src/components/SceneBar.tsx`**：`.scenes` 追加 `chrome glass` 类（成为玻璃浮层、参与让路/收起）。逻辑零改。

4. **`src/components/ItemTray.tsx`**（重构为可收合 dock）：`.dock.chrome.glass` = `[.dock-panel（.dock-head 分区标题 + .dock-list 缩略卡）| .dock-tab 贴边把手]`。新增 `closed` 收合态（窄屏 <880px 默认收合、宽屏默认展开，之后只由把手手动切换）+ `onDragChange` prop（拖出跨阈值置 true、松手/取消置 false）。删去 N2-S1 的窄屏横向 filmstrip / 翻页箭头 / drag-to-scroll（dock 改纵向列表）。保留全部测试 id：`tray`（dock 根）/`tray-item`/`drag-ghost`，另加 `dock-tab`、`data-closed`。

5. **`src/components/Workbench.tsx`**：上提两个纯 UI 开关 `dragging`/`uiHidden`（不入持久化），拼到 `.app` 类（`.is-dragging`/`.ui-hidden`，另暴露 data-*）；把 `onDragChange={setDragging}` 传给 Canvas 与 ItemTray，把 `uiHidden`/`onToggleUi` 传给 Header。

6. **`src/components/Canvas.tsx`**：`CanvasProps` 加 `onDragChange`；画布挪动手势跨过阈值处 `onDragChange(true)`（与 setActiveId 同批），`commitAndEnd` 里 `onDragChange(false)`（对 scale/rotate 幂等无副作用）。逻辑其余零改。

7. **`src/App.css`**（本 sprint 主交付）：
   - **玻璃材质** `.glass`：`--glass-bg` 半透明奶油 + `backdrop-filter: blur(--glass-blur) saturate` + `--glass-line` 描边 + `--shadow-glass`。
   - **拖动让路 + 隐藏界面** 的统一驱动：`.chrome` 登记浮层 + opacity 过渡；`.app.is-dragging .chrome{opacity:.05; pointer-events:none}`（拖动物件时全部浮层淡出且不接指针）；`.app.ui-hidden .chrome:not(.eye-keeper){opacity:0; pointer-events:none}` + `.app.ui-hidden .eye-keeper{opacity:.4}`（收起全部、唯眼睛留 .4 幽灵钮）。
   - **四件套样式**：`.brand`（h1+small，small 用 --text-label-min）、`.ctl`/`.seg`/`.eye`（玻璃胶囊 + 玻璃圆钮）、`.scenes`（玻璃胶囊行）、`.dock`（玻璃）+`.dock-panel`+`.dock-head`(--text-label-min)+`.dock-list`+`.dock-tab`（贴边把手，收合放大成 38×64 竖把手、chevron 翻向）。
   - **视觉居中补偿**（把手不对称）：`.dock` 锚 left + top:50% + translateY(-50%)——展开高面板与收合矮把手绕**同一竖直中线**伸缩，把手收合后仍纵向居中；把手独占右缘一栏（border-left 分隔、不压内容），面板内容整列水平居中（dock-head text-align:center、缩略卡满栏居中），把手横向单侧突出不挤偏内容。
   - **字号下限**：把 App.css 里所有低于 11px 的 UI 标签/分区标题一律提到 `--text-label-min`（brand small 10.5→11、dock-head 10.5→11、.scenes .lbl 11、exhausted 10→11、bg-picker__hint 11、story__kicker 10.5→11、story__orig-cap 10→11）；正文/大标题（--text-body 14.5、--text-title 22）本就达标。
   - **响应式收紧**：`@media(max-width:880px)` 报头/dock 收紧、故事弹窗贴底近满宽；`@media(max-height:560px)` dock 面板收窄、缩略图压小（面板高沿用默认 min(72vh,100vh-132px) 上限——纵向居中后上下各留 66px，避免高面板顶到品牌章；肉眼复核横屏手机 844×390 展开态品牌章完整不被遮）。

8. **`src/index.css`**：未改（overflow:hidden 满屏底已就位）。

9. **`e2e/n2-shell.spec.ts`**（新建，12 用例）：见下逐条自检；覆盖 milestones.json N2 criteria① 全部要点 + success.json 条目6 + idea R1/R6 + taste v2 玻璃与字号底线。

> 未新建无谓抽象、未改 .opc/ 任何文件、未顺手动无关的既有 spec。

## 三、逐条自检（对照【验收硬指标】）

核查手段：`npm run build`（tsc -b + vite build）；`npx playwright test e2e/n2-shell.spec.ts --reporter=line`（真跑、连跑 3 遍稳定）；`npm run dev` + Playwright 截图肉眼复核沉浸观感/让路/隐藏/收合/横屏手机五态。

| # | 硬指标 | 结论 | 证据（e2e 用例 / 手段）|
|---|---|---|---|
| 1 | `npx playwright test e2e/n2-shell.spec.ts --reporter=line` 通过、exit 0 | 过 | 实跑 **12 passed，exit=0**（连跑 3 遍无 flake）|
| 2 | 1280/1920/2560 与横屏手机视口均无横向溢出、外壳铺满 | 过 | 用例① ×4 视口：`documentElement/​body.scrollWidth ≤ clientWidth`、`.app` 左上角(0,0)且宽高==视口、场景图 contain 落在视口内；全程无 console error |
| 3 | 缩放窗口后物件相对场景位置不变 | 过 | 用例②：1280→1920→2560，存储 x/y 恒定，且「渲染中心相对场景图矩形的百分比」== 存储值（漂移 <1%）|
| 4 | 竖图场景图面完整可见（contain 不截断、补边不露底色）| 过 | 用例③：竖比例视口(620×1000)令横图上下 letterbox——图面两轴均 ≤stage（非 cover）、高明显 <stage（顶/底未裁）、`.scene-blur` 覆盖整视口（四缘出界）、computed filter 含 blur |
| 5 | 拖动中浮层不接指针且物件可落点在浮层常驻区（success 条目6）| 过 | 用例④a（画布挪动）：拖动中 `.app.is-dragging`、品牌章 `pointer-events:none`+opacity<.2+elementFromPoint 不命中浮层；松手物件落到最顶部（渲染中心 y<48px、存储 y<10%）；松手浮层浮回可接指针。④b（dock 拖出）：让路 + 幽灵可见 + dock 不接指针 + 落点在顶部建成 placement |
| 6 | 沉浸观感对齐 A2/design.md v2：--glass-bg + backdrop blur + --glass-line + --shadow-glass | 过 | 用例⑤：brand/seg/scenes/dock 四件套 computed `backdrop-filter` 含 blur、`box-shadow≠none`、背景为 rgba 半透明；肉眼复核截图 shot-01 玻璃质感/暗角/模糊补边对齐 A2 |
| 7 | 隐藏界面钮一键收起全部浮层、仅自身留幽灵钮可恢复 | 过 | 用例⑥：点眼睛 → `.app.ui-hidden`、brand/seg/scenes/dock opacity<.05 且 pointer-events:none、眼睛 opacity>0 且 pointer-events:auto；再点恢复（brand opacity>.95、可接指针）。截图 shot-02 纯房间唯留幽灵眼 |
| 8 | dock 可收合成贴边把手、视觉居中补偿、内容不挤偏 | 过 | 用例⑦：展开 dock-head 水平居中于面板（偏差<2px）；点把手→data-closed=true、缩略卡隐藏；收合把手纵向居中于视口（偏差<40px）；再点展开。截图 shot-03 收合把手贴左缘纵向居中 |
| 9 | UI 标签/分区标题字号 ≥ --text-label-min（11px）| 过 | 用例⑧：brand small / dock-head / scenes .lbl / chip / seg button / thumb span 计算字号均 ≥11px |

肉眼复核（taste，对齐 A2-旧信-沉浸.html 与 design.md v2）：满屏客厅场景铺满 contain 居中 + 四周暗角；四件套均毛玻璃（半透明奶油、backdrop-blur、玻璃描边/阴影）——品牌章左上、模式开关+眼睛右上、场景条底部居中、物件 dock 左侧带收合把手；拖动物件时全部浮层淡出让路、物件可摞到最顶部；隐藏界面纯看房间唯留幽灵眼；横屏手机(844×390)五要素齐、无溢出、品牌章不被 dock 遮。「旧信 · 沉浸」DNA 在位。

## 四、回归与已知事项（供评审知悉）

- **本轮零新增回归**。全量 `npx playwright test`：**17 passed / 9 failed**。17 = 基线原绿 5（m1-shell×3、m3:135②、m3:171③）+ 本轮新增 n2-shell 12；9 failed 与基线**逐条同一**（n1×3 + m3:110① + m2:84 + m4×3：schema v2→v3 漂移；m2:199：落点判定被让路铁律语义作废）。这些红是 N1→N2 schema/语义演进的既有产物，非本次引入，且超出本 sprint 范围（N2 里程碑级验收只认 e2e/n2-shell.spec.ts）。未按「不顺手改无关文件」原则改动这些旧 spec。
- **手柄仍为 v1**（方手柄 + ⟳/✎/× 字符）——Canva 式手柄 v2 与场景/物件重命名删除入口均归 N3，本 sprint 取舍范围外。
- dock 收合默认值在首帧按 `window.innerWidth<880` 定，之后只手动切换（不随缩放自动改），与 A2 参照一致。
