# U4-S2 评审证据（reviewer）

## 判定：PASS

对照 sprint U4-S2 契约（`.opc/sprints/U4-S2.json` goal）与 `milestones.json` U4.criteria 全 3 条
（全流程双端 e2e command / 全量回归 command / 整体 DNA manual），逐条亲手核查如下，均有证据，未发现
需要打回的问题。

---

## 1. 亲手连跑两条验收命令（各 2 次，非采信建造员自报）

```
$ npx playwright test e2e/u4-full.spec.ts --reporter=line   # Run A
Running 2 tests using 1 worker
  U4 全流程主链路 @PC1920：… passed
  U4 全流程主链路 @横屏手机844×390：… passed
2 passed (5.3s)
EXIT_CODE=0

$ npx playwright test e2e/u4-full.spec.ts --reporter=line   # Run B
2 passed (5.3s)
EXIT_CODE=0

$ npx playwright test --reporter=line                        # Run A
Running 57 tests using 1 worker
… (m1~m4 / n1~n4 / u1~u4 全部列出)
57 passed (52.4s)
EXIT_CODE=0

$ npx playwright test --reporter=line                        # Run B
57 passed (52.3s)
EXIT_CODE=0
```

结论：两条命令各跑 2 次均 exit 0；u4-full 稳定 2 passed（PC1920 + 横屏手机844×390 各一条独立 test）、
全量稳定 57 passed，两次数字与用例顺序一致、无 flaky（workers=1、retries=0，`playwright.config.ts` 确认）。
与建造员自报数字（2 passed / 57 passed）一致，本人独立执行确认，非照抄。

附加 sanity：`npm run build` → exit 0，`✓ built`（CSS 改动不破生产构建）。

---

## 2. 逐行通读 `e2e/u4-full.spec.ts`（全 508 行）

**双视口结构核实**（对照 goal「PC 与横屏手机双视口均验证」）：
- L43-46：`VIEWPORTS = [{1920×1080,'PC1920'}, {844×390,'横屏手机844×390'}]`。
- L283-497：`runFullChain(page, vp)` 是唯一的全链路实现，内部 `page.setViewportSize({width:vp.width,
  height:vp.height})`（L285）按参数切视口，无视口专属分支绕过任何断言。
- L500-507：`for (const vp of VIEWPORTS) test(...)` 生成两条独立 test，逐一调用同一个 `runFullChain`——
  确认是**同一条**链路在两个视口上各自完整跑一遍，不是两套不同强度的测试。

**全链路覆盖核实**（对照 U4 goal 六段：传照片→建场景→摆物件→写故事→切游客看故事）：
- ①传照片（L292-337）：`upload-add` 真实 click → `injectFile` 在隐藏 `upload-input` 上灌合成 JPEG
  触发真实 `change` 事件（L127-146）→ 断言 `upload-preview`/`upload-preview-img` 可见 → `upload-preview-name`
  真实 `.fill()` 改名 → `upload-confirm` 真实 click → 断言 dock 14→15、`upload-quota` 文本 "已传 0/50"→
  "已传 1/50" → `expect.poll` 轮询 LocalStorage 确有 `source:'user'`、`schemaVersion:4` 一件。
- ②建场景（L342）：`createScene` 走 `add-scene`→`bg-picker`→点 chip，真实 UI。
- ③摆物件（L347-393）：`dragFromTo`（真实 `page.mouse.down/move/up`）从 dock 拖入画布 → 断言 placement
  落成、`style` 含 `translate(` 不含 `left/top`（纯 transform）、canvas 节点 `naturalWidth>0`（渲出真图）→
  `dragCenterTo` 挪位（断言 x/y 变、w/rotation 不变）→ `dragBy` 拖右下角手柄缩放（断言 w 变大、
  x/y/rotation 不变）。
- ④写故事（L399-420）：`writeStory` 走 `story-input.fill`+`story-save.click`，`expect.poll` 轮询
  LocalStorage 确认 story/imageRef/plCount/schemaVersion 全部落盘。
- ⑤刷新还原（L425-456）：`page.reload()` 后核对 dock 计数、配额文本、物件名字、缩略图 hydrate 成
  `blob:`、placement 逐字段 `toEqual` 基线、canvas 图片 hydrate、故事文本经编辑器读回一致。
- ⑥切游客（L461-493）：点 `mode-guest` → dock 整体消失（无任何上传/删除/重命名入口）→ 点物件 → 断言
  `data-mode="guest"` 弹窗、故事正文=STORY、`story-photo` 为 hydrate 后的 `blob:` 图、且无
  `story-input`/`story-save`/`story-cancel`/`handle-scale`/`handle-rotate`/`.stage__frame`（真只读）。

结论：完整走「dock选图→预览→改名→确认入库→dock计数更新→拖入场景→挪位→缩放→写故事→刷新还原→
切游客模式只读看故事+原图」全链路，全程真实 UI 交互（click/fill/mouse 拖拽），且**两个视口各自完整跑
一遍这条完整链路**，不是只在 PC 跑全链路、手机跑阉割版。

