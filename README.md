# Godot智能体开发

> 基于 MiniMax Token Plan 的 Claude Code 游戏开发智能体配置

[![Claude Code](https://img.shields.io/badge/Claude%20Code-3.5%20Sonnet-7B9E87?style=flat&logo=anthropic&logoColor=white)](https://claude.ai/code)
[![Godot](https://img.shields.io/badge/Godot-4.6-478CBF?style=flat&logo=godotengine&logoColor=white)](https://godotengine.org)
[![MiniMax](https://img.shields.io/badge/MiniMax-API-red?style=flat&logo=minimax&logoColor=white)](https://www.minimax.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](https://opensource.org/licenses/MIT)

---

## 概述

这是一套为 **Godot 4.6** 游戏项目配置的 Claude Code Agent 智能体方案，围绕三大能力维度构建：

| 维度 | 能力 | 实现方式 |
|------|------|---------|
| **工具** | 操控编辑器、运行项目、注入输入、截图 | MCP (god-mcp) |
| **观察** | 截图画面分析、帧对比、节点属性监控 | capture_game_screenshot + watch_node |
| **大脑** | GDScript 规范、代码审查、TDD 工作流 | Agent + Rules |

适用场景：回合制策略游戏、卡牌游戏、RPG 等需要精细规则引擎的 Godot 项目。

---

## 核心功能

### MCP 工具（god-mcp）

```
launch_editor          — 启动 Godot 编辑器
run_project           — 运行项目（F5 等效）
stop_project          — 停止运行
get_debug_output      — 获取运行时输出和错误
capture_game_screenshot    — 截取游戏窗口（返回 base64 PNG）
capture_game_screenshot_diff — 截图帧对比，检测 UI 变化
get_runtime_state      — 查询运行时节点属性（PhaseManager.current_phase 等）
watch_node            — 监控节点属性变化
get_watch_results     — 获取监控结果
input_sequence        — 注入键盘/鼠标输入（游戏自动化）
```

### 截图 → 视觉分析闭环

`capture_game_screenshot` 返回 base64 PNG，Claude Code 原生支持直接分析，无需额外视觉 API：

```
1. mcp__godot__capture_game_screenshot → 返回 base64 PNG
2. Claude Code 内置视觉分析直接解读画面内容
3. 根据分析结果修改代码
4. 验证结果 → 循环
```

### Agent 智能体

| Agent | 用途 |
|-------|------|
| `godot-planner` | 实施计划 — 查询 Godot 文档 + GUT 规范，输出 GDScript 实现计划 |
| `godot-reviewer` | 代码审查 — 检查 snake_case、SignalBus 使用、.tres 路径合法性 |
| `godot-tdd-guide` | TDD 工作流 — 先写测试再实现，优先 RefCounted 纯逻辑测试 |

### 规则体系

| 规则 | 内容 |
|------|------|
| `godot-coding-style` | Tab 缩进、snake_case、SignalBus 通信、中文注释 |
| `godot-security` | `res://` 路径校验、.tres 资源安全、战斗日志隐私 |
| `godot-testing` | GUT 测试规范、覆盖率目标 80%、headless 运行 |

---

## 目录结构

```
.
├── README.md              — 本文件
├── CLAUDE.md              — Claude Code 项目指南
├── MEMORY.md              — 项目记忆（ADR / 已知问题 / 平衡参数）
├── .mcp.json              — MCP 服务器配置模板
├── .claude/
│   ├── agents/            # Agent 智能体
│   │   ├── godot-planner.md
│   │   ├── godot-reviewer.md
│   │   └── godot-tdd-guide.md
│   ├── rules/             # 规则文件
│   │   ├── godot-coding-style.md
│   │   ├── godot-security.md
│   │   └── godot-testing.md
│   └── skills/            # Skills 使用指南
│       ├── godot-mcp/SKILL.md
│       ├── godot-gut-test/SKILL.md
│       ├── godot-interactive/SKILL.md  ⚠️ DEPRECATED
│       └── godot-live-edit/SKILL.md   ⚠️ DEPRECATED
└── godot-mcp/             # MCP 服务器源码
    ├── src/index.ts       # TypeScript 源码（含扩展工具）
    ├── build/index.js     # 构建产物
    └── package.json
```

---

## 快速配置

### 前提条件

- Claude Code（支持 MCP）
- Godot 4.6
- Node.js + npm
- Python 3 + win32gui + PIL（Windows 截图用）
- MiniMax API Token（[官网申请](https://www.minimaxi.com/)）

### Step 1: 安装依赖

```bash
# 克隆 god-mcp 并构建
cd godot-mcp
npm install
npm run build

# Python 截图依赖（Windows）
pip install pywin32 Pillow
```

### Step 2: 配置 .mcp.json

复制 `.mcp.json` 到项目根目录，填入真实 Token：

```json
{
    "mcpServers": {
        "godot-mcp": {
            "command": "node",
            "args": ["YOUR_PATH/godot-mcp/build/index.js"]
        },
        "MiniMax": {
            "command": "cmd",
            "args": ["/c", "python", "-m", "minimax_mcp.server"],
            "env": {
                "MINIMAX_API_KEY": "YOUR_REAL_TOKEN",
                "MINIMAX_API_HOST": "https://api.minimaxi.com"
            }
        },
        "MiniMax-Image": {
            "command": "cmd",
            "args": ["/c", "python", "YOUR_PATH/minimax_image_mcp/server.py"],
            "env": {
                "MINIMAX_API_KEY": "YOUR_REAL_TOKEN",
                "MINIMAX_API_HOST": "https://api.minimaxi.com"
            }
        }
    }
}
```

### Step 3: 复制 Agent 配置

将 `.claude/` 目录复制到目标项目根目录，Claude Code 启动时自动加载。

### Step 4: 重启 Claude Code

新增 MCP 工具后需重启 Claude Code 使配置生效。

---

## 开发流程

```
1. 规划 → godot-planner Agent 制定实施计划
2. 实现 → 写代码（遵守 godot-coding-style 规范）
3. 测试 → godot-tdd-guide Agent 引导 TDD（先写测试再实现）
4. 审查 → godot-reviewer Agent 检查代码质量
5. 验证 → 运行 GUT 测试 + 截图验证画面
```

---

## 关于 MiniMax Token Plan

本配置基于 **MiniMax API Token Plan**。MiniMax 提供文本生成（TTS/Chat）、图片生成（Image generation），但**不提供图片理解（Vision）API**。

截图分析由 Claude Code 内置视觉能力处理：`capture_game_screenshot` 返回 base64 PNG，MCP 响应以 `image/png` content 类型返回，Claude Code 直接分析。

如需使用 Claude Code 以外的 AI 视觉分析，可替换为有 Vision 能力的 API（如 OpenAI GPT-4V）。

---

## 注意事项

1. **截图工具依赖 Windows**：`capture_game_screenshot` 使用 `win32gui`，仅支持 Windows
2. **MCP 工具需重启加载**：新增/修改 MCP 工具后重启 Claude Code
3. **god-mcp 源码**：`godot-mcp/src/index.ts` 包含本配置特有的扩展工具（screenshot_diff、watch_node 等），如使用 npm 官方包 `@satelliteoflove/godot-mcp`，这些扩展工具可能不可用
4. **Token 安全**：不要将包含真实 Token 的 `.mcp.json` 推送到公开仓库，使用环境变量或 `.gitignore` 保护

---

## 许可证

MIT License
