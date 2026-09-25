import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { HeatmapPoint } from '../types/complaint';

interface HeatmapOverlayProps {
  points: HeatmapPoint[];
  radius?: number;
  blur?: number;
  maxIntensity?: number;
}

export default function HeatmapOverlay({
  points,
  radius = 28,
  blur = 18,
  maxIntensity = 1.0,
}: HeatmapOverlayProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pre-generate 256-color gradient palette (thermal: blue -> cyan -> lime -> yellow -> red)
  const paletteRef = useRef<Uint8ClampedArray | null>(null);

  useEffect(() => {
    // Generate color palette from linear gradient
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 1;
    pCanvas.height = 256;
    const pCtx = pCanvas.getContext('2d')!;

    const grad = pCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, 'rgba(0, 0, 255, 0)');
    grad.addColorStop(0.2, 'rgba(0, 200, 255, 0.4)');
    grad.addColorStop(0.4, 'rgba(0, 255, 120, 0.7)');
    grad.addColorStop(0.65, 'rgba(255, 220, 0, 0.85)');
    grad.addColorStop(0.85, 'rgba(255, 100, 0, 0.95)');
    grad.addColorStop(1.0, 'rgba(230, 0, 0, 1.0)');

    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 1, 256);

    paletteRef.current = pCtx.getImageData(0, 0, 1, 256).data;
  }, []);

  useEffect(() => {
    if (!map) return;

    // Create canvas element
    const canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-overlay');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '400';
    canvas.style.left = '0';
    canvas.style.top = '0';

    const pane = map.getPane('overlayPane') || map.getPanes().overlayPane;
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    const render = () => {
      if (!canvas || !map) return;

      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const ctx = canvas.getContext('2d');
      if (!ctx || points.length === 0 || !paletteRef.current) return;

      ctx.clearRect(0, 0, size.x, size.y);

      // Pass 1: Draw radial alpha heat circles on grayscale canvas
      const r = radius;
      const r2 = r + blur;

      // Create reusable single-point brush
      const brush = document.createElement('canvas');
      brush.width = r2 * 2;
      brush.height = r2 * 2;
      const bCtx = brush.getContext('2d')!;

      const radial = bCtx.createRadialGradient(r2, r2, 0, r2, r2, r2);
      radial.addColorStop(0, 'rgba(0, 0, 0, 1)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      bCtx.fillStyle = radial;
      bCtx.fillRect(0, 0, r2 * 2, r2 * 2);

      for (const [lat, lng, intensity] of points) {
        const pt = map.latLngToContainerPoint([lat, lng]);
        // Only draw if roughly within canvas bounds
        if (pt.x < -r2 || pt.x > size.x + r2 || pt.y < -r2 || pt.y > size.y + r2) {
          continue;
        }

        const alpha = Math.min(1.0, Math.max(0.1, intensity / maxIntensity));
        ctx.globalAlpha = alpha;
        ctx.drawImage(brush, pt.x - r2, pt.y - r2);
      }

      // Pass 2: Colorize pixels using palette
      const imgData = ctx.getImageData(0, 0, size.x, size.y);
      const data = imgData.data;
      const palette = paletteRef.current;

      for (let i = 3; i < data.length; i += 4) {
        const alpha = data[i];
        if (alpha > 0) {
          const palIndex = alpha * 4;
          data[i - 3] = palette[palIndex]; // R
          data[i - 2] = palette[palIndex + 1]; // G
          data[i - 1] = palette[palIndex + 2]; // B
          data[i] = Math.min(240, Math.round(alpha * 0.85)); // A
        }
      }

      ctx.putImageData(imgData, 0, 0);
    };

    render();

    map.on('move', render);
    map.on('moveend', render);
    map.on('zoomend', render);
    map.on('resize', render);

    return () => {
      map.off('move', render);
      map.off('moveend', render);
      map.off('zoomend', render);
      map.off('resize', render);

      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      canvasRef.current = null;
    };
  }, [map, points, radius, blur, maxIntensity]);

  return null;
}
