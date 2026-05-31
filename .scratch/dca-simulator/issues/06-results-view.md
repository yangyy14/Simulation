# 06 - 结果展示（KPI + Chart + Table）

Status: 可自动处理

## Parent

`.scratch/dca-simulator/PRD.md`

## What to build

构建结果展示区的全部组件，并接入真实的 Strategy Engine 计算。

**KPI 卡片**：4 张卡片横向排列，分别显示累计投入总额、期末总市值、累计收益率、XIRR 年化收益率。数字用 Fira Code tabular-nums 对齐。收益率为正时绿色 `#22C55E`、为负时红色 `#EF4444`，配合 Lucide `TrendingUp` / `TrendingDown` 图标。每张卡片有副标题行（如「共 N 笔定投」「2025-12-31 估值」）。

**ECharts 市值 vs 成本图**：
- 绿色面积图表示市值随时间变化
- 蓝色虚线表示累计投入成本
- 标记回本节点（市值首次超越成本的日期）
- DataZoom 底部滑块支持缩放时间范围
- 鼠标悬浮交互：竖十字线 + 两个数据圆点 + 悬浮提示框显示日期、市值金额、成本金额、收益率
- 图例在图表上方居中

**定投明细表**：使用 TanStack Table，列包括日期、指数、买入净值、买入份额、投入金额、当前净值、当前市值、盈亏百分比。盈亏列正绿色负红色。表头可点击排序。显示总笔数。

计算管线：Strategy → Strategy Engine.generateTransactions → 各组件消费 Transaction[] 和 PortfolioSummary。

## Acceptance criteria

- [ ] 4 张 KPI 卡片显示正确数值
- [ ] 收益率正负分别显示绿色和红色，带趋势图标
- [ ] ECharts 渲染市值面积图 + 成本虚线
- [ ] 鼠标悬停图表出现十字线 + Tooltip（日期、市值、成本、收益率）
- [ ] DataZoom 滑块可缩放时间范围
- [ ] 回本节点标记在图表上
- [ ] 明细表列出所有 Transaction，列数据正确
- [ ] 明细表点击表头可排序
- [ ] 盈亏百分比正负颜色正确

## Blocked by

- 03（Strategy Engine — 需要完整计算管线）
- 05（配置面板 — 需要 App state 和 layout 就位）
