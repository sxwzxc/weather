interface EORequest extends Request {
  eo: {
    geo: {
      latitude: number;
      longitude: number;
      cityName: string;
    };
  };
}

interface Env {
  weather: KVNamespace;
}

export async function onRequest({ request, env }: { request: EORequest; env: Env }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat') || request.eo?.geo?.latitude?.toString();
  const lon = url.searchParams.get('lon') || request.eo?.geo?.longitude?.toString();

  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing latitude or longitude' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  }

  const cacheKey = `weather:${lat}:${lon}`;
  
  // 尝试从 KV 缓存读取（缓存 30 分钟）
  const cached = await env.weather.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    // 调用 Open-Meteo API
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,visibility,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=16`;
    
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,us_aqi&timezone=auto`;

    const [weatherRes, airRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(airQualityUrl),
    ]);

    const weatherData = await weatherRes.json();
    const airData = await airRes.json();

    const result = {
      ...weatherData,
      air_quality: airData.current,
      cached_at: new Date().toISOString(),
    };

    const resultStr = JSON.stringify(result);
    
    // 存入 KV 缓存，TTL 30 分钟
    await env.weather.put(cacheKey, resultStr, { expirationTtl: 1800 });

    return new Response(resultStr, {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch weather data' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  }
}
