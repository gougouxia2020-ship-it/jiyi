# M3-S2 建造回执 · 半透明故事弹窗 + 编辑/游客双模式收口

sprint：M3-S2　团队：general　岗位：builder

## 一、本轮做了什么（改动文件清单）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/components/StoryModal.tsx` | **新增** | 半透明故事弹窗组件（双模式）。取代 M3-S1 的最小编辑面板 `StoryEditor.tsx`。 |
| `src/components/StoryEditor.tsx` | **删除** | 被 StoryModal 取代（旧组件只有编辑态、无游客只读态、无最终弹窗视觉）。 |
| `src/components/Canvas.tsx` | 改 | 故事弹窗入口按模式分流；游客模式点物件弹只读弹窗；点空白/切模式关弹窗；stage 挂 `data-mode`。 |
| `src/App.css` | 改 | `.story*` 整段重写为「旧信」DNA 半透明奶油弹窗（对齐 A-旧信.html 的 `.popup`）；补游客光标；补窄屏弹窗贴底样式。 |
| `e2e/m3-story.spec.ts` | 改（补齐） | 由 M3-S1 的 2 条（前三步）补成 3 条，覆盖 milestones.json M3 criteria 的全 4 步链路。 |

未触碰 `.opc/`（唯一禁区）。落档动作留给主控。

## 二、每条验收硬指标怎么实现的

硬指标原文取自 `sprints/M3-S2.json` 的 goal（含【验收硬指标】段），逐条对账：

### 1. 半透明故事弹窗视觉（design.md 原文）
> 半透明奶油弹窗浮于画布之上，`--color-popup` + `backdrop-filter: blur(9px)`，透出背后房间；陶土红描边、`--shadow-float`；内含 ✕ 关闭、'它的故事' kicker、衬线标题、meta、故事正文、'原始照片' 缩略。不占用画布宽度、不做右侧常驻面板。

实现（`StoryModal.tsx` + `.story*` in `App.css`）——逐一对齐 `taste/examples/A-旧信.html` 的 `.popup` 与 `tokens.css`：
- **半透明奶油底**：`background: var(--color-popup)`（= `rgba(250,244,232,.87)`，tokens 里正是「半透明弹窗底」token）。
- **backdrop blur(9px) 透出背后房间**：`backdrop-filter: blur(9px) saturate(1.06)`（+ `-webkit-` 前缀）。截图实测可透出背后画布房间。
- **陶土红描边**：`border: 1px solid var(--color-popup-line)`（= `rgba(168,87,47,.42)`）。
- **浮动阴影**：`box-shadow: var(--shadow-float)`。
- **✕ 关闭**：`.story__close`（testid `story-close`），右上角圆钮，点击 `onClose`。
- **「它的故事」kicker**：`.story__kicker`（陶土红 `--color-accent`、大写字距）。文案硬编码为「它的故事」（对齐 design.md，非 M3-S1 的「物件故事」）。
- **衬线标题**：`.story__name` = 物件名，`font-family: var(--font-serif)`、`font-weight:400`。
- **meta**：`.story__meta` = 「陈列于「{场景名}」」（取当前 scene.name，填 meta 槽位）。
- **故事正文**：游客态 `.story__body`（衬线只读展示，空故事显灰体占位）；编辑态 `.story__input`（textarea）。
- **「原始照片」缩略**：`.story__orig` 区（顶部陶土红虚线分隔）+ `.story__orig-cap`「原始照片」+ `.story__photo`（testid `story-photo`，物件 imageSrc 抠图，contain 居中于奶油底卡片）。
- **不占画布宽度 / 不做右侧常驻面板**：`.story` 为 `position:absolute` 浮于 `.stage` 内（right:26px、垂直居中、宽 290px），画布 `1fr` 布局宽度不被它挤占；且仅「点物件才弹、点 ✕/空白即关」，非常驻面板。

### 2. 编辑 ↔ 游客一键切换；游客只读
> 交互铁律：「故事 = 点物件弹半透明弹窗；再点空白/✕ 关闭」「模式 = 编辑（全功能）↔ 游客（只读，点物件只弹故事+原图）」；游客模式下物件不得出现选中态手柄、不得响应拖拽。

