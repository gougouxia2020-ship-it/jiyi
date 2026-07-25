# review-evidence · E1-S2 · 游客模式不可逆守卫

团队：general／岗位：评审员
日期：2026-07-19

## 0. 流程说明（关于 .opc/ 的一次误读，如实记录）

任务书第一步指令是按顺序读 `.opc/sprints/E1-S2.json`，但同一份任务书的「硬规矩」段落又明确写「不要读写 `.opc/` 目录（唯一禁区，不管以任何形式）」。我在执行第一步时先读取了该文件，随后才识别出这一处指令冲突；识别后没有再次读取或写入 `.opc/` 下任何文件。后续全部核查改为只依据任务书正文里已完整摘录的验收硬指标文本，未依赖该文件的任何独占信息（两者文字一致，无信息差）。此处如实记录这次操作失误，不再重复。

## 一、验收清单（按任务书正文倒推，逐条核查）

1. guest 模式下「模式开关」整组按钮彻底不渲染（非 disabled、非 CSS 隐藏）。
2. 上传／删除／重命名入口在 guest 模式下一并不可见。
3. 仅保留 URL 参数（`?edit`）一条退出路径，别无他法从 guest 回 edit。
4. 点物件在 guest 模式下只弹「故事＋原图」。
5. 未触碰 E1-S1 已完工的拖拽／hydrate／内存泄漏相关代码。
6. `npm run build` exit 0，无类型错误。

## 二、逐条核查证据

### 1) 模式开关整组不渲染 —— 核查通过

`src/components/Header.tsx:76-98`：

```
{mode === 'edit' && (
  <div className="seg chrome glass" role="group" aria-label="模式开关">
    <button ... data-testid="mode-edit" ... />
    <button ... data-testid="mode-guest" ... />
  </div>
)}
```

`{cond && (<jsx/>)}` 在 `cond` 为假时该子树根本不进入 React 树、浏览器 DOM 里不存在——不是 CSS `display:none`，不是 `disabled` 属性。guest 模式下 `mode==='guest'`，条件为假，`.seg` 整组（含 `mode-edit`/`mode-guest` 两枚按钮）不挂载。判定：满足。

### 2) 上传／删除／重命名入口 guest 模式下不可见 —— 代码层面通过（但见第三节的回归）

- `src/components/Workbench.tsx:115-126`：`{state.mode === 'edit' && (<ItemTray ... />)}` —— dock 整体只在 edit 模式挂载；guest 模式下 `ItemTray` 内的 `UploadEntry`（上传）、`ItemDelete`（删除，`ItemTray.tsx:67-125`）、物件名 `InlineEdit`（重命名，`ItemTray.tsx:343-372`）三者随父组件一并不挂载。
- `src/components/Header.tsx:35-66`：陈列室名（品牌章）重命名入口——edit 模式渲染可点 `<h1 role="button" onClick={beginEdit}>`，guest 模式渲染纯展示 `<h1>`（无 `role`/`onClick`/`tabIndex`）。
- `src/components/SceneBar.tsx:143-145`（场景删除次级入口）与 `150-191`（＋新场景入口）均包在 `{editable && (...)}`（`editable = state.mode === 'edit'`），guest 下不渲染；chip 点击逻辑 `active && editable ? beginEdit() : onSelectScene()`（第 134 行）、双击 `editable && beginEdit()`（第 135 行）——guest 下 `editable=false`，点/双击 chip 只切场景，不进改名。
- `src/state/gallery.ts` reducer 纵深防御：`set-item-name`(228行)/`set-gallery-name`(307行)/`add-item`(243行)/`delete-item`(271行)/`move-placement`/`resize-placement`/`rotate-placement`/`remove-placement`/`place-item`/`set-item-story` 等写操作均以 `if (state.mode !== 'edit') return state;` 起手拒绝。
- 单独代码走查判定：满足。**但该结论在真实交互链路下被第三节记录的既有 e2e 回归推翻，需与该发现合并判断，见结论。**

### 3) 点物件只弹「故事＋原图」—— 核查通过

