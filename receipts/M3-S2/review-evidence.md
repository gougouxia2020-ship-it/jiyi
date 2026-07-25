# review-evidence · M3-S2 · reviewer

角色：general 队 reviewer。对照 `.opc/sprints/M3-S2.json` goal（含【验收硬指标】原文）与
`.opc/phase1/milestones.json` M3 条目验收标准，逐条亲手核查建造员交付物（不采信
`receipts/M3-S2/receipt-builder.md` 自述，全部重跑/重看/重测）。

裁决：**pass**（挑不出可对照标准站住的问题，可定稿）。

---

## 0. 读档确认

- 岗位角色说明书 `utohub-opc/teams/general/roles/reviewer.md`、技能 `skills/review-against-criteria.md` 已读：
  只认标准不认口味、亲手验证、逐条留证、打回需四件套。
- `.opc/phase1/milestones.json` M3 条目、`.opc/phase1/success.json`、`.opc/sprints/M3-S2.json` 的 goal 字段
  （含【验收硬指标】段：故事弹窗视觉原文 + 交互铁律原文 + milestones criteria 原文）已读，本轮核查尺子只取
  这段点名的子集，不拿 M4/全册标准误伤本切片。
- 视觉参考 `.opc/phase1/taste/taste.json`、`taste/examples/design.md`、`taste/examples/tokens.css`、
  `taste/examples/A-旧信.html`（grep 剥离 `.popup` 相关 CSS/HTML 片段）已读。
- `receipts/M3-S2/receipt-builder.md` 已通读，了解建造员自称做了什么、怎么自检的。

---

## 1. e2e/m3-story.spec.ts —— 亲跑 + 逐段核对链路

```
$ npx playwright test e2e/m3-story.spec.ts --reporter=line
Running 3 tests using 1 worker
[1/3] ① 选中物件写故事 → 保存 → 刷新后故事完整还原（故事挂 Item，全量持久化）
[2/3] ② 同一物件摆入两个场景：一处改故事 → 另一场景同步为最新值（跨场景同步，双向）
[3/3] ③ 切游客模式：点物件只弹故事+原图（只读），不出手柄、不可编辑、不可拖动/移除
3 passed (3.4s)
```

exit 0，与建造员自述一致。逐段读源码核对是否真覆盖 milestones.json M3 criteria 点名的完整链路
「选中物件写故事→刷新后还原→同一物件在另一场景故事同步更新→切游客模式点物件只弹故事+原图且不可编辑/移动」：

- **①选中写故事→刷新还原**（第 110-133 行）：`writeStory` 走真实交互（选中→点「✎」手柄→打开 `data-mode=edit` 弹窗→
  填 textarea→点保存→断言弹窗关闭）；额外读 LocalStorage 断言 `item.story` 已落且 `schemaVersion=1`（不是只看
  UI 状态，连持久化字节都核了）；`page.reload()` 真刷新后用 `readStoryViaEditor` 重新打开弹窗读回文本，
  `expect(...).toBe(STORY)` 精确比对，非近似判定。**覆盖到位，断言强度够。**
- **②跨场景同步（双向）**（第 135-169 行）：客厅放物件 X 写 S1 → 建书房、放同一 itemId（`expect(itemIdB).toBe(itemId)`
  确认真是同一物件、非另建一件同名物件）→ 断言书房读到 S1（证明挂 Item 非 Placement）→ 书房改 S2 → 切回客厅断言
  已同步为 S2（反向同步）→ 刷新后两场景都读 S2。双向 + 刷新后一致性都测了，比 criteria 原文「同步更新」的单向
  最低要求更严格。**覆盖到位。**
