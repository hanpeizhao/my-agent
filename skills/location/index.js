// Location skill - 位置获取

export default {
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_current_location',
          description: '获取用户当前所在位置（城市、省份、国家、经纬度）。当用户未指定位置但请求需要位置时使用。',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      handler: async () => {
        console.log('[Location] Getting current location via IP...');

        const services = [
          {
            name: 'ipinfo.io',
            url: 'https://ipinfo.io/json',
            parse: (data) => ({
              ip: data.ip, city: data.city, province: data.region,
              country: data.country,
              lat: data.loc ? parseFloat(data.loc.split(',')[0]) : undefined,
              lon: data.loc ? parseFloat(data.loc.split(',')[1]) : undefined,
              isp: data.org, source: 'ipinfo.io'
            })
          },
          {
            name: 'ipapi.co',
            url: 'https://ipapi.co/json/',
            parse: (data) => ({
              ip: data.ip, city: data.city, province: data.region,
              country: data.country_name,
              lat: data.latitude, lon: data.longitude,
              isp: data.org, source: 'ipapi.co'
            })
          },
          {
            name: 'ipwhois.app',
            url: 'https://ipwhois.app/json/',
            parse: (data) => ({
              ip: data.ip, city: data.city, province: data.region,
              country: data.country,
              lat: data.latitude, lon: data.longitude,
              isp: data.isp, source: 'ipwhois.app'
            })
          }
        ];

        for (const service of services) {
          try {
            console.log(`[Location] Trying ${service.name}...`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(service.url, {
              signal: controller.signal,
              headers: { 'User-Agent': 'my-agent/1.0' }
            });
            clearTimeout(timeout);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const location = service.parse(data);

            if (location.city && location.city !== '') {
              console.log(`[Location] ✓ Got location via ${service.name}: ${location.city}`);
              return location;
            }
            console.log(`[Location] ${service.name} returned no city, trying next...`);
          } catch (error) {
            console.log(`[Location] ${service.name} failed: ${error.message}`);
          }
        }

        console.log('[Location] All services failed');
        return {
          city: '未知',
          note: '所有定位服务都失败了，请询问用户所在的城市名称',
          source: 'fallback'
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_city_by_ip',
          description: '根据指定 IP 地址查询对应的城市和位置信息',
          parameters: {
            type: 'object',
            properties: {
              ip: { type: 'string', description: '要查询的 IPv4 地址' }
            },
            required: ['ip']
          }
        }
      },
      handler: async (args) => {
        console.log(`[Location] Looking up city for IP: ${args.ip}`);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(`https://ipapi.co/${args.ip}/json/`, {
            signal: controller.signal
          });
          clearTimeout(timeout);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          return {
            ip: args.ip, city: data.city, province: data.region,
            country: data.country_name,
            lat: data.latitude, lon: data.longitude,
            isp: data.org, timezone: data.timezone, source: 'ipapi.co'
          };
        } catch (error) {
          return { ip: args.ip, error: `查询失败: ${error.message}` };
        }
      }
    }
  ]
};
