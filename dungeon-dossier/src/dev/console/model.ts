import type { BalanceDefinition } from '../../content-io';

export const DEV_FLAG_IDS = Array.from(
  { length: 13 },
  (_, index) => `F-${String(index + 1).padStart(2, '0')}`,
);

export type DevFlagId = (typeof DEV_FLAG_IDS)[number];

export type RuntimeResourceKey =
  | 'composure'
  | 'coercion'
  | 'commandPoints'
  | 'stress';

export interface DevRuntimeSnapshot {
  readonly composure: number;
  readonly coercion: number;
  readonly commandPoints: number;
  readonly stress: number;
  readonly nodeId: string;
  readonly aiEnabled: boolean;
  readonly qteAutoSuccess: boolean;
  readonly flags: Readonly<Record<string, boolean>>;
}

export interface DeveloperRuntimeBridge {
  getSnapshot(): DevRuntimeSnapshot;
  availableNodes(): readonly string[];
  setResource(key: RuntimeResourceKey, value: number): void;
  jumpToNode(nodeId: string): void;
  setAiEnabled(enabled: boolean): void;
  setQteAutoSuccess(enabled: boolean): void;
  setFlag(flagId: string, enabled: boolean): void;
  replayDialogue(text: string): void;
  applyBalance(balance: BalanceDefinition): void;
}

export interface BalanceFieldDefinition {
  readonly path: string;
  readonly label: string;
  readonly kind: 'number' | 'boolean' | 'json';
  readonly status?: '확정' | '초안' | 'TBD';
  readonly note?: string;
}

export interface BalanceSectionDefinition {
  readonly title: string;
  readonly fields: readonly BalanceFieldDefinition[];
}

export const BALANCE_SECTIONS: readonly BalanceSectionDefinition[] = [
  {
    title: '드로우',
    fields: [
      { path: 'draw.initial', label: '초기 드로우', kind: 'number', status: '초안' },
      { path: 'draw.perTurn', label: '턴당 드로우', kind: 'number', status: '초안' },
      { path: 'draw.handLimit', label: '손패 제한', kind: 'number', status: '초안' },
      { path: 'draw.reshuffleOnEmpty', label: '덱 소진 시 재셔플', kind: 'boolean', status: '초안' },
    ],
  },
  {
    title: '피해와 방어',
    fields: [
      { path: 'dmg.contradict', label: '직접 모순 피해', kind: 'number', status: '확정' },
      { path: 'dmg.pressure', label: '압박 피해', kind: 'number', status: 'TBD' },
      { path: 'dmg.requery', label: '재질문 피해', kind: 'number', status: 'TBD' },
      { path: 'dmg.chainPursuit', label: '연쇄 추궁 피해', kind: 'number', status: 'TBD' },
      { path: 'composureDmg.indirect', label: '간접 의심 피해', kind: 'number', status: 'TBD' },
      { path: 'shield.durabilityDefault', label: '기본 방패 내구도', kind: 'number', status: 'TBD' },
      { path: 'committedMultiplier', label: 'COMMITTED 배율', kind: 'number', status: '초안' },
    ],
  },
  {
    title: '강압',
    fields: [
      { path: 'coercion.insufficient', label: '근거 불충분', kind: 'number', status: 'TBD', note: '0–3' },
      { path: 'coercion.truthAttack', label: '진실 공격', kind: 'number', status: 'TBD', note: '10–20' },
      { path: 'coercion.irrelevant', label: '무관 증거', kind: 'number', status: 'TBD', note: '5–10' },
      { path: 'coercion.redStampFactor', label: '빨간 도장 배율', kind: 'number', status: 'TBD' },
      { path: 'coercion.goblinReflectFactor', label: '고블린 반사 배율', kind: 'number' },
      { path: 'coercion.breathReduce', label: '심호흡 감소', kind: 'number' },
      { path: 'coercion.finalConfirmReduce', label: '최종 확인 감소', kind: 'number' },
    ],
  },
  {
    title: '판정과 스위트 스폿',
    fields: [
      { path: 'independence.partialWeight', label: '독립성 부분 가중치', kind: 'number', status: '초안' },
      { path: 'sweetSpot.min', label: '스위트 스폿 최소', kind: 'number' },
      { path: 'sweetSpot.max', label: '스위트 스폿 최대', kind: 'number' },
    ],
  },
  {
    title: '런 자원',
    fields: [
      { path: 'stress.max', label: '스트레스 최대', kind: 'number', status: 'TBD' },
      { path: 'dp.initial', label: '초기 DP', kind: 'number', status: 'TBD' },
      { path: 'dp.rewardBattle', label: '전투 보상 DP', kind: 'number' },
      { path: 'trust.max', label: '신뢰 최대', kind: 'number' },
      { path: 'trust.thresholds', label: '신뢰 임계값', kind: 'json', status: 'TBD' },
      { path: 'partner.cooldowns', label: '파트너 쿨다운 6종', kind: 'json', status: 'TBD' },
      { path: 'composure.regen', label: '평정심 재생 규칙', kind: 'json', status: 'TBD' },
    ],
  },
  {
    title: '사건별 우선 오버라이드',
    fields: [
      {
        path: 'overrides.byEncounter',
        label: '사건별 수치',
        kind: 'json',
        note: 'case.json보다 우선 적용',
      },
    ],
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('편집 경로가 객체를 가리키지 않습니다.');
  }
  return value as Record<string, unknown>;
}

export function readPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => asRecord(value)[segment], root);
}

export function writePath(root: unknown, path: string, value: unknown): void {
  const segments = path.split('.');
  const leaf = segments.pop();
  if (leaf === undefined) throw new Error('빈 편집 경로입니다.');
  const parent = segments.reduce<unknown>(
    (candidate, segment) => asRecord(candidate)[segment],
    root,
  );
  asRecord(parent)[leaf] = value;
}

export function parseBalanceFieldValue(
  kind: BalanceFieldDefinition['kind'],
  raw: string,
  checked = false,
): unknown {
  if (kind === 'boolean') return checked;
  if (kind === 'json') return JSON.parse(raw) as unknown;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error('유한한 숫자를 입력하세요.');
  return value;
}

export function formatBalanceFieldValue(kind: BalanceFieldDefinition['kind'], value: unknown): string {
  return kind === 'json' ? JSON.stringify(value, null, 2) : String(value);
}

export function clampRuntimeResource(key: RuntimeResourceKey, value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  if (key === 'coercion' || key === 'stress') return Math.min(100, Math.max(0, safe));
  return Math.max(0, safe);
}
