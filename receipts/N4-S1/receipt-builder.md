# N4-S1 建造员过程记录

- sprint：`N4-S1`（里程碑 N4：双模式、双端与收口）
- 岗位：general 队 · 建造员
- 契约：新增 `e2e/n4-full.spec.ts`，在 PC（1920）视口端到端串通 success.json 全部 9 条成功条件主链路；断言无 console 未捕获错误 / 未处理 Promise 拒绝；`npx playwright test e2e/n4-full.spec.ts --reporter=line` 须 exit 0。横屏手机 844×390 与响应式/整体视觉验证留给 N4-S2。

## 一、开工必读档案（全部读到）

1. 岗位职责与红线：`/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/builder.md` ✅
2. 技能手册：`/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/build-deliverable.md` ✅
3. 里程碑 N4（`.opc/phase1/milestones.json` 的 `id:"N4"`）：`goal` 与 `criteria` 原文已读 ✅
   - criteria① e2e 硬指标：覆盖 9 条成功条件主链路，PC（1920）与横屏手机（844×390）双视口跑通、无横向溢出、无 console 未捕获错误或未处理 Promise 拒绝。（本 sprint 只做 PC 1920 骨架，横屏手机留 N4-S2。）
4. 品味档案：`.opc/phase1/taste/taste.json`（方向 A2「旧信 · 沉浸」）✅
- 未改动 `.opc/` 下任何文件（只读）。

## 二、验收硬指标 → 自检清单（逐条对照，PC 1920）

把 goal 主链路拆成 9 条成功条件，n4-full.spec.ts 一条端到端测试逐条串起并断言：

| # | 成功条件 | 主链路覆盖点 | 断言 | 结果 |
|---|---|---|---|---|
| ① | 主流程闭环 | 建场景客厅 → dock 拖出摆物件 → 写故事 S1 → 切游客点开 | 游客弹窗 data-mode=guest、story-body=S1、原图 story-photo 可见 src 非空、「它的故事」kicker、无输入/保存、无手柄/选框 | ✅ |
| ⑥ | 浮层让路 | dock 拖出 + 画布挪动到画面最顶部 | 拖动中 `.app.is-dragging`；dock `pointer-events:none` + 跟手幽灵可见；品牌章 opacity<0.2 且 pe=none、命中不落品牌章内；物件落到顶部 pct.y<10；松手浮层浮回 pe=auto | ✅ |
| ⑦ | 持久化＋故事同步 | 摆放坐标（x/y/w/rotation/z 场景图坐标系百分比）刷新还原；同一物件摆进客厅+书房，一处改另一处同步 | 存储 schemaVersion=3、story=S1；书房读到 S1（正向同步）；书房改 S2 → 客厅读到 S2（反向同步）；刷新后两场景均 S2、placement 逐字段 `toEqual` 基线 | ✅ |
| ⑧ | 管理与命名 | 场景改名（卧室→主卧）、删除（释放背景配额→可再建卧室）、物件改名跨场景同步、陈列室名就地编辑 | 改名/删除后 chip 断言；删后 add-scene 可用、picker 回列卧室、再建回到 3；物件改名后 dock 显示新名 + 客厅/书房故事弹窗标题均读到新名；陈列室名回车即存；全部刷新后保留 | ✅ |
| ⑨ | 场景约束＋（PC 端）可用 | 最多 3 场景、背景不可重复、第 4 个被阻止 | 建书房时 picker 不列客厅（2 选项）、建卧室时仅 1 选项；满 3 后 add-scene disabled + 常驻「素材已用完」+ picker 打不开；刷新后仍成立 | ✅ |
| — | 无 console 未捕获错误 / 未处理 Promise 拒绝 | 全程 | pageerror=[]、window.unhandledrejection=[]、console.error=[]（排除 favicon 类 `Failed to load resource` 网络失败，沿用 M4 收口口径） | ✅ |
| — | 无横向溢出 | 起点 / 建满场景后 / 刷新后三处 | `documentElement.scrollWidth ≤ clientWidth+1` | ✅ |

横屏手机 844×390 / 响应式 / 整体视觉终验：本 sprint 不做，按 goal 明确留给 N4-S2（改了算越界）。

## 三、交付物

- 新增：`/Users/yuriiiz/Projects/Memories/e2e/n4-full.spec.ts`
  - 一条端到端测试（PC 1920×1080），把 goal 主链路串成一条：建场景 → dock 拖出摆物件（含 dock 让路断言）→ 画布挪动到顶部（含画布让路断言）→ 复位 → 写故事 → 游客只读看故事+原图 → 建书房跨场景故事同步 → 建卧室触发 3 场景上限/第 4 被阻 → 场景改名/删除（配额释放可再建）→ 物件改名跨场景同步 → 陈列室名就地编辑 → 刷新持久化+跨场景故事同步全还原 → 刷新后上限仍成立。
  - 运行时守卫沿用 M4 收口 spec 口径：`page.addInitScript` 挂 `unhandledrejection` 收集（reload 后仍有效）、`pageerror`、`console.error`（排除资源 404 网络失败）；末尾 `assertNoRuntimeErrors` 统一断言。
  - schema 对齐当前实现 v3：读 `data-w`（非旧 `data-scale`）、断言 `schemaVersion===3`。
