# U1-S1 评审证据

- sprint：`U1-S1`（里程碑 U1：数据与存储地基 · 三版第一块）
- 岗位：general 队 · 评审员
- 核查范围：仅 U1-S1 sprint goal 点名的子集——Item 数据结构双源化 + `reconcileItems` 丢弃用户物件的 bug 修复。不拿 U1-S2 范围（IndexedDB / schema v4 / saveState 静默失败终结）的标准打这个 sprint。

## 一、开工必读档案（全部亲自读完）

1. `/Users/yuriiiz/Projects/utohub-opc/teams/general/roles/reviewer.md` ✅
2. `/Users/yuriiiz/Projects/utohub-opc/teams/general/skills/review-against-criteria.md` ✅
3. `/Users/yuriiiz/Projects/Memories/.opc/phase1/milestones.json`（`id:"U1"` 条目）✅
4. `/Users/yuriiiz/Projects/Memories/.opc/phase1/success.json` ✅
5. `/Users/yuriiiz/Projects/Memories/.opc/sprints/U1-S1.json`（goal 字段，含【验收硬指标】原文）✅
6. `/Users/yuriiiz/Projects/Memories/receipts/U1-S1/receipt-builder.md`（建造员过程记录）✅

无 BLOCKED。全部档案可读、已通读。

## 二、U1-S1【验收硬指标】拆条（原文出自 U1-S1.json）

> 在 loadState 注入一个不在 ITEMS 清单里的 user Item，reconcile 后该 Item 必须仍存在于返回的 items 数组里；内置 14 件仍与 manifest.ts 的 ITEMS 对齐；npm run build 须 exit 0、无类型错误。

拆成三条逐条核查（不借用 U1 里程碑里 IndexedDB/v4/存储报错那两条 e2e 标准，那是 U1-S2 的活）：

| # | 硬指标 | 核查方式 | 结论 |
|---|---|---|---|
| ① | 注入不在清单里的 user Item，reconcile 后仍在 items 数组里 | 亲读 `persistence.ts` reconcile 逻辑 + 亲跑 e2e（非信builder 自报） | 过 |
| ② | 内置 14 件仍与 manifest.ts 的 ITEMS 对齐 | 亲读代码 + 亲跑 e2e 逐件断言 | 过 |
| ③ | npm run build exit 0、无类型错误 | 亲自执行命令 | 过 |

## 三、逐条核查证据

### ① reconcile 后用户物件不再被丢弃

**亲读源码**（`/Users/yuriiiz/Projects/Memories/src/storage/persistence.ts` 行 142-164，全文摘录）：

```ts
function reconcileItems(persisted: Item[] | undefined, initial: Item[]): Item[] {
  if (!Array.isArray(persisted)) return initial;
  const byId = new Map(persisted.map((i) => [i.id, i]));
  const builtinIds = new Set(initial.map((i) => i.id));

  // 1) 内置项：对齐清单 + 保留用户写入的 name/story。
  const builtins = initial.map((base) => {
    const saved = byId.get(base.id);
    if (!saved) return base;
    return {
      ...base,
      name: typeof saved.name === 'string' && saved.name.trim() ? saved.name : base.name,
      story: typeof saved.story === 'string' ? saved.story : '',
    };
  });

  // 2) 用户项：id 不在内置清单里的持久化物件原样保留（不丢弃）。
  const users = persisted.filter(
    (i): i is Item => !!i && typeof i.id === 'string' && !builtinIds.has(i.id),
  );

  return [...builtins, ...users];
}
```

逻辑判读：旧版实现是 `initial.map(...)`——只以内置清单为基准遍历，任何 `persisted` 里不在 `initial`（即不在内置 14 件）范围的条目根本不会被访问到，天然丢失。新实现把 `builtins`（对齐清单）与 `users`（`persisted` 中 id 不在 `builtinIds` 集合里的条目，原样保留）分别计算后 `[...builtins, ...users]` 拼接返回——用户物件不再经过"以内置清单为基准"的过滤关卡，逻辑上确实修复了丢弃 bug。

**亲跑 e2e 复核**（不信builder 自报，自己跑）：

```
$ npx playwright test e2e/u1-s1-dualsource.spec.ts --reporter=line
Running 1 test using 1 worker
[1/1] [chromium] › e2e/u1-s1-dualsource.spec.ts:34:1 › 双源目录：注入不在清单里的 user Item，reconcile 后仍在；内置 14 件仍对齐清单、应用不崩
  1 passed (2.2s)
EXIT_CODE=0
```

连跑 3 次（含上面一次共 3 次独立运行），均 `1 passed`，未见 flaky：
```
RUN2: 1 passed (1.3s)  EXIT=0
RUN3: 1 passed (1.3s)  EXIT=0
```

亲读该 e2e 的关键断言（`e2e/u1-s1-dualsource.spec.ts`）：预置 localStorage 为 `schemaVersion:3`，`items` 数组**只写一件** `id:'user-friend-photo-1'`、`source:'user'` 的物件（14 件内置一个都不写），reload 后断言：
- `[data-testid="tray-item"][data-item-id="user-friend-photo-1"]` count=1，且 `img.itm` 的 `src` 等于注入的 data URL、名字为"朋友的照片"——证明用户物件本体（含图片、名字）原样存活，不是仅剩空壳。
- 14 个内置 id 逐个 `toHaveCount(1)`——证明即使持久化里一件内置都没写，reconcile 仍从清单把 14 件全部补齐。
- dock 总数断言 `toHaveCount(15)` = 14 内置 + 1 用户，用户物件与内置物件平级并列、互不挤占。

