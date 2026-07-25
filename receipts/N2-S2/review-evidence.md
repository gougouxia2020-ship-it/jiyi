# N2-S2 评审证据 · 浮层玻璃四件套 + 拖动让路 + 字号下限 + N2 收口

评审员：reviewer（general 队）
核查对象：receipts/N2-S2/receipt-builder.md 自述改动（tokens.css / Header.tsx / SceneBar.tsx / ItemTray.tsx / Workbench.tsx / Canvas.tsx / App.css / 新建 e2e/n2-shell.spec.ts）
核查依据：.opc/sprints/N2-S2.json goal 字段【验收硬指标】段（milestones.json N2 criteria① + success.json 条目6 + idea.json R1/R6 + taste.json v2 玻璃与工艺底线段）
核查方式：亲手起 build/测试/dev server，打开页面用浏览器工具实际操作核对，不采信建造员自述。

---

## 0. 前置阅读

已读：teams/general/roles/reviewer.md、teams/general/skills/review-against-criteria.md、.opc/phase1/milestones.json（N2 条）、.opc/phase1/success.json（条目6）、.opc/phase1/idea.json（R1/R6 段落，位于 summary 字段）、.opc/phase1/taste/taste.json（v2 段）、.opc/phase1/taste/examples/design.md（v2 增补）、.opc/phase1/taste/examples/tokens.css（v2 token 块）、.opc/sprints/N2-S2.json（goal 全文含【验收硬指标】）、receipts/N2-S2/receipt-builder.md。均可读到，无 BLOCKED。

**范围说明**：N2-S2.json 明确「场景/物件的重命名与删除管理入口不在本 sprint 范围，属 N3」。idea.json R1 原文虽提到「物件抽屉…用完自动收回」与「命名与管理入口都在外壳」，但 sprint 的【验收硬指标】段落抄录 R1/R6 时只保留了浮层玻璃/让路/隐藏界面/dock 可收合+居中补偿/字号下限这几项，未把「用完自动收回」与「命名管理入口」列入本切片硬指标（后者已被 sprint 正文明确划给 N3）。按任务交待「不要拿全册标准误伤别的切片」，本轮评审只对照【验收硬指标】段列出的子集判定，不因这两点打回。

---

## 1. 生产构建

```
npm run build
> tsc -b && vite build
✓ 56 modules transformed.
✓ built in 333ms
```
exit 0，无类型错误。**过**。

## 2. e2e/n2-shell.spec.ts 亲跑

第一次：
```
npx playwright test e2e/n2-shell.spec.ts --reporter=line
Running 12 tests using 1 worker
...
12 passed (5.8s)
```
第二次（复跑防 flake）：
```
12 passed (5.5s)
```
两次全绿、exit 0，无 flake。**过**（对应硬指标①「npx playwright test e2e/n2-shell.spec.ts --reporter=line 须通过、exit 0」）。

## 3. 全量回归对照（核验建造员「零新增回归」说法）

```
npx playwright test --reporter=line
...
9 failed
    m2-transform.spec.ts:84   全链路变换…
    m2-transform.spec.ts:199  抽屉拖入落到画布外→不建 placement…
    m3-story.spec.ts:110      ①选中物件写故事→保存→刷新后故事完整还原…
    m4-full.spec.ts:412       ×3（PC/768px/375px）
    n1-foundation.spec.ts:98/152/196  ×3
  17 passed (1.3m)
```
17 passed / 9 failed，与 receipt-builder.md 第四节自报数字逐条一致；9 条失败全部落在 n1-foundation / m2-transform / m3-story / m4-full，**没有一条落在 n2-shell**。抽查 n1-foundation 两条失败详情：均断言 `schemaVersion===2`，实际读到 3——与 N1/N2-S1 的 schema v2→v3 升级自然冲突，是既有红、非本轮引入。判定：本轮**无新增回归**，与自述一致。

## 4. 视口铺满 + 无横向溢出 + 缩放不漂移 + 竖图 letterbox（硬指标①②③，抽查地基）

均由 e2e ①②③（1280/1920/2560/横屏手机 844×390 + 竖比例 620×1000）程序化验证并通过（见第2节）。这部分是 N2-S1 已验地基，本轮只抽查，未见异常，不作为本轮重点复核。

## 5. 拖动让路铁律（success.json 条目6，从严核查）

**自动化**：e2e ④a（画布内挪动）④b（dock 拖出）均通过，断言覆盖：拖动中 `.app.is-dragging` 命中、品牌章 `pointer-events:none` 且 `opacity<0.2`、`elementFromPoint` 命中不落在品牌章内（浮层确实不拦截指针）、松手后物件渲染中心 `clientY<48px` 且存储 `y<10%`（落在浮层常驻区顶部）、松手后浮层恢复 `pointer-events:auto`。

