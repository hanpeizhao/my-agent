---
name: location
description: 位置获取服务
trigger: 用户询问"我在哪里"、"当前位置"、"今天天气怎么样"（隐式位置需求）
version: 1.0.0
---

# 位置获取技能

本技能通过 IP 地址获取用户当前位置。CLI 场景下无法用 GPS，IP 定位是最实用的方案。

## 可用工具

### get_current_location

获取用户当前所在位置，无需参数。

返回:
- ip: 用户 IP 地址
- city: 城市
- province: 省份
- country: 国家
- lat, lon: 经纬度
- isp: 网络运营商
- source: 数据来源

### get_city_by_ip

根据指定 IP 地址查询对应的城市。

参数:
- ip (string, 必填): IPv4 地址

返回:
- ip, city, province, country, lat, lon, isp, timezone

## 使用规则

1. 当用户请求涉及位置但未明确指定时，**先调用 get_current_location**
2. 拿到城市后，把城市名传给 weather 等 skill
3. 如果所有定位服务都失败，返回 city="未知"，由 LLM 反问用户
