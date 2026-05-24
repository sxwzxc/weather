'use client';
import React, { useState, useEffect, useMemo } from 'react';
import CitySearch from '@/components/CitySearch';
import {
  fetchWeatherData, fetchGeoLocation, fetchWeatherDirectOpenMeteo,
  getWeatherInfo, getWindDirection, getWindLevel, getUVLevel, getAQILevel,
  getVisibilityLevel, getHumidityLevel,
  formatHour, formatDate, isToday, isTomorrow, timeAgo,
  getSavedLocations, saveLocation, removeLocation, makeLocationId,
  getLastLocation, setLastLocation,
  getLocalWeatherCache, setLocalWeatherCache,
  getDataSource, setDataSource,
  addRecentSearch,
  type SavedLocation, type WeatherDataSource,
} from '@/lib/weather';

// ============ 数据可用性检测 ============
interface DataCaps {
  hasCurrent: boolean;
  hasHourly: boolean;
  hasHourlyTemps: boolean;
  hasHourlyPrecip: boolean;
  hasHourlyPrecipProb: boolean;
  hasHourlyVisibility: boolean;
  hasHourlyUV: boolean;
  hasHourlyWind: boolean;
  hasDaily: boolean;
  hasDailyTemps: boolean;
  hasDailyUV: boolean;
  hasDailyPrecip: boolean;
  hasDailyPrecipProb: boolean;
  hasDailyWind: boolean;
  hasSunrise: boolean;
  hasAirQuality: boolean;
  hasCloudCover: boolean;
  hasFeelsLike: boolean;
  hasDewPoint: boolean;
  hasCurrentUV: boolean;
  hasPressure: boolean;
  hasWind: boolean;
  source: string;
}

function detectCapabilities(data: any): DataCaps {
  if (!data) return {} as DataCaps;
  const c = data.current || {};
  const h = data.hourly || {};
  const d = data.daily || {};
  const aq = data.air_quality;

  const hasHourlyArr = Array.isArray(h.time) && h.time.length > 0;
  const hasDailyArr = Array.isArray(d.time) && d.time.length > 0;

  return {
    hasCurrent: !!c && c.temperature_2m !== undefined,
    hasHourly: hasHourlyArr,
    hasHourlyTemps: hasHourlyArr && Array.isArray(h.temperature_2m) && h.temperature_2m.length > 0,
    hasHourlyPrecip: hasHourlyArr && Array.isArray(h.precipitation),
    hasHourlyPrecipProb: hasHourlyArr && Array.isArray(h.precipitation_probability),
    hasHourlyVisibility: hasHourlyArr && Array.isArray(h.visibility),
    hasHourlyUV: hasHourlyArr && Array.isArray(h.uv_index),
    hasHourlyWind: hasHourlyArr && Array.isArray(h.wind_speed_10m),
    hasDaily: hasDailyArr,
    hasDailyTemps: hasDailyArr && Array.isArray(d.temperature_2m_max),
    hasDailyUV: hasDailyArr && Array.isArray(d.uv_index_max) && d.uv_index_max.some((v: number) => v > 0),
    hasDailyPrecip: hasDailyArr && Array.isArray(d.precipitation_sum),
    hasDailyPrecipProb: hasDailyArr && Array.isArray(d.precipitation_probability_max),
    hasDailyWind: hasDailyArr && Array.isArray(d.wind_speed_10m_max),
    hasSunrise: hasDailyArr && Array.isArray(d.sunrise) && d.sunrise[0] && d.sunrise[0].length > 10,
    hasAirQuality: !!aq && aq.us_aqi !== undefined,
    hasCloudCover: c.cloud_cover !== undefined,
    hasFeelsLike: c.apparent_temperature !== undefined,
    hasDewPoint: c.dew_point !== undefined,
    hasCurrentUV: c.uv_index !== undefined,
    hasPressure: c.pressure_msl !== undefined,
    hasWind: c.wind_speed_10m !== undefined,
    source: data.resolved_source || data.data_source || 'unknown',
  };
}

// ============ 子组件 ============

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

/** 数据可用性标签 */
function DataCapBadge({ caps }: { caps: DataCaps }) {
  const items: { label: string; ok: boolean }[] = [
    { label: '空气质量', ok: caps.hasAirQuality },
    { label: '能见度', ok: caps.hasHourlyVisibility },
    { label: '紫外线', ok: caps.hasDailyUV || caps.hasCurrentUV },
    { label: '露点', ok: caps.hasDewPoint },
    { label: '云量', ok: caps.hasCloudCover },
    { label: '日出日落', ok: caps.hasSunrise },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className={`text-xs px-1.5 py-0.5 rounded-full ${
            item.ok ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-gray-500/20 text-gray-500 border border-gray-500/20'
          }`}
        >
          {item.ok ? '✓' : '✗'} {item.label}
        </span>
      ))}
    </div>
  );
}

