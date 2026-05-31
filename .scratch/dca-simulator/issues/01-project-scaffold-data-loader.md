# 01 - 项目脚手架 + Data Loader

Status: 可自动处理

## Parent

`.scratch/dca-simulator/PRD.md`

## What to build

初始化 Vite + React + TypeScript 项目，配置 shadcn/ui、Tailwind、ECharts、TanStack Table、Lucide React、Vitest。按 CLAUDE.md 中的设计系统变量配好 Tailwind 主题（暗色金融仪表盘配色、IBM Plex Sans + Fira Code 字体）。

创建 Data Loader 深模块：解析 `public/data/` 下的 CSV 文件，产出 `PriceSeries` 对象。CSV 格式为 `日期,收盘价`，日期 ISO 8601。`PriceSeries.getPrice(targetDate)` 实现顺延逻辑——传入日期如果不在数据中，返回下一个最近的交易日价格。

准备最少一份示例 CSV（如沪深 300 前 3 个月数据），让后续 slice 有真实数据可读。

编写 Data Loader 的 Vitest 测试：验证日期解析、顺延逻辑（传入周末和假日的 targetDate，验证返回正确下一个交易日价格）。

## Acceptance criteria

- [ ] `npm run dev` 启动 Vite 开发服务器
- [ ] shadcn/ui Button 组件可正常渲染
- [ ] Tailwind 暗色主题变量（--bg-root: #020617 等）生效
- [ ] `public/data/` 下存在至少一份示例 CSV
- [ ] Data Loader 解析 CSV 为 PriceSeries，getPrice 返回正确价格
- [ ] getPrice 对非交易日日期顺延到下一交易日
- [ ] Data Loader 测试通过

## Blocked by

None — 可立即开始
