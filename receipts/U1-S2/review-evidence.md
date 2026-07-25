# U1-S2 评审证据

- sprint：`U1-S2`（里程碑 U1：数据与存储地基 · 三版第二块 —— 存储换血与终结静默失败）
- 岗位：general 队 · 评审员
- 唯一契约来源：`/Users/yuriiiz/Projects/Memories/.opc/sprints/U1-S2.json` 的 `goal` 字段（下称【验收硬指标】）。
- 核查方式：亲手跑命令、亲读代码、并对建造员自己写的 e2e 断言逐句复核，另外独立补写验证脚本穿刺
  建造员测试没覆盖的分支（IndexedDB 写入失败、v1/v2/v3 三种旧版数据）——不采信自报数字。

## 一、开工必读档案（全部读完）

1. `/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/reviewer.md` ✅
2. `/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/review-against-criteria.md` ✅
3. `/Users/yuriiiz/Projects/Memories/.opc/sprints/U1-S2.json`（goal 字段）✅
4. `/Users/yuriiiz/Projects/Memories/receipts/U1-S2/receipt-builder.md`（建造员过程记录，仅供了解自称，未采信）✅
5. 代码：`src/storage/imageStore.ts`（新）、`src/storage/persistence.ts`、`src/model/types.ts`、`src/App.tsx`、
   `src/App.css`、`e2e/u1-storage-error.spec.ts`（新）、`e2e/u1-s1-dualsource.spec.ts`、`e2e/n4-full.spec.ts` ✅
6. 交叉参考 `/Users/yuriiiz/Projects/Memories/receipts/U1-S1/review-evidence.md`（U1-S1 评审基线，用于核对
   全量回归 9 条失败是否为既有基线红而非本 sprint 引入）✅

无 BLOCKED，全部档案可读、已通读。

## 二、【验收硬指标】拆条（原文出自 U1-S2.json goal 字段）

> 照片二进制（Blob）存 IndexedDB，状态树仍走 LocalStorage 但只存引用、不存图；存储 schema 升 v4，
> 旧版数据照旧不迁移、作废重置、应用不崩；终结 saveState 的静默失败（现为空 catch）——写入失败必须
> 能被上层捕获并冒泡，不再无声吞掉数据。criteria：人为让存储写入失败（配额超限/隐私模式），错误能
> 冒泡到上层并被界面感知，不出现「提示成功、刷新就没」的静默丢失。验收：①人为让底层写入抛错时
> saveState 的调用方能感知失败并触发 UI 提示；②图片二进制写入 IndexedDB 后 LocalStorage 序列化内容
> 里查不到该图片的二进制或 base64；③npm run build 须 exit 0。

拆成四条逐条核查：

| # | 硬指标 | 核查方式 | 结论 |
|---|---|---|---|
| ① | saveState 静默失败终结：写入失败能感知并触发 UI 提示 | 亲跑 e2e + 独立补写 IndexedDB 失败场景穿刺 + 亲读代码 | 过 |
| ② | 图片二进制入 IndexedDB，LocalStorage 里查不到二进制/base64 | 亲跑 e2e（含独立 raw IndexedDB 读取）+ 亲读代码 | 过 |
| ③ | SCHEMA_VERSION 升 v4，旧版（v1-v3）不迁移、作废重置、不崩 | 独立编写验证脚本覆盖 v1/v2/v3 三种旧数据 + 亲读代码 | 过 |
| ④ | npm run build exit 0 | 亲自执行命令 | 过 |

## 三、逐条核查证据

### ① 终结 saveState 静默失败

**亲读代码**（`src/storage/persistence.ts` 195-223 行）：`writeLocalStorage` 把 `localStorage.setItem`
的异常包成 `StorageError('local-storage', ...)` 抛出；`putImages`（177-192 行）把 `putImage` 失败包成
`StorageError('indexed-db', ...)` 抛出；`saveState`（214-223 行）是 async 函数，任一层失败都会
reject 冒泡，没有任何空 catch 吞掉。`src/App.tsx` 25-28 行：`saveState(state).catch(err => setSaveError(...))`
——只在失败时 setState 弹 `.save-error` 提示浮层（`App.tsx` 38-66 行，含文案 + 「知道了」按钮，
`role="alert" aria-live="assertive"`）。

**亲跑建造员的焦点 e2e**（`e2e/u1-storage-error.spec.ts` 测试①，劫持 `Storage.prototype.setItem`
对 `memories.gallery` 键抛 `QuotaExceededError`）：

```
$ npx playwright test e2e/u1-storage-error.spec.ts --reporter=list
  ✓ ① 存储写入失败不再静默：setItem 抛错时冒泡到上层、界面弹明确提示，应用不崩 (189ms)
  ✓ ② 内联图片落盘：二进制写进 IndexedDB，LocalStorage 里查不到该图的 base64（只留 imageRef） (125ms)
2 passed (1.4s)
```

