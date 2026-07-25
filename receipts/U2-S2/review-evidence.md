# U2-S2 评审证据

sprint：U2-S2｜团队：general｜岗位：reviewer
核查对象：里程碑 U2 三条 criteria（milestones.json）＋ success.json「上传闭环跑通」条目。
已读材料：reviewer.md、review-against-criteria.md、.opc/phase1/milestones.json（U2 全文）、
.opc/phase1/success.json、receipts/U2-S2/receipt-builder.md（先读建造员自述，逐条亲手复核，不采信自述本身作为证据）。

## 1. 亲手重跑四条验收命令 + 全量回归

```
$ npx playwright test e2e/u2-upload.spec.ts --reporter=line
Running 2 tests using 1 worker
  2 passed (3.4s)

$ npx playwright test e2e/u2-large-image.spec.ts --reporter=line
Running 1 test using 1 worker
  1 passed (2.6s)

$ npx playwright test e2e/u2-seam.spec.ts --reporter=line
Running 2 tests using 1 worker
  2 passed (4.2s)

$ npm run build
> tsc -b && vite build
✓ 63 modules transformed.
✓ built in 384ms
EXIT=0

$ npx playwright test --reporter=line
...
9 failed
    m2-transform.spec.ts:84
    m2-transform.spec.ts:199
    m3-story.spec.ts:110
    m4-full.spec.ts:412 (PC / 768px / 375px 三条)
    n1-foundation.spec.ts:98
    n1-foundation.spec.ts:152
    n1-foundation.spec.ts:196
40 passed (1.7m)
```

四条验收命令与建造员自述一致（均 exit 0）；全量回归 **40 passed / 9 failed**，失败清单与建造员回执第五节
逐条比对**完全一致**（文件名+行号一一对应），无本 sprint 引入的新增失败。

## 2. 独立核实「9 个失败＝历史基线，非本 sprint 引入」

不满足于建造员自述，交叉核对更早两轮评审员（非本轮）留下的独立证据：

- `receipts/U2-S1/review-evidence.md` 第 78-91 行：U2-S1 收工时（本 sprint 开始之前）评审员亲跑
  `npx playwright test --reporter=list` 得到 **35 passed, 9 failed**，失败清单为
  `m2-transform.spec.ts:84`、`:199`、`m3-story.spec.ts:110`、`m4-full.spec.ts`（PC/768px/375px 三条）、
  `n1-foundation.spec.ts`（①②③）—— 与本轮我实测的 9 条失败**逐条同名同因**（schemaVersion 硬编码
  期望值 2、当前 SCHEMA_VERSION 已是 4；N2 坐标系改为场景图坐标系后旧公式失效）。
- `receipts/U1-S3/review-evidence.md` 第 56-62 行：更早一轮（U1-S3）也独立复现过同一基线
  （29 passed / 9 failed，逐行 diff 确认与含新文件时的失败集合 IDENTICAL），同样定位到
  `schemaVersion===2` 断言与当前 `SCHEMA_VERSION=4`（`persistence.ts:31`）不符。

结论：这 9 个失败至少在 U2-S1 收尾（早于本 sprint 开工）时就已存在且成因相同，是跨越至少两轮 sprint
的历史欠账（schema 版本演进 v2→v4、N2 坐标系改造遗留），与 U2-S2 本轮改动（Canvas/gallery/App/ItemTray/
processor）无因果关系。**判定：全量回归无回归，通过。**

## 3. 逐条核对三份新 e2e 文件的断言是否真覆盖对应 criteria 字面

### criteria[0] ↔ `e2e/u2-upload.spec.ts`

通读全文（255 行，2 个 test）。test①「预览里取消」：选图→预览可见→点 `upload-cancel`→断言预览消失、
`tray-item` 仍 14、`localStorage` 里查无 `source==='user'` 的件——覆盖「取消不入库、dock 无残留」。
test②「上传闭环」：选图→预览可见→改名→`upload-confirm`→dock 变 15 件→**真实拖拽**
（`page.mouse.down/move/up` 模拟指针，越过拖拽阈值）把新件拖进画布→断言 `.stage__item` 出现、
`.stage__node` 有真实 `src` 且 `complete===true`→点选→点故事手柄→填故事→保存→`expect.poll`
等落盘（`story`/`imageRef`/`placements` 计数）→`page.reload()`→断言 dock 仍 15 件、placement 逐字段
（x/y/w/rotation/z）与刷新前 `toEqual`、图片经 hydrate 拿回 `blob:` URL 且 `naturalWidth>0`、故事弹窗
文本与原图 `src` 含 `blob:`。全程 `watchErrors` 断言零 pageerror/console.error。**逐字段对应 criteria[0]
「选图→预览→确认入库→出现在dock→拖进场景→写故事→刷新后物件/摆放/故事全在；取消不入库无残留」，
非皮毛断言。**

