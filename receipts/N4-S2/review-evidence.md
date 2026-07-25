# N4-S2 评审证据（reviewer）

- sprint：N4-S2（里程碑 N4：双模式、双端与收口）
- 评审对象：`e2e/n4-full.spec.ts`、`src/components/StoryModal.tsx`、`src/App.css`、`receipts/N4-S2/receipt-builder.md`
- 尺子：`.opc/sprints/N4-S2.json` goal（【验收硬指标】段）＋ `.opc/phase1/milestones.json` N4.criteria 原文 ＋ `.opc/phase1/success.json` 9 条 ＋ `.opc/phase1/taste/taste.json` ＋ `.opc/phase1/taste/examples/design.md`（v1+v2）＋ `tokens.css`（v1+v2）
- 开工必读档案：全部读到（reviewer.md、review-against-criteria.md、N4-S2.json、milestones.json、success.json、taste.json、design.md、tokens.css）——无 BLOCKED。

## 逐条核查

### 1. 命令 exit 0，双视口覆盖 9 条成功条件（milestones.json N4.criteria①）

命令：`npx playwright test e2e/n4-full.spec.ts --reporter=line`，连跑 4 次（含一次带显式 exit code 检查）：

```
=== run 1 ===
  2 passed (7.2s)
=== run 2 ===
  2 passed (7.1s)
=== run 3 ===
  2 passed (7.2s)
EXIT CODE CHECK: ... 2 passed (7.2s)  exit=0
```

两条 test 分别为 `@PC1920`（1920×1080）与 `@phone844×390`（844×390），源码 `VP_PC = {1920,1080}` / `VP_PHONE = {844,390}`（n4-full.spec.ts:31-33），`for (const vp of [VP_PC, VP_PHONE])` 生成两条独立 test（n4-full.spec.ts:579-591），各自 `freshApp` 从零跑 `runMainFlow`——不是共享状态，是两条独立端到端跑法。核对链路覆盖 9 条成功条件：①主流程闭环（写故事+游客读故事原图，行 364-401）、⑥浮层让路（dock拖出 267-285、画布挪动到顶 306-343）、⑦持久化+故事同步（跨场景双向同步 432-446、刷新逐字段 toEqual 还原 558-568）、⑧管理与命名（场景改名/删除/再建 476-503、物件改名跨场景同步 508-523、陈列室名 528-536，刷新后逐一复核 544-568）、⑨场景约束+双端（3场景到顶/第4阻止 448-467、573-574，双视口分别整条跑通）。**结论：过，有证据。**

### 2. 双视口无横向溢出 / 无 console 未捕获错误 / 未处理 Promise 拒绝（milestones.json N4.criteria①）

源码核对：`assertNoHorizontalOverflow`（n4-full.spec.ts:75-81，比对 `scrollWidth` vs `clientWidth`）在起点（255）、3 场景满态（468）、刷新后（575）三处调用，两个 test 各自跑一遍（非共享）。`attachErrorGuards`（45-64）为每条 test 独立挂载：`pageerror` 事件、页面内 `unhandledrejection` 监听（经 `addInitScript` 在每次 reload 后重挂）、`console` type=error（过滤 `Failed to load resource` 网络 404，此口径沿用既有 M4 收口 spec，非本轮新引入）。`assertNoRuntimeErrors`（66-73）在每条 test 末尾调用（589）。4 次连跑全绿，说明该断言确实生效且未触发。**结论：过，有证据。**

### 3. 故事弹窗窄屏贴底近满宽（design.md v2 响应式 + success.json②/success.json①）

源码断言（n4-full.spec.ts:402-408）：`vp.narrow` 分支下量 `boxOf(guestModal)`，`width > vp.width*0.9`、`y+height > vp.height-40`（贴底）、`x+width <= vp.width+1`（不溢出）。CSS 核对 `src/App.css:1204-1212`（`@media (max-width: 880px)`）：`.story { right:12px; left:12px; width:auto; top:auto; bottom:12px; transform:none; }`——844px 视口落在 ≤880px 断点内，确实触发该规则。亲手截图核验：`03-story-edit-phone844x390.png` / `04-guest-story-phone844x390.png` 显示弹窗贴视口底、左右仅留窄边距、近满宽，SVG 关闭钮在右上角清晰可见；PC 端 `04-guest-story-pc1920.png` 显示弹窗为右侧竖直居中浮窗（~290px，不占画布宽度），两端形态均符合规范（v1 弹窗规则 + v2 响应式覆盖）。**结论：过，有证据（代码 + 截图）。**

### 4. 工艺底线·字号下限 ≥11px（taste.json / design.md v2 / tokens.css `--text-label-min:11px`）

