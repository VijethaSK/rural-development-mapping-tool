import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { apiFetch } from '../../api/client';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Sign In fields
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');

  // Citizen Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regVoterId, setRegVoterId] = useState('');
  const [regWard, setRegWard] = useState('Ward 1');
  const [regVillage, setRegVillage] = useState('Varthur');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(userParam?: string, passParam?: string) {
    const u = userParam || username;
    const p = passParam || password;
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Invalid username or password');
        return;
      }

      const data = await res.json();
      login(data.token, data.user);

      if (data.user?.role === 'pdo') {
        navigate('/pdo/work');
      } else if (data.user?.role === 'citizen') {
        navigate('/complaints');
      } else {
        navigate('/admin');
      }
    } catch (err: any) {
      setError(err.message || 'Network connection failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('Name, email, and password are required.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          username: regUsername.trim() || undefined,
          password: regPassword,
          phone: regPhone.trim() || undefined,
          voterId: regVoterId.trim() || undefined,
          ward: regWard.trim() || 'Ward 1',
          village: regVillage.trim() || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Registration failed');
      }

      const data = await res.json();
      login(data.token, data.user);
      setSuccessMsg('Account registered successfully! Redirecting...');
      setTimeout(() => {
        navigate('/complaints');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto my-8 p-6 bg-white rounded-3xl border border-slate-200 shadow-xl space-y-5 animate-fade-in">
      {/* Top Banner */}
      <div>
        <span className="text-xs uppercase tracking-wider font-bold text-blue-600 block">
          Panchayat GIS Portal
        </span>
        <h2 className="text-xl font-black text-slate-900 mt-1">
          {mode === 'login' ? 'Official & Citizen Sign In' : 'Citizen Registration'}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {mode === 'login'
            ? 'Access your role-based dashboard, track field maintenance, or lodge grievances.'
            : 'Join as a verified citizen to lodge complaints, upvote defects, and follow repairs.'}
        </p>
      </div>

      {/* Mode Switch Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError('');
          }}
          className={`flex-1 py-2 rounded-xl transition ${
            mode === 'login' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError('');
          }}
          className={`flex-1 py-2 rounded-xl transition ${
            mode === 'register' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Citizen Sign Up
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
          ⚠️ {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}

      {/* Quick Demo Credentials (Visible in Login Mode) */}
      {mode === 'login' && (
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
          <span className="text-[11px] font-bold text-slate-600 block">⚡ 1-Click Demo Login:</span>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setUsername('admin');
                setPassword('admin123');
                handleLogin('admin', 'admin123');
              }}
              className="p-2 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 font-semibold transition text-left"
            >
              <span className="block font-bold text-blue-700 text-[11px]">👑 Admin</span>
              <span className="text-[9px] text-slate-400 font-mono block truncate">admin123</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUsername('pdo_ramesh');
                setPassword('pdo123');
                handleLogin('pdo_ramesh', 'pdo123');
              }}
              className="p-2 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 font-semibold transition text-left"
            >
              <span className="block font-bold text-emerald-700 text-[11px]">🛠️ Member</span>
              <span className="text-[9px] text-slate-400 font-mono block truncate">pdo123</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUsername('ananya_citizen');
                setPassword('password123');
                handleLogin('ananya_citizen', 'password123');
              }}
              className="p-2 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 font-semibold transition text-left"
            >
              <span className="block font-bold text-sky-700 text-[11px]">👤 Citizen</span>
              <span className="text-[9px] text-slate-400 font-mono block truncate">pass123</span>
            </button>
          </div>
        </div>
      )}

      {/* Form: Login or Register */}
      {mode === 'login' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label className="block text-slate-700 font-bold mb-1">Username or Email</label>
            <input
              className="w-full border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 font-medium"
              placeholder="e.g. admin or ananya_citizen"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Password</label>
            <input
              className="w-full border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 font-medium"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 mt-2"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">Full Name *</label>
            <input
              className="w-full border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
              placeholder="Ananya Sharma"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Email *</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                type="email"
                placeholder="ananya@gmail.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Username</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                placeholder="ananya_citizen"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Password *</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                type="password"
                placeholder="••••••••"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Phone Number</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                placeholder="9876543210"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Voter ID</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                placeholder="KA/01/123456"
                value={regVoterId}
                onChange={(e) => setRegVoterId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Ward</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                placeholder="Ward 1"
                value={regWard}
                onChange={(e) => setRegWard(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Village</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                placeholder="Varthur"
                value={regVillage}
                onChange={(e) => setRegVillage(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !regName || !regEmail || !regPassword}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 mt-2"
          >
            {loading ? 'Creating Citizen Account...' : 'Register Citizen Account →'}
          </button>
        </form>
      )}
    </div>
  );
}
