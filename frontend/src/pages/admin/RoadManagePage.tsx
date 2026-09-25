import { useEffect, useState } from 'react';
import { useAuth } from '../../store/auth';
import { apiFetch } from '../../api/client';

type Road = { _id: string; name: string; ward: string; condition: string };

export default function RoadManagePage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Road[]>([]);
  const [name, setName] = useState('');
  const [ward, setWard] = useState('');
  const [condition, setCondition] = useState('Good');

  useEffect(() => { apiFetch('/admin/roads', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setItems); }, [token]);

  async function add() {
    const pList = await apiFetch('/panchayats').then(r => r.json());
    const p = pList[0];
    const created = await apiFetch('/admin/roads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ panchayatId: p._id, name, roadType: 'Village', surfaceType: 'Paved', lengthKm: 1, ward, connects: [], condition, geometry: { type: 'LineString', coordinates: [[77.5946, 12.9716], [77.5956, 12.9726]] } }) });
    const j = await created.json();
    setItems(prev => [j, ...prev]);
    setName(''); setWard('');
  }

  async function del(id: string) {
    await apiFetch(`/admin/roads/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.filter(i => i._id !== id));
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">Manage Roads</h2>
      <div className="flex gap-2 mb-3">
        <input className="border p-2" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input className="border p-2" placeholder="Area" value={ward} onChange={e => setWard(e.target.value)} />
        <select className="border p-2" value={condition} onChange={e => setCondition(e.target.value)}>
          {['Good','Average','Bad'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="bg-blue-600 text-white p-2 rounded" onClick={add}>Add</button>
      </div>
      <ul className="space-y-2">
        {items.map(i => (
          <li key={i._id} className="border p-2 rounded flex justify-between items-center">
            <div>{i.name} • {i.ward.replace(/\bWard\b/i, 'Area')} • {i.condition}</div>
            <button className="text-red-600" onClick={() => del(i._id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
