---
name: task-breakdown-workflow
description: Use when implementing a multi-day development schedule — breaks a high-level schedule document into fine-grained checkbox tasks, then executes them one-by-one across sessions. Triggers when user says "implement P1/P2/P3/P4 work", "start task breakdown", or points to a schedule/排期表 document.
---

# Task Breakdown Workflow

将排期表拆解为逐项可实现的 checkbox 清单，然后逐项实现、逐项标记。清单文件充当跨会话的外部记忆，避免上下文窗口衰减导致幻觉或遗漏。

## Godot 专有约定

### Checkbox 粒度映射（Godot）

| 通用粒度 | Godot 具体操作 |
|---------|--------------|
| 文件级操作 | 创建 `.gd` 脚本 / 注册 Autoload / 创建 `.tscn` 场景 |
| 函数级实现 | 实现 `func _ready() -> void:` / SignalBus 连接 |
| 验证动作 | `godot --headless` 跑测试 / Godot 编辑器内验证 |

### Godot Checklist 必检项

每次生成 checklist 时，对照以下 Godot 特有检查：

```
□ shared/ 冻结产物是否被误改（constants.gd / signal_bus.gd / data_structures.gd）
□ SignalBus 信号签名是否匹配（不能用 get_node() 直调其他模块）
□ RefCounted 优先（纯逻辑类是否用了 Node）
□ res:// 路径是否正确（禁止硬编码绝对路径）
□ GUT 测试是否通过（src/ 模块新增代码必须有对应测试）
```

### 跨文件 Checklist 模板

大型 Godot 模块开发时，checklist.md 应包含以下类型文件：

```
### Phase 1: 数据层
- [ ] 创建 `data/characters/detective.tres` 角色资源
- [ ] 在 `data/loader.gd` 注册加载逻辑

### Phase 2: 逻辑层
- [ ] 实现 `src/skills/effects/skill_investigate.gd`
- [ ] 在 `src/skills/skill_executor.gd` 注册技能处理器

### Phase 3: 集成层
- [ ] 在 `shared/constants.gd` 添加技能枚举（若需扩展）
- [ ] 在 `SignalBus` 添加信号（若需新事件）
- [ ] 注册 `project.godot` Autoload（若新增模块）

### Phase 4: 测试层
- [ ] 编写 `test/unit/skills/test_investigate.gd`
- [ ] 运行 `godot --headless` 验证通过
- [ ] 更新 `MEMORY.md` 记录平衡参数（如有）
```

## When to Use

- 用户指向一份排期表 / 分工表 / README，要求拆解为可实现的 todo list
- 用户要求"按清单逐项实现"P1/P2/P3/P4 的开发工作
- 跨多个会话推进大型开发任务，需要断点续做

## 核心原则

**清单文件就是上下文**。每次会话开始时读取清单，找到第一个未勾选项，实现后标记 `[x]`，不需要在对话历史中记住之前做了什么。

## Phase 1: 拆解

### 1.1 读取排期表

- 读取用户指定的排期表文件（通常是 `README.md`）
- 重点关注以下章节：
  - 角色分工定义（谁负责什么）
  - 目录独占映射（哪些目录归谁）
  - Day 0 冻结产物（不能改的文件）
  - Mock 隔离方案（独立开发需要什么 mock）
  - 完整任务清单（逐日明细）
  - 检查点集成方案（合并顺序和验证标准）
  - Demo 功能范围（P0 必达 / P1 力争）
  - 音频/视觉等具体需求表

### 1.2 读取仓库现状

- 检查目录结构，确认哪些已存在、哪些缺失
- 读取冻结产物（`shared/` 下的 constants / data_structures / signal_bus）确认接口签名
- 读取 `project.godot` 确认当前 Autoload 注册状态

### 1.3 生成清单文件

按以下规则生成 `{角色}-task-breakdown.md`：

**结构**：按依赖顺序组织 Phase，每个 Phase 含子步骤

**粒度标准**（每一条 checkbox）：
- 一个文件级操作（创建文件 / 注册 Autoload / 添加子节点）
- 或一个函数级实现（实现 `get_current_state() -> int`）
- 或一个验证动作（运行项目确认无报错）

**每条 checkbox 包含**：
- 编号（如 `1.3.2`）
- 具体动作描述
- 需要的代码片段或伪代码（直接贴在 bullet 下方的代码块中）
- 关键变量名 / 函数签名 / 文件路径

**验证项**：每完成一组相关任务后必须有一个验证 checkpoint（运行项目 / 检查日志 / 跑通流程）

### 1.4 完整性检查

清单生成后，逐项对照排期表做以下检查：