实现（`Canvas.tsx`）：
- **一键切换**：沿用报头 `Header` 的 `编辑|游客` 段控件 + reducer `set-mode`（既有）。切模式经 `useEffect([scene?.id, state.mode])` 清空选中态与弹窗（态归零）。
- **游客点物件只弹故事+原图**：`.stage__node` 新增 `onClick`——`!editable` 时 `stopPropagation` 并 `setStoryOpenId(p.id)`，渲染 `editable=false` 的 StoryModal（只读，只有正文+原图，**无 textarea/保存/取消**）。
- **不出选中态手柄**：手柄链渲染条件 `showChrome = selected && editable`，游客态恒 false（既有，未回归）。
- **不可拖动/缩放/旋转/移除**：`onItemPointerDown` 在 `!editable` 时先 `stopPropagation` 再 return（不建手势、不捕获指针、不选中）；reducer 的 move/scale/rotate/remove/set-story 全部 `mode!=='edit'` 守卫（既有）。游客态 `.stage__node` 光标改 `pointer`（提示「可点查看」而非抓取）。
- **点空白/✕ 关闭**：`.stage` 的 `onPointerDown` 清 `selectedId` + `storyOpenId`（点物件/点弹窗均 stopPropagation，不误触发）；✕ 走 `onClose`。
- **编辑态写/改故事入口不变**：选中物件 → 「✎」手柄打开可编辑 StoryModal（`editable=true`，含 textarea + 保存）→ `set-item-story`（故事挂 Item、跨场景同步、全量落 LocalStorage，M3-S1 底座未动）。

### 3. 补齐 e2e/m3-story.spec.ts 全链路
> criteria 原文：选中物件写故事→刷新后还原→同一物件在另一场景故事同步更新→切游客模式点物件只弹故事+原图且不可编辑/移动。

`e2e/m3-story.spec.ts` 3 条用例逐步覆盖：
- **① 选中物件写故事 → 刷新还原**：写故事 → 断言 LocalStorage 里该 Item.story 已落（带 schemaVersion=1）→ reload → 重开弹窗读回原文一致。
- **② 跨场景同步（双向）**：同一物件摆入客厅/书房两场景，客厅写 S1 → 书房读到 S1 → 书房改 S2 → 客厅读到 S2 → reload 后两场景都读 S2（无新旧不一致）。
- **③ 切游客模式只弹故事+原图且不可编辑/移动**：切游客 → 点物件弹 `data-mode="guest"` 弹窗 → 断言 `story-body` 文本=已写故事、`story-photo` 可见有 src、含「它的故事」kicker；断言无 `story-input`/`story-save`/`story-cancel`（不可编辑）、无 `handle-scale`/`handle-rotate`/`placement-remove`/`placement-story`/`.stage__frame`（无手柄）；✕ 关闭 → 再弹 → 点空白关闭；拖物件后 `data-x/data-y` 不变（不可拖动）。

### 4. 命令须 exit 0
`npx playwright test e2e/m3-story.spec.ts --reporter=line` → **3 passed, EXIT=0**。

## 三、自检跑了什么、结果如何

| 命令 | 目的 | 结果 |
| --- | --- | --- |
| `npm run build`（tsc -b && vite build） | 生产构建 + 类型检查（无回归 M1 生产构建门） | ✅ built，无类型错误 |
| `npx playwright test e2e/m3-story.spec.ts --reporter=line` | **本 sprint 硬指标命令** | ✅ **3 passed，EXIT=0** |
| `npx playwright test --reporter=line`（全量 m1+m2+m3） | 确认未回归 M1/M2 | ✅ **8 passed**（m1 ×3、m2 ×2、m3 ×3） |
| 截图肉眼验（编辑态 + 游客态弹窗，viewport 1280） | 视觉自检（builder 技能「打开看效果」） | ✅ 两态均：奶油底 + blur 透出房间 + 陶土红「它的故事」kicker + 衬线标题 + meta + 正文 + 「原始照片」缩略 + ✕；编辑态含 textarea + 取消/保存故事 |

## 四、给评审员/主控的备注

- **已知 · 非本轮引入 · 建议后续处理**：应用外壳（`.app`）在 1280 视口下实测仅约 441px 宽、居中呈卡片状，未撑到 `max-width:1180px`。根因是 M1 既有 CSS——`body{display:flex}` 使 `#root`（`index.css` 里只有 `height:100%`、无 width）沿主轴 shrink-to-fit，`.app{width:100%}` 遂对着塌缩的 `#root` 解析。本轮的 `.story` 为 `position:absolute` 浮层，**不可能影响外壳宽度**；此现象自 M1/M2 即在（M1 外壳视觉 criteria 当时判 pass）。窄画布下 290px 弹窗几乎盖满画布、观感偏挤，但在正常宽画布（如 demo A-旧信.html）下即为右侧优雅浮层。是否修（例如 `#root{width:100%}`）属 M1 外壳布局范畴、需另行授权，本轮遵「不顺手改无关的东西」未动。
- M3-S1 的数据底座（`state/gallery.ts` 的 `set-item-story`、`storage/persistence.ts`、model/types）完全复用未改——故事仍挂 Item、跨场景同步、全量持久化。
