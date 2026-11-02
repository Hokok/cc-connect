# CC-Connect 桌面壳方案（面向非编码用户）

目标：让不懂编码的用户通过桌面应用完成「安装 → 配置 agent 与 IM 平台 → 日常使用 → 看日志排错」的完整闭环，不需要手写 config.toml。

术语见根目录 `CONTEXT.md`；不可逆决策见 `docs/adr/`。

## 已定决策一览

| 决策点 | 结论 |
|---|---|
| 代码基线 | `feat/desktop-shell-comate`（基于 feat/comate-agent），WIP 从 feat/desktop-shell 合并过来 |
| 产品形态 | Tauri 壳内嵌 Web UI（ADR-0001） |
| 配置写回 | 结构化 API（表单）+ TOML 文件编辑（壳编辑器）两轨，mtime 门控（ADR-0002） |
| 日志 | Management API 日志流 + Web UI 日志页；壳提供「打开日志文件夹」兜底 |
| 平台范围 | macOS + Windows |
| 首启向导 | v1 必须；CLI 未装 → 检测 + 官方安装指引，不代装 |
| 更新 | 引擎 SelfUpdate（已有），壳手动更新（ADR-0003） |
| 关窗行为 | 托盘常驻，关窗隐藏，托盘菜单显式退出 |

## 架构总览

```
┌────────────────────────────────────────────────────┐
│ Desktop Shell (Tauri, macOS dmg / Windows msi)     │
│  • sidecar 启动/停止/重启引擎（PATH 重算）           │
│  • 托盘常驻：打开主界面 / 配置编辑 / 重启引擎 /      │
│    打开日志文件夹 / 退出                             │
│  • TOML 配置编辑器窗口（文件轨，写前校验）           │
└──────────────────┬─────────────────────────────────┘
                   │ WebView: 127.0.0.1:{port}/login?token=…
┌──────────────────▼─────────────────────────────────┐
│ Engine (cc-connect sidecar)                         │
│  ┌──────────────────┐   ┌────────────────────────┐ │
│  │ Management API   │←──│ Web UI（内嵌 React）   │ │
│  │ /api/v1/...      │   │ 首启向导 / 日志页 /    │ │
│  └────────┬─────────┘   │ 配置表单 / 会话管理    │ │
│           │ 读改写（mtime 门控）                  │
│  config.toml ←── 唯一配置真相源（两轨都写它）       │
│  engine.log ─→ GET /api/v1/logs/stream (SSE)        │
└─────────────────────────────────────────────────────┘
```

要点：

- 引擎是唯一有状态方；壳是无状态的原生包装（ADR-0001）
- 127.0.0.1 绑定 + token 鉴权不变，日志流与新增端点同受鉴权保护
- agent CLI 的安装检测、凭证表单、日志查看全部走 Management API，壳不实现业务逻辑

## 模块改动清单

### 引擎（Go，`core/management.go` 等）

1. **结构化配置端点补全**：表单需要的、目前只存在于 TOML 的字段（agent 参数、平台选项等）补齐到可写端点；保存流程 = 读 config.toml → 改字段 → 序列化回写 → 自动 `/reload`，失败回滚并报错
2. **mtime 冲突门控**：写回端点接收表单加载时的 `loaded_mtime`，与当前文件 mtime 不符则 409，提示「配置已在别处修改，请刷新」（ADR-0002）
3. **日志流端点** `GET /api/v1/logs/stream`：SSE 推送增量日志，支持 `level` 过滤与起始 tail；输出过 `core.RedactToken()`；保留现有 `cc-connect logs`（daemon.go）命令行为不变
4. **CLI 检测端点** `GET /api/v1/doctor/agents`：按 agent 注册表探测本机 CLI binary（PATH 查找 + `--version`），返回 installed/version/安装指引 URL
5. config 只读端点 `GET /api/v1/config` 响应附带当前 mtime，供门控使用

### Web UI（React，`web/src`）

1. **首启向导** `/onboarding`（无项目配置时自动进入）：
   检测 CLI（未装 → 指引链接 + 复制安装命令 + 「重新检测」）→ 选平台 → 填凭证（飞书/微信复用现有 `setup/*` 扫码 API，其余用平台表单）→ 测试连接 → 保存并 reload → 完成
2. **日志页** `/system/logs`：SSE 实时滚动、级别过滤、错误高亮、暂停/下载
3. **配置表单补全**：覆盖非编码用户高频字段；保留「高级」折叠区提示可走壳的 TOML 编辑器
4. i18n：全部新增文案走 `core/i18n.go` 机制，五语言齐全（AGENTS.md 规则）

### 桌面壳（Tauri，`desktop/`）

1. **托盘常驻**：关窗隐藏到托盘；托盘菜单「打开主界面 / 配置编辑 / 重启引擎 / 打开日志文件夹 / 退出（杀引擎）」
2. 保留已有：sidecar 生命周期、PATH 重算、TOML 编辑器（校验+报行号）、首启 agent CLI 选择器
3. **Windows 打包**：bundle targets 改 `["app","msi"]`，PowerShell 下 PATH 重算，msi 产物
4. 引擎更新入口：调用引擎 SelfUpdate 后重启引擎（ADR-0003）

## 里程碑

- **M0 基线迁移**：merge `feat/desktop-shell`（80139838 + b199f7b9）进 `feat/desktop-shell-comate`，构建跑通
- **M1 引擎 API**：改动清单引擎侧 1–5 + 单测（沿用 `management_test.go` 模式；mtime 门控、SSE、redaction 必测）
- **M2 Web UI**：向导、日志页、表单补全；CUJ 测试覆盖「向导完成 → 配置落盘 reload → /history 可见」链路
- **M3 壳**：托盘常驻 + Windows 打包；手动验收清单（macOS/Windows 各一份）
- **M4 分发**：dmg/msi 产物、版本号同步、README 更新

依赖关系：M2 依赖 M1 的端点；M3 可与 M1/M2 并行；M4 收尾。

## 风险与对策

| 风险 | 对策 |
|---|---|
| Windows 无 Unix pty：agent 会话层用 ptmx，Windows 上伪终端行为未验证 | M0 后先在 Windows 跑 `go test ./agent/...`，失败则 Windows 壳 v1 降级为「仅配置+日志查看」，会话能力标注实验性 |
| 结构化写回丢注释 | 已接受（ADR-0002）；注释文档价值由 config.example.toml 与表单提示承担 |
| 两轨并发写互相覆盖 | mtime 门控 409 + 前端刷新提示（ADR-0002） |
| 日志含 token | 流端点统一 RedactToken；不提供全量文件下载，只提供尾部窗口 |
| 管理端口被本机其他进程占用 | 引擎已有端口选择逻辑，壳启动失败时引导查看日志 |
| 壳与引擎版本漂移 | 壳只依赖 Management API 向后兼容契约（ADR-0003） |

## 测试要求（对齐 AGENTS.md）

- 引擎新增端点全部带单测；mtime 门控命名如 `TestHandleProjects_MtimeConflictRejected`
- 向导链路进 `core/cuj_test.go`（≥3 个用户动作，断言平台侧可见结果）
- `go test ./...` 与 `go test ./core/ -run TestCUJ` 通过后才能提交
