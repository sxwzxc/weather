'use client';
import React, { useState } from 'react';
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

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const data = await searchCity(query);
      if (data.results && data.results.length > 0) {
        // 排序：优先显示地级市（feature_code 为 PPLA2）和省会（PPLA）
        const sorted = data.results.sort((a: any, b: any) => {
          // 优先级：PPLA（省会） > PPLA2（地级市） > 其他
          const getPriority = (item: any) => {
            if (item.feature_code === 'PPLA') return 3; // 省会
            if (item.feature_code === 'PPLA2') return 2; // 地级市
            if (item.feature_code === 'PPL') return 1; // 普通城市
            return 0; // 其他
          };
          
          const priorityDiff = getPriority(b) - getPriority(a);
          if (priorityDiff !== 0) return priorityDiff;
          
          // 相同优先级按人口排序
          return (b.population || 0) - (a.population || 0);
        });
        setResults(sorted);
      } else {
        setError('未找到相关城市');
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
          <div className="flex gap-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入城市名称（支持中英文）..."
              className="flex-1 bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-lg px-4 py-3 outline-none focus:border-blue-500 transition"
              autoFocus
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition"
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
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
            const isCity = r.feature_code === 'PPLA' || r.feature_code === 'PPLA2';
            const cityLabel = r.feature_code === 'PPLA' ? '省会' : r.feature_code === 'PPLA2' ? '地级市' : '';
            
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
