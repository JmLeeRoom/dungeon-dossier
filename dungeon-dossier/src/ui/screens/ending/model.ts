export type EndingKind = 'TRUE' | 'NORMAL' | 'BAD';

export interface EndingScreenModel {
  readonly endingId: string;
  readonly kind: EndingKind;
  readonly title: string;
  readonly script: readonly string[];
  readonly illustrationAssetKey?: string;
}

export function endingTone(kind: EndingKind): string {
  switch (kind) {
    case 'TRUE': return '진실은 기록으로 남았다.';
    case 'NORMAL': return '수사는 끝났지만 의문은 남았다.';
    case 'BAD': return '조서는 끝내 진실에 닿지 못했다.';
  }
}
