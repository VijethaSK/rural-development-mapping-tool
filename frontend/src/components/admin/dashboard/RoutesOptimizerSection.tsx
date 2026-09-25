import React from 'react';
import { NavLink } from 'react-router-dom';
import { RoutesMetrics } from '../../../types/adminDashboard';

interface Props {
  metrics: RoutesMetrics;
}

export function RoutesOptimizerSection({ metrics }: Props) {
  return (
    <div className="space-y-4" id="section-routes">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📍</span> Section 5: Worker Route Optimization & Transit Dispatch
          </h2>
          <p className="text-xs text-slate-500">
            Answers: <em>"Where should workers go?"</em> & <em>"What is the shortest multi-stop path?"</em>
          </p>
        </div>
        <NavLink
          to="/routes"
          className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 transition shrink-0"
        >
          Open Route Optimizer Engine →
        </NavLink>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium block">Active Maintenance Routes</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{metrics.activeRoutesCount}</div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Planned & in-execution tours</span>
          </div>
          <span className="text-3xl">🛣️</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium block">Total Transit Distance</span>
            <div className="text-2xl font-black text-blue-700 mt-1">{metrics.totalDistanceKm} km</div>
            <span className="text-[11px] text-blue-600 mt-0.5 block">Optimized via Dijkstra + 2-Opt TSP</span>
          </div>
          <span className="text-3xl">📏</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium block">Total Maintenance Stops</span>
            <div className="text-2xl font-black text-indigo-700 mt-1">{metrics.totalStops} Locations</div>
            <span className="text-[11px] text-indigo-600 mt-0.5 block">Priority-weighted visit order</span>
          </div>
          <span className="text-3xl">🎯</span>
        </div>
      </div>

      {/* Planned Routes Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metrics.plannedRoutes.length === 0 ? (
          <div className="col-span-2 bg-white rounded-2xl p-6 text-center text-slate-500 border border-slate-200">
            No active maintenance routes recorded. Generate a tour in the Route Optimizer.
          </div>
        ) : (
          metrics.plannedRoutes.map((route) => (
            <div
              key={route.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{route.name}</h3>
                  <span className="text-slate-500 text-xs">Crew: {route.assignedMemberName}</span>
                </div>
                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold text-xs">
                  {route.status}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span>📏 {route.totalDistanceKm} km</span>
                <span>⏱️ ~{route.estimatedDurationMinutes} mins</span>
                <span>🛑 {route.stopsCount} stops</span>
              </div>

              {/* Stop Sequence Preview */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 block mb-1">Visit Order:</span>
                <div className="space-y-1">
                  {route.stops.slice(0, 4).map((s) => (
                    <div
                      key={s.stopOrder}
                      className="flex items-center justify-between text-xs px-2.5 py-1 bg-white rounded-lg border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                          {s.stopOrder}
                        </span>
                        <span className="font-medium text-slate-800 truncate max-w-xs">{s.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        P: {s.priorityScore}
                      </span>
                    </div>
                  ))}
                  {route.stops.length > 4 && (
                    <span className="text-[10px] text-slate-400 block text-right">
                      +{route.stops.length - 4} more stops in itinerary
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
