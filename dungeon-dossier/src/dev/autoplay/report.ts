import runStripJson from '../../../content/common/run-strip.json';
import {
  isAutoplaySeed,
  type AutoplayOptions,
} from '../../app/autoplayPort';
import { EPISODE_NODE_COUNT, RunStripSchema } from '../../engine/domain';
import { createNodeStrip } from '../../engine/run';
import { BROKER_CANVASS_EVENT_ID } from './policy';

export const AUTOPLAY_REPORT_SCHEMA_VERSION = '1.0';
export const AUTOPLAY_REPORT_ELEMENT_ID = 'dd-autoplay-report';

/**
 * The single source of the video acceptance contract (VIDEO-P0-06).
 *
 * The product contract is "about 150 seconds", tolerated at +/-15s — NOT
 * "never exceed 150s". Anything that needs the target (driver pacing, the HUD
 * clock, report validation, docs) derives it from here so the two readings
 * cannot drift apart again.
 */
export const VIDEO_TARGET_DURATION_SEC = 150;
export const VIDEO_DURATION_TOLERANCE_SEC = 15;

export const VIDEO_DURATION_ACCEPTANCE = Object.freeze({
  targetDurationMs: VIDEO_TARGET_DURATION_SEC * 1_000,
  minimumDurationMs: (VIDEO_TARGET_DURATION_SEC - VIDEO_DURATION_TOLERANCE_SEC) * 1_000,
  maximumDurationMs: (VIDEO_TARGET_DURATION_SEC + VIDEO_DURATION_TOLERANCE_SEC) * 1_000,
  measurement: 'L2_WALL_CLOCK' as const,
});

/**
 * The short submission cut, which is a different product than the 150s demo.
 *
 * The ceiling is the one number that is not negotiable: a clip of 61s is not a
 * short-form submission at all. The target therefore sits three seconds under
 * 60 so the tolerated window is 54..60 and its upper bound IS the boundary,
 * rather than centring on 59 and accepting 62.
 */
export const SUBMISSION_TARGET_DURATION_SEC = 57;
export const SUBMISSION_DURATION_TOLERANCE_SEC = 3;
export const SUBMISSION_MAXIMUM_DURATION_SEC =
  SUBMISSION_TARGET_DURATION_SEC + SUBMISSION_DURATION_TOLERANCE_SEC;

export const SUBMISSION_DURATION_ACCEPTANCE = Object.freeze({
  targetDurationMs: SUBMISSION_TARGET_DURATION_SEC * 1_000,
  minimumDurationMs:
    (SUBMISSION_TARGET_DURATION_SEC - SUBMISSION_DURATION_TOLERANCE_SEC) * 1_000,
  maximumDurationMs: SUBMISSION_MAXIMUM_DURATION_SEC * 1_000,
  measurement: 'L2_WALL_CLOCK' as const,
});


export interface AutoplayDurationAcceptance {
  readonly targetDurationMs: number;
  readonly minimumDurationMs: number;
  readonly maximumDurationMs: number;
  /** Distinguishes real driver timing from a simulated/fake-clock duration. */
  readonly measurement: 'L2_WALL_CLOCK';
}

/** Modes that pace to a length and must declare the contract they paced to. */
export const CAPTURE_DURATION_ACCEPTANCE: Readonly<
  Record<string, AutoplayDurationAcceptance>
> = {
  video: VIDEO_DURATION_ACCEPTANCE,
  submission: SUBMISSION_DURATION_ACCEPTANCE,
};


const TECHNICAL_ID_FIELD = /(?:^|_)id$/u;
const TECHNICAL_IDS_FIELD = /(?:^|_)ids$/u;

const ALL_CONTENT_JSON = import.meta.glob('../../../content/**/*.json', {
  eager: true,
  import: 'default',
}) as Readonly<Record<string, unknown>>;

