# 三平台验证与 DSH 兼容预警

当前正式版目标为 **1.2.0**；CI 不执行 npm 发布、Release、Tag 或部署。
开发通过个人 fork 的工作分支向社区上游 main 提交 PR，不再为本次 CI 在社区仓库新增开发分支。
既有上游候选分支的迁移整理仍是正式版本发布前待办，不在本次 CI 中删除。

## 合并门禁

`.github/workflows/ci.yml` 在 PR、main 推送和手动运行时，以 Node 22.23.1、
pnpm 11.7.0、未修改的锁文件，分别在 Ubuntu、Windows、macOS 完整执行
`pnpm run verify`：类型、lint、单元/后端测试、构建和客户端体积预算。
三个必需检查名称固定为：

- `verify-locked (ubuntu-latest)`
- `verify-locked (windows-latest)`
- `verify-locked (macos-latest)`

首次三平台通过后，将这些检查设为 main 的必需状态检查，并要求 PR 与 main 保持同步。
维护者通过 PR 合入，允许零个额外审查批准以支持个人维护；禁止 main 强推和删除。
提交者原始历史可通过 merge commit 保留，不要求把贡献者提交改写为维护者署名。

## 上游兼容预警

`.github/workflows/ci-compat.yml` 在相关 PR、每日北京时间 04:17 及手动运行时检查
DSH alpha 渠道。准备任务只解析一次 CLI 版本，四个 DSH 包均使用该精确版本；
Cordis 与 group 的当次精确版本也统一记录，再交由三平台执行完整 verify。
某个配套版本尚未发布、供应链等待期、安装或测试失败会在日志和摘要中保留，
不会通过降低安装政策或吞掉失败来制造成功。预警检查不列为 main 的必需检查。
alpha 是独立预览渠道，不表示它的版本号必然高于当前锁定的 RC。

## 权限与边界

- 使用普通 `pull_request`，工作流仅有 `contents: read`，不传入发布或部署凭据。
- checkout 不保存 Git 凭据；外部 Actions 固定为其官方仓库的完整 Commit SHA。
- pnpm 安装脚本白名单和等待期沿用项目政策，不在 CI 中豁免。
- 日志与摘要记录实际版本、Commit、安装和完整验证结果；预警失败不等于基础门禁失败。
- 三平台 verify 不等于真实安装和浏览器验收。发布仍需隔离 Profile、浏览器和在线链路检查；
  Ubuntu 验证也不能代替目标 Rocky Linux 服务器的正式部署验收。

方案沿用 @XChen446 在 PR #7 提出的跨平台验证和上游兼容检查方向，
维护者将锁定依赖门禁与浮动渠道预警分开，并统一预览版本、收紧凭据和合并边界。
