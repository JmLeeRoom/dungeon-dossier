import {
  QA_FIXTURE_NUMBERS,
  replayQaFixture,
  type QaFixtureNumber,
  type QaFixtureReplay,
} from '../qa';
import type { DeveloperRuntimeBridge } from './model';
import {
  createButton,
  createElement,
  createPanelHeading,
  errorMessage,
  type DevPanelController,
} from './dom';

type Notify = (message: string, error?: boolean) => void;

const QA_SHORT_LABELS: Readonly<Record<QaFixtureNumber, string>> = {
  1: '영수증 · TIME 누락',
  2: 'GATE-04 직접 모순',
  3: '23:07 전자 서명',
  4: '장부 · 독립성 미달',
  5: '진실 태그 공격',
  6: '사실 확인 잠금',
  7: '부분 증명 0.5',
  8: 'Grade-B 단독/병용',
  9: '잠금 태그 조기 공격',
  10: '원본 소실 대체 경로',
  11: '금지 절차 즉시 패배',
  12: '최종 단독/병용',
};

function formatReplay(replay: QaFixtureReplay): string {
  const resolutions = replay.resolutions.map((resolution) => {
    const axes = resolution.axes;
    return [
      `${resolution.label}: ${resolution.code}`,
      `  relevance=${String(axes.relevance)} relation=${String(axes.relation)}`,
      `  sufficiency=${String(axes.sufficiency)} independence=${String(axes.independence)}`,
      `  hypotheses=${String(axes.hypotheses)}`,
    ].join('\n');
  });
  if (replay.solvablePath !== null) resolutions.push(`hasSolvablePath=${String(replay.solvablePath)}`);
  return `QA ${replay.fixture} PASS · ${replay.title}\n${resolutions.join('\n')}`;
}

export function createQaPanel(
  runtime: DeveloperRuntimeBridge,
  record: (input: unknown, result: unknown) => void,
  notify: Notify,
): DevPanelController {
  const view = createElement('section', 'dev-panel');
  view.dataset.panel = 'qa';
  const heading = createPanelHeading(
    '12 QA 픽스처 재생',
    '각 버튼은 production resolver를 실행하고 결과 코드와 5개 판정 축을 모두 단언합니다.',
  );
  const grid = createElement('div', 'dev-qa-grid');
  const output = createElement('pre', 'dev-code dev-qa-result', '픽스처를 선택하면 축 단언 결과가 표시됩니다.');
  view.append(heading.view, grid, output);
  const buttons = new Map<QaFixtureNumber, HTMLButtonElement>();

  const run = (fixture: QaFixtureNumber): boolean => {
    const button = buttons.get(fixture);
    try {
      const replay = replayQaFixture(fixture);
      if (button !== undefined) button.dataset.result = 'pass';
      output.textContent = formatReplay(replay);
      runtime.replayDialogue(`QA ${fixture} 통과. ${replay.resolutions.map((item) => item.code).join(', ')}`);
      record({ source: 'DEV_QA_FIXTURE', fixture }, replay);
      return true;
    } catch (error) {
      if (button !== undefined) button.dataset.result = 'fail';
      output.textContent = `QA ${fixture} FAIL\n${errorMessage(error)}`;
      record({ source: 'DEV_QA_FIXTURE', fixture }, { error: errorMessage(error) });
      notify(`QA ${fixture} 축 단언 실패`, true);
      return false;
    }
  };

  QA_FIXTURE_NUMBERS.forEach((fixture) => {
    const button = createElement('button', 'dev-qa-button');
    button.type = 'button';
    button.append(
      createElement('strong', undefined, String(fixture).padStart(2, '0')),
      createElement('span', undefined, QA_SHORT_LABELS[fixture]),
    );
    button.addEventListener('click', () => run(fixture));
    buttons.set(fixture, button);
    grid.append(button);
  });

  heading.actions.append(
    createButton(
      '12개 모두 재생',
      () => {
        let passes = 0;
        QA_FIXTURE_NUMBERS.forEach((fixture) => {
          if (run(fixture)) passes += 1;
        });
        notify(`${passes}/12 QA 픽스처가 코드와 5개 축 단언을 통과했습니다.`, passes !== 12);
      },
      'dev-button dev-button--primary',
    ),
  );
  return { view };
}
