# U3-S3 评审证据 —— 平权与管理 e2e 路径迁移

## 核查范围
本 sprint（U3-S3）goal 子集：milestones.json U3 criteria[0]（平权与管理 e2e）+ 对应 check
`npx playwright test e2e/u3-parity.spec.ts --reporter=line`（expect_exit 0）。
不涉及 criteria[1]（配额）、criteria[2]（游客只读）——两者上一轮已过，本 sprint 未点名，不重判。

## 1. 路径核查（硬性要求①）
```
$ ls -la e2e/ | grep -i u3
-rw-r--r--  u3-guest.spec.ts
-rw-r--r--  u3-parity.spec.ts
-rw-r--r--  u3-quota.spec.ts

$ find . -path ./node_modules -prune -o -name "*u3-s1*" -print -o -name "*parity-selftest*" -print
(无输出)
```
结论：`e2e/u3-parity.spec.ts` 存在；全仓库搜索确认旧文件
`e2e/u3-s1-parity-selftest.spec.ts`（及任何 `*parity-selftest*` 命名）已不存在，唯一路径达成。

## 2. 实跑验收命令（硬性要求②）
cwd: /Users/yuriiiz/Projects/Memories
```
$ npx playwright test e2e/u3-parity.spec.ts --reporter=line
Running 3 tests using 1 worker

[1/3] [chromium] › e2e/u3-parity.spec.ts:191:1 › ① 删除入口分流：内置 14 件无删除入口，上传一件 user 件才出现删除入口
[2/3] [chromium] › e2e/u3-parity.spec.ts:233:1 › ② 用户件平权：拖入 → 挪位 → 缩放 → 旋转 → 写故事 → 重命名 → 跨场景故事同步，行为一致
[3/3] [chromium] › e2e/u3-parity.spec.ts:337:1 › ③ 删除干净不留尸：两场景摆放消失 + IndexedDB 图片清除 + 刷新不复活
  3 passed (7.7s)
EXIT_CODE=0
```
结论：能找到并跑完该文件，3/3 通过，退出码 0，与 milestones.json check 逐字一致（cmd/参数/expect_exit）。

## 3. 断言逻辑逐条对照【验收硬指标】（硬性要求③）
通读 `e2e/u3-parity.spec.ts`（417 行，3 个 test），并交叉核对被测源码
`src/state/gallery.ts`、`src/components/Workbench.tsx`、`src/components/ItemTray.tsx`、
`src/storage/imageStore.ts`、`src/assets/manifest.ts`。

| 验收点 | 测试位置 | 断言方式 | 判定 |
|---|---|---|---|
| 拖入 | test② L251-259 | 真实 mouse down/move/up 从缩略卡拖到画布，断言 placement 生成且 `style` 含 `translate(` 不含 `left`（transform-only，与内置件同款渲染路径） | 实证 |
| 挪位 | L262-268 | 拖 `.stage__node`，断言仅 x/y 变化、w/rotation 严格不变 | 实证，非弱断言（不是只测"发生了变化"） |
| 缩放 | L274-279 | 拖 `br` 角手柄，断言仅 w 增大、x/y 不变 | 实证 |
| 旋转 | L281-285 | 拖 `handle-rotate`，断言仅 rotation 变、w 不变 | 实证 |
| 写故事 | L287-294 | 选中→`placement-story`→填→`story-save`→modal 关闭 | 实证，走真实 story-modal 组件 |
| 重命名 | L296-307 | dock 内 `item-name` 点击进入编辑→`item-name-input`填新名→Enter→断言 dock 显示更新 | 实证 |
| 跨场景故事同步 | L309-321 | 切「客厅」→把同一 itemId 摆入→打开故事弹窗→断言 `story-input` 值与 `.story__name` 均为新写入的故事/新名 | 实证，验证的是"同一 Item 在另一场景读到同步结果"而非仅"另一场景也能操作" |
| 刷新还原 | L323-329 | reload 后断言 dock 仍有该 itemId 且名字为新名 | 实证 |
| 内置物件无删除入口 | test① L198-224 | 初始断言 `item-delete` count=0；上传 1/2 件后断言其 count 分别为 1/2，且逐一核对 14 件内置缩略卡（用 `!id.startsWith('item-')` 与 manifest 里 `bedroom-*`/`living-*` 命名一致）内部删除入口数=0 | 实证，非仅测 UI 存在而是精确计数比对 |
| 删除后两场景摆放一并消失 | test③ L342-392 | 摆入客厅+书房两场景（先 poll 落盘 2 条 placement 确认真摆上）→删除→分别在当前场景（书房）和切回客厅后断言 `itemLocator` count=0 | 实证，覆盖当前场景与非当前场景两侧 |
| IndexedDB 图片记录清除 | L360-364, 394-403 | 删除前 `idbCount(ref)===1`（先证明确实写进去了，排除"本来就是0"的假阳性）；删除后 poll 到 `idbCount(ref)===0`；`ref = img-${userId}` 与 `Workbench.tsx handleDeleteItem` 里 `item.imageRef ?? \`img-${item.id}\`` 键约定核对一致 | 实证，直接 `indexedDB.open` 查库，非读状态树代理 |
| 刷新不复活 | L405-413 | reload 后断言 dock 无该件、当前场景与另一场景（书房）均无摆放、`idbCount` 仍为 0 | 实证 |
| 删除确认可撤销（附加验证，非缩水） | L366-373 | 先点删除→确认框可见→点取消→缩略卡仍在，证明确认流程真实存在而非一键误删 | 加分项，不算标准之外扣分 |

