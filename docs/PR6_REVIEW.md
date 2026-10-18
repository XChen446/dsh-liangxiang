# PR #6 本地整合与 DSH 升级

来源：https://github.com/liang-today/dsh-liangxiang/pull/6，贡献者 XChen446，
原始提交 d4f2add224caaa20d3d99e6099ebea934112e322。
整合分支 codex/pr-6-dsh-latest；候选 1.2.0-rc.1，供本机隔离环境手工验收。

## 审查结论

果冻徽标是低成本、可发现的趣味反馈：一枚现有控件的轻拍回弹、短音和连拍彩蛋，
不增加第五区、按钮、成长系统或业务数据，符合克制的产品方向。整枚 button 变形、
tooltip 在外保持稳定的结构合理；沿用合成音效，不新增媒体或运行时依赖。

原稿不能直接合入正式主线：

- pointerdown 就播音，拖拽/取消也会响；改为确认轻拍后在回弹时发声。
- 第三次起吞掉所有 click，包含 Enter/Space/辅助技术激活；改为只处理指针连击，键盘始终保留正常开合。
- 文案包含禁用旧称呼和暗示漏香的说法；改为五条纯装饰短句，title/可访问名称保持今日梁相，视觉彩蛋限时恢复。
- 减少动态只停回弹，按压仍变形；改为禁用按压与回弹变形，取消手势也清理状态。
- 原稿强制读取 offsetWidth 重启动画；改为按下清除、释放重放，移除同步布局读取与常驻 will-change。
- 原稿没有升用户可见版本；本地整合候选统一升级版本和更新提示，不宣称公开发布。

计数/文案抽到 badge-squish.ts，DOM/计时器只留在已有容器；正常第一、第二次
轻拍继续开合，第三次起连续玩耍，900ms 停顿后恢复普通单击。该彩蛋只改变展示，
不存业务字段、不发投票、不改变香火、梁位或中央状态。

## DSH 升级

上游源码 master 更新至 687f282e86；CLI/Web App/UI 包统一 0.2.1-rc.2，
Cordis 4.0.5。新持久化 assistant/message 和 assistant/attempt 的内嵌 stream
已适配，旧格式继续可读。日志格式迁移会重新建立结算基线，避免比较已重排偏移。
默认入口对齐新版底部账号菜单，保留 8px 间距，用户拖动保存的位置不改写。
隔离安装策略可重复合并原生构建决策，保留其他 Profile 设置；启动资源探测同时
支持新清单中的 document-relative URL 和旧 HTML script 入口。
详细接口证据见 COMPATIBILITY.md。

## 验证记录

- `pnpm run verify`：52 个测试文件 / 607 项测试全部通过；类型、lint、构建和客户端预算通过。
- `pnpm peers check`：无 peer 冲突。测试工具补齐上游 app-boot 要求的 Cordis plugin-group 1.0.5，不增加插件运行时依赖。
- `pnpm run smoke:online`：隔离 localhost HTTP/SQLite + 真实 DSH Host 链路通过，包含重复请求只扣一炷、50 路并发只接受一票、快照发布和生产权威模式拒绝。
- 构建产物 client.js：694,884 B raw / gzip level 9 387,996 B，低于 700 KB / 400 KB 预算。
- `pnpm run smoke:browser-clean-profile`：真实 tarball 安装、Host 激活、资源加载、存储/模式检查均通过；桌面、窄屏、暗色共 54 项，53 通过、1 项按窄屏隐藏底部控件的设计跳过。包含 axe WCAG A/AA、四区布局、梁祠、欢迎/更新说明、完整徽标交互和减少动态。
- 已人工查看三种视口/主题的面板及梁祠截图，无新增裁切或布局溢出。
- 测试时 PR #6 仍为 OPEN，head 仍为上述 d4f2add；本次提交保留原 PR 作为合并父节点，不改写贡献者提交。

手工测试 WebUI 为 http://127.0.0.1:3080，社区模拟后端为
http://127.0.0.1:4186，均只监听回环地址。独立 DSH_HOME 为 `/tmp/liangxiang-pr6-20261018`，
Profile 为 liangxiang-pr-6；本机数据库已备 10 炷见面礼。首次打开可选在线，
它指向本机模拟社区；切换离线也保留独立账本。测试 Profile 不复用真实个人资料。

重启时沿用本次独立 DSH_HOME、LIANGXIANG_PROFILE=liangxiang-pr-6 和
LIANGXIANG_BACKEND_URL=http://127.0.0.1:4186，运行 dev:web；先启动相同本机
SQLite 文件的 Backend。访问凭据只保留在本机进程/浏览器中，不写入仓库。
本次整合目标是测试分支；PR 主线合并与公开发布状态应分别核对。
