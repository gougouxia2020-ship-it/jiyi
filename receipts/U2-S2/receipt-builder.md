# U2-S2 建造回执 · 上传物件接入全链路 + 补齐三份官方 e2e

sprint：U2-S2｜团队：general｜岗位：builder
目标：把 U2-S1 做出的上传物件接进项目既有「拖进场景／写故事／跨场景同步／刷新持久化」全链路端到端跑通，并补齐里程碑 U2 官方验收指名的三份 e2e（`e2e/u2-upload.spec.ts`、`e2e/u2-large-image.spec.ts`、`e2e/u2-seam.spec.ts`），让机器验收命令直接跑通。

## 一、诊断：接不上的两处断点（U2-S1 已把「上传→预览→入库→当场出现在 dock」建对，缺下面两环）

1. **画布不认用户件**：`Canvas.tsx` 渲染 placement 与手势里的宽高比都走 `getItemAssetById(p.itemId)`——只查内置 14 件的 manifest。用户上传件不在 manifest 里，拖进场景后 `getItemAssetById` 返回 undefined → `if (!asset) return null` 直接不渲染。故「用户件拖进场景」这一环断在渲染层。
2. **刷新后用户件图片不复活**：`persistence.saveState` 落盘时把用户件的内联图片搬进 IndexedDB、LocalStorage 只留 `imageRef`（不存二进制），故 `loadState` 读回的 user 件三个图位皆空。此前没有任何一处在启动时按 `imageRef` 从 IndexedDB 取图回填 → 刷新后 dock 缩略／入场景渲染／故事原图全是空。U2-S1 回执已把这条 hydrate 明确移交本 sprint。

## 二、改动清单（成品无一字进 `.opc/`）

### 修改（接通全链路）
- `src/components/Canvas.tsx`：物件目录改从 `state.items` 解（双源：内置 14 件 + 用户件），取代仅查 manifest 的 `getItemAssetById`。
  - 渲染循环：`const item = state.items.find(i => i.id === p.itemId); if (!item) return null;` 入场景用 `item.displayImageSrc || item.imageSrc`（`nodeSrc`），宽高比用 `item.aspectRatio`，alt/工具条标签用 `item.name`。
  - 两处手势起手（`onItemPointerDown` / `onScalePointerDown`）的宽高比同改从 `state.items` 解。
  - `.stage__node` 的 `src={nodeSrc || undefined}`：刷新后 hydrate 未完成前图位为空 → 省略 src 而非空串（避免浏览器对 `""` 发请求/报错），hydrate 回填后重渲染即带真实 src。
  - 移除不再使用的 `getItemAssetById` import（`noUnusedLocals` 为真，留着会挂构建）。内置件行为等价（三图位/宽高比与旧 manifest 值一致），旧里程碑不回归。
- `src/state/gallery.ts`：`GalleryAction` 加 `{ type:'hydrate-item-image'; itemId; imageSrc }`；reducer 新增该 case——把回填的图写进目标 Item 的 `imageSrc/displayImageSrc/originalImageSrc` 三位。**不设编辑模式守卫**（hydrate 与用户意图无关，游客模式下已入场景的用户件也须显示，且是纯回填不改用户数据）；空图源/目标不存在则拒绝。
- `src/App.tsx`：挂载时跑一次 hydrate 回填——`loadState().items` 里筛「`source==='user'` + 有 `imageRef` + 当前图位空」的持久化件，逐件 `getImageObjectURL(imageRef)` 从 IndexedDB 取回二进制生成会话内 object URL，经 `hydrate-item-image` 回填。取图失败/IndexedDB 不可用时静默跳过（不连累渲染、不误报存储错误）；用 `cancelled` 守卫 StrictMode 双跑（被取消那次 revoke 掉刚建的 URL、不 dispatch）。本会话内新上传件自带 `data:URL`、无需回填。
- `src/components/ItemTray.tsx`：dock 缩略卡与拖拽幽灵的 `<img>` 同改 `src={... || undefined}`——刷新后 hydrate 回填前不渲染坏图。

### 修改（criteria[2] 关键架构：处理接口成为运行期唯一插入点）
- `src/upload/processor.ts`：`defaultProcessor` 由 `const` 改 `let`（ESM live binding），新增 `setImageProcessor(p)` / `resetImageProcessor()`——整层替换处理接口的运行期实现槽。**只碰处理接口这一层**：`pipeline.ts`（`import { defaultProcessor }` + 默认参数，运行期读到新值）、`normalize.ts`、`add-item`、`persistence`、`ItemTray`/`Canvas` 一行不动。这让「唯一插入点」可在运行期整层替换（也是将来接抠图/风格化的替换入口），并让 criteria[2] 的灰度反例能贯穿真实 UI 端到端注入。

