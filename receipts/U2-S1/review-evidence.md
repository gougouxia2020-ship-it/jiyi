# U2-S1 评审证据 · 上传管线与处理接口（主链路）

评审对象：`src/upload/{processor.ts,normalize.ts,pipeline.ts,UploadEntry.tsx}`、`src/state/gallery.ts`（add-item）、
`src/components/{ItemTray.tsx,Workbench.tsx}`、`src/App.css`、`e2e/u2-s1-upload-selftest.spec.ts`。
尺子：`.opc/sprints/U2-S1.json` 的 `goal`【验收硬指标】段。逐条亲手核查如下，结论：**全部通过，未发现问题**。

## 1. npm run build（exit 0、无类型错误）

实际执行：
```
$ npm run build
> tsc -b && vite build
✓ 63 modules transformed.
✓ built in 344ms
EXIT_CODE=0
```
`tsconfig.app.json` 开 `strict` + `noUnusedLocals` + `noUnusedParameters`，`include: ["src"]` 覆盖全部新增文件。**过**。

## 2. package.json 未新增运行时依赖

读 `package.json`：`dependencies` 仅 `react`/`react-dom`，`devDependencies` 为 `@playwright/test`/`@types/*`/`vite`/`typescript`/`@vitejs/plugin-react`，与既有一致。`src/upload/normalize.ts` 全程只用浏览器原生 `createImageBitmap`/`canvas`/`toDataURL`，未 import 任何第三方图像库。**过**。

## 3. 处理接口是「独立、可整体替换」模块，签名为「规范化图→可入场景图」，本期恒等直通

读 `src/upload/processor.ts`：
```ts
export type ImageProcessor = (input: NormalizedImage) => Promise<ProcessedImage> | ProcessedImage;
export const identityProcessor: ImageProcessor = (input) => ({ ...input });
export const defaultProcessor: ImageProcessor = identityProcessor;
```
`src/upload/pipeline.ts` 的 `runUploadPipeline(file, processor=defaultProcessor)`：normalize → processor(第二参注入) → 用**处理接口产出**（非原图）测宽高比 → 组装 `UploadResult`。上游 normalize.ts、下游 add-item（gallery.ts）、UI（UploadEntry.tsx）均只依赖 `UploadResult`/`ImageProcessor` 类型契约，不感知具体实现。**过**——签名与恒等直通实现均属实。

## 4. 灰度反例：仅注入第二参即变灰、上下游零改动

实际运行 `e2e/u2-s1-upload-selftest.spec.ts`（非仅读源码，已执行）：
```
npx playwright test u2-s1-upload-selftest --reporter=list
✓ A/B/C · EXIF方向校正+长边降采样≤1600+灰度反例注入（226ms）
✓ D · dock上传入口；预览取消不入库；预览确认落成item（365ms）
2 passed (1.7s)
```
测试内代码路径：`runUploadPipeline(file, grayscaleProcessor)` 只传第二参，断言灰度产出中心像素 `|R-G|≤6 且 |G-B|≤6`；同一 file 走 `identityProcessor`/不传参（`defaultProcessor`）产出尺寸一致，证明生产链默认恒等、注入反例不改 normalize/测宽高比/入库任何一行。**过**，且是亲手跑出的真实断言通过，非只读建造员自述。

## 5. 大图/EXIF：4000×3000 orientation=6 → 不崩、落库长边≤1600px、方向不躺倒

同一自测（已实测执行，见上）：测试用真实字节手工拼装 SOI+APP1(Exif)+Orientation=6 的 JPEG（4000×3000，顶部 360px 蓝带），过真实管线断言：
- `Math.max(w,h) ≤ 1600`（实测 1600）
- `h(1600) > w(1200)`，`aspectRatio<1`（不躺倒）
- 像素级验证方向确实转了 90°：左右两侧恰一侧偏蓝、中心偏红（原横存顶部蓝带经转正后落到竖图一侧）
- `page.on('pageerror')` 收集为空数组（页面未崩）

`src/upload/normalize.ts` 用 `createImageBitmap(file, { imageOrientation: 'from-image' })` 做方向校正、`bitmap.close()` 立即释放满帧位图内存，避免 48MP 直出长期驻留。**过**，有像素级实测依据，非空口白牙。

## 6. dock 出现上传入口；游客模式没有（非入口单独逃出 dock）

