# 安装、升级与运行

推荐使用 [DSH 官方 Desktop](https://www.deepseek.com/zh/harness/) 的内置插件安装入口。
安装后页面边缘出现“今日梁相”；单击打开今日梁案，可拖动入口调整位置。
本版安装包为 **dsh-liangxiang@1.2.0**；发布状态以 npm `latest` 和 GitHub Latest Release 为准。

## Desktop：应用内安装

### 1. 打开「添加插件」

左侧点 **插件**，再点右上角 **添加插件**。

![在 DSH Desktop 的插件页面打开添加插件](assets/install/desktop-add-plugin.jpg)

### 2. 输入完整包名并安装

输入 **`dsh-liangxiang`**，点击 **安装**。输入或搜索时都必须使用完整包名。

![输入完整包名 dsh-liangxiang 并点击安装](assets/install/desktop-package-name.jpg)

### 3. 立即启用

安装完成后点 **立即启用**；页面边缘出现“今日梁相”即完成。若提示需要刷新或重启，按提示操作。

![安装完成后点击立即启用](assets/install/desktop-enable-plugin.jpg)

*截图为安装流程示意，图中旧版本号不代表本版；安装后请在「梁相案牍 → 当前版本」核对。*

以上流程无需命令行、额外市场插件或索引配置。已有“发现”或社区市场入口时，同样搜索完整包名 `dsh-liangxiang`。

更新与卸载在 **插件 → 已安装 → 梁相** 完成。若所用市场没有更新按钮，先卸载插件，再按原流程重新安装。
卸载不删除本机香火账本；不要额外清理 DSH 的数据目录。升级后在 **梁相案牍 → 当前版本** 核对版本与更新说明。

Desktop 的 `desktop` Profile 由桌面应用独占管理。普通 npm CLI 的 `web` 命令不能用于它；
不再使用手动改 Desktop 家目录或混用桌面 pnpm 的旧安装方法。

## Cmd：命令行 WebUI

按 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness#run) 准备运行环境。
退出对应 WebUI 后，安装并启动：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
npx --yes @deepseek-ai/dsh web
```

已有全局 `dsh` 时可替换命令开头。安装和启动必须使用同一个 Profile；自定义 Profile
把 `web` 换成实际名称，并在启动命令中使用 `--profile`。该选项应写在 `add` / `remove` 之前。
不要运行 `npm i dsh-liangxiang`，它只安装普通依赖，不注册 DSH 插件。

更新到当前公开正式版：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang@latest
npx --yes @deepseek-ai/dsh web
```

卸载：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web remove dsh-liangxiang
```

命令行安装、更新、卸载均在独立临时 Profile 核验；不会因删除插件依赖而删除账本。
不要为了安装梁相再装旧 `dshmarket`；已使用社区市场的用户可按其兼容说明继续操作。

### 本地发行包

从 [GitHub Releases](https://github.com/liang-today/dsh-liangxiang/releases) 下载正式包后，
在文件所在目录执行；本地相对路径必须带 `./`，避免被当成 npm 包名：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-liangxiang-1.2.0.tgz
```

源码候选 tarball 的安装由干净 Profile 门禁验证，不代表公开正式包已升级。

## 在线连接与代理

在线模式需要运行 DSH 的机器能访问社区服务器。若一直无法连接，可能是网络问题；
包括福建在内的部分地区有连接不稳定反馈，可尝试让 DSH 使用代理后重试，具体取决于网络与运营商。
只给浏览器配置代理，未必覆盖发请求的 DSH Host。

可使用代理软件的 TUN 模式，或在 DSH 实际使用的 `$DSH_HOME/.env` 设置 HTTP 代理，
完全退出并重启 DSH。以下端口需替换为自己的 HTTP 代理端口：

```dotenv
HTTPS_PROXY="http://127.0.0.1:7890"
HTTP_PROXY="http://127.0.0.1:7890"
```

这里不要填写 SOCKS URL；配置放在 DSH 主目录，而不是项目 `.env`。
见 [DSH 官方代理说明](https://deepseek-harness.github.io/deepseek-harness/guide/network-proxy)。
梁相保持在线偏好并自动重连；需要本机自玩时，可在案牍手动选择离线模式，两边账本不合并。

## 开发与自建 Backend

源码开发使用隔离 Profile，不修改日常 DSH 或 Desktop：

```bash
pnpm install
pnpm run dev:install
pnpm run dev:web
```

默认开发入口为本机 3080。脚本使用隔离 `DSH_HOME`；需要离线首次默认时设置
`LIANGXIANG_BACKEND_URL=local`。已有保存偏好不会被环境变量覆盖。
开发卸载使用 `pnpm run dev:uninstall`。精确兼容环境见 [`COMPATIBILITY.md`](COMPATIBILITY.md)；干净安装门禁采用 pnpm 11.28.5，日常开发不强制改动已工作的工具链。

验证最终安装包：

```bash
pnpm run verify
pnpm run smoke:browser-clean-profile
pnpm run smoke:online
```

自动门禁只使用临时 Profile、SQLite 和 localhost。不要降低日常依赖安装政策或忽略兼容检查。
Profile 中的内置 DSH bundle 由运行时提供，不把官方 Web App 闭包重复装入其 node_modules；
可用 `node scripts/assert-profile-modules.mjs <profile-directory>` 只读核对。

普通插件包不包含 Backend，也不要求用户自建服务器。自建节点从仓库运行后端，部署、备份、
迁移和版本检查统一走 [`121-vps-deploy.md`](121-vps-deploy.md) 与仓库部署脚本。
全部可选配置见 [`.env.example`](../.env.example)，排障见 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)。
