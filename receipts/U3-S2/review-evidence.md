# U3-S2 评审证据 · 上传配额（已传 N/50 · 到顶前置阻止）+ 游客模式只读复核

评审员：general 队 reviewer。核查方式：亲手读代码逐行核对 + 亲手跑命令，不采信建造员自述结论。

## 0. 尺子（读档记录）

已读：
- `/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/reviewer.md`
- `/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/review-against-criteria.md`
- `/Users/yuriiiz/Projects/Memories/.opc/sprints/U3-S2.json`
- `/Users/yuriiiz/Projects/Memories/.opc/phase1/milestones.json`（里程碑 U3 条目，criteria[1]=配额、criteria[2]=游客只读）
- `/Users/yuriiiz/Projects/Memories/.opc/phase1/success.json`（「上传配额是 50 件且到顶提前告知」「游客模式无上传入口」两条原文）
- `/Users/yuriiiz/Projects/Memories/receipts/U3-S2/receipt-builder.md`（仅作参考，结论不采信，逐条亲自复核）

本 sprint 契约范围（U3-S2.json 原文）：只补两块——① dock「已传 N/50」+ 到顶前置阻止；② 游客模式只读复核（尤其覆盖 U3-S1 新增的删除入口）。milestones.json U3 criteria[0]（`e2e/u3-parity.spec.ts`，平权与删除）不在本 sprint 契约内，不纳入本轮通过/打回判定。

## 1. 配额硬指标逐条核查（milestones.json U3 criteria[1] / success.json「配额是 50 件且到顶提前告知」）

判负条件原文：「传到第 51 件仍能上传成功；或 dock 不显示已用数量；或传满后仍让用户走完选图流程才失败，即判失败。」

### 代码核查（亲读，非采信）

- `src/state/gallery.ts:44` `export const MAX_UPLOADS = 50;`
- `src/state/gallery.ts:47-49` `userItemCount(state)`：`state.items.reduce((n,i)=>i.source==='user'?n+1:n,0)` —— 单一数据源，count 只数 `source==='user'` 的 Item，upload/delete 都改 `items` 数组，天然实时。
- `src/state/gallery.ts:243-269` `add-item` reducer：第 252 行 `if (userItemCount(state) >= MAX_UPLOADS) return state;`——已达上限即拒收，绕开 UI 也拒收（纵深防御）。
- `src/upload/UploadEntry.tsx:33-39`：
  ```
  const full = count >= max;
  function pick() {
    if (busy) return;
    if (full) return;          // 前置阻止：不触发 input.click()
    inputRef.current?.click();
  }
  ```
  `full` 时 `pick()` 直接 return，原生文件选择器**根本不会打开**——阻止发生在入口，先于选图流程，符合「不能让用户选完图、走完预览才被告知」的字面要求。
- `src/upload/UploadEntry.tsx:82-84` 常驻计数：`已传 {count}/{max}`，`data-testid="upload-quota"`。
- `src/upload/UploadEntry.tsx:86-96` 按钮 `disabled={busy || full}` + `data-full={full?'true':'false'}`。
- `src/upload/UploadEntry.tsx:118-122` 已满常驻说明 `data-testid="upload-quota-block"`：「已达 50 件上限，删除物件后可再上传。」——在选图之前即告知、指明出路。
- `src/components/ItemTray.tsx:150` `uploadedCount = items.reduce(...)`，传给 `UploadEntry` 的 `count`/`max`——与 reducer 用同一 `MAX_UPLOADS` 常量（`import { MAX_UPLOADS } from '../state/gallery'`，第 15 行），UI 与 reducer 判据一致，不存在两处硬编码不同值的风险。

### 亲手跑测试（非仅看通过与否，逐条核对断言是否真的覆盖判负条件）

```
$ npx playwright test e2e/u3-quota.spec.ts --reporter=line
[1/2] ① dock 显示「已传 N/50」并随上传/删除实时更新
[2/2] ② 到顶（50/50）后上传入口前置阻止并给出说明，第 51 件传不进
2 passed
```

逐条读测试断言，确认真覆盖判负条件（不是「测试通过但没测到点子上」）：
- 用例①：`toHaveText('已传 0/50')` → 真实走 UI 上传两次（非模拟 dispatch）验证 0→1→2 → 删除一件验证 2→1（`e2e/u3-quota.spec.ts:137-154`）。**随上传/删除更新**均有真实断言，不是只测初始值。
- 用例②：种 49 件 + 走一次真实上传到 50/50 → 断言 `upload-add` 变 `disabled` + `data-full=true` + `upload-quota-block` 可见含「50」「上限」→ 强制点击已禁用按钮后断言 `upload-preview` 计数为 0（**选图流程未启动**，不是「点了报错」）→ 直接对 hidden input 灌文件绕开 `pick()` 走完预览确认，断言 reducer 拒收（数量仍 64、计数仍 50/50）→ 刷新后仍 50/50 且仍 disabled（配额持久）（`e2e/u3-quota.spec.ts:162-219`）。**这条测试的断言顺序和判负条件逐字对应**，不是泛泛「测试绿了就算」。

