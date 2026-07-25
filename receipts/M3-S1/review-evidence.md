# review-evidence · M3-S1

评审员亲手核查记录。裁决：**pass**。

尺子（本 sprint 硬指标子集，独立摘自 `.opc/sprints/M3-S1.json` 的 `goal` 字段原文，
未采信 builder 回执里的转述，逐条对照原文重新拆分）：

1. 编辑模式下选中物件可写/改故事（有可用入口）。
2. `story` 字段挂在 **Item 本身**，不挂 **Placement**（idea.json B1/B5 原文的数据模型约束）。
3. 保存后落 LocalStorage **全量持久化**，刷新后**故事**完好还原。
4. 同一条 success.json 原文把「布局与故事」绑在一起判——刷新后 **placement**（位置/大小/角度）也须完好还原、不丢失。
5. 同一 Item 摆入多个场景，在其中一处改故事，**另一处同步为最新值**，不得新旧不一致（双向）。
6. `e2e/m3-story.spec.ts` 覆盖上述链路（选中写故事→刷新还原→跨场景同步）且须可跑通（exit 0）。
7. `npm run build` 无类型错误、构建通过。

方法论：不采信 builder 自报的“过”，命令亲手重跑；`npm run dev` 起真实开发服务器，用
`claude-in-chrome` 浏览器工具做真实指针点击/输入操作（非脚本模拟 Playwright headless 断言），
逐步截图 + 直接读 `localStorage` 原始 JSON 核对，而非只信 UI 显示。

---

## 1. 代码核查：story 是否真的挂在 Item 而非 Placement（硬指标 2）

读 `/Users/yuriiiz/Projects/Memories/src/model/types.ts` 原文：

```ts
export interface Item {
  id: string;
  name: string;
  imageSrc: string;
  /** 用户写的故事；初始为空串 */
  story: string;
}

export interface Placement {
  id: string;
  sceneId: string;
  itemId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
}
```

`Item` 有 `story` 字段；`Placement` 只有 `id/sceneId/itemId/x/y/scale/rotation/z`，**没有 `story`
字段**。数据模型层面确认满足硬指标 2。

读 `src/state/gallery.ts` 的 `set-item-story` reducer case：全路径只改
`state.items.map(i => i.id === action.itemId ? {...i, story: action.story} : i)`，
`placements` 不动、且全仓搜索确认 `story` 字段的读写只出现在这一处（外加
`storage/persistence.ts` 的 `createInitialItems`/`reconcileItems` 对 `Item.story` 的初始化/回填）。
未发现任何 per-Placement 的 story 副本写法。**过**。

## 2. 生产构建（硬指标 7）

亲手跑：

```
$ npm run build
> memories@0.1.0 build
> tsc -b && vite build

vite v7.3.6 building client environment for production...
✓ 56 modules transformed.
✓ built in 359ms
```

`tsc -b` 无类型错误，`vite build` 成功。**过**。与 builder 自报一致，独立复核通过。

## 3. e2e：`e2e/m3-story.spec.ts`（硬指标 6）—— 亲手跑，非采信 builder 自报

```
$ npx playwright test e2e/m3-story.spec.ts --reporter=line
Running 2 tests using 1 worker
[1/2] [chromium] › e2e/m3-story.spec.ts:75:1 › 选中物件写故事 → 保存 → 刷新后故事完整还原（故事挂 Item，全量持久化）
[2/2] [chromium] › e2e/m3-story.spec.ts:100:1 › 同一物件摆入两个场景：一处改故事 → 另一场景同步为最新值（跨场景同步，双向）
  2 passed (2.9s)
```

**2/2 通过，exit 0。**

抽查用例内容是否偷懒断言过弱（读 `e2e/m3-story.spec.ts` 全文，而非只看退出码）：
- 用例 1：不仅断言 UI textarea 显示值，还**直接读 `localStorage['memories.gallery']` 原始
  JSON**，断言该 Item 的 `story === STORY` 且 `schemaVersion === 1`（证明确实走了带版本号的全量落盘，
  而非只改了内存态就被测出“看起来对”）；刷新后重开面板断言 `textarea.inputValue() === STORY`。
  断言是**值相等**，不是 `.toBeTruthy()`/`.toHaveCount()` 这类弱断言。
- 用例 2：`itemIdB === itemId` 精确断言两次摆放确实是同一 Item；改故事后**双向**核对
  `readStory(A) → S1`、`readStory(B) → S1`（同步）、`B 改 S2 → 切回 A 读到 S2`（反向同步）、
  最后 `reload` 后 A/B 两处都读到 `S2`——覆盖了“新旧不一致”的关键判据，而不是只测单向。

**未发现断言过弱或偷懒的情况。过。**

## 4. 回归：M1/M2 e2e 是否因本次改动（碰了持久化/选中态相关代码）受影响（硬指标 4 + 通用回归）

