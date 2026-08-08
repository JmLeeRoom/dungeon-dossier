import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CaseSchema, RunStripSchema } from '../../src/engine/domain';
import { createNodeStrip } from '../../src/engine/run';

function common(file: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../content/common/${file}`, import.meta.url), 'utf8'),
  ) as unknown;
}

function caseContent(directory: string): ReturnType<typeof CaseSchema.parse> {
  return CaseSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(`../../content/cases/${directory}/case.json`, import.meta.url),
        'utf8',
      ),
    ) as unknown,
  );
}

const strip = RunStripSchema.parse(common('run-strip.json'));
const strings = common('strings.ko.json') as { strings: Readonly<Record<string, string>> };
const cases = {
  tutorial: caseContent('tutorial'),
  ep001: caseContent('ep001'),
  ep004: caseContent('ep004'),
} as const;

function eventForNode(ref: string, directory: string) {
  const event = cases[directory as keyof typeof cases].events_noncombat.find(
    (candidate) => candidate.event_id === ref,
  );
  if (event === undefined) throw new Error(`Missing event ${ref}`);
  return event;
}

/** Every EVENT node the strip declares, routed or not, in declaration order. */
const authoredEvents = strip.episodes.flatMap((episode) =>
  episode.slots.flatMap((slot) =>
    slot.candidates
      .filter((candidate) => candidate.kind === 'EVENT')
      .map((candidate) => eventForNode(candidate.ref, episode.case_directory)),
  ),
);

/** The three EVENT nodes a canonical (seedless) run actually plays. */
const routedEvents = createNodeStrip(strip)
  .filter((node) => node.kind === 'EVENT')
  .map((node) => eventForNode(node.ref, node.caseDirectory));

describe('authored non-combat event coverage', () => {
  it('authors every one of the six patterns across the shipped candidates', () => {
    expect(authoredEvents.map((event) => event.pattern)).toEqual([
      'A', 'B', 'C', 'F', 'C', 'D', 'E',
    ]);
    expect([...new Set(authoredEvents.map((event) => event.pattern))].sort()).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F',
    ]);
  });

  it('plays one EVENT per episode on the canonical route', () => {
    expect(routedEvents.map((event) => event.event_id)).toEqual([
      'event_tutorial_choice',
      'event_ep001_forensic_sweep',
      'event_ep004_machine_room',
    ]);
    expect(routedEvents.map((event) => event.pattern)).toEqual(['A', 'F', 'D']);
  });

  it('resolves every localization key the strip event candidates reference', () => {
    const table = strings.strings;
    const missing: string[] = [];
    const check = (key: string): void => {
      if (table[key] === undefined) missing.push(key);
    };
    for (const event of authoredEvents) {
      check(event.title_key);
      check(event.description_key);
      if (event.pattern === 'A') event.choices.forEach((c) => { check(c.label_key); });
      if (event.pattern === 'B') {
        event.items.forEach((i) => { check(i.label_key); });
        event.slots.forEach((s) => { check(s.label_key); });
      }
      if (event.pattern === 'C') event.spots.forEach((s) => { check(s.label_key); });
      if (event.pattern === 'D') event.options.forEach((o) => { check(o.label_key); });
      if (event.pattern === 'E') {
        event.topics.forEach((t) => { check(t.label_key); check(t.reveal_key); });
      }
      if (event.pattern === 'F') event.targets.forEach((t) => { check(t.label_key); });
      for (const cutscene of event.cutscenes) {
        for (const beat of cutscene.beats) {
          check(beat.text_key);
          if (beat.speaker_name_key !== undefined) check(beat.speaker_name_key);
          beat.choices.forEach((c) => { check(c.label_key); });
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('pattern D — machine room tuning', () => {
  const event = eventForNode('event_ep004_machine_room', 'ep004');

  it('always has a payout even when no card is eligible', () => {
    if (event.pattern !== 'D') throw new Error('expected pattern D');
    // Soft-lock prevention is the whole point of the fallback.
    expect(event.fallback_gains.length).toBeGreaterThan(0);
  });

  it('offers options that target different card families', () => {
    if (event.pattern !== 'D') throw new Error('expected pattern D');
    const intents = event.options.flatMap((option) => option.eligible_intents);
    expect(new Set(intents).size).toBeGreaterThan(1);
    for (const option of event.options) {
      const deltas = Object.values(option.tuning).filter((value) => value !== 0);
      expect(deltas.length).toBeGreaterThan(0);
    }
  });
});

describe('pattern E — broker canvass', () => {
  const event = eventForNode('event_ep004_broker_canvass', 'ep004');

  it('forces a real choice by allowing fewer attempts than topics', () => {
    if (event.pattern !== 'E') throw new Error('expected pattern E');
    expect(event.attempt_limit).toBeLessThan(event.topics.length);
  });

  it('routes F-12 through exactly one topic', () => {
    if (event.pattern !== 'E') throw new Error('expected pattern E');
    const writers = event.topics.filter((topic) =>
      topic.effects.some(
        (effect) => effect.type === 'SET_FLAG' && effect.target === 'F-12',
      ),
    );
    expect(writers.map((topic) => topic.topic_id)).toEqual(['topic_ep004_broker_route']);
  });
});

describe('pattern F — forensic sweep', () => {
  const event = eventForNode('event_ep001_forensic_sweep', 'ep001');

  it('cannot sweep every target in one visit', () => {
    if (event.pattern !== 'F') throw new Error('expected pattern F');
    expect(event.attempt_limit).toBeLessThan(event.targets.length);
  });

  it('collects evidence the case actually defines', () => {
    if (event.pattern !== 'F') throw new Error('expected pattern F');
    const known = new Set(cases.ep001.evidence.map((evidence) => evidence.evidence_id));
    for (const target of event.targets) {
      expect(known.has(target.evidence_id)).toBe(true);
    }
  });

  it('does not duplicate what the later warehouse sweep already grants', () => {
    if (event.pattern !== 'F') throw new Error('expected pattern F');
    const warehouse = eventForNode('event_ep001_warehouse', 'ep001');
    if (warehouse.pattern !== 'C') throw new Error('expected pattern C');
    const warehouseEvidence = new Set(
      warehouse.spots.flatMap((spot) =>
        spot.effects.flatMap((effect) =>
          effect.type === 'GRANT_EVIDENCE' && effect.target !== undefined
            ? [effect.target]
            : [],
        ),
      ),
    );
    for (const target of event.targets) {
      expect(warehouseEvidence.has(target.evidence_id)).toBe(false);
    }
  });
});
