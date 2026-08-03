import type { BalanceDefinition, BalanceRepository } from '../../content-io';
import {
  BALANCE_SECTIONS,
  formatBalanceFieldValue,
  parseBalanceFieldValue,
  readPath,
  writePath,
  type BalanceFieldDefinition,
  type DeveloperRuntimeBridge,
} from './model';
import {
  createButton,
  createElement,
  createPanelHeading,
  downloadText,
  errorMessage,
  type DevPanelController,
} from './dom';

type Notify = (message: string, error?: boolean) => void;

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedLeafCount(left: unknown, right: unknown): number {
  if (equalJson(left, right)) return 0;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return 1;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  let count = 0;
  keys.forEach((key) => {
    count += changedLeafCount(leftRecord[key], rightRecord[key]);
  });
  return count;
}

function createField(
  field: BalanceFieldDefinition,
  draft: BalanceDefinition,
  onEdit: (field: BalanceFieldDefinition, raw: string, checked: boolean) => void,
): HTMLDivElement {
  const wide = field.kind === 'json';
  const wrapper = createElement('div', `dev-field${wide ? ' dev-field--wide' : ''}`);
  const label = createElement('label');
  label.textContent = field.label;
  if (field.status !== undefined) label.append(createElement('span', 'dev-badge', field.status));
  if (field.note !== undefined) label.append(createElement('span', undefined, `· ${field.note}`));
  const value = readPath(draft, field.path);

  if (field.kind === 'boolean') {
    const checkboxRow = createElement('div', 'dev-checkbox');
    const input = createElement('input');
    input.type = 'checkbox';
    input.checked = value === true;
    input.setAttribute('aria-label', field.label);
    const state = createElement('span', undefined, input.checked ? 'ON' : 'OFF');
    input.addEventListener('change', () => {
      state.textContent = input.checked ? 'ON' : 'OFF';
      onEdit(field, '', input.checked);
    });
    checkboxRow.append(input, state);
    wrapper.append(label, checkboxRow);
    return wrapper;
  }

  if (field.kind === 'json') {
    const input = createElement('textarea');
    input.value = formatBalanceFieldValue(field.kind, value);
    input.spellcheck = false;
    input.setAttribute('aria-label', field.label);
    input.addEventListener('input', () => onEdit(field, input.value, false));
    wrapper.append(label, input);
    return wrapper;
  }

  const input = createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = formatBalanceFieldValue(field.kind, value);
  input.setAttribute('aria-label', field.label);
  input.addEventListener('input', () => onEdit(field, input.value, false));
  wrapper.append(label, input);
  return wrapper;
}

export function createBalancePanel(
  repository: BalanceRepository,
  runtime: DeveloperRuntimeBridge,
  notify: Notify,
): DevPanelController {
  const view = createElement('section', 'dev-panel');
  view.dataset.panel = 'balance';
  const heading = createPanelHeading(
    '라이브 밸런스 튜너',
    '런타임 fetch 원본 위에서 전체 balance.json 카탈로그를 즉시 조정합니다.',
  );
  const status = createElement('span', 'dev-status');
  heading.actions.append(status);
  view.append(heading.view);

  let draft = repository.createDraft();
  const disk = repository.diskSnapshot();
  const grid = createElement('div', 'dev-grid');
  view.append(grid);

  const updateStatus = (invalid = false): void => {
    if (invalid) {
      status.className = 'dev-status dev-status--error';
      status.textContent = '입력 오류';
      return;
    }
    const changeCount = disk === undefined ? 0 : changedLeafCount(disk, draft);
    const dirty = disk === undefined || changeCount > 0;
    status.className = `dev-status${dirty ? ' dev-status--dirty' : ''}`;
    status.textContent =
      disk === undefined
        ? '디스크 스냅샷 없음'
        : dirty
          ? `디스크와 ${changeCount}개 값 다름`
          : '디스크와 동기화됨';
  };

  const render = (): void => {
    grid.replaceChildren();
    BALANCE_SECTIONS.forEach((section) => {
      const card = createElement('section', 'dev-card');
      card.append(createElement('h3', undefined, section.title));
      const fields = createElement('div', 'dev-field-grid');
      section.fields.forEach((field) => {
        fields.append(
          createField(field, draft, (definition, raw, checked) => {
            try {
              const value = parseBalanceFieldValue(definition.kind, raw, checked);
              writePath(draft, definition.path, value);
              updateStatus();
            } catch (error) {
              updateStatus(true);
              notify(`${definition.label}: ${errorMessage(error)}`, true);
            }
          }),
        );
      });
      card.append(fields);
      grid.append(card);
    });
    updateStatus();
  };

  heading.actions.append(
    createButton('디스크 값 복원', () => {
      const snapshot = repository.diskSnapshot();
      if (snapshot === undefined) {
        notify('복원할 디스크 스냅샷이 없습니다.', true);
        return;
      }
      draft = structuredClone(snapshot);
      render();
      notify('편집 초안을 마지막 디스크 로드 값으로 복원했습니다.');
    }),
    createButton('JSON 내보내기', () => {
      try {
        const json = repository.exportJson(draft);
        if (json === undefined) throw new Error('내보낼 수 없는 밸런스 값입니다.');
        downloadText('balance.json', json, 'application/json;charset=utf-8');
        updateStatus();
        notify('balance.json을 내려받았습니다. 디스크 파일은 아직 변경되지 않았습니다.');
      } catch (error) {
        notify(errorMessage(error), true);
      }
    }),
    createButton(
      '즉시 적용',
      () => {
        try {
          const applied = repository.applyInstantly(draft);
          if (applied === undefined) throw new Error('밸런스 검증에 실패했습니다.');
          runtime.applyBalance(applied);
          updateStatus();
          notify('현재 턴을 재시작하지 않고 메모리 밸런스를 적용했습니다.');
        } catch (error) {
          notify(errorMessage(error), true);
        }
      },
      'dev-button dev-button--primary',
    ),
  );

  render();
  return { view, refresh: updateStatus };
}
