# 梁相

**众香成势，梁子显相。梁相还得梁人出！**

梁相是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件。每天一道梁案：对话消耗的 Token 凝成香火，一炷夯或拉；社区香火汇成梁位，显出今日梁子，日终收入梁祠。

独立社区项目，非 DeepSeek 官方产品。

官网：[liang.today](https://liang.today/) · [完整安装指南](https://liang.today/guide/)

![插件主界面](assets/main-frame.jpg)
![插件主面板](assets/plugin-panel.jpg)
![梁祠](assets/liangci.jpg)

## Desktop：应用内安装（推荐）

1. 打开 DSH Desktop 的 **插件 → 添加插件**。
2. 输入完整包名 **`dsh-liangxiang`**，点击 **安装**。
3. 安装完成后点击 **立即启用**；页面边缘出现“今日梁相”即装好。

![输入完整包名 dsh-liangxiang 后点击安装](docs/assets/install/desktop-package-name.jpg)

输入或搜索时必须使用完整包名。更多截图见[三步安装图解](docs/INSTALL.md#desktop应用内安装)；无需另装市场插件或配置索引。

Desktop 的 Profile 由桌面应用独占管理，使用应用内市场操作。不要用普通 npm CLI 写入 Desktop 的目录。

## Cmd：命令行安装

退出对应的 WebUI 后执行：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
npx --yes @deepseek-ai/dsh web
```

已有全局 `dsh` 时可替换命令开头；`web` 换成实际 Profile。升级继续使用插件安装命令，卸载用 `plugin --profile web remove dsh-liangxiang`。更新或卸载插件不删除香火账本。

不要运行 `npm i dsh-liangxiang`：那不会把插件装进 DSH。命令行、本地安装包和开发方式见 [`docs/INSTALL.md`](docs/INSTALL.md)。

## 玩法

- 新香客备 10 炷，同一台机器当天重装不重复领取；继续对话还能攒香。
- Input + Output Token 按固定倍率折算：**Pro ×1，Flash 与其他模型 ×0.5**；默认 50,000 Pro 当量一炷。
- 点一下一炷，长按 1.5 秒倾炉；只能夯或拉。
- 梁位是社区夯率，个人剩余香火不决定梁子等级。
- 结果收入梁祠，可看日梁、周梁与月梁。

**1.2.0** 新增小难梁、轻落短句和可选的 23:59 日终上香。右键夯或拉设置默认方向，案牍整格切换开关；DSH 运行时按限额尽量上香，手动操作优先。见[当前架构](docs/CURRENT_ARCHITECTURE.md)与[发布核验](docs/RELEASE_READINESS_1_2.md)。

## 在线连接

在线模式持续无法开启时，可能是本机网络无法访问社区服务器。部分地区（如福建）可能遇到此类问题，可尝试让运行 DSH 的网络环境使用代理，然后重试；只给浏览器设置代理未必能覆盖 DSH Host。

插件会自动重连；需要本机自玩时，可在梁相案牍手动切到离线模式。在线与离线香火分别记账，不互相迁移。详见[排障说明](docs/TROUBLESHOOTING.md)。

> 梁位是社区软信任玩法，不代表实名人数、真实民意或任何个人、机构立场。
