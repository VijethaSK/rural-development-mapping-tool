import { Request, Response } from 'express';
import { MultiStopOptimizer } from '../services/routing/multiStopOptimizer.js';
import { StopCandidate } from '../services/routing/types.js';
import { Infrastructure, Road } from '../models/Infrastructure.js';
import { PriorityScoringService } from '../services/priorityScoringService.js';
import { Route } from '../models/Route.js';
import { User } from '../models/User.js';
import mongoose from 'mongoose';
import { Panchayat } from '../models/Panchayat.js';
import { assertPanchayatAccess, panchayatFilter, resolvePanchayatScope } from '../middleware/panchayatScope.js';
import { getRoutingErrorStatusCode } from '../services/routing/routingErrors.js';
import { getExplicitSyntheticDemoPoint, getVerifiedInfrastructurePoint, getVerifiedSpatialPoint, isExplicitSyntheticDemoRecord } from '../services/spatial/spatialCoordinateEligibility.js';
import { GAP_ANALYSIS_DEMO_SOURCE } from '../services/spatial/gapAnalysisDemoProvenance.js';
import { getSyntheticDemoRouteCandidates, getSyntheticDemoRoutingProvider } from '../services/routing/routingProvider.js';

async function getSyntheticPreviewPanchayat(req: Request, panchayatId?: string): Promise<any | null> {
  if (req.app.locals.allowSyntheticGapAnalysisDemo !== true || !panchayatId) return null;
  const panchayat: any = await Panchayat.findById(panchayatId).lean();
  return panchayat?.source === GAP_ANALYSIS_DEMO_SOURCE && panchayat?.dataOrigin === 'SYNTHETIC_DEMO' &&
    panchayat?.isSynthetic === true && panchayat?.coordinatesVerified === false &&
    panchayat?.coordinateSource === 'SYNTHETIC' && panchayat?.coordinateStatus === 'DEMO_ONLY'
    ? panchayat
    : null;
}

