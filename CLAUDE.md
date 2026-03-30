# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 昼与夜 - 项目指南

## 项目概述

《昼与夜》是一款基于 Godot 4.6 的回合制策略对战游戏。10x10 棋盘上，守序（昼）与邪恶（夜）两阵营各派 3 名角色替换村民入场，通过移动、技能、拼点等机制争夺胜利。阵营全灭即判负。

## 技术栈

- 引擎: Godot 4.6 (GL Compatibility)
- 物理: Jolt Physics
- 语言: GDScript
- 测试: GUT (Godot Unit Testing)
- MCP: godot-mcp (`@satelliteoflove/godot-mcp`)

### ⚠️ 前提条件

**`godot` 命令必须在 PATH 中可用。** 如果命令行找不到 `godot`，测试无法运行。
Windows 常见配置方法：在系统环境变量中添加 Godot 安装目录，或在 `~/.claude.json` 的 shell aliases 中配置。

## 目录结构

```
├── src/                    # 游戏逻辑源码
│   ├── ai/                 #   AI 决策系统
│   │   ├── ai_controller.gd
│   │   ├── ai_evaluator.gd
│   │   ├── ai_memory.gd
│   │   └── ai_strategy.gd
│   ├── events/             #   事件系统
│   │   ├── event_effects.gd
│   │   └── event_pool.gd
│   ├── rules/              #   规则引擎
│   │   ├── action_system.gd
│   │   ├── ap_system.gd
│   │   ├── battle_log.gd
│   │   ├── duel_system.gd
│   │   ├── guardian_system.gd
│   │   ├── phase_manager.gd
│   │   ├── replacement_system.gd
│   │   └── victory_checker.gd
│   └── skills/             #   技能系统
│       ├── effects/        #     6 个技能效果实现
│       ├── skill_executor.gd
│       └── skill_validator.gd
├── shared/                 # 全局共享（Autoload）
│   ├── constants.gd        #   枚举与常量（Autoload: Constants）
│   ├── data_structures.gd  #   数据结构定义（class_name: DataStructures）
│   └── signal_bus.gd       #   信号总线（Autoload: SignalBus）
├── data/                   # 数据配置
│   ├── characters/         #   角色 .tres 资源 + CharacterData 定义
│   ├── events/            #   事件 .tres 资源 + EventData 定义
│   └── loader.gd          #   DataLoader 静态加载器
├── test/                   # GUT 测试
│   ├── helpers/            #   TestHelpers 工厂类
│   ├── unit/               #   单元测试（按 src/ 镜像分组）
│   └── integration/        #   集成测试
├── scene/                  # 场景文件
├── addons/                 # 插件
│   ├── godot_mcp/          #   MCP 桥接
│   └── gut/                #   GUT 测试框架
├── docs/                   # 项目文档
│   └── development/        #   开发文档（P4 系列 + 接口文档）
└── project.godot           # 项目配置
```

## Autoload 单例

| 名称 | 路径 | 用途 |
|------|------|------|
| `Constants` | `shared/constants.gd` | 枚举（Faction/Phase/UnitState/CommandType）、常量、工具方法 |
| `SignalBus` | `shared/signal_bus.gd` | 全局信号总线，模块间唯一通信通道 |
| `MCPGameBridge` | `addons/godot_mcp/...` | MCP 游戏桥接（WebSocket 端口 6550） |

## 核心架构约束

1. **信号总线通信**: 所有跨模块通信通过 `SignalBus`，禁止直接引用其他模块
2. **统一指令模型**: AI 与玩家统一通过 `ActionSystem.submit_command()` 提交动作
3. **中立记录者原则**: 战斗日志 (`BattleLogEntry.text_public`) 不暴露暗置角色身份，AI 只能访问公开文本
4. **数据驱动**: 角色和事件通过 `.tres` Resource 配置，不硬编码游戏数据
5. **DataStructures 枚举镜像**: `DataStructures` 是 `class_name` 类（非 Autoload），无法访问 `Constants` autoload，因此内部定义了 `CMD_MOVE`/`STATE_HIDDEN` 等镜像常量

## MCP 桥接架构

MCP 服务（`@satelliteoflove/godot-mcp`）通过 WebSocket 与 Godot 通信，配置文件 `project.godot` 中 `[godot_mcp]` 段控制绑定模式：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `bind_mode` | `0` | 自动检测 |
| `port_override` | `6550` | WebSocket 监听端口 |

MCP 命令路由：`addons/godot_mcp/command_router.gd` 分发到各子命令：
- `animation_commands.gd` — 动画播放/暂停/跳转
- `node_commands.gd` — 节点 CRUD、属性读写
- `scene_commands.gd` — 场景打开/保存
- `input_commands.gd` — 注入输入（测试自动化）
- `debug_commands.gd` — 断点/堆栈/性能
- `profiler_commands.gd` — 帧时间序列/活跃进程
- `resource_commands.gd` — `.tres` 资源内省

