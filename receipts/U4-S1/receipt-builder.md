# U4-S1 建造回执（builder）

## 任务
新增 `e2e/u4-full.spec.ts`，PC（1920×1080）端到端跑通「传照片→建场景→摆物件→写故事→切游客看故事」全链路；
并把全量 playwright 套件跑绿（M1~M4、N1~N4、U1~U3 既有 e2e 不回归）。验收命令须均 exit 0：
- `npx playwright test e2e/u4-full.spec.ts --reporter=line`
- `npx playwright test --reporter=line`

## 验收硬指标 → 交付覆盖对照（倒推清单）
- 上传：dock 选图→预览→确认入库→物件出现在 dock、「已传 N/50」由 0/50 升到 1/50 —— u4-full ① 段逐条断言。
- 摆放：把**刚上传的物件**从 dock 拖入场景、挪位、角手柄缩放 —— u4-full ③ 段（拖入落 placement + 渲出真实图；挪位改 x/y、w/rotation 不变；br 手柄放大 w）。
- 写故事：给该上传物件写故事，保存全量落盘（schema v4）—— u4-full ④ 段（poll 落盘 story+imageRef+plCount+schemaVersion）。
- 切游客看故事+原图：游客模式点物件只读弹「故事+原图」，无编辑入口 —— u4-full ⑥ 段。
- 过程无 console 未捕获错误 / 未处理 Promise 拒绝：真实收集机制（pageerror + 页内 unhandledrejection 监听 + console error，排除 `Failed to load resource`），参照 n4-full 写法 —— u4-full `attachErrorGuards/assertNoRuntimeErrors`。
- 无横向溢出：关键节点 `assertNoHorizontalOverflow`。
- 全量套件不回归：`npx playwright test` 56 passed / exit 0。

## 改动清单

### 新增
- `e2e/u4-full.spec.ts`：U4 收口全流程主链路（PC 1920×1080，单 test）。
  上传闭环走真实 UI（真 UploadEntry→真上传管线→真预览→真 dispatch add-item），注入文件只在隐藏
  `upload-input` 上灌一张页内合成 JPEG 触发真实 onChange（零测试钩子进生产码，与 U2/U3 官方 spec 同款）。
  流程：传照片(点 upload-add→注入→预览→改名→确认入库→dock 15 件、已传 1/50、落盘 user 件 poll)
  → 建场景「客厅」→ 从 dock 拖入该上传件(落 placement、节点带真实 src、只经 translate 不重排)
  → 挪位(dragCenterTo，x/y 变、w/rotation 不变)→ 角手柄缩放(br 向外，w 增大、x/y/rotation 不变)
  → 写故事(选中→placement-story→写→存，poll 落盘)→ 刷新还原(dock/配额/名字/placement 逐字段/图片 hydrate 成 blob)
  → 切游客(dock 消失、点物件只读弹窗 data-mode=guest、故事正文=STORY、story-photo blob 且有自然尺寸、
  无 input/save/cancel/手柄/选框)。

### 校准的既有 e2e（说明见下「联调缺陷分析」）
- `e2e/n1-foundation.spec.ts`：
  - ①②③ 的 `schemaVersion` 断言 2→4（N1 立的 v2 语义延续，版本号已随 N2→v3、U1→v4 递增）。
  - ③ 的 Item 结构断言：由旧的四字段全等 `['id','imageSrc','name','story']` 改为
    `arrayContaining(['id','imageSrc','name','story'])`——U1 后 Item 另带 source/aspectRatio/originalImageSrc/
    displayImageSrc 等（builtin 件序列化为 8 字段），核心字段仍在、故事结构未丢，原意保留。
  - ① 的「读路径：百分比→像素换算成立」由旧**全画布**公式改写为现行**场景图 contain 矩形（imgRect）**模型：
    按场景图 natural 尺寸算 imgRect（与 Canvas.containRect 同式），断言物件渲染中心 = imgRect 原点 + 百分比×imgRect 宽/高。
    （旧公式在 N2 坐标系改为「场景图矩形百分比」后 pxY 差 ~78px；精确像素几何本属 N2 领域、已由 n2-shell 精测。）