- **③游客模式只读**（第 171-239 行）：编辑模式先备数据（放物件+写故事）→ 记录游客前 x/y → 切 `mode-guest`
  （断言 `aria-pressed` 两侧状态）→ 断言切模式即关闭任何弹窗 → 点物件 → 断言弹窗 `data-mode=guest` 且可见
  `story-body`（内容=已写故事）与 `story-photo`（有 src）与「它的故事」kicker → 断言 `story-input`/
  `story-save`/`story-cancel` 均 `toHaveCount(0)`（不可编辑）→ 断言 `handle-scale`/`handle-rotate`/
  `placement-remove`/`placement-story`/`.stage__frame` 均 `toHaveCount(0)`（无手柄）→ ✕ 关闭 → 再弹出 → 点画布
  空白关闭（铁律「再点空白/✕ 关闭」两种关闭方式都验了）→ 用真实 `page.mouse` 拖拽序列（非 force click）对物件
  做位移尝试，断言 x/y 不变（不可拖动）且拖拽过程中仍不出手柄。**四步链路一步不缺，断言点对点覆盖 criteria 原文
  的每个分句，非只测了测试名字暗示的表面行为。**

**判定：达标，e2e 真实覆盖 M3 criteria 全链路，非放水/凑数测试。**

---

## 2. 视觉硬指标 —— 逐条对照 design.md 原文 + tokens.css + A-旧信.html 的 `.popup`

读 `src/components/StoryModal.tsx`、`src/App.css`（`.story*` 整段），与
`taste/examples/A-旧信.html` 的 `.popup` CSS（第 43-53 行，脚本 grep 剥离比对）逐条核对：

| 硬指标（design.md 原文） | 实现 | 对照结果 |
| --- | --- | --- |
| 半透明奶油底 `--color-popup` | `.story{background:var(--color-popup)}` | 一致（tokens.css `--color-popup:rgba(250,244,232,.87)`，工程照 token 走、不是照抄 demo 里的渐变写法——tokens.css 头部注明"工程照它做"，token 是权威尺，demo 渐变属早期草稿） |
| `backdrop-filter: blur(9px)` 透出背后房间 | `.story{backdrop-filter:blur(9px) saturate(1.06); -webkit-backdrop-filter:...}` | 与 demo `.popup` 逐字节一致（`blur(9px) saturate(1.06)`） |
| 陶土红描边 | `.story{border:1px solid var(--color-popup-line)}` | tokens `--color-popup-line:rgba(168,87,47,.42)`，与 demo `border:1px solid rgba(168,87,47,.42)` 数值相同 |
| `--shadow-float` 浮动阴影 | `.story{box-shadow:var(--shadow-float)}` | tokens `--shadow-float:0 22px 48px -16px rgba(60,40,20,.6)`，与 demo `box-shadow` 数值相同 |
| ✕ 关闭 | `.story__close`（`testid=story-close`，右上角圆钮，`onClick=onClose`） | 位置/尺寸（right:11px/top:11px/24×24/圆角）与 demo `.popup .x` 一致 |
| 「它的故事」kicker | `.story__kicker`（陶土红、大写字距、`text-transform:uppercase`） | 文案与视觉均对齐 demo `.popup .k`「它的故事」 |
| 衬线标题 | `.story__name{font-family:var(--font-serif);font-size:var(--text-title);font-weight:400}` | 与 demo `.popup h3`（22px/400/serif）一致 |
| meta | `.story__meta`「陈列于「{场景名}」」 | 内容语义对应，位置/字号一致 |
| 故事正文（衬线） | `.story__body{font-family:var(--font-serif)}`（游客只读）/ `.story__input`（编辑 textarea，同样衬线） | 满足「衬线正文」要求 |
| 「原始照片」缩略 | `.story__orig`（顶部陶土红虚线分隔 `border-top:1px dashed var(--color-popup-line)`）+ `.story__orig-cap`「原始照片」+ `.story__photo`（`testid=story-photo`，`object-fit:contain`，`height:110px`，`background-color:rgba(239,230,212,.55)`） | 与 demo `.popup .orig`（`border-top:1px dashed rgba(168,87,47,.32)`）+ `.orig .cap` + `.orig .itm`（`height:110px`, 同背景色）逐值对齐 |
| 不占画布宽度、不做右侧常驻面板 | `.story{position:absolute;right:26px;top:50%;transform:translateY(-50%);width:290px}`，仅 `{storyItem && <StoryModal/>}` 条件渲染（点物件才弹、非常驻） | 数值（right:26px/top:50%/290px）与 demo `.popup` 逐字节相同；条件渲染确认非常驻面板 |

