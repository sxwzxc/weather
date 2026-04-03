interface Env {
  weather?: any;
}

interface SavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export async function onRequest({ request, env }: { request: Request; env: Env }) {
  const url = new URL(request.url);
  const method = request.method;

  // 获取用户标识（使用 IP 作为简单标识）
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userKey = `favorites:${clientIp}`;

  if (!env.weather) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // GET - 获取收藏列表
    if (method === 'GET') {
      const data = await env.weather.get(userKey);
      const favorites: SavedLocation[] = data ? JSON.parse(data) : [];
      return new Response(JSON.stringify({ favorites }), {
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // POST - 添加收藏
    if (method === 'POST') {
      const body = await request.json() as SavedLocation;
      const data = await env.weather.get(userKey);
      const favorites: SavedLocation[] = data ? JSON.parse(data) : [];
      
      if (!favorites.find(f => f.id === body.id)) {
        favorites.push(body);
        await env.weather.put(userKey, JSON.stringify(favorites));
      }

      return new Response(JSON.stringify({ favorites }), {
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // DELETE - 删除收藏
    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing id' }), {
          status: 400,
          headers: {
            'content-type': 'application/json; charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      const data = await env.weather.get(userKey);
      const favorites: SavedLocation[] = data ? JSON.parse(data) : [];
      const filtered = favorites.filter(f => f.id !== id);
      await env.weather.put(userKey, JSON.stringify(filtered));

      return new Response(JSON.stringify({ favorites: filtered }), {
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
