import { toPublicDTO } from '../dto';
import type { KnowledgeState } from '../engine/knowledge';
import type { InterrogationScreenModel } from '../ui/screens/interrogation';

/**
 * M1 presentation fixture. Phase 4 replaces this adapter with the encounter
 * coordinator; the screen contract remains the same PublicDTO projection.
 */
export function createPhase2Preview(): InterrogationScreenModel {
  const knowledge: KnowledgeState = {
    claims: [
      {
        claimId: 'preview_claim_who',
        speakerId: 'preview_suspect',
        facet: 'WHO',
        canonicalMeaning: '그 시각 탕비실에는 저 혼자 있었어요.',
        commitment: 'ASSERTED',
        epistemic: 'UNKNOWN',
        presentation: 'LOCKED',
        resistance: 2,
        isRequired: true,
      },
      {
        claimId: 'preview_claim_when',
        speakerId: 'preview_suspect',
        facet: 'WHEN',
        canonicalMeaning: '청소를 시작한 건 오후 다섯 시쯤이었어요.',
        commitment: 'COMMITTED',
        epistemic: 'SUPPORTED',
        presentation: 'NORMAL',
        resistance: 0,
        isRequired: true,
      },
      {
        claimId: 'preview_claim_where',
        speakerId: 'preview_suspect',
        facet: 'WHERE',
        canonicalMeaning: '계속 탕비실 안에만 있었습니다.',
        commitment: 'ASSERTED',
        epistemic: 'SUSPECTED',
        presentation: 'DISTORTED',
        resistance: 0,
        isRequired: false,
      },
      {
        claimId: 'preview_claim_what',
        speakerId: 'preview_suspect',
        facet: 'WHAT',
        canonicalMeaning: '황금 엘릭서 봉지는 만진 적이 없어요.',
        commitment: 'CONTRADICTED',
        epistemic: 'REFUTED',
        presentation: 'NORMAL',
        resistance: 0,
        isRequired: true,
      },
      {
        claimId: 'preview_claim_how',
        speakerId: 'preview_suspect',
        facet: 'HOW',
        canonicalMeaning: '문은 잠겨 있어서 누구도 들어올 수 없었어요.',
        commitment: 'ASSERTED',
        epistemic: 'UNKNOWN',
        presentation: 'COMPOUND',
        resistance: 3,
        isRequired: false,
      },
      {
        claimId: 'preview_claim_why',
        speakerId: 'preview_suspect',
        facet: 'WHY',
        canonicalMeaning: '제가 그 커피를 훔칠 이유가 없잖아요.',
        commitment: 'ASSERTED',
        epistemic: 'PROVISIONAL',
        presentation: 'NORMAL',
        resistance: 0,
        isRequired: false,
      },
    ],
    evidence: [
      {
        evidenceId: 'preview_evidence_roster',
        displayName: '찢어진 탕비실 당번표',
        acquired: true,
        grade: 'A',
        scopes: ['TIME', 'PRESENCE'],
        notProvenKeys: ['실제로 커피를 가져간 사람', '봉투를 연 방법'],
      },
      {
        evidenceId: 'preview_evidence_receipt',
        displayName: '자판기 결제 영수증',
        acquired: true,
        grade: 'B',
        scopes: ['TIME', 'OWNERSHIP'],
        notProvenKeys: ['결제 이후의 동선', '절도 행위 자체'],
      },
      {
        evidenceId: 'preview_evidence_photo',
        displayName: '복도 수정구 사진',
        acquired: true,
        grade: 'C',
        scopes: ['LOCATION', 'ROUTE'],
        notProvenKeys: ['사진 밖에서 벌어진 행동', '범행 동기'],
      },
    ],
  };

  const dto = toPublicDTO({
    knowledge,
    resources: { composure: 24, coercion: 38, commandPoints: 3 },
    objectives: [
      { label: '필수 진술을 검증한다', completed: false },
      { label: '강압 없이 진술을 확보한다', completed: false },
    ],
  });

  return {
    dto,
    suspectName: '물컹이',
    partnerName: '김 인턴',
    turn: { current: 3, limit: 8 },
    stress: 72,
    composureMax: 60,
    coercionMax: 100,
    sweetSpotUnlocked: true,
    cards: [
      {
        cardId: 'preview_card_query',
        title: '탐문 질문',
        description: '선택한 태그를 다시 묻는다.',
        intent: 'QUERY',
        cpCost: 1,
        requiresEvidence: false,
      },
      {
        cardId: 'preview_card_confirm',
        title: '사실 확인',
        description: '증거를 붙여 사실관계를 확인한다.',
        intent: 'CONFIRM',
        cpCost: 1,
        requiresEvidence: true,
      },
      {
        cardId: 'preview_card_contradict',
        title: '모순 지적',
        description: '증거와 충돌하는 진술을 지적한다.',
        intent: 'CONTRADICT',
        cpCost: 2,
        requiresEvidence: true,
      },
      {
        cardId: 'preview_card_pressure',
        title: '압박',
        description: '강하게 재촉한다.',
        intent: 'PRESSURE',
        cpCost: 2,
        requiresEvidence: false,
      },
      {
        cardId: 'preview_card_recover',
        title: '심호흡',
        description: '수사 호흡을 고른다.',
        intent: 'RECOVER',
        cpCost: 1,
        requiresEvidence: false,
      },
    ],
    evidenceCosts: {
      preview_evidence_roster: 0,
      preview_evidence_receipt: 1,
      preview_evidence_photo: 0,
    },
    portraitBaseAssetKey: 'portrait/물컹이/base',
    canSecureStatement: true,
  };
}
