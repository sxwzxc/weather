// OpenWeatherMap API 接口
// 使用 One Call API 3.0 获取完整天气数据
declare const weather: {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

export async function onRequest({ request, env }: { request: Request; env: any }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing latitude or longitude' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const owmKey = (env.OWMKey || env.OWM_KEY || '').trim();

  if (!owmKey) {
    return new Response(JSON.stringify({ 
      error: 'OpenWeatherMap API key not configured',
      message: '请配置环境变量：OWMKey 或 OWM_KEY'
    }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const cacheKey = `owm_${lat}_${lon}`;

  // 尝试从 KV 缓存读取
  if (!forceRefresh) {
    try {
      const cached = await weather.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(data.cached_at).getTime();
        const cacheAgeMinutes = Math.floor(cacheAge / 60000);
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
    const key = owmKey;

    // One Call API 3.0: 获取当前天气、小时预报、每日预报
    const oneCallUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=zh_cn&exclude=minutely,alerts`;
    
    // Air Pollution API
    const airUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${key}`;

    const [oneCallRes, airRes] = await Promise.all([
      fetch(oneCallUrl),
      fetch(airUrl),
    ]);

    if (!oneCallRes.ok) {
      const errText = await oneCallRes.text();
      throw new Error(`OWM One Call API error ${oneCallRes.status}: ${errText}`);
    }

    const [oneCallData, airData] = await Promise.all([
      oneCallRes.json(),
      airRes.json(),
    ]);

    // 转换为标准格式
    const result = convertOWMToStandard(oneCallData, airData, lat, lon);
    const resultStr = JSON.stringify(result);

    // 存入 KV 缓存
    try {
      await weather.put(cacheKey, resultStr, { expirationTtl: 900 });
    } catch (e) {
      console.error('KV write error:', e);
    }

    return new Response(resultStr, {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
        'X-Data-Source': 'OpenWeatherMap',
      },
    });
  } catch (error) {
    console.error('OWM API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch OpenWeatherMap data',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

// 将 OWM 数据转换为标准格式
function convertOWMToStandard(data: any, airData: any, lat: string, lon: string) {
  const cur = data.current;
  const hourlyList: any[] = data.hourly || [];
  const dailyList: any[] = data.daily || [];

  // 当前天气
  const current = {
    temperature_2m: cur.temp,
    relative_humidity_2m: cur.humidity,
    apparent_temperature: cur.feels_like,
    is_day: cur.dt >= cur.sunrise && cur.dt <= cur.sunset ? 1 : 0,
    precipitation: cur.rain?.['1h'] ?? cur.snow?.['1h'] ?? 0,
    weather_code: owmCodeToWMO(cur.weather?.[0]?.id || 800),
    cloud_cover: cur.clouds,
    pressure_msl: cur.pressure,
    surface_pressure: cur.pressure,
    wind_speed_10m: (cur.wind_speed * 3.6), // m/s → km/h
    wind_direction_10m: cur.wind_deg,
    visibility: cur.visibility,
    uv_index: cur.uvi,
    dew_point: cur.dew_point,
  };

  // 逐小时预报（取48小时）
  const hours = hourlyList.slice(0, 168); // 最多168小时=7天
  const hourly = {
    time: hours.map((h: any) => new Date(h.dt * 1000).toISOString()),
    temperature_2m: hours.map((h: any) => h.temp),
    relative_humidity_2m: hours.map((h: any) => h.humidity),
    precipitation_probability: hours.map((h: any) => Math.round((h.pop || 0) * 100)),
    precipitation: hours.map((h: any) => (h.rain?.['1h'] ?? h.snow?.['1h'] ?? 0)),
    weather_code: hours.map((h: any) => owmCodeToWMO(h.weather?.[0]?.id || 800)),
    visibility: hours.map((h: any) => h.visibility ?? 10000),
    wind_speed_10m: hours.map((h: any) => h.wind_speed * 3.6),
    uv_index: hours.map((h: any) => h.uvi ?? 0),
  };

  // 逐天预报（取16天）
  const days = dailyList.slice(0, 16);
  const daily = {
    time: days.map((d: any) => new Date(d.dt * 1000).toISOString().slice(0, 10)),
    weather_code: days.map((d: any) => owmCodeToWMO(d.weather?.[0]?.id || 800)),
    temperature_2m_max: days.map((d: any) => d.temp.max),
    temperature_2m_min: days.map((d: any) => d.temp.min),
    sunrise: days.map((d: any) => new Date(d.sunrise * 1000).toISOString()),
    sunset: days.map((d: any) => new Date(d.sunset * 1000).toISOString()),
    uv_index_max: days.map((d: any) => d.uvi ?? 0),
    precipitation_sum: days.map((d: any) => (d.rain ?? 0) + (d.snow ?? 0)),
    precipitation_probability_max: days.map((d: any) => Math.round((d.pop || 0) * 100)),
    wind_speed_10m_max: days.map((d: any) => d.wind_speed * 3.6),
  };

  // 空气质量
  const airCur = airData?.list?.[0]?.components;
  const owmAqi = airData?.list?.[0]?.main?.aqi; // 1-5
  const air_quality = airCur ? {
    pm2_5: airCur.pm2_5,
    pm10: airCur.pm10,
    us_aqi: owmAqiToUS(owmAqi, airCur.pm2_5),
    no2: airCur.no2,
    o3: airCur.o3,
    co: airCur.co,
  } : null;

  return {
    current,
    hourly,
    daily,
    air_quality,
    cached_at: new Date().toISOString(),
    location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
    data_source: 'OpenWeatherMap',
  };
}

// OWM AQI (1-5) 转换为近似 US AQI
function owmAqiToUS(owmAqi: number, pm25: number): number {
  if (pm25 !== undefined) {
    // 使用 PM2.5 计算 US AQI（更精确）
    if (pm25 <= 12) return Math.round((50 / 12) * pm25);
    if (pm25 <= 35.4) return Math.round(51 + (49 / 23.4) * (pm25 - 12.1));
    if (pm25 <= 55.4) return Math.round(101 + (49 / 19.9) * (pm25 - 35.5));
    if (pm25 <= 150.4) return Math.round(151 + (49 / 94.9) * (pm25 - 55.5));
    if (pm25 <= 250.4) return Math.round(201 + (99 / 99.9) * (pm25 - 150.5));
    return Math.round(301 + (199 / 149.9) * (pm25 - 250.5));
  }
  // 兜底：按 OWM 1-5 转换
  const map: Record<number, number> = { 1: 25, 2: 75, 3: 125, 4: 175, 5: 300 };
  return map[owmAqi] ?? 0;
}

// OpenWeatherMap 天气代码转 WMO 代码
function owmCodeToWMO(id: number): number {
  // Thunderstorm
  if (id >= 200 && id < 300) return id >= 210 && id < 220 ? 95 : 96;
  // Drizzle
  if (id >= 300 && id < 400) return 51;
  // Rain
  if (id === 500) return 61;
  if (id === 501) return 63;
  if (id >= 502 && id < 510) return 65;
  if (id === 511) return 66;
  if (id >= 520 && id < 530) return 80;
  // Snow
  if (id >= 600 && id < 610) return id === 600 ? 71 : id === 601 ? 73 : 75;
  if (id === 611 || id === 612 || id === 613) return 77;
  if (id === 615 || id === 616) return 61; // rain and snow
  if (id >= 620 && id < 630) return 85;
  // Atmosphere
  if (id >= 700 && id < 800) return 45; // fog/haze/etc
  // Clear
  if (id === 800) return 0;
  // Clouds
  if (id === 801) return 1;
  if (id === 802) return 2;
  if (id >= 803) return 3;
  return 0;
}