**截图实测**（`npm run dev` 起服务 + 独立 Playwright 脚本截图，非采信建造员自述）：
编辑态截图可见半透明奶油底透出背后书房场景（窗户/书架轮廓可透视模糊可见）、陶土红描边、右上✕、
「它的故事」kicker、衬线标题「全家福旧照」、meta「陈列于「书房」」、textarea 输入区、取消/保存故事按钮、
底部虚线分隔+「原始照片」缩略图，均正确渲染。游客态截图同样正确渲染半透明模糊背景+kicker+标题+meta+
正文+原图，且**没有** textarea/保存/取消（只读）。两态视觉均达标，未发现渲染缺陷或元素缺失。

**判定：达标，逐条数值级对照 demo 与 tokens，非只凭肉眼「差不多」。**

---

## 3. 游客模式只读约束 —— 代码级核查（非只搜「游客模式」字样）

- **不可编辑故事**：`Canvas.tsx` 渲染 `<StoryModal editable={editable} .../>`，`editable = state.mode === 'edit'`；
  `StoryModal.tsx` 内 textarea + 保存/取消按钮整段包在 `{editable && (...)}` 条件渲染里（第 68-113 行），
  游客态该 DOM 根本不存在（非只是 disabled）。
- **reducer 层二次守卫**：`src/state/gallery.ts` 第 157-171 行 `set-item-story` case 首句
  `if (state.mode !== 'edit') return state;`——即便 UI 层被绕过，reducer 也拒绝写入。
  同款守卫见于 `move-placement`（第 113-123 行）、`scale-placement`（125-135）、`rotate-placement`（137-147）、
  `remove-placement`（149-155）、`place-item`（89-111），全部 `if (state.mode !== 'edit') return state;`
  ——双层防御，非只在一处判断。
- **不可拖动/缩放/旋转/移除**：`Canvas.tsx` 的 `onItemPointerDown`（第 132-173 行）在
  `e.stopPropagation()` 之后紧跟 `if (!editable) return;`——游客态直接返回，**从不建立 `gestureRef`**，
  也**从不调用 `setSelectedId`**（第 170 行在 return 之后才执行），故 `selectedId` 在游客模式下永远不会被置位。
  `onScalePointerDown`/`onRotatePointerDown` 同款守卫（179-181、220-222 行）。
- **不出选中态手柄**：手柄链渲染条件 `const showChrome = selected && editable;`（第 370 行）。因游客模式下
  `selectedId` 永远为 `null`（见上），`selected` 恒 `false`，`showChrome` 双重恒 `false`——不是单一条件，
  是「选中态从不产生」+「即便产生也被 editable 拦」的双保险。
  `.stage[data-mode='guest'] .stage__node{cursor:pointer}`（`App.css` 第 343-345 行）把光标提示也换成
  「可点查看」而非抓取，UX 上也一致传达「不可拖动」。
- **点物件只弹故事+原图**：`.stage__node` 的 `onClick`（第 401-406 行）
  `if (!editable) { e.stopPropagation(); setStoryOpenId(p.id); }`——游客态点击唯一效果就是开只读弹窗。

以上均为亲读源码逐行核对的条件判断，非只 grep「游客模式」字样。**判定：达标，只读约束在 UI 层与 reducer
层双重生效，无绕过口子。**

---

## 4. 全量 e2e 回归（亲跑）

```
$ npx playwright test --reporter=line
Running 8 tests using 1 worker
[1/8] m1-shell.spec.ts:34  建场景 → 切场景 → 刷新后场景与布局状态完整还原
[2/8] m1-shell.spec.ts:82  物件抽屉列出全部 14 件物件
[3/8] m1-shell.spec.ts:87  场景背景不可重复且最多 3 个：第 4 个被阻止并置灰"素材已用完"
[4/8] m2-transform.spec.ts:84  全链路变换：抽屉拖入 → 拖动改位 → 角手柄缩放 → 顶部手柄旋转 → 移除 → 刷新完整还原
[5/8] m2-transform.spec.ts:198  抽屉拖入落到画布外 → 不建 placement
[6/8] m3-story.spec.ts:110  ①
[7/8] m3-story.spec.ts:135  ②
[8/8] m3-story.spec.ts:171  ③
8 passed (6.5s)
```

