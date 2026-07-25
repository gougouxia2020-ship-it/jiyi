# M4-S2 评审证据（reviewer 独立核验）

- 项目：念念 · 陈列室（OPC general 团队）
- 里程碑：M4（收口 · 全流程 + 双端达标）
- Sprint：M4-S2
- 契约：`.opc/sprints/M4-S2.json` 的 `goal` 字段【验收硬指标】段
- 交付物核查对象：`e2e/m4-full.spec.ts`、`src/index.css`、`src/App.css`
- 建造回执：`receipts/M4-S2/receipt-builder.md`（已读，逐条不照单全收，全部亲手复核）

方法说明：全部结论均来自本次亲手执行的命令 / 独立编写的探针脚本（未复用建造员脚本），
探针跑在项目自身 `node_modules/@playwright/test`（`chromium.launch()` 直驱 `npm run dev` 起的活
dev server，端口 5179，与建造员使用的端口不同，避免复用其进程/状态）。探针脚本用后已从项目根
删除，未污染交付物。

---

## 1. 硬指标命令 exit 0 且真覆盖三视口（非仅 PC 加两个空跑）

**试图证伪时做了什么**：亲自跑 `npx playwright test e2e/m4-full.spec.ts --reporter=line` 三次（含
一次首跑 + 两次复核跑），并通读 `e2e/m4-full.spec.ts` 全文，确认 `VIEWPORTS` 数组与 `runFullJourney`
的调用关系，检查是否存在「同一测试体多次调用」被伪装成三个 test 的取巧写法。

**关键观察**：
- 三次独立执行结果一致：
  ```
  Running 3 tests using 1 worker
  [1/3] 视口 PC › 全流程主链路（PC）
  [2/3] 视口 768px › 全流程主链路（768px）
  [3/3] 视口 375px（横屏手机代表视口）› 全流程主链路（375px（横屏手机代表视口））
    3 passed (7.8~7.9s)
  EXIT=0
  ```
- 代码级确认（`e2e/m4-full.spec.ts:400-418`）：`VIEWPORTS` 数组 3 项（PC=null 沿用
  `playwright.config.ts` 默认 Desktop Chrome 1280×720；768px=768×1024；375px=667×375 横屏），
  `for` 循环生成 3 个独立 `test.describe` + `test()`，每个各自完整调用一次 `runFullJourney(page, vp.label)`
  （`runFullJourney` 长达 174 行，覆盖建场景→摆物件→拖动→缩放→旋转→写故事→游客模式→多场景上限3
  →跨场景同步→刷新持久化还原，见 `e2e/m4-full.spec.ts:217-390`），非空跑、非复制粘贴同一断言。
  每个 test 独立 `beforeEach`（`attachErrorGuards` + `freshApp`）重置状态，互不共享 page/localStorage。
- 单次总耗时 7.8~7.9s / 3 视口 ≈ 每视口 2.6s，与「真跑一遍完整链路（含约 10+ 次 UI 交互与断言）」
  的量级吻合，不是空跑（空跑量级应 <1s/视口）。

**结论**：达标。命令真实 exit 0，三视口各自完整跑通同一条主链路，非取巧凑数。

---

## 2. 三视口是否都断言「无横向溢出」「无 console 未捕获错误」「无未处理 Promise 拒绝」

**试图证伪时做了什么**：通读 `assertNoHorizontalOverflow`（`e2e/m4-full.spec.ts:66-73`）与
`assertNoRuntimeErrors`（`e2e/m4-full.spec.ts:57-64`）实现，确认它们是否真的在 `runFullJourney`
内部被调用、调用次数、以及 `attachErrorGuards`（`e2e/m4-full.spec.ts:35-55`）挂载时机是否覆盖全程
（含 `page.reload()` 后）。另外独立写探针验证「资源 404 排除」这条口径是否被滥用掩盖真实错误。

**关键观察**：
- `runFullJourney` 内 `assertNoHorizontalOverflow` 调用 3 处（起点空态 / 建满 3 场景后 / 刷新还原后，
  `e2e/m4-full.spec.ts:224,359,386`），`assertNoRuntimeErrors` 调用 1 处（末尾，`e2e/m4-full.spec.ts:389`，
  内部展开 3 项断言：`pageErrors`/`unhandledrejection`/`consoleErrors` 均须为空数组）。三个视口各自
  独立跑一遍 `runFullJourney`，故实际共 3×3=9 处溢出断言 + 3×3=9 项运行时错误断言全部执行并通过
  （已由第 1 条的 3 次全绿命令间接证实——任一断言失败该视口的 test 即会标红，而三次跑批均 3 passed）。
