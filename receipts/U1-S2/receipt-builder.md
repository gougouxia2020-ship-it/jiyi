# U1-S2 建造员过程记录

- sprint：`U1-S2`（里程碑 U1：数据与存储地基 · 三版第二块 —— 存储换血与终结静默失败）
- 岗位：general 队 · 建造员
- 契约（本 sprint 这一块）：
  1. 新增图片二进制存取模块（`src/storage/imageStore.ts`），照片 Blob 存 IndexedDB；
  2. GalleryState/LocalStorage 里 Item 图片字段只存引用（id + 元信息），不再把二进制/base64 塞进 LocalStorage；
  3. `SCHEMA_VERSION` 3 → 4，loadState 遇旧版（v1–v3）不迁移、作废重置、应用不崩；
  4. 终结 `saveState` 第 106 行的空 catch 静默失败——写入失败必须能被上层捕获并冒泡，调用处感知失败并在界面给出明确提示。

## 一、开工必读档案（全部读到）

1. 岗位职责与红线：`/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/builder.md` ✅
2. 技能手册：`/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/build-deliverable.md` ✅
3. 本 sprint goal 与【验收硬指标】：`/Users/yuriiiz/Projects/Memories/.opc/sprints/U1-S2.json` 的 goal 字段 ✅（唯一契约来源）
4. 代码现状：`src/storage/persistence.ts`、`src/state/gallery.ts`、`src/model/types.ts` ✅；
   另读 `src/App.tsx`（saveState 调用处）、`src/components/{Workbench,ItemTray,StoryModal,Canvas,SceneBar,Header}.tsx`、
   `src/App.css`、`src/styles/tokens.css`、既有 e2e（`u1-s1-dualsource` / `n4-full` / `m1-shell` 等）以摸清消费点与测试基线。
- 未改动 `.opc/` 下任何文件（只读 goal）。

## 二、验收硬指标 → 自检清单（逐条对照）

sprint goal【验收硬指标】拆条自检（criteria 对应 `u1-storage-error.spec.ts`）：

| # | 硬指标（原文摘要） | 我怎么做的 | 自检结果 |
|---|---|---|---|
| ① | 终结 saveState 静默失败：人为让底层写入抛错（配额超限/隐私模式）时，saveState 的调用方能感知失败并触发 UI 提示，不出现「提示成功、刷新就没」的静默丢失 | 删掉 `saveState` 的空 catch：`writeLocalStorage` 把 `localStorage.setItem` 的异常包成 `StorageError` 抛出、经异步 `saveState` reject 冒泡；`App.tsx` 的落盘 effect `.catch` 到后 setState 弹明确提示浮层（`.save-error`，含文案 + 「知道了」）。新增 `e2e/u1-storage-error.spec.ts ①`：`addInitScript` 劫持 `Storage.prototype.setItem` 对本应用 key 抛 `QuotaExceededError` → 断言应用不崩、提示浮现、LocalStorage 里确实没写进状态（不是假成功）、关闭后再触发一次落盘提示复现、全程无未捕获错误 | ✅ 过（`u1-storage-error ①` passed；提示可见、raw==''、复现成功、无 pageerror） |
| ② | 照片二进制入 IndexedDB；图片二进制写入 IndexedDB 后，LocalStorage 序列化内容里查不到该图片的二进制或 base64（只存引用） | 新增 `imageStore.ts`（IndexedDB Blob 存取）；`persistence.splitImages` 在序列化前把内联图片（`data:`/`blob:`）从状态树剥离：二进制搬进 IndexedDB（键 = `imageRef`，由 `item.imageRef` 或 `img-<id>` 派生），LocalStorage 载荷里对应 Item 图片位清空（''）、只留 `imageRef` + 元信息。`e2e/u1-storage-error.spec.ts ②`：预置带 `data:` base64 图片的用户物件 → 刷新 → 轮询等落盘完成 → 断言 LocalStorage 里查不到该 base64 体、连 `data:image` 前缀都无、Item 只挂 `imageRef`（图片位空）、且 IndexedDB `memories.images` 库里键 `img-user-photo-1` 取回非空 Blob | ✅ 过（`u1-storage-error ②` passed；LS 无 base64、imageRef 就位、IDB 有 Blob） |
| ③ | 存储 schema 升 v4；旧版（v1–v3）不迁移、作废重置、应用不崩 | `SCHEMA_VERSION` 3 → 4；`loadState` 既有分支 `parsed.schemaVersion !== SCHEMA_VERSION → createInitialState()` 天然覆盖 v1–v3（不迁移、清空重置、不崩）。同步把两处会被 v4 打破的**绿测**夹具升 v4：`u1-s1-dualsource`（seed v3→v4、断言 3→4）、`n4-full`（断言 3→4），使其继续测本职 | ✅ 过（`u1-s1-dualsource`/`n4-full` 仍 passed；`n1-foundation ②` 的 v1 作废重置逻辑不崩，其陈旧 `===2` 断言属既有基线红） |
| ④ | `npm run build` 须 exit 0 | 只用可擦除 TS 语法（`StorageError` 用普通类字段、非参数属性，合 `erasableSyntaxOnly`），`tsc -b && vite build` | ✅ 过（`build exit: 0`，两次：改动中一次 + 收工一次） |

