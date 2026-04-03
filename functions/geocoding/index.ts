import { pinyin } from 'pinyin-pro';

interface GeoResult {
  id?: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  feature_code?: string;
  population?: number;
  [key: string]: any;
}

interface GeocodingApiResponse {
  results?: GeoResult[];
  generationtime_ms?: number;
}

interface RequestPlanItem {
  query: string;
  language: 'zh' | 'en';
}

interface RankedGeoResult extends GeoResult {
  _score: number;
  _requestIndex: number;
  _matchedQuery: string;
}

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const MAX_UPSTREAM_COUNT = 100;
const DEFAULT_RETURN_LIMIT = 30;
const MAX_RETURN_LIMIT = 50;
const MAX_REQUESTS = 8;
const MAX_QUERY_LENGTH = 80;

const CHINESE_REGEX = /[\u3400-\u9FFF]/;
const ADMIN_SUFFIX_REGEX = /(特别行政区|自治区|自治州|省|市|县|区|旗|盟)$/;

function jsonHeaders() {
  return {
    'content-type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
  };
}

function sanitizeQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_QUERY_LENGTH);
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function hasChinese(text: string): boolean {
  return CHINESE_REGEX.test(text);
}

function addCandidate(set: Set<string>, value?: string) {
  if (!value) return;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_QUERY_LENGTH) return;
  set.add(candidate);
}

function capitalizeFirst(input: string): string {
  if (!input) return input;
  return `${input[0].toUpperCase()}${input.slice(1)}`;
}

function joinPinyinWithApostrophe(syllables: string[], apostrophe: string): string {
  if (syllables.length === 0) return '';
  let out = syllables[0];
  for (let i = 1; i < syllables.length; i++) {
    const syl = syllables[i];
    out += /^[aeo]/i.test(syl) ? `${apostrophe}${syl}` : syl;
  }
  return out;
}

function buildPinyinCandidates(chineseText: string): string[] {
  const rawSyllables = pinyin(chineseText, { toneType: 'none', type: 'array' }) as string[];
  const syllables = rawSyllables
    .map((s) => s.toLowerCase().replace(/[^a-z]/g, ''))
    .filter(Boolean);

  if (syllables.length === 0) return [];

  const smartApostrophe = joinPinyinWithApostrophe(syllables, '’');
  const asciiApostrophe = joinPinyinWithApostrophe(syllables, "'");
  const compact = syllables.join('');
  const spaced = syllables.join(' ');

  const candidates = new Set<string>();
  addCandidate(candidates, smartApostrophe);
  addCandidate(candidates, capitalizeFirst(smartApostrophe));
  addCandidate(candidates, asciiApostrophe);
  addCandidate(candidates, capitalizeFirst(asciiApostrophe));
  addCandidate(candidates, compact);
  addCandidate(candidates, capitalizeFirst(compact));
  addCandidate(candidates, spaced);

  return [...candidates];
}