`npm run build`（`tsc -b && vite build`）亦亲跑一遍：exit 0，无类型错误，`dist/` 正常产出（构建产物含
3 背景+14 物件素材，数量未变）。全仓 `grep -rn "StoryEditor"` 确认已删除的 `StoryEditor.tsx` 无任何残留
引用（包括 `App.tsx`/`Workbench.tsx` 等），未留死代码/悬空 import。

**判定：无回归，M1/M2 全绿，构建通过。**

---

## 5. 核实建造员备注："应用外壳约 441px 宽，非本次改动导致"

这是本轮被点名重点核查的一条。**亲自实测 + 翻查历史证据，结论：claim 成立（有依据、确非本 sprint 引入），
但具体像素数字有出入，已在下方说明。**

### 5.1 亲自复现（独立脚本，非采信建造员自述）

起 `npm run dev`，用独立 Playwright 脚本在 1280×800 视口测量（`getBoundingClientRect`）：

```
no-scene                       { rootBox: { width: 486.56, height: 756 }, appBox: { width: 486.56, height: 813.25 } }
after-create-scene-no-items    { rootBox: { width: 484.73, ... }, appBox: { width: 484.73, ... } }
after-place-1-item             { rootBox: { width: 484.73, ... }, appBox: { width: 484.73, ... } }
```

确认 `.app` 实际渲染宽度远小于 `max-width:1180px`（约 485-490px，视场景/物件状态略有浮动），
现象真实存在，非建造员凭空捏造。

### 5.2 根因核查（读代码，非采信自述）

- `src/index.css` 第 9-13 行：`html,body,#root{height:100%}`——**`#root` 没有设置 `width`**。
- `src/App.css` 第 7-11 行：`body{padding:var(--space-lg);display:flex;justify-content:center}`——
  `#root` 是 `body` 的 flex 子项，未显式 `width` 时按内容收缩（shrink-to-fit）。
- `src/App.css` 第 14-22 行：`.app{width:100%;max-width:1180px;...}`——`.app` 的 `width:100%` 是对着
  已经收缩的 `#root` 解析，形成"父按子收缩、子又按父 100% 撑"的循环，`.app` 最终宽度由 `.top`/`.scenes`/
  `.foot`（真正贡献 max-content 宽度的行内内容）等**普通文档流元素**的内容宽度决定，而非 1180px。
  这与建造员回执里的诊断逐字一致，且我独立读代码验证机制成立（非照抄自述）。
- **`.story` 弹窗本身是 `position:absolute`**（`App.css` 第 500 行起），脱离文档流，不participate 于
  `#root` 的 shrink-to-fit 宽度计算——结构上确实不可能是本轮宽度收缩的成因。

### 5.3 是否本 sprint 引入——用更早的历史证据交叉验证（本轮独立发现，非采信自述）

`grep` 全部历史 receipts 后发现：**这个 bug 在 M2-S2（本 sprint 两轮之前）就已经被记录过**，
`receipts/M2-S2/receipt-builder.md` 第 103 行：

> 【观察·非本 sprint】应用整体宽度偏窄（预存 M1 布局）：`src/App.css` 的 `body{display:flex;justify-content:center}`
> 的 flex 子项是 `#root`（`index.css` 未给 `#root` 宽度），`#root` 收缩到内容宽 → `.app` 的
> `width:100%/max-width:1180` 无从铺满，**实测应用约 490px**、画布约 350px（PC 1280 视口）。这是 M1 外壳布局、
> M1 已判过……

