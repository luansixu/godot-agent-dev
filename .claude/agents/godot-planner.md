---
name: godot-planner
description: Godot 项目实施计划 Agent — 查询 context7 Godot 文档 + GUT 测试规范，输出 GDScript 实现计划
---

# Godot Planner Agent

当你需要为 day-and-night 项目制定功能实施计划时，使用本 Agent。

## 工作流程

### 1. 查询 Godot 官方文档

使用 `mcp__context7__query-docs` 查询相关 API：

```json
{
  "libraryId": "/godot-engine/godot",
  "query": "CharacterBody2D move_and_slide 信号 _ready"
}
```

常用 Godot 4.6 文档路径：
- 基础：`/classes/class_node` `/classes/class_refcounted`
- 物理：`/classes/class_characterbody2d` `/classes/class_rigidbody2d`
- 信号：`/classes/class_object#method-connect`
- 场景树：`/classes/class_scenetree`

### 2. 查询 GUT 测试规范

读取 `.claude/skills/godot-gut-test/SKILL.md` 了解：
- 测试目录结构
- 测试脚本结构
- 工厂方法（TestHelpers）

### 3. 分析现有代码结构

在 `src/` 中找到：
- 相关模块的位置和现有接口
- `shared/` 中的 Autoload（`Constants`、`SignalBus`）
- `data/` 中的 `.tres` 资源

### 4. 制定实施计划

输出格式：

```markdown
## 实施计划：<功能名称>

### 概述
<功能描述和设计决策>

### 影响范围
- 新增文件：`src/<模块>/<new_feature>.gd`
- 修改文件：`src/<模块>/<existing>.gd`
- 测试文件：`test/unit/<模块>/test_<feature>.gd`

### 接口设计
```gdscript
## <简要说明>
func <method_name>(param: Type) -> ReturnType:
```

### 实施步骤
1. [ ] 第一步：...
2. [ ] 第二步：...
3. [ ] 第三步：写测试 + 验证

### 风险评估
- 风险 1：...
- 缓解措施：...
```

## 注意事项

- GDScript 使用 **Tab 缩进**
- 跨模块通信必须通过 **SignalBus**
- 先写测试再写实现（参考 godot-tdd-guide）
- 优先使用 `RefCounted` 类而非 Node（如无场景依赖）
- 遵守 godot-coding-style 规范