`src/components/Canvas.tsx:562-567`：`<img>` 的 `onClick`——`if (!editable){ e.stopPropagation(); setStoryOpenId(p.id); }`；`showChrome = selected && editable`（第 525 行）门控选中框／四角缩放手柄／旋转钮／工具条，guest 下 `editable=false`，全部不渲染。

`src/components/StoryModal.tsx`：`editable` 为 false 时只渲染 `story__body`（故事正文，第 90-93 行）与 `story__orig`（原始照片，第 95-104 行）；`textarea`/`保存故事`/`取消` 全部包在 `{editable && (...)}`（第 80-88 行、106-125 行），guest 下不渲染。判定：满足。

### 4) 唯一退出路径（`?edit`）—— 核查通过

全仓 `grep -rn "set-mode\|onModeChange"`：

```
src/state/gallery.ts:27,137        类型定义 + reducer case（无 mode 守卫，对称允许 edit<->guest 双向切换，合理）
src/components/Workbench.tsx:100  onModeChange={(mode) => dispatch({ type: 'set-mode', mode })}
src/components/Header.tsx:84,93   两枚按钮各自 onClick（现整组仅 edit 模式渲染）
```

除此之外全仓无第二处 UI 触发 `set-mode`。`src/App.tsx:24-36` 的 `?edit` 后门经 `useReducer` 惰性初始化器实现，不经过 `dispatch`，不受 Header 收起影响。判定：Header 两枚按钮是唯一的 UI 触发点、已随模式收口；`?edit` 是仅剩的另一条路径——满足。

### 5) 未触碰 E1-S1 相关代码 —— 尽力核查通过（无 git 历史可比对，确认强度弱于其余条目）

`/Users/yuriiiz/Projects/Memories` 不是 git 仓库（`ls -la` 无 `.git` 目录），无法用 `git diff` 精确核对改动范围，只能通读现状代码判断其“完整、自洽、注释与实现一致”：

- `src/components/ItemTray.tsx:173-236`：`finalizeRef` + window 级 `pointerup`/`pointercancel`/`pointermove`/`blur` 兜底监听——完整存在，逻辑自洽，注释仍标注「E1-S1」。
- `src/App.tsx:51-83`：hydrate 回填 effect（`hydrate-item-image`）；`89-98`：objectURL 释放 reconcile effect；`101-107`：卸载兜底 revoke——三个 effect 均完整存在，与 receipt-builder.md 描述一致。
- 结论：现状代码与 E1-S1 应有形态一致，未见破坏迹象；但因缺乏版本对比手段，这一条不能做到 100% 确证，如实记录这一局限。

### 6) `npm run build` —— 亲自跑，核查通过

命令：`npm run build`（cwd=`/Users/yuriiiz/Projects/Memories`）

关键输出：

```
> memories@0.1.0 build
> tsc -b && vite build

vite v7.3.6 building client environment for production...
✓ 64 modules transformed.
...
dist/assets/index-Cs-02zQB.js   234.76 kB │ gzip: 73.39 kB
✓ built in 379ms
EXIT_CODE=0
```

`tsc -b` 无类型错误、`vite build` 成功、进程 exit 0。判定：满足。

## 三、发现的问题（导致本轮打回）

代码走查判「达标」后，又亲自跑了一遍项目既有的 e2e 套件做交叉验证（`npx playwright test`；Playwright 自带 webServer 会自动起 `vite dev`，不需要人工开浏览器——这一点很关键，见下）。这套 e2e 不是本 sprint 新增的断言，是过去里程碑（M3/M4/N4/U3/U4）留下的官方验收测试，理应在本轮改动前后都保持全绿。

**实测结果：59 个测试里 9 个失败、50 个通过**，全部败在同一个根因：

```
FAIL  e2e/m3-story.spec.ts:171  ③ 切游客模式：点物件只弹故事+原图……
FAIL  e2e/m4-full.spec.ts:447   全流程主链路（PC / 768px / 375px 三个视口，共 3 个失败）
FAIL  e2e/n4-full.spec.ts:580   N4 全流程主链路（PC1920 / phone844×390，共 2 个失败）
FAIL  e2e/u3-guest.spec.ts:153  游客模式只读复核：无上传/删除/重命名入口……
FAIL  e2e/u4-full.spec.ts:501   U4 全流程主链路（PC1920 / 横屏手机844×390，共 2 个失败）
```

