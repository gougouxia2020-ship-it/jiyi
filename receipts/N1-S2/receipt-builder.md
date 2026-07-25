# N1-S2 建造回执（builder）

sprint：N1-S2 · milestone N1（素材与数据地基 · 回炉第一块）
角色：general 队建造员
一句话：新增横版书房场景图并接入 manifest 成默认书房；持久化 schema 升 v2（Placement.x/y 改为场景图坐标系百分比存/读写，v1 旧数据加载即作废重置、故事结构保留）；新增 e2e/n1-foundation.spec.ts；check-asset-trim 补横版书房图存在性+横向校验。

---

## 一、交付物清单（路径）

新增：
- `backgrounds/reading-nook-wide-demo.jpg` —— 横版书房场景图（3000×2000，暖调胶片质感，与客厅/卧室成一组）。由 `backgrounds/reading-nook-demo.jpg`（2000×3000 竖版、已在库授权素材）下半段裁切+放大而来。
- `e2e/n1-foundation.spec.ts` —— schema v2 三点覆盖（百分比读写+刷新还原 / v1 作废不崩 / 故事结构保留）。

改动：
- `src/assets/manifest.ts` —— 书房背景（id 保留 `reading-nook`、名 `书房`）改指向新横版图；不再 import 竖版（竖版不进生产构建）。
- `src/model/types.ts` —— Placement.x/y 语义注释改为「场景图坐标系百分比」（字段名不变）。
- `src/storage/persistence.ts` —— `SCHEMA_VERSION = 2`；版本不匹配分支注释补 v1→v2 作废重置语义（逻辑已就位：不迁移、直接回初始空态）。
- `src/state/gallery.ts` —— place-item 默认网格位由像素改百分比（x=12+col*14，y=14+row*16）。
- `src/components/Workbench.tsx` —— 抽屉拖入落点：像素落点+钳制后换算成可视区百分比再 dispatch。
- `src/components/Canvas.tsx` —— 新增 stage 尺寸测量（useLayoutEffect + ResizeObserver）；渲染把百分比换算成像素位移（data-x/data-y 仍暴露百分比原值）；move 手势起手把百分比换算成像素基线、松手提交时换算回百分比；scale/rotate 手势补 stageW/stageH 占位字段。
- `scripts/check-asset-trim.mjs` —— S2 挂载点补：新横版书房图存在性 + 横向（width>height）校验；内联纯 Node 的 JPEG SOFn 尺寸解析（不依赖外部库/工具，与 lib/png.mjs 同风格）。原 14 张物件 PNG 裁边逻辑一字未动。
- `e2e/m2-transform.spec.ts` / `e2e/m3-story.spec.ts` / `e2e/m4-full.spec.ts` —— 随 v2 契约的连带适配（见「三、连带适配」）。

过程文件：
- `receipts/N1-S2/receipt-builder.md`（本文件）。

保留未动：`backgrounds/reading-nook-demo.jpg`（竖版原始源，未 import、不进 dist；保留以备将来重裁）。

---

## 二、四条验收硬指标自检（逐条）

① 生产构建通过（`npm run build`，expect_exit 0）
- 结果：**exit 0**。`tsc -b && vite build` 全绿，无类型错误。56 modules transformed，产物含 `reading-nook-wide-demo-*.jpg`（1019.70 kB），竖版 reading-nook-demo.jpg 未进 dist（已替换）。

② 素材裁切达标（`node scripts/check-asset-trim.mjs`，expect_exit 0）
- 结果：**exit 0**。14 张物件 PNG 全部 ✓（四边透明边 ≤8px、清单宽高比与实体一致，逻辑未改）；新增行 `reading-nook-wide-demo.jpg 3000x2000 ✓ 横向`（存在且 width>height）。

③ schema v2 e2e（`npx playwright test e2e/n1-foundation.spec.ts --reporter=line`，expect_exit 0）
- 结果：**exit 0**，3 passed。
  - ① 百分比读写+刷新还原：placement.x/y 落 [0,100] 百分比；localStorage schema=2、placements[0].x/y==data-* 且在 [0,100]；渲染像素位移≈百分比×可视区宽/高（读路径成立）；拖动改位写入新百分比；刷新后逐字段精确还原。
  - ② v1 旧数据：预置 schemaVersion=1（像素坐标+场景+故事）→ reload → 外壳照常渲染（不崩溃）、无场景/无摆放（作废清空重摆）、抽屉 14 件在、存储升为 v2 空态、activeSceneId=null、全程无 pageerror/console.error。
  - ③ 故事结构保留：写故事→存储 v2、目标 Item 键集 {id,imageSrc,name,story}、story 为写入文本；刷新后经编辑器读回一致、结构键集不变。

