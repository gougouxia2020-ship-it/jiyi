# U4-S1 评审证据（reviewer）

## 判定：PASS

对照 sprint U4-S1 契约（.opc/sprints/U4-S1.json goal）与 milestones.json U4.criteria 的可自动核验子集
（第一条 e2e 硬指标的 PC 视口部分 + 第二条全量回归；横屏手机与视觉 DNA manual 项按 goal 原文明确
"留给 U4-S2"，本轮不判）。逐条亲手核查如下，均有证据，未发现需要打回的问题。

---

## 1. 亲手连跑两条验收命令（各 2 次）

```
$ npx playwright test e2e/u4-full.spec.ts --reporter=line   # Run A
Running 1 test using 1 worker
1 passed (3.1s)
EXIT_CODE=0

$ npx playwright test e2e/u4-full.spec.ts --reporter=line   # Run B
Running 1 test using 1 worker
1 passed (3.1s)
EXIT_CODE=0

$ npx playwright test --reporter=line                        # Run A
Running 56 tests using 1 worker
...
56 passed (50.0s)
EXIT_CODE=0

$ npx playwright test --reporter=line                        # Run B
Running 56 tests using 1 worker
...
56 passed (50.3s)
EXIT_CODE=0
```

结论：两条命令各跑 2 次，均 exit 0；u4-full 稳定 1 passed，全量稳定 56 passed，两次数字与用例顺序一致，
无 flaky。与建造员自报数字（56 passed）一致，非照抄——本人独立执行确认。

---

## 2. 逐段通读 e2e/u4-full.spec.ts（全 451 行）

链路核对（对照 U4-S1 goal 的上传/摆放/故事/游客四段硬指标）：
- ①传照片（L248-291）：点 `upload-add` → `injectFile` 触发真实 `upload-input` onChange → 断言
  `upload-preview`/`upload-preview-img` 可见 → 改名 `upload-preview-name` → 点 `upload-confirm` →
  预览关闭、dock 14→15 → `upload-quota` 文本 "已传 0/50"→"已传 1/50" → `expect.poll` 轮询 LocalStorage
  确有一件 `source:'user'`、`schemaVersion:4`。全走真实 UI 事件（click/fill），非直接摆数据。
- ②建场景（L296）：`createScene` 走 `add-scene`→`bg-picker`→点 chip，真实 UI。
- ③摆物件（L302-349）：`dragFromTo`（真实 `page.mouse.down/move/up` 系列）把刚上传的物件从 dock
  拖入画布，断言 placement 落成、`style` 含 `translate(` 不含 `left/top`（纯 transform 落位）、canvas
  节点 `naturalWidth>0`（渲出真图非占位）；再 `dragCenterTo` 挪位（断言 x/y 变、w/rotation 不变）；
  再 `dragBy` 拖右下角手柄缩放（断言 w 变大、x/y/rotation 不变）。
- ④写故事（L354-373）：`writeStory` 走 `story-input.fill`+`story-save.click`（真实表单交互），
  `expect.poll` 轮询 LocalStorage 确认 story/imageRef/plCount/schemaVersion 全部落盘。
- ⑤刷新还原（L378-409）：`page.reload()` 后核对 dock 计数、配额文本、物件名字、缩略图 hydrate 成
  `blob:`、placement 逐字段 `toEqual` 基线、canvas 图片 hydrate、故事文本经编辑器读回一致。
- ⑥切游客（L414-446）：点 `mode-guest` → dock 整体消失（`tray` count=0，无任何上传/删除/重命名入口）→
  点物件 → 断言 `data-mode="guest"` 弹窗、故事正文=STORY、`story-photo` 为 hydrate 后的 `blob:` 图、
  且无 `story-input`/`story-save`/`story-cancel`/`handle-scale`/`handle-rotate`/`.stage__frame`
  （证明真只读、无编辑入口）。

结论：完整走「dock选图→预览→改名→确认入库→dock计数更新→拖入场景→挪位→缩放→写故事→刷新还原→
切游客模式只读看故事+原图」全链路，且全程真实 UI 交互。