——与本轮 M3-S2 建造员的诊断（body flex + #root 无宽度 + .app width:100%）**根因描述完全一致**，且
M2-S2 当时测得约 **490px**，与我本轮独立实测的 **485-490px** 几乎相同，说明**这个宽度从 M2-S2 到 M3-S2
基本没有变化**——即 M3-S2 的改动（只涉及 `.story*` 规则新增 + 游客光标 + 窄屏弹窗媒体查询，均未碰
`body`/`.app`/`.grid` 的宽度相关规则，经比对 `receipt-builder.md` 改动清单与本轮通读的 `App.css` 全文确认）
**没有让外壳变得更窄，也不是它引入的**。

- 唯一存疑点：建造员本轮写的具体数字「约 441px」与 M2-S2 记录的「约 490px」、以及我本轮独立实测的
  「约 485-490px」都对不上（差 40-50px）。这个具体像素数字大概率是建造员在某个不同状态/环境下量的
  （比如已建满场景+多条 placement+某次浏览器渲染差异），**数字本身不够精确**，但不影响"非本次改动导致、
  是 M1 遗留问题"这个核心结论——核心结论有独立的历史证据（M2-S2 已记录，早于本 sprint）与本轮实测
  （宽度与 M2-S2 时期基本不变）双重支撑，站得住。

### 5.4 是否属于本 sprint 验收范围

`sprints/M3-S2.json` 的 goal【验收硬指标】只点名：e2e 全链路、故事弹窗视觉（半透明底/blur/描边/阴影/
关闭/kicker/标题/meta/正文/原图缩略/不占画布宽度/不做常驻面板）、游客只读约束。**应用外壳总宽度是否
=1180px 不在本 sprint 点名的硬指标之内**——它是 `milestones.json` M1 条目「外壳视觉还原」的验收范围，
且 M1 已定稿（`status:"done"`，`verdicts:[{milestone:"M1",pass:true,failed:[]}]`）。按评审员「只对照
标准逐条判、不拿全册标准误伤」的职责边界，此项不构成本 sprint 的打回理由；且经核实它确非本 sprint
引入，属于应另开一轮/另行授权修复的 M1 遗留问题（建造员回执已如实标注、未隐瞒、未擅自碰 M1 范畴代码，
处置方式恰当）。

**判定：建造员的「非本次改动导致」结论成立，证据充分（历史记录+独立实测双重交叉验证），具体像素数字
有出入但不影响结论；不作为本 sprint 打回理由，仅记录供后续另行处理。**

---

## 6. receipts/M3-S2/receipt-builder.md 核对

内容与本人亲自复核结果一致：改动文件清单准确（`StoryModal.tsx`新增、`StoryEditor.tsx`删除、
`Canvas.tsx`/`App.css`/`e2e/m3-story.spec.ts`改动，未提及/未触碰 `.opc/`）；每条硬指标的实现说明与本轮
读码结果吻合；自检命令结果（build/e2e 单条/e2e 全量）与本轮亲跑结果一致；§5 的外壳宽度备注经查证属实
（见上）。未发现自述与实测不符之处。

---

## 结论

- e2e/m3-story.spec.ts 真实覆盖 M3 criteria 点名的完整链路，3 passed / exit 0，断言强度经得起复核。
- 故事弹窗视觉逐条数值级对照 design.md + tokens.css + A-旧信.html `.popup`，全部达标，截图实测确认渲染正确。
- 游客模式只读约束在 UI 层（条件渲染/提前 return）与 reducer 层（`mode!=='edit'` 守卫）双重生效，代码级核实无绕过口子。
- 全量 e2e（8 passed）与生产构建均无回归；已删除的 `StoryEditor.tsx` 无残留引用。
- 建造员关于「应用外壳约 441px 宽、非本次改动导致」的备注：核实为真实存在的 M1 遗留问题，根因诊断正确，
  且与 M2-S2 时期已记录的同一现象（约 490px）互相印证、宽度未因本 sprint 恶化；具体像素数字不够精确但不
  影响结论；不在本 sprint 验收范围内，不作打回理由。

**放行定稿（pass）**，无需打回。
