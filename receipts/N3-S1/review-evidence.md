# N3-S1 复核证据 · 评审员

日期：2026-07-17 ｜ 复核对象：`receipts/N3-S1/receipt-builder.md` ｜ 团队：general ｜ 阶段：内部自检（非终验）

## 0. 核查范围锚定

- 读 `.opc/sprints/N3-S1.json` goal：本 sprint 仅验收「Canva 式手柄」+「dock 拖出→挪位→缩放→旋转→移除→写故事」全链路持久化；**不核查**场景/物件重命名与删除、陈列室名就地编辑（留 N3-S2）；契约明确**不要求**跑 `e2e/n3-edit.spec.ts` 全量（确认 e2e 目录下确实不存在该文件，符合「留收口 sprint」的说法）。
- 对照 `milestones.json` N3 段与 `success.json` 第 4 条（手柄成熟且顺滑）确认硬指标点位：陶土红细选框、四角白圆点、正下方真 SVG 旋转钮、恒水平真 SVG 工具条、命中区 ≥26px 视觉不放大、无字符图标 ⟳/✎/×。

## 1. 代码实地核查

### 1.1 `src/components/Canvas.tsx`
- 新增 `RotateIcon`/`StoryIcon`/`TrashIcon` 三个真 SVG 组件（24×24 viewBox，`stroke=currentColor`），分别用于旋转钮、工具条铅笔、工具条垃圾桶。逐行确认无任何字符图标字面量出现在渲染路径中（`grep` 全仓 `⟳`/`✎` 仅命中注释文字，未命中 JSX 渲染节点）。
- 选中态结构（`showChrome` 分支，第 554–632 行）：
  - `.stage__frame`：纯装饰、`pointer-events:none`，挂在 `.stage__tf` 内随物件旋转/缩放。
  - 四角 `.stage__handle`（`data-testid="handle-scale"` ×4，`data-corner` 保留）。
  - `.stage__rot`（`data-testid="handle-rotate"`）内嵌 `<RotateIcon/>`，挂在 `.stage__tf` 内、`margin-top` 定位在选框下方。
  - `.stage__toolbar`（`data-testid="placement-toolbar"`）是 `.stage__item` 的**直接子元素**、`.stage__tf` 的**兄弟**——即工具条不在旋转/缩放层内，天然不随物件转动。内含 `placement-story`（铅笔）与 `placement-remove`（垃圾桶）。
  - 手势进行中（`active`）工具条挂 `.is-hidden`，验证了「让路」逻辑存在。
- 未发现改动 `types.ts`/`gallery.ts`/`persistence.ts` 或手势换算逻辑的痕迹（Canvas.tsx 内 pointer 逻辑与 M2 版本一致，仅 chrome DOM/class 变了）。

### 1.2 `src/App.css`
- `.stage__frame { border:1.5px solid var(--sel-line) }` —— 陶土红细选框，token 化。
- `.stage__handle { width/height:var(--h2-size); background:var(--h2-bg); border:1px solid var(--h2-line); box-shadow:var(--h2-shadow); border-radius:50% }` —— 四角白圆点，token 化。
- `.stage__handle::after { width/height:var(--h2-hit) }`（transform 居中）—— 透明伪元素扩大命中区，**不放大可见圆点**，与「视觉尺寸不放大」的硬指标要求一致。
- `.stage__rot`：26px 白圆钮，`top:100%; margin-top:12px`（选框正下方），挂在 tf 层内。
- `.stage__toolbar`：`background:var(--glass-bg); backdrop-filter:blur(var(--glass-blur))`，`bottom:100%`（悬于选框上方），`.is-hidden { opacity:0; pointer-events:none }`。
- 第 1007–1009 行注释确认窄屏（≤880px）媒体查询里**已退掉**旧的手柄放大规则，改为全视口统一靠 `::after` 撑命中区。
- `src/styles/tokens.css` 确认 v2 token 段（`--glass-*`/`--h2-*`/`--sel-line`/`--text-label-min`）已就位且与代码引用完全对应，未被本轮改动（builder 声明未碰该文件，`ls -la` 显示其 mtime 早于 Canvas.tsx/App.css，与「未改」说法吻合）。

