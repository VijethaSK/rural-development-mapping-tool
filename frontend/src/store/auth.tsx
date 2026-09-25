import React, { createContext, useContext, useEffect, useState } from 'react';

export type UserInfo = {
  id: string;
  name: string;
  role: 'admin' | 'pdo' | 'citizen';
  designation?: string;
  assignedWard?: string;
  email?: string;
  phone?: string;
  voterId?: string;
  ward?: string;
  village?: string;
  panchayatId?: string;
};

type AuthContextType = {
  token: string | null;
  user: UserInfo | null;
  login: (t: string, u?: UserInfo) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  login: () => {},
  logout: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('rdmt_token'));
  const [user, setUser] = useState<UserInfo | null>(() => {
    try {
      const saved = localStorage.getItem('rdmt_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (token) localStorage.setItem('rdmt_token', token);
    else localStorage.removeItem('rdmt_token');
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem('rdmt_user', JSON.stringify(user));
    else localStorage.removeItem('rdmt_user');
  }, [user]);

  const login = (t: string, u?: UserInfo) => {
    setToken(t);
    if (u) {
      setUser(u);
    } else {
      // Decode JWT payload if user object not explicitly passed
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        setUser({
          id: payload.id,
          name: payload.name || 'Panchayat User',
          role: payload.role || 'pdo'
        });
      } catch {
        setUser(null);
      }
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
