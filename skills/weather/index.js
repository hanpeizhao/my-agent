// Weather skill - 天气查询
// 工具实现（SKILL.md 描述工具，这里只放 handler）

export default {
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_weather',
          description: '查询指定城市的当前天气情况',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: '城市名称，如"北京"' }
            },
            required: ['city']
          }
        }
      },
      handler: async (args) => {
        console.log(`[Weather] Querying: ${args.city}`);

        // ⚠️ 警告：这是演示用的模拟数据，不是真实天气！
        const mockData = {
          '北京': { temperature: 22, humidity: 45, condition: '晴', wind: '北风3级', source: 'MOCK_DATA' },
          '上海': { temperature: 26, humidity: 70, condition: '多云', wind: '东南风2级', source: 'MOCK_DATA' },
          '广州': { temperature: 28, humidity: 80, condition: '阵雨', wind: '南风2级', source: 'MOCK_DATA' },
          '深圳': { temperature: 30, humidity: 75, condition: '多云', wind: '东南风3级', source: 'MOCK_DATA' },
          'Singapore': { temperature: 31, humidity: 75, condition: 'Partly Cloudy', wind: 'SW 15km/h', source: 'MOCK_DATA' }
        };

        await new Promise(r => setTimeout(r, 500));
        const result = mockData[args.city] || {
          city: args.city,
          temperature: 25,
          humidity: 60,
          condition: '晴',
          wind: '微风',
          source: 'MOCK_DATA_DEFAULT'  // ← 标记为默认假数据
        };

        return {
          ...result,
          disclaimer: '⚠️ 这是演示数据，非真实天气。如需真实天气，请使用 web_search 搜索。'
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_forecast',
          description: '查询指定城市未来N天的天气预报',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: '城市名称' },
              days: { type: 'number', description: '预报天数，1-7', minimum: 1, maximum: 7 }
            },
            required: ['city', 'days']
          }
        }
      },
      handler: async (args) => {
        console.log(`[Weather] Forecast: ${args.city} for ${args.days} days`);
        await new Promise(r => setTimeout(r, 500));

        const conditions = ['晴', '多云', '阴', '小雨', '中雨', '雷阵雨'];
        const forecast = [];
        for (let i = 1; i <= args.days; i++) {
          forecast.push({
            date: `第${i}天`,
            high: Math.floor(Math.random() * 10) + 20,
            low: Math.floor(Math.random() * 10) + 10,
            condition: conditions[Math.floor(Math.random() * conditions.length)]
          });
        }
        return { city: args.city, forecast };
      }
    }
  ]
};
