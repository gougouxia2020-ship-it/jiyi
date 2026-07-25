# U1-S1 建造员过程记录

- sprint：`U1-S1`（里程碑 U1：数据与存储地基 · 三版第一块）
- 岗位：general 队 · 建造员
- 契约（本 sprint 只做这一块）：Item 数据结构**双源化**（新增 `source` / `aspectRatio` / `originalImageSrc` / `displayImageSrc` 字段）＋ 修掉 `persistence.ts` 的 `reconcileItems` 丢弃用户物件的 bug。
- 明确不越界（属 U1-S2 / 里程碑收口）：图片二进制实际存 IndexedDB、schema 升 v4、终结 `saveState` 静默失败——本 sprint 一律不碰。sprint goal 原话：「本 sprint 只动数据结构与 reconcile 逻辑，imageSrc 仍可指向现有存法过渡」。

## 一、开工必读档案（全部读到）

1. 岗位职责与红线：`/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/builder.md` ✅
2. 技能手册：`/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/build-deliverable.md` ✅
3. 里程碑 U1 goal 与 criteria 原文（`.opc/phase1/milestones.json` 的 `id:"U1"`）：已读全 ✅
   - U1 整体含 IndexedDB / v4 / 存储报错三块；本 sprint 只切其中「数据结构 + reconcile」这一角。
4. 本 sprint goal 与【验收硬指标】（`.opc/sprints/U1-S1.json`）：已读全 ✅
5. 背景参考：`.opc/phase1/idea.json`「U1 · 素材地基开放」段、`src/model/types.ts`、`src/storage/persistence.ts`、`src/assets/manifest.ts` ✅
- 未改动 `.opc/` 下任何文件（只读）。

## 二、验收硬指标 → 自检清单（逐条对照）

sprint goal【验收硬指标】原文拆成三条，逐条自检：

| # | 硬指标 | 我怎么做的 | 自检结果 |
|---|---|---|---|
| ① | 在 loadState 注入一个不在 ITEMS 清单里的 user Item，reconcile 后该 Item **必须仍存在**于返回的 items 数组里 | 改写 `reconcileItems`：内置项按清单对齐，**id 不在内置清单里的持久化物件（用户项）原样保留**、不再丢弃。新增 `e2e/u1-s1-dualsource.spec.ts`：注入一件 `source:'user'`、id 不在清单里的物件，刷新后它出现在 dock（进入 `state.items` 才会渲染 → 证明 reconcile 保留了它） | ✅ 过（e2e 断言 `tray-item[data-item-id="user-friend-photo-1"]` count=1、img.src=注入的 data URL、名字保留） |
| ② | 内置 14 件仍与 manifest.ts 的 ITEMS 对齐 | `createInitialItems` 仍由 `ITEMS.map` 派生 14 件（新增字段对齐 asset：`source:'builtin'`、`aspectRatio=asset.aspectRatio`、原图/展示图/imageSrc 同 `asset.imageSrc`）；reconcile 内置项恒以清单为基准补齐/对齐。e2e 里持久化 items 故意**只写用户物件、一件内置都不写**，验证 14 个内置 id 仍逐件从清单补齐出现在 dock，总数 = 14+1=15 | ✅ 过（14 个内置 id 逐件断言 count=1；总 tray-item=15） |
| ③ | `npm run build` 须 exit 0、无类型错误 | 只动 `src/model/types.ts`（Item 结构）与 `src/storage/persistence.ts`（reconcile / 初始派生），`tsc -b && vite build` | ✅ 过（`build exit: 0`，`✓ built in ~360ms`，无类型错误） |

## 三、交付物（路径清单）

- 改：`/Users/yuriiiz/Projects/Memories/src/model/types.ts`
- 改：`/Users/yuriiiz/Projects/Memories/src/storage/persistence.ts`
- 新增：`/Users/yuriiiz/Projects/Memories/e2e/u1-s1-dualsource.spec.ts`
- 过程记录：`/Users/yuriiiz/Projects/Memories/receipts/U1-S1/receipt-builder.md`（本文件）

## 四、改了哪些、为什么这样改

### 1）`src/model/types.ts` —— Item 数据结构双源化

`Item` 接口新增 4 个字段（保留原有 `id`/`name`/`imageSrc`/`story`）：

