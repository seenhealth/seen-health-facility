import type { Metadata } from 'next';
import './story.css';
import { StoryExperience } from './story-experience';

export const metadata: Metadata = {
  title: 'A day at Seen Health',
  description:
    'Scroll through one participant’s day at the Seen Health PACE center in Alhambra, and see how an eleven-person interdisciplinary team plans, delivers and oversees her care.',
};

export default function StoryPage() {
  return <StoryExperience assetBase="/" exploreHref="/" />;
}