判定：亲读代码逻辑 + 亲跑测试双重核查一致，**①过**。

### ② 内置 14 件仍与 manifest.ts 的 ITEMS 对齐

亲读 `/Users/yuriiiz/Projects/Memories/src/assets/manifest.ts`，`ITEMS` 常量枚举 14 件（`bedroom-1..6` + `living-1..8`），与 `e2e/u1-s1-dualsource.spec.ts` 里硬编码的 `BUILTIN_IDS` 列表逐一比对，完全一致（14 个 id 一个不多一个不少）。

亲读 `createInitialItems()`（`persistence.ts` 行 37-48）：仍是 `ITEMS.map(asset => ...)` 派生，新增字段（`source:'builtin'`、`aspectRatio: asset.aspectRatio`、`originalImageSrc`/`displayImageSrc`/`imageSrc` 均取 `asset.imageSrc`）对齐清单，未偏离清单来源。

`reconcileItems` 的 `builtins` 分支恒以 `initial`（=`createInitialItems()` 的产物，即清单派生）为基准 `initial.map(...)` 逐件对齐，缺失从清单补——即便 `persisted` 里一件内置都没写，14 件仍会出现。

e2e 断言已覆盖（见①的证据），亲跑结果 14 件逐个 count=1 全过。

判定：**②过**。

### ③ npm run build exit 0、无类型错误

亲自执行（未借用建造员的自报数字）：

```
$ npm run build
> memories@0.1.0 build
> tsc -b && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 57 modules transformed.
...
✓ built in 375ms
EXIT_CODE=0
```

`tsc -b` 先跑（类型检查门），未见任何错误行，`vite build` 随后顺利产出 `dist/`。判定：**③过**。

## 四、旁证：全量回归无新增失败（虽非本 sprint 硬指标，但用于核查"未越界破坏既有能力"）

亲自跑全量：

```
$ npx playwright test --reporter=line
...
9 failed
    e2e/m2-transform.spec.ts ×2
    e2e/m3-story.spec.ts ×1
    e2e/m4-full.spec.ts ×3
    e2e/n1-foundation.spec.ts ×3
27 passed (1.5m)
EXIT_CODE=0
```

亲读失败用例源码确认失败原因（grep `schemaVersion` 命中）：
- `e2e/m3-story.spec.ts:126`、`e2e/m4-full.spec.ts:286`：硬编码 `expect(persisted?.schemaVersion).toBe(2)`。
- `e2e/n1-foundation.spec.ts:115/186/208`：硬编码 `expect(stored.schemaVersion).toBe(2)`。

而当前 `persistence.ts` 的 `SCHEMA_VERSION = 3`（N2 已升版，本 sprint 未改动此常量）。这些用例是 v2 时代遗留、未随 v2→v3 升级同步更新的旧断言，与本 sprint 的双源化/reconcile 改动无关联（本 sprint 未碰 `SCHEMA_VERSION`、未碰这些测试文件）。

**独立交叉核验**（不采信 builder 单方面说法）：调取上一个 sprint `N4-S1` 的评审前基线记录 `/Users/yuriiiz/Projects/Memories/receipts/N4-S1/receipt-builder.md` 行 58-63：

> 全量回归...25 passed / 9 failed...9 条 failed 全部为预存失败...`n1-foundation.spec.ts` ×3...`m2-transform.spec.ts` ×2、`m3-story.spec.ts` ×1、`m4-full.spec.ts` ×3

失败文件与条数（n1-foundation×3、m2-transform×2、m3-story×1、m4-full×3 = 9）与本次我亲跑的结果完全一致（N4-S1 时 passed 数为 25，本次为 27，差值 2 = N4-S1 之后新增的 `n4-full` 全流程 e2e 1 条 + 本 sprint 新增 `u1-s1-dualsource` 1 条，均计入 passed，失败集合未变）。这证明本 sprint 的改动**零新增失败、零回归**，9 条失败在本 sprint 开工前就已存在，与本次改动无因果关系。

## 五、结论

U1-S1 sprint goal 点名的三条硬指标（用户物件不被 reconcile 丢弃 / 内置 14 件仍对齐清单 / build exit 0 无类型错误）逐条亲手核查（读代码 + 独立跑命令，不采信自报），**三条全过**；全量回归交叉核验 N4-S1 基线，确认零新增失败。未发现缺失、错误或不达标项。

**结论：pass。** 放行定稿。理由：三项硬指标均亲核通过且有证据支撑，reconcileItems 的核心 bug（内置清单当基准 map、用户物件被 initial.map 天然排除在遍历范围外从而丢弃）在新实现中被正确拆分为 builtins/users 两路且分别处理，逻辑正确；范围严格收在本 sprint 契约内（未越界碰 IndexedDB/v4/saveState/渲染消费点）；全量回归无新增失败。

## 六、边界

- 未碰 `.opc/` 目录下任何文件（只读）。
- 未对成品做任何代改；挑不出问题，直接放行定稿。
- 落账动作（write review-evidence / advance sprint）由主控代跑，本岗不直接调用 opc.mjs。
