'use client';
import { useEffect, useState } from 'react';
import type { StoryScenario } from '../sim/story-source';

export type Scenario = 'base' | 'story';
/**
 * Which activity source the main viewer animates and the panels list and
 * measure: the bundled care-day loop, or the loop with Mrs. Lin's compiled day
 * merged in. The story tracks load on first use; `story` stays null until they
 * arrive and whenever the base loop is chosen.
 */
export function useScenario() {
  const [scenario, setScenario] = useState<Scenario>('base'),
    [loaded, setLoaded] = useState<StoryScenario | null>(null);
  useEffect(() => {
    if (scenario !== 'story' || loaded) return;
    let live = true;
    void import('../sim/story-source').then((m) => {
      if (live) setLoaded(m.storyScenario());
    });
    return () => {
      live = false;
    };
  }, [scenario, loaded]);
  return { scenario, setScenario, story: scenario === 'story' ? loaded : null };
}
export function ScenarioToggle({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (scenario: Scenario) => void;
}) {
  return (
    <fieldset className="mp-segment scenario-toggle">
      <legend>Scenario shown</legend>
      <button
        aria-pressed={scenario === 'base'}
        onClick={() => onChange('base')}
      >
        Care-day loop
      </button>
      <button
        aria-pressed={scenario === 'story'}
        onClick={() => onChange('story')}
      >
        With Mrs. Lin’s day
      </button>
    </fieldset>
  );
}
