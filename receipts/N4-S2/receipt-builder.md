# N4-S2 建造员过程记录

- sprint：`N4-S2`（里程碑 N4：双模式、双端与收口）
- 岗位：general 队 · 建造员
- 契约（N4-S2.json goal）：把 `e2e/n4-full.spec.ts` 扩展到横屏手机 844×390 视口，跑通与 PC(1920) 相同的 9 条成功条件主链路；双视口都验证无横向溢出、无 console 未捕获错误/未处理 Promise 拒绝；修复发现的响应式布局问题；核验故事弹窗窄屏贴底近满宽；核验整体视觉还原「旧信·沉浸」DNA；核验工艺底线（字号下限、选框贴实物、dock 视觉居中补偿）。`npx playwright test e2e/n4-full.spec.ts --reporter=line` 须 exit 0（覆盖双视口）。

## 一、开工必读档案（全部读到）

1. 本 sprint 契约：`.opc/sprints/N4-S2.json`（goal + 【验收硬指标】段）✅
2. 里程碑 N4 原文：`.opc/phase1/milestones.json`（`id:"N4"` 的 goal/criteria）✅
3. 品味档案：`.opc/phase1/taste/taste.json` + `design.md`（含 v2「旧信·沉浸」增补）+ `tokens.css`（v2 token 块）✅
4. 角色说明书：`utohub-opc/teams/general/roles/builder.md` ✅
5. 技能文件：`utohub-opc/teams/general/skills/build-deliverable.md` ✅
6. 承接上下文：N4-S1 的 `receipt-builder.md` + `review-evidence.md`（PC 1920 骨架已 pass），success.json 9 条成功条件全文。
- 未改动 `.opc/` 下任何文件（只读）。

## 二、验收硬指标 → 自检清单（逐条对照，双视口）

| # | 硬指标 | 落点 | 结果 |
|---|---|---|---|
| 1 | 9 条成功条件主链路在 PC(1920) 与横屏手机(844×390) 双视口跑通 | 把主链路抽成 `runMainFlow(page, vp)`，`for (const vp of [VP_PC, VP_PHONE])` 各生成一条 test，各自 freshApp 从零跑完整链路 | ✅ 2 passed |
| 2 | 双视口无横向溢出 | `assertNoHorizontalOverflow` 在起点/满 3 场景后/刷新后三处，带 `vp.label` | ✅ |
| 3 | 双视口无 console 未捕获错误/未处理 Promise 拒绝 | 每条 test 独立 `attachErrorGuards`（pageerror + 页面内 unhandledrejection + console.error，排除资源 404），末尾 `assertNoRuntimeErrors` | ✅ |
| 4 | 故事弹窗窄屏贴底近满宽 | 游客弹窗打开后，`vp.narrow` 分支断言：宽度 > 视口宽×0.9、底缘 > 视口高-40、右缘不溢出 | ✅（844 下实测宽≈820、贴底） |
| 5 | 工艺底线·字号下限 | `assertLabelFloor`：量 `.brand small`/`.dock-head`/`.scenes .lbl` 计算字号 ≥ 11px，双视口满态各一次 | ✅ 全 ≥11px |
| 6 | 整体视觉还原「旧信·沉浸」DNA + 选框贴实物 + dock 居中补偿 | 见第四节（截图眼检 + 代码核对） | ✅ |

9 条成功条件 ↔ 链路覆盖点（每条都有真实操作 + 非空断言，双视口各跑一遍）：
①主流程闭环（建场景→dock摆物件→写故事→切游客看故事+原图）｜⑥浮层让路（dock 拖出 + 画布挪动到画面最顶部，拖动中断言 `.app.is-dragging`/dock 与品牌章 `pointer-events:none`/物件落到 y<10）｜⑦持久化+故事同步（placement x/y/w/rotation/z 刷新逐字段 `toEqual` 基线、两场景双向同步 S1→S2）｜⑧管理与命名（场景改名/删除释放配额再建、物件改名跨场景同步、陈列室名就地编辑、刷新全还原）｜⑨场景约束（3 场景到顶、背景不重复、第 4 被阻、刷新仍成立）。

## 三、交付物与改动清单

### 1. `e2e/n4-full.spec.ts`（改：PC 单视口 → 双视口）
- 主链路抽成 `runMainFlow(page, vp: Viewport)`，用 `for (const vp of [VP_PC, VP_PHONE])` 生成两条 test。
  - `VP_PC = {1920×1080, narrow:false}`、`VP_PHONE = {844×390, narrow:true}`（与 N2/N3 取数惯例一致）。
  - 所有原先硬编码的 `VP_PC.width/height`（落点、拖到顶、复位目标）改用 `vp.*`。