export class RouteOptimizationController {
  /**
   * POST /api/routes/optimize
   */
  public static async optimize(req: Request, res: Response): Promise<void> {
    try {
      const {
        panchayatId,
        startLocation,
        maintenanceLocations,
        autoSelectTop,
        topCount = 5,
        options = {}
      } = req.body;

      const scopedPanchayatId = resolvePanchayatScope(req, panchayatId);
      const parsedTopCount = Number(topCount);
      if (!Number.isInteger(parsedTopCount) || parsedTopCount < 1 || parsedTopCount > 50) { res.status(400).json({ error: 'topCount must be between 1 and 50.' }); return; }
      if (maintenanceLocations != null && (!Array.isArray(maintenanceLocations) || maintenanceLocations.length > 50)) { res.status(400).json({ error: 'maintenanceLocations must contain no more than 50 stops.' }); return; }

      if (!startLocation) {
        res.status(400).json({ error: 'startLocation is required with lat and lng.' });
        return;
      }

      const syntheticPreviewPanchayat = await getSyntheticPreviewPanchayat(req, scopedPanchayatId);

      let candidates: StopCandidate[] = [];

      // Auto-select top priority assets if requested or if maintenanceLocations is omitted
      if (autoSelectTop || !maintenanceLocations || maintenanceLocations.length === 0) {
        if (syntheticPreviewPanchayat) {
          const demoCandidates = await getSyntheticDemoRouteCandidates(String(syntheticPreviewPanchayat._id));
          candidates = demoCandidates.map((item: any) => ({
            infrastructureId: item._id,
            panchayatId: String(item.panchayatId),
            infrastructureName: item.name,
            type: item.type,
            location: item.location,
            priorityScore: 0,
            priorityLevel: 'Unavailable'
          }));
        } else {
        const ranked = await PriorityScoringService.getRanked({
          panchayatId: scopedPanchayatId,
          limit: parsedTopCount
        });

        candidates = ranked.items
          .map((item: any) => {
            const location = getVerifiedInfrastructurePoint(item);
            return location ? {
              infrastructureId: String(item.id || item._id),
              panchayatId: String(item.panchayatId || scopedPanchayatId || ''),
              infrastructureName: item.name,
              type: item.type,
              location,
              priorityScore: item.priorityScore,
              priorityLevel: item.priorityLevel
            } : null;
          }).filter((item) => item !== null) as StopCandidate[];
        }
      } else {
        // Hydrate and populate incoming candidates
        for (const locItem of maintenanceLocations) {
          let location: { lat: number; lng: number } | null = null;
          let name = locItem.infrastructureName || locItem.name;
          let score = locItem.priorityScore;
          let level = locItem.priorityLevel;
          let type = locItem.type;

          if (!locItem.infrastructureId) {
            res.status(400).json({ error: 'Every route stop must reference stored infrastructure with verified coordinate provenance.' });
            return;
          }
          const infra: any = await Infrastructure.findById(locItem.infrastructureId).lean();
          if (!infra) { res.status(404).json({ error: 'Infrastructure stop not found.' }); return; }
          assertPanchayatAccess(req, infra.panchayatId);
          if (scopedPanchayatId && String(infra.panchayatId) !== scopedPanchayatId) {
            res.status(403).json({ error: 'All route stops must belong to the selected Panchayat.' }); return;
          }
          const isDemoStop = syntheticPreviewPanchayat && isExplicitSyntheticDemoRecord(infra) &&
            infra.syntheticDemoRoles?.includes('ROUTE_STOP');
          location = isDemoStop ? getExplicitSyntheticDemoPoint(infra) : getVerifiedInfrastructurePoint(infra);
          if (!location) {
            res.status(422).json({ error: `Infrastructure stop "${infra.name}" has no verified, trusted spatial coordinates.` });
            return;
          }
          // Stored infrastructure identity, score, and location are authoritative.
          name = infra.name;
          type = infra.type;
          score = infra.priorityScore ?? 50;
          level = infra.priorityLevel ?? 'Medium';

          if (location) {
            candidates.push({
              infrastructureId: String(infra._id),
              infrastructureName: name || 'Infrastructure Stop',
              type: type || 'Facility',
              location,
              priorityScore: isDemoStop ? 0 : Number(score ?? 50),
              priorityLevel: isDemoStop ? 'Unavailable' : level || 'Medium'
            });
          }
        }
      }

      // Execute provider-backed routing metrics & priority nearest-neighbor + 2-opt ordering.
      const demoProvider = syntheticPreviewPanchayat
        ? await getSyntheticDemoRoutingProvider(String(syntheticPreviewPanchayat._id))
        : undefined;
      const result = await MultiStopOptimizer.optimizeRoute(
        startLocation,
        candidates,
        {
          ...options,
              panchayatId: scopedPanchayatId
        },
        demoProvider
      );

      res.json({
        success: true,
        ...(syntheticPreviewPanchayat ? { syntheticDemo: true, priorityScoresAvailable: false } : {}),
        data: result
      });
    } catch (err: any) {
      console.error('Route optimization error:', err);
      res.status(getRoutingErrorStatusCode(err)).json({ error: err.message || 'Route optimization failed.', ...(err.errorCode ? { errorCode: err.errorCode } : {}) });
    }
  }