function buildQueryCandidates(query: string): string[] {
  const normalized = sanitizeQuery(query);
  const compact = normalized.replace(/\s+/g, '');
  const stripped = compact.replace(ADMIN_SUFFIX_REGEX, '') || compact;
  const candidates = new Set<string>();

  addCandidate(candidates, normalized);
  addCandidate(candidates, compact);
  if (stripped !== compact) addCandidate(candidates, stripped);

  if (hasChinese(stripped)) {
    const pinyinCandidates = buildPinyinCandidates(stripped);
    for (const item of pinyinCandidates) addCandidate(candidates, item);
  } else {
    addCandidate(candidates, compact.replace(/'/g, '’'));
    addCandidate(candidates, compact.replace(/’/g, "'"));
    addCandidate(candidates, compact.replace(/[\s'’-]/g, ''));
  }

  return [...candidates].slice(0, 6);
}

function buildRequestPlan(query: string): RequestPlanItem[] {
  const candidates = buildQueryCandidates(query);
  const queryHasChinese = hasChinese(query);
  const primaryLanguage: 'zh' | 'en' = queryHasChinese ? 'zh' : 'en';
  const secondaryLanguage: 'zh' | 'en' = queryHasChinese ? 'en' : 'zh';

  const plan: RequestPlanItem[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const languages: Array<'zh' | 'en'> = i === 0 ? [primaryLanguage, secondaryLanguage] : [primaryLanguage, secondaryLanguage];

    for (const language of languages) {
      if (plan.length >= MAX_REQUESTS) break;
      const duplicated = plan.some((item) => item.query === candidate && item.language === language);
      if (!duplicated) {
        plan.push({ query: candidate, language });
      }
    }

    if (plan.length >= MAX_REQUESTS) break;
  }

  return plan;
}

function getFeatureScore(featureCode?: string): number {
  if (!featureCode) return 0;

  const scoreMap: Record<string, number> = {
    PPLC: 260,
    PPLA: 240,
    PPLA2: 220,
    PPLA3: 200,
    PPLA4: 180,
    PPL: 170,
    PPLL: 150,
    PPLX: 140,
    ADM1: 130,
    ADM2: 120,
  };

  if (scoreMap[featureCode] !== undefined) return scoreMap[featureCode];
  if (featureCode.startsWith('PPL')) return 130;
  if (featureCode.startsWith('ADM')) return 100;
  if (['MT', 'HLL', 'PK', 'PRK', 'ISL', 'AIRP'].includes(featureCode)) return -80;
  return 10;
}

function getTextMatchScore(keyword: string, text: string): number {
  if (!keyword || !text) return 0;
  if (text === keyword) return 1000;
  if (text.startsWith(keyword)) return 650;
  if (text.includes(keyword)) return 280;
  if (keyword.includes(text)) return 120;
  return 0;
}

function getCharOverlapScore(keyword: string, text: string): number {
  if (!keyword || !text) return 0;
  const chars = [...new Set(keyword.split(''))];
  if (chars.length === 0) return 0;
  const hit = chars.reduce((acc, ch) => (text.includes(ch) ? acc + 1 : acc), 0);
  return (hit / chars.length) * 120;
}

function computeRelevance(
  result: GeoResult,
  originalQuery: string,
  matchedQuery: string,
  preferredCountryCode?: string,
  requestIndex: number = 0
): number {
  const nameNorm = normalizeForMatch(result.name || '');
  const admin1Norm = normalizeForMatch(result.admin1 || '');
  const admin2Norm = normalizeForMatch(result.admin2 || '');
  const countryNorm = normalizeForMatch(result.country || '');
  const fields = [nameNorm, admin1Norm, admin2Norm, countryNorm].filter(Boolean);

  const queryNorm = normalizeForMatch(originalQuery);
  const matchedQueryNorm = normalizeForMatch(matchedQuery);

  let score = 0;

  const scoreByOriginal = fields.reduce((best, field) => Math.max(best, getTextMatchScore(queryNorm, field)), 0);
  const scoreByMatched = fields.reduce((best, field) => Math.max(best, getTextMatchScore(matchedQueryNorm, field)), 0);

  score += Math.max(scoreByOriginal, scoreByMatched);
  score += getCharOverlapScore(queryNorm, nameNorm) * 0.6;
  score += getFeatureScore(result.feature_code);

  if (result.population && result.population > 0) {
    score += Math.min(Math.log10(result.population) * 25, 160);
  }

  if (preferredCountryCode) {
    if (result.country_code === preferredCountryCode) score += 160;
    else if (result.country_code) score -= 40;
  }

  if (requestIndex === 0) score += 40;
  else score -= requestIndex * 4;

  return score;
}

function dedupeKey(result: GeoResult): string {
  if (result.id) return `id:${result.id}`;
  const name = normalizeForMatch(result.name || '');
  return `coord:${result.latitude.toFixed(4)}:${result.longitude.toFixed(4)}:${name}`;
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_RETURN_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_RETURN_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_RETURN_LIMIT);
}

export async function onRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get('q');
  const limit = parseLimit(url.searchParams.get('limit'));
  const countryCode = url.searchParams.get('countryCode')?.trim().toUpperCase() || undefined;

  if (!rawQuery || !rawQuery.trim()) {
    return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }

  const query = sanitizeQuery(rawQuery);
  const preferredCountryCode = countryCode || (hasChinese(query) ? 'CN' : undefined);
  const plan = buildRequestPlan(query);

  try {
    const settled = await Promise.allSettled(
      plan.map(async (item, index) => {
        const params = new URLSearchParams({
          name: item.query,
          count: String(MAX_UPSTREAM_COUNT),
          language: item.language,
          format: 'json',
        });

        if (preferredCountryCode) {
          params.set('countryCode', preferredCountryCode);
        }

        const response = await fetch(`${GEOCODING_API}?${params.toString()}`);
        if (!response.ok) return [] as RankedGeoResult[];

        const payload = (await response.json()) as GeocodingApiResponse;
        const results = payload.results ?? [];

        return results.map((result) => ({
          ...result,
          _requestIndex: index,
          _matchedQuery: item.query,
          _score: computeRelevance(result, query, item.query, preferredCountryCode, index),
        }));
      })
    );

    const ranked: RankedGeoResult[] = [];

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        ranked.push(...item.value);
      }
    }

    const deduped = new Map<string, RankedGeoResult>();
    for (const item of ranked) {
      const key = dedupeKey(item);
      const existing = deduped.get(key);
      if (!existing || item._score > existing._score) {
        deduped.set(key, item);
      }
    }

    const sorted = [...deduped.values()]
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score, _requestIndex, _matchedQuery, ...result }) => result);

    return new Response(
      JSON.stringify({
        results: sorted,
        generationtime_ms: 0,
      }),
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch geocoding data',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}
