// 天气代码映射
export const weatherCodeMap: Record<number, { label: string; icon: string; bg: string }> = {
  0: { label: '晴', icon: '☀️', bg: 'from-yellow-400 to-orange-400' },
  1: { label: '大部晴朗', icon: '🌤️', bg: 'from-blue-300 to-yellow-300' },
  2: { label: '多云', icon: '⛅', bg: 'from-blue-400 to-gray-300' },
  3: { label: '阴天', icon: '☁️', bg: 'from-gray-400 to-gray-500' },
  45: { label: '雾', icon: '🌫️', bg: 'from-gray-300 to-gray-400' },
  48: { label: '冻雾', icon: '🌫️', bg: 'from-gray-300 to-blue-300' },
  51: { label: '小毛毛雨', icon: '🌦️', bg: 'from-blue-300 to-blue-400' },
  53: { label: '毛毛雨', icon: '🌦️', bg: 'from-blue-400 to-blue-500' },
  55: { label: '大毛毛雨', icon: '🌦️', bg: 'from-blue-500 to-blue-600' },
  56: { label: '冻毛毛雨', icon: '🌧️', bg: 'from-blue-400 to-indigo-500' },
  57: { label: '强冻毛毛雨', icon: '🌧️', bg: 'from-blue-500 to-indigo-600' },
  61: { label: '小雨', icon: '🌧️', bg: 'from-blue-500 to-blue-600' },
  63: { label: '中雨', icon: '🌧️', bg: 'from-blue-600 to-blue-700' },
  65: { label: '大雨', icon: '🌧️', bg: 'from-blue-700 to-blue-800' },
  66: { label: '冻雨', icon: '🌧️', bg: 'from-blue-500 to-indigo-600' },
  67: { label: '强冻雨', icon: '🌧️', bg: 'from-blue-600 to-indigo-700' },
  71: { label: '小雪', icon: '🌨️', bg: 'from-blue-200 to-blue-300' },
  73: { label: '中雪', icon: '🌨️', bg: 'from-blue-300 to-blue-400' },
  75: { label: '大雪', icon: '❄️', bg: 'from-blue-300 to-indigo-400' },
  77: { label: '雪粒', icon: '❄️', bg: 'from-blue-200 to-indigo-300' },
  80: { label: '阵雨', icon: '🌦️', bg: 'from-blue-400 to-blue-500' },
  81: { label: '中阵雨', icon: '🌧️', bg: 'from-blue-500 to-blue-600' },
  82: { label: '暴阵雨', icon: '🌧️', bg: 'from-blue-600 to-blue-800' },
  85: { label: '阵雪', icon: '🌨️', bg: 'from-blue-200 to-blue-400' },
  86: { label: '大阵雪', icon: '❄️', bg: 'from-blue-300 to-indigo-500' },
  95: { label: '雷暴', icon: '⛈️', bg: 'from-gray-600 to-gray-800' },
  96: { label: '雷暴伴冰雹', icon: '⛈️', bg: 'from-gray-700 to-gray-900' },
  99: { label: '雷暴伴大冰雹', icon: '⛈️', bg: 'from-gray-800 to-gray-900' },
};

export function getWeatherInfo(code: number, isDay: boolean = true) {
  const info = weatherCodeMap[code] || { label: '未知', icon: '❓', bg: 'from-gray-500 to-gray-600' };
  if (code === 0 && !isDay) return { ...info, label: '晴', icon: '🌙' };
  if (code === 1 && !isDay) return { ...info, label: '大部晴朗', icon: '🌙' };
  return info;
}

export function getWindDirection(degrees: number): string {
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return directions[Math.round(degrees / 45) % 8];
}

export function getWindLevel(speed: number): string {
  if (speed < 1) return '0级-无风';
  if (speed < 6) return '1级-软风';
  if (speed < 12) return '2级-轻风';
  if (speed < 20) return '3级-微风';
  if (speed < 29) return '4级-和风';
  if (speed < 39) return '5级-清风';
  if (speed < 50) return '6级-强风';
  if (speed < 62) return '7级-疾风';
  if (speed < 75) return '8级-大风';
  if (speed < 89) return '9级-烈风';
  if (speed < 103) return '10级-狂风';
  if (speed < 117) return '11级-暴风';
  return '12级-飓风';
}

export function getUVLevel(index: number): { label: string; color: string; advice: string } {
  if (index <= 2) return { label: '低', color: 'text-green-400', advice: '可安全户外活动' };
  if (index <= 5) return { label: '中等', color: 'text-yellow-400', advice: '注意防晒' };
  if (index <= 7) return { label: '高', color: 'text-orange-400', advice: '减少户外暴露' };
  if (index <= 10) return { label: '很高', color: 'text-red-400', advice: '尽量避免户外' };
  return { label: '极高', color: 'text-purple-400', advice: '严禁户外暴露' };
}