```
$ npx playwright test e2e/m1-shell.spec.ts e2e/m2-transform.spec.ts --reporter=line
Running 5 tests using 1 worker
[1/5] › e2e/m1-shell.spec.ts:34:1 › 建场景 → 切场景 → 刷新后场景与布局状态完整还原
[2/5] › e2e/m1-shell.spec.ts:82:1 › 物件抽屉列出全部 14 件物件
[3/5] › e2e/m1-shell.spec.ts:87:1 › 场景背景不可重复且最多 3 个：第 4 个被阻止并置灰"素材已用完"
[4/5] › e2e/m2-transform.spec.ts:84:1 › 全链路变换：抽屉拖入 → 拖动改位 → 角手柄缩放 → 顶部手柄旋转 → 移除 → 刷新完整还原
[5/5] › e2e/m2-transform.spec.ts:198:1 › 抽屉拖入落到画布外 → 不建 placement（真实拖拽的落点判定）
  5 passed (4.3s)
```

**5/5 通过，无回归。** placement 的 x/y/scale/rotation/z 刷新完整还原链路未被本次改动破坏。

## 5. 手动全链路核查（`npm run dev` + `claude-in-chrome` 真实浏览器操作，硬指标 1/3/4/5）

起 `npm run dev`（`http://localhost:5173/`），用浏览器自动化工具做真实点击/输入（非脚本断言），
每步截图核对。清空 `localStorage` 后从空白态开始。

### 5.1 建场景 → 摆物件 → 选中 → 写故事 → 保存 → 刷新 → 故事完好还原（硬指标 1/3）

1. 点「＋ 新场景」→ 选「客厅」→ 场景 chip「客厅」出现，切至该场景。
2. 点抽屉第一件物件「全家福旧照」→ 该物件出现在画布内（叠在一张相框道具上）。
3. 点击画布内该物件 → 选中态手柄链出现（四角缩放手柄 + 顶部旋转钮 + 左上「✎」故事按钮 + 右上「✕」移除按钮）。
4. 点「✎」按钮（`data-testid="placement-story"`，aria-label「编辑「全家福旧照」的故事」）→
   故事面板弹出，标题「全家福旧照」，textarea 占位「写下这件旧物的故事……」。
5. 在 textarea 输入：`评审员实测：这是1987年春节的全家福，爷爷手写的日期还留在照片背后。`
6. 点「保存故事」→ 面板关闭。

**直接读 localStorage 原始数据**（`javascript_exec`，非信任 UI 显示）：

```json
{
  "schemaVersion": 1,
  "items": [{"id":"bedroom-1","story":"评审员实测：这是1987年春节的全家福，爷爷手写的日期还留在照片背后。"}],
  "placements": [{"id":"pl-mrmk8arh-4-cnkb8","sceneId":"scene-mrmk87gn-2-1l8rl","itemId":"bedroom-1",
                  "x":90,"y":90,"scale":1,"rotation":-5,"z":1}]
}
```

确认 `schemaVersion:1`（带版本号）、`story` 已写入 `items[]`（不在 `placements[]` 里）。

**刷新页面**（`navigate` 重新加载，非 SPA 内路由）后：

- 场景「客厅」与摆放的物件仍在原位（截图确认易物件仍叠在相框道具上，视觉位置未变）。
- `document.querySelector('.stage__item').dataset` 读出：
  `{x:"90", y:"90", scale:"1", rotation:"-5", z:"1"}`——与刷新前**逐字段精确一致**，硬指标 4
  （placement 刷新还原、不丢失不跑偏）确认满足。
- 重新点选该物件 → 点「✎」→ 面板打开，textarea 内文本为
  `评审员实测：这是1987年春节的全家福，爷爷手写的日期还留在照片背后。`——与保存前**逐字一致**，
  硬指标 3（故事刷新完好还原）确认满足。

### 5.2 同一物件摆入第二场景 → 跨场景同步（双向，硬指标 5）

1. 点「＋ 新场景」→ 选「书房」→ 场景 2「书房」建成、自动切入（空场景）。
2. 点抽屉第一件物件「全家福旧照」（与客厅摆的是**同一件**，抽屉里只有一份物件目录）→
   摆入书房场景（书架背景上）。
3. 选中该物件 → 点「✎」→ **在未做任何编辑的情况下**，面板直接显示
   `评审员实测：这是1987年春节的全家福，爷爷手写的日期还留在照片背后。`——
   即客厅写的故事，**打开书房这条新 Placement 的面板时已经是同步好的**，证明故事读的是
   Item 上的同一份数据，不是各 Placement 独立初始化的副本。