### 1.3 字符图标底线检查
```
grep -rn "⟳\|✎" src/ e2e/
```
仅命中注释/文档性字符串（如「替代字符 ⟳/✎/×」这类说明文字）与 `m2-transform.spec.ts`/`m3-story.spec.ts` 里描述旧交互的注释，**JSX 渲染节点中无一处literal 字符图标**。`StoryModal.tsx` 关闭按钮用的是字面 `✕`（U+2715）——但这是 M3 遗留、非本 sprint 触碰范围（builder 只改了 Canvas.tsx/App.css，`ls -la` 显示 StoryModal.tsx mtime 是 16 Jul，早于本 sprint），且契约点名的「选中态、工具条」字符底线不包含故事弹窗关闭钮，故不计入本轮判定，仅作记录供后续 sprint 参考。

## 2. 命令行验证

### 2.1 `npm run build`
**通过**。`tsc -b && vite build` 无类型错误，产物正常生成。

### 2.2 `npx playwright test e2e/n2-shell.spec.ts --reporter=line`
**12/12 全绿**（本地统计为 12 项，与建造员回执写的「8 用例/14 项」计数口径略有出入，但结果同为全绿，无回归，不影响判定）。满屏外壳、浮层让路机制均无破坏。

### 2.3 `npx playwright test e2e/m2-transform.spec.ts --reporter=line`
**2 failed**，与建造员回执描述一致。独立核实两条失败的真实原因：

- **失败①**（全链路用例，`m2-transform.spec.ts:109`）：断言在**第一步刚拖入物件、尚未碰任何手柄**时就失败——`expect(Math.abs(dropped.x - expectXPct)).toBeLessThan(1)` 报 `Received: 4.296875`。查看断言公式（第107–108行）用的是「画布整块 boundingBox（cbox）」做百分比参照系；但当前 `Canvas.tsx` 的坐标系（第 7–9 行头部注释）是「contain 后场景图矩形 imgRect」百分比，两者在非满屏铺满的场景图（有 letterbox）时不等价。此外该用例的 `readPlacement`（第 70–78 行）读的是 `data-scale` 属性，而当前 `Canvas.tsx` 渲染的 placement 节点只有 `data-w`（第 513、529 行），根本没有 `data-scale`——这是 N1 把 schema 从「像素+scale」换成「图内百分比+w」遗留的测试代码未同步问题，**与本轮手柄/工具条改动无关**，且失败点在触发任何手柄交互之前。
- **失败②**（画布外落点用例，`m2-transform.spec.ts:199`）：把物件拖到报头区域仍建出了 placement（`Received: 1`，期望 `0`）。查 `src/components/Workbench.tsx` 第 31–44 行 `handleDropItemAt`：判定逻辑是「落在 `[data-testid="canvas"]` 的 boundingRect 之外才忽略」，且注释明确写着「满屏后正常拖入总在视口内」——这是 N2「满屏沉浸外壳」把 canvas stage 撑满整个视口、报头变成浮在 stage 之上的玻璃层后的架构结果（报头的屏幕坐标现在天然落在 stage 矩形内部）。`ls -la` 显示 `Workbench.tsx` 的 mtime（17 Jul 04:15）早于 `Canvas.tsx`/`App.css` 的本轮改动（05:55/05:57），证实该文件本轮未被触碰。

结论：**两条失败均可独立追溯到 N1（坐标系换成百分比）与 N2（满屏落点判定）的既有行为变化 + 测试代码未同步，均在触发手柄交互之前或与手柄/工具条 DOM 结构无关的路径上失败，判定与本轮改动无关，建造员说法站得住**。

### 2.4 文件改动范围佐证（无 git，用 mtime 交叉核实）
```
17 Jul 05:57  src/App.css            ← 本轮改动
17 Jul 05:55  src/components/Canvas.tsx   ← 本轮改动
17 Jul 04:13–04:15  Header/ItemTray/SceneBar/Workbench.tsx/tokens.css  ← N2 遗留，早于本轮
16 Jul        StoryModal.tsx/App.tsx/main.tsx  ← M3/更早遗留
```
与回执「只改 Canvas.tsx + App.css」的说法吻合。