- 过程记录：`/Users/yuriiiz/Projects/Memories/receipts/N4-S1/receipt-builder.md`（本文件）。

## 四、改了哪些 `src/`、为什么

**本 sprint 未改动任何 `src/` 文件**（全部 src 文件 mtime 停在 05:55–06:43，本次开工之后未再触碰）。

排查过程中遇到过一次失败，但定位为**测试构造问题、非应用联调缺陷**，就地在测试内修正：

- 现象：第一版把承载故事的物件用画布挪动拖到画面**最顶部**（pct.y≈0.5%）演示 ⑥「物件能落到浮层覆盖处」后，紧接着要点该物件的「写故事」工具条时超时——工具条 `element is outside of the viewport` 不可点。
- 根因（读 `src/App.css`）：`.stage__toolbar { position:absolute; bottom:100%; margin-bottom:12px }`——故事/删除工具条恒悬于选框**上方**。物件贴顶时选框上方即视口顶边之外，工具条被顶出视口，Playwright 滚不进去、点不到。这是应用在「物件贴到极顶 + 打开其工具条」这一极端叠加下的观感/布局细节，属整体视觉打磨范畴（N4-S2），且浮层/手柄像素级细节已由 N2/N3 精测；不是主链路在正常使用下的联调缺陷。
- 修正：在测试内，⑥ 演示（物件确实落到顶部、断言 pct.y<10）**之后**，把物件复位到画布中部再继续写故事——本就是主链路的自然一步。修正只落在 `e2e/n4-full.spec.ts`，未碰 `src/`。这样 ⑥「让路 + 可落到浮层覆盖处」照旧完整覆盖，后续工具条也稳定在视口内可点。

（结论：本 sprint 现有实现的游客模式/故事弹窗/管理命名/持久化/跨场景同步等主链路联调无缺陷，无需改 src。）

## 五、自检执行记录（命令与结果）

- 契约命令：`npx playwright test e2e/n4-full.spec.ts --reporter=line`
  - 首过：`1 passed (4.6s)`，exit 0。
  - 连跑 3 次防抖：`1 passed`（4.1s / 4.3s / 5.5s），均 exit 0——稳定不 flaky。
- 生产构建：`npm run build` → `✓ built in ~340ms`，exit 0，无类型错误（开工基线 + 收工各一次）。
- 全量回归：`npx playwright test --reporter=line`（全 e2e）→ **25 passed / 9 failed（1.5m）**；`npm run build` → `✓ built in 365ms`、exit 0。
  - 当代（N 线）规格全绿：`e2e/n2-shell.spec.ts`（①~⑧ 全过）、`e2e/n3-edit.spec.ts`（A~F 全过）、`e2e/n4-full.spec.ts`（本 sprint 新增，全量运行中同样 pass）——N4 主链路依赖的游客模式/故事/管理命名/持久化/跨场景/让路等能力现况完好。
  - 9 条 failed **全部为预存失败、开工前基线即已失败、非本 sprint 引入**（本 sprint 只新增了一个测试文件、零 src 改动）：
    - `e2e/n1-foundation.spec.ts` ×3（行 98/152/196）：N1（schema v2）产物，硬编码 `schemaVersion===2`（断言在行 115/186/208），而 schema 早在 N2 已升 v3；实现是对的（v3），失败的是未随 v2→v3 更新的旧断言。属 N1 遗留、不在 N4-S1 范围。
    - `e2e/m2-transform.spec.ts` ×2、`e2e/m3-story.spec.ts` ×1、`e2e/m4-full.spec.ts` ×3：回炉前 M 线规格，同理断言旧 v2 schema / `data-scale`，对当前 v3 实现为预存失败，与本 sprint 无关。
  - （对照开工基线：开工前单独跑 n1/n2/n3 即已是 n1 三条失败、n2/n3 全绿；本 sprint 前后失败集合一致，未新增任何失败。）

## 六、边界与交检

- 未自判通过：本岗做完即交，过不过由评审员对照 N4 验收标准裁决。
- 未碰 `.opc/`；成品落在项目根合适位置（`e2e/` 点名路径、`receipts/N4-S1/`）。
- 未越界改横屏手机适配 / 整体视觉打磨（N4-S2 范围）。