function collectTechnicalContentIds(
  value: unknown,
  ids: Set<string>,
): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) collectTechnicalContentIds(entry, ids);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === 'string' &&
      (TECHNICAL_ID_FIELD.test(key) || key === 'ref')
    ) {
      ids.add(entry);
    } else if (Array.isArray(entry) && TECHNICAL_IDS_FIELD.test(key)) {
      for (const id of entry) {
        if (typeof id === 'string') ids.add(id);
      }
    }
    collectTechnicalContentIds(entry, ids);
  }
}

const technicalContentIds = new Set<string>();
for (const content of Object.values(ALL_CONTENT_JSON)) {
  collectTechnicalContentIds(content, technicalContentIds);
}

/** Data-owned denylist for IDs that must never be rendered as player text. */
export const AUTOPLAY_TECHNICAL_CONTENT_IDS: readonly string[] = Object.freeze(
  [...technicalContentIds].sort(),
);
const AUTOPLAY_TECHNICAL_CONTENT_ID_SET = new Set(AUTOPLAY_TECHNICAL_CONTENT_IDS);

const canonicalStrip = RunStripSchema.parse(runStripJson);
/**
 * The unseeded baseline: every slot resolved to its first candidate. It fixes
 * the run *length* and the episode shape, which no seed can change.
 *
 * It is deliberately NOT the order a seeded run walks. `SEEDED_ONE` slots pick
 * a different candidate per seed, so validating a real run against this route
 * reported a node-order FAIL for a run that was behaving correctly. Order is
 * checked against `autoplayExpectedNodes(report.seed)` instead.
 */
const canonicalRoute = createNodeStrip(canonicalStrip);
const expectedNodeCount = canonicalStrip.episodes.length * EPISODE_NODE_COUNT;
if (canonicalRoute.length !== expectedNodeCount) {
  throw new Error(
    `Autoplay report requires ${expectedNodeCount.toString()} resolved nodes; ` +
      `found ${canonicalRoute.length.toString()}.`,
  );
}

/** Nodes a canonical run visits, in play order. */
export const AUTOPLAY_NODE_COUNT = canonicalRoute.length;

/** Data-owned expectation shared by report validation and its regression tests. */
export const AUTOPLAY_EXPECTED_NODES = Object.freeze(
  canonicalRoute.map((node, index) => Object.freeze({
    index,
    nodeId: node.nodeId,
    kind: node.kind,
    ref: node.ref,
  })),
);

export type AutoplayNodeKind = (typeof AUTOPLAY_EXPECTED_NODES)[number]['kind'];

export interface AutoplayExpectedNode {
  readonly index: number;
  readonly nodeId: string;
  readonly kind: AutoplayNodeKind;
  readonly ref: string;
}

const expectedNodesBySeed = new Map<number, readonly AutoplayExpectedNode[]>();

/**
 * The route a run with this seed actually resolves, in play order.
 *
 * Seed 20260803 (the product default) diverges from the unseeded baseline at
 * two of the nine slots, so a report has to be judged against its own seed.
 * An absent or malformed seed falls back to the baseline rather than throwing:
 * a bad seed is already reported by its own gate.
 */
export function autoplayExpectedNodes(seed?: number): readonly AutoplayExpectedNode[] {
  if (seed === undefined || !isAutoplaySeed(seed)) return AUTOPLAY_EXPECTED_NODES;
  const cached = expectedNodesBySeed.get(seed);
  if (cached !== undefined) return cached;
  const resolved = Object.freeze(
    createNodeStrip(canonicalStrip, { seed }).map((node, index) => Object.freeze({
      index,
      nodeId: node.nodeId,
      kind: node.kind,
      ref: node.ref,
    })),
  );
  expectedNodesBySeed.set(seed, resolved);
  return resolved;
}

/** One canonical strip node as observed through the real bootstrap. */
export interface AutoplayNodeReport {
  readonly index: number;
  readonly nodeId: string;
  readonly kind: AutoplayNodeKind;
  readonly ref: string;
  readonly submissions: number;
  readonly turns: number;
  readonly outcome?: string;
  readonly grade?: string;
  readonly rewardOffered?: readonly string[];
  readonly rewardClaimed?: string;
  /** Present when this node ended in a defeat screen. */
  readonly deadSceneReason?: string;
  readonly flagsSet: readonly string[];
  readonly durationMs: number;
  readonly warnings: readonly string[];
}