④ 横版书房图对味（manual 人工判）
- 自评（供人工复核）：裁自竖图下半段——左侧暖色书脊满架（书架细节留足）、中/右窗台一丛绿植、前景芥末黄+陶土红窗边坐垫。暖木/奶油/陶土的胶片色调，与 living-room（灰沙发+暖木地板）、bedroom（落日暖调）成一组，贴 taste A2「旧信·沉浸」DNA（暖奶油/陶土红/胶片质感）。无空墙、亮部（窗）由绿植充填不空。目视核对构图成立（见 sprint 中裁切后截图核对）。

补充自跑：`npx playwright test --reporter=line` 全 14 测试 passed（m1/m2/m3/m4 + n1，含连带适配后）。

---

## 三、连带适配（v2 契约的直接后果，非顺手改）

schema 升 v2 会必然推翻旧 M 系 spec 里两类硬编码：像素坐标、schemaVersion=1。这两类断言是我这次改动的**直接后果**，属「修我改动所触之处」，逐条最小适配（非加功能）：
- `e2e/m2-transform.spec.ts`（1 处）：拖入落点断言由「绝对像素 ±8px」改为「场景图百分比 ±1」。
- `e2e/m3-story.spec.ts`（1 处）、`e2e/m4-full.spec.ts`（1 处）：`schemaVersion).toBe(1)` → `.toBe(2)`。
- m1-shell 无需改（其坐标断言是刷新前后 style 字符串的回环相等，百分比→像素在同视口确定性一致，天然通过）；m3/m4 其余坐标断言均为相对比较（改变/相等/不变），百分比下同样成立。
- 若评审认为旧 M 系 spec 应留原样、不由本 sprint 触碰，可回退这 3 行；N1 门槛（build + check-asset-trim + n1-foundation）不依赖它们，回退不影响验收。

---

## 四、关键取舍与实现说明

1. 百分比参照系暂取整块 stage（可视区）。goal 明确「contain 居中＋同图模糊补边＋窗口缩放钉位的自适应渲染层是 N2 的活，本 sprint 只做数据存储格式与素材本体」。故本层只做「百分比↔像素」的存/取换算，参照系用整块 stage；N2 会把参照系换成 contain 后的场景图矩形，百分比语义（房间内相对位置）平滑沿用、无需再迁移数据。
2. stage 尺寸测量用 useLayoutEffect + ResizeObserver：首帧绘制前量好（无跳位闪烁），scene 切换时重挂到新 stage。手势起手把百分比换算成像素基线跑「跟手直改 DOM」的既有路径（拖动路径零改动、不掉帧），松手提交时换算回百分比落盘。
3. v1→v2 不迁移、直接作废（idea 定调「旧像素坐标摆放作废、不做迁移、清空重摆、故事保留」）。loadState 版本不匹配分支本就回初始空态，核实其对 v1 生效并补注释；Item.story 经 reconcile 仅在同版本数据内保留结构，v1 整体作废后故事随初始态归空（符合「清空重摆」，故事字段结构本身在 v2 数据内保留不变）。
4. 横版书房图产出方式：无图像生成工具，按派工用 Python PIL（已装 12.3.0）对库内授权竖图裁下半段（full-width 2000 × bottom 1333 = 3:2）再放大到 3000×2000（对齐 living-room 分辨率量级），quality 88 progressive JPEG（1.0 MB，与另两张同量级）。未从外部取图、未凭空生成内容。
5. check-asset-trim 的 JPEG 尺寸校验用内联纯 Node SOFn 解析（不引 sharp/sips，保持「评审环境 node 直接跑通」的既有约束）；只在 S2 挂载点追加，14 张 PNG 校验逻辑零改动。

---

## 五、范围边界（本 sprint 未做，属 N2）

- contain 居中显示、同图放大模糊补边、窗口缩放钉住相对位置的完整自适应渲染层 —— N2 milestone，本 sprint 不做。stage 仍沿用既有 cover 背景铺满；本次只落数据存储格式（百分比）与素材本体（横版书房图）。

自检结论：四条硬指标中三条自动项均 exit 0、第四条对味自评达标（待人工判）；全量 e2e 14 passed。不自判通过，交评审裁决。
