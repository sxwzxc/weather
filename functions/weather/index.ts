interface EORequest extends Request {
  eo: {
    geo: {
      latitude: number;
      longitude: number;
      cityName: string;
    };
  };
}

declare const weather: {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

type WeatherProvider = 'openmeteo' | 'qweather' | 'owm' | 'nws' | 'wttrin';

// 无需 API Key 的免费源优先，再是需要 Key 的源
const PROVIDER_PRIORITY: WeatherProvider[] = ['openmeteo', 'wttrin', 'nws', 'qweather', 'owm'];

function responseHeaders(extra: Record<string, string> = {}) {
  return {
    'content-type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    ...extra,
  };
}

function parseProvider(raw: string | null): WeatherProvider | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();

  if (value === 'openmeteo' || value === 'open-meteo') return 'openmeteo';
  if (value === 'qweather') return 'qweather';
  if (value === 'owm' || value === 'openweathermap') return 'owm';
  if (value === 'nws' || value === 'weathergov' || value === 'weather.gov') return 'nws';
  if (value === 'wttrin' || value === 'wttr' || value === 'wttr.in') return 'wttrin';
  return undefined;
}

/**
 * 检查某 provider 是否确实可用（环境变量已配置）
 * 对于不需要 API Key 的源（openmeteo/wttrin/nws），始终返回 true
 */
function isProviderConfigurable(provider: WeatherProvider, env: any): boolean {
  if (provider === 'openmeteo' || provider === 'nws' || provider === 'wttrin') {
    return true; // 免费无需配置
  }
  if (provider === 'qweather') {
    const host = (env?.HFHOST || '').trim();
    const jwt = (env?.HFJWT || '').trim();
    const key = (env?.HFKEY || '').trim();
    return !!(host && (jwt || key));
  }
  if (provider === 'owm') {
    const owmKey = (env?.OWMKey || env?.OWM_KEY || '').trim();
    return !!owmKey;
  }
  return false;
}

function buildProviderQueue(requested: WeatherProvider | undefined, fallbackEnabled: boolean, env: any): WeatherProvider[] {
  if (!requested) {
    // 自动模式：优先免费源，再需要 Key 的源（仅已配置的）
    return PROVIDER_PRIORITY.filter(p => isProviderConfigurable(p, env));
  }
  if (!fallbackEnabled) return [requested];
  // 指定源排第一，其余按优先级（仅已配置的）
  const rest = PROVIDER_PRIORITY.filter(p => p !== requested && isProviderConfigurable(p, env));
  return [requested, ...rest];
}