  /**
   * POST /api/routes/save
   * Persist optimized route to MongoDB
   */
  public static async saveRoute(req: Request, res: Response): Promise<void> {
    try {
      const {
        panchayatId,
        name,
        assignedMemberId,
        startLocation,
        optimizationResult,
        routeOptions = {}
      } = req.body;

      if (!panchayatId || !optimizationResult || !startLocation) {
        res.status(400).json({
          error: 'panchayatId and optimizationResult are required to save a route.'
        });
        return;
      }

      const scopedPanchayatId = resolvePanchayatScope(req, panchayatId);
      if (!scopedPanchayatId) {
        res.status(400).json({ error: 'panchayatId is required to save a route.' });
        return;
      }
      const resolvedMemberId = assignedMemberId || (req.user?.role === 'pdo' ? req.user.id : undefined);
      const assignee = resolvedMemberId
        ? await User.findById(resolvedMemberId).select('_id role panchayatId isActive')
        : await User.findOne({ role: 'pdo', panchayatId: scopedPanchayatId, isActive: true }).select('_id role panchayatId isActive');
      if (!assignee || assignee.role !== 'pdo' || !assignee.isActive || String(assignee.panchayatId || '') !== scopedPanchayatId) {
        res.status(403).json({ error: 'Assigned member must be an active PDO in this Panchayat.' });
        return;
      }
      if (req.user?.role === 'pdo' && String(req.user.id) !== String(resolvedMemberId || assignee?._id)) {
        res.status(403).json({ error: 'PDO users may only save routes assigned to themselves.' });
        return;
      }
      const infrastructureIds = [...new Set((req.body.selectedInfrastructureIds || optimizationResult.orderedStops || []).map((stop: any) => String(typeof stop === 'string' ? stop : stop.infrastructureId || '')))].filter(Boolean);
      if (!infrastructureIds.length) {
        res.status(400).json({ error: 'At least one infrastructure stop is required.' });
        return;
      }
      if (infrastructureIds.some(id => !mongoose.isValidObjectId(id))) { res.status(400).json({ error: 'Route contains an invalid infrastructure ID.' }); return; }
      const ownedStops: any[] = await Infrastructure.find({ _id: { $in: infrastructureIds }, panchayatId: scopedPanchayatId }).lean();
      if (ownedStops.length !== infrastructureIds.length) {
        res.status(403).json({ error: 'Every route stop must be infrastructure in the selected Panchayat.' });
        return;
      }

      const start = { lat: Number(startLocation.lat), lng: Number(startLocation.lng) };
      MultiStopOptimizer.validateCoordinate(start, 'start location');
      const safeRouteOptions = routeOptions && typeof routeOptions === 'object' && !Array.isArray(routeOptions) ? routeOptions : {};
      const routeSpeed = Number.isFinite(Number(safeRouteOptions.averageSpeedKmph)) && safeRouteOptions.averageSpeedKmph !== '' ? Number(safeRouteOptions.averageSpeedKmph) : 30;
      const candidates: StopCandidate[] = ownedStops.map((infra: any) => {
        const location = getVerifiedInfrastructurePoint(infra);
        if (!location) throw Object.assign(new Error(`Infrastructure ${infra.name} has no verified, trusted spatial coordinates.`), { statusCode: 422 });
        MultiStopOptimizer.validateCoordinate(location, `location for ${infra.name}`);
        return { infrastructureId: String(infra._id), infrastructureName: infra.name, type: infra.type, location, priorityScore: Number(infra.priorityScore ?? 50), priorityLevel: infra.priorityLevel || 'Medium' };
      });
      const recalculated = await MultiStopOptimizer.optimizeRoute(start, candidates, {
        panchayatId: scopedPanchayatId,
        priorityWeight: Number.isFinite(Number(safeRouteOptions.priorityWeight)) ? Number(safeRouteOptions.priorityWeight) : undefined,
        averageSpeedKmph: routeSpeed,
        apply2Opt: safeRouteOptions.apply2Opt !== false
      });
      if (recalculated.unreachableStops.length || recalculated.stopsCount !== candidates.length) { res.status(422).json({ error: 'Cannot save a route containing stops unreachable in the stored road network.', unreachableStops: recalculated.unreachableStops }); return; }
      if (recalculated.fallbackUsed) { res.status(422).json({ error: 'Cannot save this route: at least one leg used straight-line fallback rather than network routing.' }); return; }
      const destinations = recalculated.orderedStops.map((stop: any) => ({
        infrastructureId: stop.infrastructureId,
        name: stop.infrastructureName,
        location: {
          type: 'Point',
          coordinates: [stop.location.lng, stop.location.lat]
        },
        priority: stop.priorityScore
      }));

      const orderedStops = recalculated.orderedStops.map((stop: any) => ({
        stopOrder: stop.sequence,
        infrastructureId: stop.infrastructureId,
        name: stop.infrastructureName,
        location: {
          type: 'Point',
          coordinates: [stop.location.lng, stop.location.lat]
        },
        legDistanceMeters: Math.round(stop.distanceFromPreviousKm * 1000),
        legDurationSeconds: stop.durationSeconds == null
          ? Math.round((stop.distanceFromPreviousKm / routeSpeed) * 3600)
          : Math.round(stop.durationSeconds),
        priorityScore: stop.priorityScore
      }));

      const savedRoute = await Route.create({
        panchayatId: scopedPanchayatId,
        name: name || `Maintenance Route ${new Date().toLocaleDateString()}`,
        assignedMember: assignee._id,
        startLocation: {
          type: 'Point',
          coordinates: [startLocation.lng, startLocation.lat]
        },
        destinations,
        orderedStops,
        geometry: recalculated.routeGeometry,
        totalDistance: recalculated.totalDistanceMeters,
        totalDistanceKm: recalculated.totalDistanceKm,
        estimatedDuration: recalculated.estimatedDurationMinutes,
        routingMethod: recalculated.routingMethod,
        fallbackUsed: recalculated.fallbackUsed,
        algorithmUsed: recalculated.algorithm.description,
        status: 'Planned',
        generatedAt: new Date()
      });

      res.status(201).json({
        success: true,
        data: savedRoute
      });
    } catch (err: any) {
      console.error('Save route error:', err);
      res.status(getRoutingErrorStatusCode(err)).json({ error: err.message || 'Failed to save route.', ...(err.errorCode ? { errorCode: err.errorCode } : {}) });
    }
  }