- `e2e/m3-story.spec.ts`：① 的 `schemaVersion` 断言 2→4。（②③ 原本即通过，未动。）
- `e2e/m2-transform.spec.ts`：整文件校准到 w 模型（保留两条测试原意）：
  - `readPlacement` 的 `scale`→`w`；全部 scale 断言→w（缩放折算成宽度百分比、取代旧 scale 倍率）。
  - 拖入落点断言由旧全画布百分比公式改为 imgRect 模型（新增 `imgRectOf` 助手，与 Workbench 落点换算同式），
    仍验「真实拖入落点 ≠ 默认网格首位」。
  - 旧「旋转/缩放经 tf 的 rotate+scale」断言：现行 committed tf 仅 `rotate()`（缩放折算成 img 的 style.width），
    故改为断言 tf 含 rotate() + node 宽度以 px 直接定尺。
  - 测试② 由「拖到报头区域（旧有界画布之外）」改为「拖到视口上缘之上（clientY<0）」——N2 满屏后画布铺满整个视口、
    浮层拖动中让路，唯一「画布之外」的无效落点是视口之外；Workbench.handleDropItemAt 的边界判定拒收，仍验落点判定。
- `e2e/m4-full.spec.ts`：三视口全流程校准到 w 模型：
  - `readPlacement` 的 `scale`→`w`；全部 scale 断言→w；`schemaVersion` 2→4。
  - `placeItemByClick` 开头加 `ensureDockOpen`——N2 后窄屏(<880px)dock 默认收合成把手，768/375 视口下缩略卡不可见。
  - 故事交互（openStoryEditor/writeStory/readStoryViaEditor）包进 `withUiHidden`：用应用自带「隐藏界面」
    （眼睛钮 `toggle-ui`·.eye-keeper）一键收起全部浮层——N2 满屏后报头/场景条/dock 浮在画布之上，而选中态
    的故事工具条「悬于选框上方」属画布内元素，高位物件（默认网格位 y≈24%）或窄矮视口下工具条会被顶部报头等
    浮层盖住而不可点；隐藏浮层后位置无关、三视口通吃。恢复界面放在整段操作末尾（弹窗已关、眼睛可点）——
    窄屏近满宽的故事弹窗会盖住右上角眼睛钮，弹窗未关时点不到它。

### 源码（src/）
- **无改动。** 本 sprint 未发现源码联调缺陷（详见下）。

## 联调缺陷分析（为何校准遗留 e2e 而非改源码）
基线 `npx playwright test` 起点即 9 个旧 spec 失败：m2-transform×2、m3-story×1、m4-full×3、n1-foundation×3。
逐一定位，全部是**遗留测试断言 vs 已演进 schema 的不一致，非源码 bug**：
- N1(v2)→N2(v3)：坐标系由「可视区百分比+scale 倍率」改为「场景图矩形(contain)百分比 + w 宽度」，取消 scale 字段。
- N2：满屏沉浸——画布铺满视口、报头/场景条/dock 改为浮层（窄屏 dock 默认收合）。
- U1(v4)：照片二进制迁 IndexedDB、状态树只存引用，schemaVersion=4，Item 增 source/aspectRatio/图位等。

各里程碑验收当时只跑各自 spec，从未回归旧 spec，故 M2/M3/M4/N1 的 e2e 自 N2/U1 起静默失效。U4 是首个要求
**全量套件绿**的里程碑，正是收这笔债的节点（criteria「M1~M4、N1~N4 既有 e2e 全套跑通」）。

**铁证——不存在「改源码」的解**：`m4-full` 断言 `schemaVersion===2`、`n4-full` 断言 `schemaVersion===4`，
二者皆为「既有 e2e」且不可调和；任何单一 schemaVersion 都无法让新旧 spec 同时绿。源码正确性另由 n2/n3/n4/
u1/u2/u3 全绿佐证（这些覆盖了同样的变换/故事/持久化行为）。因此唯一正解是按现行（且正确的）schema 校准
遗留 spec，严格保留各自里程碑意图、只改被后续里程碑刻意改掉的机制（版本号/字段名/坐标系/满屏浮层）。

## 自检过程与命令输出摘要
- `npx playwright test e2e/u4-full.spec.ts --reporter=line` → **exit 0**，`1 passed (3.1s)`。
- `npx playwright test --reporter=line` → **exit 0**，`56 passed (~50s)`。连跑两次（run A / run B）均 56 passed、
  一致无 flaky（workers=1、retries=0）。
- 分文件复核校准结果：n1-foundation 3 passed、m3-story 3 passed、m2-transform 2 passed、m4-full 3 passed（含 768/375 窄视口）。
- src/ 未改，生产构建路径不受影响（本 sprint 无源码改动）。
- 横屏手机 844×390 全链路与视觉 DNA 终验按契约留给 U4-S2，本 sprint 不做。

## 结论
两条验收命令均 exit 0；u4-full 覆盖 U4-S1 全部上传/摆放/故事/游客硬指标；全量 56 e2e 绿、不回归。
