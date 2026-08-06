import runStripJson from '../../../content/common/run-strip.json';
import {
  isAutoplaySeed,
  type AutoplayOptions,
} from '../../app/autoplayPort';
import { RunStripSchema } from '../../engine/domain';

export const AUTOPLAY_REPORT_SCHEMA_VERSION = '1.0';
export const AUTOPLAY_REPORT_ELEMENT_ID = 'dd-autoplay-report';

/** Default product acceptance: a 150s cinematic run with a +/-15s tolerance. */
export const VIDEO_DURATION_ACCEPTANCE = Object.freeze({
  targetDurationMs: 150_000,
  minimumDurationMs: 135_000,
  maximumDurationMs: 165_000,
  measurement: 'L2_WALL_CLOCK' as const,
});

export interface AutoplayDurationAcceptance {
  readonly targetDurationMs: number;
  readonly minimumDurationMs: number;
  readonly maximumDurationMs: number;
  /** Distinguishes real driver timing from a simulated/fake-clock duration. */
  readonly measurement: 'L2_WALL_CLOCK';
}

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
if (canonicalStrip.nodes.length !== 15) {
  throw new Error(
    `Autoplay report requires the canonical 15-node strip; found ${canonicalStrip.nodes.length.toString()}.`,
  );
}

/** Data-owned expectation shared by report validation and its regression tests. */
export const AUTOPLAY_EXPECTED_NODES = Object.freeze(
  canonicalStrip.nodes.map((node, index) => Object.freeze({
    index,
    nodeId: node.node_id,
    kind: node.kind,
    ref: node.ref,
  })),
);

export type AutoplayNodeKind = (typeof AUTOPLAY_EXPECTED_NODES)[number]['kind'];

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
  const expectedIds = AUTOPLAY_EXPECTED_NODES.map((node) => node.nodeId);
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
  if (report.mode === 'video') {
    const acceptance = report.durationAcceptance;
    if (acceptance === undefined) {
      failures.push('video report is missing its wall-clock duration acceptance');
    } else {
      if (
        acceptance.targetDurationMs !== VIDEO_DURATION_ACCEPTANCE.targetDurationMs ||
        acceptance.minimumDurationMs !== VIDEO_DURATION_ACCEPTANCE.minimumDurationMs ||
        acceptance.maximumDurationMs !== VIDEO_DURATION_ACCEPTANCE.maximumDurationMs ||
        acceptance.measurement !== VIDEO_DURATION_ACCEPTANCE.measurement
      ) {
        failures.push('video report duration acceptance does not match the declared product gate');
      }
      if (
        report.durationMs < acceptance.minimumDurationMs ||
        report.durationMs > acceptance.maximumDurationMs
      ) {
        failures.push(
          `video duration ${report.durationMs.toString()}ms is outside ` +
          `${acceptance.minimumDurationMs.toString()}..${acceptance.maximumDurationMs.toString()}ms`,
        );
      }
    }
  } else if (report.durationAcceptance !== undefined) {
    failures.push(`non-video mode ${report.mode} declared a video duration acceptance`);
  }

  if (report.nodes.length !== AUTOPLAY_EXPECTED_NODES.length) {
    failures.push(
      `expected ${AUTOPLAY_EXPECTED_NODES.length.toString()} node reports, got ${report.nodes.length.toString()}`,
    );
  }
  if (!sameValues(actualIds, expectedIds)) {
    failures.push(`node order mismatch: ${actualIds.join(' -> ')}`);
  }
  AUTOPLAY_EXPECTED_NODES.forEach((expected, index) => {
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
  if (report.finalState.nodeIndex !== AUTOPLAY_EXPECTED_NODES.length) {
    failures.push(
      `terminal nodeIndex must be ${AUTOPLAY_EXPECTED_NODES.length.toString()}, got ${report.finalState.nodeIndex.toString()}`,
    );
  }
  if (!report.finalState.terminal) failures.push('final run state is not terminal');
  if (report.terminalMarker !== 'RUN_COMPLETED') {
    failures.push('missing RUN_COMPLETED terminal marker');
  }
  if (!sameValues(report.finalState.completedNodeIds, expectedIds)) {
    failures.push('completedNodeIds do not match the canonical 15-node order');
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
  const expectedEncounterIds = AUTOPLAY_EXPECTED_NODES
    .filter((node) => node.kind !== 'EVENT')
    .map((node) => node.nodeId);
  if (encounterNodes.length !== 9) {
    failures.push(`expected 9 graded encounter nodes, got ${encounterNodes.length.toString()}`);
  }
  if (report.finalState.gradeHistory.length !== 9) {
    failures.push(
      `expected 9 grade-history records, got ${report.finalState.gradeHistory.length.toString()}`,
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
    if (report.finalState.flags['F-12'] !== true) {
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
