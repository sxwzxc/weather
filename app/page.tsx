'use client';

import React, { useState, useEffect } from 'react';
import {
  fetchWeatherData, fetchGeoLocation, searchCity,
  getWeatherInfo, getWindDirection, getUVLevel, getAQILevel,
  formatHour, formatDate, isToday,
} from '@/lib/weather';

export default function WeatherPage() {
  const [weatherData, setWeatherData] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => { loadWeatherByGeo(); }, []);

  const loadWeatherByGeo = async () => {
    try {
      setLoading(true);
      setError('');
      const geoData = await fetchGeoLocation();
      const { latitude, longitude, cityName } = geoData.eo.geo;
      setLocation({ name: cityName || '当前位置', latitude, longitude });
      const weather = await fetchWeatherData(latitude, longitude);
      setWeatherData(weather);
    } catch (err) {
      setError('加载天气数据失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const loadWeatherByCity = async (loc: any) => {
    try {
      setLoading(true);
      setError('');
      setLocation(loc);
      setShowSearch(false);
      setSearchResults([]);
      setSearchQuery('');
      const weather = await fetchWeatherData(loc.latitude, loc.longitude);
      setWeatherData(weather);
    } catch (err) {
      setError('加载天气数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const data = await searchCity(searchQuery);
    setSearchResults(data.results || []);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-300 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-white mt-4 text-lg">加载天气数据中...</p>
        </div>
      </div>
    );
  }

  if (error && !weatherData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-6 max-w-md text-center">
          <p className="text-red-300">{error}</p>
          <button onClick={loadWeatherByGeo} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg transition">重试</button>
        </div>
      </div>
    );
  }

  if (!weatherData || !location) return null;

  const { current, hourly, daily, air_quality } = weatherData;
  const wi = getWeatherInfo(current.weather_code, current.is_day);
  const nowHourIdx = new Date().getHours();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-3 md:p-6 pb-10">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* 顶部栏 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl md:text-3xl font-bold text-white">{wi.icon} 天气预报</h1>
          <div className="flex items-center gap-2">
            <a href="/geoInfo" className="text-blue-300 hover:text-white text-sm underline transition">GeoInfo</a>
            <button onClick={() => setShowSearch(!showSearch)} className="bg-white/10 hover:bg-white/20 text-white py-1.5 px-4 rounded-lg text-sm transition">
              🔍 搜索城市
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        {showSearch && (
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="输入城市名称..." className="flex-1 bg-white/10 text-white placeholder-blue-200 border border-white/20 rounded-lg px-4 py-2 outline-none focus:border-white/50" />
              <button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">搜索</button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {searchResults.map((r: any, i: number) => (
                  <button key={i} onClick={() => loadWeatherByCity({ name: r.name, latitude: r.latitude, longitude: r.longitude, country: r.country, admin1: r.admin1 })}
                    className="w-full text-left bg-white/5 hover:bg-white/15 text-white p-2 rounded-lg text-sm transition">
                    {r.name}{r.admin1 ? `, ${r.admin1}` : ''}{r.country ? ` - ${r.country}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 当前天气 */}
        <div className="bg-white/10 backdrop-blur rounded-xl p-5 md:p-6">
          <div className="flex items-center gap-2 text-blue-200 text-sm mb-3">
            <span>📍 {location.name}{location.admin1 ? `, ${location.admin1}` : ''}{location.country ? ` · ${location.country}` : ''}</span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-6xl md:text-7xl font-light text-white">{Math.round(current.temperature_2m)}°</div>
              <div className="text-xl text-blue-100 mt-1">{wi.label}</div>
              <div className="text-blue-200 text-sm mt-1">体感 {Math.round(current.apparent_temperature)}°</div>
            </div>
            <div className="text-8xl">{wi.icon}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <InfoCard label="湿度" value={`${current.relative_humidity_2m}%`} icon="💧" />
            <InfoCard label="风速" value={`${current.wind_speed_10m} km/h`} icon="💨" extra={getWindDirection(current.wind_direction_10m)} />
            <InfoCard label="气压" value={`${Math.round(current.pressure_msl)} hPa`} icon="🌡️" />
            <InfoCard label="云量" value={`${current.cloud_cover}%`} icon="☁️" />
          </div>
        </div>

        {/* 空气质量 + 紫外线 + 日出日落 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {air_quality && (
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <h3 className="text-blue-200 text-sm mb-2">🏭 空气质量</h3>
              <div className={`text-2xl font-bold ${getAQILevel(air_quality.us_aqi).color}`}>{air_quality.us_aqi} - {getAQILevel(air_quality.us_aqi).label}</div>
              <div className="text-blue-200 text-xs mt-2 space-y-1">
                <div>PM2.5: {air_quality.pm2_5} μg/m³</div>
                <div>PM10: {air_quality.pm10} μg/m³</div>
              </div>
            </div>
          )}
          {daily && (
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <h3 className="text-blue-200 text-sm mb-2">☀️ 紫外线指数</h3>
              <div className={`text-2xl font-bold ${getUVLevel(daily.uv_index_max[0]).color}`}>{daily.uv_index_max[0]} - {getUVLevel(daily.uv_index_max[0]).label}</div>
              <div className="w-full bg-white/10 rounded-full h-2 mt-3">
                <div className="bg-gradient-to-r from-green-400 via-yellow-400 via-orange-400 to-red-500 h-2 rounded-full" style={{ width: `${Math.min(daily.uv_index_max[0] / 11 * 100, 100)}%` }} />
              </div>
            </div>
          )}
          {daily && (
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <h3 className="text-blue-200 text-sm mb-2">🌅 日出日落</h3>
              <div className="flex justify-between items-center mt-2">
                <div className="text-center">
                  <div className="text-2xl">🌅</div>
                  <div className="text-white font-medium">{daily.sunrise[0]?.slice(11, 16)}</div>
                  <div className="text-blue-300 text-xs">日出</div>
                </div>
                <div className="flex-1 mx-4 h-0.5 bg-gradient-to-r from-yellow-400 to-orange-500 rounded" />
                <div className="text-center">
                  <div className="text-2xl">🌇</div>
                  <div className="text-white font-medium">{daily.sunset[0]?.slice(11, 16)}</div>
                  <div className="text-blue-300 text-xs">日落</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 小时预报 */}
        {hourly && <HourlyForecast hourly={hourly} nowIdx={nowHourIdx} />}

        {/* 降水预报 */}
        {hourly && <PrecipitationChart hourly={hourly} nowIdx={nowHourIdx} />}

        {/* 15天预报 */}
        {daily && <DailyForecast daily={daily} />}

        {/* 页脚 */}
        <div className="text-center text-blue-300/60 text-xs pt-4">
          数据来源: Open-Meteo • Powered by EdgeOne Pages
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, icon, extra }: { label: string; value: string; icon: string; extra?: string }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 text-center">
      <div className="text-lg">{icon}</div>
      <div className="text-white font-medium text-sm mt-1">{value}</div>
      <div className="text-blue-300 text-xs">{label}{extra ? ` · ${extra}` : ''}</div>
    </div>
  );
}

function HourlyForecast({ hourly, nowIdx }: { hourly: any; nowIdx: number }) {
  const hours = [];
  for (let i = nowIdx; i < Math.min(nowIdx + 48, hourly.time.length); i++) {
    hours.push({
      time: hourly.time[i],
      temp: hourly.temperature_2m[i],
      code: hourly.weather_code[i],
      precip: hourly.precipitation_probability[i],
      wind: hourly.wind_speed_10m[i],
    });
  }

  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-4">
      <h3 className="text-white font-medium mb-3">⏰ 逐小时预报</h3>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {hours.map((h, i) => {
          const info = getWeatherInfo(h.code);
          return (
            <div key={i} className="flex-shrink-0 text-center min-w-[60px] bg-white/5 rounded-lg p-2">
              <div className="text-blue-200 text-xs">{i === 0 ? '现在' : formatHour(h.time)}</div>
              <div className="text-xl my-1">{info.icon}</div>
              <div className="text-white font-medium text-sm">{Math.round(h.temp)}°</div>
              {h.precip > 0 && <div className="text-blue-300 text-xs">💧{h.precip}%</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrecipitationChart({ hourly, nowIdx }: { hourly: any; nowIdx: number }) {
  const data = [];
  for (let i = nowIdx; i < Math.min(nowIdx + 24, hourly.time.length); i++) {
    data.push({
      time: hourly.time[i],
      precip: hourly.precipitation[i] || 0,
      prob: hourly.precipitation_probability[i] || 0,
    });
  }
  const maxPrecip = Math.max(...data.map(d => d.precip), 1);

  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-4">
      <h3 className="text-white font-medium mb-3">🌧️ 24小时降水预报</h3>
      <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
        {data.map((d, i) => (
          <div key={i} className="flex-shrink-0 flex flex-col items-center min-w-[28px]">
            <div className="text-blue-200 text-[10px] mb-1">{d.precip > 0 ? `${d.precip.toFixed(1)}` : ''}</div>
            <div className="w-5 bg-blue-400/60 rounded-t" style={{ height: `${Math.max((d.precip / maxPrecip) * 60, d.precip > 0 ? 4 : 1)}px` }} />
            <div className="text-blue-300 text-[10px] mt-1">{formatHour(d.time)}</div>
          </div>
        ))}
      </div>
      <div className="text-blue-300/60 text-xs mt-2">单位: mm</div>
    </div>
  );
}

function DailyForecast({ daily }: { daily: any }) {
  const days = [];
  for (let i = 0; i < daily.time.length; i++) {
    days.push({
      date: daily.time[i],
      code: daily.weather_code[i],
      max: daily.temperature_2m_max[i],
      min: daily.temperature_2m_min[i],
      precipProb: daily.precipitation_probability_max[i],
      precipSum: daily.precipitation_sum[i],
      wind: daily.wind_speed_10m_max[i],
    });
  }
  const allMax = Math.max(...days.map(d => d.max));
  const allMin = Math.min(...days.map(d => d.min));
  const range = allMax - allMin || 1;

  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-4">
      <h3 className="text-white font-medium mb-3">📅 15天天气预报</h3>
      <div className="space-y-2">
        {days.map((d, i) => {
          const info = getWeatherInfo(d.code);
          const barLeft = ((d.min - allMin) / range) * 100;
          const barWidth = ((d.max - d.min) / range) * 100;
          return (
            <div key={i} className={`flex items-center gap-2 md:gap-3 py-2 px-2 rounded-lg text-sm ${isToday(d.date) ? 'bg-white/10' : 'hover:bg-white/5'} transition`}>
              <div className="w-16 md:w-20 text-blue-200 text-xs flex-shrink-0">{isToday(d.date) ? '今天' : formatDate(d.date)}</div>
              <div className="w-6 text-center flex-shrink-0">{info.icon}</div>
              <div className="w-12 text-blue-200 text-xs flex-shrink-0 hidden md:block">{info.label}</div>
              <div className="w-8 text-blue-300 text-xs text-right flex-shrink-0">{Math.round(d.min)}°</div>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full relative mx-1">
                <div className="absolute h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full" style={{ left: `${barLeft}%`, width: `${Math.max(barWidth, 3)}%` }} />
              </div>
              <div className="w-8 text-white text-xs flex-shrink-0">{Math.round(d.max)}°</div>
              {d.precipProb > 0 && <div className="w-12 text-blue-300 text-xs text-right flex-shrink-0">💧{d.precipProb}%</div>}
              {d.precipProb === 0 && <div className="w-12 flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
