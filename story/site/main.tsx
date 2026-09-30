/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../app/story/story.css';
import { StoryExperience } from '../../app/story/story-experience';

/** Standalone build of the scroll story for embedding on seenhealth.org (see docs/STORY.md). */
const env = import.meta.env;
createRoot(document.getElementById('story')!).render(
  <StrictMode>
    <StoryExperience
      assetBase={env.BASE_URL}
      exploreHref={env.VITE_STORY_EXPLORE_URL || 'https://seen-health-facility.xingpersonal.chatgpt.site/'}
      learnMoreHref={env.VITE_STORY_LEARN_MORE_URL || 'https://seenhealth.org/'}
    />
  </StrictMode>,
);
