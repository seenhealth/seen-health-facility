import source from '../data/care-journeys.json';

export type JourneyStep = {
  id: string;
  title: string;
  place: string;
  role: string;
  detail: string;
  timing: string;
  evidence: 'recorded' | 'scene' | 'unknown';
  zoneId: string | null;
  roomId?: string;
  scene: 'center' | 'coordination' | 'transport' | 'partner' | 'home';
};
export type Journey = {
  id: string;
  title: string;
  summary: string;
  basis: string;
  caveat: string;
  steps: JourneyStep[];
};
export const journeyData = source as {
  version: string;
  reviewed: string;
  basis: string;
  privacy: string;
  journeys: Journey[];
};
