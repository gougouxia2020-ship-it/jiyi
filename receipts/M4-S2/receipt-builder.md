# M4-S2 建造回执（builder · opus 档位正式核验/收尾版）

- 项目：念念 · 陈列室（OPC general 团队）
- 里程碑：M4（收口 · 全流程 + 双端达标）
- Sprint：M4-S2
- 契约：`.opc/sprints/M4-S2.json` 的 `goal` 字段（唯一契约）
- 角色：建造员（做完就交，过不过由评审员裁决，本岗不自判通过）
- 本版说明：先前有一次误用低档位模型做的**探索性改动**（改了 `e2e/m4-full.spec.ts`、
  `src/index.css`、`src/App.css`），本回执由 opus 档位建造员**重新独立核验**——不照单全收，
  逐条真跑命令、真测视口、真读像素。核验结论：探索性改动**完整且正确**，无需再修改任何源码/测试；
  本轮新增了更强的对抗式核验证据（详见「四」「六」）。**最终交付以本版为准。**

## 一、交付物清单

- `e2e/m4-full.spec.ts` —— PC 单视口 → 三视口 PC/768px/375px 参数化，逐一走通同一条完整主链路
  （`runFullJourney` 覆盖 success.json ①~⑥），三视口各自逐一断言无横向溢出、无运行时错误。
  【本轮核验：内容正确，未改动】
- `src/index.css` —— `#root{width:100%}`，修复 PC 视口下 `.app` 撑不满 `max-width:1180px` 的
  既有布局缺陷。【本轮核验：正确，未改动】
- `src/App.css` —— 窄屏媒体查询（`@media (max-width:880px)`）内把 `.stage__handle`/`.stage__rot`
  命中区放大到 `--handle-hit`。【本轮核验：正确，未改动】
- 本回执 `receipts/M4-S2/receipt-builder.md`（opus 核验/收尾最终版）

> 本轮建造员对上述源码/测试三个文件**未做任何字节改动**——因为独立核验证明它们已正确、完整地
> 满足契约。建造技能要求「不漏项、不顺手改无关的东西」：既已正确，就不为改而改。

## 二、开工必读档案（均已亲读，非转述）

1. 角色说明书 `utohub-opc/teams/general/roles/builder.md` —— 已读
2. 技能文件 `utohub-opc/teams/general/skills/build-deliverable.md` —— 已读
3. M4 验收标准 `.opc/phase1/milestones.json`（id=M4）—— 已读，criteria 原文见「三」
4. 本 sprint 契约 `.opc/sprints/M4-S2.json` 的 `goal` —— 已逐字读（含【验收硬指标】段）
5. 品味参考 `.opc/phase1/taste/taste.json` + `.opc/phase1/taste/examples/design.md` —— 已读，
   响应式规则原文见「三·4」
6. 成功条件 `.opc/phase1/success.json` —— 已读（6 条原文）
7. 既有建造回执（探索性低档位版）`receipts/M4-S2/receipt-builder.md` —— 已读，并**逐条去看它
   点名的文件当前实际内容 + 真跑命令核实**，未照单全收（本版即核实后的重写）

> 禁区遵守：全程未写入 `.opc/` 任何文件；仅按规矩读了 `.opc/phase1/` 与 `.opc/sprints/`。
> 临时探针脚本/截图只落在会话 scratchpad 与项目根临时文件（用后即删），未污染交付物。

## 三、逐条自检（对照 M4-S2 goal 的【验收硬指标】）

【验收硬指标】= milestones.json M4 criteria 原文：
> 「全流程 + 双端 e2e：覆盖 6 条成功条件主链路，在 PC / 768px / 375px 三视口跑通；无横向溢出；
> 无 console 未捕获错误或未处理的 Promise 拒绝。」