export interface AutoplayGradeRecord {
  readonly nodeId: string;
  readonly outcome: string;
  readonly grade: string;
}

export interface AutoplayReportEvidence {
  readonly schemaVersion: string;
  readonly seed: number;
  readonly mode: AutoplayOptions['mode'];
  readonly policy: AutoplayOptions['policy'];
  readonly durationMs: number;
  readonly durationAcceptance?: AutoplayDurationAcceptance;
  readonly nodes: readonly AutoplayNodeReport[];
  readonly ending?: Readonly<{ endingId: string }>;
  readonly terminalMarker?: 'RUN_COMPLETED';
  readonly finalState: Readonly<{
    nodeIndex: number;
    terminal: boolean;
    dp: number;
    stress: number;
    trust: number;
    flags: Readonly<Record<string, boolean | number | string>>;
    completedNodeIds: readonly string[];
    claimedRewardIds: readonly string[];
    pendingRewardIds: readonly string[];
    gradeHistory: readonly AutoplayGradeRecord[];
  }>;
  readonly consoleErrors: readonly string[];
  readonly missingAssetKeys: readonly string[];
  readonly rawI18nKeysSeen: readonly string[];
}

export interface AutoplayReport extends AutoplayReportEvidence {
  readonly failure?: string;
  readonly invariantFailures: readonly string[];
  readonly result: 'PASS' | 'FAIL';
}

/** Raw developer keys or data-owned content IDs visible to a player (BLK-2). */
export const RAW_I18N_KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_.]+$/;

