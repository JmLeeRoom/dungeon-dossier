import { appendJudgmentLog, serializeJudgmentLog, type JudgmentLog } from '../../engine/log';
import {
  createButton,
  createElement,
  createPanelHeading,
  downloadText,
  type DevPanelController,
} from './dom';

export interface DevLogPanelController extends DevPanelController {
  record(input: unknown, result: unknown): void;
}

export function createLogPanel(): DevLogPanelController {
  const view = createElement('section', 'dev-panel');
  view.dataset.panel = 'logs';
  const heading = createPanelHeading(
    'JudgmentLog 뷰어',
    'P2 제출과 QA 재생 결과를 순서가 보존되는 판정 로그로 확인합니다.',
  );
  const list = createElement('div', 'dev-log-list');
  view.append(heading.view, list);
  let log: JudgmentLog = [];

  const render = (): void => {
    list.replaceChildren();
    if (log.length === 0) {
      list.append(createElement('div', 'dev-empty', '아직 기록된 판정이 없습니다.'));
      return;
    }
    [...log].reverse().forEach((entry) => {
      list.append(
        createElement(
          'article',
          'dev-log-entry',
          `#${entry.sequence}\nINPUT ${JSON.stringify(entry.input, null, 2)}\nRESULT ${JSON.stringify(entry.result, null, 2)}`,
        ),
      );
    });
  };

  heading.actions.append(
    createButton('로그 JSON 내보내기', () => {
      downloadText(
        'judgment-log.json',
        `${serializeJudgmentLog(log)}\n`,
        'application/json;charset=utf-8',
      );
    }),
    createButton('비우기', () => {
      log = [];
      render();
    }, 'dev-button dev-button--danger'),
  );
  render();
  return {
    view,
    refresh: render,
    record(input, result): void {
      log = appendJudgmentLog(log, input, result);
      render();
    },
  };
}
