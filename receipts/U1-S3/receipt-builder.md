# U1-S3 建造回执（builder）

## Sprint 目标
补齐里程碑 U1 验收标准点名却始终缺失的 e2e 文件 `e2e/u1-foundation.spec.ts`。
不改动任何已过评审的实现代码（reconcileItems、imageStore、persistence 的 schema v4 与 saveState 报错冒泡都已到位），
只新建这一个测试文件，把 milestones.json U1 criteria[1] 四点一次性落成可跑通的 Playwright 断言。

## 交付物
- `e2e/u1-foundation.spec.ts`（唯一新建文件；4 个 test 块，逐条对应验收四点）
- 本回执 `receipts/U1-S3/receipt-builder.md`

## 开工必读档案（均读到原文，未凭猜）
1. `/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/builder.md` —— 岗位职责与红线（Off-limits：不自判通过、成品不进 .opc/、不改已过评审实现）
2. `/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/build-deliverable.md` —— 建造技能（按验收倒推、交检前自检）
3. `/Users/yuriiiz/Projects/Memories/.opc/phase1/milestones.json` id="U1" criteria[1] 原文（双源目录与 v4 持久化 e2e 四点）
4. `/Users/yuriiiz/Projects/Memories/.opc/sprints/U1-S3.json` —— 本 sprint goal（四点验收硬指标已抄入）

## 实现锚点（只读、未改）
- `src/storage/persistence.ts`：`STORAGE_KEY='memories.gallery'`、`SCHEMA_VERSION=4`；
  `loadState` 遇 `schemaVersion !== 4` → `createInitialState()`（作废重置、不迁移）；
  `reconcileItems` 内置 14 件对齐 manifest 补齐、用户物件（id 不在清单）原样保留；
  `splitImages`/`saveState` 把内联 `data:` 二进制搬进 IndexedDB（键 `imageRef=`img-<id>``），LocalStorage 图片位清空为 `''`。
- `src/storage/imageStore.ts`：库名 `memories.images`、store `images`、显式 key。
- `src/assets/manifest.ts`：14 件内置物件 id + name（bedroom-1..6 / living-1..8），测试里逐件对齐。
- `src/components/ItemTray.tsx`：`[data-testid="tray-item"][data-item-id]`、`img.itm`、`[data-testid="item-name"]`。
- `src/App.tsx`：`useReducer(…, loadState)` + 挂载即 `saveState`（`useEffect([state])`），故 v3 载荷会被 v4 初始态覆盖。

## 参照来源
- 点①②：`e2e/u1-s1-dualsource.spec.ts` 的注入与 dock 断言写法。
- 点④：`e2e/u1-storage-error.spec.ts` 第②个 test 的注入与 IndexedDB 核验写法。
- 点③：无直接参照，自写；结构参照 `e2e/n1-foundation.spec.ts` ②（旧版本作废重置）的思路，但版本改为 v3、目标版本改为 v4，并新增「v3 标记串不复现」的硬断言。

## 逐条自检（对照 criteria[1] 四点）
- **① 用户物件存活**（test 位于文件 `① …`）：注入一件 `source='user'`、id=`user-friend-photo-1`（不在 manifest）的 v4 物件 → reload →
  断言 dock 出现该件（count 1）、`img.itm` src 为注入 data URL、`item-name` 为「朋友的照片」、dock 总数=14+1；状态树里该件仍在、schema=4；无 pageerror/console.error。✅
- **② 内置 14 件对齐清单**：预置 v4 状态 `items:[]`（一件都不写）→ reload →
  逐件断言 14 个内置 id 各出现 1 次且 dock 名字对齐 manifest；dock 恰 14 件；状态树 items 顺序等于清单 id 顺序；schema=4；无错误。✅
- **③ v3 旧数据作废重置**：预置 `schemaVersion=3` 状态（含标记场景名/故事/陈列室名/摆放）→ reload →
  页面正常渲染、无 pageerror/console.error；scene-chip=0、placement=0、tray-item=14；轮询等落盘后 schema=4、scenes/placements 空、activeSceneId=null、galleryName 非 v3 名、bedroom-1 story 为空；
  原始 LocalStorage 串里查不到任何 v3 标记（场景名/故事/陈列室名/`scene-old`/`stale-url`）——即「不得读出 v3 旧数据本身」。✅
- **④ 图片二进制入 IndexedDB、LS 查不到 base64**：预置 v4 状态含带内联 `data:` base64 图的用户物件 → reload →
  轮询等 saveState 异步落盘完成；断言 LocalStorage 原始串不含 base64 体、不含 `data:image`；状态树该件 imageRef=`img-user-photo-1`、三个图片位均为 `''`、schema=4；
  IndexedDB `memories.images` 库键 `img-user-photo-1` 取回非空 Blob（size>0）；无 pageerror。✅

## 跑的命令与关键输出
1. `npx playwright test e2e/u1-foundation.spec.ts --reporter=line`
   - 结果：`4 passed`，`PLAYWRIGHT_EXIT=0`（四条断言全绿）。
2. `npm run build`
   - 结果：`✓ built in 327ms`，`BUILD_EXIT=0`（tsc -b + vite build 均通过，新文件未引入类型错误）。
3. `npx playwright test --reporter=line`（全量套件回归）
   - 结果：`33 passed / 9 failed`，`FULL_EXIT=1`。
   - 9 个失败：m2-transform（2）、m3-story（1）、m4-full（3 视口）、n1-foundation（3）。

## 关于全量套件那 9 个失败——非本次改动引入（已取证）
为排除「我的新文件是否破坏旧套件」，把 `e2e/u1-foundation.spec.ts` 临时移出后跑基线：
- **基线（无我的文件）：`29 passed / 9 failed`**，失败清单与上面 9 个完全一致。
- **加上我的文件：`33 passed / 9 failed`**（同样 9 个失败 + 我的 4 个新增全绿）。
即我的改动净增 4 个通过用例、0 个新增失败。

这 9 个失败属旧里程碑 e2e 随 schema/DNA 演进而失效的既有欠账，与本 sprint 无关，且明确在我职责红线之外：
- 典型例：`n1-foundation.spec.ts` ② 断言 `stored.schemaVersion === 2`，而当前 `SCHEMA_VERSION` 已升到 4，该断言注定失败——这是 N1 旧规格未随存储换血更新所致，非我引入。
- m2/m3/m4/n1 这些文件在字母序上都排在 `u1-foundation` 之前、且每个 test 用独立 BrowserContext（localStorage/IndexedDB 隔离），我的新文件在物理上无法影响它们。
- 岗位红线：本 sprint 只许新建 `u1-foundation.spec.ts`，不许改任何已过评审实现代码，也不在派工范围内修其它旧测试文件。故不动这 9 个既有失败。

## 结论
四条断言全绿（exit 0）、build 绿（exit 0）、全量套件无「新增」回归失败（既有 9 个失败为改动前已存在的历史欠账，已用基线对比取证）。
成品是否通过由评审员对照验收标准裁决，本岗做完即交、不自判通过。
