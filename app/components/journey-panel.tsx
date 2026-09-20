'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Home,
  Pause,
  Play,
  RotateCcw,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { journeyData, type JourneyStep } from '../model/journeys';

export function JourneyPanel({
  onFocus,
  onClose,
}: {
  onFocus: (step: JourneyStep) => void;
  onClose: () => void;
}) {
  const [journeyId, setJourneyId] = useState(journeyData.journeys[0].id);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(8);
  const selector = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    // This panel opens on request; return keyboard focus to its trigger on close.
    const trigger = document.activeElement;
    selector.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  const journey = journeyData.journeys.find((j) => j.id === journeyId)!;
  const step = journey.steps[index];
  useEffect(() => {
    onFocus(step);
  }, [step, onFocus]);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (index >= journey.steps.length - 1) setPlaying(false);
      else setIndex((i) => i + 1);
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [playing, index, journey.steps.length, seconds]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  const move = (next: number) => {
    setPlaying(false);
    setIndex(Math.min(journey.steps.length - 1, Math.max(0, next)));
  };
  const SceneIcon =
    step.scene === 'home'
      ? Home
      : step.scene === 'transport'
        ? Truck
        : step.scene === 'coordination'
          ? Users
          : Building2;
  const evidence = {
    recorded: 'Recorded workflow',
    scene: 'Illustrative scene',
    unknown: 'Not established',
  }[step.evidence];
  return (
    <article className="journey-panel" aria-label="Participant journeys">
      <div className="journey-top">
        <span className="overline">PARTICIPANT JOURNEYS</span>
        <button onClick={onClose} aria-label="Close journeys">
          <X size={18} />
        </button>
      </div>
      <label className="journey-select">
        Choose a journey
        <select
          ref={selector}
          value={journeyId}
          onChange={(e) => {
            setPlaying(false);
            setIndex(0);
            setJourneyId(e.target.value);
          }}
        >
          {journeyData.journeys.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </label>
      <p className="journey-summary">{journey.summary}</p>
      <div className="journey-player">
        <button
          aria-label="Previous step"
          disabled={index === 0}
          onClick={() => move(index - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="primary"
          onClick={() => {
            if (!playing && index === journey.steps.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}{' '}
          {playing
            ? 'Pause'
            : index === journey.steps.length - 1
              ? 'Replay'
              : 'Play'}
        </button>
        <button
          aria-label="Next step"
          disabled={index === journey.steps.length - 1}
          onClick={() => move(index + 1)}
        >
          <ChevronRight size={18} />
        </button>
        <button aria-label="Restart journey" onClick={() => move(0)}>
          <RotateCcw size={15} />
        </button>
        <label>
          Step pace
          <select
            aria-label="Playback seconds per step"
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
          >
            <option value={4}>4 sec</option>
            <option value={8}>8 sec</option>
            <option value={12}>12 sec</option>
          </select>
        </label>
      </div>
      <label className="journey-scrub">
        <span>
          Step {index + 1} of {journey.steps.length}
        </span>
        <input
          aria-label="Journey step"
          type="range"
          min={0}
          max={journey.steps.length - 1}
          step={1}
          value={index}
          onChange={(e) => move(Number(e.target.value))}
        />
      </label>
      <section
        className="journey-current"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className={`journey-evidence ${step.evidence}`}>{evidence}</div>
        <h3>{step.title}</h3>
        <div className="journey-place">
          <SceneIcon size={21} />
          <span>
            {step.place}
            <small>{step.role}</small>
          </span>
        </div>
        {(step.scene === 'partner' || step.scene === 'home') && (
          <div className="journey-handoff">
            <Building2 size={24} />
            <span>Seen Health</span>
            <ArrowRight size={20} />
            <SceneIcon size={24} />
            <span>
              {step.scene === 'home' ? 'Home support' : 'External provider'}
            </span>
          </div>
        )}
        <p>{step.detail}</p>
        <strong className="journey-timing">{step.timing}</strong>
      </section>
      <ol className="journey-steps">
        {journey.steps.map((s, i) => (
          <li key={s.id}>
            <button
              aria-current={i === index ? 'step' : undefined}
              onClick={() => move(i)}
            >
              <span>{i + 1}</span>
              {s.title}
              {i === index && <ChevronRight size={15} />}
            </button>
          </li>
        ))}
      </ol>
      <details className="journey-evidence-note">
        <summary>What the records establish</summary>
        <p>{journey.basis}</p>
        <p>{journey.caveat}</p>
      </details>
      <p className="journey-footnote">
        Based on Orbit workflow patterns. Identities and service dates are
        omitted. Rooms and travel scenes are illustrative; playback pace is not
        service time.
      </p>
      <a
        className="journey-download"
        href="/models/care-journeys.json"
        download
      >
        Download journey definitions
      </a>
    </article>
  );
}
