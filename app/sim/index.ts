/**
 * Node entry for scripts (bundled by scripts/build-scenario.mjs). The app
 * imports the individual modules directly.
 */
export * from './nav';
export * from './scenario';
export * from './clock';
export * from './metrics';
export * from './trace';
export * from './story-timeline';
export { validateFacility } from '../model/schema';
export {
  activityData,
  sampleActor,
  sampleEscort,
  samplePairedActors,
  timelineFor,
} from '../model/activity';
export { sampleVan, vanWindows, ARRIVAL } from '../model/arrival';
export { alhambraSource, alhambraVehicles } from '../model/alhambra-source';
export { careSettings, settingZone } from '../model/community-settings';
export { default as careTeam } from '../data/care-team.json';
export { default as dayProgram } from '../data/day-program.json';