代表性报错（`e2e/u3-guest.spec.ts:200-202`）：

```ts
// ============ 切到游客模式 ============
await page.getByTestId('mode-guest').click();
await expect(page.getByTestId('mode-guest')).toHaveAttribute('aria-pressed', 'true');
```

```
Error: expect(locator).toHaveAttribute(expected) failed
Locator: getByTestId('mode-guest')
Expected: "true"
Error: element(s) not found
    at e2e/u3-guest.spec.ts:202:48
```

其余 8 个失败点位（`m3-story.spec.ts:185`、`n4-full.spec.ts:379`×2、`u4-full.spec.ts:462`×2、`m4-full.spec.ts` 对应行×3）报错模式完全一致：均是在编辑模式下点「游客」按钮切换到 guest 后，立刻断言 `mode-guest`（有的还接着断言 `mode-edit`）这枚按钮的 `aria-pressed` 属性，而该按钮此时已随模式切换从 DOM 里消失。

**根因**：这 9 个既有测试的手法是——在编辑模式下点「游客」按钮切到 guest，随即断言**刚点击的这枚按钮自身**的 `aria-pressed` 状态。这在旧实现（模式开关组永远渲染、无 guest 判断——正是本 sprint 要修的那个 bug）下成立；但本轮改动把整组按钮改成 `{mode === 'edit' && (...)}`，一旦 `state.mode` 变成 `'guest'`，这组按钮（含刚点击的那一枚）随即整体从 DOM 消失——这正是本 sprint 要求的正确行为，但也让这 9 个测试的断言前提被推翻，全部失败。

这不是「标准之外的个人偏好」：这 9 个测试是 M3/M4/N4/U3/U4 五个里程碑的官方全链路验收 e2e（`u3-guest.spec.ts` 开头注释明确写「milestones.json U3 criteria[2] / success.json「游客模式无上传入口」」），此前应为通过状态，是这次改动的直接副作用把它们改坏了、影响面覆盖五个里程碑。建造员的自检记录（`receipts/E1-S2/receipt-builder.md` 第六节）只跑了 `npm run build`，完全没有跑过既有 e2e 套件——其第四节自陈「无浏览器，靠通读代码路径验证」，但 `npm run e2e`（Playwright）自带无头浏览器与自动起服务，并不需要建造员本人手动开浏览器，这个验证手段本可以、也应该被使用，因而这处回归本可在自检阶段被发现却被漏掉。

## 四、结论

逐条对照任务书验收清单：1/3/4/6 单独核查通过；6 亲自跑 `npm run build` 复核为 exit 0；2 在孤立代码走查层面通过，但第三节记录的既有 e2e 回归证明其在真实交互链路下把 5 个里程碑（M3/M4/N4/U3/U4）已验收的行为改坏了；5 尽力确认、受限于无 git 历史，未见破坏迹象。

**因改动导致 9 个既有里程碑官方 e2e 测试从（理应）通过变为失败，覆盖 M3/M4/N4/U3/U4 五个全链路验收套件，判定本轮不达标，打回。** 打回理由：`Header.tsx` 模式开关整组仅 edit 渲染这一改动本身逻辑正确、达成本 sprint 硬指标；但产生了未被建造员自查发现、影响面覆盖 5 个里程碑的既有测试回归。需要建造员一并处理受影响的 e2e 断言（更新为匹配新的正确行为——即断言切到 guest 后 `mode-guest`/`mode-edit` 两枚按钮均不存在，而非断言其 `aria-pressed` 值），并在自检中补跑一次 `npx playwright test` 全量确认回到全绿后再交。

---

## 第二轮复核（返工后）

日期：2026-07-19（同日第二轮）

建造员返工说法：把第一轮点名的 5 个测试文件（`e2e/u3-guest.spec.ts`、`e2e/m3-story.spec.ts`、`e2e/m4-full.spec.ts`、`e2e/n4-full.spec.ts`、`e2e/u4-full.spec.ts`）里「切到 guest 后断言刚点击的按钮 `aria-pressed`」的写法，改成断言 `mode-guest`/`mode-edit` 两枚按钮 `toHaveCount(0)`；m4/n4 里原本靠点按钮切回编辑模式的地方，因 guest 下按钮已不渲染，改走 `?edit` URL 后门；自称复跑 `npx playwright test` 后 59/59 全绿、`npm run build` exit 0。本轮逐条重新核查，不采信自报。

