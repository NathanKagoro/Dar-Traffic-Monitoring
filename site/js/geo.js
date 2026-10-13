// Map geometry for the concept page: a plain equirectangular projection and a
// hand-built outline of the Dar es Salaam coast. No tiles, no map library.
//
// The coastline and corridor lines are simplified sketches traced by hand as
// longitude/latitude pairs. They are good enough to orient a reader and are
// not survey data. The monitoring points themselves are exact: they come from
// config/cities/dar_es_salaam.json. Tests: test/geo.test.mjs.

/** Whole-region view and the city-centre inset, as [west, south, east, north]. */
export const REGION_BOUNDS = [38.985, -7.175, 39.6, -6.648];
export const CENTRE_BOUNDS = [39.2615, -6.8335, 39.2975, -6.799];

/**
 * Equirectangular projection onto a box `width` units wide. Longitude is
 * scaled by cos(mid-latitude) so distances east-west and north-south agree.
 * Returns { width, height, project(lon, lat) -> [x, y] }.
 */
export function makeProjection(bounds, width) {
  const [west, south, east, north] = bounds;
  const k = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const scale = width / ((east - west) * k);
  const height = (north - south) * scale;
  return {
    width,
    height,
    scale,
    project(lon, lat) {
      return [(lon - west) * k * scale, (north - lat) * scale];
    },
  };
}

export function inBounds(bounds, lon, lat) {
  return lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3];
}

/** Ray-casting point-in-polygon on [lon, lat] rings. */
export function pointInPolygon(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Coast from north to south, [lon, lat]. The mainland shore down to Kivukoni,
// into the harbour and Kurasini creek, back out along the Kigamboni bank, then
// the ocean coast south-east to Pemba Mnazi.
const COAST = [
  [39.197, -6.64], [39.207, -6.665], [39.218, -6.685], [39.229, -6.705], [39.236, -6.725],
  [39.243, -6.742], [39.253, -6.754], [39.262, -6.759], [39.27, -6.754], [39.276, -6.744],
  [39.284, -6.738], [39.291, -6.745], [39.293, -6.76], [39.291, -6.775], [39.289, -6.788],
  [39.285, -6.796], [39.289, -6.801], [39.2925, -6.806], [39.296, -6.812], [39.2985, -6.817],
  [39.297, -6.8215],
  // harbour, mainland bank
  [39.2935, -6.8212], [39.291, -6.8225], [39.2915, -6.828], [39.294, -6.836], [39.297, -6.845],
  [39.299, -6.852], [39.3, -6.857], [39.298, -6.866], [39.292, -6.875], [39.29, -6.885],
  // harbour, Kigamboni bank
  [39.297, -6.882], [39.304, -6.872], [39.308, -6.862], [39.3075, -6.852], [39.305, -6.842],
  [39.303, -6.832], [39.3025, -6.825], [39.305, -6.8195],
  // Kigamboni ocean coast
  [39.312, -6.8165], [39.325, -6.8175], [39.345, -6.823], [39.37, -6.835], [39.4, -6.852],
  [39.43, -6.872], [39.46, -6.895], [39.49, -6.92], [39.515, -6.95], [39.535, -6.985],
  [39.548, -7.02], [39.552, -7.07], [39.548, -7.12], [39.54, -7.16], [39.535, -7.2],
];

/** Land as one closed ring: the coast, then the map's south, west and north edges. */
export const LAND = [...COAST, [38.9, -7.2], [38.9, -6.64]];

// The main corridors, drawn through their own monitoring points. Between
// points the lines are straightened; they show which way a road runs, not its
// exact alignment.
export const CORRIDORS = [
  {
    name: 'Morogoro Road',
    label: [39.105, -6.777],
    line: [
      [39.2835, -6.8175], [39.2688, -6.81201], [39.255, -6.805], [39.215, -6.789],
      [39.17317, -6.78683], [39.13313, -6.79093], [39.08338, -6.79584], [39.03768, -6.79163],
      [39.01772, -6.79023], [38.985, -6.789],
    ],
  },
  {
    name: 'Bagamoyo Road',
    label: [39.158, -6.715],
    line: [
      [39.2845, -6.812], [39.28013, -6.79253], [39.268, -6.781], [39.25993, -6.77784],
      [39.24, -6.771], [39.22322, -6.75406], [39.21266, -6.72134], [39.20114, -6.68483],
      [39.192, -6.648],
    ],
  },
  {
    name: 'Nyerere Road',
    label: [39.128, -6.905],
    line: [
      [39.2815, -6.8235], [39.27762, -6.82667], [39.262, -6.838], [39.24759, -6.84327],
      [39.20687, -6.86279], [39.17, -6.878], [39.12, -6.892],
    ],
  },
  {
    name: 'Kilwa Road',
    label: [39.28, -6.985],
    line: [
      [39.2825, -6.8265], [39.28492, -6.83992], [39.28, -6.865], [39.26714, -6.89328],
      [39.27007, -6.91227], [39.268, -6.96], [39.262, -7.05], [39.262, -7.175],
    ],
  },
  {
    name: 'Nelson Mandela Road',
    label: [39.155, -6.83],
    line: [
      [39.215, -6.789], [39.2108, -6.80428], [39.23704, -6.8299], [39.24759, -6.84327],
      [39.27, -6.853], [39.29139, -6.85548],
    ],
  },
];

/** The Nyerere Bridge across Kurasini creek, bank to bank. */
export const BRIDGE = [[39.2995, -6.8575], [39.3082, -6.8612]];

export const PLACES = [
  { name: 'Indian Ocean', at: [39.44, -6.76], kind: 'water' },
  { name: 'Kigamboni', at: [39.385, -6.905], kind: 'land' },
  { name: 'Msasani', at: [39.3, -6.742], kind: 'water-edge' },
  { name: 'Harbour', at: [39.3125, -6.8425], kind: 'water-edge' },
];

/** Monitoring points that sit over water on purpose. */
export function isOverWater(point) {
  return /bridge/i.test(point.name);
}
