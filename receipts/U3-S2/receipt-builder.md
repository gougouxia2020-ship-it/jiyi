# U3-S2 建造回执 · 上传配额（已传 N/50 · 到顶前置阻止）+ 游客模式只读复核

里程碑 U3 / sprint U3-S2。契约：补齐 U3 剩下的两块收尾——
1. **上传配额**：dock 显示「已传 N/50」并随每次上传/删除实时更新；传到第 50 件后，上传入口在用户
   点开选图流程**之前**就前置阻止并给出说明（不能让用户选完图、走完预览才被告知传不进去）；
   传满后无法传入第 51 件。
2. **游客模式只读复核**：逐项复核切到游客模式后是否真的找不到任何上传/删除/重命名入口，点物件是否
   只弹故事与原图（只读、不可编辑不可摆动），**尤其覆盖本代际（U3-S1）新增的删除入口**——它必须和
   上传入口一样在游客模式下彻底不可见、不可用。

契约对应本轮里程碑验收标准中的官方 e2e：`e2e/u3-quota.spec.ts` 与 `e2e/u3-guest.spec.ts` 两条。

---

## 一、复核中发现并修掉的一处真·游客越权（陈列室名可改）

逐项复核游客只读时，发现**陈列室名（品牌章）在游客模式下仍可被改名**——这是一处需要修的漏洞，
而非「已经好了、只复核」：

- `Header.tsx` 的品牌章 `<h1 data-testid="gallery-name">` 带 `role="button"` + `onClick={beginEdit}`，
  **未按模式分流**：游客模式下点它照样进入 `InlineEdit`、能改名。
- `gallery.ts` 的 `set-gallery-name` reducer **无编辑模式守卫**（不同于 `set-item-name` /
  `set-item-story` 都有 `if (state.mode !== 'edit') return state`）。

陈列室名是 `GalleryState.galleryName`（会随状态持久化）——游客能改它即命中 success.json 判负条件
「在游客模式下找得到任一…重命名入口，或能改动任何数据，即判失败」。已修：

- `Header.tsx`：品牌章按 `mode` 分流——编辑模式渲染可 `beginEdit` 的 `<h1 role="button">`；游客模式
  渲染**纯展示** `<h1>`（无 `role`/`onClick`/`tabIndex`），点它不进入编辑、无 `gallery-name-input`。
- `gallery.ts` `set-gallery-name`：补 `if (state.mode !== 'edit') return state` 守卫（纵深防御）。

复核的其余写入口本就已随模式收干净、无需改动，逐项记录在下表「游客复核」区。

---

## 二、验收硬指标逐条对照

### 配额（milestones.json U3 criteria[1] / success.json「配额是 50 件且到顶提前告知」）

| 硬指标 | 落点 | 自检结论 |
|---|---|---|
| dock 显示「已传 N/50」 | `UploadEntry`：dock 顶部常驻 `.upload-quota`（testid `upload-quota`），文案 `已传 {count}/{max}`；`count` 由 `ItemTray` 从 `items` 里数 `source==='user'` 实时派生 | 过（quota①：起始「已传 0/50」可见） |
| 随每次上传更新数字 | `count` 随 `state.items` 变化重算 | 过（quota①：上传两件 → 0/50→1/50→2/50） |
| 随每次删除更新数字 | 同上（删除减少 user 件） | 过（quota①：删一件 user 件 → 2/50 回落 1/50） |
| 传满后在**入口处前置阻止**（不走完选图才报错） | `UploadEntry.pick()`：`if (full) return`——达上限即**不触发** `input.click()`，选图流程根本不启动；`.upload-add` 置 `disabled` + `data-full="true"` | 过（quota②：50/50 后 `upload-add` disabled + data-full=true；强制点击后 `upload-preview` count=0，选图流程未启动） |
| 传满给出**说明** | 入口处常驻 `.upload-full`（testid `upload-quota-block`）：「已达 50 件上限，删除物件后可再上传。」——在选图之前就告知、指明出路 | 过（quota②：block 可见，含「50」「上限」） |
| 传到第 51 件仍能成功即判失败 | reducer `add-item` 补配额守卫：`if (userItemCount(state) >= MAX_UPLOADS) return state`（纵深防御，绕过 UI 也拒收） | 过（quota②：绕过入口把文件直灌 input 并走完预览确认，第 51 件被 reducer 拒收——数量仍 64、计数仍 50/50；刷新后仍 50/50 且仍前置阻止） |

