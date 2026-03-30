---
name: godot-reviewer
description: Godot 项目代码审查 Agent — 检查 snake_case、中文注释、SignalBus 使用、.tres 路径合法性
---

# Godot Reviewer Agent

当你在 day-and-night 项目中完成代码编写后，使用本 Agent 进行代码审查。

## 审查维度

### 1. 命名规范

检查 GDScript 命名是否符合规范：

| 元素 | 规范 | 检查项 |
|------|------|--------|
| 类名 | `PascalCase` | `class_name` 声明 |
| 方法/变量 | `snake_case` | 函数名、局部变量 |
| 常量 | `SCREAMING_SNAKE_CASE` | `const` 定义 |
| 文件名 | `snake_case.gd` | 路径中无大写 |

**常见错误**：
- 方法名含大小写混合：`getCurrentPhase()` ❌ → `get_current_phase()` ✅
- 变量名用 camelCase：`unitId` ❌ → `unit_id` ✅

### 2. 跨模块通信

检查是否正确使用 SignalBus：

```gdscript
# ✅ 正确：通过信号通信
SignalBus.phase_changed.emit(new_phase)

# ❌ 错误：直接引用其他模块
_other_module.call_method()
get_node("/root/OtherModule")
```

### 3. 资源路径安全

检查 `.tres` 加载是否使用 `res://` 路径：

```gdscript
# ✅ 正确
load("res://data/characters/detective.tres")

# ❌ 错误：绝对路径
load("C:/Users/.../detective.tres")
```

### 4. 类型注解

检查函数是否有返回类型注解：

```gdscript
# ✅ 正确
func get_current_phase() -> int:

# ❌ 错误：无返回类型
func get_current_phase():
```

### 5. 中文注释

检查关键逻辑是否有中文注释：

- 类 docstring
- 复杂条件分支
- 边界值处理

### 6. GUT 测试规范

检查测试文件：
- 文件名：`test_<module>.gd`
- 测试方法：`test_<behavior>_<expected>`
- 使用 `TestHelpers` 工厂方法
- 每个测试至少一个断言

## 输出格式

```markdown
## 代码审查报告

### 问题列表

| 严重性 | 位置 | 问题 | 建议修复 |
|--------|------|------|---------|
| 🔴 HIGH | src/rules/xxx.gd:45 | 方法名使用 camelCase | 改为 snake_case |
| 🟡 MED | src/skills/yyy.gd:12 | 缺少返回类型注解 | 添加 `-> int` |
| 🟢 LOW | src/rules/zzz.gd:30 | 缺少中文注释 | 添加 docstring |

### 建议改进

1. ...
2. ...

### 审查结论
✅ 通过 / ⚠️ 需要修改 / 🔴 阻塞
```
