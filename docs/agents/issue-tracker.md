# Issue Tracker：本地 Markdown

Issues 和 PRD 以 Markdown 文件形式存放在 `.scratch/` 下。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- PRD 文件为：`.scratch/<feature-slug>/PRD.md`
- 实现 issue 文件为：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- 分类状态以 `Status:` 行的形式记录在每个 issue 文件顶部（角色字符串见 `triage-labels.md`）
- 评论和对话历史追加在文件末尾的 `## Comments` 标题下

## 当技能说"发布到 issue tracker"

在 `.scratch/<feature-slug>/` 下创建新文件（如目录不存在则先创建）。

## 当技能说"获取相关 ticket"

读取指定路径的文件。用户通常会直接传路径或 issue 编号。
