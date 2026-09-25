import { Schema } from 'mongoose';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoLineString {
  type: 'LineString';
  coordinates: [number, number][]; // Array of [longitude, latitude]
}

/**
 * Reusable GeoJSON Point Schema with strict coordinate bounds validation.
 * Coordinates are formatted as [longitude, latitude].
 */
export const GeoPointSchema = new Schema<GeoPoint>(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (coords: number[]) {
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            typeof coords[0] === 'number' &&
            typeof coords[1] === 'number' &&
            coords[0] >= -180 &&
            coords[0] <= 180 && // longitude
            coords[1] >= -90 &&
            coords[1] <= 90 // latitude
          );
        },
        message: 'Point coordinates must be valid [longitude (-180 to 180), latitude (-90 to 90)]'
      }
    }
  },
  { _id: false }
);

/**
 * Reusable GeoJSON LineString Schema for linear infrastructure (roads, pipelines).
 * Coordinates are formatted as an array of [longitude, latitude].
 */
export const GeoLineStringSchema = new Schema<GeoLineString>(
  {
    type: {
      type: String,
      enum: ['LineString'],
      required: true,
      default: 'LineString'
    },
    coordinates: {
      type: [[Number]],
      required: true,
      validate: {
        validator: function (coords: [number, number][]) {
          return (
            Array.isArray(coords) &&
            coords.length >= 2 &&
            coords.every(
              (c) =>
                Array.isArray(c) &&
                c.length === 2 &&
                typeof c[0] === 'number' &&
                typeof c[1] === 'number' &&
                c[0] >= -180 &&
                c[0] <= 180 &&
                c[1] >= -90 &&
                c[1] <= 90
            )
          );
        },
        message: 'LineString coordinates must have at least 2 valid [lng, lat] pairs'
      }
    }
  },
  { _id: false }
);
