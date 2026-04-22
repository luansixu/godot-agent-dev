---
name: skills-index
description: Skills 导航索引 — 激活规则、使用场景速查
---

# Skills 索引

按场景关键词自动触发，无需手动指定。

## 核心 Skills

| Skill | 触发关键词 | 用途 |
|-------|-----------|------|
| **godot-mcp** | "MCP"、"godot-mcp"、"WebSocket"、"截图" | MCP 工具使用、截图闭环、节点运行时调试 |
| **godot-gut-test** | "测试"、"写 test"、"GUT"、"单元测试" | GUT 测试编写模式、断言规范、TestHelpers |
| **task-breakdown** | "P1/P2/P3/P4"、"逐项实现"、"任务拆分"、"排期" | 大型任务拆解为 checklist，断点续做 |

## 增强 Skills

| Skill | 触发关键词 | 用途 |
|-------|-----------|------|
| **godot-scene-design** | "场景设计"、"节点树"、"tscn" | 场景结构、节点布局、.tscn 格式 |
| **godot-shader** | "shader"、"着色器"、"gdshader" | GDSHADER 编写、材质配置 |
| **godot-code-gen** | "代码生成"、"脚手架"、"模板" | GDScript 代码生成、命名约定 |

## ⚠️ 已废弃 Skills

| Skill | 状态 | 替代方案 |
|-------|------|---------|
| `godot-interactive` | DEPRECATED | `godot-mcp` |
| `godot-live-edit` | DEPRECATED | `godot-mcp` |

> 废弃原因：需要 `godot-ai-bridge` 插件（本项目未安装）。

## Skill 激活规则

Claude Code 根据用户消息中的触发关键词自动激活对应 Skill。多个关键词同时出现时，按优先级匹配：
1. `测试`/`test`/`GUT` → **godot-gut-test**
2. `MCP`/`godot`/`WebSocket` → **godot-mcp**
3. `场景设计`/`节点树` → **godot-scene-design**
4. `shader`/`着色器` → **godot-shader**
5. `代码生成`/`模板` → **godot-code-gen**
6. `P1/P2`/`逐项实现`/`排期` → **task-breakdown**

> 按需加载：未被触发的 Skill 内容不会被加载到上下文。

## 跨会话记忆策略

| 工具 | 生命周期 | 适用场景 |
|------|---------|---------|
| **TodoWrite** | 会话内 | 当前会话的多步骤任务跟踪 |
| **checklist.md** | 永久（磁盘） | 跨会话的大型任务断点续做 |
| **MEMORY.md** | 永久（磁盘） | 核心约束和快速查询 |
| **ERROR_LOG.md** | 永久（磁盘） | 错题本，自我进化 |

> **关键原则**：checklist.md 是跨会话的外部记忆，TodoWrite 是会话内临时跟踪。每次长任务开始时，先读 checklist.md 找 `[ ]` 未勾选项。

## GDScript CLI 工具集（tools/）

`tools/` 目录存放通过 `godot --headless -s` 执行的程序化工具脚本：

| 工具脚本 | 用途 | Godot 4.6 API 关键发现 |
|---------|------|----------------------|
| `configure_tileset.gd` | 程序化生成棋盘 TileSet（2 TerrainSet + 2 Source） | 使用 `add_terrain_set()` / `set_terrain_color()` |
| `probe_tileset_api.gd` | TileSet API 完整性探测（返回值验证） | `add_terrain()` 返回 void，`TileData.terrain_set` 用 `set()` |
| `test_probe.gd` | ARGV 参数传递验证 | `OS.get_cmdline_user_args()` |

**调用方式**：
```bash
godot --headless --path "$PWD" -s res://tools/<script>.gd -- --output <path>
```

> **Godot 4.6 TileSet API 注意**：TileSet 没有 `terrain_sets_add()`（不存在），正确方法是 `add_terrain_set()`。TerrainMode 使用整数 0-3，不是枚举名。

## 按需内容

| 内容 | 所在文件 |
|------|---------|
| 详细 MCP 工具说明 | `.claude/skills/godot-mcp/SKILL.md` |
| 详细 GUT 测试模式 | `.claude/skills/godot-gut-test/SKILL.md` |
| 分层记忆系统 | `MEMORY.md` / `MEMORY_WARM.md` / `MEMORY_COLD.md` |
| 错题本（错误日志） | `ERROR_LOG.md` |
| 编码风格规范 | `.claude/rules/godot-coding-style.md` |
| 安全规范 | `.claude/rules/godot-security.md` |
| 测试规范 | `.claude/rules/godot-testing.md` |
| Agent 智能体 | `.claude/agents/godot-planner.md` 等 |
