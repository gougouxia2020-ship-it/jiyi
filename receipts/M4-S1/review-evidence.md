# M4-S1 评审证据（reviewer）

- 项目：念念 · 陈列室（OPC general 团队）
- Sprint：M4-S1（契约：`.opc/sprints/M4-S1.json` 的 `goal` 字段）
- 尺子：sprint goal 的【验收硬指标】段 —— success.json 六条成功条件里①②③④对应的四条（主流程闭环 /
  多场景+背景不重复上限3 / 数据持久化 / 故事跨场景同步），PC 视口，exit 0；768px/375px 双视口与
  响应式/整体视觉明确划归 M4-S2，不在本次核查范围。
- 建造员回执自报：exit 0、PC 覆盖 6 条链路、无 console 错误/未处理拒绝、9/9 绿、连跑 3 次无 flaky。

## 一、开工必读档案（均已亲手读到）

1. `utohub-opc/teams/general/roles/reviewer.md` —— 已读
2. `utohub-opc/teams/general/skills/review-against-criteria.md` —— 已读
3. `.opc/phase1/milestones.json`（id=M4）—— 已读
4. `.opc/phase1/success.json`（六条成功条件原文）—— 已读
5. `.opc/sprints/M4-S1.json`（goal 全文）—— 已读

无 BLOCKED。

## 二、命令级核查（亲手跑，非采信自报）

### 2.1 目标命令
```
$ npx playwright test e2e/m4-full.spec.ts --reporter=line
Running 1 test using 1 worker
[1/1] [chromium] › e2e/m4-full.spec.ts:197:1 › 全流程主链路（PC）：建场景→摆物件→变换→写故事→游客看故事+原图→多场景上限3→跨场景同步→刷新还原
  1 passed (3.2s)
EXIT_CODE=0
```
与建造员自报一致：exit 0。

### 2.2 全量回归
```
$ npx playwright test --reporter=line
Running 9 tests using 1 worker
[1/9]..[9/9] 全部通过（m1-shell ×3、m2-transform ×2、m3-story ×3、m4-full ×1）
  9 passed (8.6s)
FULL_SUITE_EXIT_CODE=0
```
与建造员自报「9/9」一致，无回归。

### 2.3 稳定性（连跑 3 次）
```
run 1 exit=0
run 2 exit=0
run 3 exit=0
```
三次全过，无 flaky，与自报一致。

## 三、逐条对照【验收硬指标】核查测试是否真覆盖（非挂名）

对照 `e2e/m4-full.spec.ts` 源码 + 对应 `src/` 实现逐条核实：

### ① 主流程闭环（建场景→摆物件→写故事→游客模式看故事+原图）
- 测试 L208-280：`createScene(page,'客厅')` → `placeItemByClick` 摆物件 → `writeStory(S1)` →
  `localStorage` 读回 `items[].story===S1` 且 `schemaVersion===1`（L251-259，验证故事真落盘、不是
  只改内存）→ 切游客模式 → 点物件 → 断言 `story-modal[data-mode=guest]`、`story-body`==S1、
  `story-photo` 可见且 `src` 非空、且无 `story-input`/`story-save`/`handle-scale`（只读，不可编辑）。
- 对照 `src/components/StoryModal.tsx` L68-81：`editable` 为 false 时只渲染 `story-body`（只读段落）+
  `story-photo`，不渲染 `story__input`/`story__actions`——测试断言与真实分支一致，非挂名。
- 对照 `src/components/Canvas.tsx` L399-406：游客模式点物件 `onClick` 只 `setStoryOpenId`，
  `onItemPointerDown`（选中/拖动入口）在 `!editable` 时直接 return——游客确实不可选中/不出手柄。
- 结论：真实覆盖，PASS。

### ②（对应 sprint 自身编号）多场景 + 背景不可重复上限 3
- 测试 L286-330：建满「客厅/书房/卧室」3 场景；每次开 picker 前断言可选项数递减（2→1→0）且已用
  背景不再出现；建满后 `add-scene` disabled、`scenes-exhausted` 文案「素材已用完」可见、
  `bg-picker` 打不开。