export function getAQILevel(aqi: number): { label: string; color: string; bgColor: string; advice: string } {
  if (aqi <= 50) return { label: '优', color: 'text-green-400', bgColor: 'bg-green-500', advice: '空气质量令人满意' };
  if (aqi <= 100) return { label: '良', color: 'text-yellow-400', bgColor: 'bg-yellow-500', advice: '空气质量可接受' };
  if (aqi <= 150) return { label: '轻度污染', color: 'text-orange-400', bgColor: 'bg-orange-500', advice: '敏感人群需注意' };
  if (aqi <= 200) return { label: '中度污染', color: 'text-red-400', bgColor: 'bg-red-500', advice: '减少户外活动' };
  if (aqi <= 300) return { label: '重度污染', color: 'text-purple-400', bgColor: 'bg-purple-500', advice: '避免户外活动' };
  return { label: '严重污染', color: 'text-rose-600', bgColor: 'bg-rose-600', advice: '禁止户外活动' };
}

export function getVisibilityLevel(visibility: number): string {
  if (visibility >= 10000) return '极好';
  if (visibility >= 4000) return '良好';
  if (visibility >= 1000) return '一般';
  if (visibility >= 200) return '差';
  return '极差';
}

export function getHumidityLevel(humidity: number): { label: string; advice: string } {
  if (humidity < 30) return { label: '干燥', advice: '注意保湿' };
  if (humidity < 60) return { label: '舒适', advice: '体感舒适' };
  if (humidity < 80) return { label: '潮湿', advice: '闷热感增强' };
  return { label: '非常潮湿', advice: '注意防潮' };
}

export function formatHour(timeStr: string): string {
  const date = new Date(timeStr);
  return `${date.getHours().toString().padStart(2, '0')}:00`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}/${date.getDate()} ${weekDays[date.getDay()]}`;
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function isTomorrow(dateStr: string): boolean {
  const date = new Date(dateStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

// ===== 收藏地点管理 =====
export interface SavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export interface CitySearchResult {
  id?: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  feature_code?: string;
  population?: number;
}

export interface CitySearchResponse {
  results?: CitySearchResult[];
  generationtime_ms?: number;
  error?: string;
}

export interface CitySearchOptions {
  countryCode?: string;
  limit?: number;
  signal?: AbortSignal;
}

const LAST_LOCATION_KEY = 'weather_last_location';
const WEATHER_CACHE_KEY = 'weather_cache_data';
const DATA_SOURCE_KEY = 'weather_data_source';
const RECENT_SEARCHES_KEY = 'weather_recent_searches';

export type WeatherDataSource = 'openmeteo' | 'qweather' | 'owm';

// 热门城市预设列表（带坐标）
export const POPULAR_CITIES: SavedLocation[] = [
  { id: '39.91_116.40', name: '北京', latitude: 39.91, longitude: 116.40, country: '中国', admin1: '北京市' },
  { id: '31.23_121.47', name: '上海', latitude: 31.23, longitude: 121.47, country: '中国', admin1: '上海市' },
  { id: '23.13_113.26', name: '广州', latitude: 23.13, longitude: 113.26, country: '中国', admin1: '广东省' },
  { id: '22.54_114.06', name: '深圳', latitude: 22.54, longitude: 114.06, country: '中国', admin1: '广东省' },
  { id: '30.57_104.07', name: '成都', latitude: 30.57, longitude: 104.07, country: '中国', admin1: '四川省' },
  { id: '30.25_120.17', name: '杭州', latitude: 30.25, longitude: 120.17, country: '中国', admin1: '浙江省' },
  { id: '34.34_108.94', name: '西安', latitude: 34.34, longitude: 108.94, country: '中国', admin1: '陕西省' },
  { id: '32.06_118.79', name: '南京', latitude: 32.06, longitude: 118.79, country: '中国', admin1: '江苏省' },
  { id: '29.56_106.55', name: '重庆', latitude: 29.56, longitude: 106.55, country: '中国', admin1: '重庆市' },
  { id: '30.59_114.31', name: '武汉', latitude: 30.59, longitude: 114.31, country: '中国', admin1: '湖北省' },
  { id: '35.69_139.69', name: '东京', latitude: 35.69, longitude: 139.69, country: '日本', admin1: '东京都' },
  { id: '40.71_-74.01', name: '纽约', latitude: 40.71, longitude: -74.01, country: '美国', admin1: '纽约州' },
  { id: '51.51_-0.13', name: '伦敦', latitude: 51.51, longitude: -0.13, country: '英国', admin1: '英格兰' },
  { id: '48.86_2.35', name: '巴黎', latitude: 48.86, longitude: 2.35, country: '法国', admin1: '法兰西岛' },
  { id: '-33.87_151.21', name: '悉尼', latitude: -33.87, longitude: 151.21, country: '澳大利亚', admin1: '新南威尔士' },
];

export async function getSavedLocations(): Promise<SavedLocation[]> {
  try {
    const host = typeof window !== 'undefined' && process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_API_URL : '';
    const res = await fetch(`${host}/favorites`);
    const data = await res.json();
    return data.favorites || [];
  } catch (err) {
    console.error('Get favorites error:', err);
    return [];
  }
}

export async function saveLocation(loc: SavedLocation): Promise<SavedLocation[]> {
  try {
    const host = typeof window !== 'undefined' && process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_API_URL : '';
    const res = await fetch(`${host}/favorites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loc),
    });
    const data = await res.json();
    return data.favorites || [];
  } catch (err) {
    console.error('Save favorite error:', err);
    return [];
  }
}

