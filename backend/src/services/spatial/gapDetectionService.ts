import {
  Coordinate,
  FacilityCandidate,
  RoadSegmentCandidate,
  UnderservedArea,
  SchoolBufferZone,
  AccessibilityMetrics,
  GapAnalysisOptions,
  GapAnalysisResult,
  GapSeverity
} from './types.js';
import { SpatialUtils } from './spatialUtils.js';
import { GAP_ANALYSIS_DEMO_SOURCE } from './gapAnalysisDemoProvenance.js';
import {
  getVerifiedRoadLineString,
  getVerifiedSpatialPoint,
  isExplicitSyntheticDemoRecord,
  isValidGeoLineString
} from './spatialCoordinateEligibility.js';
import { School, Road } from '../../models/Infrastructure.js';
import { Panchayat } from '../../models/Panchayat.js';
import { getRoutingProvider } from '../routing/routingProvider.js';
import { calculateOverallGapPopulationMetrics, gapAreaPopulation } from './populationMetrics.js';
import {
  assessOverallGap,
  calculateDistanceRatio,
  coverageStatusForRatio,
  formatDistanceRatio,
  severityForDistanceRatio
} from './distanceThresholdClassification.js';

function formatFiniteDistanceKm(distanceKm: number): string {
  return Number.isFinite(distanceKm) ? `${distanceKm.toFixed(3)} km` : 'unavailable';
}

function formatCoverageDistanceNote(
  label: 'school' | 'road',
  distanceKm: number | undefined,
  thresholdKm: number
): string {
  const ratio = calculateDistanceRatio(distanceKm, thresholdKm);
  if (ratio == null) {
    return label === 'road'
      ? 'road distance unavailable (no usable road geometry)'
      : 'school distance unavailable (no usable school coordinates)';
  }
  const status = ratio < 1
    ? 'within acceptable threshold'
    : ratio === 1
      ? 'at the threshold (classified as a gap)'
      : 'beyond the threshold';
  return `nearest ${label} distance is ${formatFiniteDistanceKm(distanceKm!)} (threshold: ${thresholdKm} km; ratio: ${formatDistanceRatio(ratio)}; ${status})`;
}

export function buildHabitationGapNotes(
  name: string,
  schoolDistanceKm: number,
  schoolThresholdKm: number,
  networkDistanceKm: number | undefined,
  roadDistanceKm: number | undefined,
  roadThresholdKm: number
): string {
  const networkNote = networkDistanceKm != null && Number.isFinite(networkDistanceKm)
    ? `, network road travel: ${networkDistanceKm} km`
    : '';
  return `${name} coverage: ${formatCoverageDistanceNote('school', schoolDistanceKm, schoolThresholdKm)}${networkNote}; ${formatCoverageDistanceNote('road', roadDistanceKm, roadThresholdKm)}.`;
}

export function buildGridCellGapNotes(
  id: string,
  schoolDistanceKm: number,
  schoolThresholdKm: number,
  roadDistanceKm: number | undefined,
  roadThresholdKm: number
): string {
  return `Sector ${id} coverage: ${formatCoverageDistanceNote('school', schoolDistanceKm, schoolThresholdKm)}; ${formatCoverageDistanceNote('road', roadDistanceKm, roadThresholdKm)}.`;
}

export class GapDetectionService {
  /**
   * Reusable function: Calculate geographic geodesic distance between two points in km.
   * NOTE: This is straight-line ellipsoidal distance, NOT network travel distance.
   */
  public static calculateDistance(c1: Coordinate, c2: Coordinate): number {
    return SpatialUtils.haversineDistanceKm(c1, c2);
  }

  /**
   * Reusable function: Find the nearest facility from a list of facility candidates.
   */
  public static findNearestFacility(
    point: Coordinate,
    facilities: FacilityCandidate[]
  ): { facility: FacilityCandidate; distanceKm: number } | null {
    if (!facilities || facilities.length === 0) return null;

    let nearest: FacilityCandidate | null = null;
    let minDistance = Infinity;

    for (const fac of facilities) {
      const dist = this.calculateDistance(point, fac.location);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = fac;
      }
    }

