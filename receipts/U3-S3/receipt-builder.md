# U3-S3 建造员回执 —— 用户物件平权与删除管理 e2e

## 本 sprint 契约（goal）
把「用户物件平权与删除管理」这条验收标准补上一份**路径正确**的自动化验收脚本，落在
`e2e/u3-parity.spec.ts`，覆盖：对一件上传物件施加内置物件全部操作（拖入/挪位/缩放/旋转/写故事/
重命名/跨场景故事同步）均可用且行为一致；删除后两场景摆放一并消失、IndexedDB 图片记录清除、
刷新不复活；内置物件无删除入口。跑通 `npx playwright test e2e/u3-parity.spec.ts --reporter=line`
退出码为 0。

## 根因判定（沿用上一轮线索并亲自核实）
上一轮 U3 判失败，criteria[0] 报 `Error: No tests found`（criteria[1] 配额、criteria[2] 游客均已过）。
根因不是功能没做对，而是**已有的完整自测脚本文件名跟里程碑点名的路径对不上号**：
仓库里有 `e2e/u3-s1-parity-selftest.spec.ts`（3 个用例，逐条覆盖 criteria[0] 全部要点），但里程碑
check.cmd 点名的是 `e2e/u3-parity.spec.ts`，该路径此前不存在，故 playwright 找不到测试文件、退出码 1。

## 改动清单
1. 迁移改名：`e2e/u3-s1-parity-selftest.spec.ts` → **`e2e/u3-parity.spec.ts`**（内容原样迁移，
   仅改文件头注释——从「非里程碑官方 e2e，留给下个 sprint」改为「U3 里程碑官方 e2e 之一」，
   并写明验收命令）。测试逻辑/断言一字未弱化。
2. 删除旧文件 `e2e/u3-s1-parity-selftest.spec.ts`，确保该测试**只在** `e2e/u3-parity.spec.ts`
   这一路径下存在一份（满足「仅在该路径有一份」的硬性要求）。
3. 源码零改动——迁移前先跑旧自测确认 3 用例全绿，证明被测应用功能本身达标，无需改动生产代码。

选择迁移改名而非推倒重写的理由：旧自测已用与官方姊妹用例（u3-quota / u3-guest）完全一致的
testid 约定与真实 UI 驱动手法（真 UploadEntry→真上传管线→真预览→真 dispatch→真 Canvas 拖放/变换/
故事→真删除入口），且逐条覆盖 criteria[0] 全部要点，无缺项，重写只会徒增风险。

## 自检：逐条对照 U3 criteria[0] 验收清单
被测文件 `e2e/u3-parity.spec.ts`，三个用例映射如下（均真实驱动 UI，无测试钩子入生产码）：

用例① 删除入口分流（对应「内置物件无删除入口」）
- [x] 初始 14 件内置物件，`item-delete` 入口数 = 0
- [x] 上传 1 件 user 件 → 恰出现 1 个删除入口，且落在该 user 缩略卡内部
- [x] 再上传 1 件 → 2 个删除入口；逐一核对 14 件内置缩略卡内部删除入口数 = 0

用例② 用户件平权（对应「全部操作均可用且行为一致」）
- [x] 拖入：从 dock 缩略卡真实拖到画布，placement 生成；落位只经 `translate(`、不含 `left`（transform-only，与内置件一致）
- [x] 挪位：拖 node，仅 x/y 变，w/rotation 不变
- [x] 缩放：拖 br 角手柄，仅 w 变大，x/y 不变；选中态出现 4 缩放手柄 + 1 旋转手柄
- [x] 旋转：拖旋转钮，仅 rotation 变，w 不变
- [x] 写故事：选中→故事手柄→填→保存，story-modal 关闭
- [x] 重命名：dock 就地改名，item-name 更新为新名
- [x] 跨场景摆放 + 故事同步：切「客厅」摆同一件 → 故事值与新名都同步过来
- [x] 刷新：物件/新名 持久化还原

用例③ 删除干净不留尸（对应「删除后两场景摆放消失 + IndexedDB 清除 + 刷新不复活」）
- [x] 同一件上传物件摆进客厅 + 书房两个场景（落盘 2 条 placement）
- [x] 图片二进制进 IndexedDB（idbCount = 1）
- [x] 删除前先取消一次（确认框可撤销、不误删）
- [x] 确认删除 → dock 回到 14 件、该 user 件消失、删除入口归零
- [x] 当前场景（书房）摆放消失；切客厅那边摆放也消失（跨场景残影为零）
- [x] 落盘 items/placements 里都不再有该 itemId；IndexedDB 图片记录 idbCount = 0
- [x] 刷新后不复活：dock 无该件、两场景均无摆放、IndexedDB 仍为 0

全程守护：每个用例都监听 pageerror / console.error，断言 `problems` 为空——无未捕获错误。

## 实跑验证
命令（与 check.cmd 逐字一致）：`npx playwright test e2e/u3-parity.spec.ts --reporter=line`
结果：
```
Running 3 tests using 1 worker
[1/3] ① 删除入口分流 …
[2/3] ② 用户件平权 …
[3/3] ③ 删除干净不留尸 …
  3 passed (7.8s)
EXIT_CODE=0
```
退出码 0，符合 milestones.json U3 criteria[0] 的 expect_exit=0。

## 被测应用 bug 记录
无。迁移前旧自测即 3 用例全绿，本 sprint 未发现被测功能不达标之处，未弱化任何断言。

## 交付物
- `e2e/u3-parity.spec.ts`（新增，唯一路径，覆盖 U3 criteria[0] 全部要点）
- `e2e/u3-s1-parity-selftest.spec.ts`（删除，避免同一测试双份）
- 无源码改动。
