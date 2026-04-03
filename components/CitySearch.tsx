'use client';
import React, { useState, useEffect, useRef } from 'react';
import { searchCity, type SavedLocation, makeLocationId } from '@/lib/weather';

interface CitySearchProps {
  onSelectCity: (loc: SavedLocation) => void;
  onClose: () => void;
}

export default function CitySearch({ onSelectCity, onClose }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<any>(null);

  // 实时搜索：输入后 1 秒自动搜索
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setError('');
      return;
    }
    debounceRef.current = setTimeout(() => {
      doSearch(query.trim());
    }, 1000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' && query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query.trim());
    }
  };

  const doSearch = async (q: string) => {
    setSearching(true);
    setError('');
    try {
      const data = await searchCity(q);
      if (data.results && data.results.length > 0) {
        // API 已经按相关性排序，直接使用
        setResults(data.results);
      } else {
        setError('未找到相关城市，试试其他关键词');
        setResults([]);
      }
    } catch (err) {
      setError('搜索失败，请重试');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (r: any) => {
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
              placeholder="输入城市名称，按回车搜索..."
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
              r.feature_code === 'PPLA' ? '省会' : 
              r.feature_code === 'PPLA2' ? '地级市' : 
              r.feature_code === 'PPLA3' ? '区县' : '';
            
            return (
              <button
                key={i}
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
                      {r.admin1 && <span>{r.admin1}</span>}
                      {r.admin1 && r.country && <span> · </span>}
                      {r.country && <span>{r.country}</span>}
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
