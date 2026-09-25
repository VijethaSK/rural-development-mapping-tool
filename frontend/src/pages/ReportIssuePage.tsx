import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { apiFetch } from '../api/client';

type Panchayat = { _id: string; wards: string[] };
type School = { _id: string; name: string };
type Road = { _id: string; name: string };

function LocationPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e: any) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function ReportIssuePage() {
  const [p, setP] = useState<Panchayat | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [roads, setRoads] = useState<Road[]>([]);
  const [category, setCategory] = useState<'School'|'Road'|'Other'>('Other');
  const [schoolId, setSchoolId] = useState('');
  const [roadId, setRoadId] = useState('');
  const [ward, setWard] = useState('');
  const [village, setVillage] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{lat:number,lng:number}|null>(null);
  const [photoFile, setPhotoFile] = useState<File|null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/panchayats').then(r => r.json()).then((list: Panchayat[]) => {
      const first = list[0];
      setP(first);
      if (first) {
        apiFetch(`/panchayats/${first._id}/schools`).then(r => r.json()).then(setSchools);
        apiFetch(`/panchayats/${first._id}/roads`).then(r => r.json()).then(setRoads);
      }
    });
  }, []);

  async function submit() {
    if (!p) return;
    const w = ward.trim();
    const d = description.trim();
    const needSchool = category === 'School' && !schoolId;
    const needRoad = category === 'Road' && !roadId;
    if (!w || !d || needSchool || needRoad) {
      setError('Please fill all required fields');
      return;
    }
    let photoUrl: string | undefined;
    if (photoFile) {
      const fd = new FormData();
      fd.append('file', photoFile);
      const r = await apiFetch('/upload', { method: 'POST', body: fd });
      const j = await r.json();
      photoUrl = j.url;
    }
    const payload: any = { category, ward: w, village, description: d, photoUrl };
    if (location) payload.location = location;
    if (category === 'School' && schoolId) payload.schoolId = schoolId;
    if (category === 'Road' && roadId) payload.roadId = roadId;
    await apiFetch(`/panchayats/${p._id}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSubmitted(true);
    setError('');
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-3">Report Issue</h2>
      {!submitted && error && <div className="p-2 bg-red-100">{error}</div>}
      {submitted ? <div className="p-3 bg-green-100">Submitted</div> : (
        <div className="space-y-3">
          <div>
            <label className="mr-2">Category</label>
            <select className="border p-2" value={category} onChange={e => setCategory(e.target.value as any)}>
              {['School','Road','Other'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {category === 'School' && (
            <div>
              <label className="mr-2">School</label>
              <select className="border p-2" value={schoolId} onChange={e => setSchoolId(e.target.value)}>
                <option value="">Select School</option>
                {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {category === 'Road' && (
            <div>
              <label className="mr-2">Road</label>
              <select className="border p-2" value={roadId} onChange={e => setRoadId(e.target.value)}>
                <option value="">Select Road</option>
                {roads.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <input className="border p-2 flex-1" placeholder="Area" value={ward} onChange={e => setWard(e.target.value)} />
            <input className="border p-2 flex-1" placeholder="Village" value={village} onChange={e => setVillage(e.target.value)} />
          </div>
          <textarea className="border p-2 w-full" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="h-64">
            <MapContainer center={[12.9716, 77.5946]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationPicker onPick={(lat, lng) => setLocation({ lat, lng })} />
              {location && <Marker position={[location.lat, location.lng]} />}
            </MapContainer>
          </div>
          <input type="file" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
          <button className="bg-blue-600 text-white p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed" onClick={submit} disabled={
            !ward.trim() || !description.trim() || (category==='School' && !schoolId) || (category==='Road' && !roadId)
          }>Submit</button>
        </div>
      )}
    </div>
  );
}
