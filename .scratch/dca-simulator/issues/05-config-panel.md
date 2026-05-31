# 05 - 配置面板（App Shell + Segment Editor）

Status: 可自动处理

## Parent

`.scratch/dca-simulator/PRD.md`

## What to build

构建 App Shell 和完整的策略配置面板。

**App Shell**：响应式布局——桌面端左侧 380px 固定侧栏 + 右侧自适应内容区，移动端（≤768px）上下堆叠。顶部导航栏含 Logo、「导入」「导出」「分享」按钮。底部状态栏显示数据覆盖范围。参考 `preview.html` 的布局骨架。

**配置面板（侧栏内容）**：
- 计算窗口：开始日期、结束日期两个 date input
- 费率：申购费、赎回费、管理费三个 number input，默认折叠在「高级设置」中
- 定投片段列表：
  - 每个片段以 Card 形式展示（标题栏：片段编号 + 删除按钮）
  - 片段表单：指数 Select、频率 Radio（月/周）、定投日 Select、金额 Input、开始/结束日期
  - 「+ 添加片段」按钮

**暗色主题**：按 CLAUDE.md 配色方案实现 Tailwind 暗色主题。IBM Plex Sans（正文）+ Fira Code（数字等宽），tabular-nums 对齐。

App 级状态：Strategy 作为唯一数据源，由 App 组件持有，通过 props 下传。Segment 的增删改通过回调函数上抛。页面挂载时触发 Data Loader 加载 CSV 文件列表。

## Acceptance criteria

- [ ] 桌面端：左侧配置面板 380px + 右侧内容区
- [ ] 移动端（≤768px）：配置面板移至顶部，KPI 卡片 2×2，图表全宽
- [ ] 暗色主题视觉与 `preview.html` 一致
- [ ] 可添加、删除定投片段
- [ ] 片段表单所有字段可编辑并反映到 App state
- [ ] 费率面板默认折叠，点击展开
- [ ] 所有 Select/Input 有 label 关联（无障碍）
- [ ] 导航栏三个按钮存在（功能在 Issue 07 实现）

## Blocked by

- 01（Data Loader — 需要 CSV 文件列表加载）
- 03（Strategy Engine — 需要 Strategy / Segment 类型）