**错误收集机制真实性核查**（L48-86）：
- `pageerror` 走 `page.on('pageerror', ...)` 真实监听（L68）。
- 未处理 Promise 拒绝走 `page.addInitScript` 在页面上下文注册 `window.addEventListener('unhandledrejection', ...)`
  收集进 `window.__rejections`（L60-67），`assertNoRuntimeErrors` 末尾 `page.evaluate` 读回——真实收集
  机制，非空断言；`addInitScript` 会在每次导航（含 reload）后重跑，覆盖刷新场景。
- console error 走 `page.on('console', ...)` 过滤 `type()==='error'`，仅排除 "Failed to load resource"
  （符合验收原文口径），其余全部计入（L69-75）。
- `assertNoRuntimeErrors`（L79-86）对三个数组分别 `toEqual([])`，非空转判定，双视口各自独立收集
  （每次 `runFullChain` 调用都重新 `attachErrorGuards`）。

**无横向溢出真实断言核查**（L88-95，对应 milestones.json U4.criteria 点名项）：
`assertNoHorizontalOverflow` 用 `document.documentElement.scrollWidth` vs `clientWidth`（真实 DOM
测量，容 1px 亚像素误差），在 L309/337/343/393/456/493 共 6 处关键节点（预览出现后/上传落盘后/建场景后/
缩放后/刷新后/关弹窗后）逐一调用，双视口各自独立执行，非摆设。

**窄矮视口专属 helper 核实**（非造假绕过）：
- `boxOf`（L161-166）先 `scrollIntoViewIfNeeded` 再取 `boundingBox`——横屏手机 dock 列表纵向滚动、故事
  弹窗贴底，`page.mouse.*` 按视口坐标派发原始事件，若不先滚入视口点不到东西；这与真实触屏用户会先滚动
  找到目标的操作一致，不构成放宽断言。
- `withUiHidden`（L232-241）用应用自带「隐藏界面」眼睛钮（`toggle-ui`，N2 里程碑验收过的正式生产功能，
  非测试后门）收起浮层以点到画布内的故事工具条——核实 `src/components/*` 中 `toggle-ui`/`.eye-keeper`
  为真实渲染的生产控件（沿用 U4-S1、M4-S2 已验证写法），不改变被测断言逻辑。

**PASS：milestones.json U4.criteria 第 1 条（全流程双端 e2e command）—— 已用真实运行 + 逐行代码核查双重验证。**

---

## 3. 核查改动范围（mtime 交叉核验）

```
$ find src e2e -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) -exec stat -f "%m %Sm %N" {} \; | sort -n
（尾部）
...
1784322476 Jul 18 05:07:56 2026 e2e/m3-story.spec.ts        ← U4-S1 校准，早于本 sprint
1784322593 Jul 18 05:09:53 2026 e2e/n1-foundation.spec.ts   ← U4-S1 校准，早于本 sprint
1784322738 Jul 18 05:12:18 2026 e2e/m2-transform.spec.ts    ← U4-S1 校准，早于本 sprint
1784323936 Jul 18 05:32:16 2026 e2e/m4-full.spec.ts         ← U4-S1 校准，早于本 sprint
1784327207 Jul 18 06:26:47 2026 e2e/u4-full.spec.ts         ← 本 sprint
1784327522 Jul 18 06:32:02 2026 src/App.css                 ← 本 sprint
```

其余全部 src/ 文件（App.tsx、Workbench.tsx、Canvas.tsx、UploadEntry.tsx、StoryModal.tsx、
persistence.ts、tokens.css 等 20 个文件）mtime 全部 ≤ 2026-07-18 01:44:48，早于本 sprint 改动窗口
（06:26-06:32）近 5 小时，无一文件落在改动窗口内或之后。**确认建造员「其余 src/ 组件与 tokens.css 未动」
的说法属实**——本轮响应式修复确实只落在 `src/App.css` 一个文件的样式层。

---

## 4. 核查 `src/App.css` 改动内容（是否只命中矮视口分支、是否守住 DNA token）

**改动位置**：在既有 `@media (max-height: 560px)` 块（L1634-1693）内新增 L1661-1693 的
「上传预览弹窗·矮视口收紧」子块。核实该 media query 只在**视口高度 ≤560px** 时生效——PC（1080 高）与
竖屏手机（通常 >560 高）均不落入此分支，只有横屏手机（390 高）命中，**范围与 goal「只命中矮视口分支
（不影响 PC 与竖屏）」的声称一致**。

**逐条数值核对**（对照 `.upload-preview*` 基础规则 L1031-1147 与矮视口覆盖 L1666-1692）：

