import type { AutoplayOptions } from '../../app/autoplayPort';

export const AUTOPLAY_REPORT_SCHEMA_VERSION = '1.0';
export const AUTOPLAY_REPORT_ELEMENT_ID = 'dd-autoplay-report';

export const AUTOPLAY_EXPECTED_NODES = [
  { index: 0, nodeId: 'run_tutorial_01', kind: 'ENCOUNTER', ref: 'enc_tutorial_slime' },
  { index: 1, nodeId: 'run_tutorial_02', kind: 'EVENT', ref: 'event_tutorial_choice' },
  { index: 2, nodeId: 'run_tutorial_03', kind: 'ENCOUNTER', ref: 'enc_tutorial_harpy' },
  { index: 3, nodeId: 'run_tutorial_04', kind: 'EVENT', ref: 'event_tutorial_placement' },
  { index: 4, nodeId: 'run_tutorial_05', kind: 'BOSS', ref: 'enc_tutorial_minotaur' },
  { index: 5, nodeId: 'run_ep001_01', kind: 'ENCOUNTER', ref: 'enc_ep001_goblin' },
  { index: 6, nodeId: 'run_ep001_02', kind: 'EVENT', ref: 'event_ep001_links' },
  { index: 7, nodeId: 'run_ep001_03', kind: 'ENCOUNTER', ref: 'enc_ep001_orc' },
  { index: 8, nodeId: 'run_ep001_04', kind: 'EVENT', ref: 'event_ep001_warehouse' },
  { index: 9, nodeId: 'run_ep001_05', kind: 'BOSS', ref: 'enc_ep001_succubus' },
  { index: 10, nodeId: 'run_ep004_01', kind: 'ENCOUNTER', ref: 'enc_ep004_dwarf' },
  { index: 11, nodeId: 'run_ep004_02', kind: 'EVENT', ref: 'event_ep004_machine_room' },
  { index: 12, nodeId: 'run_ep004_03', kind: 'ENCOUNTER', ref: 'enc_ep004_cyclops' },
  { index: 13, nodeId: 'run_ep004_04', kind: 'EVENT', ref: 'event_ep004_ticket_trade' },
  { index: 14, nodeId: 'run_ep004_05', kind: 'BOSS', ref: 'enc_ep004_fallen_hero' },
] as const;

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

/** Raw developer i18n keys look like `event.title` / `resource.dp` (BLK-2). */
export const RAW_I18N_KEY_PATTERN = /^[a-z0-9_]+\.[a-z0-9_.]+$/;

export function findRawI18nKeys(values: readonly string[]): readonly string[] {
  return values.filter((value) => RAW_I18N_KEY_PATTERN.test(value));
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
  if (encounterNodes.length !== 9) {
    failures.push(`expected 9 graded encounter nodes, got ${encounterNodes.length.toString()}`);
  }
  if (report.finalState.gradeHistory.length !== 9) {
    failures.push(
      `expected 9 grade-history records, got ${report.finalState.gradeHistory.length.toString()}`,
    );
  }

  if (report.policy === 'best') {
    if (report.ending?.endingId !== 'ending-true') {
      failures.push(`BEST ending must be ending-true, got ${report.ending?.endingId ?? 'none'}`);
    }
    if (report.finalState.flags['F-13'] !== true) {
      failures.push('BEST final state did not set F-13');
    }
    const finalBoss = encounterNodes.at(-1);
    if (finalBoss?.nodeId !== 'run_ep004_05' || !finalBoss.flagsSet.includes('F-13')) {
      failures.push('final boss report did not set F-13');
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
      } else if (!report.finalState.claimedRewardIds.includes(node.rewardClaimed)) {
        failures.push(`${node.nodeId} claimed reward is absent from final state`);
      }
    }
    for (const record of report.finalState.gradeHistory) {
      if (record.outcome !== 'BEST_RESOLUTION') {
        failures.push(`${record.nodeId} grade-history outcome is ${record.outcome}`);
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
