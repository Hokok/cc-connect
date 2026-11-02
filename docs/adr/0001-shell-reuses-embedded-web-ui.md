# 桌面壳复用内嵌 Web UI，不自建原生 UI

引擎二进制已内嵌 React Web UI（经 Management API 操作配置与状态），桌面壳需要用户界面。

决定：Tauri 桌面壳只承担原生能力——引擎（sidecar）生命周期、托盘常驻、TOML 配置编辑器窗口、打开日志文件夹；主界面直接加载内嵌 Web UI（`http://127.0.0.1:{port}/login?token=…`）。不在壳里用原生技术重写业务 UI。

## Consequences

- 一套前端代码同时服务桌面壳与浏览器访问，UI 迭代只需改 `web/`
- 壳与引擎通过 Management API 解耦，壳需容忍引擎版本演进（API 向后兼容）
- 壳内禁止出现业务逻辑（配置解析、会话管理等），保持「薄壳厚引擎」