**结论：配额硬指标全部满足，且亲读代码确认测试断言真实覆盖判负条件，非漏判。判：过。**

## 2. 游客模式只读硬指标逐条核查（milestones.json U3 criteria[2] / success.json「游客模式无上传入口」）

判负条件原文：「在游客模式下找得到任一上传/删除/重命名入口，或能改动任何数据，即判失败。」

### 代码核查（逐文件亲读）

- `src/components/Workbench.tsx:110-121`：`{state.mode === 'edit' && <ItemTray .../>}`——dock（含上传入口、上传配额计数、物件删除入口、物件重命名入口）整体只在编辑模式渲染，游客模式下这一整块 DOM 都不存在（不是仅视觉隐藏/disabled，是不挂载）。
- `src/components/ItemTray.tsx:259-261`：删除入口 `{item.source === 'user' && <ItemDelete .../>}`——即便在编辑模式下也只对 user 件渲染，内置件天生无删除入口；游客模式下整个 dock 不渲染，删除入口双重收起。
- `src/components/Header.tsx:35-66`：陈列室名品牌章按 `mode` 分流——`mode==='edit'` 才渲染带 `role="button"`/`onClick={beginEdit}`/`tabIndex` 的可编辑 `<h1>`；否则渲染纯展示 `<h1 data-testid="gallery-name">{galleryName}</h1>`（无 role/onClick/tabIndex）——点击不会进入编辑，不是靠 CSS 隐藏，是渲染分支级别的隔离。**这是本轮建造员复核中发现的真实漏洞并修复**（详见 3.）。
- `src/state/gallery.ts:307-317` `set-gallery-name` reducer：`if (state.mode !== 'edit') return state;`——纵深防御，UI 之外再补一层。
- `src/components/SceneBar.tsx:134-135`：场景 chip `onClick={() => (active && editable ? beginEdit() : onSelectScene(scene.id))}`；`onDoubleClick={() => editable && beginEdit()}`——`editable=false` 时点击只会切场景，双击是空操作，两条路径都不通向编辑态。
- `src/components/SceneBar.tsx:143-145` 场景删除入口 `{editable && active && <SceneDelete .../>}`；`src/components/SceneBar.tsx:151` 新建场景入口 `{editable && (...)}`——游客模式均不渲染。
- `src/components/Canvas.tsx:516` `showChrome = selected && editable`——选中框/缩放手柄/旋转钮/工具条（含移除、写故事按钮）只在编辑模式渲染；`onItemPointerDown` 第 231 行 `if (!editable) return;`——游客模式下拖拽/缩放/旋转手势的起手函数直接短路，物件物理上拖不动。
- `src/components/Canvas.tsx:552-558`：游客模式点物件 `onClick`：`if (!editable) { e.stopPropagation(); setStoryOpenId(p.id); }`——只弹故事弹窗，不做任何状态改动。
- `src/components/StoryModal.tsx:80-93,106-125`：`editable` 为 false 时只渲染 `story__body`（只读文本）+ `story__photo`（原图），不渲染 `textarea`/保存按钮/取消按钮——不是 disabled 输入框，是整个编辑区不存在。

### 亲手跑测试（逐条核对是否真覆盖「找得到任一入口」判负条件）

```
$ npx playwright test e2e/u3-guest.spec.ts --reporter=line
游客模式只读复核：无上传/删除/重命名入口，点物件只弹故事+原图，改不动任何数据
1 passed
```

读测试脚本确认手法扎实、非走过场：
- 先在编辑模式把料备齐（建场景 + 真实上传一件用户物件 + 拖入场景 + 写故事），**并先断言这些入口在编辑模式下确实存在**（`upload-add`/`item-delete`/`item-name`/`add-scene`/`scene-delete`/`gallery-name` 逐个 `toBeVisible()`，`e2e/u3-guest.spec.ts:182-188`）——这一步排除了「入口本来就没做出来、测试测了个寂寞」的可能，是这份测试比通常「切游客点几下」更扎实的地方。
- 切游客后逐项断言 count 为 0（不是 toBeHidden，是 toHaveCount(0)——即整个元素不挂载，比仅仅隐藏更强）：`tray`/`upload-add`/`upload-quota`/`item-delete`/`item-name`/`add-scene`/`scene-delete`/`handle-scale`/`handle-rotate`/`placement-toolbar`/`placement-remove`/`placement-story`（`e2e/u3-guest.spec.ts:205-217`）。
- 陈列室名：`click({force:true})` 后断言 `gallery-name-input` count 为 0（`:220-221`）——**本轮新修复的漏洞点，测试专门覆盖**。
- 场景名：点击+双击后均断言 `scene-name-input` count 为 0（`:224-228`）。
- 点物件只弹只读故事：`data-mode="guest"`、`story-input`/`story-save` count 为 0、`story-body` 含刚才编辑模式写的故事文本、`story-photo` 可见（`:231-238`）。
- 物件不可拖动：拖动前后 `data-x`/`data-y` 相等（`:243-256`）。
- 收口：把切游客前的 LocalStorage 快照与切换后逐字段 `toEqual`（`galleryName`/`items`/`placements` 全比对，`:259-262`）——这是「不能改动任何数据」判负条件里最硬的一条，测试确实做了字节级比对而非抽查。