### 新增（三份里程碑点名 e2e，文件名精确匹配验收标准）
- `e2e/u2-upload.spec.ts`（criteria[0]）：① 预览取消→不入库、dock 无残留、落盘无 user 件；② 上传闭环全链路——选图→预览→改名确认入库→出现在 dock→拖进场景（走同一条 place-item）→选中写故事保存→刷新后 dock 15 件/user 件在、placement 逐字段还原、图片经 IndexedDB hydrate 回填（缩略与画布节点都拿回 `blob:` object URL 且 `naturalWidth>0`）、故事文本与原始照片全在。全程真实 UI，watchErrors 断言零 pageerror/console.error。
- `e2e/u2-large-image.spec.ts`（criteria[1]）：页内合成 4000×3000 红底+顶部蓝带 JPEG，SOI 后插 APP1(Exif) 写 Orientation=6，灌隐藏 input 走真实管线→预览。断言不崩（预览渲染 + `page.evaluate` realm 仍活）、长边 ≤1600（预览与 dock 缩略解码 natural 尺寸皆 1200×1600）、方向转正（h>w 不躺倒；横存顶部蓝带被转到某一侧成竖带——恰一侧蓝、另一侧红、中心红）、落盘 aspectRatio<1 且走 imageRef。
- `e2e/u2-seam.spec.ts`（criteria[2]）：① **端到端**——对照默认(恒等)上传强红源图→入库彩色；仅调 `setImageProcessor(灰度)` 整层替换处理接口（normalize/入库/存储/UI 一行不碰）→同一源图同一套真实 UI→入库物件变灰度（dock 缩略 + 拖进场景的画布节点都灰度）；`resetImageProcessor` 复位→同一源图又回彩色（证明灰度只由处理接口决定、非源图/上下游）。② **管线级**——同一 file 只换 processor（恒等↔灰度）：尺寸/宽高比完全一致（上游未动），仅产出中心色由偏红转 R≈G≈B。

未新增任何 npm 依赖（`package.json` 未动）。

## 三、逐条自检（对照 milestones.json U2 三条 criteria，字面从严）

| # | criteria 原文要点 | 结论 | 证据 |
|---|------|------|------|
| 0 | 上传闭环：选图→预览→确认入库→出现在 dock→拖进场景→写故事→刷新后物件/摆放/故事全在；取消则不入库、无残留 | 过 | `e2e/u2-upload.spec.ts` 2 passed（真实 UI 全链路：拖进场景后 placement 出现且渲染出真实图、写故事、刷新后 dock 15 件/placement 逐字段 `toEqual`/图 hydrate 回 `blob:`/故事文本与原图全在；取消路径 dock 恒 14、落盘无 user 件） |
| 1 | 大图 4000×3000+ 且 EXIF orientation=6：不崩、标签页不被杀、落库长边 ≤1600、方向不躺倒 | 过 | `e2e/u2-large-image.spec.ts` 1 passed（无 pageerror + realm 仍可求值；预览与 dock 缩略解码皆 1200×1600 长边=1600；h>w 且横存蓝带转到一侧竖带证 90° 转正；落盘 aspectRatio<1 走 imageRef） |
| 2 | 反例(灰度)注入该接口、不改上下游一行 → 产出即灰度；须改上下游/存储/UI 才生效即判失败 | 过 | `e2e/u2-seam.spec.ts` 2 passed（只 `setImageProcessor(灰度)` 整层替换处理接口，真实上传 UI 产出的 dock 缩略与入场景画布节点均灰度；复位即回彩色；管线级同 file 换 processor 尺寸/宽高比不变仅颜色变——normalize/测宽高比/add-item/persistence/UI 一行未改） |

## 四、四条验收命令实际执行结果（交检前本岗亲跑）

- `npx playwright test e2e/u2-upload.spec.ts --reporter=line` → **EXIT=0**，2 passed。
- `npx playwright test e2e/u2-large-image.spec.ts --reporter=line` → **EXIT=0**，1 passed。
- `npx playwright test e2e/u2-seam.spec.ts --reporter=line` → **EXIT=0**，2 passed。
- `npm run build` → **EXIT=0**（`tsc -b && vite build`，63 模块，构建成功、无类型错误）。

## 五、全量回归（不得新增此前未见的失败用例）

- 改动前基线：`npx playwright test` → **35 passed / 9 failed**。
- 改动后：`npx playwright test` → **40 passed / 9 failed**（+5 全部为本 sprint 新增的三份 u2-*.spec）。
- 9 个失败**与基线逐一相同、无一新增**，全部是先前 sprint 遗留的过期断言（本次未碰、亦非本次引入）：
  - `m2-transform.spec.ts:84`（line 109 坐标值断言 `toBeLessThan(1)` 实得 4.29——N2 schema v3 把坐标改场景图坐标系后旧「可视区百分比+固定 110px」公式失效；placement 确有渲染并变换，证内置件渲染未被本次重构破坏）、`:199`（N2 满屏后整块视口即 stage，旧「落到画布外不建 placement」不再成立）。
  - `m3-story.spec.ts:110`（line 126 `schemaVersion).toBe(2)` 实得 4）——同一 spec 的 `:135` 跨场景同步、`:171` 游客只读（均走本次重构后的 Canvas 故事路径、内置件）**通过**，佐证内置件故事/游客渲染完好。
  - `m4-full.spec.ts:412`（×3 视口）、`n1-foundation.spec.ts:98/152/196`——同类 `schemaVersion).toBe(2)` 与 N2 坐标公式过期断言。
- 现役护栏 `n2-shell / n3-edit / n4-full / u1-foundation / u1-s1-dualsource / u1-storage-error / u2-s1-upload-selftest` 全绿。判定：无本 sprint 引入的回归。

## 六、自判

不自判通过——按岗位铁律做完即交，过不过由评审员对照验收标准裁决。上表三条 criteria 与四条验收命令本岗自检均已对上、明显缺项无。
