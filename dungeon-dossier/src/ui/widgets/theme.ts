export const UI_PALETTE = {
  ink: 0x16120d,
  deepInk: 0x090807,
  panel: 0x282117,
  panelLight: 0x4f422c,
  parchment: 0xe5d2a4,
  parchmentDark: 0xb69a63,
  paper: 0xf3e5bd,
  muted: 0x968567,
  cyan: 0x73c8c2,
  blue: 0x406995,
  red: 0xa94435,
  amber: 0xd2a548,
  green: 0x6f9c68,
  shadow: 0x000000,
} as const;

export const FACET_LABELS = {
  WHO: '누가',
  WHEN: '언제',
  WHERE: '어디서',
  WHAT: '무엇을',
  HOW: '어떻게',
  WHY: '왜',
} as const;

export const PROOF_SCOPE_LABELS: Readonly<Record<string, string>> = {
  IDENTITY: '신원',
  TIME: '시간',
  LOCATION: '장소',
  PRESENCE: '현장 존재',
  OWNERSHIP: '소유',
  ACTION: '행동',
  SEQUENCE: '순서',
  ROUTE: '동선',
  INSTRUCTION: '지시',
  MOTIVE: '동기',
  INTEGRITY: '증거 무결성',
};

export function proofScopeLabel(scope: string): string {
  return PROOF_SCOPE_LABELS[scope] ?? scope;
}
