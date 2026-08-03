import { DEV_FLAG_IDS, clampRuntimeResource, type DeveloperRuntimeBridge, type RuntimeResourceKey } from './model';
import {
  createButton,
  createElement,
  createPanelHeading,
  type DevPanelController,
} from './dom';

type Notify = (message: string, error?: boolean) => void;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function claimsFromCase(caseData: unknown): readonly Record<string, unknown>[] {
  const claims = record(caseData)?.claims;
  return Array.isArray(claims)
    ? claims.flatMap((claim) => {
        const candidate = record(claim);
        return candidate === undefined ? [] : [candidate];
      })
    : [];
}

const RESOURCE_LABELS: Readonly<Record<RuntimeResourceKey, string>> = {
  composure: '평정심',
  coercion: '강압',
  commandPoints: 'CP',
  stress: '스트레스',
};

export function createRuntimePanel(
  runtime: DeveloperRuntimeBridge,
  caseData: unknown,
  notify: Notify,
): DevPanelController {
  const view = createElement('section', 'dev-panel');
  view.dataset.panel = 'runtime';
  const heading = createPanelHeading(
    '런타임 제어',
    '라이브 데모 자원, 노드, AI, 플래그와 QTE를 현재 P2 무대에 바로 반영합니다.',
  );
  const grid = createElement('div', 'dev-runtime-grid');
  view.append(heading.view, grid);
  const resourceInputs = new Map<RuntimeResourceKey, HTMLInputElement>();

  const resourcesCard = createElement('section', 'dev-card');
  resourcesCard.append(createElement('h3', undefined, 'RESOURCE CHEATS'));
  (Object.keys(RESOURCE_LABELS) as RuntimeResourceKey[]).forEach((key) => {
    const row = createElement('div', 'dev-stepper');
    const input = createElement('input');
    input.type = 'number';
    input.step = '1';
    input.setAttribute('aria-label', RESOURCE_LABELS[key]);
    input.addEventListener('change', () => {
      const value = clampRuntimeResource(key, Number(input.value));
      runtime.setResource(key, value);
      refresh();
    });
    resourceInputs.set(key, input);
    row.append(
      input,
      createButton('−10', () => {
        runtime.setResource(key, clampRuntimeResource(key, Number(input.value) - 10));
        refresh();
      }),
      createButton('+10', () => {
        runtime.setResource(key, clampRuntimeResource(key, Number(input.value) + 10));
        refresh();
      }),
    );
    const field = createElement('div', 'dev-field');
    field.append(createElement('label', undefined, RESOURCE_LABELS[key]), row);
    resourcesCard.append(field);
  });

  const flowCard = createElement('section', 'dev-card');
  flowCard.append(createElement('h3', undefined, 'NODE & LIVE SWITCHES'));
  const nodeField = createElement('div', 'dev-field');
  const nodeSelect = createElement('select');
  nodeSelect.setAttribute('aria-label', '노드 점프 대상');
  runtime.availableNodes().forEach((nodeId) => {
    const option = createElement('option', undefined, nodeId);
    option.value = nodeId;
    nodeSelect.append(option);
  });
  nodeField.append(
    createElement('label', undefined, '노드 점프'),
    nodeSelect,
    createButton('이동', () => {
      runtime.jumpToNode(nodeSelect.value);
      refresh();
      notify(`${nodeSelect.value} 노드로 이동했습니다.`);
    }),
  );
  flowCard.append(nodeField);

  const aiToggle = createElement('input');
  aiToggle.type = 'checkbox';
  aiToggle.addEventListener('change', () => {
    runtime.setAiEnabled(aiToggle.checked);
    refresh();
    notify(`AI 표현을 ${aiToggle.checked ? '활성화' : '비활성화'}했습니다.`);
  });
  const aiRow = createElement('label', 'dev-switch-row');
  aiRow.append(document.createTextNode('AI 대사 런타임 토글'), aiToggle);
  flowCard.append(aiRow);

  const qteToggle = createElement('input');
  qteToggle.type = 'checkbox';
  qteToggle.addEventListener('change', () => {
    runtime.setQteAutoSuccess(qteToggle.checked);
    refresh();
  });
  const qteRow = createElement('label', 'dev-switch-row');
  qteRow.append(document.createTextNode('QTE 자동 성공'), qteToggle);
  flowCard.append(qteRow);

  const flagsCard = createElement('section', 'dev-card');
  flagsCard.append(createElement('h3', undefined, 'FLAGS F-01 — F-13'));
  const flagInputs = new Map<string, HTMLInputElement>();
  DEV_FLAG_IDS.forEach((flagId) => {
    const toggle = createElement('input');
    toggle.type = 'checkbox';
    toggle.addEventListener('change', () => runtime.setFlag(flagId, toggle.checked));
    flagInputs.set(flagId, toggle);
    const row = createElement('label', 'dev-flag-row');
    row.append(document.createTextNode(flagId), toggle);
    flagsCard.append(row);
  });
  grid.append(resourcesCard, flowCard, flagsCard);

  const truthCard = createElement('section', 'dev-card');
  truthCard.style.gridColumn = '1 / -1';
  truthCard.append(
    createElement('h3', undefined, 'TRUTH OVERLAY · DEV BYTES ONLY'),
    createElement('p', undefined, '내부 판정은 이 개발 전용 청크에서만 읽으며 PublicDTO로 전달되지 않습니다.'),
  );
  const truthGrid = createElement('div', 'dev-truth-grid');
  const claims = claimsFromCase(caseData);
  claims.forEach((claim) => {
    const truth = record(claim.truth);
    truthGrid.append(
      createElement(
        'div',
        'dev-truth-chip',
        `${text(claim.facet, 'CLAIM')} · ${text(claim.claim_id, '?')}\n${text(truth?.relation, 'UNKNOWN')}`,
      ),
    );
  });
  if (claims.length === 0) truthGrid.append(createElement('div', 'dev-empty', '로드된 내부 진실 태그가 없습니다.'));
  truthCard.append(truthGrid);
  grid.append(truthCard);

  function refresh(): void {
    const snapshot = runtime.getSnapshot();
    resourceInputs.forEach((input, key) => {
      input.value = String(snapshot[key]);
    });
    nodeSelect.value = snapshot.nodeId;
    aiToggle.checked = snapshot.aiEnabled;
    qteToggle.checked = snapshot.qteAutoSuccess;
    flagInputs.forEach((input, flagId) => {
      input.checked = snapshot.flags[flagId] === true;
    });
  }

  refresh();
  return { view, refresh };
}
