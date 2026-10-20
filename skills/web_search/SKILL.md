---
name: web_search
description: 联网搜索服务
trigger: 用户询问最新资讯、产品推荐、实时信息、知识查询等需要互联网数据的问题
version: 1.0.0
---

# 联网搜索技能

本技能提供互联网搜索能力，用于获取 LLM 训练数据之外的信息（如最新资讯、产品推荐、实时数据）。

## 可用工具

### web_search

搜索互联网并返回结果。结果包含标题、链接、摘要。

参数:
- query (string, 必填): 搜索关键词，使用自然语言
- max_results (number, 可选): 返回结果数，默认 5，最多 10

返回:
- results: 数组，每条含 title、url、snippet
- total: 结果总数

### fetch_url

抓取指定 URL 的网页正文内容（自动去掉 HTML 标签）。

参数:
- url (string, 必填): 要抓取的 URL
- max_length (number, 可选): 最大返回字符数，默认 5000

返回:
- url, title, content, length

## 使用规则

1. 当用户询问**实时信息**或**LLM 可能不知道的内容**时使用（如"推荐感冒药"、"今天新闻"、"最新版本"）
2. 通用知识问题（如"什么是感冒"）不需要搜索
3. 搜索后可以用 fetch_url 深入查看具体网页
4. 综合多个搜索结果组织回答，不要只依赖一条结果
5. 在回复中标注信息来源（URL）