- `source: 'builtin' | 'user'`：来源标记，双源目录（内置清单 ＋ 用户物件）的分流依据。
- `aspectRatio: number`：运行时宽高比。内置项对齐 `ItemAsset.aspectRatio`（构建脚本烘焙），用户项将来上传时测（U2/U3）。（说明：`Canvas.tsx` 现仍从 `getItemAssetById(...).aspectRatio` 取内置件宽高比；把渲染链改读 `Item.aspectRatio` 属「让用户物件可渲染/可摆放」——那是 U2/U3 的活，本 sprint 不动渲染链。）
- `originalImageSrc` / `displayImageSrc`：「原图 / 展示图」两个位，**本期指向同一张**；将来抠图后展示图为透明 PNG、原图仍是朋友拍的那张（故事弹窗展示原图）。
- **为何保留 `imageSrc`**：sprint goal 明写「本 sprint 只动数据结构与 reconcile 逻辑，imageSrc 仍可指向现有存法过渡」。删掉它必须连带改 `Canvas.tsx` / `ItemTray.tsx` / `StoryModal.tsx` 的消费点——那超出「只动数据结构与 reconcile 逻辑」的范围。故保留 `imageSrc` 作过渡字段（与 `displayImageSrc` 同源），消费点零改动、零回归。

### 2）`src/storage/persistence.ts` —— 派生与 reconcile

- `createInitialItems`：仍由 `ITEMS.map` 派生内置 14 件，补齐新字段（`source:'builtin'`、`aspectRatio`、原图/展示图/imageSrc 三者 = `asset.imageSrc`）。
- `reconcileItems`（**本 sprint 修的 bug**）：
  - 旧实现 `return initial.map(base => ...)`——以内置 14 件清单为**唯一**基准遍历，任何不在清单上的用户物件读回时被直接丢弃（用户物件刷新即蒸发）。
  - 新实现按来源分两路后拼接：① 内置项以 `initial`（对齐 manifest）为基准逐件对齐，`source/aspectRatio/原图/展示图/imageSrc` 以清单为准（构建后哈希 URL 可能变），`name/story` 以持久化为准（用户数据，name 空白回退清单默认名）——14 件恒在、重命名与故事刷新后不丢；② `persisted` 里 **id 不在内置清单集合里的物件原样保留**（用户项，不丢弃）。顺序：内置 14 件在前（对齐清单、稳定），用户项按持久化顺序接其后。
  - 保留原有健壮性：`persisted` 非数组 → 返回 `initial`；用户项过滤时带 `i && typeof i.id==='string'` 守卫。

**未触碰**：`saveState` 的空 catch（静默失败）原样保留——终结它属 U1-S2；`SCHEMA_VERSION` 仍为 3（不升 v4，属 U1-S2）；IndexedDB 一行未写（属 U1-S2）；`src/components/*`、`src/state/gallery.ts` 未改（gallery reducer 只对既有 item 做 `{...i, ...}` 展开，不构造新 Item，无需改）。

## 五、自检执行记录（命令与结果）

- 生产构建：`npm run build`（`tsc -b && vite build`）→ `build exit: 0`、`✓ built in ~360ms`、无类型错误（开工基线一次 + 收工一次，均 exit 0）。
- 本 sprint 焦点 e2e：`npx playwright test e2e/u1-s1-dualsource.spec.ts --reporter=line` → `1 passed`（约 1.3–1.7s）；连跑 4 次（含首过）全 pass，不 flaky。
- 全量回归：`npx playwright test --reporter=line` → **27 passed / 9 failed（1.5m）**。
  - 当代（N 线）规格全绿：`n2-shell`（①~⑧）、`n3-edit`（A~F）、`n4-full`（@PC1920 + @phone844×390）——本 sprint 改动未回归任何现役能力；新增 `u1-s1-dualsource` 亦在全量运行中 pass。
  - 9 条 failed **全部为预存失败、与本 sprint 无关**，且与 `receipts/N4-S1/receipt-builder.md` 记的基线失败集合一致（同一批 spec）：
    - `n1-foundation.spec.ts` ×3、`m2-transform.spec.ts` ×2、`m3-story.spec.ts` ×1、`m4-full.spec.ts` ×3：均硬编码 `schemaVersion===2` / `data-scale`（v2 时代断言），而 schema 早在 N2 升 v3——实现是对的（v3），失败的是未随 v2→v3 更新的旧断言。
  - 关于 `n1-foundation.spec.ts` ③：它另有一条 `Object.keys(item).sort()===['id','imageSrc','name','story']` 的**精确键集**断言（行 211/227）。本 sprint 给 Item 加了 4 个字段，会让这条断言过时；但该测试在更早的 `schemaVersion===2`（行 208）就已 red，观测结果（红）与失败 spec 集合均未变——**未把任何原本绿的测试改红**，绿/红边界不动。修 n1-foundation 属 N1 遗留、不在 U1-S1 范围。

## 六、边界与交检

- 未自判通过：本岗做完即交，过不过由评审员对照 U1 验收标准裁决（BLOCKED-on-reviewer）。
- 未碰 `.opc/`；成品落在项目根合适位置（`src/` 就地改、`e2e/` 加焦点测试、`receipts/U1-S1/`）。
- 未越界做 IndexedDB / schema v4 / 终结 saveState 静默失败（U1-S2 范围），未改渲染链消费点（U2/U3 范围）。
