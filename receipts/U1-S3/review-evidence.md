# U1-S3 评审证据（reviewer）

## 评审对象
建造员回执：`e2e/u1-foundation.spec.ts`、`receipts/U1-S3/receipt-builder.md`。
对照标准：`.opc/phase1/milestones.json` id="U1" criteria[1] 原文——
「双源目录与 v4 持久化 e2e：注入一件用户物件，刷新后它仍在（不被 reconcileItems 丢弃）；内置 14 件仍对齐清单；预置 v3 旧数据启动不崩、按作废重置；图片二进制落在 IndexedDB，LocalStorage 里查不到图片二进制或 base64。」

## 逐条核查

### 1. 通读 e2e/u1-foundation.spec.ts，逐 test 对四点原文核对
文件含 4 个 `test()`，逐一对应：
- **test①**（行 65 起）：`seedState` 写入 `schemaVersion:4`、`items:[{id:'user-friend-photo-1', source:'user', ...}]`（id 不在 manifest 清单里）→ `page.reload()` → 断言 `[data-testid="tray-item"][data-item-id="user-friend-photo-1"]` count=1、`img.itm` src 为注入的 data URL、`item-name` 文本正确、dock 总数=14+1、状态树 `items` 里该 id 仍在、`schemaVersion===4`、无 pageerror/console.error。覆盖点①「用户物件不被 reconcileItems 丢弃」，且验证了 dock 渲染与状态树两层，不是空壳断言。
- **test②**（行124起）：`seedState` 写 `items:[]`（故意清空）→ reload → 逐一断言 `BUILTINS`（14 件，id+name 取自 `src/assets/manifest.ts` 的 ITEMS）每件在 dock 出现 1 次且名字对齐、dock 恰 14 件、状态树 `items` 的 id 顺序与清单顺序一致、`schemaVersion===4`。覆盖点②「内置 14 件仍对齐清单」，且用「持久化里一件都没写」这种更硬的边界（不是简单验证默认态，而是验证 reconcile 真的会从清单补齐）。
- **test③**（行169起）：`seedState` 写 `schemaVersion:3` 且场景名/物件故事/陈列室名/`sceneId='scene-old'`/`imageSrc='stale-url'` 均植入可辨识标记串 → reload → 断言 app 可见（不崩）、无 pageerror/console.error、`scene-chip`=0、`placement`=0、`tray-item`=14；`expect.poll` 等落盘后状态树 `schemaVersion===4`、`scenes`/`placements` 为空、`activeSceneId===null`、`galleryName` 不等于注入的 v3 名、`bedroom-1.story===''`；**并且**读取 LocalStorage **原始字符串**（非 JSON.parse 后的对象）逐一断言不包含 v3 场景名/故事/陈列室名/`scene-old`/`stale-url` 五个标记串。覆盖点③「预置 v3 旧数据启动不崩、按作废重置且不读出 v3 数据本身」——最后这条原始字符串比对正是「不得读出 v3 旧数据本身」的硬断言（见下方第 6 条单独核查）。
- **test④**（行237起）：`seedState` 写入含内联 `data:image/png;base64,...` 图片的用户物件 → reload → `expect.poll` 等异步落盘、断言 LocalStorage 原始串不含 base64 体、不含 `data:image`；状态树该件 `imageRef==='img-user-photo-1'`、三个图片位（`imageSrc`/`originalImageSrc`/`displayImageSrc`）均为 `''`；**并且**用 `page.evaluate` 直接开 `indexedDB.open('memories.images')`、事务读 `images` store 里 key=`img-user-photo-1` 的记录，断言取回是非空 Blob（`size>0`）。覆盖点④「图片二进制落 IndexedDB、LocalStorage 查不到二进制/base64」，且是真的打开 IndexedDB 验证二进制存在，不是只信状态树字段。

结论：四个 test 与 criteria[1] 四点逐一对应，断言覆盖 UI（dock）+ 状态树 + 底层存储（LocalStorage 原始串 / IndexedDB）三层，非空壳。

### 2. 亲手跑 `npx playwright test e2e/u1-foundation.spec.ts --reporter=line`
```
Running 4 tests using 1 worker
[1/4] ① 注入不在内置清单里的 user Item... 
[2/4] ② 内置 14 件仍与 manifest 对齐...
[3/4] ③ 预置 schemaVersion=3 旧数据启动...
[4/4] ④ 图片二进制写进 IndexedDB...
  4 passed (1.6s)
EXIT_CODE=0
```
与建造员自检一致（4 passed，exit 0）。

### 3. 核查是否改动了已过评审的实现代码
本项目无 git 仓库（`git status` 报 `fatal: not a git repository`），改用文件修改时间比对。
- `.opc/sprints/U1-S3.json`（本 sprint 派工文件）mtime = `Jul 17 20:16:24 2026`，可作为「本 sprint 开工时刻」的参照锚点。
- 核心实现文件 mtime 全部早于该锚点（均为此前 U1-S1/U1-S2 sprint 遗留，非本轮改动）：
  - `src/storage/persistence.ts` → `19:34:04`
  - `src/storage/imageStore.ts` → `19:32:50`
  - `src/model/types.ts` → `19:33:04`
  - `src/assets/manifest.ts` → 前一天 `Jul 16 22:55:54`
  - `src/App.tsx` → `19:49:22`
  - `src/components/ItemTray.tsx` → `Jul 17 06:42:52`（更早）