亲读该测试断言（非只看 pass/fail）：断言 `save-error` 可见、文案含"没能保存"、`localStorage.getItem` 
读回 `''`（不是假成功——写入被拒确实没有任何数据落地）、关闭提示后再触发一次落盘（切游客模式）提示
复现、全程 `pageerror` 为空。断言链条完整、非同义反复。

**独立穿刺（建造员测试未覆盖的分支）**：criteria 原文点名"配额超限/隐私模式"，但 goal 正文同样点名
"IndexedDB 写失败"要冒泡——`u1-storage-error.spec.ts` 只测了 LocalStorage 层失败，没测 IndexedDB 写
失败是否也会冒泡到界面。本人独立编写一次性验证脚本（跑后已删除，未留痕于 `e2e/`）：劫持
`IDBObjectStore.prototype.put` 使其异步转为 `onerror`，预置一件带 `data:` 内联图片的用户物件触发
`saveState` 走 IndexedDB 分支：

```
$ npx playwright test e2e/zz-review-verify-idb-fail.spec.ts --reporter=list
IDB_FAIL_MSG: 图片没能存入本地数据库，改动可能未保存，请重试。
  ✓ IndexedDB put 失败时，saveState 应冒泡并弹出提示 (179ms)
1 passed (1.3s)
```

确认 IndexedDB 写入失败同样正确冒泡为 `StorageError('indexed-db', ...)` 并弹出界面提示，不静默。

**判定：① 过。**

### ② 图片二进制入 IndexedDB、LocalStorage 查不到二进制/base64

**亲读代码**：`splitImages`（`persistence.ts` 150-174 行）序列化前把内联图片（`data:`/`blob:`）从
状态树剥离——`data:` 解码成 Blob 收集进 `images`（键 = `imageRef` 或 `img-<id>`），对应 Item 图片位
清空为 `''`，只留 `imageRef`。`imageStore.ts` 的 `putImage`（67-69 行）用显式 key 把 Blob 存入
IndexedDB `memories.images` 库。

**亲跑 e2e**（同上，测试②）并亲读其断言：预置一份含 `data:` base64 图片的用户物件、刷新、轮询等
落盘完成后断言：
- `localStorage` 原始字符串里 `not.toContain(PNG_BASE64_BODY)` 且 `not.toContain('data:image')`——
  不是只查字段是否为空，是对整段序列化字符串做子串检索，覆盖任何字段藏 base64 的可能。
- 状态树里该 Item 的 `imageRef === 'img-user-photo-1'`、`imageSrc/originalImageSrc/displayImageSrc` 
  全部为 `''`。
- 用独立的原生 `indexedDB.open` API（不复用 `imageStore.ts` 的函数，避免"自己测自己"）直接读
  `memories.images` 库、键 `img-user-photo-1`，断言取回的 Blob `size > 0`。

```
✓ ② 内联图片落盘：二进制写进 IndexedDB，LocalStorage 里查不到该图的 base64（只留 imageRef） (125ms)
```

**判定：② 过。**

### ③ SCHEMA_VERSION 升 v4，旧版（v1–v3）不迁移、作废重置、不崩

**亲读代码**：`persistence.ts` 31 行 `export const SCHEMA_VERSION = 4;`；`loadState`
104-108 行：`if (parsed.schemaVersion !== SCHEMA_VERSION) return createInitialState();`——
这是既有的作废重置路径（N2 时代就有，本 sprint 未改动其结构，只是比较值变成 4），天然覆盖 v1/v2/v3。
`grep` 确认 `src/` 内 `SCHEMA_VERSION` 只有这一处常量定义、无处硬编码旁路旧版本号。

**独立验证**（不满足于读旧测试里过时的 `===2` 断言，自己造三种版本的旧数据实测）：编写一次性脚本
（跑后已删除，未留痕）分别预置 `schemaVersion: 1/2/3` 且带旧字段（`scenes`/`placements`/`items` 内容
故意不合 v4 形态）的 LocalStorage 数据，刷新后断言应用不崩（`pageerror` 为空）、落盘后状态重置为
`schemaVersion: 4`、`scenes`/`placements` 清空为 `[]`：

```
$ npx playwright test e2e/zz-review-verify-schema-reset.spec.ts --reporter=list
  ✓ v1 旧数据启动不崩、作废重置为 v4 (147ms)
  ✓ v2 旧数据启动不崩、作废重置为 v4 (121ms)
  ✓ v3 旧数据启动不崩、作废重置为 v4 (111ms)
3 passed (1.5s)
```

三种旧版本均确认：不迁移、作废重置、应用不崩。

**旁证**：建造员称同步升级了 `e2e/u1-s1-dualsource.spec.ts`、`e2e/n4-full.spec.ts` 两处会被 v4 打破的
夹具。亲读确认：`u1-s1-dualsource.spec.ts:53` 预置 `schemaVersion: 4`、`:101` 断言 `toBe(4)`；
`n4-full.spec.ts:373` 断言 `toBe(4)`（注释标注"U1-S2 升 v4"）。属实。

