// 天气代码映射
export const weatherCodeMap: Record<number, { label: string; icon: string }> = {
  0: { label: '晴', icon: '☀️' },
  1: { label: '大部晴朗', icon: '🌤️' },
  2: { label: '多云', icon: '⛅' },
  3: { label: '阴天', icon: '☁️' },
  45: { label: '雾', icon: '🌫️' },
  48: { label: '冻雾', icon: '🌫️' },
  51: { label: '小毛毛雨', icon: '🌦️' },
  53: { label: '毛毛雨', icon: '🌦️' },
  55: { label: '大毛毛雨', icon: '🌦️' },
  56: { label: '冻毛毛雨', icon: '🌧️' },
  57: { label: '强冻毛毛雨', icon: '🌧️' },
  61: { label: '小雨', icon: '🌧️' },
  63: { label: '中雨', icon: '🌧️' },
  65: { label: '大雨', icon: '🌧️' },
  66: { label: '冻雨', icon: '🌧️' },
  67: { label: '强冻雨', icon: '🌧️' },
  71: { label: '小雪', icon: '🌨️' },
  73: { label: '中雪', icon: '🌨️' },
  75: { label: '大雪', icon: '❄️' },
  77: { label: '雪粒', icon: '❄️' },
  80: { label: '阵雨', icon: '🌦️' },
  81: { label: '中阵雨', icon: '🌧️' },
  82: { label: '暴阵雨', icon: '🌧️' },
  85: { label: '阵雪', icon: '🌨️' },
  86: { label: '大阵雪', icon: '❄️' },
  95: { label: '雷暴', icon: '⛈️' },
  96: { label: '雷暴伴冰雹', icon: '⛈️' },
  99: { label: '雷暴伴大冰雹', icon: '⛈️' },
};

export function getWeatherInfo(code: number, isDay: boolean = true) {
  const info = weatherCodeMap[code] || { label: '未知', icon: '❓' };
  // 夜间晴天使用月亮图标
  if (code === 0 && !isDay) {
    return { label: '晴', icon: '🌙' };
  }
  if (code === 1 && !isDay) {
    return { label: '大部晴朗', icon: '🌙' };
  }
  return info;
}

// 风向
export function getWindDirection(degrees: number): string {
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

// 紫外线指数等级
export function getUVLevel(index: number): { label: string; color: string } {
  if (index <= 2) return { label: '低', color: 'text-green-400' };
  if (index <= 5) return { label: '中等', color: 'text-yellow-400' };
  if (index <= 7) return { label: '高', color: 'text-orange-400' };
  if (index <= 10) return { label: '很高', color: 'text-red-400' };
  return { label: '极高', color: 'text-purple-400' };
}

// 空气质量等级
export function getAQILevel(aqi: number): { label: string; color: string } {
  if (aqi <= 50) return { label: '优', color: 'text-green-400' };
  if (aqi <= 100) return { label: '良', color: 'text-yellow-400' };
  if (aqi <= 150) return { label: '轻度污染', color: 'text-orange-400' };
  if (aqi <= 200) return { label: '中度污染', color: 'text-red-400' };
  if (aqi <= 300) return { label: '重度污染', color: 'text-purple-400' };
  return { label: '严重污染', color: 'text-rose-600' };
}

// 格式化时间
export function formatHour(timeStr: string): string {
  const date = new Date(timeStr);
  return `${date.getHours().toString().padStart(2, '0')}:00`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDay = weekDays[date.getDay()];
  return `${month}/${day} ${weekDay}`;
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

export function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// API 调用
export const fetchWeatherData = async (lat: number, lon: number) => {
  const host =
    typeof window !== 'undefined' && process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_API_URL
      : '';
  const res = await fetch(`${host}/weather?lat=${lat}&lon=${lon}`);
  return res.json();
};

export const fetchGeoLocation = async () => {
  const host =
    typeof window !== 'undefined' && process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_API_URL
      : '';
  const res = await fetch(`${host}/geo`);
  return res.json();
};

export const searchCity = async (query: string) => {
  const host =
    typeof window !== 'undefined' && process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_API_URL
      : '';
  const res = await fetch(`${host}/geocoding?q=${encodeURIComponent(query)}`);
  return res.json();
};