**错误收集机制真实性核查**（L38-66）：
- `pageerror` 走 `page.on('pageerror', ...)` 真实监听。
- 未处理 Promise 拒绝走 `page.addInitScript` 在页面上下文注册 `window.addEventListener('unhandledrejection', ...)`
  收集进 `window.__rejections`，测试末尾 `page.evaluate` 读回——真实收集机制，不是空断言；`addInitScript`
  会在每次导航（含 reload）后重跑，覆盖刷新场景。
- console error 走 `page.on('console', ...)` 过滤 `type()==='error'`，仅排除 "Failed to load resource"
  （资源 404，符合验收原文口径），其余全部计入。
- `assertNoRuntimeErrors`（L59-66）对三个数组分别 `toEqual([])`，非空转判定。

**无横向溢出真实断言核查**（L68-75, 对应 milestones.json U4.criteria 点名项）：
`assertNoHorizontalOverflow` 用 `document.documentElement.scrollWidth` vs `clientWidth`（真实 DOM
测量，容 1px 亚像素误差），在 L291/297/346/409/446 共 5 处关键节点（上传后/建场景后/缩放后/刷新后/
关弹窗后）逐一调用，非摆设。

---

## 3. 核查「无源码改动」（mtime 交叉核验，同建造员 receipt 手法）

```
$ find src -type f -exec stat -f "%m %Sm %N" ...
最新：1784310306  2026-07-18 01:45:06  src/App.css

$ find e2e -type f -exec stat -f "%m %Sm %N" ...
本 sprint 改动窗口：2026-07-18 05:07:23 ~ 05:32:16
（u4-full.spec.ts 05:07:23、m3-story 05:07:56、n1-foundation 05:09:53、
  m2-transform 05:12:18、m4-full 05:32:16）
```

src/ 目录全部 21 个文件 mtime 均 ≤ 2026-07-18 01:45:06，落在本 sprint e2e 改动窗口（05:07-05:32）之前
超过 3 小时，无一文件落在改动窗口内或之后。src/ 最后一次改动时间点与 U3 代际收尾时间吻合（U3-S3 相关
文件如 gallery.ts/Header.tsx/UploadEntry.tsx/ItemTray.tsx/App.css 均在 01:43-01:45 区间，即 U3-S3
receipt 记录的改动清单）。结论：「无源码改动」说法属实。

---

## 4. 核实「铁证」——m4-full 断言 schemaVersion===2 / n4-full 断言 schemaVersion===4 不可调和

**当前源码事实**：`src/storage/persistence.ts:31` `export const SCHEMA_VERSION = 4;`

**当前 n4-full.spec.ts（本 sprint未改动此文件）事实**：
`e2e/n4-full.spec.ts:373` `expect(persisted?.schemaVersion).toBe(4);`——与当前 SCHEMA_VERSION 一致。

**m4-full.spec.ts 在本 sprint 编辑前的历史事实**（不是采信建造员自述，是独立从 10+ 轮此前 sprint 的
review-evidence.md / receipt-builder.md 交叉核实到的同一事实，时间跨度从 N1-S2 直到 U3-S2，逐轮都有
独立评审员亲自复核过）：
- `receipts/N1-S2/review-evidence.md:90`：「`e2e/m3-story.spec.ts:126`、`e2e/m4-full.spec.ts:286`：仅把
  `schemaVersion).toBe(1)` 改为 `.toBe(2)`」——m4-full 在 N1 时被同步到 v2，此后再未被碰过。
- `receipts/N2-S1/receipt-builder.md:52`、`receipts/N2-S2/review-evidence.md:56`：N2 阶段独立确认
  n1-foundation/m2-transform/m3-story/m4-full 共 9 条红均为 `schemaVersion===2` vs 实际 3，判定「既有
  基线红、非本轮引入」。
