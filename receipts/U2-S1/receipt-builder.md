# U2-S1 建造回执 · 上传管线与处理接口（主链路）

sprint：U2-S1｜团队：general｜岗位：builder
契约：`.opc/sprints/U2-S1.json` 的 `goal`（打通「dock＋ → 选图 → 解码规范化 → 【处理接口】 → 测宽高比 → 预览确认 → add-item 入库」主链路）。

## 一、改动清单

### 新增（`src/upload/` 处理管线模块）
- `src/upload/processor.ts`：**【处理接口】**——本轮关键设计。定义签名 `ImageProcessor = (NormalizedImage) => ProcessedImage`（可异步），本期实现 `identityProcessor`（恒等直通，原图即成品）与 `defaultProcessor`（管线默认）。这是将来接抠图/风格化的**唯一插入点**：改本文件即改产出，上下游一行不动。
- `src/upload/normalize.ts`：解码与规范化。`normalizeImage(file, maxEdge=1600)`——用 `createImageBitmap(file, { imageOrientation: 'from-image' })` 由浏览器按 EXIF 摆正（无需手解析字节），按校正后长边缩至 ≤1600，drawImage 到目标 canvas，`toDataURL('image/jpeg', 0.85)` 重编码压缩；满帧位图 `bitmap.close()` 即刻释放（48MP 直出不长期驻留，防标签页崩）。含 `NormalizeError`。
- `src/upload/pipeline.ts`：主链路编排。`runUploadPipeline(file, processor=defaultProcessor)`——normalize → processor → 测宽高比（对**处理接口产出**测，非原图）→ 产出 `UploadResult`（imageSrc/aspectRatio/width/height/suggestedName）。processor 以**第二参注入**：生产改 processor.ts；自测注入反例只传第二参，上下游零改。含 `nameFromFile`（文件名去扩展名派生物件名）。
- `src/upload/UploadEntry.tsx`：dock 顶部「＋」上传入口卡 + 隐藏 `<input type=file accept=image/*>` + 预览确认弹层。选图 → 走管线 → 弹预览（`createPortal` 送 `document.body`，逃出 dock 的 `transform`+`overflow:hidden` 裁剪）→ 确认 `onAddItem` / 取消 `setResult(null)`（不入库、无残留）。预览可改名、显示实测尺寸与宽高比。含处理中转圈与失败提示。

### 修改
- `src/state/gallery.ts`：`GalleryAction` 加 `{ type:'add-item'; name; aspectRatio; imageSrc }`；reducer 新增 `add-item` case——落成一件 `source:'user'` 的 Item（`id=newId('item')`、originalImageSrc/displayImageSrc/imageSrc 三位同源 = 管线产出 data URL、aspectRatio 实测、story 空）；仅编辑模式、空图源/非法宽高比拒绝。import 加 `Item` 类型。
- `src/components/ItemTray.tsx`：import `UploadEntry`；props 加 `onAddItem`；在 `.dock-list` 顶部渲染 `<UploadEntry onAddItem={onAddItem} />`（`tray-item` 缩略卡仍是那 14 件，上传入口用独立 `upload-add` testid，不挤占索引）。
- `src/components/Workbench.tsx`：给 `<ItemTray>` 传 `onAddItem={(item) => dispatch({ type:'add-item', ...item })}`。
- `src/App.css`：新增上传入口卡（陶土红虚线、与缩略卡同宽同底）、预览 scrim+毛玻璃奶油弹窗、改名输入、按钮、失败提示样式——对齐「旧信·沉浸」DNA（暖奶油纸底、衬线、陶土红强调、毛玻璃）。

### 新增自测（非官方 e2e，官方三份 u2-*.spec 留 U2-S2）
- `e2e/u2-s1-upload-selftest.spec.ts`：两条自证（详见下）。

未新增任何 npm 依赖（`package.json` 未动，全程 createImageBitmap/canvas 原生能力）。成品无一字进 `.opc/`。

## 二、逐条自检（对照 goal【验收硬指标】）