export async function removeLocation(id: string): Promise<SavedLocation[]> {
  try {
    const host = typeof window !== 'undefined' && process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_API_URL : '';
    const res = await fetch(`${host}/favorites?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    return data.favorites || [];
  } catch (err) {
    console.error('Remove favorite error:', err);
    return [];
  }
}

export function makeLocationId(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

export function getLastLocation(): SavedLocation | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(LAST_LOCATION_KEY);
  return data ? JSON.parse(data) : null;
}

export function setLastLocation(loc: SavedLocation) {
  localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
}

// ===== 数据源管理 =====
export function getDataSource(): WeatherDataSource {
  if (typeof window === 'undefined') return 'openmeteo';
  return (localStorage.getItem(DATA_SOURCE_KEY) as WeatherDataSource) || 'openmeteo';
}

export function setDataSource(source: WeatherDataSource) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DATA_SOURCE_KEY, source);
}

// ===== 最近搜索管理 =====
const MAX_RECENT_SEARCHES = 8;

export function getRecentSearches(): SavedLocation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(loc: SavedLocation) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentSearches();
    // 移除重复项
    const filtered = recent.filter((r) => r.id !== loc.id);
    // 添加到开头
    filtered.unshift(loc);
    // 限制数量
    const trimmed = filtered.slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(trimmed));
  } catch {
    // silently fail
  }
}

export function clearRecentSearches() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

// ===== 本地天气缓存 =====
interface WeatherCache {
  data: any;
  cachedAt: string;
  locationId: string;
}

export function getLocalWeatherCache(locationId: string): any | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(`${WEATHER_CACHE_KEY}_${locationId}`);
  if (!raw) return null;
  const cache: WeatherCache = JSON.parse(raw);
  const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
  // 本地缓存最多保留 2 小时
  if (ageMs > 2 * 60 * 60 * 1000) return null;
  return cache;
}

export function setLocalWeatherCache(locationId: string, data: any) {
  const cache: WeatherCache = {
    data,
    cachedAt: new Date().toISOString(),
    locationId,
  };
  localStorage.setItem(`${WEATHER_CACHE_KEY}_${locationId}`, JSON.stringify(cache));
}

// ===== API 调用 =====
export const fetchWeatherData = async (lat: number, lon: number, forceRefresh = false, source: WeatherDataSource = 'openmeteo') => {
  const host = typeof window !== 'undefined' && process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_API_URL : '';
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    source,
    fallback: 'true',
  });

  if (forceRefresh) {
    params.set('refresh', 'true');
  }

  const url = `${host}/weather?${params.toString()}`;
  console.log(`[fetchWeatherData] URL: ${url}`);
  console.log(`[fetchWeatherData] params: lat=${lat} lon=${lon} source=${source} fallback=true forceRefresh=${forceRefresh}`);
  
  const res = await fetch(url);
  console.log(`[fetchWeatherData] HTTP ${res.status}`);
  console.log(`[fetchWeatherData] headers:`, {
    'X-Data-Source': res.headers.get('X-Data-Source'),
    'X-Resolved-Source': res.headers.get('X-Resolved-Source'),
    'X-Fallback-Used': res.headers.get('X-Fallback-Used'),
    'X-Cache': res.headers.get('X-Cache'),
  });
  
  const data = await res.json().catch(() => ({ error: `天气请求失败（HTTP ${res.status}）` }));
  console.log(`[fetchWeatherData] response keys:`, Object.keys(data || {}));
  if (data.error) console.error(`[fetchWeatherData] error:`, data.error);
  if (data.source_errors) console.error(`[fetchWeatherData] source_errors:`, JSON.stringify(data.source_errors));

  if (!res.ok && !data?.error) {
    return { error: `天气请求失败（HTTP ${res.status}）`, details: data };
  }

  return data;
};

export const fetchGeoLocation = async () => {
  const host = typeof window !== 'undefined' && process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_API_URL : '';
  const res = await fetch(`${host}/geo`);
  return res.json();
};

export const searchCity = async (query: string, options: CitySearchOptions = {}): Promise<CitySearchResponse> => {
  const host = typeof window !== 'undefined' && process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_API_URL : '';
  const params = new URLSearchParams({ q: query });

  if (options.countryCode) {
    params.set('countryCode', options.countryCode.toUpperCase());
  }

  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit));
  }

  const res = await fetch(`${host}/geocoding?${params.toString()}`, {
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(`City search failed: ${res.status}`);
  }

  return res.json();
};
