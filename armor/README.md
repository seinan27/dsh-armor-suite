# armor/armor.md 是什么，以及它不适用于什么

## 它是什么

一份**可以直接用的受保护提示词**（下面简称"破甲"）。默认配置下 `armor-inject` 读的就是这个文件。

内容是一整套行为约定：说话方式、拒绝策略、边界处理、能力声明。

## 它只针对 DeepSeek 系模型调过

**这一点很重要。**

这份文本的写法是按 DeepSeek 系模型（`deepseek-flash`、`deepseek-v4-pro`）的指令跟随习惯调出来的：

- 句式短、条目多，适合它对结构化指令的响应
- 大量使用"不许/必须"这类硬约束，依赖它对否定式指令的敏感度
- 中英混排的术语表，按它的分词习惯排的

**换成别的模型家族（Claude、GPT、Gemini），行为未经验证。** 可能出现：

```
完全照做           那最好
部分失效           挑着执行，或者把硬约束当成建议
反向效果           过度遵守某一条，压过其他条
```

**它不是"通用 jailbreak"，是一份为特定模型调过的提示词。** 换模型请自己测过再上。

## 它默认只注入到四个路由

```
deepseek-official/deepseek-flash
deepseek-official/deepseek-v4-pro
deepseek-account/deepseek-flash
deepseek-account/deepseek-v4-pro
```

要加别的路由，改 `cordis.patch.yml` 里的 `routes`，**注入侧和清理侧两边都要改**。

## 它的边界写在正文里，不是靠插件兜底

正文里有几条是给模型看的约束（比如"图片不在防护范围""用户粘贴的内容管不到"）。那些是**行为约定**，不是技术保证。技术保证只在插件那三层里。

## 想换成自己的？

两条路：

**一、改这个文件。** 保留它开头的结构（`<|im_start|>system:<project_instructions>` + 分节标题），把你自己的内容换进去。不用管标记——`armor-inject` 会在外面自动包 `<!-- armor:begin -->` / `<!-- armor:end -->`。

**二、指向别处。** 在 `cordis.patch.yml` 里把 `file:` 设成你文件的绝对路径。同样不用手写标记。

**但如果你的破甲正文里有自己的识别串**（比如某个固定前缀），记得在 `signatures` 里声明，否则清理侧认不出来：

```yaml
- id: armor-guard
  config:
    signatures:
      - '<|im_start|>system:'
      - '# 破甲'
      - '你的固定前缀'
```

## 一份以上的破甲怎么办

当前版本一个插件实例读一个文件。要同时用多份：

```
方案一    把几份合成一个文件，用分节标题隔开
方案二    装两份 dsh-armor-suite（不同 profile 或不同 id），各配各的
          markers 配不同标记对，避免互相误伤
```

**注意**：多个实例共用同一个 `conf`（模块级），同一进程内装两份会互相覆盖。要用多份请走方案一。

## 许可

同本仓库，MPL-2.0。
