'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  searchCity, getRecentSearches, addRecentSearch, clearRecentSearches,
  POPULAR_CITIES,
  type SavedLocation, type CitySearchResult, makeLocationId,
} from '@/lib/weather';

interface CitySearchProps {
  onSelectCity: (loc: SavedLocation) => void;
  onClose: () => void;
}

const FEATURE_LABELS: Record<string, string> = {
  PPLC: '首都',
  PPLA: '省会',
  PPLA2: '地级市',
  PPLA3: '区县级',
  PPLA4: '乡镇级',
};

export default function CitySearch({ onSelectCity, onClose }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [preferredCountryCode, setPreferredCountryCode] = useState('CN');
  const [recentSearches, setRecentSearches] = useState<SavedLocation[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [showPopular, setShowPopular] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const getMinLength = (value: string) => (/[\u3400-\u9FFF]/.test(value) ? 1 : 2);

  // 检测用户所在地区
  useEffect(() => {
    const locale = navigator.language || '';
    const region = locale.split('-')[1]?.toUpperCase();
    if (region) setPreferredCountryCode(region);
    else if (locale.toLowerCase().startsWith('zh')) setPreferredCountryCode('CN');
    else setPreferredCountryCode('');

    // 加载最近搜索
    setRecentSearches(getRecentSearches());
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const currentRequestId = ++requestIdRef.current;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError('');
    setSelectedIdx(-1);

    try {
      const data = await searchCity(q, {
        countryCode: preferredCountryCode || undefined,
        limit: 20,
        signal: controller.signal,
      });

      if (currentRequestId !== requestIdRef.current) return;

      const nextResults = data.results || [];
      if (nextResults.length > 0) {
        setResults(nextResults);
      } else {
        setError('未找到相关城市，试试其他关键词');
        setResults([]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (currentRequestId !== requestIdRef.current) return;
      setError('搜索失败，请稍后重试');
      setResults([]);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setSearching(false);
      }
    }
  }, [preferredCountryCode]);

  // 防抖搜索
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError('');
      setSelectedIdx(-1);
      return;
    }

    if (trimmed.length < getMinLength(trimmed)) {
      setResults([]);
      setError('');
      setSelectedIdx(-1);
      return;
    }

    debounceRef.current = setTimeout(() => {
      doSearch(trimmed);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // 清理
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleSelect = (loc: SavedLocation) => {
    addRecentSearch(loc);
    setRecentSearches(getRecentSearches());
    onSelectCity(loc);
  };

  const handleSelectResult = (r: CitySearchResult) => {
    const loc: SavedLocation = {
      id: makeLocationId(r.latitude, r.longitude),
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    };
    handleSelect(loc);
  };

  const handleSelectPopular = (loc: SavedLocation) => {
    handleSelect(loc);
  };

  // 键盘导航
  const allItems = query.trim() ? results : showPopular ? POPULAR_CITIES : recentSearches;
  const maxIdx = allItems.length - 1;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => (prev < maxIdx ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : maxIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = query.trim();
      if (selectedIdx >= 0 && selectedIdx <= maxIdx) {
        // 选中高亮的项目
        const item = allItems[selectedIdx];
        if ('feature_code' in item || 'id' in item && typeof item.id === 'number') {
          handleSelectResult(item as CitySearchResult);
        } else {
          handleSelectPopular(item as SavedLocation);
        }
      } else if (trimmed && trimmed.length >= getMinLength(trimmed)) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSearch(trimmed);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // 自动滚动到选中项
  useEffect(() => {
    if (selectedIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-search-item]');
      if (items[selectedIdx]) {
        items[selectedIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIdx]);

  const getFeatureLabel = (featureCode?: string) => {
    if (!featureCode) return '';
    if (FEATURE_LABELS[featureCode]) return FEATURE_LABELS[featureCode];
    if (featureCode.startsWith('PPL')) return '居民地';
    return '';
  };

  const buildLocationDesc = (r: CitySearchResult) => {
    return [r.admin2, r.admin1, r.country]
      .filter(Boolean)
      .filter((value, idx, arr) => arr.indexOf(value) === idx)
      .join(' · ');
  };

  const showQuickPick = !query.trim() && results.length === 0 && !searching;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start md:items-center justify-center p-4 z-50 pt-[10vh] md:pt-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-800/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-200">
        {/* 搜索头部 */}
        <div className="p-4 md:p-6 border-b border-gray-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-bold text-white">🔍 搜索城市</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition"
              aria-label="关闭"
            >
              &times;
            </button>
          </div>
          <div className="relative">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入城市名称 / 拼音（支持模糊搜索）"
              className="w-full bg-gray-700/80 text-white placeholder-gray-400 border border-gray-600 rounded-xl px-4 py-3 pr-20 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              autoFocus
              role="combobox"
              aria-expanded={results.length > 0}
              aria-autocomplete="list"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {query && (
                <button
                  onClick={() => { setQuery(''); setResults([]); setError(''); setSelectedIdx(-1); inputRef.current?.focus(); }}
                  className="text-gray-400 hover:text-white p-1 rounded transition"
                  aria-label="清除搜索"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 6.586L11.293 3.293a1 1 0 011.414 1.414L9.414 8l3.293 3.293a1 1 0 01-1.414 1.414L8 9.414l-3.293 3.293a1 1 0 01-1.414-1.414L6.586 8 3.293 4.707a1 1 0 011.414-1.414L8 6.586z" />
                  </svg>
                </button>
              )}
              {searching && (
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          {query.trim() && !searching && results.length > 0 && (
            <p className="text-gray-500 text-xs mt-2">找到 {results.length} 个结果{preferredCountryCode ? `（优先: ${preferredCountryCode}）` : ''}</p>
          )}
          {!query.trim() && (
            <p className="text-gray-500 text-xs mt-2">
              支持中文、拼音、英文搜索{preferredCountryCode ? `（优先国家: ${preferredCountryCode}）` : ''}
            </p>
          )}
        </div>

        {/* 搜索结果 / 快速选择 */}
        <div className="overflow-y-auto max-h-[calc(80vh-180px)] p-4" ref={listRef}>
          {/* 快捷选择区域 */}
          {showQuickPick && (
            <>
              {/* 最近搜索 */}
              {recentSearches.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white/70 text-xs uppercase tracking-wider font-medium">🕐 最近搜索</h3>
                    <button
                      onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                      className="text-gray-500 hover:text-gray-300 text-xs transition"
                    >
                      清除
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((loc, i) => (
                      <button
                        key={`recent_${loc.id}`}
                        data-search-item
                        onClick={() => handleSelectPopular(loc)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                          selectedIdx === i
                            ? 'bg-blue-500/30 border-blue-400/50 text-white'
                            : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/15 hover:border-white/20'
                        }`}
                      >
                        📍 {loc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 热门城市 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white/70 text-xs uppercase tracking-wider font-medium">⭐ 热门城市</h3>
                  <button
                    onClick={() => setShowPopular(!showPopular)}
                    className="text-blue-400 hover:text-blue-300 text-xs transition"
                  >
                    {showPopular ? '收起' : '展开全部'}
                  </button>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {POPULAR_CITIES.slice(0, showPopular ? POPULAR_CITIES.length : 6).map((loc, i) => {
                    const offset = recentSearches.length;
                    return (
                      <button
                        key={`popular_${loc.id}`}
                        data-search-item
                        onClick={() => handleSelectPopular(loc)}
                        className={`text-center p-3 rounded-xl transition-all border ${
                          selectedIdx === i + offset
                            ? 'bg-blue-500/20 border-blue-400/40 scale-105'
                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15'
                        }`}
                      >
                        <div className="text-white font-medium text-sm">{loc.name}</div>
                        <div className="text-gray-500 text-xs mt-0.5 truncate">{loc.admin1 || loc.country}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* 搜索提示 */}
          {results.length === 0 && !error && !searching && query.trim() && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">🔎</div>
              <p className="text-lg mb-1">未找到匹配城市</p>
              <p className="text-sm">尝试使用不同的名称或拼音搜索</p>
            </div>
          )}

          {/* 搜索结果列表 */}
          {results.map((r, i) => {
            const cityLabel = getFeatureLabel(r.feature_code);
            const locationDesc = buildLocationDesc(r);
            const countryFlag = r.country_code ? getCountryFlag(r.country_code) : '';

            return (
              <button
                key={r.id ? `id_${r.id}` : `${r.latitude}_${r.longitude}_${r.name}_${i}`}
                data-search-item
                onClick={() => handleSelectResult(r)}
                className={`w-full text-left bg-gray-700/30 hover:bg-gray-700/60 p-4 rounded-xl mb-2 transition-all group border ${
                  selectedIdx === i
                    ? 'border-blue-400/50 bg-blue-500/10'
                    : 'border-transparent hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {countryFlag && <span className="text-lg flex-shrink-0">{countryFlag}</span>}
                      <div className={`font-medium text-lg group-hover:text-blue-400 transition truncate ${selectedIdx === i ? 'text-blue-300' : 'text-white'}`}>
                        {r.name}
                      </div>
                      {cityLabel && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full flex-shrink-0">
                          {cityLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm mt-1 truncate">
                      {locationDesc || '未知地区'}
                    </div>
                    <div className="text-gray-500 text-xs mt-1 flex items-center gap-2">
                      <span>📍 {r.latitude.toFixed(2)}°, {r.longitude.toFixed(2)}°</span>
                      {r.population && r.population > 0 && (
                        <span>👥 {(r.population / 10000).toFixed(1)}万</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-blue-400 transition-all flex-shrink-0 ml-2 ${selectedIdx === i ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'}`}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 简单的国旗 emoji 映射
function getCountryFlag(code: string): string {
  if (code.length !== 2) return '';
  const offset = 0x1F1E6;
  const a = code.charCodeAt(0) - 65 + offset;
  const b = code.charCodeAt(1) - 65 + offset;
  return String.fromCodePoint(a, b);
}