- `receipts/N4-S1/review-evidence.md:116`、`receipts/N4-S2/review-evidence.md:55`：N4 阶段独立确认同一
  批文件仍断言 `schemaVersion===2`，实际已到 3。
- `receipts/U1-S1/review-evidence.md:135`、`receipts/U1-S2/receipt-builder.md:29`：U1 阶段独立确认。
  关键交叉点——U1-S2 receipt 明确记录「同步把两处会被 v4 打破的**绿测**夹具升 v4：`u1-s1-dualsource`
  （seed v3→v4、断言 3→4）、`n4-full`（断言 3→4），使其继续测本职」，**同时**在同一句括注里写明
  「`n1-foundation ②` 的v1作废重置逻辑不崩，其陈旧 `===2` 断言属既有基线红」——即 U1-S2 builder 主动把
  n4-full 同步到当时的新 SCHEMA_VERSION（保持它是"绿测"），但**刻意不碰** m4-full/m3-story/n1-foundation
  （留作既有基线红，不在该 sprint 范围）。
- `receipts/U2-S1/review-evidence.md:87-89`、`receipts/U3-S1/review-evidence.md:135`、
  `receipts/U3-S2/review-evidence.md:131`：U2、U3 阶段各自独立复核，均确认这批文件截至各自 sprint 时点
  仍硬编码 `schemaVersion===2`，且均判定「非本轮改动引入、不在本轮范围」而未修。

交叉验证结论：「m4-full 断言 schemaVersion===2」与「n4-full 断言 schemaVersion===4」在 U4-S1 开工前
确实同时成立（前者是至少 10 轮里程碑跨度、每轮都被独立评审员复核过的历史欠账；后者是 U1-S2 主动维护
保持的绿测），且两者的字面版本号互斥，任何单一 `SCHEMA_VERSION` 常量都不可能让二者同时通过——这不是
建造员编造的论证，是可从仓库既有证据链独立复现的事实。校准遗留 spec（而非改源码）是本轮唯一正解，
判定成立。

---

## 5. 核查校准改动有无偷懒放水（弱化断言掩盖真实 bug）

逐处核查改动，均为对已演进 schema/坐标模型的如实追随，未发现弱化实质验证力度的改动：

- **n1-foundation.spec.ts ③ Item 结构断言**：由精确 4 字段 `sort()` 全等改为 `arrayContaining`。
  独立核实 `src/model/types.ts:29-49`：`Item` 现有 `id/name/source/aspectRatio/originalImageSrc/
  displayImageSrc/imageSrc/...` 等至少 7+ 字段（U1 引入），旧的"恰好 4 字段"精确相等在源码正确的前提下
  已不可能成立。`arrayContaining` 仍要求 4 个核心字段全部存在（未变成空断言），且后续仍对 `it0.story`
  做精确 `toBe(STORY)` 相等——语义保留、验证力度未降。判定：如实适配，非放水。

- **m2-transform.spec.ts scale→w 改造**：独立核实 `src/model/types.ts:69-83`：`Placement` interface
  当前字段为 `id/sceneId/itemId/x/y/w/rotation/z`，**确无 scale 字段**。旧断言基于已不存在的字段，
  改为读 `w` 是必要修正而非放水；且所有"只改一个字段、其余字段不变"的交叉断言（拖动只改x/y、缩放只改w、
  旋转只改rotation）逐一保留，验证力度不降。

- **m2-transform.spec.ts 第②测试「拖到画布之外」判定点迁移**：由「拖到报头区域」改为「拖到视口上缘之上
  (clientY<0)」。独立核实 `src/components/Workbench.tsx:32-45` `handleDropItemAt`：边界判定为
  `clientX<rect.left || clientX>rect.right || clientY<rect.top || clientY>rect.bottom` 才拒收——
  N2 满屏后 canvas/stage 铺满整个视口，"报头区域"已不再是画布之外的独立区域（报头是浮层，落在其上仍
  落在画布内并被浮层transparent-through）。改为 clientY<rect.top 精确命中源码的真实拒收条件，验证的
  仍是同一段边界判定逻辑，非空转必过的断言。

