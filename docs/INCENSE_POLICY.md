# 香火模型规则与最终用量结算

> 2026-10-12 用户确认的源码修复；尚未发布或部署。按用户要求版本字符串暂留
> 1.1.6 / 1.1.6-u2，正式发布前统一盖新版本。产品契约以 `AGENTS.md` 为准。

## 两档规则

每 50,000 当量生成一炷，输入（未缓存＋缓存读＋缓存写）与输出全量计入。
reasoning 已包含在输出，不重复计入；图像使用服务商报告的输入用量。

- Pro 系列 ×1，包括符合模型族命名的新版本。
- `deepseek-flash` 和新编号 Flash 系列 ×1。
- 真正旧 V4 Flash / Vision Exp ×0.5。
- 缺失、未知、其他模型 ×0.5。
- 官方供应商 `deepseek-official` / `deepseek` 的两个旧 Flash 名称转到 V4.1 Flash，
  作为供应商限定的例外 ×1；第三方旧模型仍 ×0.5。
- 每日赠送 10 炷保留，同设备当天不重复领，保持现有显示；不增加赠香区域。
- 一炷一票、单次补账异常限幅 5,000 炷均不变。

实现与唯一内置规则源：`src/domain/incense-weight.ts`。匹配是完整 ID 的有界 `*`
通配；`[1m]` 等上下文后缀先归一化；不匹配显示名、不下载脚本、不执行任意正则。
例外必须排在通用模型族之前。未来正常编号的 Pro/Flash 自动识别；特殊改名只需
修改后台规则数据，不需再发客户端。已经安装的旧 1.1.6 需要一次升级来获得此能力。

## 后台下发与缓存

Backend bootstrap 的 `token_policy.model_weights` 传送以下 JSON 数据：

```json
{
  "version": "operator-model-rules-v4",
  "revision": 4,
  "effectiveFrom": "2026-10-13",
  "fallbackWeightBps": 5000,
  "rules": [
    { "label": "新增模型名", "model": "new-official-alias", "weightBps": 10000 },
    { "label": "Pro", "model": "deepseek-*-pro*", "weightBps": 10000 },
    { "label": "新 Flash", "model": "deepseek-flash", "weightBps": 10000 },
    { "label": "旧 Flash", "model": "deepseek-v4-flash*", "weightBps": 5000 },
    { "label": "新 Flash", "model": "deepseek-*-flash*", "weightBps": 10000 }
  ]
}
```

这是结构示例，不是要求替换完整默认规则；修改时保留需要的官方供应商别名例外。
可选 `provider` 同样是完整 ID 通配。只允许 5000 / 10000 两档，规则最多 24 条，
模式最长 96 字符、最多 4 个 `*`，标签最多 24 字；环境配置最长 16 KiB。

运维先用 `node lib/backend-cli.js rules show` 查看配置；用
`node lib/backend-cli.js rules validate '<完整 JSON>'` 做无数据库写入的验证。
完整 JSON 配置在受保护的 `LIANGXIANG_INCENSE_WEIGHT_POLICY` 环境变量中，由现有
运维配置流程备份、修改、重启和健康检查。修改数据无需重构建后端/插件。
不要在公网新增规则写入或其他运营 API，也不要把秘密放进此公开规则数据。

每次规则变化使用新的 `revision` 和 `version`，普通调整选未来业务日生效。
Host 将最后有效规则缓存在 `storages/liangxiang.json` 的 `settings/model_weights`，
最多保留 32 个修订（保留当前有效版本）；有生效日期的未来版本不会提前使用。
缓存记录保留旧 settings schema 所需的兼容字段，以免回退旧插件时整域校验失败；
模式选择始终只读取原来的模式设置 key，不读取规则缓存里的兼容字段。
某日第一次结算后，在该日 `daily_usage` 固定规则副本。后续热更新、断网、重启
不会重新定价该日已经结算的 Token，离线使用缓存/内置规则。
非法、降级、重用修订的规则保留旧规则；非法可选下发字段不会使正常投票断线。

