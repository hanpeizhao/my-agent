// Flight skill - 航班查询与预订

export default {
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'search_flights',
          description: '搜索指定日期和航线的可用航班',
          parameters: {
            type: 'object',
            properties: {
              from: { type: 'string', description: '出发城市' },
              to: { type: 'string', description: '到达城市' },
              date: { type: 'string', description: '出发日期，格式 YYYY-MM-DD' }
            },
            required: ['from', 'to', 'date']
          }
        }
      },
      handler: async (args) => {
        console.log(`[Flight] Search: ${args.from} -> ${args.to} on ${args.date}`);
        await new Promise(r => setTimeout(r, 800));
        return {
          flights: [
            { flightNo: 'CA1234', airline: '国航', departure: '08:00', arrival: '10:30', price: 800, available: true },
            { flightNo: 'MU5678', airline: '东航', departure: '14:00', arrival: '16:30', price: 750, available: true },
            { flightNo: 'CZ3456', airline: '南航', departure: '19:00', arrival: '21:30', price: 680, available: false }
          ]
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'book_flight',
          description: '预订指定航班',
          parameters: {
            type: 'object',
            properties: {
              flightNo: { type: 'string', description: '航班号' },
              passengerName: { type: 'string', description: '乘客姓名' }
            },
            required: ['flightNo', 'passengerName']
          }
        }
      },
      handler: async (args) => {
        console.log(`[Flight] Book: ${args.flightNo} for ${args.passengerName}`);
        await new Promise(r => setTimeout(r, 1000));
        return {
          success: true,
          orderNo: 'ORD' + Date.now(),
          flightNo: args.flightNo,
          passenger: args.passengerName,
          status: '已确认'
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'query_order',
          description: '查询订单状态',
          parameters: {
            type: 'object',
            properties: {
              orderNo: { type: 'string', description: '订单号' }
            },
            required: ['orderNo']
          }
        }
      },
      handler: async (args) => {
        console.log(`[Flight] Query order: ${args.orderNo}`);
        await new Promise(r => setTimeout(r, 600));
        return {
          orderNo: args.orderNo,
          status: '已出票',
          flightInfo: { flightNo: 'CA1234', date: '2026-10-25', departure: '08:00', arrival: '10:30' }
        };
      }
    }
  ]
};
