import type { MaterialSpec } from './schema';

/**
 * Presentation finishes for the architectural-model look: warm whites, light
 * oak, pale stone and muted accents. Hues follow the photographed interior;
 * the facility JSON keeps its source colors, so this is a rendering layer only.
 */
export const PRESENTATION: Record<string, Partial<MaterialSpec>> = {
  wall: { color: '#f5f3ee', roughness: 0.92 },
  tile: { color: '#ebe6dc', roughness: 0.55, pattern: 'stone' },
  vinyl: { color: '#ece8e0', roughness: 0.6 },
  wood: { color: '#e4d1b0', roughness: 0.6 },
  sports: { color: '#decdaf', roughness: 0.6 },
  carpet: { color: '#cdc6b8', roughness: 1 },
  pattern: { color: '#e2ded5', roughness: 0.8 },
  concrete: { color: '#dedad2', roughness: 0.95 },
  oak: { color: '#dcc49c', roughness: 0.6 },
  chair: { color: '#eee7d9', roughness: 0.8 },
  table: { color: '#f5f3ee', roughness: 0.4 },
  'clinical-blue': { color: '#a9b9ba' },
  blue: { color: '#8ea9b3' },
  metal: { color: '#c2c2bc', roughness: 0.35, metalness: 0.5 },
  porcelain: { color: '#f4f3ee', roughness: 0.3 },
  leaf: { color: '#8e9f7e', roughness: 0.95 },
  cabinet: { color: '#ece8df' },
  screen: { color: '#262c2e', roughness: 0.28 },
  car: { color: '#d9d6cf' },
  glass: { color: '#d3dfde', roughness: 0.08, metalness: 0.1, opacity: 0.42 },
  frame: { color: '#5f6461' },
  canopy: { color: '#5c7690' },
  light: { color: '#f6efe0' },
  'wet-tile': { color: '#d5dcd6', roughness: 0.5 },
  'dining-chair': { color: '#936f53' },
  'office-blue': { color: '#91a3a7' },
  'lounge-blue': { color: '#8f9fb0' },
  'grey-seat': { color: '#d4d1c9' },
  'clinical-seat': { color: '#d5dbce' },
  'photo-carpet': { color: '#d9d2c3' },
  'photo-teal': { color: '#88aba9' },
  'photo-tan-mesh': { color: '#bb9f7e' },
  'photo-blue-grey': { color: '#b4c0bc' },
  'photo-blue-seat': { color: '#b5ccc9' },
  'photo-chair-wood': { color: '#a47d57' },
  'photo-brown-counter': { color: '#aa9587' },
  'photo-mustard': { color: '#c6ad73' },
  'photo-yellow': { color: '#e8ddbd' },
  'photo-lattice-blue': { color: '#6f9fb1' },
  'photo-landscape-red': { color: '#ab6a53' },
  'photo-landscape-ochre': { color: '#c9a579' },
  'photo-moss': { color: '#5e7752' },
  'photo-teal-tile': { color: '#bccdc8' },
  'photo-facade': { color: '#e4dbcc' },
  'photo-black': { color: '#2e3130' },
  'photo-red-cart': { color: '#b4675c' },
  'upperfit-floor': { color: '#d8cebe' },
  'upperfit-wall': { color: '#ece5d8' },
  'upperfit-blue': { color: '#b3c5c5' },
  'upperfit-divider': { color: '#b6b7b1' },
  'upperfit-wood': { color: '#cfb086' },
  'upperfit-mesh': { color: '#c2b79e' },
  'fleet-teal': { color: '#174a49' },
  'fleet-glass': { color: '#2b3335', roughness: 0.25 },
  'rehab-blue': { color: '#8199a9' },
  '#e4e5df': { color: '#f0eee9', roughness: 0.9 },
  '#dfdfd8': { color: '#ebe8e2', roughness: 0.9 },
};
/** Thin, slightly darker coping on cut interior walls: a drawn section line. */
export const WALL_CAP = '#b9b1a4';
/**
 * Height (m) at which interior walls are cut in cutaway views: the main
 * building's cutaway and every facility instance on a community pad.
 */
export const CUTAWAY_HEIGHT = 1.2;