- `attachErrorGuards` 用 `page.addInitScript` 挂 `unhandledrejection` 监听（在每次导航/`reload()` 后
  重新执行，覆盖刷新后的阶段），`page.on('pageerror', …)` 与 `page.on('console', …)` 在 `beforeEach`
  于该视口的 `page` 上挂一次，贯穿该视口全程（含 reload），未见遗漏窗口期。
- 独立探针复核「Failed to load resource」排除口径是否掩盖真实网络失败：直驱 dev server，走一遍
  「建场景→逐个点选 14 件抽屉物件」，监听 `response`（`status()>=400`）—— 结果 `failed: []`，当前应用
  无任何真实 404/5xx。该排除条款目前未掩盖任何实际发生的错误，是防御性写法而非取巧藏错。

**结论**：达标。三视口逐一都覆盖了三类断言，且排除口径未被滥用。

---

## 3. 响应式布局问题是否真的被修复（走 tokens.css，非嘴上说修）

独立探针直驱活 dev server（端口 5179），在 PC(1280×720)/768×1024/667×375(横屏) 三档实测，
不采信建造回执里的数字，逐项重新量出：

| 检查点 | PC | 768px | 375px横屏 | 结论 |
|---|---|---|---|---|
| 抽屉横向滚动条 | `.tray` display=block，`scrollWidth(131)==clientWidth(131)`，不可横滚 | display=flex，`scrollWidth(1508) > clientWidth(746)`，**可横滚**，14 件全部在内 | display=flex，`scrollWidth(1508) > clientWidth(645)`，**可横滚** | ✓ 真横滚，非仅切了 CSS 属性没内容可滚 |
| 画布压低 | `.stage` min-height=`auto`（宽屏仅 `.grid` min-height:520px 生效） | `.stage` min-height=`340px` | `.stage` min-height=`340px` | ✓ 窄屏确实收窄 |
| 弹窗贴底近满宽 | `.story` 浮于右侧，`right gap=105px`（不占画布宽度，符合「不做右侧常驻面板」以外的 PC 浮窗设计） | 宽 722px（视口 768，近满宽），相对 `.stage` 左右各留 12px（`stageRect.left=11,right=757`；`storyRect.left=23,right=745` → 左右 gap 均 12px，与 CSS `.story{left:12px;right:12px}` 精确吻合） | 宽 621px（视口 667，近满宽），同样左右各 12px | ✓ CSS 数值与实测像素完全对应，非嘴上说改 |
| 弹窗是否被 `.stage{overflow:hidden}` 裁切 | — | `stageRect{top:240.75,bottom:580.75}` 完整包住 `storyRect{top:252.75,bottom:568.75}`（12px 边距），**未裁切** | `stageRect{top:142.75,bottom:482.75}` 完整包住 `storyRect{top:154.75,bottom:470.75}`，**未裁切** | ✓ 曾怀疑 375×375 短视口下弹窗会被裁掉（因 `.story` 是 `.stage` 的 DOM 子节点、`.stage` 有 `overflow:hidden`），实测 316px 弹窗高度 + 12+12 边距 = 340px 恰好等于 `.stage` 的 `min-height:340px`，完全包在盒内，只是需要页面纵向滚动才能看见底部——纵向滚动不违反任何硬指标（硬指标只禁横向溢出）|
| 手柄命中区放大到 `--handle-hit` | `getComputedStyle(handle-scale).width = 22px` | `= 24px`（`--handle-hit` token 值） | `= 24px` | ✓ 直读 computed style，非读 CSS 源码推测；且 22px/24px 精确对应 `.stage__handle` 基础规则 vs 窄屏媒体查询覆写 |
| 无横向溢出 | `scrollWidth(1280)==clientWidth(1280)` | `scrollWidth(768)==clientWidth(768)` | `scrollWidth(667)==clientWidth(667)` | ✓ 三档实测零溢出（选中态、弹窗展开态下测的，非仅空态） |

**结论**：达标。5 项响应式修复逐一用独立探针实测像素/计算样式坐实，非文档描述；且全部改动集中在
`src/App.css` 的 `@media (max-width: 880px)` 块内，未在别处散落新样式；`--handle-hit`/`--handle-bg`/
`--handle-border-w`/`--color-*`/`--shadow-*` 等均引用 `src/styles/tokens.css` 已有 token，未新造视觉语言。

---

## 4. 整体视觉是否还原「旧信」DNA（走 tokens.css，非自造样式值）