| 检查项 | 方法 |
|--------|------|
| 任务清单全覆盖 | 排期表的每个任务编号是否都有对应 checkbox |
| 接口契约全覆盖 | 排期表 5.4 接口签名是否都出现在清单中 |
| 节点树全覆盖 | 排期表 1.2 节点树的每个容器节点是否都创建 |
| 信号流全覆盖 | 排期表四、信号流举例中该角色的职责是否都有 checkbox |
| Mock 方案覆盖 | 排期表六、Mock 隔离中该角色的 Mock 是否完整 |
| 目录映射覆盖 | 排期表三、目录独占映射中该角色的目录和文件是否都创建 |
| 功能范围覆盖 | 排期表九、P0/P1 中涉及该角色的行是否都有对应实现项 |
| 音频/视觉需求覆盖 | 排期表十四中该角色负责的需求是否都有对应实现项 |

**如果发现遗漏**：补充 checkbox 和说明，注明来源章节

**输出文件尾部必须包含**：
1. 文件产出汇总表（所有将创建的文件路径 + 类型 + Phase）
2. 对其他角色的接口依赖清单（需要调用谁的接口）

---

## Phase 2: 执行

### 2.1 断点续做

每次会话开始时：

1. 读取 `{角色}-task-breakdown.md`
2. 找到第一个 `- [ ]`（未勾选项）
3. 从该处继续实现

### 2.2 单项实现流程

对每个 checkbox：

```
读取 checkbox 描述 → 理解上下文 → 实现代码 → 本地验证 → 标记 [x]
```

**关键约束**：
- **一次只做一项**。不要批量实现多个 checkbox 然后一次性标记
- **每项做完立即标记**。标记动作就是"保存进度点"
- **遇到验证项时必须实际运行验证**。不能跳过
- **遇到阻塞项时**：在 checkbox 后加 `<!-- BLOCKED: 原因 -->` 注释，继续下一项

### 2.3 验证项处理

清单中的验证项（通常编号含 `.X.1` 如 `1.7.1`、`3.4.1`）：

- **必须实际运行** Godot 项目或测试命令
- 如果验证失败，不标记 `[x]`，在旁边加 `<!-- FAIL: 原因 -->`
- 修复后重新验证，通过后再标记

### 2.4 Mock 替换

当排期表指定了集成检查点时：
- 在该 Phase 将所有 `mock_*` 调用替换为真实模块
- 替换后运行全流程验证

---

## Phase 3: 标记与同步

### 3.1 标记格式

```markdown
- [x] **1.3.2** 实现 go_to_faction_select()    ← 已完成
- [ ] **1.3.3** 实现 go_to_role_select()       ← 下一个
- [ ] **1.3.4** 实现 go_to_battle()            <!-- BLOCKED: 等 PhaseManager 就绪 -->
```

### 3.2 进度报告

用户问进度时，统计：
```
总 checkbox 数 / 已完成数 / 阻塞数 = 完成率
当前所在 Phase
下一项待做
```

## 常见错误

| 错误 | 正确做法 |
|------|---------|
| 在对话历史中回忆"上次做了什么" | 读清单文件的 `[x]`/`[ ]` 标记 |
| 一次实现整个 Phase 再标记 | 逐项实现逐项标记 |
| 跳过验证项 | 验证项和实现项同等重要 |
| 凭记忆写代码而不读现有文件 | 每次实现前先 Read 目标文件和相关依赖 |
| 忘记对照排期表检查完整性 | 用 1.4 的检查清单逐项验证 |

## 与分层记忆系统集成

Checklist.md 是**临时外部记忆**，与项目持久化记忆系统协同：

| 场景 | 操作 |
|------|------|
| 任务发现通用规律 | 追加到 `MEMORY.md`（下次直接用） |
| 实现中遇到已知错误 | 追加到 `ERROR_LOG.md`（自我进化） |
| 平衡参数调整 | 更新 `MEMORY_WARM.md` 的平衡参数章节 |
| 任务彻底完成后 | Checklist.md 可删除，产出物永久化到代码库 |

### Checklist → MEMORY.md 转化示例

```
# 在 checklist 中发现：
# 棋盘格子坐标 = 左上角(100,100)，每格64像素

# 转化为 MEMORY.md 条目：
- 棋盘格子像素坐标：每格 64px，起始 (100,100)
  来源：task-breakdown.md Phase 2 验证项
```

### 错误日志联动

实现过程中遇到的任何错误：

```
1. 记录到 `ERROR_LOG.md`（错误编号 + 原因 + 解决方案）
2. 在 checklist 对应项旁标注 `<!-- FAIL: ERR-XXX -->`
3. 修复后删除 FAIL 标注，标记 `[x]`
```

这确保跨会话的错误知识不丢失，形成自我进化的智能体。
