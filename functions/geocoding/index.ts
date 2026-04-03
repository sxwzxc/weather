export async function onRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  }

  try {
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=zh&format=json`;
    
    const response = await fetch(geocodingUrl);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch geocoding data' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  }
}