**结论：游客只读硬指标全部满足，尤其本代际新增删除入口与本轮新修的陈列室名重命名漏洞均被代码与测试双重覆盖。判：过。**

## 3. 独立验证「陈列室名可被游客改名」是否为真实漏洞、是否修复到位

不采信建造员「已修」的自述，亲自验证当前代码状态：

- `Header.tsx` 当前版本（见上）已按 `mode` 做渲染分支隔离，游客态 `<h1>` 无 `role`/`onClick`/`tabIndex`。
- `gallery.ts` 的 `set-gallery-name` 已有 `if (state.mode !== 'edit') return state;` 守卫。
- `e2e/u3-guest.spec.ts` 步骤 B 专项覆盖（点击品牌章后断言无 rename input）。
- 亲手跑该测试通过（见 2.）。

判定：该漏洞确实存在过（从 `gallery.ts` 里 `set-item-name`/`set-item-story` 都有守卫、唯独 `set-gallery-name` 没有这一代码考古证据可信），且当前已用双层防御（UI 渲染分支 + reducer 守卫）修复到位，测试专项覆盖。不是「builder 自己说改了就信了」，是读现状代码+跑测试独立确认。

## 4. 生产构建

```
$ npm run build
> tsc -b && vite build
✓ 63 modules transformed.
✓ built in 338ms
```
通过，无类型错误。

## 5. 全量回归——独立核查「无新增回归」而非采信builder判断

```
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
46 passed (1.8m)
```

核查这 9 条是否真的是「既有漂移、非本轮引入」，不采信 receipt-builder.md 的说法，交叉读项目历史证据：
- `receipts/U3-S1/review-evidence.md` 第 116-142 行：U3-S1 评审员亲跑得到**逐条同名同行号**的 9 条失败（`43 passed / 9 failed`），并进一步交叉引用 U1-S3（29 passed/9 failed）、U2-S1（35/9）、U2-S2（40/9）——**跨至少 5 轮独立评审，failed 集合完全不变，仅 passed 数随新增测试递增**。
- 本轮实测 `46 passed / 9 failed`——passed 数从 U3-S1 的 43 增至 46，恰好 = 本 sprint 新增的 3 条测试（quota①②+guest①）；9 条失败的具体文件名、行号与 U3-S1 评审记录逐一比对**完全一致**，未新增、未减少、未变化。
- 根因独立核实（读代码，非采信）：`src/storage/persistence.ts` 现行 `SCHEMA_VERSION = 4`（旧测试断言 `schemaVersion===2`）；`src/model/types.ts` 的 `Placement` 接口现无 `scale` 字段（旧测试断言 `placement.scale`，已被 N1 引入的 `w` 取代）——这些断言失效的根因都在更早的里程碑（N1/U1），与本 sprint 改动的 5 个文件（`gallery.ts`/`Header.tsx`/`UploadEntry.tsx`/`ItemTray.tsx`/`App.css`）无关；这 5 个文件均不涉及 schema 版本号、Placement 字段结构、坐标数学。

**结论：本轮零新增回归，9 条既有失败与本 sprint 无因果关系，独立核实成立（非采信自述）。**

## 4b. 与本 sprint 改动直接相关的现役回归子集

```
$ npx playwright test e2e/u3-parity.spec.ts --reporter=line
Error: No tests found.
```
说明：`e2e/u3-parity.spec.ts` 文件不存在——milestones.json U3 criteria[0]（平权+删除）在项目里落地为 `e2e/u3-s1-parity-selftest.spec.ts`（U3-S1 交付），已包含在上面的全量套件里且全绿（3/3 passed，见全量输出第 53-55 项）。criteria[0] 不在本 sprint（U3-S2）契约范围内，仅顺带确认其现状未受本轮改动影响。

## 6. 综合判定

- 配额（criteria[1]）：过，证据见 §1。
- 游客只读（criteria[2]）：过，证据见 §2、§3。
- 生产构建：过，证据见 §4。
- 无新增回归：过，独立核实见 §5（非采信builder判断）。
- 未发现标准之外需要打回的问题；builder 在复核中主动发现并修复的陈列室名越权漏洞，经独立验证确认修复到位。

**裁决：放行（pass）。**
