# 04 - URL Serializer

Status: 可自动处理

## Parent

`.scratch/dca-simulator/PRD.md`

## What to build

实现 Strategy 对象与 URL 查询字符串的双向转换。将 Strategy 序列化为紧凑的 URL 参数（如 JSON → base64 或压缩后在 URL fragment 中），从 URL 反序列化还原为等价的 Strategy 对象。

编写 round-trip 测试：编码后解码的结果与原 Strategy 深度相等。测试边界：空 segments 的策略、单 segment 策略、多 segment 策略、含费率的策略。

## Acceptance criteria

- [ ] `encode(strategy)` 返回可分享的 URL 字符串
- [ ] `decode(url)` 返回与原 Strategy 等价的对象
- [ ] Round-trip 测试通过：任意合法 Strategy → encode → decode → 与原始对象深度相等
- [ ] URL 长度对典型策略（3-5 个 segment）不超过 ~2000 字符

## Blocked by

- 03（Strategy Engine — 需要 Strategy 类型定义，无需运行时行为）