| 属性 | 基础值 | 矮视口覆盖值 | 建造员描述 |
|---|---|---|---|
| `.upload-preview` padding | `22px 20px 20px` | `16px 18px 16px` | 22/20→16/16（描述稍简化，横向实际 18 非 16，方向正确、数值小误差，不影响判定） |
| `.upload-preview__kicker` margin-bottom | `12px` | `8px` | 12→8 ✓ |
| `.upload-preview__frame` padding | `10px` | `8px` | 10→8 ✓ |
| `.upload-preview__img` max-height | `46vh` | `30vh` | 46vh→30vh ✓ |
| `.upload-preview__namewrap` margin-top | `14px` | `10px` | 14→10 ✓ |
| `.upload-preview__meta` margin-top | `8px`（margin 简写 `8px 0 0`） | `6px` | 8→6 ✓ |
| `.upload-preview__actions` margin-top | `var(--space-md)`=16px | `12px` | 16→12 ✓ |

**只改尺度，未碰颜色/字号/token**：通读 L1666-1693 全 8 条覆盖规则，逐条只涉及 `padding`/`margin-*`/
`max-height` 数值，**没有一条**触及 `color`/`background`/`font-size`/`border` 属性；基础规则里的
`--color-popup`、`--color-popup-line`、`--text-label-min`、`var(--rule)`、`var(--radius-md)`、
`var(--shadow-float)` 等 token 引用在矮视口覆盖前后均未被替换成裸值——**DNA 未破**。

**classname 与 testid 均非虚构**：核对 `src/upload/UploadEntry.tsx`，CSS 里用到的
`.upload-preview`/`__kicker`/`__frame`/`__img`/`__namewrap`/`__meta`/`__actions` 与 spec 里用到的
`upload-add`/`upload-quota`/`upload-preview`/`upload-preview-img`/`upload-preview-name`/`upload-confirm`
均对应该组件里真实渲染的 class 与 `data-testid`（L82-232），非凭空捏造的选择器。

**缺陷真实性的算术交叉验证**（因无截图能力，用源码尺寸推算复核该缺陷是否真实存在、修复是否真的解决）：
`.upload-preview` 的 `max-height: calc(100vh - 2*var(--space-md))`，390 视口下 = 390-32 = **358px**。

- 修复前累计高度估算：padding(42) + kicker行+margin(25) + frame(20)+img(46vh≈179) + namewrap区块(65)
  + meta区块(22) + actions区块(46) ≈ **399px** > 358px 上限 → 确实会触发 `overflow-y:auto` 滚动，
  操作区落在首屏可视范围之外，与建造员描述的缺陷现象吻合。
- 修复后累计高度估算：padding(32) + kicker行+margin(21) + frame(16)+img(30vh≈117)=133 + namewrap区块(61)
  + meta区块(20) + actions区块(30) ≈ **297px** < 358px 上限 → 一屏内完整落位、无需滚动即可见操作区。

两次估算差值方向与幅度均支持「缺陷真实存在、修复确实解决」的结论，非凭空声称。

**PASS：milestones.json U4.criteria 第 3 条（manual DNA）—— 用 tokens.css 对照 + 源码级交叉验证代替
截图核验，未发现 DNA 被破坏或新增裸值。**

---

## 5. 已知局限（记录存档，不构成打回理由）

`assertNoHorizontalOverflow` 只测量**横向** `scrollWidth` vs `clientWidth`；e2e 里对 `upload-confirm`
等按钮使用 Playwright `locator.click()`（自带 actionability 自动滚动），因此即便矮视口 CSS 修复被撤销、
预览弹窗操作区仍需纵向滚动才可见，`e2e/u4-full.spec.ts` 本身也不会因此失败——**该 CSS 修复目前没有专属
的自动化回归断言钉住**，全靠人工 DNA 复核与本证据文件的源码级交叉验证。这不违反 U4.criteria 字面要求
（criteria 只要求横向溢出断言 + manual DNA 核验，未要求逐个响应式修复都有专属断言），故不作为打回理由，
仅记录为后续可加固点。

---

## 6. 造假/放水排查

- `grep -rn "\.skip(\|\.fixme(\|test\.only(\|describe\.only(" e2e/` → 无命中，57 条用例真实全部执行，
  非靠 skip/only 隐藏失败或凑数。
- `playwright.config.ts` 确认 `retries:0`、`workers:1`、`forbidOnly` 仅在 CI 生效——本地跑不会因
  `.only` 静默通过。
- 未发现测试断言被弱化、条件被摘除、或用假数据直接摆状态绕过真实交互的迹象（全程真实 click/fill/mouse
  拖拽，唯一的"注入"点是文件选择 input 的 change 事件，与已验收的 U2/U3 官方 spec 同款手法）。

---

## 结论

milestones.json U4.criteria 全 3 条（全流程双端 e2e command / 全量回归 command / 整体 DNA manual）均
亲手复核通过：
1. 两条验收命令各连跑 2 次均 exit 0（u4-full 2 passed、全量 57 passed），非采信自报。
2. `e2e/u4-full.spec.ts` 全 508 行逐行通读确认真实双视口、真实 UI 交互、真实错误/溢出断言机制，非摆设。
3. `src/App.css` 改动经 mtime 核实范围精准（只本 sprint 改这两个文件）、经 tokens.css 交叉核实未破
   DNA、经算术复核证实缺陷与修复均真实存在，非凭空声称。

判定 **PASS**，予以放行定稿。
