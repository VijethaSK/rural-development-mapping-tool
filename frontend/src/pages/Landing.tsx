import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Panchayat = { _id: string; name: string; district?: string; state?: string; wards?: string[]; dataOrigin?: string };

export default function Landing() {
  const [panchayats, setPanchayats] = useState<Panchayat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const BASE = (import.meta.env as any).VITE_BACKEND_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');
  useEffect(() => {
    let alive = true;
    setError('');
    setLoading(true);
    fetch(BASE + '/panchayats').then(async r => {
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    }).then((list) => { if (alive) setPanchayats(list); }).catch(() => {
      if (!alive) return;
      setError('Failed to load data');
      setPanchayats([
        { _id: 'p1', name: 'Varthur Gram Panchayat', district: 'Bengaluru Urban', state: 'Karnataka', wards: ['Area 1','Area 2','Area 3'] }
      ]);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8 mb-6">
        <div className="text-3xl font-semibold mb-2">Rural Development Mapping Tool</div>
        <div className="opacity-90">Visualize schools, roads and public issues to plan improvements.</div>
        <div className="mt-4 flex gap-3">
          <Link to="/map" className="btn btn-secondary">Open Map</Link>
          <Link to="/report" className="btn btn-primary">Report an Issue</Link>
        </div>
      </div>
      {loading && <div className="p-3">Loading…</div>}
      {error && <div className="p-3 bg-red-100 mb-2">{error}</div>}
      {!loading && panchayats.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Available Panchayats</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {panchayats.map((p) => (
              <Link key={p._id} to={`/map?panchayatId=${encodeURIComponent(p._id)}`} className="card hover:border-blue-400">
                <div className="card-body">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-lg">{p.name}</div>
                    {p.dataOrigin === 'SOURCE_EXCEL' && <span className="text-xs rounded-full bg-blue-50 text-blue-700 px-2 py-1">Source dataset</span>}
                  </div>
                  {(p.district || p.state) && <div className="text-slate-600">{[p.district, p.state].filter(Boolean).join(', ')}</div>}
                  {!!p.wards?.length && <div className="mt-2 text-sm">Areas: {p.wards.map(w => w.replace(/\bWard\b/i, 'Area')).join(', ')}</div>}
                  <div className="mt-3 text-sm text-blue-700">View infrastructure →</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {!loading && !panchayats.length && <div className="card"><div className="card-body">No Panchayat found</div></div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link to="/map" className="card">
          <div className="card-body text-center">
            <div className="text-xl">🗺️</div>
            <div className="font-medium">Map</div>
          </div>
        </Link>
        <Link to="/schools" className="card">
          <div className="card-body text-center">
            <div className="text-xl">🏫</div>
            <div className="font-medium">Schools</div>
          </div>
        </Link>
        <Link to="/roads" className="card">
          <div className="card-body text-center">
            <div className="text-xl">🛣️</div>
            <div className="font-medium">Roads</div>
          </div>
        </Link>
        <Link to="/report" className="card">
          <div className="card-body text-center">
            <div className="text-xl">📣</div>
            <div className="font-medium">Report Issue</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