`assertLabelFloor`（n4-full.spec.ts:87-101）量 `.brand small`、`.dock-head`、`.scenes .lbl` 三处 computed font-size，双视口满态各跑一次（470）。核对选择器对应真实 DOM：`Header.tsx:59 <small>Memory Gallery</small>`（父 `.brand`，Header.tsx:31）、`SceneBar.tsx:113 <span className="lbl">场景</span>`（父 `.scenes`）、App.css:663-668 `.dock-head { font-size: var(--text-label-min) }` 显式绑定 token。选择器真实存在、非误配。4 次连跑全绿，无字号低于 11px 的失败。**结论：过，有证据。**

### 5. 选框贴合可见实物 / dock 视觉居中补偿（taste.json 工艺底线）

- 选框贴实物：亲手截图 `02-selected-pc1920.png`、`02-selected-phone844x390.png`——陶土红细选框紧贴照片图面本体（非阴影区），四角白圆点手柄、下方旋转圆钮、上方玻璃工具条（铅笔/垃圾桶真 SVG）均在框上。素材裁切/选框对齐属 N1 既有校验（`scripts/check-asset-trim.mjs`），本轮未改动素材或选框逻辑，截图确认未退化。
- dock 居中补偿：`src/App.css:630-650` 注释＋实现核对——`.dock { left; top:50%; transform:translateY(-50%) }`，展开面板与收合把手共用同一竖直中线，把手独占右缘一栏（`border-left`）不压内容，`.dock-head { text-align:center }`。截图 `05-dock-closed-pc1920.png` 显示收合后把手仍纵向居中于整个视口高度，符合「不对称控件视觉居中补偿」。**结论：过，有证据（代码 + 截图）。**

### 6. 整体视觉还原「旧信·沉浸」DNA（design.md v2 + tokens.css v2）

截图逐项核对：玻璃浮层（品牌章/模式开关+隐藏界面钮/场景条/dock 均半透明奶油底+blur，见全部截图顶部/底部/左侧元素）、陶土红手柄与激活态（选框、模式开关激活段、场景 chip 激活描边均陶土红）、暗角与模糊补边（画布四周可见渐暗/模糊过渡，`--canvas-inset` 沿用）、选框贴实物（见上条）。三份档案（design.md v2、tokens.css v2、demo A2-旧信-沉浸.html 结构）与截图观感逐一对齐，未见偏离。**结论：过，有证据（截图）。**

### 7. StoryModal 关闭钮：字符 ✕ → 真 SVG（design.md v2 工艺底线「字符图标自 v2 起判不合格」）

`src/components/StoryModal.tsx:61-73`：`<svg viewBox="0 0 24 24" ...><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`，两条 path 画叉，非字符 ✕、非 CSS 伪装（`content:'✕'` 之类）。全仓扫描 `grep -rn "✕|⟳|✎" src/*.tsx src/components/*.tsx` 与 `content:` 伪元素——命中的全部是代码注释（说明"替代字符✕"），无一处渲染态字符图标或 CSS content 图标残留。`src/App.css:984-1006` `.story__close` 已去掉 `font-size`（字符时代残留），改为 `padding:0` + `.story__close svg{width/height:13px}`，与实现一致。截图核验（`04-guest-story-*.png`）关闭钮清晰是描边叉号 SVG，非字符字形。**结论：过，有证据（代码 grep + 截图）。**

### 8. 回归验证（不引入破坏）

- `npm run build`：`tsc -b && vite build` → `✓ built in 331ms`，**EXIT 0**，无类型错误。
- `npx playwright test e2e/n2-shell.spec.ts e2e/n3-edit.spec.ts --reporter=line` → **19 passed**，**EXIT 0**（含 N3「F 无字符图标残留 @PC/@横屏手机」，两处均绿，交叉印证第 7 条）。
- 额外亲手补跑历史全量（m1/m2/m3/m4/n1）核实是否有隐藏破坏：**9 failed / 5 passed**。核查失败原因：均为 `schemaVersion` 断言不匹配（如 n1-foundation 期望 `schemaVersion:2`，实际 `3`）与旧像素坐标假设，与本轮改动的 `StoryModal.tsx`/`App.css`/`n4-full.spec.ts` 无关——是 N2 把 schema 从 v2 升到 v3（坐标系锚定场景图矩形，`n4-full.spec.ts:373` 注释「N2 升 v3」）后遗留的**存量**过期用例，m1-m4/n1 milestone 早已 `status:"done"` 定稿于各自的验收时点，schema 演进后旧 spec 未同步更新属已知历史状态，非 N4-S2 引入的新破坏。N4-S2 契约要求的回归口径（"至少 n2/n3 已有 e2e"）已满足且全绿。**结论：过（未引入新破坏），存量过期用例不计入本轮回归判据，已如实记录。**

## 附：自报回执核验

建造员自报「连跑4次2 passed EXIT0、build EXIT0、n2/n3回归19 passed」——亲手复核数字与结论一致，未发现自报与实测不符之处。

## 裁决

9 条硬指标/工艺底线/视觉 DNA 逐条核查，均有命令输出/代码原文/截图为证，未发现缺、错、不达标项。**放行定稿（pass）。**