读 `src/components/Workbench.tsx` 第 93-103 行：
```tsx
{state.mode === 'edit' && (
  <ItemTray ... onAddItem={(item) => dispatch({ type:'add-item', ...item })} />
)}
```
`UploadEntry` 挂在 `ItemTray.tsx` 内部 `.dock-list` 顶部（第 155-157 行），而 `ItemTray`（含其内的 `UploadEntry`）整个组件只在 `state.mode==='edit'` 时才被渲染进 DOM——上传入口没有独立挂载点，游客模式下 `ItemTray` 根本不渲染，`upload-add` 按钮随整个 dock 一起消失。**过**，逻辑覆盖确认无漏洞（不是靠 CSS 隐藏，是整个子树不渲染）。

## 7. 预览取消不入库、dock 无残留

读 `src/upload/UploadEntry.tsx`：
```ts
function cancel() {
  setResult(null); // 取消：不 dispatch、不入库、无残留
}
```
`cancel` 只做本地 state 清空，全函数体内无任何 `onAddItem`/`dispatch` 调用。实测（自测 D，已执行）：注入图→预览弹出→点 `upload-cancel`→`tray-item` 计数仍 14、`localStorage` 里 `source==='user'` 的件数为 0。**过**。

## 8. 预览确认 → 落成 source:'user' 的 Item 出现在 dock

读 `src/state/gallery.ts` `add-item` case（第 228-251 行）：仅编辑模式可写；校验 `imageSrc` 非空字符串、`aspectRatio` 为正有限数；落成 `{id, name, source:'user', aspectRatio, originalImageSrc, displayImageSrc, imageSrc, story:''}`。实测（自测 D）：确认后 `tray-item` 计数变 15，`localStorage` 轮询到 `source==='user'` 件 1 条，`name`/`source`/`imageRef`/`aspectRatio`（240×180→≈1.33）字段值核对通过。**过**。

## 9. 既有 e2e 回归（9 个失败与本改动无关）

实际全量执行：
```
npx playwright test --reporter=list
35 passed, 9 failed（1.6m）
```
9 个失败清单与建造员回执逐一核对一致：
- `m2-transform.spec.ts:84`、`:199` —— 用 N2 之前「可视区百分比+固定 110px 物件宽」公式算期望值（如 `(cbox.width*dropFx - 110/2)/cbox.width*100`），与当前 schema v3（场景图坐标系 x/y/w 百分比）不符；`:199` 用例断言拖到画布外不建 placement，但 N2 满屏画布已把原「画布外」区域纳入可落点范围，与本 sprint 无关。
- `m3-story.spec.ts:110` —— 硬编码 `schemaVersion===2`，当前 `SCHEMA_VERSION=4`。
- `m4-full.spec.ts`（PC/768px/375px 三条）—— PC 一条断言角手柄缩放后 `scale` 字段变化（旧 schema 字段，v3 已改用 `w`）；768px/375px 两条超时卡在 `tray-item` 点击不可见——实测确认原因是窄屏（<880px）dock 默认收起成贴边把手（`ItemTray.tsx` 第 62-65 行 `closed` 初始态，标注属 N2-S2 既有行为），用例未先点 `dock-tab` 展开，与本 sprint 上传改动无关。
- `n1-foundation.spec.ts`（① ② ③）—— 均硬编码 `schemaVersion===2`。

逐一核实：均为 schema 版本演进（v2→v4）或坐标系演进（N2 改场景图坐标系、满屏画布）遗留的过期断言，与 U2-S1 上传管线改动无因果关系。上传入口用独立 `upload-add` testid，未挤占 `tray-item` 索引，`n1-foundation` 关于 14 件计数的断言本身通过（不在失败清单内）。**判定：无本 sprint 引入的回归**。

## 10. 越界检查（确认没有因「标准之外没做」而误判）

goal 原文明确本 sprint 不要求：官方三份 e2e（u2-upload/u2-large-image/u2-seam.spec.ts）、拖入场景/写故事/跨场景同步/刷新持久化的端到端集成——均已确认未在【验收硬指标】段出现，不作为打回依据。

## 结论

对照 `.opc/sprints/U2-S1.json` 的 goal【验收硬指标】逐条核查（build、依赖、处理接口设计、灰度反例、大图EXIF、游客隐藏、预览取消、预览确认入库、既有回归说明），条条亲手验证（源码读取 + 实际命令执行，非听建造员自述），未发现「标准没达到」的问题。**放行（pass）**。
