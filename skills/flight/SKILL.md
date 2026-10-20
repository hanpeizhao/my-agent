---
name: flight
description: 航班查询与预订
trigger: 用户询问机票、航班、订票、出行等问题
version: 1.0.0
---

# 航班查询与预订技能

本技能提供航班搜索、机票预订、订单查询能力。

## 可用工具

### search_flights

搜索指定日期和航线的可用航班。

参数:
- from (string, 必填): 出发城市
- to (string, 必填): 到达城市
- date (string, 必填): 出发日期，格式 YYYY-MM-DD

返回:
- flights: 航班数组，每个航班含 flightNo, airline, departure, arrival, price, available

### book_flight

预订指定航班。

参数:
- flightNo (string, 必填): 航班号
- passengerName (string, 必填): 乘客姓名

返回:
- success, orderNo, flightNo, passenger, status

### query_order

查询订单状态。

参数:
- orderNo (string, 必填): 订单号

返回:
- orderNo, status, flightInfo (含 flightNo, date, departure, arrival)

## 使用规则

1. 预订前必须先搜索航班
2. 订单查询需要有效的订单号
3. 如果用户未指定日期，追问具体日期