## 三、交付物（路径清单）

- 新增：`/Users/yuriiiz/Projects/Memories/src/storage/imageStore.ts` —— IndexedDB 图片二进制存取模块。
- 改：`/Users/yuriiiz/Projects/Memories/src/storage/persistence.ts` —— v4 + StorageError + splitImages/putImages/writeLocalStorage + 异步 saveState（终结静默失败）。
- 改：`/Users/yuriiiz/Projects/Memories/src/model/types.ts` —— Item 新增可选 `imageRef`（引用键）。
- 改：`/Users/yuriiiz/Projects/Memories/src/App.tsx` —— 捕获 saveState 冒泡失败、弹提示浮层。
- 改：`/Users/yuriiiz/Projects/Memories/src/App.css` —— `.save-error` 提示浮层样式。
- 新增：`/Users/yuriiiz/Projects/Memories/e2e/u1-storage-error.spec.ts` —— 本 sprint 焦点 e2e（criteria ①②）。
- 改：`/Users/yuriiiz/Projects/Memories/e2e/u1-s1-dualsource.spec.ts`、`/Users/yuriiiz/Projects/Memories/e2e/n4-full.spec.ts` —— schema 夹具随 v4 升级（避免绿测被 v4 打破）。
- 过程记录：`/Users/yuriiiz/Projects/Memories/receipts/U1-S2/receipt-builder.md`（本文件）。

## 四、改了哪些、为什么这样改

### 1）`src/storage/imageStore.ts`（新）
IndexedDB（库 `memories.images`、store `images`、显式外部 key）的 Blob 存取：`putImage/getImage/hasImage/deleteImage/getImageObjectURL/dataURLToBlob/isImageStoreAvailable`。单例连接、事务包 Promise、失败一律 reject（不静默）；IndexedDB 不可用时读侧优雅降级返回空、写侧仍冒泡。`getImageObjectURL` 供 U2/U3 渲染层据 `imageRef` hydrate 取图（本期先备口子）。

### 2）`src/storage/persistence.ts`
- `SCHEMA_VERSION = 4`（doc 补 v3→v4：图迁 IndexedDB、状态树只存引用）。
- `StorageError`（kind: `local-storage`/`indexed-db`，message 即面向用户文案）。
- `splitImages`（纯函数）：把内联图片（`data:`/`blob:`）从 LocalStorage 载荷剥离——`data:` 解码成 Blob 收集待搬 IndexedDB，Item 图片位清空、挂 `imageRef`；内置件走打包 URL（本就是引用），原样不动。
- `putImages`：幂等（`hasImage` 去重）把二进制搬进 IndexedDB，写失败包 `StorageError('indexed-db')` 冒泡。
- `writeLocalStorage`：`setItem` 失败包 `StorageError('local-storage')` 冒泡（**终结第 106 行空 catch**）。
- `saveState`（异步）：`splitImages` 后——无内联图片（内置件常路）→ **同步**写 LocalStorage（时序与旧版一致、刷新还原类用例零回归）；有内联图片才先搬 IndexedDB 再写引用树。任一层失败冒泡。

### 3）`src/model/types.ts`
Item 加可选 `imageRef?: string`（IndexedDB 引用键）。内置件无此字段；用户上传件（U2/U3）与本期 splitImages 用它把二进制指向 IndexedDB。

### 4）`src/App.tsx` + `src/App.css`
落盘 effect 改吃异步 `saveState`：**只在 `.catch`（失败）时 setState 弹提示**，成功路径不 setState。`.save-error` 固定顶部居中浮层（陶土红描边 + 警示图标 + 文案 + 「知道了」），压所有浮层之上。

