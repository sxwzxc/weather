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
  weather?: any;
}

export async function onRequest({ request, env }: { request: EORequest; env: Env }) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat') || request.eo?.geo?.latitude?.toString();
  const lon = url.searchParams.get('lon') || request.eo?.geo?.longitude?.toString();
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

  const cacheKey = `weather:${lat}:${lon}`;
  
  // 尝试从 KV 缓存读取
  if (env.weather && !forceRefresh) {
    try {
      const cached = await env.weather.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(data.cached_at).getTime();
        const cacheAgeMinutes = Math.floor(cacheAge / 60000);
        
        return new Response(cached, {
          headers: {
            'content-type': 'application/json; charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'X-Cache': 'HIT',
            'X-Cache-Age': cacheAgeMinutes.toString(),
          },
        });
      }
    } catch (e) {
      console.error('KV read error:', e);
    }
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
      location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
    };

    const resultStr = JSON.stringify(result);
    
    // 存入 KV 缓存，TTL 2 小时
    if (env.weather) {
      try {
        await env.weather.put(cacheKey, resultStr, { expirationTtl: 7200 });
      } catch (e) {
        console.error('KV write error:', e);
      }
    }

    return new Response(resultStr, {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
        'X-Cache-Age': '0',
      },
    });
  } catch (error) {
    console.error('Weather API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch weather data',
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
