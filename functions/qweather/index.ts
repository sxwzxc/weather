const QWEATHER_CACHE_MINUTES = 10;

declare const weather: {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

function responseHeaders(extra: Record<string, string> = {}) {
  return {
    'content-type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    ...extra,
  };
}

function toNumber(value: any, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeHost(rawHost?: string): string {
  const trimmed = (rawHost || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
}

function buildAuthHeaders(env: any): HeadersInit | null {
  const jwt = (env.HFJWT || '').trim();
  if (jwt) {
    return {
      Authorization: jwt.startsWith('Bearer ') ? jwt : `Bearer ${jwt}`,
    };
  }

  const apiKey = (env.HFKEY || '').trim();
  if (apiKey) {
    return {
      'X-QW-Api-Key': apiKey,
    };
  }

  return null;
}

async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseQWeatherPayloadError(payload: any): string | null {
  if (!payload) return 'Invalid JSON response';

  if (payload.error?.title) {
    return `${payload.error.title}${payload.error.detail ? `: ${payload.error.detail}` : ''}`;
  }

  if (typeof payload.code === 'string' && payload.code !== '200') {
    return `QWeather API code ${payload.code}`;
  }

  return null;
}

function inferIsDay(nowWeather: any, todayDaily: any): number {
  const obsTime = typeof nowWeather?.obsTime === 'string' ? nowWeather.obsTime : '';
  const obsHM = obsTime.length >= 16 ? obsTime.slice(11, 16) : '';
  const sunrise = typeof todayDaily?.sunrise === 'string' ? todayDaily.sunrise : '';
  const sunset = typeof todayDaily?.sunset === 'string' ? todayDaily.sunset : '';

  if (obsHM && sunrise && sunset) {
    return obsHM >= sunrise && obsHM < sunset ? 1 : 0;
  }

  const iconCode = String(nowWeather?.icon || '');
  if (iconCode.startsWith('15')) return 0;
  return 1;
}

function pollutantValue(pollutants: any[], code: string): number {
  const item = pollutants.find((p) => p?.code === code);
  if (!item) return 0;

  if (item.concentration && item.concentration.value !== undefined) {
    return toNumber(item.concentration.value, 0);
  }

  return toNumber(item[code], 0);
}

function convertAirQuality(airPayload: any) {
  if (!airPayload) return null;

  // 兼容已弃用 v7 /v7/air/now 返回结构
  if (airPayload.now) {
    return {
      pm10: toNumber(airPayload.now.pm10, 0),
      pm2_5: toNumber(airPayload.now.pm2p5, 0),
      us_aqi: Math.round(toNumber(airPayload.now.aqi, 0)),
      no2: toNumber(airPayload.now.no2, 0),
      o3: toNumber(airPayload.now.o3, 0),
      co: toNumber(airPayload.now.co, 0),
      aqi_standard: 'v7',
    };
  }

  const indexes = Array.isArray(airPayload.indexes) ? airPayload.indexes : [];
  const pollutants = Array.isArray(airPayload.pollutants) ? airPayload.pollutants : [];

  if (indexes.length === 0 && pollutants.length === 0) {
    return null;
  }

  const preferredCodes = ['us-epa', 'cn-mee', 'cn-mee-1h', 'qaqi'];
  const preferredIndex = preferredCodes
    .map((code) => indexes.find((item: any) => item?.code === code))
    .find(Boolean);

  const index = preferredIndex || indexes[0];
  const pm2_5 = pollutantValue(pollutants, 'pm2p5');
  const pm10 = pollutantValue(pollutants, 'pm10');
  const no2 = pollutantValue(pollutants, 'no2');
  const o3 = pollutantValue(pollutants, 'o3');
  const co = pollutantValue(pollutants, 'co');

  const aqiValue = toNumber(index?.aqi, toNumber(index?.aqiDisplay, 0));

  return {
    pm10,
    pm2_5,
    us_aqi: Math.round(aqiValue),
    no2,
    o3,
    co,
    aqi_standard: index?.code || null,
  };
}

export async function onRequest({ request, env }: { request: Request; env: any }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  console.log(`[QWeather] request lat=${lat} lon=${lon} forceRefresh=${forceRefresh}`);
  console.log(`[QWeather] env keys available: ${Object.keys(env || {}).join(', ')}`);
  console.log(`[QWeather] HFHOST=${env?.HFHOST || '(未设置)'}`);
  console.log(`[QWeather] HFKEY=${env?.HFKEY ? env.HFKEY.slice(0, 6) + '...' : '(未设置)'}`);
  console.log(`[QWeather] HFJWT=${env?.HFJWT ? '已设置' : '(未设置)'}`);

  if (!lat || !lon) {
    console.error('[QWeather] missing lat/lon');
    return new Response(JSON.stringify({ error: 'Missing latitude or longitude' }), {
      status: 400,
      headers: responseHeaders(),
    });
  }

  const baseUrl = normalizeHost(env.HFHOST);
  console.log(`[QWeather] baseUrl=${baseUrl || '(空)'}`);
  if (!baseUrl) {
    console.error('[QWeather] HFHOST not configured');
    return new Response(
      JSON.stringify({
        error: 'QWeather API host not configured',
        message: '请配置环境变量 HFHOST（示例：abc123xyz.def.qweatherapi.com）',
      }),
      {
        status: 500,
        headers: responseHeaders(),
      }
    );
  }

  const authHeaders = buildAuthHeaders(env);
  console.log(`[QWeather] authHeaders=${authHeaders ? JSON.stringify(Object.keys(authHeaders)) : '(null)'}`);
  if (!authHeaders) {
    console.error('[QWeather] no auth credentials');
    return new Response(
      JSON.stringify({
        error: 'QWeather credentials not configured',
        message: '请配置 HFKEY（API Key）或 HFJWT（Bearer Token）',
      }),
      {
        status: 500,
        headers: responseHeaders(),
      }
    );
  }

  const cacheKey = `qweather_${lat}_${lon}`;

  if (!forceRefresh) {
    try {
      const cached = await weather.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(data.cached_at).getTime();
        const cacheAgeMinutes = Math.floor(cacheAge / 60000);
        console.log(`[QWeather] cache HIT age=${cacheAgeMinutes}min`);

        if (cacheAgeMinutes < QWEATHER_CACHE_MINUTES) {
          return new Response(cached, {
            headers: responseHeaders({
              'X-Cache': 'HIT',
              'X-Cache-Age': cacheAgeMinutes.toString(),
              'X-Data-Source': 'QWeather',
            }),
          });
        }
        console.log(`[QWeather] cache expired, refreshing`);
      } else {
        console.log(`[QWeather] cache MISS`);
      }
    } catch (e) {
      console.error('[QWeather] KV read error:', e);
    }
  }

  try {
    const fetchHeaders: HeadersInit = {
      ...authHeaders,
      Accept: 'application/json',
    };

    const location = `${lon},${lat}`;
    const weatherQuery = new URLSearchParams({
      location,
      lang: 'zh',
      unit: 'm',
    });

    const nowUrl = `${baseUrl}/v7/weather/now?${weatherQuery.toString()}`;
    const dailyUrl = `${baseUrl}/v7/weather/15d?${weatherQuery.toString()}`;
    const hourlyUrl = `${baseUrl}/v7/weather/168h?${weatherQuery.toString()}`;
    const airUrl = `${baseUrl}/airquality/v1/current/${lat}/${lon}?lang=zh`;

    console.log(`[QWeather] now URL: ${nowUrl}`);
    console.log(`[QWeather] daily URL: ${dailyUrl}`);
    console.log(`[QWeather] hourly URL: ${hourlyUrl}`);
    console.log(`[QWeather] air URL: ${airUrl}`);

    const [nowRes, dailyRes, hourlyRes, airRes] = await Promise.all([
      fetch(nowUrl, { headers: fetchHeaders }),
      fetch(dailyUrl, { headers: fetchHeaders }),
      fetch(hourlyUrl, { headers: fetchHeaders }),
      fetch(airUrl, { headers: fetchHeaders }),
    ]);

    console.log(`[QWeather] HTTP status: now=${nowRes.status} daily=${dailyRes.status} hourly=${hourlyRes.status} air=${airRes.status}`);

    const [nowData, dailyData, hourlyData] = await Promise.all([
      parseJsonSafe(nowRes),
      parseJsonSafe(dailyRes),
      parseJsonSafe(hourlyRes),
    ]);

    console.log(`[QWeather] nowData.code=${nowData?.code} dailyData.code=${dailyData?.code} hourlyData.code=${hourlyData?.code}`);
    if (nowData && nowData.code !== '200') {
      console.error(`[QWeather] nowData error: ${JSON.stringify(nowData).slice(0, 300)}`);
    }
    if (dailyData && dailyData.code !== '200') {
      console.error(`[QWeather] dailyData error: ${JSON.stringify(dailyData).slice(0, 300)}`);
    }
    if (hourlyData && hourlyData.code !== '200') {
      console.error(`[QWeather] hourlyData error: ${JSON.stringify(hourlyData).slice(0, 300)}`);
    }

    const weatherErrors: string[] = [];
    if (!nowRes.ok) weatherErrors.push(`实时天气 HTTP ${nowRes.status}`);
    if (!dailyRes.ok) weatherErrors.push(`每日预报 HTTP ${dailyRes.status}`);
    if (!hourlyRes.ok) weatherErrors.push(`逐小时预报 HTTP ${hourlyRes.status}`);

    const nowPayloadError = parseQWeatherPayloadError(nowData);
    const dailyPayloadError = parseQWeatherPayloadError(dailyData);
    const hourlyPayloadError = parseQWeatherPayloadError(hourlyData);
    if (nowPayloadError) weatherErrors.push(`实时天气错误: ${nowPayloadError}`);
    if (dailyPayloadError) weatherErrors.push(`每日预报错误: ${dailyPayloadError}`);
    if (hourlyPayloadError) weatherErrors.push(`逐小时预报错误: ${hourlyPayloadError}`);

    if (weatherErrors.length > 0) {
      console.error(`[QWeather] weather API errors: ${weatherErrors.join(' | ')}`);
      throw new Error(weatherErrors.join(' | '));
    }

    let airData: any = null;
    if (airRes.ok) {
      airData = await parseJsonSafe(airRes);
      console.log(`[QWeather] air data parsed OK`);
    } else {
      const airBody = await airRes.text().catch(() => '');
      console.warn(`[QWeather] air API failed: HTTP ${airRes.status}, body: ${airBody.slice(0, 200)}`);
    }

    const result = convertQWeatherToStandard(nowData, dailyData, hourlyData, airData, lat, lon);
    console.log(`[QWeather] converted OK, temp=${result.current?.temperature_2m}`);
    const resultStr = JSON.stringify(result);

    try {
      await weather.put(cacheKey, resultStr, { expirationTtl: QWEATHER_CACHE_MINUTES * 60 });
      console.log(`[QWeather] cached OK`);
    } catch (e) {
      console.error('[QWeather] KV write error:', e);
    }

    return new Response(resultStr, {
      headers: responseHeaders({
        'X-Cache': 'MISS',
        'X-Data-Source': 'QWeather',
      }),
    });
  } catch (error) {
    console.error('QWeather API error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch QWeather data',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: responseHeaders(),
      }
    );
  }
}

function convertQWeatherToStandard(now: any, daily: any, hourly: any, air: any, lat: string, lon: string) {
  const nowWeather = now?.now || {};
  const dailyForecast = Array.isArray(daily?.daily) ? daily.daily : [];
  const hourlyForecast = Array.isArray(hourly?.hourly) ? hourly.hourly : [];
  const todayDaily = dailyForecast[0] || {};

  const current = {
    temperature_2m: toNumber(nowWeather.temp, 0),
    relative_humidity_2m: toNumber(nowWeather.humidity, 0),
    apparent_temperature: toNumber(nowWeather.feelsLike, 0),
    is_day: inferIsDay(nowWeather, todayDaily),
    precipitation: toNumber(nowWeather.precip, 0),
    weather_code: convertQWeatherCode(nowWeather.icon),
    cloud_cover: toNumber(nowWeather.cloud, 0),
    pressure_msl: toNumber(nowWeather.pressure, 0),
    surface_pressure: toNumber(nowWeather.pressure, 0),
    wind_speed_10m: toNumber(nowWeather.windSpeed, 0),
    wind_direction_10m: toNumber(nowWeather.wind360, 0),
    visibility: toNumber(nowWeather.vis, 0) * 1000,
  };

  const hourlyData = {
    time: hourlyForecast.map((h: any) => h.fxTime),
    temperature_2m: hourlyForecast.map((h: any) => toNumber(h.temp, 0)),
    relative_humidity_2m: hourlyForecast.map((h: any) => toNumber(h.humidity, 0)),
    precipitation_probability: hourlyForecast.map((h: any) => toNumber(h.pop, 0)),
    precipitation: hourlyForecast.map((h: any) => toNumber(h.precip, 0)),
    weather_code: hourlyForecast.map((h: any) => convertQWeatherCode(h.icon)),
    visibility: hourlyForecast.map((h: any) => toNumber(h.vis, 10) * 1000),
    wind_speed_10m: hourlyForecast.map((h: any) => toNumber(h.windSpeed, 0)),
    uv_index: hourlyForecast.map((h: any) => toNumber(h.uvIndex, 0)),
  };

  const dailyData = {
    time: dailyForecast.map((d: any) => d.fxDate),
    weather_code: dailyForecast.map((d: any) => convertQWeatherCode(d.iconDay)),
    temperature_2m_max: dailyForecast.map((d: any) => toNumber(d.tempMax, 0)),
    temperature_2m_min: dailyForecast.map((d: any) => toNumber(d.tempMin, 0)),
    sunrise: dailyForecast.map((d: any) => `${d.fxDate}T${(d.sunrise || '06:00')}:00`),
    sunset: dailyForecast.map((d: any) => `${d.fxDate}T${(d.sunset || '18:00')}:00`),
    uv_index_max: dailyForecast.map((d: any) => toNumber(d.uvIndex, 0)),
    precipitation_sum: dailyForecast.map((d: any) => toNumber(d.precip, 0)),
    precipitation_probability_max: dailyForecast.map((d: any) => toNumber(d.pop, 0)),
    wind_speed_10m_max: dailyForecast.map((d: any) => toNumber(d.windSpeedDay, 0)),
  };

  return {
    current,
    hourly: hourlyData,
    daily: dailyData,
    air_quality: convertAirQuality(air),
    cached_at: new Date().toISOString(),
    location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
    data_source: 'QWeather',
    resolved_source: 'qweather',
  };
}

// 和风天气图标代码转换为 WMO 天气代码
function convertQWeatherCode(icon: string): number {
  const code = String(icon || '')
    .replace(/[dn]$/i, '')
    .replace(/[^0-9]/g, '');

  const codeMap: Record<string, number> = {
    '100': 0,
    '101': 1,
    '102': 2,
    '103': 3,
    '104': 3,
    '150': 0,
    '151': 1,
    '152': 2,
    '153': 3,
    '300': 80,
    '301': 80,
    '302': 95,
    '303': 96,
    '304': 99,
    '305': 61,
    '306': 63,
    '307': 65,
    '308': 65,
    '309': 61,
    '310': 65,
    '311': 65,
    '312': 65,
    '313': 66,
    '314': 61,
    '315': 63,
    '316': 65,
    '317': 65,
    '318': 65,
    '399': 61,
    '400': 85,
    '401': 85,
    '402': 75,
    '403': 75,
    '404': 61,
    '405': 61,
    '406': 85,
    '407': 85,
    '408': 71,
    '409': 73,
    '410': 75,
    '499': 71,
    '500': 45,
    '501': 45,
    '502': 45,
    '503': 45,
    '504': 45,
    '507': 45,
    '508': 45,
    '509': 45,
    '510': 45,
    '511': 45,
    '512': 45,
    '513': 45,
    '514': 45,
    '515': 45,
    '900': 0,
    '901': 0,
  };

  return codeMap[code] ?? 0;
}