**试图证伪时做了什么**：三视口截图肉眼核对（暖奶油底/陶土红强调/衬线品牌与故事标题/半透明弹窗）；
另对 `src/App.css`、`src/index.css`（本 sprint 唯二可能改动视觉的文件）做 `grep -nE "#[0-9a-fA-F]{3,6}"`
逐一排查硬编码色值，核实是否有「自造样式值」未走 tokens.css。

**关键观察**：
- 截图确认：三视口均为暖奶油纸底 + 陶土红选中框/手柄/删除✕/kicker + 衬线品牌「念念·陈列室」与
  故事标题 + 半透明奶油故事弹窗（`--color-popup` + `backdrop-filter`），与 `design.md`/`A-旧信.html`
  DNA 一致；PC 视口 `.app` 实测 `getBoundingClientRect().width = 1180px`，精确撑满 `max-width:1180px`
  （`src/index.css` 的 `#root{width:100%}` 修复生效，未撑满的既有缺陷已解决）。
- `grep` 发现 4 处硬编码十六进制色值：`src/App.css:122 #b9ad97`（禁用态「+新场景」文字色）、
  `:230 #b0a487`（抽屉 hint 弱化文字色）、`:283 #000`（画布黑底兜底）、`:578 #463d32`（故事正文色）。
  **这 4 处均落在本 sprint 未改动的既有代码段**（M4-S2 实际改动只有 `src/index.css` 的
  `#root{width:100%}` 一行，与 `src/App.css` 第 754~889 行 `@media(max-width:880px)` 块，`grep` 命中
  行号均不在此范围内），系 M1 起就存在、且已随 M1「外壳视觉还原旧信 DNA」manual 项验收通过在案
  （`.opc/phase1/milestones.json` M1 `verdicts: pass:true`）。核心规则「唯一强调色=陶土红
  `--color-accent`」未被违反（这 4 处均为中性灰/黑的次要/禁用态点缀，未新增强调色）。

**结论**：达标，附一条非阻断观察——4 处历史遗留硬编码色值不在本 sprint 改动范围内、且不违反
「唯一强调色」核心规则，不构成本次打回理由；如需彻底 token 化建议另开 sprint 专项处理，非
M4-S2 契约要求范围。

---

## 5. 全套件回归有没有破坏

**试图证伪时做了什么**：亲自跑 `npx playwright test --reporter=line`（不带文件名，跑全部 e2e spec）
一次；另跑 `npm run build` 核实生产构建无类型错误、无回归。

**关键观察**：
```
$ npx playwright test --reporter=line
Running 11 tests using 1 worker
[1/11] m1-shell.spec.ts:34  建场景→切场景→刷新后场景与布局状态完整还原
[2/11] m1-shell.spec.ts:82  物件抽屉列出全部 14 件物件
[3/11] m1-shell.spec.ts:87  场景背景不可重复且最多 3 个
[4/11] m2-transform.spec.ts:84  全链路变换：拖入→拖动→缩放→旋转→移除→刷新完整还原
[5/11] m2-transform.spec.ts:198 抽屉拖入落到画布外→不建 placement
[6/11] m3-story.spec.ts:110  选中物件写故事→刷新后故事完整还原
[7/11] m3-story.spec.ts:135  同一物件摆入两个场景→跨场景同步
[8/11] m3-story.spec.ts:171  切游客模式→只弹故事+原图、不可编辑
[9/11]  ~ [11/11] m4-full.spec.ts × 3（PC/768px/375px）
  11 passed (13.1s)
EXIT=0

$ npm run build
> tsc -b && vite build
✓ 56 modules transformed.
✓ built in 320ms
BUILD_EXIT=0
```

**结论**：达标。M1/M2/M3 既有 8 个 test 全绿、无一回归；生产构建 0 类型错误。

---

## 综合判定

5 条硬指标逐一亲手核实（非采信建造回执自报数字），全部达标：
1. 命令 exit 0，真三视口 ✓
2. 三视口逐一断言溢出/console错误/未处理拒绝 ✓
3. 响应式修复真实生效（像素级实测，含对「弹窗被裁切」的对抗性证伪未坐实）✓
4. DNA 还原、tokens.css 合规（历史遗留 4 处硬编码色值不在本 sprint 范围、不违反核心规则）✓
5. 全套件回归零破坏、生产构建通过 ✓

**verdict：pass**

（提醒：本评审为团队内自检，不等同底座验收；上述历史遗留硬编码色值观察供后续 sprint 参考，
非本次打回理由。）