**判定：③ 过。**

### ④ npm run build exit 0

亲自执行（清空 `dist/` 后重跑，非借用缓存假象）：

```
$ rm -rf dist && npm run build
> memories@0.1.0 build
> tsc -b && vite build
...
✓ 58 modules transformed.
✓ built in 355ms
EXIT_CODE=0
```

亲读 `tsconfig.app.json` 确认 `"strict": true`、`"erasableSyntaxOnly": true` 均为真实生效配置
（非误报空转）——`tsc -b` 确实做了严格类型检查。亲读 `StorageError` 类定义（`persistence.ts` 40-47 行）
确认用显式字段声明（`readonly kind: StorageErrorKind`）+ 普通赋值，未用参数属性简写，符合
`erasableSyntaxOnly` 的限制，与建造员自述一致。

**判定：④ 过。**

## 四、全量回归交叉核验（旁证：未越界破坏既有能力）

亲自跑全量（非借用建造员自报数字）：

```
$ npx playwright test --reporter=list
29 passed (1.5m)
9 failed:
  m2-transform.spec.ts ×2
  m3-story.spec.ts ×1
  m4-full.spec.ts ×3
  n1-foundation.spec.ts ×3
```

亲读失败用例源码：均硬编码 `schemaVersion===2`（v2 时代遗留断言）或 drag/scale 相关既有断言，与本
sprint 改动（IndexedDB/v4/saveState 错误冒泡）无关联。

**交叉核对 U1-S1 评审基线**（`receipts/U1-S1/review-evidence.md` 第 118-144 行）：U1-S1 评审时同一批
9 条失败（`m2-transform×2`/`m3-story×1`/`m4-full×3`/`n1-foundation×3`）已存在，当时 27 passed；本次
29 passed（+2 = 本 sprint 新增的 `u1-storage-error ①②`）。**失败集合逐条比对完全一致、零新增失败、
零回归**，证明本 sprint 改动未越界破坏既有能力。

另外独立重复跑 `m1-shell.spec.ts`（`--repeat-each=3`，共 9 次）核实建造员自述"曾被本轮改动破、已修复"
的 `m1-shell:34`：

```
$ npx playwright test e2e/m1-shell.spec.ts --repeat-each=3 --reporter=list
9 passed (4.7s)
```

9/9 稳定通过，未见 flaky，建造员的回归修复属实有效。

## 五、观察项（不构成打回理由，供后续 sprint 参考）

1. `splitImages`（`persistence.ts` 160-166 行）内 `dataURLToBlob` 解码失败时静默 catch——不搬二进制、
   但仍把该内联字段清空为 `''`，无 reject、无提示。这在理论上是一个新的"数据悄悄消失"点，但：
   (a) 触发条件是 `data:` URL 本身格式损坏（非本 sprint 契约点名的"存储介质写入失败/配额超限/隐私
   模式"类别）；(b) 本 sprint 尚无上传 UI，该分支当前不可达（留给 U2/U3 接入真实上传后才有意义）。
   不属于【验收硬指标】覆盖范围，仅记录，不作为本次打回依据。
2. `clearState`（`persistence.ts` 226-233 行）仍有空 catch，但 `grep` 确认全仓无任何调用点（死代码），
   不在 saveState 写入路径上，不影响本 sprint 硬指标。

## 六、结论

【验收硬指标】四条逐条亲手核查（读代码 + 独立跑命令/独立编写穿刺脚本，不采信建造员自报），
**四条全过**：① saveState 静默失败终结（含建造员测试未覆盖的 IndexedDB 失败分支，本人独立补验通过）；
② 图片二进制确认进 IndexedDB、LocalStorage 序列化内容确认查不到二进制/base64；③ SCHEMA_VERSION=4，
v1/v2/v3 三种旧版本均独立验证不迁移、作废重置、不崩；④ `npm run build` exit 0（严格类型检查真实生效）。
全量回归交叉核对 U1-S1 基线，确认零新增失败、零回归。

**结论：pass。放行定稿。**

理由：四项硬指标均亲核通过且有独立证据支撑（不止于跑建造员自己写的测试，还补写了两处穿刺验证
覆盖其测试盲区），未发现缺失、错误或不达标项；观察项均为标准之外的健壮性建议，不构成打回依据。

## 七、边界

- 未碰 `.opc/` 目录下任何文件（只读 sprint goal）。
- 未对成品做任何代改；本次临时补写的两份验证脚本（`zz-review-verify-idb-fail.spec.ts`、
  `zz-review-verify-schema-reset.spec.ts`）仅用于评审穿刺，跑完已从 `e2e/` 删除，未留痕、未混入交付物。
- 落账动作（write review-evidence / advance sprint）由主控代跑，本岗不直接调用 opc.mjs。
