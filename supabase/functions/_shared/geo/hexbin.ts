import type { LatLng } from "./types.ts";

// Pointy-top hexagon grid on a local equirectangular projection. Accurate to well under 1% across
// a city-sized area, which is all the heat map needs.
export type HexCell<T> = { id: string; center: LatLng; polygon: number[][]; items: T[] };

const METRES_PER_DEGREE = 111_320;

export function hexbin<T>(items: Array<T & LatLng>, sizeMetres: number, origin: LatLng): Array<HexCell<T & LatLng>> {
  if (!(sizeMetres > 0)) throw new RangeError("Hexagon size must be positive.");
  const cosLat = Math.cos((origin.latitude * Math.PI) / 180);
  const toXY = (p: LatLng) => ({ x: (p.longitude - origin.longitude) * METRES_PER_DEGREE * cosLat, y: (p.latitude - origin.latitude) * METRES_PER_DEGREE });
  const toLatLng = (x: number, y: number): LatLng => ({ latitude: origin.latitude + y / METRES_PER_DEGREE, longitude: origin.longitude + x / (METRES_PER_DEGREE * cosLat) });
  const cells = new Map<string, HexCell<T & LatLng>>();
  for (const item of items) {
    const { x, y } = toXY(item);
    // Fractional axial coordinates, then cube rounding.
    const q = ((Math.sqrt(3) / 3) * x - y / 3) / sizeMetres;
    const r = ((2 / 3) * y) / sizeMetres;
    let rx = Math.round(q);
    let rz = Math.round(r);
    const ry = Math.round(-q - r);
    const dx = Math.abs(rx - q);
    const dy = Math.abs(ry - (-q - r));
    const dz = Math.abs(rz - r);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy <= dz) rz = -rx - ry;
    const id = `${rx}:${rz}`;
    let cell = cells.get(id);
    if (!cell) {
      const cx = sizeMetres * Math.sqrt(3) * (rx + rz / 2);
      const cy = sizeMetres * 1.5 * rz;
      const polygon = Array.from({ length: 7 }, (_, corner) => {
        const angle = (Math.PI / 180) * (60 * (corner % 6) - 30);
        const point = toLatLng(cx + sizeMetres * Math.cos(angle), cy + sizeMetres * Math.sin(angle));
        return [Number(point.longitude.toFixed(6)), Number(point.latitude.toFixed(6))];
      });
      cell = { id, center: toLatLng(cx, cy), polygon, items: [] };
      cells.set(id, cell);
    }
    cell.items.push(item);
  }
  return [...cells.values()];
}