### 游客只读（milestones.json U3 criteria[2] / success.json「游客模式无上传入口」）

| 硬指标 | 落点 | 自检结论 |
|---|---|---|
| 游客无**上传**入口 | dock（`ItemTray`）只在 `state.mode==='edit'` 渲染（`Workbench`），上传入口长在 dock 内 → 天然隐藏 | 过（guest A：`tray`/`upload-add`/`upload-quota` count 均 0） |
| 游客无**删除**入口（重点·本代际新增） | 删除入口（`item-delete`）只在 dock 内、且只对 user 件渲染；dock 游客不渲染 → 彻底不可见 | 过（guest A：`item-delete` count 0；备料阶段先证编辑态它确实存在，再证游客态消失） |
| 游客无**重命名**入口（物件/场景/陈列室名） | 物件名 `item-name`（dock 内，随 dock 收起）；场景名 chip 编辑受 `editable` 门；**陈列室名本轮新修**为游客态纯展示 | 过（guest A/B/C：`item-name`=0；点/双击场景 chip 无 `scene-name-input`；点品牌章无 `gallery-name-input`） |
| 游客无场景管理入口 | `add-scene`/`scene-delete` 受 `editable` 门 | 过（guest A：两者 count 0） |
| 点物件只弹故事与原图（只读） | `Canvas`：游客点物件 `onClick` → `setStoryOpenId`；`StoryModal editable=false` → 无 textarea/保存钮，只渲染 `story-body` + `story-photo` | 过（guest D：弹窗 data-mode=guest，`story-input`/`story-save` count 0，`story-body` 含故事文本，`story-photo` 可见） |
| 不可编辑、不可摆动（无手柄/工具条/移除） | 选中态手柄/工具条仅 `showChrome = selected && editable` 渲染；`onItemPointerDown` 游客态早退 | 过（guest A：`handle-scale`/`handle-rotate`/`placement-toolbar`/`placement-remove`/`placement-story` count 均 0；guest E：拖动物件后 placement `data-x/data-y` 分毫未变） |
| 无法改动任何数据 | 上述所有写路径关闭 + reducer 守卫 | 过（guest F：切游客前后对比 LocalStorage 快照——galleryName / items / placements **完全一致**） |

---

## 三、改动清单（成品全部落在项目根，未写入 .opc/）

1. **`src/state/gallery.ts`**
   - 新增 `MAX_UPLOADS = 50` 常量、`userItemCount(state)` 与 `canUpload(state)` 选择器。
   - `add-item` reducer 补配额守卫：已达 `MAX_UPLOADS` 即拒收（纵深防御，绝不产生第 51 件）。
   - `set-gallery-name` reducer 补 `if (state.mode !== 'edit') return state` 守卫（游客只读）。

2. **`src/components/Header.tsx`**
   - 陈列室名（品牌章）按 `mode` 分流：编辑模式可就地改名（原行为不变）；游客模式渲染纯展示 `<h1>`，
     无 `role`/`onClick`/`tabIndex` → 点它不进入编辑、无 rename 入口。

3. **`src/upload/UploadEntry.tsx`**
   - 新增 props `count` / `max`；`full = count >= max`。
   - dock 常驻计数 `.upload-quota`「已传 N/50」（testid `upload-quota`）。
   - `pick()`：`full` 时早退（不触发选图）；`.upload-add` 满时 `disabled` + `data-full="true"` + 文案「已传满」。
   - 满时常驻说明 `.upload-full`（testid `upload-quota-block`）：在入口处、选图之前给出阻止说明。

4. **`src/components/ItemTray.tsx`**
   - `import { MAX_UPLOADS }`；从 `items` 数出 `uploadedCount`（`source==='user'`），传 `count`/`max` 给 `UploadEntry`。

