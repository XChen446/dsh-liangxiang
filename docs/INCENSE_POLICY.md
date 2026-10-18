# 香火静态倍率与最终用量结算

> 2026-10-12 用户确认的源码修复；尚未发布或部署。按用户要求版本字符串暂留
> 1.1.6 / 1.1.6-u2，正式发布前统一盖新版本。产品契约以 `AGENTS.md` 为准。

## 固定两档

每 50,000 当量生成一炷，输入（未缓存＋缓存读＋缓存写）与输出全量计入。
reasoning 已包含在输出，不重复计入；图像使用服务商报告的输入用量。

- DeepSeek Pro 类 ×1：默认 50,000 输入＋输出 Token 凝成一炷。
- DeepSeek Flash 类 ×0.5：默认 100,000 输入＋输出 Token 凝成一炷。
- 缺失、未知、其他模型同 Flash，均为 ×0.5。
- 倍率不随版本、发布时间或供应商变化。
- 每日赠送 10 炷保留，同设备当天不重复领，保持现有显示；不增加赠香区域。
- 一炷一票、单次补账异常限幅 5,000 炷均不变。

实现与唯一静态规则源：`src/domain/incense-weight.ts`。匹配是完整 ID 的有界 `*`
通配；`[1m]` 等上下文后缀先归一化；不匹配显示名、不下载脚本、不执行任意正则。
符合现有命名的未来 Pro / Flash 型号直接沿用各自倍率，不需逐型号升级客户端。

## 计算与说明同源

Host 在线、离线均使用同一份静态规则，不读取远程倍率覆盖，不查询官方模型目录，
不需要新增 DeepSeek Key。既有存储字段保持可读，但规则元数据不参与新请求定价；
已经生成和消费的香火不追溯改写，身份、账本和会话结算游标保持不变。

Backend bootstrap 和 Host 状态携带同一份静态规则。下一炷的提示通过同一个
`incenseWeightRows(policy, tokenPerIncense)` 生成，阈值读实际 `tokenPerIncense`，
不另维护一张说明表。
`node lib/backend-cli.js rules show` 可只读查看静态规则，不打开数据库。

内部对账使用已有 SQLite `starter_tokens` 字段区分赠香和真正已声明的用量；
此数值仅在 Backend→Host 传送，不新增 Client 赠香显示。这样冷启动时先完成的
一次请求不会被 10 炷见面礼误认为“已经补过”。断线/日切的本机观察按最后一次
服务器时间与时区锚点暂存，只有服务器确认的业务日才能实际声明和投票。

## 每次请求的最终结算

2026-10-18 的 1.2.0-rc.1 候选新增 DSH 0.2.1-rc.2 兼容：当前日志把用量流
内嵌到 assistant/message / assistant/attempt，最终 message.usage 优先，否则读取
stream 最后一个 usage chunk；失败/取消尝试同样只结算一次。旧 chunk 序列保留读取。
结算游标保存 SessionHeader.version，格式迁移先保守建立新历史基线，再接收新请求，
不跨格式比较偏移、不重铸旧香火。下文原始算法和证据描述的是 2026-10-12 批次；
当前适配与验证以 COMPATIBILITY.md 和 PR6_REVIEW.md 为准。

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
  重启、模式隔离、跨日与静态倍率。
- `tests/host-backend.spec.ts`：原生 DSH 日志 → Host → 真实 localhost HTTP/SQLite
  → 赠香/凝香 → 接受投票 → 同源提示规则。
- Pro/Flash 型号匹配、持久化重开、同源提示分别见 domain、storage、client-panel 测试。

本批完整 verify 通过（51 文件 / 595 测试、类型/代码检查、构建与客户端预算）。
干净 Profile 使用 Node 22.19.0、pnpm 11.7.0、钉住的 DSH alpha.5；真实打包安装的桌面、
窄屏、暗色浏览器 41 项通过、1 项按 DSH 窄屏设置按钮设计跳过；localhost 在线
DEV_STAGING_ONLY 冒烟覆盖签名 Host 启动、幂等和 50 路并发只接受一票。
临时 Profile / 数据库隔离，未修改个人 Profile、未登记真实社区测试香客。
官网 5 项测试、6 页构建/链接/版本/GoatCounter 门禁通过；桌面与手机视口各检查
首页、关于页的静态说明，无横向溢出。Pages 部署及线上文案、统计脚本已核验。
npm、GitHub Release 和真实后端部署仍待后续批准。
