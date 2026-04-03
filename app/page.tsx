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
  getDataSource, setDataSource,
  type SavedLocation, type WeatherDataSource,
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
  const [dataSource, setDataSourceState] = useState<WeatherDataSource>('openmeteo');

  useEffect(() => {
    loadSavedLocations();
    const savedSource = getDataSource();
    setDataSourceState(savedSource);
    const lastLoc = getLastLocation();
    if (lastLoc) {
      loadWeatherForLocation(lastLoc, false, savedSource);
    } else {
      requestLocationPermission();
    }
  }, []);

  const loadSavedLocations = async () => {
    const locs = await getSavedLocations();
    setSavedLocs(locs);
  };

  const requestLocationPermission = async () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUseGPS(true);
          try {
            const geoData = await fetchGeoLocation();
            const loc: SavedLocation = {
              id: makeLocationId(latitude, longitude),
              name: geoData.eo.geo.cityName || '当前位置',
              latitude, longitude,
            };
            loadWeatherForLocation(loc, false);
          } catch {
            const loc: SavedLocation = {
              id: makeLocationId(latitude, longitude),
              name: '当前位置',
              latitude, longitude,
            };
            loadWeatherForLocation(loc, false);
          }
        },
        () => { loadWeatherByGeo(); }
      );
    } else {
      loadWeatherByGeo();
    }
  };

  const loadWeatherByGeo = async () => {
    try {
      setLoading(true); setError('');
      const geoData = await fetchGeoLocation();
      const { latitude, longitude, cityName } = geoData.eo.geo;
      const loc: SavedLocation = { id: makeLocationId(latitude, longitude), name: cityName || '当前位置', latitude, longitude };
      await loadWeatherForLocation(loc, false, dataSource);
    } catch (err) {
      console.error('Load geo error:', err);
      setError('获取位置失败'); setLoading(false);
    }
  };

  const loadWeatherForLocation = async (loc: SavedLocation, forceRefresh = false, source?: WeatherDataSource) => {
    const activeSource = source || dataSource;
    const cacheId = `${loc.id}_${activeSource}`;
    try {
      if (!forceRefresh) setLoading(true); else setRefreshing(true);
      setError(''); setLocation(loc); setLastLocation(loc);
      const cache = getLocalWeatherCache(cacheId);
      if (cache && !forceRefresh) {
        const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
        const ageMin = Math.floor(ageMs / 60000);
        setCacheAge(ageMin); setWeatherData(cache.data); setLoading(false);
        if (ageMin > 15) { setNeedsRefresh(true); backgroundRefresh(loc, activeSource); }
        return;
      }
      const weather = await fetchWeatherData(loc.latitude, loc.longitude, forceRefresh, activeSource);
      if (weather.error) throw new Error(weather.error);
      setWeatherData(weather); setLocalWeatherCache(cacheId, weather); setCacheAge(0); setNeedsRefresh(false);
    } catch (err) {
      console.error('Load weather error:', err); setError('加载天气失败，请检查数据源配置');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  const backgroundRefresh = async (loc: SavedLocation, source?: WeatherDataSource) => {
    const activeSource = source || dataSource;
    try {
      const weather = await fetchWeatherData(loc.latitude, loc.longitude, true, activeSource);
      if (!weather.error) setLocalWeatherCache(`${loc.id}_${activeSource}`, weather);
    } catch (err) { console.error('Background refresh error:', err); }
  };

  const handleRefresh = () => { if (location) { setNeedsRefresh(false); loadWeatherForLocation(location, true); } };
  const handleSelectCity = (loc: SavedLocation) => { setShowSearch(false); loadWeatherForLocation(loc, false); };

  const handleSourceChange = (source: WeatherDataSource) => {
    setDataSourceState(source);
    setDataSource(source);
    if (location) {
      loadWeatherForLocation(location, true, source);
    }
  };
  const handleSaveLocation = async () => {
    if (location && !savedLocs.find((l: SavedLocation) => l.id === location.id)) {
      const updated = await saveLocation(location); setSavedLocs(updated);
    }
  };
  const handleRemoveLocation = async (id: string) => { const updated = await removeLocation(id); setSavedLocs(updated); };

  // 根据天气状况动态背景
  const getBgGradient = () => {
    if (!weatherData) return 'from-sky-900 via-blue-800 to-indigo-900';
    const code = weatherData.current.weather_code;
    const isDay = weatherData.current.is_day;
    if (!isDay) return 'from-slate-950 via-indigo-950 to-slate-900';
    if (code <= 1) return 'from-sky-400 via-blue-500 to-indigo-600'; // 晴天
    if (code <= 3) return 'from-sky-500 via-blue-600 to-slate-700'; // 多云
    if (code >= 51 && code <= 67) return 'from-slate-600 via-blue-700 to-slate-800'; // 雨
    if (code >= 71 && code <= 77) return 'from-slate-400 via-blue-300 to-slate-500'; // 雪
    if (code >= 95) return 'from-gray-800 via-slate-700 to-gray-900'; // 雷暴
    return 'from-sky-500 via-blue-600 to-indigo-700';
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${getBgGradient()} flex items-center justify-center`}>
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-white/90 mt-6 text-lg font-light tracking-wide">加载天气数据中...</p>
        </div>
      </div>
    );
  }

  if (error && !weatherData) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${getBgGradient()} flex items-center justify-center p-4`}>
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl p-8 max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-white/90 text-lg">{error}</p>
          <button onClick={() => location && loadWeatherForLocation(location, true)} className="mt-6 bg-white/20 hover:bg-white/30 text-white py-3 px-8 rounded-xl transition backdrop-blur">重试</button>
        </div>
      </div>
    );
  }

  if (!weatherData || !location) return null;

  const { current, hourly, daily, air_quality } = weatherData;
  const wi = getWeatherInfo(current.weather_code, current.is_day);
  const nowHourIdx = new Date().getHours();
  const isSaved = savedLocs.some((l: SavedLocation) => l.id === location.id);

  return (
    <>
      {showSearch && <CitySearch onSelectCity={handleSelectCity} onClose={() => setShowSearch(false)} />}
      
      <div className={`min-h-screen bg-gradient-to-br ${getBgGradient()} p-3 md:p-6 pb-10 transition-all duration-1000`}>
        <div className="max-w-6xl mx-auto space-y-4">
          
          {/* 顶部栏 - 毛玻璃效果 */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-white/10 backdrop-blur-2xl rounded-2xl p-4 shadow-lg border border-white/20">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2 drop-shadow-lg">
                {wi.icon} {location.name}
              </h1>
              {cacheAge > 0 && (
                <p className="text-white/60 text-sm mt-1">数据更新于 {timeAgo(weatherData.cached_at)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 数据源切换 */}
              <div className="flex bg-white/10 rounded-xl p-1 border border-white/10">
                <button 
                  onClick={() => handleSourceChange('openmeteo')}
                  className={`px-2 py-1 rounded-lg text-xs transition-all ${dataSource === 'openmeteo' ? 'bg-white/20 text-white font-medium' : 'text-white/60 hover:text-white/80'}`}
                >
                  🌍 Open-Meteo
                </button>
                <button 
                  onClick={() => handleSourceChange('qweather')}
                  className={`px-2 py-1 rounded-lg text-xs transition-all ${dataSource === 'qweather' ? 'bg-white/20 text-white font-medium' : 'text-white/60 hover:text-white/80'}`}
                >
                  🇨🇳 和风
                </button>
                <button 
                  onClick={() => handleSourceChange('owm')}
                  className={`px-2 py-1 rounded-lg text-xs transition-all ${dataSource === 'owm' ? 'bg-white/20 text-white font-medium' : 'text-white/60 hover:text-white/80'}`}
                >
                  🌐 OWM
                </button>
              </div>
              {needsRefresh && (
                <button onClick={handleRefresh} className="bg-emerald-500/80 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/30 animate-pulse">
                  ✨ 有新数据
                </button>
              )}
              <button onClick={() => setShowSaved(!showSaved)} className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-xl text-sm transition-all backdrop-blur border border-white/10">
                ⭐ {savedLocs.length}
              </button>
              <button onClick={() => setShowSearch(true)} className="bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-xl text-sm transition-all backdrop-blur border border-white/10">
                🔍 搜索
              </button>
              <button onClick={handleRefresh} disabled={refreshing} className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white py-2 px-4 rounded-xl text-sm transition-all backdrop-blur border border-white/10">
                {refreshing ? '⏳' : '🔄'}
              </button>
              {!isSaved && (
                <button onClick={handleSaveLocation} className="bg-amber-500/80 hover:bg-amber-500 text-white py-2 px-4 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20">
                  ⭐ 收藏
                </button>
              )}
            </div>
          </div>

          {/* 收藏地点 */}
          {showSaved && savedLocs.length > 0 && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-4 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-3 text-sm">⭐ 收藏的地点</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {savedLocs.map((loc: SavedLocation) => (
                  <div key={loc.id} className="flex-shrink-0 bg-white/10 hover:bg-white/20 rounded-xl p-3 min-w-[140px] group relative transition-all border border-white/10">
                    <button onClick={() => handleSelectCity(loc)} className="text-left w-full">
                      <div className="text-white font-medium text-sm">{loc.name}</div>
                      <div className="text-white/50 text-xs mt-1">{loc.admin1 || loc.country}</div>
                    </button>
                    <button onClick={() => handleRemoveLocation(loc.id)} className="absolute top-2 right-2 text-red-300 hover:text-red-200 opacity-0 group-hover:opacity-100 transition text-sm">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 当前天气主卡片 */}
          <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-6 md:p-10 shadow-2xl border border-white/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between flex-wrap gap-6">
                <div>
                  <div className="text-8xl md:text-9xl font-extralight text-white tracking-tighter drop-shadow-2xl">{Math.round(current.temperature_2m)}°</div>
                  <div className="text-xl md:text-2xl text-white/90 mt-2 font-light">{wi.label}</div>
                  <div className="text-white/60 mt-1 text-sm">体感温度 {Math.round(current.apparent_temperature)}°C</div>
                  {daily && <div className="text-white/50 text-sm mt-1">↑{Math.round(daily.temperature_2m_max[0])}° ↓{Math.round(daily.temperature_2m_min[0])}°</div>}
                </div>
                <div className="text-[120px] md:text-[160px] leading-none drop-shadow-2xl">{wi.icon}</div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
                <GlassCard label="湿度" value={`${current.relative_humidity_2m}%`} icon="💧" extra={getHumidityLevel(current.relative_humidity_2m).label} />
                <GlassCard label="风速" value={`${current.wind_speed_10m} km/h`} icon="💨" extra={getWindDirection(current.wind_direction_10m) + ' ' + getWindLevel(current.wind_speed_10m).split('-')[0]} />
                <GlassCard label="气压" value={`${Math.round(current.pressure_msl)} hPa`} icon="🌡️" extra={current.surface_pressure < current.pressure_msl ? '低压' : '高压'} />
                <GlassCard label="云量" value={`${current.cloud_cover}%`} icon="☁️" extra={current.cloud_cover < 25 ? '晴朗' : current.cloud_cover < 50 ? '少云' : current.cloud_cover < 75 ? '多云' : '阴天'} />
              </div>
            </div>
          </div>

          {/* 三栏信息卡 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {air_quality && (
              <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
                <h3 className="text-white/70 text-xs uppercase tracking-wider mb-3">🏭 空气质量</h3>
                <div className={`text-4xl font-bold ${getAQILevel(air_quality.us_aqi).color} drop-shadow`}>
                  {air_quality.us_aqi}
                </div>
                <div className={`text-lg font-medium mt-1 ${getAQILevel(air_quality.us_aqi).color}`}>{getAQILevel(air_quality.us_aqi).label}</div>
                <div className="text-white/50 text-xs mt-2">{getAQILevel(air_quality.us_aqi).advice}</div>
                <div className="w-full bg-white/10 rounded-full h-2 mt-4">
                  <div className={`h-2 rounded-full transition-all ${air_quality.us_aqi <= 50 ? 'bg-green-400' : air_quality.us_aqi <= 100 ? 'bg-yellow-400' : air_quality.us_aqi <= 150 ? 'bg-orange-400' : 'bg-red-500'}`} style={{ width: `${Math.min(air_quality.us_aqi / 300 * 100, 100)}%` }} />
                </div>
                <div className="flex justify-between text-white/40 text-xs mt-3">
                  <span>PM2.5: {air_quality.pm2_5}μg/m³</span>
                  <span>PM10: {air_quality.pm10}μg/m³</span>
                </div>
              </div>
            )}
            {daily && (
              <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
                <h3 className="text-white/70 text-xs uppercase tracking-wider mb-3">☀️ 紫外线指数</h3>
                <div className={`text-4xl font-bold ${getUVLevel(daily.uv_index_max[0]).color} drop-shadow`}>
                  {daily.uv_index_max[0]}
                </div>
                <div className={`text-lg font-medium mt-1 ${getUVLevel(daily.uv_index_max[0]).color}`}>{getUVLevel(daily.uv_index_max[0]).label}</div>
                <div className="text-white/50 text-xs mt-2">{getUVLevel(daily.uv_index_max[0]).advice}</div>
                <div className="w-full bg-white/10 rounded-full h-2 mt-4">
                  <div className="bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 h-2 rounded-full" style={{ width: `${Math.min(daily.uv_index_max[0] / 11 * 100, 100)}%` }} />
                </div>
              </div>
            )}
            {daily && (
              <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
                <h3 className="text-white/70 text-xs uppercase tracking-wider mb-3">🌅 日出日落</h3>
                <div className="flex justify-between items-center mt-4">
                  <div className="text-center">
                    <div className="text-4xl mb-1">🌅</div>
                    <div className="text-white font-semibold text-lg">{daily.sunrise[0]?.slice(11, 16)}</div>
                    <div className="text-white/50 text-xs">日出</div>
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="h-1 bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-400 rounded-full shadow-lg shadow-amber-500/30" />
                  </div>
                  <div className="text-center">
                    <div className="text-4xl mb-1">🌇</div>
                    <div className="text-white font-semibold text-lg">{daily.sunset[0]?.slice(11, 16)}</div>
                    <div className="text-white/50 text-xs">日落</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 卫星云图 / 雷达图 */}
          {location && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4">🛰️ 卫星云图 & 气象雷达</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <div className="text-white/60 text-xs p-2 bg-white/5">☁️ 云层分布</div>
                  <img 
                    src={`https://maps.open-meteo.com/v1/map/cloud_cover?latitude=${location.latitude}&longitude=${location.longitude}&zoom=6&width=600&height=400`}
                    alt="Cloud cover map"
                    className="w-full h-48 md:h-64 object-cover bg-gray-800"
                    onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                  />
                  <div className="hidden w-full h-48 md:h-64 items-center justify-center bg-gray-800/50 text-white/40 text-sm">
                    云图加载中...
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <div className="text-white/60 text-xs p-2 bg-white/5">🌧️ 降水分布</div>
                  <img 
                    src={`https://maps.open-meteo.com/v1/map/precipitation?latitude=${location.latitude}&longitude=${location.longitude}&zoom=6&width=600&height=400`}
                    alt="Precipitation map"
                    className="w-full h-48 md:h-64 object-cover bg-gray-800"
                    onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                  />
                  <div className="hidden w-full h-48 md:h-64 items-center justify-center bg-gray-800/50 text-white/40 text-sm">
                    降水图加载中...
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 降水预报柱状图 */}
          {hourly && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4">🌧️ 24小时降水预报</h3>
              <div className="flex items-end gap-1 h-36 overflow-x-auto pb-2">
                {Array.from({ length: 24 }).map((_, i) => {
                  const idx = nowHourIdx + i;
                  if (idx >= hourly.time.length) return null;
                  const precip = hourly.precipitation[idx] || 0;
                  const prob = hourly.precipitation_probability[idx] || 0;
                  const maxP = Math.max(...hourly.precipitation.slice(nowHourIdx, nowHourIdx + 24).map((p: number) => p || 0), 1);
                  const h = (precip / maxP) * 100;
                  return (
                    <div key={i} className="flex-shrink-0 flex flex-col items-center min-w-[38px] group">
                      <div className="text-cyan-300 text-xs mb-1 opacity-0 group-hover:opacity-100 transition font-mono">{precip.toFixed(1)}</div>
                      <div className="flex-1 flex items-end w-full px-0.5">
                        <div className="w-full bg-gradient-to-t from-cyan-500 to-sky-300 rounded-t-sm transition-all group-hover:from-cyan-400 group-hover:to-sky-200 shadow-lg shadow-cyan-500/20" style={{ height: `${Math.max(h, precip > 0 ? 6 : 0)}%` }} />
                      </div>
                      {prob > 0 && <div className="text-cyan-300/70 text-xs mt-1 font-mono">{prob}%</div>}
                      <div className="text-white/40 text-xs mt-1">{i === 0 ? '现在' : formatHour(hourly.time[idx])}</div>
                    </div>
                  );
                })}
              </div>
              {hourly.precipitation.slice(nowHourIdx, nowHourIdx + 24).every((p: number) => !p || p === 0) && (
                <div className="text-center text-white/40 text-sm mt-2">🌤️ 未来24小时无降水</div>
              )}
            </div>
          )}

          {/* 48小时逐时预报 */}
          {hourly && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4">⏰ 48小时逐时预报</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {Array.from({ length: 48 }).map((_, i) => {
                  const idx = nowHourIdx + i;
                  if (idx >= hourly.time.length) return null;
                  const info = getWeatherInfo(hourly.weather_code[idx]);
                  const isNow = i === 0;
                  return (
                    <div key={i} className={`flex-shrink-0 text-center min-w-[72px] rounded-xl p-3 transition-all border ${isNow ? 'bg-white/20 border-white/30 shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/15'}`}>
                      <div className={`text-xs ${isNow ? 'text-amber-300 font-medium' : 'text-white/60'}`}>{isNow ? '现在' : formatHour(hourly.time[idx])}</div>
                      <div className="text-3xl my-2 drop-shadow">{info.icon}</div>
                      <div className="text-white font-semibold">{Math.round(hourly.temperature_2m[idx])}°</div>
                      {hourly.precipitation_probability[idx] > 0 && (
                        <div className="text-cyan-300 text-xs mt-1 font-mono">💧{hourly.precipitation_probability[idx]}%</div>
                      )}
                      {hourly.wind_speed_10m && (
                        <div className="text-white/40 text-xs mt-1">🌬️{Math.round(hourly.wind_speed_10m[idx])}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 能见度 & 风速 & 紫外线逐时 */}
          {hourly && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 能见度变化 */}
              {hourly.visibility && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
                  <h3 className="text-white/90 font-medium mb-4">👁️ 24小时能见度</h3>
                  <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
                    {Array.from({ length: 24 }).map((_, i) => {
                      const idx = nowHourIdx + i;
                      if (idx >= hourly.visibility.length) return null;
                      const vis = hourly.visibility[idx] / 1000; // 转km
                      const maxVis = 50;
                      const h = Math.min((vis / maxVis) * 100, 100);
                      const color = vis >= 10 ? 'from-emerald-400 to-green-300' : vis >= 5 ? 'from-yellow-400 to-amber-300' : 'from-red-400 to-orange-300';
                      return (
                        <div key={i} className="flex-shrink-0 flex flex-col items-center min-w-[36px] group">
                          <div className="text-white/60 text-xs mb-1 opacity-0 group-hover:opacity-100 transition font-mono">{vis.toFixed(0)}km</div>
                          <div className="flex-1 flex items-end w-full px-0.5">
                            <div className={`w-full bg-gradient-to-t ${color} rounded-t-sm transition-all`} style={{ height: `${h}%` }} />
                          </div>
                          <div className="text-white/40 text-xs mt-1">{i === 0 ? '现在' : formatHour(hourly.time[idx])}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* UV 逐时 */}
              {hourly.uv_index && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
                  <h3 className="text-white/90 font-medium mb-4">☀️ 24小时紫外线</h3>
                  <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
                    {Array.from({ length: 24 }).map((_, i) => {
                      const idx = nowHourIdx + i;
                      if (idx >= hourly.uv_index.length) return null;
                      const uv = hourly.uv_index[idx];
                      const h = Math.min((uv / 11) * 100, 100);
                      const color = uv <= 2 ? 'from-green-400 to-green-300' : uv <= 5 ? 'from-yellow-400 to-amber-300' : uv <= 7 ? 'from-orange-400 to-orange-300' : 'from-red-500 to-rose-400';
                      return (
                        <div key={i} className="flex-shrink-0 flex flex-col items-center min-w-[36px] group">
                          <div className="text-white/60 text-xs mb-1 opacity-0 group-hover:opacity-100 transition font-mono">{uv.toFixed(1)}</div>
                          <div className="flex-1 flex items-end w-full px-0.5">
                            <div className={`w-full bg-gradient-to-t ${color} rounded-t-sm transition-all`} style={{ height: `${Math.max(h, uv > 0 ? 4 : 0)}%` }} />
                          </div>
                          <div className="text-white/40 text-xs mt-1">{i === 0 ? '现在' : formatHour(hourly.time[idx])}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 15天预报 */}
          {daily && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4">📅 15天天气预报</h3>
              <div className="space-y-1">
                {daily.time.map((date: string, i: number) => {
                  const info = getWeatherInfo(daily.weather_code[i]);
                  const max = daily.temperature_2m_max[i];
                  const min = daily.temperature_2m_min[i];
                  const allMax = Math.max(...daily.temperature_2m_max);
                  const allMin = Math.min(...daily.temperature_2m_min);
                  const range = allMax - allMin || 1;
                  const barLeft = ((min - allMin) / range) * 100;
                  const barWidth = ((max - min) / range) * 100;
                  const today = isToday(date);
                  
                  return (
                    <div key={i} className={`flex items-center gap-3 py-3 px-4 rounded-xl transition-all ${today ? 'bg-white/15 border border-white/20 shadow-lg' : 'hover:bg-white/10'}`}>
                      <div className="w-16 md:w-20 flex-shrink-0">
                        <div className={`text-sm font-medium ${today ? 'text-amber-300' : 'text-white/80'}`}>
                          {today ? '今天' : isTomorrow(date) ? '明天' : formatDate(date)}
                        </div>
                      </div>
                      <div className="w-9 text-center flex-shrink-0 text-2xl drop-shadow">{info.icon}</div>
                      <div className="w-14 text-white/60 text-xs flex-shrink-0 hidden md:block">{info.label}</div>
                      <div className="w-10 text-white/70 text-sm text-right flex-shrink-0 font-mono">{Math.round(min)}°</div>
                      <div className="flex-1 h-2 bg-white/10 rounded-full relative mx-2">
                        <div className="absolute h-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 rounded-full shadow-sm" style={{ left: `${barLeft}%`, width: `${Math.max(barWidth, 4)}%` }} />
                      </div>
                      <div className="w-10 text-white font-medium text-sm flex-shrink-0 font-mono">{Math.round(max)}°</div>
                      <div className="w-16 flex-shrink-0 text-right">
                        {daily.precipitation_probability_max[i] > 0 && (
                          <span className="text-cyan-300 text-xs font-mono">💧{daily.precipitation_probability_max[i]}%</span>
                        )}
                      </div>
                      <div className="w-16 flex-shrink-0 text-right hidden md:block">
                        {daily.wind_speed_10m_max && (
                          <span className="text-white/40 text-xs font-mono">🌬️{Math.round(daily.wind_speed_10m_max[i])}km/h</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 详细数据面板 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <GlassCard label="地面气压" value={`${Math.round(current.surface_pressure)} hPa`} icon="📊" />
            {daily && <GlassCard label="今日降水" value={`${daily.precipitation_sum[0]} mm`} icon="🌧️" />}
            {daily && daily.wind_speed_10m_max && <GlassCard label="最大风速" value={`${Math.round(daily.wind_speed_10m_max[0])} km/h`} icon="🌪️" extra={getWindLevel(daily.wind_speed_10m_max[0]).split('-')[0]} />}
            <GlassCard label="风向" value={getWindDirection(current.wind_direction_10m)} icon="🧭" extra={`${current.wind_direction_10m}°`} />
          </div>

          {/* 页脚 */}
          <div className="text-center text-white/30 text-xs pt-6 pb-4 space-y-1">
            <p>数据来源: {weatherData.data_source === 'QWeather' ? '和风天气 API' : weatherData.data_source === 'OpenWeatherMap' ? 'OpenWeatherMap API' : 'Open-Meteo API'}</p>
            <p>Powered by EdgeOne Pages {useGPS ? '• 📍 GPS定位' : ''}</p>
            <a href="/geoInfo" className="text-white/40 hover:text-white/60 transition inline-block mt-2">📍 GeoInfo 页面 →</a>
          </div>
        </div>
      </div>
    </>
  );
}

function GlassCard({ label, value, icon, extra }: { label: string; value: string; icon: string; extra?: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-xl p-4 text-center border border-white/10 hover:bg-white/15 transition-all group">
      <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{icon}</div>
      <div className="text-white font-semibold text-lg">{value}</div>
      <div className="text-white/50 text-xs mt-1">{label}</div>
      {extra && <div className="text-white/40 text-xs mt-1">{extra}</div>}
    </div>
  );
}