`MCPGameBridge`（Autoload）暴露游戏状态给 MCP，供 AI 驱动工作流使用。

## MCP 工具配置速查

项目 MCP 配置：`.mcp.json`（已含 godot-mcp）。
全局 MCP 在 `~/.claude.json` 中配置。

### 可用 MCP 工具总览

项目 MCP 配置：`.mcp.json`（仅含 godot-mcp）。
其他 MCP（MiniMax、playwright、GitHub 等）在全局 `~/.claude.json` 中配置。

| MCP | 工具前缀 | 级别 | 用途 |
|-----|---------|------|------|
| **godot** | `mcp__godot__` | 项目 | 编辑器控制、运行调试、截图 |
| **playwright** | `mcp__playwright__` | 全局 | 浏览器自动化、截图、UI 测试 |
| **MiniMax** | `mcp__MiniMax__` | 全局 | 网络搜索、图片理解 (`understand_image`)、TTS |
| **MiniMax-Image** | `mcp__MiniMax-Image__` | 全局 | **仅图片生成**（无图片理解） |
| **GitHub** | `mcp__GitHub__` | 全局 | PR/Issue/仓库操作 |
| **context7** | `mcp__context7__` | 全局 | 最新官方文档查询 |
| **MarkItDown** | `mcp__MarkItDown__` | 全局 | 文档转 Markdown |

> ⚠️ MiniMax-Image MCP 只有 `generate_image`（图片生成），没有图片理解能力。
> **MiniMax MCP** 有 `understand_image` 工具可用于图片理解，两者不同！

### MiniMax 图片理解工具

```python
# MiniMax MCP server.py 中的工具
@mcp.tool()
def understand_image(prompt: str, image_source: str) -> TextContent:
    # 调用 MiniMax VLM API 进行图片分析
```

**使用方式**：
```
mcp__MiniMax__understand_image(
    image_source="截图路径或URL",
    prompt="分析提示词"
)
```

**特点**：
- 支持本地文件路径和 HTTP URL
- 支持 JPEG、PNG、WebP 格式
- 对画面有详细的结构化理解

### Claude Code 内置视觉

Claude Code 在 `Read` 工具读取图片时自动激活视觉分析（基于 Claude Sonnet 4.6）。

**两种方案对比**：
| 能力 | MiniMax `understand_image` | Claude Code 内置视觉 |
|------|--------------------------|-------------------|
| 图片理解深度 | 更详细（结构化描述） | 简洁直接 |
| 中文支持 | ✅ 优秀 | ✅ 优秀 |
| 使用场景 | 需要深入分析时 | 快速验证时 |

### Godot MCP 核心工具

```
godot_run_project                  — 运行项目（F5 等效）
godot_stop_project                 — 停止运行
godot_get_debug_output              — 获取运行时输出/错误
godot_capture_game_screenshot      — 截取游戏窗口（返回 base64 PNG）
godot_capture_game_screenshot_diff  — 截图帧对比，检测 UI 变化
godot_get_runtime_state            — 查询运行时节点属性
godot_watch_node                   — 监控节点属性变化
godot_input_sequence               — 注入键盘输入（游戏自动化）
```

## 关键数据结构 (shared/data_structures.gd)

| 类 | 用途 | 常用工厂方法 |
|----|------|-------------|
| `ActionCommand` | 行动指令 | `create_move()`, `create_skill()`, `create_rest()`, `create_skip()` |
| `CommandResult` | 指令执行结果 | `ok()`, `fail()` |
| `GameSnapshot` | 游戏状态快照 | `get_units_by_faction()`, `get_unit_by_id()`, `get_alive_units()` |
| `UnitSnapshot` | 单位状态快照 | `is_alive()`, `can_act()`, `is_visible_to()` |
| `BattleLogEntry` | 战斗日志条目 | `create()` |
| `DuelResult` | 拼点结果 | `create()` |

## 对外接口速查

```gdscript
PhaseManager.get_current_phase() -> int
PhaseManager.get_current_turn() -> int
PhaseManager.is_faction_active_phase(faction, phase) -> bool
ActionSystem.submit_command(cmd) -> CommandResult
ActionSystem.get_valid_actions(unit_id) -> Array[ActionCommand]
ActionSystem.get_snapshot() -> GameSnapshot
ActionSystem.get_ap_cost(unit_id, command_type) -> int
DuelSystem.execute_duel(initiator_id, target_id) -> DuelResult
ReplacementSystem.replace_villagers(faction, roles) -> Array[Dictionary]
GuardianSystem.resolve_damage_intent(source, target, snapshot, intent) -> Dictionary
AIController.get_ai_action(faction) -> ActionCommand
DataLoader.load_role_pool() -> Dictionary
```