function providerLabel(provider: WeatherProvider): string {
  const labels: Record<WeatherProvider, string> = {
    qweather: 'QWeather',
    owm: 'OpenWeatherMap',
    openmeteo: 'Open-Meteo',
    nws: 'NWS (美国)',
    wttrin: 'wttr.in',
  };
  return labels[provider] || provider;
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchOpenMeteoData(lat: string, lon: string, forceRefresh: boolean) {
  const cacheKey = `weather_openmeteo_${lat}_${lon}`;
  console.log(`[OpenMeteo] start lat=${lat} lon=${lon} forceRefresh=${forceRefresh}`);

  if (!forceRefresh) {
    try {
      const cached = await weather.get(cacheKey);
      if (cached) {
        const payload = JSON.parse(cached);
        const ageMin = Math.floor((Date.now() - new Date(payload.cached_at).getTime()) / 60000);
        console.log(`[OpenMeteo] cache HIT age=${ageMin}min`);
        return { ok: true, payload, fromCache: true, cacheAgeMinutes: ageMin };
      } else {
        console.log(`[OpenMeteo] cache MISS`);
      }
    } catch (e) {
      console.error('[OpenMeteo] KV read error:', e);
    }
  }

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,dew_point_2m,uv_index&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,visibility,wind_speed_10m,uv_index,dew_point_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=16`;
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,us_aqi,european_aqi,nitrogen_dioxide,ozone,carbon_monoxide&timezone=auto`;

    console.log(`[OpenMeteo] fetching weather: ${weatherUrl.slice(0, 80)}...`);
    const [weatherRes, airRes] = await Promise.all([fetch(weatherUrl), fetch(airQualityUrl)]);
    console.log(`[OpenMeteo] weather HTTP ${weatherRes.status}, air HTTP ${airRes.status}`);

    if (!weatherRes.ok) {
      const errBody = await weatherRes.text().catch(() => '');
      console.error(`[OpenMeteo] weather API error ${weatherRes.status}: ${errBody.slice(0, 200)}`);
      return { ok: false, error: `Open-Meteo weather HTTP ${weatherRes.status}` };
    }

    const weatherData = await parseJsonSafe(weatherRes);
    const airData = airRes.ok ? await parseJsonSafe(airRes) : null;

    if (!weatherData || weatherData.error) {
      console.error('[OpenMeteo] invalid payload:', JSON.stringify(weatherData).slice(0, 200));
      return { ok: false, error: weatherData?.error || 'Open-Meteo weather payload invalid' };
    }

    const payload = {
      ...weatherData,
      air_quality: airData?.current || null,
      cached_at: new Date().toISOString(),
      location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
      data_source: 'Open-Meteo',
      resolved_source: 'openmeteo',
    };

    try {
      await weather.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 * 60 });
      console.log(`[OpenMeteo] cached OK`);
    } catch (e) {
      console.error('[OpenMeteo] KV write error:', e);
    }

    console.log(`[OpenMeteo] success temp=${payload.current?.temperature_2m}`);
    return { ok: true, payload, fromCache: false, cacheAgeMinutes: 0 };
  } catch (error) {
    console.error('[OpenMeteo] fetch exception:', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchWttrInData(lat: string, lon: string, forceRefresh: boolean) {
  const cacheKey = `weather_wttrin_${lat}_${lon}`;
  console.log(`[wttr.in] start lat=${lat} lon=${lon}`);

  if (!forceRefresh) {
    try {
      const cached = await weather.get(cacheKey);
      if (cached) {
        const payload = JSON.parse(cached);
        const ageMin = Math.floor((Date.now() - new Date(payload.cached_at).getTime()) / 60000);
        console.log(`[wttr.in] cache HIT age=${ageMin}min`);
        return { ok: true, payload, fromCache: true, cacheAgeMinutes: ageMin };
      }
    } catch (e) { /* ignore */ }
  }

  try {
    // wttr.in 免费 JSON API
    const url = `https://wttr.in/${lat},${lon}?format=j1&lang=zh`;
    console.log(`[wttr.in] fetching: ${url}`);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'curl/8.0' }, // wttr.in 需要 UA
    });
    console.log(`[wttr.in] HTTP ${res.status}`);

    if (!res.ok) {
      return { ok: false, error: `wttr.in HTTP ${res.status}` };
    }

    const data = await parseJsonSafe(res);
    if (!data?.current_condition?.[0]) {
      return { ok: false, error: 'wttr.in data invalid' };
    }

    const cur = data.current_condition[0];
    const weatherDays = data.weather || [];

    // 当前天气
    const current = {
      temperature_2m: parseFloat(cur.temp_C),
      relative_humidity_2m: parseFloat(cur.humidity),
      apparent_temperature: parseFloat(cur.FeelsLikeC),
      is_day: parseInt(cur.uvIndex) > 0 ? 1 : 0,
      precipitation: parseFloat(cur.precipMM || '0'),
      weather_code: wttrCodeToWMO(parseInt(cur.weatherCode || '0')),
      cloud_cover: parseFloat(cur.cloudcover || '0'),
      pressure_msl: parseFloat(cur.pressure || '1013'),
      surface_pressure: parseFloat(cur.pressure || '1013'),
      wind_speed_10m: parseFloat(cur.windspeedKmph || '0'),
      wind_direction_10m: parseFloat(cur.winddirDegree || '0'),
      visibility: parseFloat(cur.visibility || '10') * 1000,
      uv_index: parseFloat(cur.uvIndex || '0'),
      dew_point: parseFloat(cur.DewPointC || cur.temp_C), // wttr.in 提供 DewPointC
    };

    // 逐小时预报（wttr.in 提供 3 小时间隔）
    const hourlyAll = weatherDays.flatMap((day: any) => day.hourly || []);
    const hours = hourlyAll.slice(0, 168);
    const hourly = {
      time: hours.map((h: any) => {
        const t = parseInt(h.time || '0');
        return new Date((t + new Date().getTimezoneOffset() * 60) * 1000).toISOString();
      }),
      temperature_2m: hours.map((h: any) => parseFloat(h.tempC || '0')),
      relative_humidity_2m: hours.map((h: any) => parseFloat(h.humidity || '0')),
      precipitation_probability: hours.map((h: any) => parseFloat(h.chanceofrain || '0')),
      precipitation: hours.map((h: any) => parseFloat(h.precipMM || '0')),
      weather_code: hours.map((h: any) => wttrCodeToWMO(parseInt(h.weatherCode || '0'))),
      visibility: hours.map((h: any) => parseFloat(h.visibility || '10') * 1000),
      wind_speed_10m: hours.map((h: any) => parseFloat(h.windspeedKmph || '0')),
      uv_index: hours.map((h: any) => parseFloat(h.uvIndex || '0')),
    };

    // 逐天预报
    const daily = {
      time: weatherDays.map((d: any) => d.date),
      weather_code: weatherDays.map((d: any) => wttrCodeToWMO(parseInt(d.hourly?.[4]?.weatherCode || '0'))),
      temperature_2m_max: weatherDays.map((d: any) => parseFloat(d.maxtempC || '0')),
      temperature_2m_min: weatherDays.map((d: any) => parseFloat(d.mintempC || '0')),
      sunrise: weatherDays.map((d: any) => {
        const rise = d.astronomy?.[0]?.sunrise || '06:00 AM';
        return `${d.date}T${convert12to24(rise)}`;
      }),
      sunset: weatherDays.map((d: any) => {
        const set = d.astronomy?.[0]?.sunset || '06:00 PM';
        return `${d.date}T${convert12to24(set)}`;
      }),
      uv_index_max: weatherDays.map((d: any) => parseFloat(d.uvIndex || '0')),
      precipitation_sum: weatherDays.map((d: any) => {
        const hourly = d.hourly || [];
        return hourly.reduce((sum: number, h: any) => sum + parseFloat(h.precipMM || '0'), 0);
      }),
      precipitation_probability_max: weatherDays.map((d: any) => {
        const hourly = d.hourly || [];
        return Math.max(...hourly.map((h: any) => parseFloat(h.chanceofrain || '0')), 0);
      }),
      wind_speed_10m_max: weatherDays.map((d: any) => {
        const hourly = d.hourly || [];
        return Math.max(...hourly.map((h: any) => parseFloat(h.windspeedKmph || '0')), 0);
      }),
    };

    const payload = {
      current,
      hourly,
      daily,
      air_quality: null, // wttr.in 不提供空气质量
      cached_at: new Date().toISOString(),
      location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
      data_source: 'wttr.in',
      resolved_source: 'wttrin',
    };

    try {
      await weather.put(cacheKey, JSON.stringify(payload), { expirationTtl: 30 * 60 });
    } catch (e) { /* ignore */ }

    console.log(`[wttr.in] success temp=${current.temperature_2m}`);
    return { ok: true, payload, fromCache: false, cacheAgeMinutes: 0 };
  } catch (error) {
    console.error('[wttr.in] fetch exception:', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchNWSData(lat: string, lon: string, forceRefresh: boolean) {
  const cacheKey = `weather_nws_${lat}_${lon}`;
  console.log(`[NWS] start lat=${lat} lon=${lon}`);

  if (!forceRefresh) {
    try {
      const cached = await weather.get(cacheKey);
      if (cached) {
        const payload = JSON.parse(cached);
        const ageMin = Math.floor((Date.now() - new Date(payload.cached_at).getTime()) / 60000);
        console.log(`[NWS] cache HIT age=${ageMin}min`);
        return { ok: true, payload, fromCache: true, cacheAgeMinutes: ageMin };
      }
    } catch (e) { /* ignore */ }
  }

  try {
    // NWS API 需要正确的 User-Agent
    const headers: HeadersInit = {
      'User-Agent': '(weather-app, contact@example.com)',
      'Accept': 'application/geo+json',
    };

    // 第一步：通过坐标获取网格点
    const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
    console.log(`[NWS] fetching points: ${pointsUrl}`);
    const pointsRes = await fetch(pointsUrl, { headers });

    if (!pointsRes.ok && pointsRes.status === 404) {
      return { ok: false, error: 'NWS only supports US locations' };
    }
    if (!pointsRes.ok) {
      return { ok: false, error: `NWS points HTTP ${pointsRes.status}` };
    }

    const pointsData = await parseJsonSafe(pointsRes);
    const forecastUrl = pointsData?.properties?.forecast;
    const hourlyUrl = pointsData?.properties?.forecastHourly;
    const gridId = pointsData?.properties?.gridId;
    const gridX = pointsData?.properties?.gridX;
    const gridY = pointsData?.properties?.gridY;

    if (!forecastUrl || !hourlyUrl) {
      return { ok: false, error: 'NWS forecast URL not found for this location' };
    }

    console.log(`[NWS] forecastUrl=${forecastUrl}`);

    // 第二步：获取预报
    const [forecastRes, hourlyRes] = await Promise.all([
      fetch(forecastUrl, { headers }),
      fetch(hourlyUrl, { headers }),
    ]);

    console.log(`[NWS] forecast HTTP ${forecastRes.status}, hourly HTTP ${hourlyRes.status}`);

    if (!forecastRes.ok) {
      return { ok: false, error: `NWS forecast HTTP ${forecastRes.status}` };
    }
    if (!hourlyRes.ok) {
      return { ok: false, error: `NWS hourly HTTP ${hourlyRes.status}` };
    }

    const forecastData = await parseJsonSafe(forecastRes);
    const hourlyData = await parseJsonSafe(hourlyRes);

    const periods = forecastData?.properties?.periods || [];
    const hourlyPeriods = hourlyData?.properties?.periods || [];

    // 当前天气 = 第一个 hourly period
    const nowPeriod = hourlyPeriods[0] || periods[0];
    const current = {
      temperature_2m: nowPeriod?.temperature || 0,
      relative_humidity_2m: nowPeriod?.relativeHumidity?.value || 50,
      apparent_temperature: nowPeriod?.temperature || 0, // NWS 不直接提供体感
      is_day: (nowPeriod?.isDaytime !== undefined) ? (nowPeriod.isDaytime ? 1 : 0) : 1,
      precipitation: 0,
      weather_code: nwsShortToWMO(nowPeriod?.shortForecast || ''),
      cloud_cover: 0,
      pressure_msl: 1013,
      surface_pressure: 1013,
      wind_speed_10m: nwsWindSpeed(nowPeriod?.windSpeed || ''),
      wind_direction_10m: nwsWindDir(nowPeriod?.windDirection || ''),
      visibility: 10000,
      uv_index: 0,
      dew_point: nowPeriod?.dewpoint?.value || 0,
    };

    // 逐小时
    const hours = hourlyPeriods.slice(0, 156);
    const hourly = {
      time: hours.map((p: any) => p.startTime),
      temperature_2m: hours.map((p: any) => p.temperature || 0),
      relative_humidity_2m: hours.map((p: any) => p.relativeHumidity?.value || 50),
      precipitation_probability: hours.map((p: any) => p.probabilityOfPrecipitation?.value || 0),
      precipitation: hours.map(() => 0),
      weather_code: hours.map((p: any) => nwsShortToWMO(p.shortForecast || '')),
      visibility: hours.map(() => 10000),
      wind_speed_10m: hours.map((p: any) => nwsWindSpeed(p.windSpeed || '')),
      uv_index: hours.map(() => 0),
    };

    // 逐天预报（periods 按白天/夜晚交替，合并为每天）
    const dayPeriods: any[] = [];
    const nightPeriods: any[] = [];
    for (const p of periods) {
      if (p.isDaytime) dayPeriods.push(p);
      else nightPeriods.push(p);
    }
    const dailyCount = Math.min(dayPeriods.length, 14);

    const daily = {
      time: dayPeriods.slice(0, dailyCount).map((p: any) => p.startTime?.slice(0, 10) || ''),
      weather_code: dayPeriods.slice(0, dailyCount).map((p: any) => nwsShortToWMO(p.shortForecast || '')),
      temperature_2m_max: dayPeriods.slice(0, dailyCount).map((p: any) => p.temperature || 0),
      temperature_2m_min: nightPeriods.slice(0, dailyCount).map((p: any) => p.temperature || 0),
      sunrise: dayPeriods.slice(0, dailyCount).map(() => ''),
      sunset: nightPeriods.slice(0, dailyCount).map(() => ''),
      uv_index_max: dayPeriods.slice(0, dailyCount).map(() => 0),
      precipitation_sum: dayPeriods.slice(0, dailyCount).map(() => 0),
      precipitation_probability_max: dayPeriods.slice(0, dailyCount).map((p: any) => p.probabilityOfPrecipitation?.value || 0),
      wind_speed_10m_max: dayPeriods.slice(0, dailyCount).map((p: any) => nwsWindSpeed(p.windSpeed || '')),
    };

    const payload = {
      current,
      hourly,
      daily,
      air_quality: null,
      cached_at: new Date().toISOString(),
      location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
      data_source: 'NWS (NOAA)',
      resolved_source: 'nws',
    };

    try {
      await weather.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 * 60 });
    } catch (e) { /* ignore */ }

    console.log(`[NWS] success temp=${current.temperature_2m}`);
    return { ok: true, payload, fromCache: false, cacheAgeMinutes: 0 };
  } catch (error) {
    console.error('[NWS] fetch exception:', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchProviderEndpoint(request: Request, provider: 'qweather' | 'owm', lat: string, lon: string, forceRefresh: boolean) {
  const requestUrl = new URL(request.url);
  const endpoint = provider === 'qweather' ? '/qweather' : '/owm';
  const params = new URLSearchParams({ lat, lon });
  if (forceRefresh) params.set('refresh', 'true');

  const targetUrl = `${requestUrl.origin}${endpoint}?${params.toString()}`;
  console.log(`[Gateway] calling provider=${provider} url=${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      headers: { 'X-Weather-Gateway': '1' },
    });

    console.log(`[Gateway] provider=${provider} HTTP ${response.status}`);
    const payload = await parseJsonSafe(response);

    if (!response.ok) {
      const errMsg = payload?.error || payload?.details || `Provider ${provider} HTTP ${response.status}`;
      console.error(`[Gateway] provider=${provider} error: ${errMsg}`);
      return { ok: false, error: errMsg };
    }

    if (!payload || payload.error) {
      const errMsg = payload?.error || `Provider ${provider} payload invalid`;
      console.error(`[Gateway] provider=${provider} invalid payload: ${JSON.stringify(payload).slice(0, 300)}`);
      return { ok: false, error: errMsg };
    }

    console.log(`[Gateway] provider=${provider} success data_source=${payload.data_source}`);
    return {
      ok: true,
      payload,
      fromCache: response.headers.get('X-Cache') === 'HIT',
      cacheAgeMinutes: Number.parseInt(response.headers.get('X-Cache-Age') || '0', 10) || 0,
    };
  } catch (error) {
    console.error(`[Gateway] provider=${provider} exception:`, error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function onRequest({ request, env }: { request: EORequest; env?: any }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat') || request.eo?.geo?.latitude?.toString();
  const lon = url.searchParams.get('lon') || request.eo?.geo?.longitude?.toString();
  const forceRefresh = url.searchParams.get('refresh') === 'true';
  const requestedProvider = parseProvider(url.searchParams.get('source') || url.searchParams.get('provider'));
  const fallbackEnabled = url.searchParams.get('fallback') !== 'false';
  const providerQueue = buildProviderQueue(requestedProvider, fallbackEnabled, env);

  console.log(`[Weather] request lat=${lat} lon=${lon} source=${requestedProvider || 'auto'} fallback=${fallbackEnabled} queue=${providerQueue.join(',')}`);

  if (!lat || !lon) {
    console.error('[Weather] missing lat/lon');
    return new Response(JSON.stringify({ error: 'Missing latitude or longitude' }), {
      status: 400,
      headers: responseHeaders(),
    });
  }

  const sourceErrors: Array<{ provider: string; message: string }> = [];

  for (const provider of providerQueue) {
    console.log(`[Weather] trying provider=${provider}`);
    let result: { ok: boolean; payload?: any; fromCache?: boolean; cacheAgeMinutes?: number; error?: string };

    if (provider === 'openmeteo') {
      result = await fetchOpenMeteoData(lat, lon, forceRefresh);
    } else if (provider === 'wttrin') {
      result = await fetchWttrInData(lat, lon, forceRefresh);
    } else if (provider === 'nws') {
      result = await fetchNWSData(lat, lon, forceRefresh);
    } else {
      result = await fetchProviderEndpoint(request, provider as 'qweather' | 'owm', lat, lon, forceRefresh);
    }

    if (result.ok && result.payload) {
      const payload: any = {
        ...result.payload,
        requested_source: requestedProvider || 'openmeteo',
      };

      const resolvedProvider = parseProvider(payload.resolved_source) || provider;
      payload.resolved_source = resolvedProvider;
      payload.fallback_used = requestedProvider ? resolvedProvider !== requestedProvider : false;

      if (!payload.data_source) {
        payload.data_source = providerLabel(resolvedProvider);
      }

      console.log(`[Weather] success provider=${resolvedProvider} fallback_used=${payload.fallback_used}`);
      return new Response(JSON.stringify(payload), {
        headers: responseHeaders({
          'X-Data-Source': payload.data_source,
          'X-Resolved-Source': resolvedProvider,
          'X-Fallback-Used': String(payload.fallback_used),
          'X-Provider-Queue': providerQueue.join(','),
          'X-Cache': result.fromCache ? 'HIT' : 'MISS',
          'X-Cache-Age': String(result.cacheAgeMinutes || 0),
        }),
      });
    }

    console.error(`[Weather] provider=${provider} failed: ${result.error}`);
    sourceErrors.push({ provider, message: result.error || 'Unknown provider error' });
  }

  console.error(`[Weather] ALL providers failed:`, JSON.stringify(sourceErrors));
  return new Response(
    JSON.stringify({
      error: 'Failed to fetch weather data from all providers',
      source_errors: sourceErrors,
    }),
    {
      status: 502,
      headers: responseHeaders(),
    }
  );
}

// ---- 辅助函数 ----

function wttrCodeToWMO(code: number): number {
  const map: Record<number, number> = {
    113: 0, 116: 1, 119: 2, 122: 3,
    143: 45, 248: 45, 260: 45,
    176: 51, 263: 56, 266: 57,
    179: 71, 227: 73, 230: 75, 323: 85, 326: 86,
    293: 61, 296: 61, 299: 63, 302: 65, 305: 65, 308: 65,
    311: 66, 314: 67, 317: 67,
    350: 80, 353: 81, 356: 82, 359: 82, 362: 82, 365: 82,
    200: 95, 386: 96, 389: 99, 392: 96, 395: 99,
  };
  return map[code] ?? 0;
}

function nwsShortToWMO(forecast: string): number {
  const f = forecast.toLowerCase();
  if (f.includes('sunny') || f.includes('clear')) return f.includes('night') ? 0 : 0;
  if (f.includes('mostly sunny') || f.includes('mostly clear')) return 1;
  if (f.includes('partly cloudy') || f.includes('partly sunny')) return 2;
  if (f.includes('cloudy') || f.includes('overcast')) return 3;
  if (f.includes('fog') || f.includes('haze') || f.includes('mist')) return 45;
  if (f.includes('drizzle') || f.includes('sprinkle')) return 51;
  if ((f.includes('rain') && f.includes('light')) || f.includes('showers')) return 61;
  if (f.includes('rain') && !f.includes('snow') && !f.includes('freeze')) return 63;
  if (f.includes('heavy rain')) return 65;
  if (f.includes('sleet') || f.includes('freezing rain')) return 66;
  if (f.includes('snow') && f.includes('light') || f.includes('flurries')) return 71;
  if (f.includes('snow') || f.includes('blizzard')) return 73;
  if (f.includes('heavy snow')) return 75;
  if (f.includes('thunderstorm') || f.includes('t-storm') || f.includes('thunder')) {
    if (f.includes('hail')) return 96;
    return 95;
  }
  return 3;
}

function nwsWindSpeed(wind: string): number {
  const match = wind.match(/(\d+)/);
  if (!match) return 0;
  const mph = parseInt(match[1]);
  return Math.round(mph * 1.60934); // mph -> km/h
}

function nwsWindDir(dir: string): number {
  const dirs: Record<string, number> = {
    N: 0, NNE: 22, NE: 45, ENE: 67, E: 90, ESE: 112,
    SE: 135, SSE: 157, S: 180, SSW: 202, SW: 225, WSW: 247,
    W: 270, WNW: 292, NW: 315, NNW: 337,
  };
  return dirs[dir?.toUpperCase()] || 0;
}

function convert12to24(time12: string): string {
  const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return '06:00';
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
}
