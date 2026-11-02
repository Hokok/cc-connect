# 更新分工：引擎 SelfUpdate，壳手动更新

引擎已有自更新能力（`core/updater.go` 的 SelfUpdate，支持 GitHub/Gitee 源）；桌面壳接入 Tauri updater 需要签名密钥、更新源与发布流水线。

决定：v1 引擎沿用 SelfUpdate（壳提供「检查更新」入口，更新完成后由壳重启引擎）；桌面壳自身不接自动更新，用户手动下载新版本安装包。

## Consequences

- 壳与引擎版本可能短暂不同步，壳必须只依赖 Management API 的向后兼容契约
- 壳引入自动更新（Tauri updater）留作后续迭代，届时引擎更新可收敛为随壳整体分发