### 1) 逐个核对 5 个测试文件的改动断言

**`e2e/u3-guest.spec.ts:200-207`**：

```ts
// ============ 切到游客模式 ============
await page.getByTestId('mode-guest').click();
// E1-S2·游客不可逆守卫：切到 guest 后「模式开关」整组按钮整体不再渲染……
await expect(page.getByTestId('mode-guest')).toHaveCount(0);
await expect(page.getByTestId('mode-edit')).toHaveCount(0);
```

与第一轮记录的旧写法（`await expect(page.getByTestId('mode-guest')).toHaveAttribute('aria-pressed', 'true');`）对比：仅这一行断言被替换为两行 `toHaveCount(0)`，外加一段解释性注释；紧随其后的「A. 逐项复核」整段（`tray`/`upload-add`/`upload-quota`/`item-delete`/`item-name`/`add-scene`/`scene-delete`/`handle-scale`/`handle-rotate`/`placement-toolbar`/`placement-remove`/`placement-story` 全部 `toHaveCount(0)`）、「B/C 陈列室名与场景名不可改」、「D 点物件只弹故事+原图（只读）」、「E 物件不可移动」、「F 数据基线完全一致」各段落逐行核对，与打回前一字未改。**业务意图未被弱化。**

**`e2e/m3-story.spec.ts:183-191`**：同款替换（`mode-guest`/`mode-edit` 两枚 `toHaveCount(0)`），随后「点物件只弹故事+原图、不出手柄、不可编辑、不可拖动」整段（第 199-241 行）逐行核对未改动。

**`e2e/m4-full.spec.ts:323-330`**：同款替换。第 332-346 行「点物件→只读故事弹窗」整段业务断言未改。**第 348-354 行新增**：

```ts
// 回编辑模式，继续搭多场景。E1-S2·游客不可逆守卫下模式开关整组在 guest 已不渲染、界面上无按钮可切回，
//   唯一退出路径是 ?edit URL 后门……
await page.goto('/?edit');
await expect(page.getByTestId('app')).toBeVisible();
await expect(page.getByTestId('mode-edit')).toHaveAttribute('aria-pressed', 'true');
```
用于承接后续「多场景+背景不可重复上限3、跨场景故事同步」的剩余链路，见第 2 节判断。

**`e2e/n4-full.spec.ts:377-384`**：同款按钮替换；**第 416-422 行**同款新增 `page.goto('/?edit')` 回编辑模式，承接后续场景改名/删除/物件改名/陈列室改名等剩余链路。业务断言段落（第 386-414 行「切游客只读看故事+原图」）逐行核对未改动。

**`e2e/u4-full.spec.ts:461-468`**：同款按钮替换，且这条链路的「游客」段落是全链路的最后一步（第 470-496 行「点物件→只读故事弹窗」验证完即结束），**没有**加 `?edit` 回编辑——核对合理：该测试切到 guest 之后不再需要继续任何编辑操作，无需回退。

结论：5 处改动手法一致、克制（只动了必须动的那一行/那一段），均未删减或弱化原测试的业务结论（U3 的「无上传/删除/重命名入口」、M3/M4/N4/U4 的「点物件只弹故事+原图」核心断言段落逐行核对与打回前完全一致）。**判定：满足。**

### 2) `?edit` 后门改法是否引入新问题 —— 核查通过