### criteria[1] ↔ `e2e/u2-large-image.spec.ts`

通读全文（184 行，1 个 test）。页内 canvas 合成 4000×3000 JPEG（红底+顶部蓝带模拟横存竖拍），手工在
SOI 后插入 APP1(Exif) TIFF IFD0 单条目 `Orientation=6`（大端）字节序列，灌入隐藏 `input[type=file]`
触发真实 `change` 事件走生产管线。断言点：① `page.evaluate(() => 1+1)===2` 证 realm 未被杀+零
console error 证不崩；② 预览 `<img>` 解码 `naturalWidth/naturalHeight` 精确等于 1200×1600（长边压到
1600 后转正）；③ `dims.h > dims.w` 证方向已转正不躺倒；④ 确认入库后对 dock 缩略卡的真实 `src` 解码
采样左右两侧像素，断言「恰一侧偏蓝、另一侧非偏蓝」证横存顶部蓝带确被物理旋转到竖直一侧（不是只测
尺寸数字、是真核对像素级方向）；⑤ 落盘 `aspectRatio<1`、`imageRef` 为字符串。**四点（不崩/不杀/
长边≤1600/方向不躺倒）逐一硬断言覆盖，且方向验证用像素采样而非仅读矩形高宽，比字面要求更严格。**

### criteria[2] ↔ `e2e/u2-seam.spec.ts`（本轮关键架构保证，从严核查）

通读全文（257 行，2 个 test）。test①走**完全真实的生产 UI**：默认恒等处理器上传红图→dock 缩略偏红
（`isColorful`）；随后仅 `await import('/src/upload/processor.ts')` 拿到模块、调用其导出的
`setImageProcessor(grayscale)`；同一张源图再次走**同一套真实上传 UI**（点击/选图/预览/确认，与
test①第一段用的是同一个 `uploadThroughUI` helper，无任何测试专用旁路）→缩略变灰度
（`isGray`：|R-G|/|G-B|/|R-B| 均 ≤12）；再把该灰度件真实拖进画布，画布节点采样中心像素同样灰度——
证明「产出即物件」贯穿到下游 UI；最后 `resetImageProcessor()` 复位、同一源图再传一次验证变回彩色，
排除「源图本身变了」的混淆可能。test② 是管线级对照：同一 `File` 对象分别喂给
`runUploadPipeline(file, identityProcessor)` 与 `runUploadPipeline(file, grayscale)`，断言产出宽高/
宽高比逐位相同（证上游 normalize 未被处理器影响）、仅中心像素颜色由偏红变 R≈G≈B。

**架构层面独立验证「不改上下游一行代码」**（不采信建造员自述，亲自读源码交叉比对）：

- 读 `src/upload/processor.ts`：本 sprint 唯一的实质改动是把 `defaultProcessor` 由
  `export const` 改 `export let`，并新增两个导出函数 `setImageProcessor`/`resetImageProcessor`——
  这三处改动**全部落在处理接口自身文件内**，不是"上下游"，而正是 criteria[2] 定义里
  "替换该层实现即可改变产出" 的那一层。
- 读 `src/upload/pipeline.ts`：`runUploadPipeline(file, processor: ImageProcessor = defaultProcessor)`
  ——用 `import { defaultProcessor } from './processor'` 取值做默认参数。这是 JS 语义关键点：默认参数
  表达式在**每次调用时**求值（非模块加载时一次性求值），配合 ESM 具名导入的 live binding，运行期对
  `defaultProcessor` 重新赋值后，下一次不传第二参的调用即读到新值——不需要改 pipeline.ts 一行。
  交叉核对 `receipts/U2-S1/review-evidence.md` 第 31 行记录的 U2-S1 版本原文：
  `runUploadPipeline(file, processor=defaultProcessor)`——与本轮读到的签名**逐字相同**，证明
  pipeline.ts 在本 sprint **未被改动**。
- 读 `src/upload/normalize.ts`：纯粹解码/EXIF校正/降采样/重编码，不引用 processor.ts 任何可变状态，
  逻辑与 U2-S1 描述一致。
