# 02 - XIRR 计算器

Status: 可自动处理

## Parent

`.scratch/dca-simulator/PRD.md`

## What to build

实现 XIRR（扩展内部收益率）纯函数模块。输入现金流数组 `{date: string, amount: number}[]`（负数为支出、正数为收入），输出年化利率 `number`。使用 Newton 迭代法求解使 NPV 为零的折现率，收敛阈值 1e-6。

编写 Vitest 测试：
- 用 Excel `XIRR()` 函数的已知结果手工验算
- 测试空现金流 → 抛出明确错误
- 测试单笔现金流 → 边界处理
- 测试全部同号现金流（无解情况）

无外部依赖，无 UI。可与 Issue 01 并行开发。

## Acceptance criteria

- [ ] `xirr([{date: '2024-01-01', amount: -1000}, {date: '2025-01-01', amount: 1100}])` 返回 ~0.10（约 10%）
- [ ] 与 Excel XIRR 函数输出误差 < 0.0001
- [ ] 空现金流抛出错误
- [ ] 所有测试通过

## Blocked by

None — 可立即开始（与 01 并行）