## 游戏规则速查

- **棋盘**: 10×10，初始 20 名村民
- **每回合 6 阶段循环**: DAWN → NOON → DUSK → NIGHTFALL → MIDNIGHT → DAWN_BREAK
- **阵营行动阶段**: 守序 = 拂晓/正午/黄昏；邪恶 = 入夜/午夜/黎明前
- **移动**: 本质为与目标格角色交换位置，AP 消耗 = 曼哈顿距离
- **非许可阶段**: AP 消耗 ×2
- **拼点**: 双方各掷 1-9，大于赢（相等平局）
- **村民替换入场**: 第一回合拂晓/入夜阶段，角色替换村民入场
- **胜负**: 对方阵营角色全灭即胜

## 角色一览

| 角色 | 阵营 | 技能 |
|------|------|------|
| 侦探 (detective) | 守序 | 线索分析 (investigate) |
| 警长 (sheriff) | 守序 | 拘捕监禁 (arrest) |
| 守卫 (guard) | 守序 | 范围守护 (guard_protect) |
| 狼人 (werewolf) | 邪恶 | 嗜血狼人 (maul) |
| 女巫 (witch) | 邪恶 | 夺命魔药 (curse) |
| 刺客 (assassin) | 邪恶 | 一击必杀 (assassinate) |
| 村民 (villager) | 中立 | 无 |

---

## 项目记忆（分层系统）

Claude Code 使用分层记忆系统减少上下文占用：

| 文件 | 内容 | 加载频率 |
|------|------|---------|
| `MEMORY.md` | 热记忆：核心约束、快速查询、关键路径 | **每次会话自动加载** |
| `MEMORY_WARM.md` | 温记忆：已知问题、MCP 状态、平衡参数 | 按需加载 |
| `MEMORY_COLD.md` | 冷记忆：历史 ADR、已解决问题 | 很少查阅 |
| `ERROR_LOG.md` | 错题本：Agent 错误记录与解决方案 | 自动追加 |

**错题本进化规则**：
- 同一错误出现 3 次 → 自动升级到 MEMORY_WARM.md
- 某类型错误 > 5 个 → 创建专项规则
- 已解决错误保留 30 天 → 移至 MEMORY_COLD.md

---

# 开发流程

## 开发规范

1. **代码风格**: GDScript 标准缩进（Tab），中文注释
2. **文件命名**: snake_case，与 class 名对应
3. **新增效果**: 先在 `src/skills/effects/` 创建效果脚本，再在角色 `.tres` 中注册 skill_id
4. **新增事件**: 在 `data/events/` 创建 `.tres` 资源，`event_effects.gd` 中实现效果逻辑
5. **修改共享数据**: `shared/` 下文件标记为 "Day 0 冻结产物"，修改需谨慎评估影响

## 开发迭代流程

```
需求分析 → 编写/修改代码 → 编写测试 → 运行测试 → 修复失败 → 更新文档
```

1. 分析需求，确认涉及模块和接口
2. 在 `src/` 对应目录实现逻辑
3. 在 `test/` 对应目录编写 GUT 测试
4. 命令行运行测试验证
5. 修复测试失败用例
6. 更新相关文档（使用 update-docs skill）

---

# Skills 使用指南

项目配置了以下 Agent Skills，按场景触发：

## godot-gut-test

**触发**: "写测试"、"添加测试"、"单元测试"、"GUT测试"、"test"

编写 GUT 测试的完整指南，包含：
- 目录约定：单元测试放 `test/unit/<模块>/`，集成测试放 `test/integration/`
- 5 种测试模式：纯静态方法、实例方法、Inner Test Classes 分组、参数化测试、场景树测试
- 断言速查表
- TestHelpers 工厂类用法（`make_unit()`, `make_order_unit()`, `make_evil_unit()`, `make_snapshot()`）

路径: `.claude/skills/godot-gut-test/SKILL.md`

## godot-mcp

**触发**: "MCP"、"godot-mcp"、"WebSocket"

MCP 服务器工作原理：WebSocket 端口 6550，命令路由 `command_router.gd`，子命令模块速查。

路径: `.claude/skills/godot-mcp/SKILL.md`

## godot-scene-design

**触发**: "场景设计"、"布局"、"节点树"

Godot 场景编辑最佳实践：节点结构、`.tscn` 文件格式、场景复用、布局模式。

路径: `.claude/skills/godot-scene-design/SKILL.md`

