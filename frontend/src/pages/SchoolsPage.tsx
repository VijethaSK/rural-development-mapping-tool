import { useEffect, useMemo, useState } from 'react';

type Panchayat = { _id: string; name: string; dataOrigin?: string };
type School = {
  _id: string;
  name: string;
  type?: string;
  schoolType?: string;
  sourceType?: string;
  sourceCategory?: string;
  sourceStatus?: string;
  dataOrigin?: string;
  management?: string;
  ward?: string | null;
  village?: string;
  location?: { lat?: number; lng?: number; coordinates?: [number, number] } | null;
};

export default function SchoolsPage() {
  const [panchayats, setPanchayats] = useState<Panchayat[]>([]);
  const [panchayatId, setPanchayatId] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [ward, setWard] = useState('');
  const [type, setType] = useState('');
  const [management, setManagement] = useState('');
  const [query, setQuery] = useState('');
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
    setSchools([]);
    setWard('');
    fetch(BASE + `/panchayats/${panchayatId}/schools`, { signal: ac.signal }).then(async (r) => {
      if (!r.ok) throw new Error('School request failed');
      return r.json();
    }).then(setSchools).catch((err) => { if (err?.name !== 'AbortError') setError('Failed to load schools'); }).finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [panchayatId]);

  const typeOf = (school: School) => school.schoolType || school.type || school.sourceType || '';
  const filtered = useMemo(() => schools.filter((school) =>
    (!ward || (school.ward || '') === ward)
      && (!type || typeOf(school) === type)
      && (!management || (school.management || '') === management)
      && (!query || school.name.toLowerCase().includes(query.toLowerCase()))
  ), [schools, ward, type, management, query]);
  const types = useMemo(() => [...new Set(schools.map(typeOf).filter(Boolean))].sort(), [schools]);
  const wards = useMemo(() => [...new Set(schools.map((school) => school.ward).filter(Boolean) as string[])].sort(), [schools]);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-4">Schools</h2>
      {panchayats.length > 0 && <label className="block max-w-xl mb-4 text-sm font-medium">Panchayat
        <select className="block w-full border p-2 rounded mt-1" value={panchayatId} onChange={(event) => setPanchayatId(event.target.value)}>
          {panchayats.map((item) => <option key={item._id} value={item._id}>{item.name}{item.dataOrigin === 'SOURCE_EXCEL' ? ' · Source dataset' : ''}</option>)}
        </select>
      </label>}
      {loading && <div className="p-2">Loading…</div>}
      {error && <div className="p-2 bg-red-100 mb-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <input className="border p-2 rounded" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="border p-2 rounded" value={ward} onChange={(event) => setWard(event.target.value)}>
          <option value="">All Areas</option>
          {wards.map((item) => <option key={item} value={item}>{item.replace(/\bWard\b/i, 'Area')}</option>)}
        </select>
        <select className="border p-2 rounded" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">All Types</option>
          {types.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="border p-2 rounded" value={management} onChange={(event) => setManagement(event.target.value)}>
          <option value="">All Management</option>
          {[...new Set(schools.map((school) => school.management).filter(Boolean) as string[])].sort().map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((school) => {
          const coordinates = school.location?.coordinates;
          const lat = school.location?.lat ?? (coordinates ? coordinates[1] : undefined);
          const lng = school.location?.lng ?? (coordinates ? coordinates[0] : undefined);
          const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
          return <div key={school._id} className="card">
            <div className="card-body">
              <div className="font-semibold mb-1">{school.name}</div>
              <div className="text-sm text-slate-600 mb-2">{[school.village, school.ward?.replace(/\bWard\b/i, 'Area')].filter(Boolean).join(' • ') || 'Area not specified'}</div>
              <div className="flex gap-2 mb-3 flex-wrap">
                <span className="px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700">{typeOf(school) || 'School'}</span>
                {school.management && <span className="px-2 py-1 rounded-full text-xs bg-green-50 text-green-700">{school.management}</span>}
                {school.dataOrigin === 'SOURCE_EXCEL' && <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">Source record</span>}
              </div>
              {hasLocation
                ? <a className="text-blue-600" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}`}>View on Map</a>
                : <span className="text-sm text-slate-500">Location not verified</span>}
              {school.sourceStatus && <div className="mt-2 text-sm text-slate-600">Source status: {school.sourceStatus}</div>}
            </div>
          </div>;
        })}
        {!loading && !error && filtered.length === 0 && <div className="p-3">No schools found</div>}
      </div>
    </div>
  );
}
