# dsh-armor-suite[破甲套件]

[English](./README.md) | [简体中文](./README.中文.md)

让一段受保护的提示词（下称"破甲"）只出现在你批准的路由上；其余路由从头到尾看不到它。

这是一个 DeepSeek Harness（DSH）插件包：两个插件 + 一份可以直接用的破甲样本。

- **`armor-inject`** —— 把破甲放进系统提示词，但只在该次请求走的是白名单 `provider/model` 时才放。别处渲染出来是空字符串，也就没有可泄露的东西。
- **`armor-guard`** —— 在别的路由够到它之前，清掉或者拒绝：一道在工具结果写进会话历史之前，一道在请求发出之前。
- **`armor/armor.md`** —— 一份能直接用的破甲。换成你自己的也行。

---

## 为什么需要它

有些提示词只在某些模型上安全。一段在一个供应商那儿没事的提示词，到了另一个跑内容审核的供应商那儿，轻则被拒，重则按账号累计违规次数——等你发现的时候，代价已经付了。

麻烦的地方在于：**一个会话的对话历史是所有模型共用的**。受保护的内容一旦写进去，就永久在那儿；之后换模型，直接撞上。

这个包把两个时刻分开处理：

| 时刻 | 钩子 | 发生什么 |
|---|---|---|
| 写系统提示词 | `systemPrompt.section` | 每次请求重新生成。非白名单路由拿到空段，那段文字对它们来说根本不存在。 |
| 工具结果进历史 | `tools/post-execute` | 这份历史所有模型共用。白名单路由保留原文，其余路由当场清掉。 |
| 请求即将发出 | `llm/stream` | 看得到完整请求，但 options 是冻结的，只能拒绝、不能改。 |

第三道是最后一道闸，不是主要机制。它一旦触发，说明受保护内容已经在历史里了，这一轮只能不发。

## 安装

```bash
dsh plugin --profile <profile> add github:<owner>/dsh-armor-suite
```

或者从本地目录装（改代码时更顺手）：

```bash
git clone https://github.com/<owner>/dsh-armor-suite.git
dsh plugin --profile <profile> add /path/to/dsh-armor-suite
```

装完重启 DSH —— 插件代码在启动时加载。

## 配置

本包的 `cordis.patch.yml` 会插入两个插件。在你自己 profile 的 patch 文件里覆盖任意一项即可；**两个路由列表必须完全一致**。

```yaml
- id: armor-inject
  config:
    file: ''            # 空 = 本包的 ./armor/armor.md
    routes: []          # 空 = 内置的 DeepSeek 默认路由
    order: -2000

- id: armor-guard
  config:
    routes: []          # 与上面同一份列表
    onResidual: clean   # clean | block | warn
    replacement: '[content removed]'
    diagFile: ''        # 空 = 不落盘
```

`routes` 里写的是精确的 `provider/model`。**有意不支持前缀匹配**——模型名里带 `deepseek` 不代表它由 DeepSeek 提供，OpenRouter 上就有 `~deepseek/...` 这类。

### `onResidual` 三档

```
clean   进历史之前换成占位文本（默认）
block   直接拒绝发送这个请求
warn    只记日志，照常放行（仅供诊断）
```

默认 `clean`，因为拒绝一次请求是很重的手段——用户这一轮就白等了。**如果泄露比丢一轮更糟，用 `block`。**

## 判定是怎么做的

注入这一侧，DSH 在组装系统提示词时就已经带上了本步的模型选择：

```js
assemble({ ...assembleContextFor(agent, signal), modelSelection: selection, toolSet })
```

而每个动态段收到的是这个组装上下文：

```js
text: typeof section.text === 'function' ? section.text(context) : section.text
```

所以注入侧直接读 `context.modelSelection`，要么返回包好标记的破甲，要么返回空字符串。**没有任何"事后再补救"的环节。**

清理这一侧，`exec.agent.model.current()` 给出产出这条工具结果的路由，于是同一条结果可以对一个模型保留、对另一个模型清掉。

## 覆盖什么，不覆盖什么

覆盖：

- 工具结果、消息、请求 `system` 里的普通字符串和文本块
- `additionalContexts`（宿主会把它原样追加；这段如果带受保护内容，整条结果会被 block，因为决策换不掉那份拷贝）
- `decision.value`（会被重新渲染进工具输出；**对象键**里带受保护内容时同样 block——键没法安全改写）

不覆盖，且是有意的：

- **图片等非文本块。** 本包只守文本标记。图里烧进去的字是 OCR 的问题，答案不一样。
- **用户自己粘贴进来的内容。** 那走的是用户消息；`agent/pre-step` 只看得到本轮新认领的消息，载荷也只读。
- **受保护内容已经进历史之后再换模型。** 原文在共用历史里；第三道闸会拒绝那个请求而不是发出去。当前 DSH 钩子没有提供"替换完整请求副本"的入口。

## 测试

```bash
node test/basic.mjs     # 28 项，无框架、无网络、无宿主
```

## 许可

MPL-2.0，见 [LICENSE](./LICENSE)。

与 DeepSeek 官方无关，也未获其背书。用不用、怎么用，自己判断。