- **m4-full.spec.ts withUiHidden 包裹故事操作**：核实这是应用自带的生产功能（`toggle-ui`/`.eye-keeper`
  眼睛钮，N2 里程碑验收过的正式功能，非测试专用后门），用来避开窄屏下浮层遮挡故事工具条的按钮命中问题，
  不影响被测行为本身（选中/开弹窗/读写故事/关弹窗的断言逻辑一字未减）。

- **m4-full.spec.ts ensureDockOpen**：窄屏 dock 默认收合是 N2 里程碑验收过的既有产品行为，测试里显式展开
  dock 才能点到缩略卡，不构成对被测断言的弱化。

结论：4 个校准文件的改动均可对照当前源码逐一证实是必要的、如实的适配，未发现为了让测试通过而放宽本该
验证的行为、掩盖真实 bug 的情况。

---

## 6. 上传管线注入手法合规性核查（附带，佐证第 2 点"真实 UI 交互"）

`u4-full.spec.ts` 的 `injectFile`（L107-126）在隐藏 `[data-testid="upload-input"]` 上灌合成 JPEG、
触发真实 `change` 事件。核实：
- `src/upload/UploadEntry.tsx:129-130`：`data-testid="upload-input"` 是生产代码里真实渲染的隐藏
  `<input type=file>`，非测试专用埋点。
- `e2e/u2-upload.spec.ts:48-68`、`e2e/u3-quota.spec.ts:88-105`：两份此前已验收通过（U2/U3 milestone
  verdicts pass:true）的官方 spec 使用逐字节相同的注入手法（同样的 canvas 合成 → toBlob → File →
  DataTransfer → 触发 change）。

结论：u4-full 的文件注入手法与已验收通过的 U2/U3 官方 spec 一致，不是本轮新发明的走后门手法，未绕过
真实 UI 交互路径。

---

## 7. success.json 相关条目覆盖核对（仅本 sprint 点名的上传/摆放/写故事/游客只读子集）

| # | success.json 条目 | 覆盖情况 |
|---|---|---|
| 1 | 上传闭环跑通 | u4-full① 全覆盖（选图→预览→入库→dock→拖入摆放→写故事→刷新还原），已跑绿 |
| 6 | 上传配额 50/N 与到顶提前告知 | dock 计数「已传 N/50」实时更新已覆盖（u4-full①）；50 件到顶边界属 U3 既有职责，u3-quota.spec.ts 本轮回归仍绿 |
| 8 | 游客模式无上传入口，只读弹故事+原图 | u4-full⑥ 全覆盖：dock 整体消失、无编辑入口、只读弹窗验证完整 |
| 15 | 持久化+故事同步（摆放/故事刷新还原） | u4-full⑤ 全覆盖：placement 逐字段 toEqual、故事文本、图片 hydrate |
| 17 | 场景约束+双端可用 | 场景约束（≤3、背景不重复）由既有 m1/m4/n2 套件本轮回归仍绿覆盖；双端里的横屏手机按 sprint goal 原文明确留给 U4-S2，本轮不判 |

其余 12 条 success 条目（删除干净不留尸、存储失败告知、大图EXIF、处理接口插入点、内置素材裁边、满屏
自适应、场景不截断、手柄顺滑、浮层让路、管理与命名、内置物件主流程闭环）不在本 sprint goal 点名范围
（分属 N1/N2/N3/U1/U2/U3 既有职责），本轮只需其既有 e2e 不回归——已由全量套件 56 passed 覆盖确认。

---

## 结论

U4-S1 goal 点名的【验收硬指标】（u4-full.spec.ts PC 视口全链路 + 全量套件不回归）均亲手复核通过，证据
链完整、无造假迹象；「无源码改动」「铁证」两项重点核实说法均属实；4 个校准文件改动逐一核对源码，未发现
偷懒放水弱化断言的情况。判定 PASS，予以放行定稿。
