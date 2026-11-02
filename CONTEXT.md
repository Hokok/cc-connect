# CC-Connect

CC-Connect 是连接 AI 编码 agent 与 IM 平台的桥接服务。本词汇表统一桌面壳与配置管理设计中的核心术语。

## Language

**Engine / 引擎**:
cc-connect 主二进制进程，桥接 AI 编码 agent 与 IM 平台，读取 config.toml 启动。
_Avoid_: 后端、服务端、daemon（daemon 仅指 systemd/launchd 托管运行模式）

**Desktop Shell / 桌面壳**:
包裹引擎的桌面应用（Tauri），负责启动/停止引擎、注入 PATH、加载 Web UI、提供原生的配置编辑与日志入口。
_Avoid_: 套壳、app、客户端

**Web UI**:
编译并内嵌进引擎二进制的 React 管理界面，通过浏览器或桌面壳访问。
_Avoid_: 前端页面、控制台

**Management API**:
引擎暴露的 `/api/v1/...` 本地 HTTP 接口，是 Web UI 操作配置与状态的唯一通道。
_Avoid_: REST API、admin API

**config.toml**:
引擎的唯一配置真相源，所有配置修改（表单或文本）最终都写回这个文件。
_Avoid_: 配置数据库、设置存储

**Sidecar**:
桌面壳内嵌打包的引擎二进制副本，随壳启动而被拉起。
_Avoid_: 内嵌引擎、子进程

**First-Run Wizard / 首启向导**:
Web UI 中引导用户完成「检测 agent CLI → 选平台 → 填凭证 → 测试连接」的首启流程，无项目配置时自动进入。
_Avoid_: 安装向导、setup（setup 仅指飞书/微信的扫码配置 API 组）
