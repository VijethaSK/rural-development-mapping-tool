import { useEffect, useMemo, useState } from 'react';

type Panchayat = { _id: string; name: string; dataOrigin?: string };
type Road = {
  _id: string;
  name: string;
  ward?: string | null;
  village?: string;
  condition?: string | null;
  status?: string | null;
  sourceStatus?: string;
  sourceType?: string;
  sourceCategory?: string;
  dataOrigin?: string;
  location?: { coordinates?: [number, number] } | null;
  lineGeometry?: { coordinates?: [number, number][] };
  geometry?: { coordinates?: [number, number][] };
};

export default function RoadsPage() {
  const [panchayats, setPanchayats] = useState<Panchayat[]>([]);
  const [panchayatId, setPanchayatId] = useState('');
  const [roads, setRoads] = useState<Road[]>([]);
  const [ward, setWard] = useState('');
  const [condition, setCondition] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const BASE = (import.meta.env as any).VITE_BACKEND_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');

  useEffect(() => {
    const ac = new AbortController();
    fetch(BASE + '/panchayats', { signal: ac.signal }).then(async (r) => {
      if (!r.ok) throw new Error('Panchayat request failed');
      return r.json() as Promise<Panchayat[]>;
    }).then((list) => {
      setPanchayats(list);
      const requestedId = new URLSearchParams(window.location.search).get('panchayatId');
      setPanchayatId(list.find((item) => item._id === requestedId)?._id || list.find((item) => item.dataOrigin === 'SOURCE_EXCEL')?._id || list[0]?._id || '');
    }).catch((err) => { if (err?.name !== 'AbortError') setError('Failed to load Panchayats'); }).finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!panchayatId) return;
    const ac = new AbortController();
    setLoading(true);
    setError('');
    setRoads([]);
    setWard('');
    fetch(BASE + `/panchayats/${panchayatId}/roads`, { signal: ac.signal }).then(async (r) => {
      if (!r.ok) throw new Error('Road request failed');
      return r.json();
    }).then(setRoads).catch((err) => { if (err?.name !== 'AbortError') setError('Failed to load roads'); }).finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [panchayatId]);

  const filtered = useMemo(() => roads.filter((road) =>
    (!ward || (road.ward || '') === ward) && (!condition || (road.condition || '') === condition)
  ), [roads, ward, condition]);
  const wards = useMemo(() => [...new Set(roads.map((road) => road.ward).filter(Boolean) as string[])].sort(), [roads]);
  const conditions = useMemo(() => [...new Set(roads.map((road) => road.condition).filter(Boolean) as string[])].sort(), [roads]);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-4">Roads</h2>
      {panchayats.length > 0 && <label className="block max-w-xl mb-4 text-sm font-medium">Panchayat
        <select className="block w-full border p-2 rounded mt-1" value={panchayatId} onChange={(event) => setPanchayatId(event.target.value)}>
          {panchayats.map((item) => <option key={item._id} value={item._id}>{item.name}{item.dataOrigin === 'SOURCE_EXCEL' ? ' · Source dataset' : ''}</option>)}
        </select>
      </label>}
      {loading && <div className="p-2">Loading…</div>}
      {error && <div className="p-2 bg-red-100 mb-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <select className="border p-2 rounded" value={ward} onChange={(event) => setWard(event.target.value)}>
          <option value="">All Areas</option>
          {wards.map((item) => <option key={item} value={item}>{item.replace(/\bWard\b/i, 'Area')}</option>)}
        </select>
        <select className="border p-2 rounded" value={condition} onChange={(event) => setCondition(event.target.value)}>
          <option value="">All Conditions</option>
          {conditions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((road) => {
          const geometry = road.lineGeometry?.coordinates || road.geometry?.coordinates;
          const hasGeometry = Boolean(geometry?.length);
          const conditionLabel = road.condition || 'Condition unavailable';
          return <div key={road._id} className="card">
            <div className="card-body">
              <div className="font-semibold mb-1">{road.name}</div>
              <div className="text-sm text-slate-600 mb-2">{[road.village, road.ward?.replace(/\bWard\b/i, 'Area')].filter(Boolean).join(' • ') || 'Area not specified'}</div>
              <div className="mb-3">
                <span className={`px-2 py-1 rounded-full text-xs ${road.condition?.toLowerCase() === 'bad' || road.condition?.toLowerCase() === 'poor' ? 'bg-red-50 text-red-700' : road.condition?.toLowerCase() === 'average' || road.condition?.toLowerCase() === 'fair' ? 'bg-yellow-50 text-yellow-700' : road.condition ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{conditionLabel}</span>
                {road.dataOrigin === 'SOURCE_EXCEL' && <span className="ml-2 px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">Source record</span>}
              </div>
              {road.sourceStatus && <div className="text-sm text-slate-600 mb-2">Source status: {road.sourceStatus}</div>}
              {hasGeometry ? <a className="text-blue-600" href="/map">View on Map</a> : <span className="text-sm text-slate-500">Location not verified; not shown on map</span>}
            </div>
          </div>;
        })}
        {!loading && !error && filtered.length === 0 && <div className="p-3">No roads found</div>}
      </div>
    </div>
  );
}