export function findRawI18nKeys(values: readonly string[]): readonly string[] {
  return values.filter(
    (value) =>
      RAW_I18N_KEY_PATTERN.test(value) ||
      AUTOPLAY_TECHNICAL_CONTENT_ID_SET.has(value),
  );
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * PASS is evidence-based, not synonymous with reaching any ending screen.
 * These checks intentionally duplicate the v2 audit's canonical route gate so
 * a rendering or policy regression produces a useful FAIL report for L3.
 */
export function findAutoplayInvariantFailures(
  report: AutoplayReportEvidence,
): readonly string[] {
  const failures: string[] = [];
  // Judged against the route this seed resolves, not against the unseeded one.
  const expectedNodes = autoplayExpectedNodes(report.seed);
  const expectedIds = expectedNodes.map((node) => node.nodeId);
  const actualIds = report.nodes.map((node) => node.nodeId);

  if (report.schemaVersion !== AUTOPLAY_REPORT_SCHEMA_VERSION) {
    failures.push(
      `report schema must be ${AUTOPLAY_REPORT_SCHEMA_VERSION}, got ${report.schemaVersion}`,
    );
  }
  if (!isAutoplaySeed(report.seed)) {
    failures.push(`report seed is outside uint32: ${report.seed.toString()}`);
  }
  if (!Number.isFinite(report.durationMs) || report.durationMs < 0) {
    failures.push(`report duration must be finite and non-negative: ${report.durationMs.toString()}`);
  }
  const declaredAcceptance = CAPTURE_DURATION_ACCEPTANCE[report.mode];
  if (declaredAcceptance !== undefined) {
    const acceptance = report.durationAcceptance;
    if (acceptance === undefined) {
      failures.push(`${report.mode} report is missing its wall-clock duration acceptance`);
    } else {
      if (
        acceptance.targetDurationMs !== declaredAcceptance.targetDurationMs ||
        acceptance.minimumDurationMs !== declaredAcceptance.minimumDurationMs ||
        acceptance.maximumDurationMs !== declaredAcceptance.maximumDurationMs ||
        acceptance.measurement !== declaredAcceptance.measurement
      ) {
        failures.push(
          `${report.mode} report duration acceptance does not match the declared product gate`,
        );
      }
      if (
        report.durationMs < acceptance.minimumDurationMs ||
        report.durationMs > acceptance.maximumDurationMs
      ) {
        failures.push(
          `${report.mode} duration ${report.durationMs.toString()}ms is outside ` +
          `${acceptance.minimumDurationMs.toString()}..${acceptance.maximumDurationMs.toString()}ms`,
        );
      }
    }
  } else if (report.durationAcceptance !== undefined) {
    failures.push(`non-capture mode ${report.mode} declared a duration acceptance`);
  }

  if (report.nodes.length !== expectedNodes.length) {
    failures.push(
      `expected ${expectedNodes.length.toString()} node reports, got ${report.nodes.length.toString()}`,
    );
  }
  if (!sameValues(actualIds, expectedIds)) {
    failures.push(
      `node order mismatch for seed ${report.seed.toString()}: ${actualIds.join(' -> ')}`,
    );
  }
  expectedNodes.forEach((expected, index) => {
    const actual = report.nodes[index];
    if (actual === undefined) return;
    if (
      actual.index !== expected.index ||
      actual.kind !== expected.kind ||
      actual.ref !== expected.ref
    ) {
      failures.push(
        `node ${expected.nodeId} metadata mismatch (index=${actual.index.toString()}, kind=${actual.kind}, ref=${actual.ref})`,
      );
    }
    if (!Number.isFinite(actual.durationMs) || actual.durationMs < 0) {
      failures.push(`${expected.nodeId} has an invalid duration`);
    }
    for (const warning of actual.warnings) {
      failures.push(`${expected.nodeId} warning: ${warning}`);
    }
  });
  if (report.finalState.nodeIndex !== expectedNodes.length) {
    failures.push(
      `terminal nodeIndex must be ${expectedNodes.length.toString()}, got ${report.finalState.nodeIndex.toString()}`,
    );
  }
  if (!report.finalState.terminal) failures.push('final run state is not terminal');
  if (report.terminalMarker !== 'RUN_COMPLETED') {
    failures.push('missing RUN_COMPLETED terminal marker');
  }
  if (!sameValues(report.finalState.completedNodeIds, expectedIds)) {
    failures.push(
      `completedNodeIds do not match the ${expectedNodes.length.toString()}-node order for seed ${report.seed.toString()}`,
    );
  }
  if (report.finalState.pendingRewardIds.length > 0) {
    failures.push(`pending rewards remain: ${report.finalState.pendingRewardIds.join(', ')}`);
  }
  if (report.consoleErrors.length > 0) {
    failures.push(`console.error x${report.consoleErrors.length.toString()}`);
  }
  if (report.missingAssetKeys.length > 0) {
    failures.push(`missing assets x${report.missingAssetKeys.length.toString()}`);
  }
  if (report.rawI18nKeysSeen.length > 0) {
    failures.push(`raw i18n keys x${report.rawI18nKeysSeen.length.toString()}`);
  }

  const encounterNodes = report.nodes.filter((node) => node.kind !== 'EVENT');
  const expectedEncounterIds = expectedNodes
    .filter((node) => node.kind !== 'EVENT')
    .map((node) => node.nodeId);
  if (encounterNodes.length !== expectedEncounterIds.length) {
    failures.push(
      `expected ${expectedEncounterIds.length.toString()} graded encounter nodes, ` +
      `got ${encounterNodes.length.toString()}`,
    );
  }
  if (report.finalState.gradeHistory.length !== expectedEncounterIds.length) {
    failures.push(
      `expected ${expectedEncounterIds.length.toString()} grade-history records, ` +
      `got ${report.finalState.gradeHistory.length.toString()}`,
    );
  }
  if (!sameValues(
    report.finalState.gradeHistory.map((record) => record.nodeId),
    expectedEncounterIds,
  )) {
    failures.push('grade-history node IDs do not match the canonical encounter order');
  }

  if (report.policy === 'best') {
    if (report.ending?.endingId !== 'ending-true') {
      failures.push(`BEST ending must be ending-true, got ${report.ending?.endingId ?? 'none'}`);
    }
    if (report.finalState.flags['F-13'] !== true) {
      failures.push('BEST final state did not set F-13');
    }
    // F-12's only writer is the broker canvass, which is one candidate of a
    // seeded ep004 slot. Requiring it unconditionally would fail every route
    // that legitimately drew the other candidate, so the guard follows the
    // route the run actually walked.
    const playedBrokerCanvass = report.nodes.some(
      (node) => node.ref === BROKER_CANVASS_EVENT_ID,
    );
    if (playedBrokerCanvass && report.finalState.flags['F-12'] !== true) {
      failures.push('BEST final state did not preserve the F-12 branch');
    }
    if (report.finalState.flags['F-01'] !== false) {
      failures.push('BEST final state unexpectedly set coerced-confession flag F-01');
    }
    const finalBoss = encounterNodes.at(-1);
    if (finalBoss?.nodeId !== 'run_ep004_05' || !finalBoss.flagsSet.includes('F-13')) {
      failures.push('final boss report did not set F-13');
    }
    const rewardClaimEvents = encounterNodes.filter(
      (node) => node.rewardClaimed !== undefined,
    );
    if (rewardClaimEvents.length !== encounterNodes.length) {
      failures.push(
        `BEST report must record ${encounterNodes.length.toString()} node-level reward claims, got ` +
        rewardClaimEvents.length.toString(),
      );
    }
    for (const node of encounterNodes) {
      if (node.outcome !== 'BEST_RESOLUTION') {
        failures.push(`${node.nodeId} outcome is ${node.outcome ?? 'missing'}, not BEST_RESOLUTION`);
      }
      if (node.grade === undefined) failures.push(`${node.nodeId} has no grade`);
      if ((node.rewardOffered?.length ?? 0) === 0) {
        failures.push(`${node.nodeId} has no reward offer`);
      }
      if (node.rewardClaimed === undefined) {
        failures.push(`${node.nodeId} has no claimed reward`);
      } else if (!node.rewardOffered?.includes(node.rewardClaimed)) {
        failures.push(`${node.nodeId} claimed a reward that was not offered`);
      } else if (!report.finalState.claimedRewardIds.includes(node.rewardClaimed)) {
        failures.push(`${node.nodeId} claimed reward is absent from final state`);
      }
    }
    for (const [index, record] of report.finalState.gradeHistory.entries()) {
      if (record.outcome !== 'BEST_RESOLUTION') {
        failures.push(`${record.nodeId} grade-history outcome is ${record.outcome}`);
      }
      const node = encounterNodes[index];
      if (
        node !== undefined &&
        (record.nodeId !== node.nodeId ||
          record.outcome !== node.outcome ||
          record.grade !== node.grade)
      ) {
        failures.push(`${record.nodeId} grade-history does not match its node report`);
      }
    }
  }

  return failures;
}

export function reportTitle(report: AutoplayReport): string {
  return report.result === 'PASS'
    ? `AUTOPLAY PASS - ${report.finalState.nodeIndex.toString()}/${AUTOPLAY_EXPECTED_NODES.length.toString()}`
    : `AUTOPLAY FAIL - ${report.failure ?? 'unknown failure'}`;
}

export function publishReport(report: AutoplayReport): void {
  (window as unknown as Record<string, unknown>).__DD_AUTOPLAY_REPORT__ = report;
  let element = document.getElementById(AUTOPLAY_REPORT_ELEMENT_ID);
  if (element === null) {
    element = document.createElement('script');
    element.id = AUTOPLAY_REPORT_ELEMENT_ID;
    element.setAttribute('type', 'application/json');
    document.body.append(element);
  }
  // DOM is shared with browser automation even when its JS world is isolated.
  element.textContent = JSON.stringify(report);
  document.title = reportTitle(report);
}
