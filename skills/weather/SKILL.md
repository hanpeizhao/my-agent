---
name: weather
description: 天气查询服务（演示数据）
trigger: 用户询问天气、气温、下雨、防晒、穿什么衣服等问题
version: 1.0.0
---

# 天气查询技能

⚠️ **重要警告**：本技能返回的是**模拟演示数据**，不是真实天气！如需真实天气信息，请使用 `web_search` 搜索。

## 可用工具

### get_weather

查询指定城市的当前天气情况（演示数据）。

参数:
- city (string, 必填): 城市名称，如"北京"、"上海"、"广州"

返回:
- city: 城市名
- temperature: 当前温度（摄氏度）- **演示数据**
- humidity: 湿度百分比 - **演示数据**
- condition: 天气状况描述 - **演示数据**
- wind: 风力描述 - **演示数据**
- source: "MOCK_DATA" 或 "MOCK_DATA_DEFAULT"
- disclaimer: ⚠️ 免责声明

### get_forecast

查询指定城市未来 N 天的天气预报（随机演示数据）。

参数:
- city (string, 必填): 城市名称
- days (number, 必填): 预报天数，1-7

返回:
- city: 城市名
- forecast: 预报数组，每天包含 date, high, low, condition - **全部是随机演示数据**

## 使用规则

1. **必须告知用户这是演示数据**：每次调用后，回复中必须包含"这是演示数据，非真实天气"
2. 如果用户未指定城市，先用 location skill 的 get_current_location 工具获取位置
3. 查询未来天气用 get_forecast，查当前用 get_weather
4. 返回简洁的自然语言回复，不要复述 JSON 数据
5. 如果用户需要真实天气，建议他们使用 `web_search` 搜索实时天气