- **复位抓取点改稳**：物件被拖到画面最顶部后（部分露出视口外），原「固定 y≥100 夹取」在矮视口(390)下会抓空（物件本体不一定延伸到 y=100）。改为 `visibleGrabPoint()`——水平取本体中心、垂直取**可见区间中点**，保证抓取点始终落在物件本体上，PC 与横屏手机通吃。
- **新增窄屏故事弹窗断言**（`vp.narrow` 分支）：游客弹窗宽度 > 视口宽×0.9、底缘贴视口底（>视口高-40）、右缘不溢出——核验「贴底近满宽」。
- **新增工艺底线断言** `assertLabelFloor`：量常驻 UI 标签实际计算字号 ≥ 11px（`--text-label-min`），双视口满态各一次。
- 保留 N4-S1 全部 9 条主链路断言与运行时守卫口径不变。

### 2. `src/components/StoryModal.tsx`（改：故事弹窗关闭钮 字符✕ → 真 SVG）
- 上一轮主控提醒：`story__close` 仍以字符 `✕` 渲染，而 design.md v2「字符图标（⟳/✎/×）自 v2 起判不合格」。
- 改为真 SVG 叉号（两 path，`stroke:currentColor`），与 SceneBar 删除钮/Canvas 工具条同款画法。这是本项目 UI 里最后一处渲染中的字符图标（SceneBar/Canvas 均已 SVG，已核对）。

### 3. `src/App.css`（改：`.story__close` 适配 SVG）
- 去掉字符用的 `font-size:11px`、加 `padding:0` 与 `.story__close svg { width/height:13px }`。

（响应式布局本身未见需要修复的溢出/错乱——844×390 下 `@media(max-width:880px)` 已把弹窗改贴底满宽、dock 默认收合、`@media(max-height:560px)` 压小缩略卡；双视口 e2e 全绿、截图眼检无堆角/无溢出，故未再动布局 CSS。）

## 四、自检执行记录

- 契约命令 `npx playwright test e2e/n4-full.spec.ts --reporter=line`：**2 passed（PC + phone），EXIT 0**。连跑 4 次（含改前基线 1 次 + 改后 3 次）均 2 passed（7.1–7.2s），不 flaky。
- 生产构建 `npm run build`：`✓ built in ~321ms`，EXIT 0，无类型错误（StoryModal 改动通过 tsc）。
- 视觉眼检（临时截图 spec，跑完即删）：
  - **横屏手机 844×390**：满屏沉浸场景铺满、两侧模糊补边、暗角在；品牌章/模式开关/隐藏界面钮/物件 dock/场景条全为玻璃浮层；选中态为陶土红细选框 + 四角白圆点 + 下方旋转圆钮 + 上方玻璃工具条（铅笔/垃圾桶 SVG）——选框贴合可见实物（照片本体）；故事弹窗贴视口底、近满宽、玻璃透背景、SVG 关闭钮。布局无堆角、无横向溢出、不错乱。
  - **PC 1920**：故事弹窗为右侧竖直居中浮动小窗（~290px，不占画布宽度），玻璃 + backdrop-blur；其余浮层/手柄/补边/暗角同上。两端故事弹窗形态各自正确（PC 右侧浮窗 / 窄屏贴底满宽）。
  - dock 视觉居中补偿：dock `left + top:50% + translateY(-50%)`，把手独占右缘一栏、面板内容水平居中——收合/展开都绕同一竖直中线，内容不挤偏（代码 + 截图双证）。
- 回归：`npx playwright test e2e/n2-shell.spec.ts e2e/n3-edit.spec.ts` → **19 passed**（含 N3「F 无字符图标残留 @PC/@横屏手机」），我的 StoryModal/App.css 改动未破坏已验收的 N2/N3。

## 五、边界与交检

- 未自判通过：做完即交，过不过由评审员对照 N4 验收标准裁决。
- 成品落在项目根 `.opc/` 之外：`e2e/n4-full.spec.ts`（点名路径）、`src/components/StoryModal.tsx`、`src/App.css`、`receipts/N4-S2/receipt-builder.md`。未碰 `.opc/`。
- 顺手处理了主控提醒的字符图标残留（非硬性验收条目，但属 design.md v2 工艺底线，终验大概率会揪）。
