// Touchpoint-trace settings shared by scripts/sim-report.mjs (which writes
// public/models/touchpoint-trace.json) and scripts/validate-trace.mjs (which
// checks it). No side effects: safe to import from either.

/** Trace options for the published file; recorded in it as `options`. */
export const TRACE_OPTIONS = {
  step: 1,
  encounterRadius: 1.6,
  minEncounterSeconds: 4,
  encounterGapSeconds: 3,
};
/** Size bound for the published trace JSON (bytes). */
export const TRACE_SIZE_LIMIT = 3_000_000;
/** The published trace, relative to the repository root. */
export const TRACE_FILE = 'public/models/touchpoint-trace.json';
