'use client';
import React, { useState, useEffect } from 'react';
import CitySearch from '@/components/CitySearch';
import {
  fetchWeatherData, fetchGeoLocation,
  getWeatherInfo, getWindDirection, getWindLevel, getUVLevel, getAQILevel,
  getVisibilityLevel, getHumidityLevel,
  formatHour, formatDate, isToday, isTomorrow, timeAgo,
  getSavedLocations, saveLocation, removeLocation, makeLocationId,
  getLastLocation, setLastLocation,
  getLocalWeatherCache, setLocalWeatherCache,
  type SavedLocation,
} from '@/lib/weather';

export default function WeatherPage() {
  const [weatherData, setWeatherData] = useState<any>(null);
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [savedLocs, setSavedLocs] = useState<SavedLocation[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [cacheAge, setCacheAge] = useState<number>(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [useGPS, setUseGPS] = useState(false);

  useEffect(() => {
    setSavedLocs(getSavedLocations());
    const lastLoc = getLastLocation();
    if (lastLoc) {
      loadWeatherForLocation(lastLoc, false);
    } else {
      requestLocationPermission();
    }
  }, []);

  const requestLocationPermission = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const loc: SavedLocation = {
            id: makeLocationId(latitude, longitude),
            name: '当前位置（GPS）',
            latitude,
            longitude,
          };
          setUseGPS(true);
          loadWeatherForLocation(loc, false);
        },
        () => {
          loadWeatherByGeo();
        }
      );
    } else {
      loadWeatherByGeo();
    }
  };

  const loadWeatherByGeo = async () => {
    try {
      setLoading(true);
      setError('');
      const geoData = await fetchGeoLocation();
      const { latitude, longitude, cityName } = geoData.eo.geo;
      const loc: SavedLocation = {
        id: makeLocationId(latitude, longitude),
        name: cityName || '当前位置',
        latitude,
        longitude,
      };
      await loadWeatherForLocation(loc, false);
    } catch (err) {
      console.error('Load geo error:', err);
      setError('获取位置失败');
      setLoading(false);
    }
  };

  const loadWeatherForLocation = async (loc: SavedLocation, forceRefresh = false) => {
    try {
      if (!forceRefresh) setLoading(true);
      else setRefreshing(true);
      setError('');
      setLocation(loc);
      setLastLocation(loc);

      const cache = getLocalWeatherCache(loc.id);
      if (cache && !forceRefresh) {
        const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
        const ageMin = Math.floor(ageMs / 60000);
        setCacheAge(ageMin);
        setWeatherData(cache.data);
        setLoading(false);
        
        if (ageMin > 15) {
          setNeedsRefresh(true);
          backgroundRefresh(loc);
        }
        return;
      }

      const weather = await fetchWeatherData(loc.latitude, loc.longitude, forceRefresh);
      if (weather.error) throw new Error(weather.error);
      
      setWeatherData(weather);
      setLocalWeatherCache(loc.id, weather);
      setCacheAge(0);
      setNeedsRefresh(false);
    } catch (err) {
      console.error('Load weather error:', err);
      setError('加载天气失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const backgroundRefresh = async (loc: SavedLocation) => {
    try {
      const weather = await fetchWeatherData(loc.latitude, loc.longitude, true);
      if (!weather.error) {
        setLocalWeatherCache(loc.id, weather);
      }
    } catch (err) {
      console.error('Background refresh error:', err);
    }
  };

  const handleRefresh = () => {
    if (location) {
      setNeedsRefresh(false);
      loadWeatherForLocation(location, true);
    }
  };

  const handleSelectCity = (loc: SavedLocation) => {
    setShowSearch(false);
    loadWeatherForLocation(loc, false);
  };

  const handleSaveLocation = () => {
    if (location && !savedLocs.find(l => l.id === location.id)) {
      saveLocation(location);
      setSavedLocs(getSavedLocations());
    }
  };

  const handleRemoveLocation = (id: string) => {
    removeLocation(id);
    setSavedLocs(getSavedLocations());
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
          <button onClick={() => location && loadWeatherForLocation(location, true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg transition">重试</button>
        </div>
      </div>
    );
  }

  if (!weatherData || !location) return null;

  const { current, hourly, daily, air_quality } = weatherData;
  const wi = getWeatherInfo(current.weather_code, current.is_day);
  const nowHourIdx = new Date().getHours();
  const isSaved = savedLocs.some(l => l.id === location.id);

  return (
    <>
      {showSearch && <CitySearch onSelectCity={handleSelectCity} onClose={() => setShowSearch(false)} />}
      
      <div className={`min-h-screen bg-gradient-to-br ${wi.bg} p-3 md:p-6 pb-10 transition-all duration-500`}>
        <div className="max-w-6xl mx-auto space-y-4">
          
          {/* 顶部栏 */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-white/10 backdrop-blur rounded-xl p-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
                {wi.icon} {location.name}
              </h1>
              {cacheAge > 0 && (
                <p className="text-white/70 text-sm mt-1">数据更新于 {timeAgo(weatherData.cached_at)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {needsRefresh && (
                <button onClick={handleRefresh} className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg text-sm transition animate-pulse">
                  🔄 有新数据
                </button>
              )}
              <button onClick={() => setShowSaved(!showSaved)} className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-lg text-sm transition">
                ⭐ 收藏 ({savedLocs.length})
              </button>
              <button onClick={() => setShowSearch(true)} className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-lg text-sm transition">
                🔍 搜索
              </button>
              <button onClick={handleRefresh} disabled={refreshing} className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white py-2 px-4 rounded-lg text-sm transition">
                {refreshing ? '刷新中...' : '🔄 刷新'}
              </button>
              {!isSaved && (
                <button onClick={handleSaveLocation} className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-lg text-sm transition">
                  ⭐ 收藏此地
                </button>
              )}
              <a href="/geoInfo" className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-lg text-sm transition">
                📍 GeoInfo
              </a>
            </div>
          </div>

          {/* 收藏地点快捷栏 */}
          {showSaved && savedLocs.length > 0 && (
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <h3 className="text-white font-medium mb-3">⭐ 收藏的地点</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {savedLocs.map(loc => (
                  <div key={loc.id} className="flex-shrink-0 bg-white/10 hover:bg-white/20 rounded-lg p-3 min-w-[150px] group relative">
                    <button onClick={() => handleSelectCity(loc)} className="text-left w-full">
                      <div className="text-white font-medium">{loc.name}</div>
                      <div className="text-white/70 text-xs mt-1">{loc.admin1 || loc.country}</div>
                    </button>
                    <button
                      onClick={() => handleRemoveLocation(loc.id)}
                      className="absolute top-2 right-2 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 当前天气大卡片 */}
          <div className="bg-white/10 backdrop-blur rounded-xl p-6 md:p-8">
            <div className="flex items-center justify-between flex-wrap gap-6">
              <div>
                <div className="text-7xl md:text-8xl font-light text-white">{Math.round(current.temperature_2m)}°</div>
                <div className="text-2xl text-white/90 mt-2">{wi.label}</div>
                <div className="text-white/70 mt-1">体感 {Math.round(current.apparent_temperature)}°</div>
              </div>
              <div className="text-9xl">{wi.icon}</div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <InfoCard label="湿度" value={`${current.relative_humidity_2m}%`} icon="💧" extra={getHumidityLevel(current.relative_humidity_2m).label} />
              <InfoCard label="风速" value={`${current.wind_speed_10m} km/h`} icon="💨" extra={getWindDirection(current.wind_direction_10m) + ' ' + getWindLevel(current.wind_speed_10m).split('-')[0]} />
              <InfoCard label="气压" value={`${Math.round(current.pressure_msl)} hPa`} icon="🌡️" />
              <InfoCard label="云量" value={`${current.cloud_cover}%`} icon="☁️" />
            </div>
          </div>

          {/* 空气质量 + 紫外线 + 日出日落 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {air_quality && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-5">
                <h3 className="text-white/80 text-sm mb-3">🏭 空气质量</h3>
                <div className={`text-3xl font-bold ${getAQILevel(air_quality.us_aqi).color}`}>
                  {air_quality.us_aqi} - {getAQILevel(air_quality.us_aqi).label}
                </div>
                <div className="text-white/60 text-xs mt-2">{getAQILevel(air_quality.us_aqi).advice}</div>
                <div className="text-white/70 text-xs mt-3 space-y-1">
                  <div>PM2.5: {air_quality.pm2_5} μg/m³</div>
                  <div>PM10: {air_quality.pm10} μg/m³</div>
                </div>
              </div>
            )}
            {daily && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-5">
                <h3 className="text-white/80 text-sm mb-3">☀️ 紫外线指数</h3>
                <div className={`text-3xl font-bold ${getUVLevel(daily.uv_index_max[0]).color}`}>
                  {daily.uv_index_max[0]} - {getUVLevel(daily.uv_index_max[0]).label}
                </div>
                <div className="text-white/60 text-xs mt-2">{getUVLevel(daily.uv_index_max[0]).advice}</div>
                <div className="w-full bg-white/20 rounded-full h-2 mt-4">
                  <div className="bg-gradient-to-r from-green-400 via-yellow-400 via-orange-400 to-red-500 h-2 rounded-full" style={{ width: `${Math.min(daily.uv_index_max[0] / 11 * 100, 100)}%` }} />
                </div>
              </div>
            )}
            {daily && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-5">
                <h3 className="text-white/80 text-sm mb-3">🌅 日出日落</h3>
                <div className="flex justify-between items-center mt-3">
                  <div className="text-center">
                    <div className="text-3xl">🌅</div>
                    <div className="text-white font-medium mt-1">{daily.sunrise[0]?.slice(11, 16)}</div>
                    <div className="text-white/60 text-xs">日出</div>
                  </div>
                  <div className="flex-1 mx-4 h-0.5 bg-gradient-to-r from-yellow-400 to-orange-500 rounded" />
                  <div className="text-center">
                    <div className="text-3xl">🌇</div>
                    <div className="text-white font-medium mt-1">{daily.sunset[0]?.slice(11, 16)}</div>
                    <div className="text-white/60 text-xs">日落</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 48小时预报 */}
          {hourly && (
            <div className="bg-white/10 backdrop-blur rounded-xl p-5">
              <h3 className="text-white font-medium mb-4">⏰ 48小时预报</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 48 }).map((_, i) => {
                  const idx = nowHourIdx + i;
                  if (idx >= hourly.time.length) return null;
                  const info = getWeatherInfo(hourly.weather_code[idx]);
                  return (
                    <div key={i} className="flex-shrink-0 text-center min-w-[70px] bg-white/10 rounded-lg p-3">
                      <div className="text-white/80 text-xs">{i === 0 ? '现在' : formatHour(hourly.time[idx])}</div>
                      <div className="text-3xl my-2">{info.icon}</div>
                      <div className="text-white font-medium">{Math.round(hourly.temperature_2m[idx])}°</div>
                      {hourly.precipitation_probability[idx] > 0 && (
                        <div className="text-blue-300 text-xs mt-1">💧{hourly.precipitation_probability[idx]}%</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 15天预报 */}
          {daily && (
            <div className="bg-white/10 backdrop-blur rounded-xl p-5">
              <h3 className="text-white font-medium mb-4">📅 15天天气预报</h3>
              <div className="space-y-2">
                {daily.time.map((date: string, i: number) => {
                  const info = getWeatherInfo(daily.weather_code[i]);
                  const max = daily.temperature_2m_max[i];
                  const min = daily.temperature_2m_min[i];
                  const allMax = Math.max(...daily.temperature_2m_max);
                  const allMin = Math.min(...daily.temperature_2m_min);
                  const range = allMax - allMin || 1;
                  const barLeft = ((min - allMin) / range) * 100;
                  const barWidth = ((max - min) / range) * 100;
                  
                  return (
                    <div key={i} className={`flex items-center gap-3 py-3 px-3 rounded-lg ${isToday(date) ? 'bg-white/20' : 'hover:bg-white/10'} transition`}>
                      <div className="w-20 text-white/80 text-sm flex-shrink-0">
                        {isToday(date) ? '今天' : isTomorrow(date) ? '明天' : formatDate(date)}
                      </div>
                      <div className="w-8 text-center flex-shrink-0 text-2xl">{info.icon}</div>
                      <div className="w-16 text-white/70 text-xs flex-shrink-0 hidden md:block">{info.label}</div>
                      <div className="w-10 text-white/80 text-sm text-right flex-shrink-0">{Math.round(min)}°</div>
                      <div className="flex-1 h-2 bg-white/10 rounded-full relative mx-2">
                        <div className="absolute h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full" style={{ left: `${barLeft}%`, width: `${Math.max(barWidth, 3)}%` }} />
                      </div>
                      <div className="w-10 text-white text-sm flex-shrink-0">{Math.round(max)}°</div>
                      {daily.precipitation_probability_max[i] > 0 && (
                        <div className="w-14 text-blue-300 text-xs text-right flex-shrink-0">💧{daily.precipitation_probability_max[i]}%</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 页脚 */}
          <div className="text-center text-white/50 text-xs pt-4">
            <p>数据来源: Open-Meteo • Powered by EdgeOne Pages</p>
            {useGPS && <p className="mt-1">📍 使用 GPS 精确定位</p>}
          </div>
        </div>
      </div>
    </>
  );
}

function InfoCard({ label, value, icon, extra }: { label: string; value: string; icon: string; extra?: string }) {
  return (
    <div className="bg-white/10 rounded-lg p-4 text-center">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-white font-medium text-lg">{value}</div>
      <div className="text-white/70 text-xs mt-1">{label}</div>
      {extra && <div className="text-white/60 text-xs mt-1">{extra}</div>}
    </div>
  );
}