### 源码交叉印证（非仅信任测试自身）
- `src/state/gallery.ts` `delete-item`：仅编辑模式、仅 `source==='user'` 可删（内置件即便被
  dispatch 也原样返回状态），且 `placements: state.placements.filter(p => p.itemId !== itemId)`
  —— 不按 sceneId 过滤，天然清掉所有场景的摆放，与测试③"两场景一并消失"要求吻合。
- `src/components/Workbench.tsx` `handleDeleteItem`：`ref = item.imageRef ?? \`img-${item.id}\`` 后
  `dispatch(delete-item)` + `deleteImage(ref)`，与测试里 `ref = \`img-${userId}\`` 及
  `idbCount` 直查 `memories.images`/`images` store 的键完全对应；`src/storage/imageStore.ts`
  的 `deleteImage` 走 `store.delete(id)`，`DB_NAME='memories.images'`、`STORE='images'`、
  `DB_VERSION=1`，与测试 `IMAGE_DB`/`IMAGE_STORE` 常量一致。
- `src/components/ItemTray.tsx`：`ItemDelete` 组件仅在 `item.source === 'user'` 时渲染
  （L259-261），内置件所在的 `<div data-testid="tray-item">` 内部不含该组件，故 DOM 层面
  天然为 0——与测试①的逐一核对逻辑相符，非测试单方面断言。
- `src/assets/manifest.ts`：内置 14 件 id 均为 `bedroom-*`/`living-*` 前缀，用户件由
  `newId('item')` 生成 `item-*` 前缀（gallery.ts L259/60），与测试①里
  `!id.startsWith('item-')` 甄别内置件的方式一致，非凭空猜测的字符串前缀。

### 是否存在断言弱化/绕过关键检查点
未发现。抽查关键点：
- IndexedDB 检查是直接 `indexedDB.open` + `count(key)`，不是读 localStorage 代理判断，且删除前先证明
  `idbCount===1`（证明写入确实发生），排除"key 算错导致一直是 0 的假阳性通过"的可能——这点已用
  源码里实际的 key 生成规则交叉核实一致。
- 平权各操作断言的是"只有目标字段变、其余字段不变"的精确约束，比"发生了某种变化"更严格，能捕捉
  例如缩放时意外联动改变位置这类回归。
- 未发现 `test.skip`、注释掉的断言、或用 `try/catch` 吞掉失败的写法。
- 三个 test 均在末尾 `expect(problems).toEqual([])` 校验无 pageerror/console.error，覆盖"全程不崩"隐含要求。

## 4. 结论
- 硬性要求①②③ 均亲手核查通过，测试文件路径唯一、命令实跑 3/3 绿、退出码 0，断言逻辑经源码交叉印证站得住脚，未发现弱化或绕过。
- 建造员自报的改动清单（迁移改名、删除旧文件、源码零改动）与亲手核查结果一致。
- 判定：PASS。
