# MEMORY_WARM.md — 温记忆（按需加载）

> 中等频率信息。需要时 Claude Code 会加载此文件。
> 执行 `/skill memory-warm` 可手动加载。

---

## 已知问题与 Workaround

### WK-001: Godot 不在 PATH
- **问题**: 命令行无法直接运行 `godot`
- **Workaround**: 在 `~/.claude.json` 中配置 shell alias，或使用绝对路径

### WK-002: headless 测试在沙箱下崩溃
- **问题**: `user://` 目录无写权限时 GUT 崩溃
- **Workaround**: 提权运行或设置 `user://` 到有写权限的目录

### WK-003: 图片理解能力区分
- **发现**: 两个不同的 MCP
  - **MiniMax MCP**: 包含 `understand_image` 工具
  - **MiniMax-Image MCP**: 只有 `generate_image`
- **现状**: 图片理解在 MiniMax MCP 中

### WK-004: MCP Resources 不可用
- **问题**: `godot://scene/current` 等 URI 尚未实现
- **Workaround**: 使用 `run_project` + `get_debug_output` 轮询状态

### WK-005: AnimationPlayer/Profiler MCP 未实现
- **问题**: `animation.list_players`、`profiler.snapshot` 等工具不存在
- **Workaround**: 用文件编辑 GDScript；用 `get_debug_output` 替代

---

## MCP 工具实际状态

| 工具 | 状态 | 来源 |
|------|------|------|
| `capture_game_screenshot` | ✅ 已实现 | npm 包 |
| `input_sequence` | ✅ 已实现 | npm 包 |
| `get_runtime_state` | ✅ 已实现 | npm 包 |
| `watch_node` | ✅ 已实现 | npm 包 |
| `capture_game_screenshot_diff` | ✅ 已实现 | npm 包 |
| `animation.list_players` | ❌ 未实现 | 待扩展 |
| `profiler.snapshot` | ❌ 未实现 | 待扩展 |

---

## 游戏平衡参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 棋盘大小 | 10×10 | 20 名初始村民 |
| 每回合初始 AP | 4 | 所有角色通用 |
| 移动 AP 消耗 | 曼哈顿距离 | 相邻 = 1 AP |
| 非许可阶段 AP 消耗 | ×2 | 本阵营不行动阶段 |
| 拼点范围 | 1~9 | 掷骰子机制 |
| 调查技能范围 | 3 格（切比雪夫） | 侦探 |
| 嗜血技能范围 | 1 格（切比雪夫） | 狼人 |
| 拘捕技能范围 | 2 格（切比雪夫） | 警长 |
| 魔药技能范围 | 2 格（切比雪夫） | 女巫 |
| 暗杀技能范围 | 1 格（切比雪夫） | 刺客 |
| 守护技能范围 | 1 格（切比雪夫） | 守卫 |

---

## 团队协作要点

- **分支策略**: 所有修改在 `Zukov1` 分支，正式合流到 `main`
- **测试要求**: PR 需全部 GUT 测试通过
- **CI**: `.github/workflows/gut-test.yml` 驱动
