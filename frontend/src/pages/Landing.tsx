import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

type Panchayat = {
  _id: string;
  name: string;
  district?: string;
  state?: string;
  wards?: string[];
  dataOrigin?: string;
};

const quickLinks = [
  { to: '/map', icon: '🗺️', label: 'Map', description: 'Explore infrastructure on the map' },
  { to: '/schools', icon: '🏫', label: 'Schools', description: 'Browse school records' },
  { to: '/roads', icon: '🛣️', label: 'Roads', description: 'Browse road records' },
  { to: '/report', icon: '📣', label: 'Report Issue', description: 'Submit a public issue' }
];

export default function Landing() {
  const [panchayats, setPanchayats] = useState<Panchayat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');
    setLoading(true);
    apiFetch('/panchayats')
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load Panchayats');
        return response.json();
      })
      .then((list) => {
        if (alive && Array.isArray(list)) setPanchayats(list);
      })
      .catch(() => {
        if (!alive) return;
        setError('Panchayat data could not be loaded. Please try again later.');
        setPanchayats([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="landing-page mx-auto w-full max-w-7xl space-y-9 px-4 py-6 sm:px-6 sm:py-8 lg:space-y-11 lg:py-10">
      <section className="landing-hero overflow-hidden rounded-3xl border px-6 py-7 sm:px-8 sm:py-8 lg:px-10" aria-labelledby="landing-title">
        <div className="max-w-3xl">
          <div className="landing-eyebrow inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]">
            <span className="landing-status-dot" aria-hidden="true" />
            Rural infrastructure · GIS
          </div>
          <h1 id="landing-title" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.65rem]">
            Rural Development Mapping Tool
          </h1>
          <p className="landing-hero-copy mt-3 max-w-2xl text-base leading-7 sm:text-lg">
            Visualize schools, roads and public issues to plan improvements.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/map"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Open Map <span className="ml-2" aria-hidden="true">→</span>
            </Link>
            <Link
              to="/report"
              className="landing-secondary-action inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Report an Issue
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="panchayat-heading">
        <div className="mb-4 flex flex-col gap-1 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="panchayat-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Available Panchayats
            </h2>
            <p className="landing-muted mt-1 text-sm">Choose a Panchayat to view its infrastructure records.</p>
          </div>
        </div>

        {loading && (
          <div className="landing-state rounded-2xl border px-4 py-5 text-sm" role="status" aria-live="polite">
            Loading Panchayats…
          </div>
        )}
        {!loading && error && (
          <div className="landing-error rounded-2xl border px-4 py-4 text-sm" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && panchayats.length > 0 && (
          <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {panchayats.map((panchayat) => {
              const location = [panchayat.district, panchayat.state].filter(Boolean).join(', ');
              const areas = panchayat.wards?.map((ward) => ward.replace(/\bWard\b/i, 'Area')) ?? [];
              return (
                <Link
                  key={panchayat._id}
                  to={`/map?panchayatId=${encodeURIComponent(panchayat._id)}`}
                  className="landing-card group flex h-full flex-col rounded-2xl border p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 break-words text-lg font-semibold leading-snug tracking-tight">
                      {panchayat.name}
                    </h3>
                    {panchayat.dataOrigin === 'SOURCE_EXCEL' && (
                      <span className="landing-source-badge shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold">
                        Source dataset
                      </span>
                    )}
                  </div>

                  {location && <p className="landing-muted mt-2 text-sm">{location}</p>}
                  {areas.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Areas">
                      {areas.map((area, index) => (
                        <span key={`${area}-${index}`} className="landing-area-chip rounded-md border px-2 py-1 text-xs">
                          {area}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="landing-card-action mt-auto pt-5">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition-colors group-hover:text-blue-800">
                      View infrastructure <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {!loading && !error && panchayats.length === 0 && (
          <div className="landing-state rounded-2xl border px-4 py-5 text-sm">
            No Panchayats are available to display.
          </div>
        )}
      </section>

      <section aria-labelledby="explore-heading">
        <div className="mb-4">
          <h2 id="explore-heading" className="text-lg font-semibold tracking-tight sm:text-xl">Explore RDMT</h2>
          <p className="landing-muted mt-1 text-sm">Open a tool directly.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="landing-card group flex items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <span className="landing-quick-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl" aria-hidden="true">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{item.label}</span>
                <span className="landing-muted mt-0.5 block text-xs leading-5">{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