**未触碰**：`src/state/gallery.ts`（reducer 不构造带图新 Item，无需改）、`src/components/*` 渲染消费点（内置件仍走 `item.imageSrc` 打包 URL；用户件据 `imageRef` 取图渲染属 U2/U3）。

## 五、自检执行记录（命令与结果）

- 生产构建：`npm run build`（`tsc -b && vite build`）→ `build exit: 0`、`✓ built in ~340–375ms`、无类型错误（改动中一次 + 收工一次）。
- 本 sprint 焦点 e2e：`npx playwright test e2e/u1-storage-error.spec.ts` → `2 passed`（①②）。
- 受影响/触碰的既有 e2e：`u1-s1-dualsource` / `n4-full`（schema 夹具升 v4）/ `m1-shell` 全部 pass。
- 全量回归：`npx playwright test` → **29 passed / 9 failed（1.5m）**。
  - 新增 2 条焦点 e2e（`u1-storage-error ①②`）均 pass；`m1-shell:34`（曾被本轮改动破，见下「六」）已修复回绿。
  - 9 条 failed **全部为 U1-S1 记录在案的既有基线红、与本 sprint 无关**，同一批 spec 不变：
    `m2-transform`×2、`m3-story`×1、`m4-full`×3、`n1-foundation`×3 —— 均硬编码 `schemaVersion===2` / `data-scale` /
    精确键集 `['id','imageSrc','name','story']`（v2 时代断言，schema 早在 N2 升 v3、本轮再升 v4）。实现是对的、
    失败的是未随版本升级同步的旧断言。**对比 U1-S1 基线（27 passed / 9 failed）：绿测集合无一转红，新增 2 绿。**
  - 其中 `n1-foundation ②`（v1 旧数据启动不崩、作废重置）：作废重置**逻辑仍正确不崩**（v1≠v4 → 回初始空态），
    仅其陈旧的「升为 v2 空态」断言（`===2`）过时——正对应硬指标③「旧版不迁移、作废重置、应用不崩」，逻辑达标。

## 六、m1-shell:34 深挖（重要：避免把绿测改红）

全量回归时发现 `m1-shell.spec.ts:34`（建/切场景→刷新还原）在改动后**确定性失败 6/6**，而 U1-S1 基线里它是绿的。逐层定位：

- **现象**：断言比较「切回客厅后」placement 的 inline `transform` px 与切场景前捕获的 `styleBefore`。得 `translate(153.6px,79.4942px)`（切回后）≠ `translate(229.6px,94.0732px)`（之前）。
- **根因**：px 由「场景图 contain 矩形」换算（见 `Canvas.tsx` `containRect`）——图**未加载完**时回退整块视口（iw=1280 → 153.6），加载后用真实宽高比（iw=1080 → 229.6）。测试在切场景后**未等场景图 onLoad→setSceneAspect 的重渲染**就即时读 px，抓到了过渡态回退值。诊断实验：把该行改为轮询等值稳定 → 3/3 通过，证明**产品还原正确**（存的百分比对，px 会随图加载自愈），是断言即时读值的潜在竞态。
- **是否我引入**：在隔离副本里还原本 sprint 前的 `App.tsx`+`persistence.ts` 跑同一测试 → **原码 6/6 通过**；我的初版 6/6 失败。故我的改动**确定性地把这条潜在竞态点破了**，须修，不能留。
- **定位到具体动作**：逐个变量二分（均在真实测试上跑）——(a) 结构原样 App + 异步 saveState fire-and-forget → 通过；(b) 加 `useState`+Fragment+提示浮层但落盘 fire-and-forget → 通过；(c) 成功路径 `.then(setSaveError(...))`（即便函数式更新原地 bail）→ 失败。结论：**成功路径每次落盘都 setState** 触发的额外重渲染微扰了画布/场景图的加载节奏。
- **修法**：`App.tsx` 改为**仅失败时 setState**（`.catch`），成功路径完全不 setState。复跑 `m1-shell:34` **6/6 通过**；焦点 e2e ①② 仍通过（失败弹提示走 `.catch`，不受影响）。

## 七、边界与交检

- 未自判通过：本岗做完即交，过不过由评审员对照 U1-S2 验收标准裁决（BLOCKED-on-reviewer）。
- 未碰 `.opc/`；未写 `review-evidence.md`（评审员文件）。成品落在项目根合适位置（`src/` 就地改/新增、`e2e/` 加焦点测试并同步 v4 夹具、`receipts/U1-S2/`）。
- 隔离实验副本落在 scratchpad（`.../scratchpad/orig/`），未污染项目。