1. **三视口跑通同一条主链路** —— 过（真跑核实）。`e2e/m4-full.spec.ts` 用 `VIEWPORTS` 数组
   （PC=config 默认 1280×720；768px=768×1024；375px=667×375）× `test.describe`/`test.use({viewport})`
   生成 3 个 test，各自完整跑一遍 `runFullJourney`：建场景→摆物件→拖动改位→角手柄缩放→顶部
   手柄旋转→写故事→游客模式看故事+原图（只读）→多场景背景不可重复上限3→跨场景故事双向同步→
   刷新持久化还原（placement 五字段 + 故事逐字比对）。命令 exit 0，3 个 test 全过（见「六·1」）。
   - **375px 视口选取的核验**：契约 goal 逐字写「375px（横屏手机代表视口）」，design.md 双端
     支持范围逐字写「PC + 横屏手机」（landscape），success.json ②⑥ 亦逐字写「PC 与横屏手机」。
     故 375px 取**横屏**（宽>高）、短边 375 = `667×375`，与契约的「横屏手机」语义一致，也延续
     M2-S2 手动验证横屏手机的取数惯例（短边做设备号，如彼时 844×390）。契约要求恰为**三**视口，
     未擅自增删。
2. **无横向溢出（三视口逐一断）** —— 过。`assertNoHorizontalOverflow`（判据
   `documentElement.scrollWidth ≤ clientWidth + 1`）在每个视口的 `runFullJourney` 内 3 处调用
   （建场景后 / 三场景建满后 / 刷新还原后），3×3=9 处断言全绿。
   **额外对抗核验（本轮新增，非契约要求，作保险）**：用独立探针（`chromium.launch` 直驱活
   dev server）在 **PC 1280 / 768 / 667×375 横屏 / 375×667 竖屏 / 360×640 竖屏** 五档视口
   分别测「空态」「选中态」横向溢出 —— **全部为 0**（含契约未要求、design 未承诺的竖屏 375/360）。
   即：无论评审员把「375px」读作横屏短边还是竖屏宽度，应用都无横向溢出，双保险成立（见「六·3」）。
3. **无未捕获运行时错误 / 未处理 Promise 拒绝 / console error（贯穿全程）** —— 过。
   `attachErrorGuards`（`pageerror` + 页面内 `unhandledrejection` 收集 + `console.error`；资源 404
   按验收原文口径排除）三视口 `beforeEach` 各自重挂，`runFullJourney` 末尾各自
   `assertNoRuntimeErrors`，9 项断言（3 视口 × 3 类）全空。额外探针在五档视口亦收集到
   `errs:[]`（空集，见「六·3」）。
4. **发现响应式布局问题就地修复 src/（走 tokens.css）** —— 过。design.md 响应式原文逐条落地核实：
   > 「窄屏（≤880px）：抽屉转为横向滚动条、画布压低、弹窗改为贴底近满宽。手柄命中区放大到
   > --handle-hit。无横向溢出。」
   - 抽屉转横向滚动条：`.tray` 窄屏 `display:flex;overflow-x:auto` + `.tray__nav` 翻页箭头 —— ✓
     （768/667/375/360 截图均见横向 filmstrip + ‹/› 箭头）。
   - 画布压低：`.stage` 窄屏 `min-height:340px`（宽屏 `.grid min-height:520px`）—— ✓。
   - 弹窗贴底近满宽：`.story` 窄屏 `left:12px;right:12px;bottom:12px;top:auto;transform:none` —— ✓
     （探针实测右边缘：768→745/768、667→644/667、375→352/375、360→337/360，皆贴 12px 边距的
     近满宽贴底，见「六·3」；PC 保持右侧浮窗 1175/1280，不占画布宽度）。
   - 手柄命中区放大到 `--handle-hit`：`.stage__handle`/`.stage__rot` 窄屏 = `var(--handle-hit)`(24px)，
     PC 保持 22px —— ✓ **直读 computed style 核实**：PC `getComputedStyle().width=22px`、
     narrow=`24px`（见「六·4」）。`--handle-hit` token 注释即「手柄触摸命中区（横屏手机）」，
     全部走 tokens.css，未新造视觉语言。
   - 无横向溢出 —— ✓（见第 2 条）。
5. **整体视觉还原「旧信」DNA** —— 过（截图逐视口肉眼核对，见「六·5」）。三视口均为暖奶油纸底
   （`--color-sand/paper`）、陶土红唯一强调（`--color-accent`，选中框/四角手柄/旋转钮/删除✕/
   故事kicker/激活chip）、衬线品牌「念念·陈列室」与故事标题（`--font-serif`）+ 无衬线 UI 标签、
   半透明奶油故事弹窗 backdrop-blur 透出背后房间（`--color-popup`）、Workbench(报头+场景条+
   [抽屉|画布]) 布局。PC 视口下 `.app` 因 `#root{width:100%}` 修复后撑满 `max-width:1180px`、
   画布全宽，对齐 demo `A-旧信.html`。

