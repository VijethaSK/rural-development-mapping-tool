import { useEffect, useState } from 'react';
import { useAuth } from '../../store/auth';
import { apiFetch } from '../../api/client';

type School = { _id: string; name: string; ward: string; type: string; management: string };

export default function SchoolManagePage() {
  const { token } = useAuth();
  const [items, setItems] = useState<School[]>([]);
  const [name, setName] = useState('');
  const [ward, setWard] = useState('');
  const [type, setType] = useState('Primary');
  const [management, setManagement] = useState('Govt');

  useEffect(() => { apiFetch('/admin/schools', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setItems); }, [token]);

  async function add() {
    const pList = await apiFetch('/panchayats').then(r => r.json());
    const p = pList[0];
    const created = await apiFetch('/admin/schools', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ panchayatId: p._id, name, type, management, medium: 'English', classesFrom: 1, classesTo: 5, studentCount: 0, staffCount: 0, ward, village: ward, location: { lat: 12.9716, lng: 77.5946 }, facilities: { toilets: 'Functional', drinkingWater: true, playground: true, boundaryWall: false } }) });
    const j = await created.json();
    setItems(prev => [j, ...prev]);
    setName(''); setWard('');
  }

  async function del(id: string) {
    await apiFetch(`/admin/schools/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.filter(i => i._id !== id));
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">Manage Schools</h2>
      <div className="flex gap-2 mb-3">
        <input className="border p-2" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input className="border p-2" placeholder="Area" value={ward} onChange={e => setWard(e.target.value)} />
        <select className="border p-2" value={type} onChange={e => setType(e.target.value)}>
          {['Primary','HighSchool','PUC'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="border p-2" value={management} onChange={e => setManagement(e.target.value)}>
          {['Govt','Private','Aided'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button className="bg-blue-600 text-white p-2 rounded" onClick={add}>Add</button>
      </div>
      <ul className="space-y-2">
        {items.map(i => (
          <li key={i._id} className="border p-2 rounded flex justify-between items-center">
            <div>{i.name} • {i.ward.replace(/\bWard\b/i, 'Area')} • {i.type} • {i.management}</div>
            <button className="text-red-600" onClick={() => del(i._id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