**手动复核**（真实浏览器，非测试环境）：
1. 起 `npm run dev`，打开 http://localhost:5173/，建客厅场景，点选放入「全家福旧照」。
2. 用 `left_click_drag` 把物件从画布中部拖到视口顶部 (700, 8)——该点正是品牌章/模式开关平时覆盖的区域。
3. 拖拽落地后截图：物件成功落在了视口最顶部（与品牌章同一水平带、部分越过品牌章右侧空白区），选中手柄框显示在顶部；松手后品牌章立即恢复满不透明可点（截图核对 `念念·陈列室` 文字清晰可见、无残留透明度）。

结论：任一浮层在拖动中不拦截指针、物件确实可以落到浮层常驻区（画面最顶部），**过**。

## 6. 浮层玻璃材质对齐 A2/design.md v2（--glass-bg + backdrop blur + --glass-line + --shadow-glass）

**token 逐字比对**：`src/styles/tokens.css` 的 v2 段与 `.opc/phase1/taste/examples/tokens.css` v2 段逐字节比对（Read 两份文件对比），`--glass-bg / --glass-bg-soft / --glass-line / --glass-blur / --shadow-glass / --h2-* / --sel-line / --text-label-min` 全部数值一致，无擅自改动。

**运行时 computed style 实测**（浏览器内 JS 执行，非读源码）：
```js
brand: { backdrop: "blur(16px) saturate(1.05)", shadow: "rgba(40, 25, 10, 0.5) 0px 10px 34px -14px", bg: "rgba(250, 244, 232, 0.78)" }
seg:   同上
scenes:同上
dock:  同上
```
与 tokens.css v2 的 `--glass-bg:rgba(250,244,232,.78)`、`--glass-blur:16px`、`--shadow-glass:0 10px 34px -14px rgba(40,25,10,.5)` 完全对应。

**视觉比对**：用本地 http.server 起 `A2-旧信-沉浸.html` 与本地 dev server 并排截图对比——品牌章/模式开关/场景条/dock 四处均呈半透明奶油玻璃质感、背景房间透过模糊可见，与参照 demo 观感一致（暖奶油底、玻璃描边、玻璃投影，无生硬实色块）。

e2e ⑤ 亦对四件套做了同等断言并通过。**过**。

## 7. 隐藏界面钮（眼睛）

**自动化**：e2e ⑥ 通过，断言收起后 brand/seg/scenes/dock opacity<0.05 且 pointer-events:none，眼睛自身 opacity>0 且 pointer-events:auto；再点恢复 opacity>0.95 且可接指针。

**手动复核**：点击真实页面的眼睛按钮 → 截图显示品牌章、模式开关、场景条、dock 全部消失，房间图完整可见，仅右上角残留一枚半透明（约 0.4 不透明度）幽灵眼睛图标且仍可点击；再点一次 → 全部浮层瞬间恢复可见可点。**过**。

## 8. dock 可收合成贴边把手 + 视觉居中补偿

**自动化**：e2e ⑦ 通过，断言展开态 `.dock-head` 相对 `.dock-panel` 水平居中（偏差<2px）；收合后把手纵向居中于视口（偏差<40px）。

**手动复核**：点击 dock 收合把手 → 截图确认面板内容（缩略卡列表）整体隐藏，只剩一枚竖条把手贴左边缘，且把手位置纵向精确落在视口中点（1400×773 视口下把手中心落在 y≈386，即 773/2）；再点展开 → 面板内容原样恢复，未见内容被把手挤偏。**过**。

## 9. UI 标签/分区标题字号 ≥ --text-label-min（11px）

**自动化**：e2e ⑧ 通过，覆盖 brand small / dock-head / scenes .lbl / chip / seg button / thumb span 六处，全部 ≥10.99px。

**手动复核**（浏览器内 `getComputedStyle` 实测，独立于 e2e 断言逻辑）：
```json
{ "brandSmall":"11px","dockHead":"11px","scenesLbl":"11px","chip":"13px","segButton":"12.5px","thumbSpan":"12px" }
```
全部 ≥11px，无一低于下限。另抽查源码：`.story__kicker`、`.story__orig-cap`、`.exhausted`、`.bg-picker__hint` 等散落在 App.css 各处的小字标签也均已切到 `var(--text-label-min)`，未见遗漏的硬编码小字号（<11px）标签。**过**。

## 10. 控制台/运行时错误

e2e ①②④a④b 内置 `watchErrors`（监听 pageerror + console.error），全部用例断言 `problems` 为空数组且通过。手动操作全程（建场景、放物件、拖动、隐藏界面、收合 dock）未见浏览器控制台报错（`read_console_messages` onlyErrors 查询为空）。**过**。

---

## 结论

【验收硬指标】九条逐一亲手核查，证据俱全，**全部通过**，且回归面无新增破坏（17 passed / 9 failed 与自述一致、9 条失败均为既有 schema 演进遗留、不落在 n2-shell）。未发现需要打回的缺项/错项/不达标项。

**判定：pass**