## 3. 手动全链路验证（临时 Playwright 脚本，验后已删除，不留垃圾）

自行编写并跑通一个独立于建造员自检脚本的临时 spec（`e2e/_review-n3s1.spec.ts` + `_review-n3s1-shot.spec.ts`，跑完即用 `rm` 清理，未留痕），驱动真实指针操作，逐项实测：

- 选框描边计算色 `rgba(168, 87, 47, 0.95)` —— 与 `--sel-line` token 值完全一致。
- 角手柄可见 box ≈14×14px（对应 `--h2-size:13px`，含 1px 边框），`getComputedStyle(handle, '::after')` 实测 **26px × 26px**（与 `--h2-hit` 相符）—— 证实命中区靠伪元素扩大、可见圆点未放大。
- 旋转手柄 `innerHTML` 含 `<svg`、不含 `⟳`；其 boundingBox 的 `y` 严格大于选框 `y+height`（即在选框正下方）。
- 工具条 `backdrop-filter` 计算值为 `blur(16px) saturate(1.05)`（毛玻璃材质属实）；`placement-story`/`placement-remove` 的 `innerHTML` 均含 `<svg`、不含 `✎`/`×`/`⟳`。
- **全链路**：拖入 → 选中 → 拖动改位（x/y 变、w/rotation 不变）→ 角手柄缩放（w 变大、x/y/rotation 不变）→ 旋转钮旋转（rotation 变、w 不变）→ 全部字段级 `toBeCloseTo` 断言通过。
- **恒水平核验**：旋转后读工具条祖先链的 `getComputedStyle().transform`，`.stage__toolbar` 自身 matrix 仅含平移分量（`matrix(1,0,0,1,-39.5,0)`，无旋转分量）；且 `toolbar.parentElement.className === 'stage__item'`（不是 `.stage__tf`），结构上证实工具条不会继承物件的 rotate 变换。
- **写故事 + 刷新还原**：工具条铅笔打开弹窗、写入文本、保存；`page.reload()` 后 placement 的 x/y/w/rotation/z 五个字段与刷新前逐一 `toBeCloseTo` 一致，故事文本从 `[data-testid="story-input"]` 读回精确匹配刚写入的内容。
- **移除**：工具条垃圾桶点击后 `placement` 计数归零。
- 截图核验（`test-results/_n3s1-selected.png`，已清理）：肉眼确认陶土红细选框随物件倾斜、四角白圆点随选框倾斜、旋转圆钮（真环形箭头 SVG）位于选框正下方且随之倾斜、毛玻璃工具条（铅笔+分隔线+垃圾桶）**悬在选框上方且保持绝对水平**，与设计稿描述及回执描述完全一致，无任何字符图标残留。

## 4. 结论

- 【验收硬指标】逐条核实：选中态 chrome（陶土红选框/白圆点/真 SVG 旋转钮）达标；毛玻璃工具条（真 SVG、恒水平、悬于选框上方）达标；触摸命中区 ≥26px 且视觉不放大达标；全链路（拖入→挪位→缩放→旋转→移除→写故事→刷新还原）实测跑通、字段级精确还原。
- `npm run build` 过；`e2e/n2-shell.spec.ts` 全绿、无回归。
- `e2e/m2-transform.spec.ts` 的 2 个失败经独立代码走查确认为 N1（坐标系换百分比 + 测试用 `data-scale` 未同步）与 N2（满屏落点判定，报头浮层落入 stage 矩形内）的既有行为遗留，触发点均在手柄/工具条改动之外，不构成本轮回归。
- 未发现字符图标 ⟳/✎/× 残留在选中态或工具条渲染路径中。
- 未发现越界改动（数据模型/reducer/持久化/手势换算/N3-S2 范围功能均未触碰，mtime 交叉核实与回执一致）。

**判定：pass。**