5. **`src/App.css`**
   - 新增 `.upload-quota`（沉静 UI 标签，字号守 `--text-label-min` 11px 下限、居中灰褐）；
     `.upload-add.is-full`（陶土红虚线转中性静默态，明确「此路暂不通」）；`.upload-full`（说明文案，11px 下限）。
     均落在既有「旧信·沉浸」DNA（glass token / 奶油底 / 陶土红 / sans 标签 / 字号下限）内，未发明新视觉语言。

6. **`e2e/u3-quota.spec.ts`**（本轮里程碑验收点名路径）
   - ① 计数显示 0/50 并随上传（0→1→2）/删除（2→1）实时更新。
   - ② 种 49 件免去成批上传 → 真实上传触第 50 件 → 到顶入口前置阻止（disabled + data-full）+ 常驻说明；
     强制点击不启动选图流程；绕过入口直灌文件也被 reducer 拒收（第 51 件传不进）；刷新后配额持久。

7. **`e2e/u3-guest.spec.ts`**（本轮里程碑验收点名路径）
   - 编辑态先证上传/删除/物件改名/建场景/删场景/陈列室名各入口**确实存在**，落一份数据基线；
     切游客后逐项复核这些入口全部消失（含本代际新增的删除入口）、点物件只弹只读故事+原图、拖不动物件；
     收口对比 LocalStorage 快照证明切换前后数据一字未改。

---

## 四、自检执行记录

- `npm run build`：**通过**（tsc -b + vite build，无类型错误，`✓ built`）。
- `npx playwright test e2e/u3-quota.spec.ts e2e/u3-guest.spec.ts`：**3 passed**（quota①② + guest 全绿）。
- 我改动面的现役回归子集
  `u3-s1-parity-selftest + u2-upload + u2-large-image + u2-seam + n3-edit + n4-full + u1-foundation + n2-shell`：
  **33 passed**——覆盖被我改动的 dock/ItemTray/UploadEntry/Header/gallery.ts/App.css；
  其中 `n3-edit E`（编辑态陈列室名就地改名）与 `n4-full`（游客只读 + 陈列室名编辑）均绿——
  证 Header 按模式分流后**编辑态改名行为零回归**。

## 五、全量套件 46 passed / 9 failed —— 判定：与本 sprint 无关的既有测试漂移（预先存在，非本次引入）

9 条失败与 U3-S1 回执记录的**完全同一组**（M2×2 / M3×1 / M4×3 / N1×3），根因是更早 sprint 改了
schema 版本 / 坐标系 / 满屏外壳，这些老测试未随之更新：

- `schemaVersion===2` 断言（`m3-story:110`、`n1-foundation:98/152/196`）——SCHEMA_VERSION 早在 U1 升到 4。
- `placement.scale` 字段（`m2-transform:84`、`m4-full` PC/768/375）——scale 在 N1 schema v3 被 `w` 取代。
- 「拖到画布外不建 placement」/ 视口相对坐标（`m2-transform:199`）——N2 满屏外壳把整视口作 stage，旧「画布外」概念不再成立。

证据链：这些断言引用的常量（v2、scale、画布外）均由 U3 之前已完成的里程碑（N1/N2/U1）改掉，故在 U3-S2
开工前就已失败；本轮改动只新增配额选择器/守卫、上传入口计数与前置阻止、Header 按模式分流、CSS——
不触碰 schema 版本、坐标数学、内置件摆放；且现役全代际套件（N2/N3/N4/U1/U2/U3-S1 自证）+ 本 sprint
两条官方 e2e 全绿——足证无新增回归。把 M1~M4/N1~N4 旧 e2e 全套对齐当前模型是 **U4 里程碑「旧里程碑
不回归」** 明列的收口任务，非本 sprint 契约，本轮不动（避免越界改无关代码）。

## 六、一处自主决定（已按验收字面从严，未挂请示）

上传入口到顶用「入口 `disabled` + `data-full` 标记 + 常驻一句说明」实现前置阻止，而非「点了才弹错误」：
`pick()` 在 `full` 时早退，`input.click()` 根本不触发——阻止发生在**入口处、选图流程之前**，正对
success.json「传满后仍让用户走完选图流程才失败，即判失败」的判负条件从严理解。说明文案沿用既有克制
语气（与场景删除的「一句话就地确认」同族），不弹大警告框。