4. 全选 textarea 内容，改写为：`书房改版：改写于书房场景，验证双向同步。` → 点「保存故事」。
5. 切回场景 chip「客厅」→ 画布内确认还是同一件物件（同一相框位置）→ 选中 → 点「✎」→
   面板显示 `书房改版：改写于书房场景，验证双向同步。`——**客厅这边已同步为书房刚写的新值**
   （反向同步确认）。

**刷新页面后，直接读 localStorage 做终态核对**（不经 UI，直接验证数据模型层面的单一数据源）：

```json
{
  "schemaVersion": 1,
  "scenes": [{"id":"scene-mrmk87gn-2-1l8rl","name":"客厅"},{"id":"scene-mrmkah88-2-vq772","name":"书房"}],
  "items": [{"id":"bedroom-1","story":"书房改版：改写于书房场景，验证双向同步。"}],
  "placements": [
    {"id":"pl-mrmk8arh-4-cnkb8","sceneId":"scene-mrmk87gn-2-1l8rl","itemId":"bedroom-1","x":90,"y":90,"scale":1,"rotation":-5,"z":1},
    {"id":"pl-mrmkakrk-4-myidv","sceneId":"scene-mrmkah88-2-vq772","itemId":"bedroom-1","x":90,"y":90,"scale":1,"rotation":-5,"z":1}
  ]
}
```

关键点：`items[]` 里 `itemId:"bedroom-1"` **只有一条记录、一份 story**；两条 `placements`
（分属客厅、书房两个场景）都指向同一个 `itemId`，各自的 `x/y/scale/rotation/z` 独立
（各自 90/90/1/-5/1，因为都是默认网格位，属巧合非缺陷——两次都是"点选放入"未拖动），
但**没有任何 per-Placement 的 story 字段**——从持久化数据的物理结构上二次确认了硬指标 2/5：
故事只有一份、天然跨场景同步，不存在"新旧不一致"的可能（因为压根不存在第二份可以不一致）。

### 5.3 控制台核查

`read_console_messages`（全流程操作后读取，pattern 覆盖所有级别）：仅
`[vite] connecting...` / `[vite] connected.` / React DevTools 提示三类开发期调试日志，
**无 error/warning、无未捕获异常**。

---

## 6. 结论表

| 硬指标 | 结论 |
|---|---|
| 1. 编辑模式选中物件可写/改故事（可用入口） | 过（✎ 按钮 → 面板 → textarea → 保存，全链路手动走通） |
| 2. story 挂 Item 不挂 Placement（数据模型） | 过（`types.ts` 原文确认 + `gallery.ts` reducer 原文确认 + localStorage 物理结构二次确认） |
| 3. 保存全量落盘、刷新故事完好还原 | 过（localStorage 直读确认 `schemaVersion:1` + 故事文本刷新前后逐字一致） |
| 4. 刷新后 placement 不丢失/不跑偏 | 过（x/y/scale/rotation/z 刷新前后逐字段精确一致；M1/M2 回归 5/5 通过） |
| 5. 同一 Item 跨场景故事同步（双向） | 过（书房初次打开即读到客厅写的值；书房改写后客厅同步读到新值；reload 后 localStorage 物理结构确认只有一份 story） |
| 6. `e2e/m3-story.spec.ts` 覆盖链路且 exit 0 | 过（2/2 passed；抽查断言内容为值相等而非弱断言，覆盖 localStorage 直读 + 双向同步 + reload） |
| 7. `npm run build` 无类型错误、构建通过 | 过（`tsc -b && vite build` 成功，56 modules） |

七条全过，零条不过。范围核查：本 sprint 明确不含「游客模式只读弹故事+原图」（留给
M3-S2，`.opc/sprints/M3-S1.json` 原文与 `Canvas.tsx`/`gallery.ts` 的 `editable`/`mode!=='edit'`
守卫均一致确认此范围），故本轮未测该项，未拿全册 M3 milestone 标准误伤本切片。

**裁决：pass。**

---

## 复现命令（供复核参考）

```bash
cd /Users/yuriiiz/Projects/Memories
npm run build                                                          # exit 0
npx playwright test e2e/m3-story.spec.ts --reporter=line               # 2 passed
npx playwright test e2e/m1-shell.spec.ts e2e/m2-transform.spec.ts --reporter=line  # 5 passed
npm run dev                                                             # http://localhost:5173/
# 浏览器手动核查：清空 localStorage → 建场景「客厅」→ 点选放入「全家福旧照」→ 选中 → ✎ →
# 写故事 → 保存 → 直读 localStorage 核对 → 刷新 → 核对故事+placement 还原 →
# 建场景「书房」→ 摆入同一物件 → 核对故事已同步 → 改故事 → 切回客厅核对反向同步 →
# 刷新 → 直读 localStorage 核对终态。
```

浏览器操作经 `claude-in-chrome` MCP 工具驱动，真实指针点击/键盘输入（非 headless 脚本模拟），
过程截图未落盘进仓库（临时会话产物）。