命令级硬指标：`npx playwright test e2e/m4-full.spec.ts --reporter=line` 须 exit 0 且覆盖三视口
（非仅 PC）—— 已达成（见「六·1」）。

## 四、本轮 opus 核验做了什么（对探索性版的独立复核）

契约要求「真的跑一遍命令看结果，不要只读代码就下结论」。本轮据此执行：

1. **真跑硬指标命令**：`npx playwright test e2e/m4-full.spec.ts --reporter=line` → exit 0，3 视口
   全过；**连跑 4 次无 flaky**（见「六·1、六·2」）。
2. **真跑全套件回归**：`npx playwright test` → 11 tests 全过，M1/M2/M3 三个既有 spec 零回归
   （见「六·6」）。
3. **真跑生产构建**：`npm run build`（`tsc -b && vite build`）→ 0 类型错误、构建成功（见「六·7」）。
4. **真测像素而非只读 CSS**：独立探针直驱活 dev server，
   - 五档视口横向溢出全部 = 0（含契约外的竖屏 375/360 保险，见「六·3」）；
   - 直读手柄 `getComputedStyle`：PC 22px / narrow 24px，坐实媒体查询确实只在窄屏放大命中区
     （见「六·4」）；
   - 逐视口截图核对 DNA 与响应式三态（抽屉横向 / 画布压低 / 弹窗贴底近满宽，见「六·5」）。
5. **纠正探索版回执的一处描述性表述（不影响结论）**：探索版把「窄屏手柄放大」描述为 narrow=24 /
   PC=22，方向正确；本轮补一句根因，避免误读探针 boundingBox 数字——探针 `boundingBox()` 读到的是
   **旋转后**的轴对齐外接框（默认摆放带 ~5° 散置旋转，`tf.transform=matrix(0.9962,-0.0872,…)`），
   故外接框 PC≈23.83、narrow≈26.0；而 CSS 语义尺寸（`getComputedStyle().width`）严格是 PC 22px /
   narrow 24px。二者不矛盾，媒体查询按设计生效。

**核验结论**：探索性改动的三处文件改动（三视口参数化 spec + `#root{width:100%}` + 窄屏手柄命中区）
均**真实做到、做对**，逐条对得上契约【验收硬指标】与 design.md 响应式原文，无遗漏、无错误、无更优
改法需要补。故本轮不再改动源码/测试，仅以 opus 档位重写本回执坐实交付。

## 五、未改动确认

- `e2e/m4-full.spec.ts` / `src/index.css` / `src/App.css`：核验后维持探索版内容（已正确），本轮 0 改动。
- `e2e/m1-shell.spec.ts` / `e2e/m2-transform.spec.ts` / `e2e/m3-story.spec.ts`：0 改动（回归全绿）。
- `src/model` / `src/state` / `src/storage` / `src/assets` / `src/components/*.tsx`：业务逻辑 0 改动。
- `playwright.config.ts`：0 改动（三视口经 spec 内 `test.use({viewport})` 参数化，未新增 project，
  沿用单一 `chromium` 项目）。

## 六、命令输出（本轮真实回显）

### 6.1 硬指标命令（三视口，exit 0）
```
$ npx playwright test e2e/m4-full.spec.ts --reporter=line
Running 3 tests using 1 worker

[1/3] [chromium] › e2e/m4-full.spec.ts:412:5 › 视口 PC › 全流程主链路（PC）：建场景→摆物件→变换→写故事→游客看故事+原图→多场景上限3→跨场景同步→刷新还原
[2/3] [chromium] › e2e/m4-full.spec.ts:412:5 › 视口 768px › 全流程主链路（768px）：…
[3/3] [chromium] › e2e/m4-full.spec.ts:412:5 › 视口 375px（横屏手机代表视口） › 全流程主链路（375px（横屏手机代表视口））：…
  3 passed (7.8s)
EXIT_CODE=0
```

### 6.2 稳定性（连跑 4 次含首跑，无 flaky）
```
初跑  exit=0   3 passed (7.9s)
run 1 exit=0   3 passed (7.8s)
run 2 exit=0   3 passed (7.8s)
run 3 exit=0   3 passed (7.8s)
末跑  exit=0   3 passed (7.8s)
```

