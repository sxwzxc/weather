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
    // 添加更多参数以支持更广泛的搜索
    // language=zh: 中文优先
    // count=30: 增加结果数量
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=30&language=zh,en&format=json`;
    
    const response = await fetch(geocodingUrl);
    const data = await response.json();

    // 如果有结果，进行后处理以提升相关性
    if (data.results && data.results.length > 0) {
      // 对结果进行相关性排序
      const results = data.results.map((r: any) => {
        // 计算相关性分数
        let score = 0;
        const queryLower = query.toLowerCase();
        const nameLower = r.name.toLowerCase();
        
        // 完全匹配得分最高
        if (nameLower === queryLower) score += 1000;
        // 开头匹配
        else if (nameLower.startsWith(queryLower)) score += 500;
        // 包含匹配
        else if (nameLower.includes(queryLower)) score += 100;
        
        // 城市级别加分
        if (r.feature_code === 'PPLA') score += 50; // 省会
        else if (r.feature_code === 'PPLA2') score += 40; // 地级市
        else if (r.feature_code === 'PPLA3') score += 30; // 区县
        else if (r.feature_code === 'PPL') score += 20; // 普通城市
        
        // 人口加分（对数scale）
        if (r.population) score += Math.log10(r.population);
        
        return { ...r, _score: score };
      });
      
      // 按分数排序
      results.sort((a: any, b: any) => b._score - a._score);
      
      return new Response(JSON.stringify({ ...data, results }), {
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

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
