'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchCity, type SavedLocation, type CitySearchResult, makeLocationId } from '@/lib/weather';

interface CitySearchProps {
  onSelectCity: (loc: SavedLocation) => void;
  onClose: () => void;
}

export default function CitySearch({ onSelectCity, onClose }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [preferredCountryCode, setPreferredCountryCode] = useState('CN');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const getMinLength = (value: string) => (/[\u3400-\u9FFF]/.test(value) ? 1 : 2);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const locale = navigator.language || '';
    const region = locale.split('-')[1]?.toUpperCase();

    if (region) setPreferredCountryCode(region);
    else if (locale.toLowerCase().startsWith('zh')) setPreferredCountryCode('CN');
    else setPreferredCountryCode('');
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

  // 实时搜索：输入后 350ms 自动搜索
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError('');
      return;
    }

    if (trimmed.length < getMinLength(trimmed)) {
      setResults([]);
      setError('');
      return;
    }

    debounceRef.current = setTimeout(() => {
      doSearch(trimmed);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleKeyDown = (e: any) => {
    const trimmed = query.trim();
    if (e.key === 'Enter' && trimmed) {
      if (trimmed.length < getMinLength(trimmed)) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(trimmed);
    }
  };

  const handleSelect = (r: CitySearchResult) => {
    const loc: SavedLocation = {
      id: makeLocationId(r.latitude, r.longitude),
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    };
    onSelectCity(loc);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">🔍 搜索城市</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
          </div>
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入城市名称/拼音（支持模糊搜索）"
              className="w-full bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-lg px-4 py-3 pr-12 outline-none focus:border-blue-500 transition"
              autoFocus
            />
            {searching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          {query.trim() && !searching && results.length > 0 && (
            <p className="text-gray-500 text-xs mt-2">找到 {results.length} 个结果</p>
          )}
          <p className="text-gray-500 text-xs mt-2">
            已启用模糊搜索{preferredCountryCode ? `（优先国家: ${preferredCountryCode}）` : ''}
          </p>
        </div>

        <div className="overflow-y-auto max-h-[calc(80vh-180px)] p-4">
          {results.length === 0 && !error && !searching && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-2">💡 搜索提示</p>
              <p className="text-sm">支持搜索城市、区县等地点</p>
              <p className="text-sm">例如：北京、Shanghai、Tokyo</p>
            </div>
          )}

          {results.map((r, i) => {
            const cityLabel =
              r.feature_code === 'PPLC' ? '首都' :
              r.feature_code === 'PPLA' ? '省会' :
              r.feature_code === 'PPLA2' ? '地级市' :
              r.feature_code === 'PPLA3' ? '区县级' :
              r.feature_code === 'PPLA4' ? '乡镇级' :
              r.feature_code?.startsWith('PPL') ? '居民地' : '';

            const locationDesc = [r.admin2, r.admin1, r.country]
              .filter(Boolean)
              .filter((value, idx, arr) => arr.indexOf(value) === idx)
              .join(' · ');
            
            return (
              <button
                key={r.id ? `id_${r.id}` : `${r.latitude}_${r.longitude}_${r.name}_${i}`}
                onClick={() => handleSelect(r)}
                className="w-full text-left bg-gray-700/50 hover:bg-gray-700 p-4 rounded-lg mb-2 transition group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-white font-medium text-lg group-hover:text-blue-400 transition">
                        {r.name}
                      </div>
                      {cityLabel && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                          {cityLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                      {locationDesc || '未知地区'}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      📍 {r.latitude.toFixed(2)}°, {r.longitude.toFixed(2)}°
                      {r.population && <span> · 人口: {(r.population / 10000).toFixed(1)}万</span>}
                    </div>
                  </div>
                  <div className="text-blue-400 opacity-0 group-hover:opacity-100 transition">→</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
