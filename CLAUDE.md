# CLAUDE.md

Godot 4.x GDScript 项目 — 智能体辅助开发配置

## 核心约束（绝对禁止）

| 约束 | 说明 |
|------|------|
| **SignalBus 通信** | 跨模块通信必须通过 `SignalBus`，禁止直接引用其他 Autoload |
| **RefCounted 优先** | 纯逻辑类用 RefCounted，无需场景树 |
| **不可变数据** | 创建新对象，永远不要修改现有对象 |
| **`res://` 路径** | 所有资源路径必须使用 `res://` 前缀，禁止硬编码绝对路径 |

## 关键目录

```
src/               # 游戏逻辑（ai/rules/skills/events）
shared/            # Autoload（Constants / SignalBus）
data/              # .tres 资源配置
test/unit/         # GUT 单元测试
addons/godot_mcp/  # MCP 桥接插件
```

## 测试命令

```bash
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json
```

## MCP 工具速查

| 工具 | 用途 |
|------|------|
| `godot_run_project` | 运行项目 |
| `godot_capture_game_screenshot` | 截图（Claude Code 直接分析 base64 PNG） |
| `godot_get_runtime_state` | 查询运行时节点属性 |
| `godot_watch_node` + `get_watch_results` | 监控属性变化 |
| `godot_input_sequence` | 注入键盘输入 |

> MiniMax MCP 有 `understand_image` 可深度分析截图；MiniMax-Image MCP 只有图片生成（无理解能力）。

## Skills 索引（按需加载）

| 触发关键词 | Skill |
|-----------|-------|
| 测试 / test / GUT | `.claude/skills/godot-gut-test/SKILL.md` |
| MCP / WebSocket / 截图 | `.claude/skills/godot-mcp/SKILL.md` |
| 场景设计 / 节点树 | `.claude/skills/godot-scene-design/SKILL.md` |
| shader / 着色器 | `.claude/skills/godot-shader/SKILL.md` |
| 代码生成 / 模板 | `.claude/skills/godot-code-gen/SKILL.md` |

完整索引：`.claude/skills/INDEX.md`

## 分层记忆（按需查阅）

| 文件 | 内容 |
|------|------|
| `MEMORY.md` | 热记忆：核心约束、快速查询 |
| `MEMORY_WARM.md` | 温记忆：已知问题、MCP 状态 |
| `ERROR_LOG.md` | 错题本：错误记录与解决方案 |
| `.claude/rules/` | 编码规范、安全规范、测试规范 |
| `.claude/agents/` | Planner / Reviewer / TDD Guide |

## GDScript 编码规范

- Tab 缩进（Godot 默认）
- 命名：`PascalCase` 类名 / `snake_case` 方法变量 / `SCREAMING_SNAKE_CASE` 常量
- 中文注释
- 必须标注返回类型
- 命令行模式下访问 `Constants` autoload 有时失败，改用 `DataStructures` 镜像常量