- 对照 `src/state/gallery.ts` L43-51（`availableBackgrounds`/`canAddScene`）与 L67-76
  （`create-scene` reducer：达上限/背景已占用/背景不存在均拒绝）、`SceneBar.tsx` L56-97（`canAdd`
  控制置灰与 exhausted 文案渲染）——与测试断言的 UI/数据行为一致，非表面挂名。
- 对照 `src/assets/manifest.ts` L50-54：三张背景名恰为「书房/客厅/卧室」，与测试用名一致。
- 结论：真实覆盖，PASS。

### ③（对应 sprint 自身编号）数据持久化
- 测试 L334-359：`page.reload()` 后场景列表（3 个、名称集合不变）、变换后的
  `placement(x,y,scale,rotation,z)` 逐字段核对、两个场景读回故事均为最新 S2。
- 对照 `src/storage/persistence.ts`：`saveState` 全量写、`loadState` 全量读 + schemaVersion 校验 +
  `reconcileItems` 保留用户 story——与测试的「刷新后逐字段还原」断言机制一致。
- 结论：真实覆盖，PASS。

### ④（对应 sprint 自身编号）故事挂物件、跨场景同步
- 测试 L298-312：同一物件（`tray-item.nth(0)`，经查 `ItemTray.tsx` L228 恒对 `ITEMS` 固定顺序
  `.map`，与场景/摆放状态无关，故两次 `nth(0)` 确为同一物件）摆入「客厅」与「书房」；「书房」读到
  「客厅」写的 S1（正向同步）；「书房」改成 S2 后切回「客厅」读到 S2（反向同步，双向验证非单向巧合）。
- 对照 `src/state/gallery.ts` L157-171：`set-item-story` 只改 `Item.story`（不挂 `Placement`），
  因此同一 Item 的所有 Placement 天然共享同一份故事——与测试验证的双向同步机制根源一致。
- 结论：真实覆盖，PASS。

### milestones.json M4 criteria「无 console 未捕获错误 / 未处理 Promise 拒绝」
- 测试 L19-55：`attachErrorGuards` 在 `addInitScript`（每次导航/reload 重跑）里挂
  `unhandledrejection` 收集、`page.on('pageerror')`、`page.on('console')`（仅过滤
  `Failed to load resource` 类网络 404，未过滤真正的 JS 错误），测试末尾 `assertNoRuntimeErrors`
  断言三者数组皆为空，覆盖含 reload 之后的全程（L362 在 L335 reload 之后调用）。
- 亲眼观察：本地实跑三次全过，未见任何该断言失败的迹象。
- 结论：真实覆盖，PASS（非只是没挂监听蒙混过关）。

### 范围核查：sprint 是否越界索取 M4-S2 的活
- goal 原文明确「768px/375px 双视口与响应式验证留给 S2」，spec 文件头注释与 playwright.config.ts
  的 `projects` 只有一个 `Desktop Chrome` 项目（无 mobile viewport project），与「本 sprint 只做 PC
  视口骨架」的自我定位一致，未见越界或反向少做。
- `assertNoHorizontalOverflow` 只在 PC 视口下断言，属于本 sprint 范围内的合理覆盖，非越界。

## 四、旁证：src/ 是否真零改动

- 本项目非 git 仓库（`git status` 报 not a git repository），无法用 diff 直接核实，改用文件 mtime
  旁证：`src/components/*.tsx`、`src/state/gallery.ts`、`src/storage/persistence.ts` 的最后修改时间
  均早于 `e2e/m4-full.spec.ts`（06:06）——`Canvas.tsx` 05:15、`StoryModal.tsx` 05:13、
  `gallery.ts` 04:49、`persistence.ts` 00:30、`SceneBar.tsx`/`Header.tsx` 00:47、`ItemTray.tsx`
  03:56、`Workbench.tsx` 02:06——均早于本 sprint 交付物时间戳，与「src/ 零改动」自报不矛盾。

## 五、裁决

四条【验收硬指标】逐条亲手核实为真实覆盖（非挂名断言）；命令级 exit 0、全量回归 9/9、连跑 3 次无
flaky 均亲手复现，与建造员自报一致；运行时错误守卫机制真实生效；未发现越界索取 M4-S2 范围的内容。
未发现缺、错、不达标之处。

**裁决：放行（pass）**。
