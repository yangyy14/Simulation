# 03 - Strategy Engine

Status: 可自动处理

## Parent

`.scratch/dca-simulator/PRD.md`

## What to build

实现 Strategy Engine 深模块：

**类型定义**：`Strategy`（segments + fees + evalWindow）、`Segment`（index, frequency, day, amount, startDate, endDate）、`Transaction`（date, index, price, shares, amount）、`PortfolioSummary`（totalCost, marketValue, totalShares, cumulativeReturn, xirr）。

**策略验证**：检查日期范围是否在数据范围内、金额 > 0、频率和定投日合法。

**现金流生成**：遍历所有 Segment，按频率（月/周）生成定投日期序列。对每个定投日调用 PriceSeries.getPrice（通过顺延获取实际交易价格），产出一条 Transaction（买入份额 = 金额 × (1 - 申购费率) / 价格）。

**组合汇总**：汇总所有 Transaction，计算累计投入总额、期末总市值（份额 × 当前净值 × (1 - 赎回费率)）、累计收益率。XIRR 由 Issue 02 的模块计算。

编写测试：用 Mock PriceSeries（内存对象），构造已知策略，验证生成的 Transaction 数量、日期、金额、份额正确；验证组合汇总与手算结果一致。测试费率对市值和成本的影响。

## Acceptance criteria

- [ ] Strategy / Segment / Transaction / PortfolioSummary 类型定义完整
- [ ] 策略验证拒绝非法输入（负金额、日期倒挂等）
- [ ] 按月定投生成正确数量的 Transaction（每月 1 笔）
- [ ] 按周定投生成正确数量的 Transaction
- [ ] 多 Segment 合并后 Transaction 按日期排序
- [ ] 组合汇总的市值和成本与手算一致
- [ ] 申购费影响投入金额，赎回费影响期末市值
- [ ] 管理费按年化比例影响净值
- [ ] 计算窗口结束日期超出最后定投日期时，持仓持续累积市值
- [ ] 所有测试通过

## Blocked by

- 01（Data Loader — 需要 PriceSeries 接口类型）