| # | 硬指标 | 结论 | 证据 |
|---|--------|------|------|
| 1 | `npm run build` exit 0、无类型错误 | 过 | `tsc -b && vite build` → `BUILD_EXIT=0`，63 模块打包成功 |
| 2 | 超大竖拍 EXIF 图（4000×3000、orientation=6）走全程：不崩、落库图长边 ≤1600px、方向不躺倒 | 过 | 自测 A：页内造 4000×3000 JPEG 注入 EXIF orientation=6，过真实管线 → 产出 1200×1600（长边=1600 ≤1600、h>w 竖图不躺倒、aspectRatio<1）；无 pageerror。横存「顶部」蓝带转正后落到一侧竖带（恰一侧蓝、中心红）证 90° 方向确实校正 |
| 3 | 注入反例（灰度）不改上下游一行即可让产出变灰度 | 过 | 自测 B/C：同一 file，仅给 `runUploadPipeline` 传第二参（灰度 processor）→ 中心像素 R≈G≈B；恒等则中心明显偏红（R>G+40）。normalize/测宽高比/入库/存储/UI 一行未改 |
| 4 | 处理接口留在正确位置（替换该层即改产出，上下游不动） | 过 | 同上；且不传第二参走 `defaultProcessor` 产出与显式 identity 同尺寸，证生产链默认恒等直通 |
| 5 | dock 出现上传入口（游客无） | 过 | 自测 D：`upload-add` 可见；入口长在 `.dock-list` 内，dock 整体仅 `state.mode==='edit'` 渲染（Workbench 第 93 行），游客模式天然无此入口 |
| 6 | 预览取消 → 不入库、dock 无残留 | 过 | 自测 D：注入图 → 预览弹出 → 点取消 → 预览消失、`tray-item` 仍 14、localStorage 里 user 件数=0 |
| 7 | 预览确认 → 落成 source:'user' 的 Item 出现在 dock | 过 | 自测 D：注入图 → 预览（默认名取自文件名）→ 改名「爷爷的怀表」→ 加入陈列 → `tray-item` 变 15；落盘 user 件 name/source/aspectRatio(≈1.33) 已填、图走 imageRef（现有存法：saveState 搬进 IndexedDB、只留引用） |

自测运行：`npx playwright test u2-s1-upload-selftest` → 2 passed。

## 三、既有 e2e 回归说明（非本 sprint 引入）

全量 `npx playwright test` → 35 passed / 9 failed。9 个失败全部为**先前 sprint 遗留的过期断言**，与本次改动无关，已逐一核实：
- `m2/m3/m4/n1` 硬编码 `schemaVersion).toBe(2)`，但当前 `SCHEMA_VERSION=4`（N1 升 v3、U1 升 v4 时这些老 spec 未同步）；
- `m2-transform` 用 N2 之前的「可视区百分比 + 固定 110px 物件」坐标公式，N2 schema v3 改场景图坐标系后即失效。

本次改动对 dock 无索引影响：上传入口用独立 `upload-add` testid，`tray-item` 仍恒为 14 件（n1-foundation 该断言通过）。当前 schema 的回归护栏 `n2-shell / n3-edit / n4-full / u1-foundation / u1-s1-dualsource / u1-storage-error` 全绿。故判定：无本 sprint 引入的回归。

## 四、边界与移交（按 goal 明确留给 U2-S2 的）

- 新物件接入既有拖放/写故事/跨场景同步/**刷新持久化**的端到端验证，与官方三份 e2e（`e2e/u2-upload.spec.ts`、`e2e/u2-large-image.spec.ts`、`e2e/u2-seam.spec.ts`）留 U2-S2。
- 刷新后 user 件图片的 hydrate（从 IndexedDB 按 imageRef 取图回填 imageSrc）本 sprint 不做——本 sprint 只把上传→预览→入库→当场出现在 dock 这条主链路建对。

## 五、自判

不自判通过——按岗位铁律，做完即交，过不过由评审员对照验收标准裁决。上表七条硬指标本岗自检均能对上，明显缺项无。