    return nearest ? { facility: nearest, distanceKm: minDistance } : null;
  }

  /**
   * Reusable function: Find the nearest road polyline from a list of road segments.
   */
  public static findNearestRoad(
    point: Coordinate,
    roads: RoadSegmentCandidate[]
  ): { road: RoadSegmentCandidate; distanceKm: number } | null {
    if (!roads || roads.length === 0) return null;

    let nearest: RoadSegmentCandidate | null = null;
    let minDistance = Infinity;

    for (const road of roads) {
      const dist = SpatialUtils.distanceToPolylineKm(point, road.coordinates);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = road;
      }
    }

    return nearest ? { road: nearest, distanceKm: minDistance } : null;
  }

  /**
   * Determine gap severity rating based on ratio of actual distance to acceptable threshold.
   */
  public static determineSeverity(distanceKm: number, thresholdKm: number): GapSeverity {
    return severityForDistanceRatio(calculateDistanceRatio(distanceKm, thresholdKm));
  }

  /**
   * Reusable function: Core Infrastructure Gap Detection.
   * Analyzes both habitations (population centers) and uniform spatial grid polygons.
   */
  public static async detectUnderservedAreas(
    options: GapAnalysisOptions = {}
  ): Promise<{
    underservedAreas: UnderservedArea[];
    demonstrationGridCells?: UnderservedArea[];
    schoolBuffers: SchoolBufferZone[];
    totalAnalyzed: number;
    totalHabitations: number;
    totalGridCells: number;
    spatialAnalysisAvailable: boolean;
  }> {
    const schoolThreshold = options.schoolThresholdKm ?? 3.0; // default 3 km (configurable)
    const roadThreshold = options.roadThresholdKm ?? 1.0; // default 1 km (configurable)
    const gridRes = options.gridResolutionKm ?? 0.8;
    if (![schoolThreshold, roadThreshold, gridRes].every(Number.isFinite) || schoolThreshold <= 0 || roadThreshold <= 0 || gridRes <= 0) throw new Error('Gap thresholds and grid resolution must be positive finite numbers.');
    const computeNetwork = options.computeNetworkDistance ?? true;

    // 1. Fetch Panchayat details & habitations
    let panchayatQuery: any = {};
    if (options.panchayatId) {
      panchayatQuery._id = options.panchayatId;
    }
    const panchayat: any = await Panchayat.findOne(panchayatQuery).lean();
    const syntheticPanchayat = panchayat?.source === GAP_ANALYSIS_DEMO_SOURCE &&
      panchayat?.dataOrigin === 'SYNTHETIC_DEMO' && panchayat?.isSynthetic === true &&
      panchayat?.coordinatesVerified === false && panchayat?.coordinateSource === 'SYNTHETIC' &&
      panchayat?.coordinateStatus === 'DEMO_ONLY';
    const syntheticPreview = options.includeSyntheticDemo === true && syntheticPanchayat;
    const sourceHabitations = panchayat?.habitations || [];
    const habitations = syntheticPanchayat
      ? syntheticPreview
        ? sourceHabitations.filter((habitation: any) => habitation.dataOrigin === 'SYNTHETIC_DEMO' &&
          habitation.isSynthetic === true && habitation.coordinatesVerified === false &&
          habitation.coordinateSource === 'SYNTHETIC' && habitation.coordinateStatus === 'DEMO_ONLY')
        : []
      : sourceHabitations;

    // 2. Fetch Schools and Roads
    const infraFilter: any = {};
    if (options.panchayatId) {
      infraFilter.panchayatId = options.panchayatId;
    }

    const schoolsData = await School.find(infraFilter).lean();
    const roadsData = await Road.find(infraFilter).lean();
    // Synthetic geometry is included only when the isolated preview explicitly
    // opts in and the selected Panchayat itself is the marked fixture. The HTTP
    // production path never sets this option.
    const syntheticDemonstration = syntheticPreview && [...schoolsData, ...roadsData]
      .some((record: any) => isExplicitSyntheticDemoRecord(record) &&
        Array.isArray(record.syntheticDemoRoles) &&
        record.syntheticDemoRoles.some((role: unknown) => role === 'GAP_ANALYSIS_FACILITY' || role === 'GAP_ANALYSIS_ROAD'));
    const selectedSchools = syntheticDemonstration
      ? schoolsData.filter((record: any) => isExplicitSyntheticDemoRecord(record) && record.syntheticDemoRoles?.includes('GAP_ANALYSIS_FACILITY'))
      : schoolsData.filter((record: any) => getVerifiedSpatialPoint(record) !== null);
    const selectedRoads = syntheticDemonstration
      ? roadsData.filter((record: any) => isExplicitSyntheticDemoRecord(record) && record.syntheticDemoRoles?.includes('GAP_ANALYSIS_ROAD') &&
        (isValidGeoLineString(record.lineGeometry) || isValidGeoLineString(record.geometry)))
      : roadsData.filter((record: any) => getVerifiedRoadLineString(record) !== null);

    // Transform school candidates
    const schoolCandidates: FacilityCandidate[] = selectedSchools
      .map((s: any) => {
        let lat: number | undefined;
        let lng: number | undefined;
        if (s.location?.coordinates) {
          lng = s.location.coordinates[0];
          lat = Number(s.location.coordinates[1]);
          lng = Number(s.location.coordinates[0]);
        } else if (s.location?.lat != null && s.location?.lng != null) {
          lat = Number(s.location.lat);
          lng = Number(s.location.lng);
        }
        return {
          id: String(s._id),
          name: s.name,
          type: 'School',
          location: { lat: lat ?? NaN, lng: lng ?? NaN },
          properties: {
            schoolType: s.schoolType,
            studentCount: s.studentCount
          }
        };
      })
      .filter((s) => Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng) && s.location.lat >= -90 && s.location.lat <= 90 && s.location.lng >= -180 && s.location.lng <= 180);

    // Transform road candidates
    const roadCandidates: RoadSegmentCandidate[] = selectedRoads
      .map((r: any) => ({
        id: String(r._id),
        name: r.name,
        condition: r.condition || 'Average',
        surfaceType: r.surfaceType,
        coordinates: (r.lineGeometry?.coordinates || (r.geometry as any)?.coordinates || []) as [number, number][]
      }))
      .filter((r) => r.coordinates.length >= 2 && r.coordinates.every((coordinate) =>
        Array.isArray(coordinate) && coordinate.length === 2 &&
        Number.isFinite(coordinate[0]) && coordinate[0] >= -180 && coordinate[0] <= 180 &&
        Number.isFinite(coordinate[1]) && coordinate[1] >= -90 && coordinate[1] <= 90));

    // 3. Generate Radial Coverage Buffer Polygons around each school
    const schoolBuffers: SchoolBufferZone[] = schoolCandidates.map((sch) => ({
      schoolId: sch.id,
      schoolName: sch.name,
      center: sch.location,
      radiusKm: schoolThreshold,
      bufferPolygon: SpatialUtils.createRadialBufferPolygon(sch.location, schoolThreshold)
    }));

    // Optional Routing Provider for network distance calculations
    const routingProvider = computeNetwork ? await getRoutingProvider(options.panchayatId) : null;

    const underservedAreas: UnderservedArea[] = [];
    const demonstrationGridCells: UnderservedArea[] = [];

    // 4. Analyze Habitations (Villages)
    for (let idx = 0; idx < habitations.length; idx++) {
      const hab = habitations[idx];
      const habCoord: Coordinate = {
        lat: hab.location.coordinates[1],
        lng: hab.location.coordinates[0]
      };

      // Find nearest school
      const nearestSchoolRes = this.findNearestFacility(habCoord, schoolCandidates);
      // Find nearest road
      const nearestRoadRes = this.findNearestRoad(habCoord, roadCandidates);

      const schoolDistKm = nearestSchoolRes ? nearestSchoolRes.distanceKm : Infinity;
      const roadDistKm = nearestRoadRes ? nearestRoadRes.distanceKm : Infinity;

      const schoolRatio = calculateDistanceRatio(nearestSchoolRes?.distanceKm, schoolThreshold);
      const roadRatio = calculateDistanceRatio(nearestRoadRes?.distanceKm, roadThreshold);
      const isSchoolUnderserved = schoolRatio == null || schoolRatio >= 1;
      const isRoadUnderserved = roadRatio == null || roadRatio >= 1;

      // Compute actual network road distance if routing graph is available
      let networkDistKm: number | undefined;
      let circuity: number | undefined;
      if (nearestSchoolRes && routingProvider) {
        try {
          const pathRes = await routingProvider.findShortestPath(habCoord, nearestSchoolRes.facility.location);
          if (pathRes.reachable && pathRes.routingMethod === 'NETWORK_ROUTE') {
            networkDistKm = Number((pathRes.distanceMeters / 1000).toFixed(2));
            circuity = Number((networkDistKm / Math.max(0.1, schoolDistKm)).toFixed(2));
          }
        } catch {
          // ignore routing errors for isolated nodes
        }
      }

      if (isSchoolUnderserved || isRoadUnderserved) {
        let primaryIssue: UnderservedArea['primaryIssue'] = 'School_Gap';
        if (isSchoolUnderserved && isRoadUnderserved) {
          primaryIssue = 'Dual_Deprivation';
        } else if (isRoadUnderserved) {
          primaryIssue = 'Road_Isolation';
        }

        const assessment = assessOverallGap(
          nearestSchoolRes?.distanceKm,
          schoolThreshold,
          nearestRoadRes?.distanceKm,
          roadThreshold
        );

        // Habitation buffer polygon (500m catchment)
        const habitationPolygon = SpatialUtils.createRadialBufferPolygon(habCoord, 0.45, 16);

        underservedAreas.push({
          id: `hab-${idx}-${hab.name.toLowerCase().replace(/\s+/g, '-')}`,
          name: hab.name,
          areaType: 'Habitation',
          ward: hab.ward,
          center: habCoord,
          polygonGeometry: habitationPolygon,
          populationAffected: gapAreaPopulation('Habitation', hab.population),
          nearestSchool: nearestSchoolRes
            ? {
                id: nearestSchoolRes.facility.id,
                name: nearestSchoolRes.facility.name,
                geographicDistanceKm: schoolDistKm,
                networkDistanceKm: networkDistKm,
                thresholdKm: schoolThreshold,
                isUnderserved: isSchoolUnderserved,
                circuityFactor: circuity
              }
            : undefined,
          nearestRoad: nearestRoadRes
            ? {
                id: nearestRoadRes.road.id,
                name: nearestRoadRes.road.name,
                condition: nearestRoadRes.road.condition,
                geographicDistanceKm: roadDistKm,
                thresholdKm: roadThreshold,
                isUnderserved: isRoadUnderserved
              }
            : undefined,
          schoolCoverageStatus: coverageStatusForRatio(schoolRatio),
          roadCoverageStatus: coverageStatusForRatio(roadRatio),
          primaryIssue,
          overallSeverity: assessment.severity,
          schoolDistanceToThresholdRatio: assessment.schoolRatio,
          roadDistanceToThresholdRatio: assessment.roadRatio,
          distanceToThresholdRatio: assessment.ratio,
          severityBasis: assessment.severityBasis,
          notes: buildHabitationGapNotes(
            hab.name,
            schoolDistKm,
            schoolThreshold,
            networkDistKm,
            nearestRoadRes?.distanceKm,
            roadThreshold
          )
        });
      }
    }

    // 5. Analyze Spatial Grid Cells (Polygons covering the Panchayat territory)
    // Establish bounding box
    const allCoords: [number, number][] = [];
    if (panchayat?.centerCoord && (!syntheticPanchayat || syntheticPreview)) {
      allCoords.push([panchayat.centerCoord.lng, panchayat.centerCoord.lat]);
    }
    schoolCandidates.forEach((s) => allCoords.push([s.location.lng, s.location.lat]));
    habitations.forEach((habitation: any) => allCoords.push([habitation.location.coordinates[0], habitation.location.coordinates[1]]));
    roadCandidates.forEach((r) => r.coordinates.forEach((c) => allCoords.push(c)));

    let minLng = 0;
    let maxLng = 0;
    let minLat = 0;
    let maxLat = 0;

    if (allCoords.length > 0) {
      const lngs = allCoords.map((c) => c[0]);
      const lats = allCoords.map((c) => c[1]);
      minLng = Math.min(...lngs) - 0.008;
      maxLng = Math.max(...lngs) + 0.008;
      minLat = Math.min(...lats) - 0.008;
      maxLat = Math.max(...lats) + 0.008;
    }

    const gridCells = allCoords.length ? SpatialUtils.generateSpatialGrid(
      { minLat, maxLat, minLng, maxLng },
      gridRes
    ) : [];

    for (const cell of gridCells) {
      const nearestSchool = this.findNearestFacility(cell.center, schoolCandidates);
      const nearestRoad = this.findNearestRoad(cell.center, roadCandidates);

      const schoolDistKm = nearestSchool ? nearestSchool.distanceKm : Infinity;
      const roadDistKm = nearestRoad ? nearestRoad.distanceKm : Infinity;

      const schoolRatio = calculateDistanceRatio(nearestSchool?.distanceKm, schoolThreshold);
      const roadRatio = calculateDistanceRatio(nearestRoad?.distanceKm, roadThreshold);
      const isSchoolUnderserved = schoolRatio == null || schoolRatio >= 1;
      const isRoadUnderserved = roadRatio == null || roadRatio >= 1;

      let primaryIssue: UnderservedArea['primaryIssue'] = 'Served';
      if (isSchoolUnderserved || isRoadUnderserved) {
        primaryIssue = 'School_Gap';
        if (isSchoolUnderserved && isRoadUnderserved) {
          primaryIssue = 'Dual_Deprivation';
        } else if (isRoadUnderserved) {
          primaryIssue = 'Road_Isolation';
        }

      }

      const assessment = assessOverallGap(
        nearestSchool?.distanceKm,
        schoolThreshold,
        nearestRoad?.distanceKm,
        roadThreshold
      );

      const gridArea: UnderservedArea = {
          id: cell.id,
          name: `Spatial Sector ${cell.id}`,
          areaType: 'GridCell',
          center: cell.center,
          polygonGeometry: cell.polygon,
          populationAffected: gapAreaPopulation('GridCell'),
          nearestSchool: nearestSchool
            ? {
                id: nearestSchool.facility.id,
                name: nearestSchool.facility.name,
                geographicDistanceKm: schoolDistKm,
                thresholdKm: schoolThreshold,
                isUnderserved: isSchoolUnderserved
              }
            : undefined,
          nearestRoad: nearestRoad
            ? {
                id: nearestRoad.road.id,
                name: nearestRoad.road.name,
                condition: nearestRoad.road.condition,
                geographicDistanceKm: roadDistKm,
                thresholdKm: roadThreshold,
                isUnderserved: isRoadUnderserved
              }
            : undefined,
          schoolCoverageStatus: coverageStatusForRatio(schoolRatio),
          roadCoverageStatus: coverageStatusForRatio(roadRatio),
          primaryIssue,
          overallSeverity: assessment.severity,
          schoolDistanceToThresholdRatio: assessment.schoolRatio,
          roadDistanceToThresholdRatio: assessment.roadRatio,
          distanceToThresholdRatio: assessment.ratio,
          severityBasis: assessment.severityBasis,
          notes: buildGridCellGapNotes(
            cell.id,
            schoolDistKm,
            schoolThreshold,
            nearestRoad?.distanceKm,
            roadThreshold
          )
        };
      if (syntheticDemonstration) demonstrationGridCells.push(gridArea);
      if (isSchoolUnderserved || isRoadUnderserved) {
        underservedAreas.push(gridArea);
      }
    }

    const totalAnalyzed = habitations.length + gridCells.length;
    const spatialAnalysisAvailable = allCoords.length > 0 && totalAnalyzed > 0;

    return {
      underservedAreas,
      schoolBuffers,
      totalAnalyzed,
      totalHabitations: habitations.length,
      totalGridCells: gridCells.length,
      spatialAnalysisAvailable,
      ...(syntheticDemonstration ? { demonstrationGridCells } : {})
    };
  }

  /**
   * Reusable function: Calculate comprehensive accessibility metrics and dashboard statistics.
   */
  public static async calculateAccessibility(
    options: GapAnalysisOptions = {}
  ): Promise<GapAnalysisResult> {
    const schoolThreshold = options.schoolThresholdKm ?? 3.0;
    const roadThreshold = options.roadThresholdKm ?? 1.0;
    const gridRes = options.gridResolutionKm ?? 0.8;

    const infraFilter: any = {};
    if (options.panchayatId) infraFilter.panchayatId = options.panchayatId;

    const schoolsCount = await School.countDocuments(infraFilter);
    const roadsCount = await Road.countDocuments(infraFilter);

    // Fetch habitations
    let panchayatQuery: any = {};
    if (options.panchayatId) panchayatQuery._id = options.panchayatId;
    const panchayat = await Panchayat.findOne(panchayatQuery).lean();
    const habitations = panchayat?.habitations || [];

    // Run core detection
    const detection = await this.detectUnderservedAreas(options);

    const underservedHabitations = detection.underservedAreas.filter(
      (a) => a.areaType === 'Habitation'
    );
    const underservedGridCells = detection.underservedAreas.filter(
      (a) => a.areaType === 'GridCell'
    );

    // Any unknown habitation population makes aggregate counts incomplete; retain known
    // per-habitation values, but do not report a partial sum as the Panchayat total.
    const populationMetrics = calculateOverallGapPopulationMetrics(
      habitations.map((habitation) => habitation.population),
      underservedHabitations.map((habitation) => habitation.populationAffected),
      underservedGridCells.map((gridCell) => gridCell.populationAffected)
    );

    const percentageAreaUnderserved =
      detection.totalGridCells > 0
        ? Number(((underservedGridCells.length / detection.totalGridCells) * 100).toFixed(1))
        : 0;

    // Averages
    let sumSchoolDist = 0;
    let sumRoadDist = 0;
    let validSchoolCount = 0;
    let validRoadCount = 0;

    for (const a of detection.underservedAreas) {
      if (a.nearestSchool?.geographicDistanceKm != null && isFinite(a.nearestSchool.geographicDistanceKm)) {
        sumSchoolDist += a.nearestSchool.geographicDistanceKm;
        validSchoolCount++;
      }
      if (a.nearestRoad?.geographicDistanceKm != null && isFinite(a.nearestRoad.geographicDistanceKm)) {
        sumRoadDist += a.nearestRoad.geographicDistanceKm;
        validRoadCount++;
      }
    }

    const averageDistanceToSchoolKm =
      validSchoolCount > 0 ? Number((sumSchoolDist / validSchoolCount).toFixed(2)) : 0;
    const averageDistanceToRoadKm =
      validRoadCount > 0 ? Number((sumRoadDist / validRoadCount).toFixed(2)) : 0;

    const metrics: AccessibilityMetrics = {
      totalSchools: schoolsCount,
      totalRoads: roadsCount,
      totalHabitations: habitations.length,
      totalAnalyzedAreas: detection.totalAnalyzed,
      underservedAreasCount: detection.underservedAreas.length,
      percentageAreaUnderserved,
      ...populationMetrics,
      averageDistanceToSchoolKm,
      averageDistanceToRoadKm,
      schoolThresholdKm: schoolThreshold,
      roadThresholdKm: roadThreshold
    };

    return {
      spatialAnalysisAvailable: detection.spatialAnalysisAvailable,
      spatialAnalysisUnavailableReason: detection.spatialAnalysisAvailable
        ? undefined
        : 'Spatial analysis unavailable — coordinates not provided/verified.',
      metrics,
      underservedAreas: detection.underservedAreas,
      ...(detection.demonstrationGridCells
        ? { demonstrationGridCells: detection.demonstrationGridCells, syntheticDemonstration: true }
        : {}),
      schoolBuffers: detection.schoolBuffers,
      configuredThresholds: {
        schoolMaxDistanceKm: schoolThreshold,
        roadMaxDistanceKm: roadThreshold,
        gridResolutionKm: gridRes
      },
      methodologyNotes: {
        geographicVsNetwork:
          'Geographic distance represents great-circle Haversine geodesic buffer radius across the surface, used for catchment zones. Network distance measures actual road route travel via Dijkstra on the road network graph. Straight-line distance does not represent actual road travel due to natural terrain winding and barriers.',
        severityCriteria:
          'Distance ratios use actual geographic distance divided by the matching configured school or road threshold. No Gap / Served: < 1.0x; Moderate: >= 1.0x and < 1.5x; High: >= 1.5x and <= 2.0x; Critical: > 2.0x. If a required facility distance is unavailable, the existing Critical no-facility classification is retained and the overall ratio is null rather than fabricated.'
      }
    };
  }
}
