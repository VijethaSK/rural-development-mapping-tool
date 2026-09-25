import React, { useState } from 'react';
import { useAdminDecisionSupport } from '../../hooks/useAdminDecisionSupport';
import { DecisionSupportHeader } from '../../components/admin/dashboard/DecisionSupportHeader';
import { OverviewSection } from '../../components/admin/dashboard/OverviewSection';
import { PriorityAttentionSection } from '../../components/admin/dashboard/PriorityAttentionSection';
import { MapIntelligenceSection } from '../../components/admin/dashboard/MapIntelligenceSection';
import { MaintenanceOpsSection } from '../../components/admin/dashboard/MaintenanceOpsSection';
import { RoutesOptimizerSection } from '../../components/admin/dashboard/RoutesOptimizerSection';
import { GapAnalysisSection } from '../../components/admin/dashboard/GapAnalysisSection';
import { BudgetDecisionSection } from '../../components/admin/dashboard/BudgetDecisionSection';
import { TrendsAnalyticsSection } from '../../components/admin/dashboard/TrendsAnalyticsSection';

export default function DashboardPage() {
  const {
    data,
    loading,
    refreshing,
    error,
    updateBudget,
    refresh,
    updateAssignmentStatus
  } = useAdminDecisionSupport();

  const [activeTab, setActiveTab] = useState<string>('overview');

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    const element = document.getElementById(`section-${tabId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center text-slate-500 space-y-4">
        <div className="inline-block animate-spin text-4xl">🏛️</div>
        <h2 className="text-lg font-bold text-slate-800">
          Synthesizing Panchayat Decision-Support Telemetry...
        </h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Aggregating GIS infrastructure assets, SAW priority ranks, live complaint clusters, worker routes, gap analyses, and budget allocations.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header & Guiding Questions Banner */}
      <DecisionSupportHeader
        data={data}
        refreshing={refreshing}
        onRefresh={refresh}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => refresh()}
            className="text-red-700 font-bold underline hover:text-red-900"
          >
            Retry Fetch
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Section 1: Overview */}
          <OverviewSection metrics={data.overview} />

          {/* Section 2: Priority Intelligence */}
          <PriorityAttentionSection metrics={data.priority} />

          {/* Section 3: GIS Spatial Map */}
          <MapIntelligenceSection
            infrastructure={data.mapData.infrastructure}
            complaints={data.mapData.complaints}
            topGaps={data.gapAnalysis.topGaps}
          />

          {/* Section 4: Maintenance Operations & Verification */}
          <MaintenanceOpsSection
            metrics={data.maintenance}
            onUpdateStatus={updateAssignmentStatus}
          />

          {/* Section 5: Routes Optimizer */}
          <RoutesOptimizerSection metrics={data.routes} />

          {/* Section 6: Gap Analysis */}
          <GapAnalysisSection metrics={data.gapAnalysis} />

          {/* Section 7: Budget-Constrained Recommendations */}
          <BudgetDecisionSection
            metrics={data.budget}
            onUpdateBudget={updateBudget}
          />

          {/* Section 8: Trends & Infrastructure Analytics */}
          <TrendsAnalyticsSection metrics={data.analytics} />
        </>
      )}
    </div>
  );
}
