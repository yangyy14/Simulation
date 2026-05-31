# 07 - 持久化（Storage + 导入导出 + URL 分享）

Status: 可自动处理

## Parent

`.scratch/dca-simulator/PRD.md`

## What to build

实现策略的三种持久化方式：

**localStorage 自动保存**：使用自定义 hook `useAutoSave(strategy)`，任何 Strategy 变更 500ms 防抖后写入 localStorage。页面挂载时从 localStorage 读取并恢复策略。策略版本不匹配时静默忽略旧数据。

**JSON 导出/导入**：
- 「导出」按钮：生成 JSON 文件，触发浏览器下载（文件名含日期如 `定投策略_2026-05-31.json`）
- 「导入」按钮：打开文件选择器，读取 JSON 文件内容，解析为 Strategy 对象后设置到 state
- 拖拽导入：页面任意位置拖入 JSON 文件，解析后设置 strategy。拖拽悬停时显示视觉提示

**URL 分享**：
- 「分享」按钮：调用 Issue 04 的 URL Serializer 编码当前 Strategy，把 URL 复制到剪贴板
- 页面挂载时检查 URL：如果 URL 包含策略参数，解码后设置为初始策略（优先级高于 localStorage）
- 复制成功后用 Sonner Toast 提示「链接已复制」

## Acceptance criteria

- [ ] 修改策略后刷新页面，配置恢复如初
- [ ] 旧版本 localStorage 数据被静默忽略，不影响页面
- [ ] 导出按钮下载 JSON 文件，文件内容与当前 Strategy 一致
- [ ] 导入按钮选择 JSON 文件后，策略正确恢复
- [ ] 拖拽 JSON 文件到页面，策略正确恢复
- [ ] 拖拽过程中页面有视觉反馈
- [ ] 分享按钮复制 URL 到剪贴板，Toast 提示成功
- [ ] 用分享链接打开页面，策略与分享者一致
- [ ] URL 策略优先级高于 localStorage（避免旧自动保存覆盖分享内容）

## Blocked by

- 04（URL Serializer）
- 05（配置面板 — 需要 App state 结构）
