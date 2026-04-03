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

type WeatherProvider = 'openmeteo' | 'qweather' | 'owm';

const PROVIDER_PRIORITY: WeatherProvider[] = ['openmeteo', 'qweather', 'owm'];

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
  return undefined;
}

function buildProviderQueue(requested: WeatherProvider | undefined, fallbackEnabled: boolean): WeatherProvider[] {
  if (!requested) return [...PROVIDER_PRIORITY];
  if (!fallbackEnabled) return [requested];
  return [requested, ...PROVIDER_PRIORITY.filter((provider) => provider !== requested)];
}

function providerLabel(provider: WeatherProvider): string {
  if (provider === 'qweather') return 'QWeather';
  if (provider === 'owm') return 'OpenWeatherMap';
  return 'Open-Meteo';
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

  if (!forceRefresh) {
    try {
      const cached = await weather.get(cacheKey);
      if (cached) {
        const payload = JSON.parse(cached);
        return {
          ok: true,
          payload,
          fromCache: true,
          cacheAgeMinutes: Math.floor((Date.now() - new Date(payload.cached_at).getTime()) / 60000),
        };
      }
    } catch (e) {
      console.error('Open-Meteo KV read error:', e);
    }
  }

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,visibility,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=16`;
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,us_aqi&timezone=auto`;

    const [weatherRes, airRes] = await Promise.all([fetch(weatherUrl), fetch(airQualityUrl)]);

    if (!weatherRes.ok) {
      return { ok: false, error: `Open-Meteo weather HTTP ${weatherRes.status}` };
    }

    const weatherData = await parseJsonSafe(weatherRes);
    const airData = airRes.ok ? await parseJsonSafe(airRes) : null;

    if (!weatherData || weatherData.error) {
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
    } catch (e) {
      console.error('Open-Meteo KV write error:', e);
    }

    return { ok: true, payload, fromCache: false, cacheAgeMinutes: 0 };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchProviderEndpoint(request: Request, provider: Exclude<WeatherProvider, 'openmeteo'>, lat: string, lon: string, forceRefresh: boolean) {
  const requestUrl = new URL(request.url);
  const endpoint = provider === 'qweather' ? '/qweather' : '/owm';
  const params = new URLSearchParams({ lat, lon });
  if (forceRefresh) params.set('refresh', 'true');

  const targetUrl = `${requestUrl.origin}${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'X-Weather-Gateway': '1',
      },
    });

    const payload = await parseJsonSafe(response);

    if (!response.ok) {
      return {
        ok: false,
        error: payload?.error || `Provider ${provider} HTTP ${response.status}`,
      };
    }

    if (!payload || payload.error) {
      return {
        ok: false,
        error: payload?.error || `Provider ${provider} payload invalid`,
      };
    }

    return {
      ok: true,
      payload,
      fromCache: response.headers.get('X-Cache') === 'HIT',
      cacheAgeMinutes: Number.parseInt(response.headers.get('X-Cache-Age') || '0', 10) || 0,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function onRequest({ request }: { request: EORequest }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat') || request.eo?.geo?.latitude?.toString();
  const lon = url.searchParams.get('lon') || request.eo?.geo?.longitude?.toString();
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  const requestedProvider = parseProvider(url.searchParams.get('source') || url.searchParams.get('provider'));
  const fallbackEnabled = url.searchParams.get('fallback') !== 'false';
  const providerQueue = buildProviderQueue(requestedProvider, fallbackEnabled);

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing latitude or longitude' }), {
      status: 400,
      headers: responseHeaders(),
    });
  }

  const sourceErrors: Array<{ provider: string; message: string }> = [];

  for (const provider of providerQueue) {
    const result =
      provider === 'openmeteo'
        ? await fetchOpenMeteoData(lat, lon, forceRefresh)
        : await fetchProviderEndpoint(request, provider, lat, lon, forceRefresh);

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

    sourceErrors.push({ provider, message: result.error || 'Unknown provider error' });
  }

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