## godot-shader

**触发**: "shader"、"着色器"、"GDSHADER"

GDScript 着色器编写：Godot 3D/2D 着色器语法、材质配置、ShaderMaterial 使用。

路径: `.claude/skills/godot-shader/SKILL.md`

## godot-code-gen

**触发**: "代码生成"、"脚手架"、"模板"

基于 Godot 命名约定的 GDScript 代码生成：class_name 声明、信号定义、枚举常量。

路径: `.claude/skills/godot-code-gen/SKILL.md`

---

### ⚠️ 已废弃 Skills

| Skill | 状态 | 替代方案 |
|-------|------|---------|
| `godot-interactive` | ⚠️ DEPRECATED | `godot-mcp` skill |
| `godot-live-edit` | ⚠️ DEPRECATED | `godot-mcp` skill |

> 这两个技能需要 `godot-ai-bridge` 插件（本项目未安装）。

---

# 测试流程

## 测试框架

使用 GUT (Godot Unit Testing) 框架，配置文件 `.gutconfig.json`：
- 测试目录: `res://test/`
- 递归搜索子目录
- 文件前缀: `test_`，后缀: `.gd`

## 测试目录结构

```
test/
├── helpers/
│   └── test_helpers.gd      # TestHelpers 工厂类（全局 class_name）
├── unit/                     # 单元测试（与 src/ 镜像）
│   ├── ai/                   #   test_ai_evaluator.gd, test_ai_memory.gd, test_ai_strategy.gd
│   ├── events/               #   test_event_effects.gd
│   ├── rules/                #   test_ap_system.gd, test_battle_log.gd, test_phase_manager.gd, test_victory_checker.gd
│   ├── shared/               #   test_data_structures.gd, test_duel_system.gd
│   └── skills/               #   test_skill_executor.gd, test_skill_validator.gd
└── integration/              # 集成测试
    ├── test_ai_full_turn.gd  #   AI 完整回合
    └── test_skill_pipeline.gd #  技能管线
```

## 运行测试

> **Editor vs Headless**: `godot` 打开编辑器；`godot --headless` 用于 CI/自动化（无窗口渲染，`.gutconfig.json` 中 `should_exit: true` 确保测试后自动退出）

> **Windows 用户**: PowerShell/CMD 下 `$PWD` 替换为 `%cd%`，或使用绝对路径。

```bash
# 运行全部测试（项目当前验证通过的标准命令）
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json

# 运行指定文件
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gtest=res://test/unit/skills/test_skill_validator.gd

# 运行指定目录
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gdir=res://test/unit/

# 运行名称匹配的测试
godot --headless --path "$PWD" \
  -s res://addons/gut/gut_cmdln.gd \
  -gconfig=res://.gutconfig.json \
  -gunit_test_name=validate
```

## 测试执行约定

1. **始终通过 `.gutconfig.json`**：不用未带配置的旧 `godot -d -s` 形式
2. **团队统一约定 `godot` 在 `PATH` 中可用**
3. **允许 1 条既有 warning**：`test/helpers/test_helpers.gd` 不继承 `GutTest`
4. **新增测试脚本要保留 `.uid`**：新增时把 Godot 生成的 `.uid` 一并纳入版本控制
5. **沙箱环境下 headless 崩溃**：优先检查 `user://` 写权限

## 编写测试规范

1. **文件命名**: `test_<被测模块>.gd`，镜像 `src/` 目录结构放置
2. **方法命名**: `test_<被测行为>_<预期结果>`
3. **每个测试方法至少一个断言**
4. **优先测试纯逻辑**: RefCounted/静态方法类无需场景树
5. **使用 TestHelpers**: 构造测试数据用 `TestHelpers.make_unit()` / `make_snapshot()` 等
6. **断言消息使用中文**
7. **内存管理**: Node 类型用 `add_child_autofree()`，RefCounted 自动回收
8. **Autoload 注意**: 命令行模式如遇 Constants 访问问题，改用 `DataStructures` 镜像常量

## 测试模式速查

| 模式 | 场景 | 示例 |
|------|------|------|
| 纯静态方法 | SkillValidator, AIEvaluator 等无状态类 | 直接调用静态方法断言 |
| 实例方法 | PhaseManager 等有状态类 | `before_each()` 中 new，每个测试独立实例 |
| Inner Classes | 同一模块按功能分组 | `class TestRangeCheck: extends GutTest` |
| 参数化 | 批量验证同类数据 | `use_parameters([...])` |
| 场景树 | 需要 Node 生命周期的组件 | `add_child_autofree(node)` |

## 验收检查点

详细验收标准（Day 6、Day 10、Day 12）请参考 `MEMORY.md`。