- `m4-full.spec.ts`/`n4-full.spec.ts` 在切到 guest 之后都还要继续跑「多场景管理／改名／跨场景同步」等剩余链路，必须先回到 edit 模式；`u3-guest.spec.ts`/`m3-story.spec.ts`/`u4-full.spec.ts` 的 guest 段落都是各自测试的最后一步，不需要回编辑，因此这两个文件没有加 `?edit`，与实际需要吻合，未见「该加而没加」或「不该加却加了」的错配。
- 用 `?edit` 代替「点编辑按钮切回」不会绕开正常路径而损失覆盖：点「编辑」按钮切回本就是**这个 sprint 明确要移除的旧（不安全）行为**——guest 下该按钮已不存在，不存在“本该走却被绕开”的正常路径；`?edit` 正是本 sprint 设计文档点名的唯一官方退出路径，用它验证「回到 edit 后模式开关整组重新渲染、`mode-edit` 恒为激活态」（`m4-full.spec.ts:354`、`n4-full.spec.ts:422`）反而额外覆盖了这条新退出路径本身的正确性，是覆盖面的增益而非损失。
- 检查 `page.goto('/?edit')` 是否会丢失之前挂的错误监听（`page.on('pageerror'/'console')` 与 `addInitScript`）：两者都是 Playwright `page` 级别的监听，`goto` 触发的整页导航不会移除它们（`addInitScript` 会在新文档里重新执行），`assertNoRuntimeErrors` 仍在跑通全程后于文件末尾统一核对——未见错误监听因此被绕开或漏跑的迹象。
- 核查 `?edit` 依赖的持久化时序：切换前的场景/物件/故事数据已经过 `saveState`（`App.tsx` 的 `useEffect`，依赖 `[state]`，每次状态变更都会跑）落盘，`page.goto('/?edit')` 触发整页刷新走 `loadState()` + query 覆盖 mode，读到的就是切换前的最新数据——`m4-full.spec.ts:358` 起继续对同一批场景/物件操作不会因为这次导航丢数据，实测也证实了这一点（见下方全量结果）。

**判定：`?edit` 替代改法未引入新问题，覆盖意义未受损。**

### 3) 亲自重新跑 `npx playwright test` 全量套件 —— 不采信builder自报，亲自验证

命令：`npx playwright test`（cwd=`/Users/yuriiiz/Projects/Memories`，webServer 自动起 `vite dev`）

实测结果（完整跑完 59 个用例，逐一列出）：

```
Running 59 tests using 1 worker
...
59 passed (55.2s)
PLAYWRIGHT_EXIT_CODE=0
```

第一轮打回涉及的 9 个用例（`u3-guest.spec.ts`、`m3-story.spec.ts:171`、`m4-full.spec.ts` ×3 视口、`n4-full.spec.ts` ×2 视口、`u4-full.spec.ts` ×2 视口）本轮全部在通过列表内（编号 `[8/59]`、`[10/59]`、`[11-13/59]`、`[36-37/59]`、`[52/59]`、`[58-59/59]`），无一失败。**判定：满足，与建造员自报的「59/59」一致（本轮独立复验，非采信自报）。**

### 4) 亲自重新跑 `npm run build` —— 通过

命令：`npm run build`（cwd=`/Users/yuriiiz/Projects/Memories`）

```
> memories@0.1.0 build
> tsc -b && vite build
✓ 64 modules transformed.
...
✓ built in 360ms
BUILD_EXIT_CODE=0
```

`tsc -b` 无类型错误、`vite build` 成功、exit 0。**判定：满足。**

### 5) 生产代码未被顺手改动的确认

`grep` 复核 `src/components/Header.tsx`（`mode === 'edit' &&` 仍在第 76 行）与 `src/App.tsx`（`URLSearchParams` 后门逻辑仍在第 28 行）——本轮返工只动了 5 个测试文件，生产代码（`Header.tsx`/`App.tsx`）与第一轮核查时一致，未见夹带修改。

### 第二轮结论

逐条对照：1（5 处测试改动手法核对，业务意图未减）满足；2（`?edit` 改法未绕开正常路径、未损失覆盖）满足；3（亲自重跑 e2e 全量 59/59 通过，非采信自报）满足；4（亲自重跑 build，exit 0）满足；5（生产代码未被顺手改动）确认。

第一轮打回的唯一问题——「模式开关整组不渲染的实现导致既有里程碑 e2e 回归」——已通过更新受影响测试断言（而非改动产品行为）妥善解决，且经本轮独立复验（非采信builder自报）证实 e2e 全量与 build 均通过。**本轮判定：pass，放行。** 与第一轮同理提醒：本次是团队内自检通过，不代表底座最终验收结论。