- 读 `src/state/gallery.ts` 的 `add-item` case（第229-252行）：落成
  `{id,name,source:'user',aspectRatio,originalImageSrc,displayImageSrc,imageSrc,story:''}`，
  与 `receipts/U2-S1/review-evidence.md` 第76行描述的字段结构**逐字相同**，证明本 sprint 对
  add-item 逻辑未做实质改动（本 sprint 对 gallery.ts 的改动是新增独立的 `hydrate-item-image` case，
  与处理接口无关，见下节）。
- 读 `src/upload/UploadEntry.tsx`：不在建造员本轮申报的交付物清单内；`onFileChange` 里
  `await runUploadPipeline(file)`（不传第二参，走生产默认）——这正是 test① 驱动的真实生产代码路径，
  不是测试专用旁路。
- `src/storage/persistence.ts`、`src/storage/imageStore.ts`：读全文，无任何字段/逻辑涉及 processor
  或图像内容处理，只管二进制搬运与引用存取。

**结论：criteria[2] 的"不改上下游任何一行代码"逐层核实成立**——本 sprint 唯一为支持"运行期整层替换"
新增的代码（`let` + 两个 setter）严格限定在处理接口文件本身，pipeline/normalize/add-item/persistence/
UI 均可用交叉证据证明未被触碰。灰度反例通过真实生产 UI 端到端验证生效，非仅调用内部函数的抄近路。

## 4. 抽查上传物件是否走内置 14 件同一条链路（防止另起平行逻辑）

- `src/components/Canvas.tsx` 第 507 行：`const item = state.items.find((i) => i.id === p.itemId);`
  ——渲染循环里物件目录统一从 `state.items`（双源）解析，无 `item.source` 分支判断；两处手势起手
  （`onItemPointerDown` 第242行、`onScalePointerDown` 第288行）同样统一 `state.items.find(...)` 取
  宽高比，无用户件特殊路径。
- `src/components/ItemTray.tsx` 第158行：`{items.map((item) => (...))}` ——dock 缩略卡单一 map
  渲染全部 `items`（含内置+用户），无 source 分支；拖拽手势 `onPointerDown/Move/Up`（第73-134行）对
  所有 item 一视同仁。
- `src/components/Workbench.tsx` 第62/97/98/101行：`onPlaceItem`→`dispatch({type:'place-item',itemId})`、
  `onDropItemAt`→同一 `place-item` action（仅多传 x/y）、`onAddItem`→`dispatch({type:'add-item',...})`
  ——用户件拖入画布走的 `place-item` 与内置件完全同一 dispatch 调用，无并行链路。
- `src/state/gallery.ts` 的 `place-item` reducer case（第128-152行）：
  `if (!state.items.some((i) => i.id === action.itemId)) return state;`——校验逻辑同样不区分
  source，用户件与内置件共用同一段 reducer 代码。
- 唯一新增的 `hydrate-item-image` case（第254-271行）是本 sprint 为解决"刷新后用户件图片位为空"
  新增的独立分支，职责单一（只回填三个图位），**不影响** place-item/add-item/故事/变换等既有链路，
  且不设编辑模式守卫的理由（"hydrate 与用户意图无关"）经读代码确认合理、无副作用（拒绝空图源/
  不存在的目标 item id）。
- `src/App.tsx` 第29-55行的 hydrate useEffect：挂载时一次性从 `loadState()` 读回的 items 里筛
  `source==='user' && imageRef && !imageSrc` 的件，经 `getImageObjectURL`（`src/storage/imageStore.ts`
  第92-94行，U1-S2 就已备好、注释明确写"渲染链接入属 U2/U3，本期先备好口子"）取回 object URL 回填。
  `cancelled` 守卫应对 React StrictMode 双调用、失败静默跳过不误报存储错误——读代码确认逻辑自洽。

**结论：用户上传物件与内置 14 件共享同一套 place-item / add-item / 渲染 / 变换 / 故事 reducer 与组件
代码路径，没有另起平行逻辑；新增的 hydrate 分支是刷新持久化链路上必要的补环，职责边界清晰、不影响
既有链路。**

## 5. 越界检查

对照【验收硬指标】原文，未拿标准之外的个人偏好（如代码风格、`getItemAssetById` 现已无处引用变成
死代码但不影响构建/功能）作为打回依据——`noUnusedLocals` 只管未使用的局部变量/导入，未使用的具名
导出不影响 `npm run build`（已验证 exit 0），且不在本 sprint【验收硬指标】范围内，不作为问题追究。

## 结论

对照 milestones.json U2 三条 criteria 与 success.json 对应条目逐条亲手核查（命令重跑、源码交叉比对、
历史基线独立核实、链路抽查），未发现「标准没达到」的问题。**放行（pass）**。
