# M4-S1 建造回执（builder）

- 项目：念念 · 陈列室（OPC general 团队）
- 里程碑：M4（收口 · 全流程 + 双端达标）
- Sprint：M4-S1
- 契约：`.opc/sprints/M4-S1.json` 的 `goal` 字段
- 角色：建造员（做完就交，过不过由评审员裁决，本岗不自判通过）

## 一、交付物清单

- 新增 `e2e/m4-full.spec.ts`（PC 视口下端到端跑通 6 条成功条件对应的完整主链路）
- 本回执 `receipts/M4-S1/receipt-builder.md`
- `src/` 改动：无（详见「四、联调缺陷排查」）

## 二、开工必读档案（均已读到）

1. 角色说明书 `utohub-opc/teams/general/roles/builder.md` —— 已读
2. 技能文件 `utohub-opc/teams/general/skills/build-deliverable.md` —— 已读
3. M4 验收标准 `.opc/phase1/milestones.json`（id=M4）—— 已读
4. 本 sprint 上下文 `.opc/sprints/M4-S1.json` —— 已读（逐字）
   - 额外读取 `.opc/phase1/success.json`（6 条成功条件原文，`.opc/phase1/` 允许读）

> 禁区遵守：全程未写入 `.opc/` 任何文件；仅按规矩读了 `.opc/phase1/` 与 `.opc/sprints/`。

## 三、逐条自检（对照 sprint goal 的【验收硬指标】）

主链路顺序（goal 括注）：建场景 → 摆上至少一件物件 → 写故事 → 切游客模式点开看故事+原图 →
多场景与背景不重复上限 3 → 刷新持久化还原 → 同一物件跨场景故事同步。全部落在
`e2e/m4-full.spec.ts` 单条端到端主链路测试内，逐条对应如下：

- 成功条件 ① 主流程闭环：建「客厅」场景 → 点选放入物件（全家福旧照）→ 写故事 S1 → 切游客模式
  点物件 → 弹窗断言 `data-mode=guest` + `story-body`==S1 + `story-photo` 可见且 src 非空。
  全程运行时守卫无报错。→ 覆盖，PASS。
- 成功条件 ② 拖动/缩放/旋转（功能骨架；顺滑手感为 manual 项，本 sprint 不判）：拖动改位（x/y 变、
  其余不动）→ 角手柄缩放（scale 增大、其余不动）→ 顶部手柄旋转（rotation 变、其余不动），逐字段
  断言。→ 覆盖功能骨架，PASS。
- 成功条件 ③ 多场景 + 背景不可重复上限 3：建满「客厅/书房/卧室」3 个场景、背景互不相同；picker
  每次开都不列已用背景（客厅建后仅剩 2、再建后仅剩 1）；用满后 `add-scene` 置灰 + `scenes-exhausted`
  文案「素材已用完」+ picker 打不开。→ 覆盖，PASS。
- 成功条件 ④ 数据持久化：变换后的 placement(x,y,scale,rotation,z) 与故事 S2，`reload` 后逐字段还原
  （切回客厅比对变换值全等；两个场景读回故事均为最新 S2）。→ 覆盖，PASS。
- 成功条件 ⑤ 故事挂物件、跨场景同步：同一物件摆入客厅与书房；书房里读回的是客厅写的 S1（正向同步），
  书房改成 S2 后切回客厅读回 S2（反向同步）。→ 覆盖，PASS。
- 成功条件 ⑥ 双端可用（PC 部分）：以上完整流程在 PC 视口（Desktop Chrome，playwright.config 默认）
  跑通；两处 `assertNoHorizontalOverflow` 断言 PC 视口无横向溢出。768px/375px 双视口与响应式按 goal
  明确留给 S2。→ PC 部分覆盖，PASS。
- milestones.json M4 criteria「无 console 未捕获错误或未处理的 Promise 拒绝」：贯穿全程挂 `pageerror`
  监听、页面内 `unhandledrejection` 收集、`console` error 收集（资源 404 之类网络失败按验收原文
  「未捕获错误/Promise 拒绝」口径排除），测试末尾断言三者皆为空。→ 覆盖，PASS。

命令级硬指标：`npx playwright test e2e/m4-full.spec.ts --reporter=line` 须 exit 0 —— 已达成（见下）。

## 四、联调缺陷排查（就地修复项）

- 把 M1/M2/M3 各功能点串成单条完整主链路后，端到端首跑即通过，且运行时守卫（pageerror /
  unhandledrejection / console error）全程为空 —— 未发现需就地修复的联调缺陷。
- 因此本 sprint `src/` 零改动；符合 goal「主要是把它们串成一条完整链路的 e2e」的定位。

## 五、命令输出

### 5.1 基线（既有 M1/M2/M3 套件，动手前）
```
Running 8 tests using 1 worker
...
  8 passed (8.5s)
```

### 5.2 本 sprint 硬指标命令（新增 spec，exit 0）
```
$ npx playwright test e2e/m4-full.spec.ts --reporter=line
EXIT_CODE=0
Running 1 test using 1 worker
[1/1] [chromium] › e2e/m4-full.spec.ts:197:1 › 全流程主链路（PC）：建场景→摆物件→变换→写故事→游客看故事+原图→多场景上限3→跨场景同步→刷新还原
  1 passed (3.2s)
```

### 5.3 全套件回归（9 tests，无回归）
```
Running 9 tests using 1 worker
...
[9/9] [chromium] › e2e/m4-full.spec.ts:197:1 › 全流程主链路（PC）…
  9 passed (8.6s)
```

### 5.4 稳定性（M4 spec 连跑 3 次，无 flaky）
```
run 1 exit=0
run 2 exit=0
run 3 exit=0
```

## 六、范围与边界说明

- 本 sprint 只做 PC 视口主链路骨架 + exit 0；768px/375px 双视口、响应式、整体视觉还原（旧信 DNA）
  按 goal 明确划归 S2，本 spec 不做，避免越界。
- 未自判通过；交评审员对照 M4 验收标准裁决。
