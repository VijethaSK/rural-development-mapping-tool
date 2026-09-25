import { useState, useEffect, useCallback } from 'react';
import { apiAuth } from '../api/client';
import { useAuth } from '../store/auth';
import { AdminDashboardData } from '../types/adminDashboard';

export function useAdminDecisionSupport() {
  const { token } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<number>(1000000); // ₹10 Lakhs default

  const fetchDashboardData = useCallback(async (customBudget?: number) => {
    const activeBudget = customBudget !== undefined ? customBudget : budget;
    setRefreshing(true);
    setError(null);
    try {
      if (!token) throw new Error('Sign in as an administrator to view this dashboard.');
      const res = await apiAuth<AdminDashboardData>(`/admin/decision-support?budget=${activeBudget}`, token);
      setData(res);
    } catch (err: any) {
      console.error('Error fetching admin decision-support data:', err);
      setError(err.message || 'Failed to load decision-support dashboard metrics.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [budget, token]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const updateBudget = async (newBudget: number) => {
    setBudget(newBudget);
    await fetchDashboardData(newBudget);
  };

  const updateAssignmentStatus = async (
    assignmentId: string,
    status: 'In_Progress' | 'Completed' | 'Verified' | 'Rejected',
    notes?: string
  ) => {
    try {
      if (!token) throw new Error('Sign in as an administrator to update assignments.');
      await apiAuth(`/assignments/${assignmentId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          verificationNotes: status === 'Verified' ? notes || 'Verified by Admin' : undefined,
          completionNotes: status === 'Completed' ? notes || 'Marked completed by crew' : undefined
        })
      });
      // Refresh dashboard data to sync counts across sections
      await fetchDashboardData();
      return true;
    } catch (err: any) {
      console.error('Failed to update assignment status:', err);
      alert(`Error updating assignment: ${err.message || err}`);
      return false;
    }
  };

  return {
    data,
    loading,
    refreshing,
    error,
    budget,
    updateBudget,
    refresh: fetchDashboardData,
    updateAssignmentStatus
  };
}
