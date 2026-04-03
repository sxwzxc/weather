// 和风天气 API 接口
interface QWeatherEnv {
  HFHOST: string;
  HFID: string;
  HFKEY: string;
}

export async function onRequest({ request, env }: { request: Request; env: any }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing latitude or longitude' }), {
      status: 400,
      headers: { 
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 检查环境变量
  if (!env.HFHOST || !env.HFID || !env.HFKEY) {
    return new Response(JSON.stringify({ 
      error: 'QWeather API credentials not configured',
      message: '请配置环境变量：HFHOST, HFID, HFKEY'
    }), {
      status: 500,
      headers: { 
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const cacheKey = `qweather_${lat}_${lon}`;
  
  // 尝试从 KV 缓存读取（15分钟缓存）
  if (!forceRefresh) {
    try {
      const cached = await weather.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(data.cached_at).getTime();
        const cacheAgeMinutes = Math.floor(cacheAge / 60000);
        
        // 缓存15分钟
        if (cacheAgeMinutes < 15) {
          return new Response(cached, {
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              'Access-Control-Allow-Origin': '*',
              'X-Cache': 'HIT',
              'X-Cache-Age': cacheAgeMinutes.toString(),
            },
          });
        }
      }
    } catch (e) {
      console.error('KV read error:', e);
    }
  }

  try {
    const location = `${lon},${lat}`;
    const baseUrl = env.HFHOST;
    const key = env.HFKEY;

    // 并行调用多个和风天气 API
    const [nowRes, dailyRes, hourlyRes, airRes] = await Promise.all([
      fetch(`${baseUrl}/v7/weather/now?location=${location}&key=${key}`),
      fetch(`${baseUrl}/v7/weather/15d?location=${location}&key=${key}`),
      fetch(`${baseUrl}/v7/weather/168h?location=${location}&key=${key}`),
      fetch(`${baseUrl}/v7/air/now?location=${location}&key=${key}`),
    ]);

    const [nowData, dailyData, hourlyDataRes, airData] = await Promise.all([
      nowRes.json(),
      dailyRes.json(),
      hourlyRes.json(),
      airRes.json(),
    ]);

    // 检查 API 响应状态
    if (nowData.code !== '200') {
      throw new Error(`QWeather API error: ${nowData.code}`);
    }

    // 转换为统一格式（兼容 Open-Meteo 格式）
    const result = convertQWeatherToStandard(nowData, dailyData, hourlyDataRes, airData, lat, lon);

    const resultStr = JSON.stringify(result);
    
    // 存入 KV 缓存
    try {
      await weather.put(cacheKey, resultStr, { expirationTtl: 900 }); // 15分钟过期
    } catch (e) {
      console.error('KV write error:', e);
    }

    return new Response(resultStr, {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
        'X-Data-Source': 'QWeather',
      },
    });
  } catch (error) {
    console.error('QWeather API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch QWeather data',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// 将和风天气数据转换为标准格式
function convertQWeatherToStandard(now: any, daily: any, hourly: any, air: any, lat: string, lon: string) {
  const nowWeather = now.now;
  const dailyForecast = daily.daily || [];
  const hourlyForecast = hourly.hourly || [];
  const airQuality = air.now;

  // 转换当前天气
  const current = {
    temperature_2m: parseFloat(nowWeather.temp),
    relative_humidity_2m: parseInt(nowWeather.humidity),
    apparent_temperature: parseFloat(nowWeather.feelsLike),
    is_day: nowWeather.icon.includes('d') ? 1 : 0,
    precipitation: parseFloat(nowWeather.precip || '0'),
    weather_code: convertQWeatherCode(nowWeather.icon),
    cloud_cover: parseInt(nowWeather.cloud || '0'),
    pressure_msl: parseFloat(nowWeather.pressure),
    surface_pressure: parseFloat(nowWeather.pressure),
    wind_speed_10m: parseFloat(nowWeather.windSpeed),
    wind_direction_10m: parseFloat(nowWeather.wind360),
  };

  // 转换逐小时预报
  const hourlyData = {
    time: hourlyForecast.map((h: any) => h.fxTime),
    temperature_2m: hourlyForecast.map((h: any) => parseFloat(h.temp)),
    relative_humidity_2m: hourlyForecast.map((h: any) => parseInt(h.humidity)),
    precipitation_probability: hourlyForecast.map((h: any) => parseInt(h.pop || '0')),
    precipitation: hourlyForecast.map((h: any) => parseFloat(h.precip || '0')),
    weather_code: hourlyForecast.map((h: any) => convertQWeatherCode(h.icon)),
    visibility: hourlyForecast.map((h: any) => parseFloat(h.vis || '10') * 1000), // km转m
    wind_speed_10m: hourlyForecast.map((h: any) => parseFloat(h.windSpeed)),
    uv_index: hourlyForecast.map(() => 0), // 和风天气逐小时无UV数据
  };

  // 转换逐天预报
  const dailyData = {
    time: dailyForecast.map((d: any) => d.fxDate),
    weather_code: dailyForecast.map((d: any) => convertQWeatherCode(d.iconDay)),
    temperature_2m_max: dailyForecast.map((d: any) => parseFloat(d.tempMax)),
    temperature_2m_min: dailyForecast.map((d: any) => parseFloat(d.tempMin)),
    sunrise: dailyForecast.map((d: any) => `${d.fxDate}T${d.sunrise}:00`),
    sunset: dailyForecast.map((d: any) => `${d.fxDate}T${d.sunset}:00`),
    uv_index_max: dailyForecast.map((d: any) => parseInt(d.uvIndex || '0')),
    precipitation_sum: dailyForecast.map((d: any) => parseFloat(d.precip || '0')),
    precipitation_probability_max: dailyForecast.map((d: any) => parseInt(d.pop || '0')),
    wind_speed_10m_max: dailyForecast.map((d: any) => parseFloat(d.windSpeedDay)),
  };

  // 转换空气质量
  const airQualityData = airQuality ? {
    pm10: parseFloat(airQuality.pm10 || '0'),
    pm2_5: parseFloat(airQuality.pm2p5 || '0'),
    us_aqi: parseInt(airQuality.aqi || '0'),
  } : null;

  return {
    current,
    hourly: hourlyData,
    daily: dailyData,
    air_quality: airQualityData,
    cached_at: new Date().toISOString(),
    location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
    data_source: 'QWeather',
  };
}

// 和风天气图标代码转换为 WMO 天气代码
function convertQWeatherCode(icon: string): number {
  const code = icon.replace(/[dn]$/, ''); // 移除昼夜标识
  
  const codeMap: Record<string, number> = {
    '100': 0,   // 晴
    '101': 1,   // 多云
    '102': 2,   // 少云
    '103': 3,   // 晴间多云
    '104': 3,   // 阴
    '150': 0,   // 晴（夜间）
    '151': 1,   // 多云（夜间）
    '300': 80,  // 阵雨
    '301': 80,  // 强阵雨
    '302': 95,  // 雷阵雨
    '303': 96,  // 强雷阵雨
    '304': 99,  // 雷阵雨伴有冰雹
    '305': 61,  // 小雨
    '306': 63,  // 中雨
    '307': 65,  // 大雨
    '308': 65,  // 极端降雨
    '309': 61,  // 毛毛雨
    '310': 65,  // 暴雨
    '311': 65,  // 大暴雨
    '312': 65,  // 特大暴雨
    '313': 66,  // 冻雨
    '314': 61,  // 小到中雨
    '315': 63,  // 中到大雨
    '316': 65,  // 大到暴雨
    '317': 65,  // 暴雨到大暴雨
    '318': 65,  // 大暴雨到特大暴雨
    '399': 61,  // 雨
    '400': 85,  // 小雪
    '401': 85,  // 中雪
    '402': 75,  // 大雪
    '403': 75,  // 暴雪
    '404': 61,  // 雨夹雪
    '405': 61,  // 雨雪天气
    '406': 85,  // 阵雨夹雪
    '407': 85,  // 阵雪
    '408': 71,  // 小到中雪
    '409': 73,  // 中到大雪
    '410': 75,  // 大到暴雪
    '499': 71,  // 雪
    '500': 45,  // 薄雾
    '501': 45,  // 雾
    '502': 45,  // 霾
    '503': 45,  // 扬沙
    '504': 45,  // 浮尘
    '507': 45,  // 沙尘暴
    '508': 45,  // 强沙尘暴
    '509': 45,  // 浓雾
    '510': 45,  // 强浓雾
    '511': 45,  // 中度霾
    '512': 45,  // 重度霾
    '513': 45,  // 严重霾
    '514': 45,  // 大雾
    '515': 45,  // 特强浓雾
    '900': 0,   // 热
    '901': 0,   // 冷
  };

  return codeMap[code] || 0;
}