- 用 `find src e2e scripts -type f -newer .opc/sprints/U1-S3.json` 扫描本 sprint 开工后被改动/新建的文件，唯一命中：`e2e/u1-foundation.spec.ts`（mtime `20:26:42`）。`receipts/U1-S3/receipt-builder.md`（mtime `20:31:33`）是回执本身，不算实现代码。
- 通读 `persistence.ts`/`imageStore.ts` 全文，内容与 receipt-builder.md 描述及 U1-S3.json「实现锚点」一致（`SCHEMA_VERSION=4`、`reconcileItems` 双源保留逻辑、`splitImages`/`saveState` 搬运二进制逻辑、`STORAGE_KEY='memories.gallery'`、`memories.images`/`images` store 命名），未见新增/篡改痕迹。

结论：本 sprint 期间 `src/`、`scripts/` 下无任何文件被改动，`e2e/` 下唯一新增文件即声明的 `u1-foundation.spec.ts`。建造员未越界改动已过评审实现代码。

### 4. 亲手跑 `npm run build`
```
> tsc -b && vite build
✓ 58 modules transformed.
✓ built in 322ms
BUILD_EXIT=0
```
exit 0，无类型错误。

### 5. 亲手跑全量 `npx playwright test --reporter=line` 并核对「9 个既有失败」是否同一批
- **加上新文件**（现状）：`33 passed / 9 failed`，exit 1。失败清单：
  `m2-transform.spec.ts:84`、`m2-transform.spec.ts:199`、`m3-story.spec.ts:110`、
  `m4-full.spec.ts:412`×3（PC/768px/375px 三视口）、
  `n1-foundation.spec.ts:98`、`n1-foundation.spec.ts:152`、`n1-foundation.spec.ts:196`。
- 为独立验证「非本次改动引入」，**亲手把 `e2e/u1-foundation.spec.ts` 移出**（非建造员操作，评审自己动手复现）到 scratchpad 暂存，再跑一次全量：**基线（无新文件）：`29 passed / 9 failed`**，exit 1，失败清单与上面完全一致（用 `diff` 逐行比对两次失败列表，结果 `IDENTICAL FAILURE SETS`）。
- 随后把文件移回 `e2e/u1-foundation.spec.ts`，恢复原状。
- 抽查两个失败样例佐证「非新文件引入」的合理性：`n1-foundation.spec.ts:115` 断言 `stored.schemaVersion===2`，但当前 `SCHEMA_VERSION` 已升到 4（`persistence.ts:31`）——这是 N1 旧规格断言未随 schema 版本演进更新，属既有历史欠账，与 u1-foundation.spec.ts 的新增内容无关联、无重叠断言对象。

结论：净增 4 个通过（新文件 4 个 test 全绿），0 个新增失败，9 个失败在「加文件」与「不加文件」两次全量跑中逐条一致，独立复现确认了建造员的取证结论，非空口自述。

### 6. 核查点③「不得读出 v3 旧数据本身」断言是否够硬
读 `e2e/u1-foundation.spec.ts` 第 220-227 行（test③ 尾部）：
```js
const raw = await readRaw(page);
expect(raw).not.toContain(V3_SCENE_NAME);
expect(raw).not.toContain(V3_STORY);
expect(raw).not.toContain(V3_GALLERY_NAME);
expect(raw).not.toContain('scene-old');
expect(raw).not.toContain('stale-url');
```
其中 `readRaw` 定义为：
```js
async function readRaw(page: Page): Promise<string> {
  return page.evaluate((k) => localStorage.getItem(k) || '', STORAGE_KEY);
}
```
即直接取 `localStorage.getItem` 的**原始字符串**（未经 `JSON.parse`），对五个 v3 特征标记串（场景名/故事文本/陈列室名/场景 id/图片 url）做子串排除检查。这不是只查状态对象的字段值（例如只判断 `stored.scenes.length===0`），而是对整个持久化层的原始序列化内容做穷举式子串扫描——即便实现方式是「v3 数据被解析后仍以某种旁路字段挂在别处」，只要该标记串以任何形式残留在 LocalStorage 原始内容里，断言就会失败。相比之下前半部分的 `stored.scenes`/`stored.placements`/`activeSceneId` 字段检查只是「行为层」验证（重置到初始态），而这五行 `raw.not.toContain` 才是「数据不残留」的硬指标，两者都在，缺一不可的验收点被同时覆盖。

结论：该断言足够硬，不是浮于表面的状态检查。

## 总裁决
四条断言真实覆盖 criteria[1] 四点、亲手跑通 4 passed/exit 0、亲手确认无实现代码改动、亲手跑通 build exit 0、亲手独立复现全量套件 33p/9f 与基线 29p/9f 失败集合完全一致（0 新增失败）、点③断言核实足够硬。未挑出问题。

**判定：通过（pass）。**