  /**
   * GET /api/routes
   * List saved routes
   */
  public static async getRoutes(req: Request, res: Response): Promise<void> {
    try {
      const { panchayatId, memberId, status } = req.query;
      const filter: any = { ...panchayatFilter(req, panchayatId) };
      if (req.user?.role === 'pdo') filter.assignedMember = req.user.id;
      else if (memberId) filter.assignedMember = memberId;
      if (status) filter.status = status;

      const routes = await Route.find(filter)
        .populate('assignedMember', 'name role')
        .sort({ generatedAt: -1 })
        .lean();

      res.json({ success: true, count: routes.length, data: routes });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch routes.' });
    }
  }

  /**
   * GET /api/routes/:id
   */
  public static async getRouteById(req: Request, res: Response): Promise<void> {
    try {
      const route = await Route.findById(req.params.id)
        .populate('assignedMember', 'name email role phone')
        .lean();

      if (!route) {
        res.status(404).json({ error: 'Route not found.' });
        return;
      }
      assertPanchayatAccess(req, route.panchayatId);
      const routeMemberId = (route.assignedMember as any)?._id || route.assignedMember;
      if (req.user?.role === 'pdo' && String(routeMemberId) !== String(req.user.id)) {
        res.status(403).json({ error: 'Forbidden: this route is assigned to another member.' });
        return;
      }
      res.json({ success: true, data: route });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to retrieve route.' });
    }
  }

  /**
   * GET /api/routes/candidates
   * Fetch prioritized candidate infrastructure for route planning
   */
  public static async getCandidates(req: Request, res: Response): Promise<void> {
    try {
      const { panchayatId: requestedPanchayatId, limit = 20, minScore = 0 } = req.query;
      const panchayatId = resolvePanchayatScope(req, requestedPanchayatId);
      const candidateLimit = Number(limit);
      if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 50) { res.status(400).json({ error: 'limit must be between 1 and 50.' }); return; }
      const syntheticPreviewPanchayat = await getSyntheticPreviewPanchayat(req, panchayatId as string | undefined);
      if (syntheticPreviewPanchayat) {
        const candidates = (await getSyntheticDemoRouteCandidates(String(syntheticPreviewPanchayat._id))).slice(0, candidateLimit);
        const startLocation = getExplicitSyntheticDemoPoint(syntheticPreviewPanchayat, syntheticPreviewPanchayat.location || syntheticPreviewPanchayat.centerCoord);
        res.json({
          success: true,
          count: candidates.length,
          startLocation,
          panchayatName: syntheticPreviewPanchayat.name,
          syntheticDemo: true,
          priorityScoresAvailable: false,
          data: candidates
        });
        return;
      }
      const ranked = await PriorityScoringService.getRanked({
        panchayatId: panchayatId as string,
        limit: candidateLimit
      });

      const candidates = ranked.items
        .filter((item: any) => (minScore ? item.priorityScore >= Number(minScore) : true))
        .map((item: any) => {
          const location = getVerifiedInfrastructurePoint(item);

          if (!location) return null;
          return {
            _id: item.id || item._id,
            panchayatId: item.panchayatId,
            name: item.name,
            type: item.type,
            condition: item.condition,
            complaintsCount: item.complaintsCount,
            populationServed: item.populationServed,
            priorityScore: item.priorityScore,
            priorityLevel: item.priorityLevel,
            location
          };
        }).filter((item: any) => item !== null);

      const panchayat = panchayatId ? await Panchayat.findById(panchayatId)
        .select('centerCoord location name coordinatesVerified coordinateStatus coordinateSource dataOrigin isSynthetic source').lean() : null;
      const verifiedCenter = panchayat
        ? getVerifiedSpatialPoint(panchayat, panchayat.location || panchayat.centerCoord)
        : null;
      res.json({
        success: true,
        count: candidates.length,
        startLocation: verifiedCenter,
        panchayatName: panchayat?.name || null,
        data: candidates
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch candidate infrastructure.' });
    }
  }
}
