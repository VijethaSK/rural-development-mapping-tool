import { useEffect, useState } from 'react';
import { useAuth } from '../../store/auth';

type Issue = { _id: string; category: string; ward: string; description: string; status: string; photoUrl?: string; location?: { lat:number; lng:number } };

export default function IssuesPage() {
  const { token } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [ward, setWard] = useState('');
  const [detail, setDetail] = useState<Issue | null>(null);
  const [error, setError] = useState('');
  const BASE = (import.meta.env as any).VITE_BACKEND_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');

  useEffect(() => {
    fetch(BASE + '/panchayats').then(r => r.json()).then((list) => {
      const p = list[0];
      if (p) fetch(BASE + `/panchayats/${p._id}/issues`).then(r => r.json()).then(setIssues);
    });
  }, []);

  const filtered = issues.filter(i => (!status || i.status === status) && (!category || i.category === category) && (!ward || i.ward === ward));
  const label = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
  const nextStates: Record<string, string[]> = {
    SUBMITTED: ['UNDER_REVIEW', 'REJECTED'], UNDER_REVIEW: ['PRIORITY_SET', 'REJECTED'],
    PRIORITY_SET: ['ASSIGNED', 'UNDER_REVIEW', 'REJECTED'], ASSIGNED: ['IN_PROGRESS', 'REASSIGNED', 'PRIORITY_SET'],
    REASSIGNED: ['IN_PROGRESS', 'ASSIGNED'], IN_PROGRESS: ['COMPLETED', 'ASSIGNED'],
    COMPLETED: ['VERIFIED', 'IN_PROGRESS', 'REJECTED'], VERIFIED: ['CLOSED', 'IN_PROGRESS'],
    CLOSED: ['UNDER_REVIEW'], REJECTED: ['UNDER_REVIEW']
  };

  async function changeStatus(id: string, s: string) {
    await fetch(BASE + `/issues/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: s }) });
    setIssues(prev => prev.map(i => i._id === id ? { ...i, status: s } : i));
    setDetail(d => d && d._id === id ? { ...d, status: s } : d);
  }

  async function removeIssue(id: string) {
    setError('');
    const resp = await fetch(BASE + `/issues/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      setError('Failed to delete issue');
      return;
    }
    setIssues(prev => prev.filter(i => i._id !== id));
    setDetail(d => d && d._id === id ? null : d);
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-4">Issue Management</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <select className="border p-2 rounded" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          {['SUBMITTED','UNDER_REVIEW','PRIORITY_SET','ASSIGNED','REASSIGNED','IN_PROGRESS','COMPLETED','VERIFIED','CLOSED','REJECTED'].map(s => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="border p-2 rounded" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Category</option>
          {['School','Road','Other'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border p-2 rounded" value={ward} onChange={e => setWard(e.target.value)}>
          <option value="">All Areas</option>
          {[...new Set(issues.map(i => i.ward))].map(w => <option key={w} value={w}>{w.replace(/\bWard\b/i, 'Area')}</option>)}
        </select>
      </div>
      {error && <div className="p-2 bg-red-100 mb-2">{error}</div>}
      <table className="w-full border rounded overflow-hidden">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 border">Area</th>
            <th className="p-2 border">Category</th>
            <th className="p-2 border">Description</th>
            <th className="p-2 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(i => (
            <tr key={i._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetail(i)}>
              <td className="p-2 border">{i.ward.replace(/\bWard\b/i, 'Area')}</td>
              <td className="p-2 border">{i.category}</td>
              <td className="p-2 border">{i.description}</td>
              <td className="p-2 border text-right">
                <button className="px-2 py-1 rounded border border-red-600 text-red-600" onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this issue?')) removeIssue(i._id); }}>Delete</button>
              </td>
              <td className="p-2 border"><span className={`px-2 py-1 rounded-full text-xs ${i.status==='CLOSED'?'bg-green-50 text-green-700':i.status==='IN_PROGRESS'?'bg-blue-50 text-blue-700':i.status==='UNDER_REVIEW'?'bg-yellow-50 text-yellow-700':'bg-slate-100 text-slate-700'}`}>{label(i.status)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={() => setDetail(null)}>
          <div className="bg-white p-4 rounded w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="font-semibold mb-2">Issue Detail</div>
            <div className="mb-2">{detail.description}</div>
            {detail.photoUrl && <img src={detail.photoUrl} alt="photo" className="mb-2" />}
            <div className="flex gap-2 mb-2">
              {(nextStates[detail.status] || []).map(s => (
                <button key={s} className="p-2 rounded border" onClick={() => changeStatus(detail._id, s)}>{label(s)}</button>
              ))}
            </div>
            <div className="flex justify-end">
              <button className="px-3 py-2 rounded border border-red-600 text-red-600" onClick={() => { if (window.confirm('Delete this issue?')) removeIssue(detail._id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