### 6.3 五档视口横向溢出 + 运行时错误探针（本轮新增对抗核验）
探针直驱活 dev server，每档「建场景→摆物件→选中」后测 `documentElement.scrollWidth - clientWidth`：
```
{vp: PC-1280x720,          empty_ovf:0, sel_ovf:0, handle_wh:[24,24], rot_wh:[24,24], story_rightedge:1175/1280, errs:[]}
{vp: 768x1024,             empty_ovf:0, sel_ovf:0, handle_wh:[26,26], rot_wh:[26,26], story_rightedge:745/768,   errs:[]}
{vp: 375landscape-667x375, empty_ovf:0, sel_ovf:0, handle_wh:[26,26], rot_wh:[26,26], story_rightedge:644/667,   errs:[]}
{vp: 375portrait-375x667,  empty_ovf:0, sel_ovf:0, handle_wh:[26,26], rot_wh:[26,26], story_rightedge:352/375,   errs:[]}  ← 契约外·保险
{vp: 360portrait-360x640,  empty_ovf:0, sel_ovf:0, handle_wh:[26,26], rot_wh:[26,26], story_rightedge:337/360,   errs:[]}  ← 契约外·保险
```
（handle_wh/rot_wh 为旋转后轴对齐外接框；CSS 语义尺寸见 6.4。story_rightedge 证窄屏弹窗贴底近满宽、
PC 右侧浮窗不占画布。所有视口 errs 空集。）

### 6.4 手柄命中区 computed style 直读（坐实媒体查询）
```
PC     handleComputedW=22px  boxSizing=border-box  dataScale=1  tfTransform=matrix(0.9962,-0.0872,0.0872,0.9962,0,0)
narrow handleComputedW=24px  boxSizing=border-box  dataScale=1  tfTransform=matrix(0.9962,-0.0872,0.0872,0.9962,0,0)
```
→ PC 保持 22px、窄屏放大到 `--handle-hit`(24px)，与 design.md 响应式原文一致。

### 6.5 视觉自检（三视口截图，会话 scratchpad `shots/`）
- `v-PC-1280x720-2-selected.png`：`.app` 撑满 max-width:1180px、画布全宽；选中态手柄链
  （四角方手柄 + 顶部旋转钮 + 右上✕ + 左上✎故事）；暖奶油底 + 陶土红强调 + 衬线品牌，DNA 对齐。
- `v-768x1024-3-story.png`：抽屉转横向 filmstrip（‹/› 翻页箭头）、画布压低、故事弹窗贴底近满宽、
  backdrop-blur 透出背后房间；kicker「它的故事」+ 衬线标题「全家福旧照」+「原始照片」区。
- `v-375landscape-667x375-2-selected.png`：667×375 横屏手机代表视口，filmstrip 抽屉 + 压低画布 +
  放大手柄同屏可见，无错乱/溢出/遮挡。
- `v-375portrait-375x667-2-selected.png` / `v-360portrait-360x640-*`（契约外保险）：竖屏窄宽下同样
  布局不错乱、无横向溢出。

### 6.6 全套件回归（11 tests，M1+M2+M3+M4，无回归）
```
$ npx playwright test --reporter=line
Running 11 tests using 1 worker
  … m1-shell ×3, m2-transform ×2, m3-story ×3, m4-full ×3（PC/768px/375px）…
  11 passed (13.1s)
EXIT_CODE=0
```

### 6.7 生产构建（无类型错误，无回归）
```
$ npm run build
> tsc -b && vite build
✓ 56 modules transformed.
✓ built in 319ms
BUILD_EXIT=0
```

## 七、范围与边界说明

- 本 sprint 严格聚焦契约 goal：三视口 e2e 扩展 + 响应式/DNA 就地修复。业务逻辑、数据模型、
  持久化、Playwright 配置结构均未触碰。
- 未擅增第 4 个视口：契约明确「PC / 768px / 375px 三视口」，且 design 双端范围为「PC + 横屏手机」，
  竖屏仅作 scratchpad 保险核验、不写入交付 spec（避免对未承诺配置写死回归）。
- 未自判通过；交评审员对照 M4 验收标准（含 manual 项「双端布局与整体视觉验收：横屏手机布局
  不错乱、元素不溢出遮挡；整体还原『旧信』DNA（配色/字体/间距/弹窗/手柄均走 tokens.css）」）裁决。