Host 将实际生效规则随自己的状态传给 Client。下一炷的提示通过同一个
`incenseWeightRows(policy, tokenPerIncense)` 生成，连每炷阈值也读实际数据。
不再维护一张独立的硬编码说明表。规则在 bootstrap 冷读，未增加独立轮询。

内部对账使用已有 SQLite `starter_tokens` 字段区分赠香和真正已声明的用量；
此数值仅在 Backend→Host 传送，不新增 Client 赠香显示。这样冷启动时先完成的
一次请求不会被 10 炷见面礼误认为“已经补过”。断线/日切的本机观察按最后一次
服务器时间与时区锚点暂存，只有服务器确认的业务日才能实际声明和投票。

## 每次请求的最终结算

`compat/dsh/settled-usage.ts` 每个活跃会话只保留一个请求尝试的数值样本和模型元数据：

1. `step/start` / `llm/retry-started` 开始一次尝试；`request/header` / `request/context`
   记录其路由。
2. `assistant/chunk` 的 usage 只更新暂存样本，绝不直接铸香。
3. 最终 `assistant/message.usage` 替换暂存样本；缺省时保留最后服务商样本。
   该 message 的 `source.provider/model` 优先用于归属，立即结算，不等待工具执行。
4. 失败/中断而没有 message 的尝试，在 `llm/retry` / `step/end` 使用最后的服务商
   样本结算。计划重试没有真正开始，不额外铸香；没有用量则不估算。
5. 逐请求折算，批量 replay 也不能用会话最后模型给所有请求定价。

`usage-ledger.ts` 在每个会话旧 watermark 记录上增加 `settledOffset` 与
`baselineOffset`，不为每条 Token/请求新增无界 receipt。共享游标防止重复 replay、
重启、切换在线/离线再次计香。首次无游标的会话基线隔离旧历史/借用前缀；
升级时已经开始的请求保守跳过，避免此前临时样本已经计香而再次补发。
有游标的会话只补未结算请求；昨日遗漏请求不灌入今日。既往已计入/已消费的香火
不追溯扣除。旧累计高水位入口仅保留给旧存储兼容与隔离的模拟测试，真实 DSH
观测只走请求结算通道。

只在本机读 DSH 日志。Host 的持久化/网络 payload 不存提示词、回复、源码或会话
正文；Backend 仍只接收折算后总量，不接收模型名。此改动不提升社区 A3 软信任等级。

## 证据

- DSH alpha.5 / `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`，只读审计。
- `tests/helpers/dsh-usage.ts` 从钉住 DSH 安装解析原生 Session 和 TokenMeter，
  通过它的公开注册捕获真正的 `tokenUsage` 单元，未复制官方 fold。
- `tests/settled-usage.spec.ts`：最终下调、缓存桶、重试、取消、模型切换、种子、
  重启、模式隔离、跨日、远程规则缓存/未来生效。
- `tests/host-backend.spec.ts`：原生 DSH 日志 → Host → 真实 localhost HTTP/SQLite
  → 赠香/凝香 → 接受投票 → 同源提示规则。
- 模型匹配/非法配置、持久化重开、动态提示分别见 domain、storage、client-panel 测试。

本批验收使用 Node 22.19.0、pnpm 11.7.0、钉住的 DSH alpha.5：完整 verify
（51 文件 / 595 测试、类型/代码检查、构建与客户端预算）；真实打包安装的桌面、
窄屏、暗色浏览器 41 项通过、1 项按 DSH 窄屏设置按钮设计跳过；localhost 在线
DEV_STAGING_ONLY 冒烟覆盖签名 Host 启动、幂等和 50 路并发只接受一票。
临时 Profile / 数据库隔离，未修改个人 Profile、未登记真实社区测试香客。
代码将整批 commit/push；npm、GitHub Release 和真实后端部署仍待后续批准。