/** 48小时温度趋势 */
function TemperatureTrend({ hourly, nowHourIdx, caps }: { hourly: any; nowHourIdx: number; caps: DataCaps }) {
  if (!caps.hasHourlyTemps) return null;
  const count = Math.min(48, hourly.temperature_2m.length - nowHourIdx);
  if (count < 2) return null;

  const temps = hourly.temperature_2m.slice(nowHourIdx, nowHourIdx + count);
  const times = hourly.time.slice(nowHourIdx, nowHourIdx + count);
  const minT = Math.min(...temps) - 2;
  const maxT = Math.max(...temps) + 2;
  const range = maxT - minT || 1;

  const w = 600, h = 140, padL = 30, padR = 10, padT = 10, padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const points = temps.map((t: number, i: number) => {
    const x = padL + (i / (count - 1)) * chartW;
    const y = padT + chartH - ((t - minT) / range) * chartH;
    return `${x},${y}`;
  });
  const polyline = points.join(' ');
  const yTicks = [Math.ceil(minT), Math.round((minT + maxT) / 2), Math.floor(maxT)];
  const fillPath = `${polyline} ${padL + chartW},${padT + chartH} ${padL},${padT + chartH}`;

  return (
    <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
      <h3 className="text-white/90 font-medium mb-3">📈 48小时温度趋势</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto min-w-[500px]" preserveAspectRatio="xMidYMid meet">
          {yTicks.map((tick) => {
            const y = padT + chartH - ((tick - minT) / range) * chartH;
            return (
              <g key={`y_${tick}`}>
                <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="rgba(255,255,255,0.1)" strokeDasharray="4,4" />
                <text x={padL - 5} y={y + 4} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">{tick}°</text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(251,191,36,0.4)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.05)" />
            </linearGradient>
          </defs>
          <polygon points={fillPath} fill="url(#tempGrad)" />
          <polyline points={polyline} fill="none" stroke="rgba(251,191,36,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {temps.map((t: number, i: number) => {
            const x = padL + (i / (count - 1)) * chartW;
            const y = padT + chartH - ((t - minT) / range) * chartH;
            const isNow = i === 0;
            const showLabel = i === 0 || i === count - 1 || i % 6 === 0;
            return (
              <g key={`pt_${i}`}>
                <circle cx={x} cy={y} r={isNow ? 5 : 3} fill={isNow ? '#fbbf24' : 'rgba(147,197,253,0.8)'} stroke="white" strokeWidth="1" />
                {showLabel && (
                  <text x={x} y={y - 8} fill="rgba(255,255,255,0.8)" fontSize="10" textAnchor="middle" fontWeight={isNow ? 'bold' : 'normal'}>
                    {Math.round(t)}°
                  </text>
                )}
              </g>
            );
          })}
          {times.map((time: string, i: number) => {
            if (i === 0 || i === count - 1 || i % 6 === 0) {
              const x = padL + (i / (count - 1)) * chartW;
              return (
                <text key={`tx_${i}`} x={x} y={h - 5} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle">
                  {i === 0 ? '现在' : formatHour(time)}
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>
    </div>
  );
}

/** 天气简报 - 根据实际数据动态生成 */
function WeatherSummary({ current, daily, hourly, caps }: { current: any; daily: any; hourly: any; caps: DataCaps }) {
  if (!caps.hasCurrent) return null;

  const lines: string[] = [];

  // 体感温度
  if (caps.hasFeelsLike && current.temperature_2m !== undefined) {
    const feelsLike = current.apparent_temperature;
    const temp = current.temperature_2m;
    if (feelsLike > temp + 3) lines.push(`体感温度 ${Math.round(feelsLike)}°，比实际偏高，体感闷热`);
    else if (feelsLike < temp - 3) lines.push(`体感温度 ${Math.round(feelsLike)}°，比实际偏低，注意保暖`);
    else lines.push(`体感温度 ${Math.round(feelsLike)}°，与实际温度接近`);
  }

  // 温差
  if (caps.hasDailyTemps && daily.temperature_2m_max?.[0] !== undefined) {
    const todayMax = daily.temperature_2m_max[0];
    const todayMin = daily.temperature_2m_min[0];
    if (todayMax !== undefined && todayMin !== undefined) {
      const diff = Math.round(todayMax - todayMin);
      lines.push(`今日温差 ${diff}°（↑${Math.round(todayMax)}° ↓${Math.round(todayMin)}°）`);
    }
  }

  // 降水
  if (caps.hasDailyPrecipProb && daily.precipitation_probability_max?.[0] !== undefined) {
    const prob = daily.precipitation_probability_max[0];
    if (prob > 60) lines.push(`降水概率 ${prob}%，今日可能降雨，建议携带雨具`);
    else if (prob > 30) lines.push(`降水概率 ${prob}%，晴雨不定，随身带伞`);
  }
  if (caps.hasDailyPrecip && daily.precipitation_sum?.[0] > 0) {
    lines.push(`预计降水量 ${daily.precipitation_sum[0].toFixed(1)}mm`);
  }

  // 风
  if (caps.hasDailyWind && daily.wind_speed_10m_max?.[0] > 0) {
    const windMax = daily.wind_speed_10m_max[0];
    const windLevel = getWindLevel(windMax).split('-')[0];
    lines.push(`最大风速 ${Math.round(windMax)}km/h（${windLevel}），${windMax > 39 ? '风力较大' : '风力适中'}`);
  }

  // 紫外线
  if (caps.hasDailyUV && daily.uv_index_max?.[0] !== undefined) {
    const uvMax = daily.uv_index_max[0];
    const uvInfo = getUVLevel(uvMax);
    lines.push(`紫外线指数 ${uvMax}（${uvInfo.label}），${uvInfo.advice}`);
  }

  // 湿度
  if (current.relative_humidity_2m !== undefined) {
    const humidInfo = getHumidityLevel(current.relative_humidity_2m);
    lines.push(`湿度 ${current.relative_humidity_2m}%（${humidInfo.label}），${humidInfo.advice}`);
  }

  // 能见度
  if (caps.hasHourlyVisibility && hourly.visibility?.length > 0) {
    const nowIdx = new Date().getHours();
    const visRaw = hourly.visibility[nowIdx];
    if (visRaw !== undefined && visRaw > 0) {
      const visKm = (visRaw / 1000).toFixed(1);
      const visLevel = getVisibilityLevel(visRaw);
      lines.push(`能见度 ${visKm}km（${visLevel}）`);
    }
  }

  if (lines.length === 0) return null;

  return (
    <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
      <h3 className="text-white/90 font-medium mb-3">📝 天气简报</h3>
      <ul className="space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="text-white/70 text-sm leading-relaxed flex gap-2">
            <span className="text-blue-300 flex-shrink-0">•</span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===================== 主组件 =====================

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
  const [sourceNotice, setSourceNotice] = useState('');
  const [sourceErrors, setSourceErrors] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const caps = useMemo(() => detectCapabilities(weatherData), [weatherData]);

  const sourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      qweather: '和风天气', owm: 'OpenWeatherMap', openmeteo: 'Open-Meteo',
      nws: 'NWS (NOAA)', wttrin: 'wttr.in',
    };
    return labels[source] || source;
  };

  const sourceEmoji = (source: string) => {
    const emojis: Record<string, string> = {
      qweather: '🇨🇳', owm: '🌐', openmeteo: '🌍', nws: '🇺🇸', wttrin: '🌤️',
    };
    return emojis[source] || '🌍';
  };

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
              name: geoData.eo?.geo?.cityName || '当前位置', latitude, longitude,
            };
            loadWeatherForLocation(loc, false);
          } catch {
            loadWeatherForLocation({ id: makeLocationId(latitude, longitude), name: '当前位置', latitude, longitude }, false);
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
      const { latitude, longitude, cityName } = geoData.eo?.geo || geoData.eo || {};
      if (!latitude || !longitude) throw new Error('无法获取位置信息');
      const loc: SavedLocation = { id: makeLocationId(latitude, longitude), name: cityName || '当前位置', latitude, longitude };
      await loadWeatherForLocation(loc, false, dataSource);
    } catch {
      setError('获取位置失败，请手动搜索城市'); setLoading(false);
    }
  };

  const loadWeatherForLocation = async (loc: SavedLocation, forceRefresh = false, source?: WeatherDataSource) => {
    const activeSource = source || dataSource;
    const cacheId = `${loc.id}_${activeSource}`;
    try {
      if (!forceRefresh) setLoading(true); else setRefreshing(true);
      setError(''); setLocation(loc); setLastLocation(loc);
      addRecentSearch(loc);

      const cache = getLocalWeatherCache(cacheId);
      if (cache && !forceRefresh) {
        const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
        const ageMin = Math.floor(ageMs / 60000);
        setCacheAge(ageMin); setWeatherData(cache.data); setLoading(false);
        if (ageMin > 15) { setNeedsRefresh(true); backgroundRefresh(loc, activeSource); }
        return;
      }

      let data = await fetchWeatherData(loc.latitude, loc.longitude, forceRefresh, activeSource);

      // 网关失败 → 前端直连兜底
      if (data.error) {
        console.warn('[Frontend] Gateway failed, trying direct Open-Meteo...');
        const directData = await fetchWeatherDirectOpenMeteo(loc.latitude, loc.longitude);
        if (!directData.error) {
          data = directData;
          setSourceNotice('已自动切换到 Open-Meteo 直连（网关数据源暂不可用）');
        } else {
          throw new Error(data.error);
        }
      }

      if (data.source_errors) setSourceErrors(data.source_errors);
      else setSourceErrors([]);

      if (data.error) throw new Error(data.error);

      const resolvedSource = (['openmeteo', 'qweather', 'owm', 'nws', 'wttrin'] as string[]).includes(data.resolved_source)
        ? data.resolved_source as WeatherDataSource
        : activeSource;

      if (resolvedSource !== activeSource && !sourceNotice) {
        setDataSourceState(resolvedSource);
        setDataSource(resolvedSource);
        setSourceNotice(`已自动切换到 ${sourceLabel(resolvedSource)} 数据源`);
      } else if (!sourceNotice) {
        setSourceNotice('');
      }

      setWeatherData(data); setLocalWeatherCache(cacheId, data); setCacheAge(0); setNeedsRefresh(false);
    } catch (err) {
      console.error('Load weather error:', err);
      setError('加载天气失败，请尝试其他数据源或检查网络');
      setSourceNotice('');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  const backgroundRefresh = async (loc: SavedLocation, source?: WeatherDataSource) => {
    const activeSource = source || dataSource;
    try {
      const weather = await fetchWeatherData(loc.latitude, loc.longitude, true, activeSource);
      if (!weather.error) setLocalWeatherCache(`${loc.id}_${activeSource}`, weather);
    } catch { /* silent */ }
  };

  const handleRefresh = () => {
    if (location) { setNeedsRefresh(false); loadWeatherForLocation(location, true); }
  };
  const handleSelectCity = (loc: SavedLocation) => {
    setShowSearch(false); loadSavedLocations(); loadWeatherForLocation(loc, false);
  };
  const handleSourceChange = (source: WeatherDataSource) => {
    setDataSourceState(source); setDataSource(source);
    if (location) loadWeatherForLocation(location, true, source);
  };
  const handleSaveLocation = async () => {
    if (location && !savedLocs.find((l) => l.id === location.id)) {
      const updated = await saveLocation(location); setSavedLocs(updated);
    }
  };
  const handleRemoveLocation = async (id: string) => {
    const updated = await removeLocation(id); setSavedLocs(updated);
  };

  const getBgGradient = () => {
    if (!weatherData) return 'from-slate-900 via-blue-900 to-indigo-950';
    const code = weatherData.current?.weather_code;
    const isDay = weatherData.current?.is_day;
    if (!isDay) return 'from-slate-950 via-indigo-950 to-slate-900';
    if (code <= 1) return 'from-sky-400 via-blue-400 to-indigo-500';
    if (code <= 3) return 'from-sky-500 via-blue-500 to-slate-600';
    if (code >= 51 && code <= 67) return 'from-slate-600 via-blue-700 to-slate-800';
    if (code >= 71 && code <= 77) return 'from-slate-400 via-blue-300 to-slate-500';
    if (code >= 95) return 'from-gray-800 via-slate-700 to-gray-900';
    return 'from-sky-500 via-blue-600 to-indigo-700';
  };

  const ALL_SOURCES: WeatherDataSource[] = ['openmeteo', 'wttrin', 'nws', 'qweather', 'owm'];

  // ─── 加载中 ───
  if (loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${getBgGradient()} flex items-center justify-center transition-all duration-1000`}>
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto shadow-lg" />
          <p className="text-white/80 mt-6 text-lg font-light tracking-wide animate-pulse">加载天气数据中...</p>
        </div>
      </div>
    );
  }

  // ─── 错误 ───
  if (error && !weatherData) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${getBgGradient()} flex items-center justify-center p-4`}>
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-10 max-w-md text-center shadow-2xl">
          <div className="text-6xl mb-4">⚠️</div>
          <p className="text-white text-xl font-medium">{error}</p>
          <p className="text-white/60 mt-2 text-sm">请尝试搜索其他城市或切换数据源</p>
          <div className="flex gap-3 mt-6 justify-center">
            <button onClick={() => location && loadWeatherForLocation(location, true)} className="bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl transition-all font-medium">
              🔄 重试
            </button>
            <button onClick={() => setShowSearch(true)} className="bg-blue-500/50 hover:bg-blue-500/70 text-white py-3 px-6 rounded-xl transition-all font-medium">
              🔍 搜索城市
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!weatherData || !location) return null;

  const { current, hourly, daily, air_quality } = weatherData;
  const nowHourIdx = new Date().getHours();
  const isSaved = savedLocs.some((l) => l.id === location.id);
  const wi = getWeatherInfo(current?.weather_code, current?.is_day);

  // 计算各区块可用性
  const showTwentyFourHourBlocks = caps.hasHourlyPrecip || caps.hasHourlyVisibility || caps.hasHourlyUV;
  const showTriPanel = caps.hasAirQuality || caps.hasDailyUV || caps.hasSunrise;

  return (
    <>
      {showSearch && <CitySearch onSelectCity={handleSelectCity} onClose={() => setShowSearch(false)} />}

      <div className={`min-h-screen bg-gradient-to-br ${getBgGradient()} p-3 md:p-6 pb-10 transition-all duration-1000`}>
        <div className="max-w-6xl mx-auto space-y-4">

          {/* ═══ 顶部栏 ═══ */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-white/10 backdrop-blur-2xl rounded-2xl p-4 shadow-lg border border-white/20">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2 drop-shadow-lg">
                {wi.icon} {location.name}
                {useGPS && <span className="text-xs bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full font-normal">GPS</span>}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {cacheAge > 0 && (
                  <span className="text-white/60 text-xs">📦 {timeAgo(weatherData.cached_at)} 更新</span>
                )}
                <span className="text-white/30 text-xs">· {caps.source}</span>
              </div>
              {sourceNotice && (
                <p className="text-amber-200/90 text-xs mt-1 bg-amber-500/10 rounded px-2 py-0.5 inline-block">⚠️ {sourceNotice}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 数据源切换 */}
              <div className="flex bg-white/10 rounded-xl p-1 border border-white/10 flex-wrap">
                {ALL_SOURCES.map((src) => (
                  <button
                    key={src}
                    onClick={() => handleSourceChange(src)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                      dataSource === src ? 'bg-white/20 text-white font-medium shadow-lg' : 'text-white/50 hover:text-white/80'
                    }`}
                    title={sourceLabel(src)}
                  >
                    {sourceEmoji(src)} {src === 'openmeteo' ? 'Meteo' : src === 'qweather' ? '和风' : src === 'owm' ? 'OWM' : src === 'nws' ? 'NWS' : 'wttr'}
                  </button>
                ))}
              </div>
              {needsRefresh && (
                <button onClick={handleRefresh} className="bg-emerald-500/80 hover:bg-emerald-500 text-white py-2 px-4 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/30 animate-pulse font-medium">
                  ✨ 新数据
                </button>
              )}
              <button onClick={() => setShowSaved(!showSaved)} className="bg-white/10 hover:bg-white/20 text-white py-2 px-3 rounded-xl text-sm transition-all backdrop-blur border border-white/10" title="收藏">
                ⭐ {savedLocs.length}
              </button>
              <button onClick={() => setShowSearch(true)} className="bg-white/10 hover:bg-white/20 text-white py-2 px-3 rounded-xl text-sm transition-all backdrop-blur border border-white/10" title="搜索">🔍</button>
              <button onClick={handleRefresh} disabled={refreshing} className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white py-2 px-3 rounded-xl text-sm transition-all backdrop-blur border border-white/10" title="刷新">
                {refreshing ? '⏳' : '🔄'}
              </button>
              {!isSaved && (
                <button onClick={handleSaveLocation} className="bg-amber-500/80 hover:bg-amber-500 text-white py-2 px-4 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 font-medium">
                  ⭐ 收藏
                </button>
              )}
            </div>
          </div>

          {/* 数据能力指示 */}
          <div className="bg-white/5 backdrop-blur-2xl rounded-xl p-3 border border-white/10 flex items-center gap-3 flex-wrap">
            <span className="text-white/40 text-xs flex-shrink-0">数据覆盖：</span>
            <DataCapBadge caps={caps} />
          </div>

          {/* 收藏 */}
          {showSaved && savedLocs.length > 0 && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-4 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-3 text-sm">⭐ 收藏的地点 ({savedLocs.length})</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {savedLocs.map((loc) => (
                  <div key={loc.id} className="flex-shrink-0 bg-white/10 hover:bg-white/20 rounded-xl p-3 min-w-[140px] group relative transition-all border border-white/10">
                    <button onClick={() => handleSelectCity(loc)} className="text-left w-full">
                      <div className="text-white font-medium text-sm">{loc.name}</div>
                      <div className="text-white/50 text-xs mt-1">{loc.admin1 || loc.country}</div>
                    </button>
                    <button onClick={() => handleRemoveLocation(loc.id)} className="absolute top-2 right-2 text-red-300 hover:text-red-200 opacity-0 group-hover:opacity-100 transition text-sm w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/20">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ 当前天气主卡片 ═══ */}
          {caps.hasCurrent && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-6 md:p-10 shadow-2xl border border-white/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between flex-wrap gap-6">
                  <div>
                    <div className="text-7xl md:text-9xl font-extralight text-white tracking-tighter drop-shadow-2xl leading-none">
                      {Math.round(current.temperature_2m)}°
                    </div>
                    <div className="text-xl md:text-2xl text-white/90 mt-3 font-light">{wi.label}</div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {caps.hasFeelsLike && (
                        <div className="text-white/60 text-sm">体感 {Math.round(current.apparent_temperature)}°</div>
                      )}
                      {caps.hasDailyTemps && daily && (
                        <div className="text-white/40 text-sm">
                          ↑{Math.round(daily.temperature_2m_max[0])}° ↓{Math.round(daily.temperature_2m_min[0])}°
                        </div>
                      )}
                    </div>
                    {caps.hasFeelsLike && Math.abs(current.apparent_temperature - current.temperature_2m) > 2 && (
                      <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${
                        current.apparent_temperature > current.temperature_2m ? 'bg-red-500/20 text-red-200' : 'bg-blue-500/20 text-blue-200'
                      }`}>
                        {current.apparent_temperature > current.temperature_2m ? '🔥 体感更热' : '❄️ 体感更冷'}
                      </div>
                    )}
                  </div>
                  <div className="text-[100px] md:text-[150px] leading-none drop-shadow-2xl animate-float">{wi.icon}</div>
                </div>

                {/* 快速指标 - 根据可用数据动态排列 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
                  <GlassCard label="湿度" value={`${current.relative_humidity_2m}%`} icon="💧" extra={getHumidityLevel(current.relative_humidity_2m).label} />
                  {caps.hasWind && (
                    <GlassCard label="风速" value={`${Math.round(current.wind_speed_10m)} km/h`} icon="💨" extra={getWindDirection(current.wind_direction_10m) + ' ' + getWindLevel(current.wind_speed_10m).split('-')[0]} />
                  )}
                  {caps.hasPressure && (
                    <GlassCard label="气压" value={`${Math.round(current.pressure_msl)} hPa`} icon="🌡️" extra={current.surface_pressure < current.pressure_msl ? '低压区' : '高压区'} />
                  )}
                  {caps.hasCloudCover ? (
                    <GlassCard label="云量" value={`${current.cloud_cover}%`} icon="☁️" extra={current.cloud_cover < 25 ? '晴朗' : current.cloud_cover < 50 ? '少云' : current.cloud_cover < 75 ? '多云' : '阴天'} />
                  ) : caps.hasWind && caps.hasPressure ? null : null}
                </div>
              </div>
            </div>
          )}

          {/* ═══ 天气简报 ═══ */}
          <WeatherSummary current={current} daily={daily} hourly={hourly} caps={caps} />

          {/* ═══ 温度趋势 ═══ */}
          <TemperatureTrend hourly={hourly} nowHourIdx={nowHourIdx} caps={caps} />

          {/* ═══ 三栏信息卡（空气质量 / UV / 日出日落） ═══ */}
          {showTriPanel && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 空气质量 */}
              {caps.hasAirQuality && air_quality && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20 hover:bg-white/[0.12] transition-all">
                  <h3 className="text-white/70 text-xs uppercase tracking-wider mb-3">🏭 空气质量</h3>
                  <div className={`text-4xl font-bold ${getAQILevel(air_quality.us_aqi).color} drop-shadow`}>{air_quality.us_aqi}</div>
                  <div className={`text-lg font-medium mt-1 ${getAQILevel(air_quality.us_aqi).color}`}>{getAQILevel(air_quality.us_aqi).label}</div>
                  <div className="text-white/50 text-xs mt-2 leading-relaxed">{getAQILevel(air_quality.us_aqi).advice}</div>
                  <div className="w-full bg-white/10 rounded-full h-2 mt-4 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${
                      air_quality.us_aqi <= 50 ? 'bg-gradient-to-r from-green-400 to-emerald-400' :
                      air_quality.us_aqi <= 100 ? 'bg-gradient-to-r from-yellow-400 to-amber-400' :
                      air_quality.us_aqi <= 150 ? 'bg-gradient-to-r from-orange-400 to-amber-500' :
                      'bg-gradient-to-r from-red-400 to-rose-500'
                    }`} style={{ width: `${Math.min(air_quality.us_aqi / 300 * 100, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-white/40 text-xs mt-3">
                    <span>PM2.5: {air_quality.pm2_5}μg/m³</span>
                    <span>PM10: {air_quality.pm10}μg/m³</span>
                  </div>
                </div>
              )}

              {/* 紫外线 */}
              {caps.hasDailyUV && daily && daily.uv_index_max?.[0] !== undefined && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20 hover:bg-white/[0.12] transition-all">
                  <h3 className="text-white/70 text-xs uppercase tracking-wider mb-3">☀️ 紫外线指数</h3>
                  <div className={`text-4xl font-bold ${getUVLevel(daily.uv_index_max[0]).color} drop-shadow`}>{daily.uv_index_max[0]}</div>
                  <div className={`text-lg font-medium mt-1 ${getUVLevel(daily.uv_index_max[0]).color}`}>{getUVLevel(daily.uv_index_max[0]).label}</div>
                  <div className="text-white/50 text-xs mt-2 leading-relaxed">{getUVLevel(daily.uv_index_max[0]).advice}</div>
                  <div className="w-full bg-white/10 rounded-full h-2 mt-4 overflow-hidden">
                    <div className="bg-gradient-to-r from-green-400 via-yellow-400 via-orange-400 to-red-500 h-full rounded-full" style={{ width: `${Math.min(daily.uv_index_max[0] / 11 * 100, 100)}%` }} />
                  </div>
                </div>
              )}

              {/* 日出日落 */}
              {caps.hasSunrise && daily && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20 hover:bg-white/[0.12] transition-all">
                  <h3 className="text-white/70 text-xs uppercase tracking-wider mb-3">🌅 日出日落</h3>
                  <div className="flex justify-between items-center mt-4">
                    <div className="text-center">
                      <div className="text-4xl mb-1">🌅</div>
                      <div className="text-white font-semibold text-lg">{daily.sunrise[0]?.slice(11, 16)}</div>
                      <div className="text-white/50 text-xs">日出</div>
                    </div>
                    <div className="flex-1 mx-4 relative">
                      <div className="h-1.5 bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-400 rounded-full shadow-lg shadow-amber-500/30" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg shadow-white/50 ring-2 ring-white/30" />
                    </div>
                    <div className="text-center">
                      <div className="text-4xl mb-1">🌇</div>
                      <div className="text-white font-semibold text-lg">{daily.sunset[0]?.slice(11, 16)}</div>
                      <div className="text-white/50 text-xs">日落</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 三栏不足时，用当前 UV 填补 */}
              {!caps.hasAirQuality && !caps.hasDailyUV && caps.hasCurrentUV && current.uv_index !== undefined && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20 hover:bg-white/[0.12] transition-all">
                  <h3 className="text-white/70 text-xs uppercase tracking-wider mb-3">☀️ 紫外线指数</h3>
                  <div className={`text-4xl font-bold ${getUVLevel(current.uv_index).color} drop-shadow`}>{current.uv_index}</div>
                  <div className={`text-lg font-medium mt-1 ${getUVLevel(current.uv_index).color}`}>{getUVLevel(current.uv_index).label}</div>
                  <div className="text-white/50 text-xs mt-2 leading-relaxed">{getUVLevel(current.uv_index).advice}</div>
                </div>
              )}
            </div>
          )}

          {/* ═══ 卫星云图（始终可用，基于坐标） ═══ */}
          {location && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4 flex items-center gap-2">🛰️ 卫星云图 & 气象雷达 <span className="text-white/30 text-xs font-normal">（OpenStreetMap 图层）</span></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl overflow-hidden border border-white/10 bg-gray-900/50">
                  <div className="text-white/60 text-xs p-2 bg-white/5 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /> 云层分布</div>
                  <img src={`https://maps.open-meteo.com/v1/map/cloud_cover?latitude=${location.latitude}&longitude=${location.longitude}&zoom=6&width=600&height=400`} alt="Cloud cover" className="w-full h-48 md:h-64 object-cover" loading="lazy"
                    onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }} />
                  <div className="hidden w-full h-48 md:h-64 items-center justify-center bg-gray-900/50 text-white/40 text-sm">☁️ 云图加载失败</div>
                </div>
                <div className="rounded-xl overflow-hidden border border-white/10 bg-gray-900/50">
                  <div className="text-white/60 text-xs p-2 bg-white/5 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" /> 降水分布</div>
                  <img src={`https://maps.open-meteo.com/v1/map/precipitation?latitude=${location.latitude}&longitude=${location.longitude}&zoom=6&width=600&height=400`} alt="Precipitation" className="w-full h-48 md:h-64 object-cover" loading="lazy"
                    onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }} />
                  <div className="hidden w-full h-48 md:h-64 items-center justify-center bg-gray-900/50 text-white/40 text-sm">🌧️ 降水图加载失败</div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ 24小时降水预报 ═══ */}
          {caps.hasHourlyPrecip && hourly && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4">🌧️ 24小时降水预报</h3>
              <div className="flex items-end gap-1 h-36 overflow-x-auto pb-2">
                {Array.from({ length: 24 }).map((_, i) => {
                  const idx = nowHourIdx + i;
                  if (idx >= hourly.time.length) return null;
                  const precip = hourly.precipitation?.[idx] || 0;
                  const prob = hourly.precipitation_probability?.[idx] || 0;
                  const precipArr = hourly.precipitation?.slice(nowHourIdx, nowHourIdx + 24) || [];
                  const maxP = Math.max(...precipArr.map((p: number) => p || 0), 1);
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
              {hourly.precipitation?.slice(nowHourIdx, nowHourIdx + 24).every((p: number) => !p || p === 0) && (
                <div className="text-center text-white/40 text-sm mt-2">🌤️ 未来24小时无降水</div>
              )}
            </div>
          )}

          {/* ═══ 逐时预报 ═══ */}
          {caps.hasHourlyTemps && hourly && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4 flex items-center gap-2">
                ⏰ 逐时预报
                <span className="text-white/30 text-xs font-normal hidden md:inline">· 左右滑动</span>
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {Array.from({ length: Math.min(48, hourly.time?.length - nowHourIdx || 0) }).map((_, i) => {
                  const idx = nowHourIdx + i;
                  if (idx >= (hourly.time?.length || 0)) return null;
                  const info = getWeatherInfo(hourly.weather_code?.[idx]);
                  const isNow = i === 0;
                  return (
                    <div key={i} className={`flex-shrink-0 text-center min-w-[72px] rounded-xl p-3 transition-all border ${
                      isNow ? 'bg-white/20 border-amber-400/50 shadow-lg shadow-amber-500/10 scale-105' : 'bg-white/5 border-white/10 hover:bg-white/15 hover:scale-105'
                    }`}>
                      <div className={`text-xs font-medium ${isNow ? 'text-amber-300' : 'text-white/60'}`}>
                        {isNow ? '现在' : formatHour(hourly.time[idx])}
                      </div>
                      <div className="text-2xl my-1.5 drop-shadow">{info.icon}</div>
                      <div className="text-white font-semibold text-sm">{Math.round(hourly.temperature_2m?.[idx] || 0)}°</div>
                      {caps.hasHourlyPrecipProb && hourly.precipitation_probability?.[idx] > 0 && (
                        <div className="text-cyan-300 text-xs mt-1 font-mono">💧{hourly.precipitation_probability[idx]}%</div>
                      )}
                      {caps.hasHourlyWind && hourly.wind_speed_10m?.[idx] !== undefined && (
                        <div className="text-white/40 text-[10px] mt-0.5">🌬️{Math.round(hourly.wind_speed_10m[idx])}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ 能见度 & UV 逐时 ═══ */}
          {showTwentyFourHourBlocks && hourly && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {caps.hasHourlyVisibility && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
                  <h3 className="text-white/90 font-medium mb-4">👁️ 24小时能见度</h3>
                  <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
                    {Array.from({ length: 24 }).map((_, i) => {
                      const idx = nowHourIdx + i;
                      if (idx >= (hourly.visibility?.length || 0)) return null;
                      const vis = (hourly.visibility[idx] || 0) / 1000;
                      const h = Math.min((vis / 50) * 100, 100);
                      const color = vis >= 10 ? 'from-emerald-400 to-green-300' : vis >= 5 ? 'from-yellow-400 to-amber-300' : 'from-red-400 to-orange-300';
                      return (
                        <div key={i} className="flex-shrink-0 flex flex-col items-center min-w-[36px] group">
                          <div className="text-white/60 text-xs mb-1 opacity-0 group-hover:opacity-100 transition font-mono">{vis.toFixed(0)}km</div>
                          <div className="flex-1 flex items-end w-full px-0.5">
                            <div className={`w-full bg-gradient-to-t ${color} rounded-t-sm`} style={{ height: `${Math.max(h, 2)}%` }} />
                          </div>
                          <div className="text-white/40 text-xs mt-1">{i === 0 ? '现在' : formatHour(hourly.time[idx])}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {caps.hasHourlyUV && (
                <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
                  <h3 className="text-white/90 font-medium mb-4">☀️ 24小时紫外线</h3>
                  <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
                    {Array.from({ length: 24 }).map((_, i) => {
                      const idx = nowHourIdx + i;
                      if (idx >= (hourly.uv_index?.length || 0)) return null;
                      const uv = hourly.uv_index[idx] || 0;
                      const h = Math.min((uv / 11) * 100, 100);
                      const color = uv <= 2 ? 'from-green-400 to-green-300' : uv <= 5 ? 'from-yellow-400 to-amber-300' : uv <= 7 ? 'from-orange-400 to-orange-300' : 'from-red-500 to-rose-400';
                      return (
                        <div key={i} className="flex-shrink-0 flex flex-col items-center min-w-[36px] group">
                          <div className="text-white/60 text-xs mb-1 opacity-0 group-hover:opacity-100 transition font-mono">{uv.toFixed(1)}</div>
                          <div className="flex-1 flex items-end w-full px-0.5">
                            <div className={`w-full bg-gradient-to-t ${color} rounded-t-sm`} style={{ height: `${Math.max(h, uv > 0 ? 4 : 0)}%` }} />
                          </div>
                          <div className="text-white/40 text-xs mt-1">{i === 0 ? '现在' : formatHour(hourly.time[idx])}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 只有一个时，给另一个留空或不显示 grid */}
            </div>
          )}

          {/* ═══ 多日预报 ═══ */}
          {caps.hasDailyTemps && daily && (
            <div className="bg-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-lg border border-white/20">
              <h3 className="text-white/90 font-medium mb-4">📅 多日天气预报</h3>
              <div className="space-y-1">
                {daily.time?.map((date: string, i: number) => {
                  const max = daily.temperature_2m_max?.[i];
                  const min = daily.temperature_2m_min?.[i];
                  if (max === undefined || min === undefined) return null;
                  const info = getWeatherInfo(daily.weather_code?.[i]);
                  const allMax = Math.max(...(daily.temperature_2m_max || []));
                  const allMin = Math.min(...(daily.temperature_2m_min || []));
                  const range = allMax - allMin || 1;
                  const barLeft = ((min - allMin) / range) * 100;
                  const barWidth = Math.max(((max - min) / range) * 100, 4);
                  const today = isToday(date);
                  const showPrecip = caps.hasDailyPrecipProb && daily.precipitation_probability_max?.[i] > 0;
                  const showWind = caps.hasDailyWind && daily.wind_speed_10m_max?.[i] !== undefined;

                  return (
                    <div key={i} className={`flex items-center gap-2 md:gap-3 py-3 px-3 md:px-4 rounded-xl transition-all ${
                      today ? 'bg-white/15 border border-white/20 shadow-lg' : 'hover:bg-white/10'
                    }`}>
                      <div className="w-14 md:w-20 flex-shrink-0">
                        <div className={`text-sm font-medium ${today ? 'text-amber-300' : 'text-white/80'}`}>
                          {today ? '今天' : isTomorrow(date) ? '明天' : formatDate(date)}
                        </div>
                      </div>
                      <div className="w-8 text-center flex-shrink-0 text-2xl drop-shadow">{info.icon}</div>
                      <div className="w-12 text-white/60 text-xs flex-shrink-0 hidden md:block truncate">{info.label}</div>
                      <div className="w-10 text-white/70 text-sm text-right flex-shrink-0 font-mono">{Math.round(min)}°</div>
                      <div className="flex-1 h-2 bg-white/10 rounded-full relative mx-2 overflow-hidden">
                        <div className="absolute h-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 rounded-full shadow-sm" style={{ left: `${barLeft}%`, width: `${barWidth}%` }} />
                      </div>
                      <div className="w-10 text-white font-medium text-sm flex-shrink-0 font-mono">{Math.round(max)}°</div>
                      <div className="w-14 flex-shrink-0 text-right">
                        {showPrecip && <span className="text-cyan-300 text-xs font-mono">💧{daily.precipitation_probability_max[i]}%</span>}
                      </div>
                      <div className="w-14 flex-shrink-0 text-right hidden md:block">
                        {showWind && <span className="text-white/40 text-xs font-mono">🌬️{Math.round(daily.wind_speed_10m_max[i])}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ 详细数据面板 ═══ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {caps.hasPressure && <GlassCard label="地面气压" value={`${Math.round(current.surface_pressure)} hPa`} icon="📊" />}
            {caps.hasDailyPrecip && daily && <GlassCard label="今日降水" value={`${daily.precipitation_sum?.[0]} mm`} icon="🌧️" />}
            {caps.hasDailyWind && daily && <GlassCard label="最大风速" value={`${Math.round(daily.wind_speed_10m_max[0])} km/h`} icon="🌪️" extra={getWindLevel(daily.wind_speed_10m_max[0]).split('-')[0]} />}
            {caps.hasWind && <GlassCard label="风向" value={getWindDirection(current.wind_direction_10m)} icon="🧭" extra={`${current.wind_direction_10m}°`} />}
            {caps.hasDewPoint && <GlassCard label="露点温度" value={`${Math.round(current.dew_point)}°C`} icon="💠" />}
            {caps.hasDailyPrecipProb && daily && <GlassCard label="降水概率" value={`${daily.precipitation_probability_max?.[0]}%`} icon="🎲" />}
            {caps.hasHourlyVisibility && hourly && hourly.visibility?.[nowHourIdx] !== undefined && (
              <GlassCard label="能见度" value={`${(hourly.visibility[nowHourIdx] / 1000).toFixed(1)} km`} icon="👁️" extra={getVisibilityLevel(hourly.visibility[nowHourIdx])} />
            )}
            {caps.hasCurrentUV && <GlassCard label="UV指数" value={`${current.uv_index}`} icon="☀️" extra={getUVLevel(current.uv_index).label} />}
            {caps.hasDailyPrecip && daily && daily.precipitation_sum?.[0] === undefined && caps.hasDailyPrecipProb && daily && <GlassCard label="降水概率" value={`${daily.precipitation_probability_max?.[0] || 0}%`} icon="🎲" />}
          </div>

          {/* ═══ Debug ═══ */}
          {showDebug && sourceErrors.length > 0 && (
            <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 shadow-lg border border-red-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-red-300 text-sm font-medium">🔧 数据源调试 ({sourceErrors.length})</h3>
                <button onClick={() => setShowDebug(false)} className="text-white/40 hover:text-white/80 text-xs">关闭</button>
              </div>
              <div className="space-y-1">
                {sourceErrors.map((err: any, i: number) => (
                  <div key={i} className="text-red-300/70 text-xs font-mono">[{err.provider}] {err.message}</div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ 页脚 ═══ */}
          <div className="text-center text-white/30 text-xs pt-6 pb-4 space-y-1">
            <p>数据来源: {weatherData.data_source || sourceLabel(caps.source)}</p>
            <div className="flex items-center justify-center gap-2">
              <span>Powered by EdgeOne Pages</span>
              {useGPS && <span>· 📍 GPS</span>}
              {sourceErrors.length > 0 && (
                <button onClick={() => setShowDebug(!showDebug)} className="text-red-400/60 hover:text-red-400 transition text-xs underline">调试</button>
              )}
            </div>
            <a href="/geoInfo" className="text-white/40 hover:text-white/60 transition inline-block mt-2">📍 GeoInfo 页面 →</a>
          </div>
        </div>
      </div>
    </>
  );
}
