import {
  setClaimFallbackLines,
  setReactionFallbackLines,
  type LiveContentEditorModel,
} from '../content';
import type { DeveloperRuntimeBridge } from './model';
import {
  createButton,
  createElement,
  createPanelHeading,
  errorMessage,
  type DevPanelController,
} from './dom';

type Notify = (message: string, error?: boolean) => void;
type ContentKind = 'claims' | 'evidence' | 'reactions';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const candidate = record(item);
        return candidate === undefined ? [] : [candidate];
      })
    : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function dialogueStatements(model: LiveContentEditorModel): Record<string, unknown> {
  return record(record(model.dialogueData)?.statements) ?? {};
}

function dialogueReactions(model: LiveContentEditorModel): Record<string, unknown> {
  return record(record(model.dialogueData)?.reactions) ?? {};
}

function fallbackLines(model: LiveContentEditorModel, claimId: string): readonly string[] {
  const statement = record(dialogueStatements(model)[claimId]);
  return Array.isArray(statement?.fallback)
    ? statement.fallback.filter((line): line is string => typeof line === 'string')
    : [];
}

function reactionLines(model: LiveContentEditorModel, reactionKey: string): readonly string[] {
  const lines = dialogueReactions(model)[reactionKey];
  return Array.isArray(lines) ? lines.filter((line): line is string => typeof line === 'string') : [];
}

function linesFromEditor(value: string): readonly string[] {
  return value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

export function createContentPanel(
  initialModel: LiveContentEditorModel,
  runtime: DeveloperRuntimeBridge,
  notify: Notify,
): DevPanelController {
  const view = createElement('section', 'dev-panel');
  view.dataset.panel = 'content';
  const heading = createPanelHeading(
    '사건 데이터 & 대사 서랍',
    '로드된 Claim, Evidence observation과 폴백 대사를 탐색하고 CI와 같은 규칙으로 즉시 검사합니다.',
  );
  view.append(heading.view);

  let model = initialModel;
  let kind: ContentKind = 'claims';
  let selectedId: string | undefined;
  const contentTabs = createElement('div', 'dev-content-tabs');
  const validation = createElement('div', 'dev-validation');
  const split = createElement('div', 'dev-split');
  const listCard = createElement('section', 'dev-card');
  const list = createElement('div', 'dev-list');
  const editor = createElement('section', 'dev-card dev-dialogue-editor');
  listCard.append(list);
  split.append(listCard, editor);
  view.append(contentTabs, validation, split);

  const claims = (): readonly Record<string, unknown>[] => records(record(model.caseData)?.claims);
  const evidence = (): readonly Record<string, unknown>[] => records(record(model.caseData)?.evidence);

  const renderValidation = (): void => {
    validation.replaceChildren();
    if (model.validation.valid) {
      validation.className = 'dev-validation';
      validation.textContent = `T1–T2 / A-6 검사 통과 · revision ${model.revision}`;
      return;
    }
    validation.className = 'dev-validation dev-validation--error';
    validation.append(
      createElement(
        'strong',
        undefined,
        `${model.validation.issues.length}개 콘텐츠 오류 · revision ${model.revision}`,
      ),
    );
    const issues = createElement('ul');
    model.validation.issues.slice(0, 12).forEach((issue) => {
      issues.append(
        createElement(
          'li',
          undefined,
          `[${issue.code}] ${issue.document}.${issue.path.join('.')} — ${issue.message}`,
        ),
      );
    });
    validation.append(issues);
  };

  const renderClaimEditor = (claim: Record<string, unknown>): void => {
    const claimId = text(claim.claim_id);
    editor.append(
      createElement('h3', undefined, `${text(claim.facet, 'CLAIM')} · ${claimId}`),
      createElement('p', undefined, text(claim.canonical_meaning, '설명 없음')),
    );
    const details = createElement('pre', 'dev-code');
    details.textContent = JSON.stringify(
      {
        predicate: claim.predicate,
        initial: claim.initial,
        lock: claim.lock ?? null,
      },
      null,
      2,
    );
    const field = createElement('div', 'dev-field dev-field--wide');
    field.append(createElement('span', 'dev-field__label', 'Fallback lines · 한 줄당 한 문장'));
    const input = createElement('textarea');
    input.value = fallbackLines(model, claimId).join('\n');
    input.setAttribute('aria-label', `${claimId} fallback lines`);
    input.addEventListener('input', () => {
      try {
        model = setClaimFallbackLines(model, claimId, linesFromEditor(input.value));
        renderValidation();
      } catch (error) {
        notify(errorMessage(error), true);
      }
    });
    const actions = createElement('div', 'dev-panel__actions');
    actions.append(
      createButton('무대에서 타이프라이터 재생', () => {
        const line = linesFromEditor(input.value)[0];
        if (line === undefined) {
          notify('재생할 폴백 대사를 한 줄 이상 입력하세요.', true);
          return;
        }
        runtime.replayDialogue(line);
        notify('편집한 폴백 대사를 현재 심문 무대에서 재생합니다.');
      }, 'dev-button dev-button--primary'),
    );
    field.append(input, actions);
    editor.append(details, field);
  };

  const renderEvidenceEditor = (item: Record<string, unknown>): void => {
    const evidenceId = text(item.evidence_id);
    editor.append(
      createElement('h3', undefined, `EVIDENCE · ${evidenceId}`),
      createElement('p', undefined, text(item.display_name_key, '표시 이름 키 없음')),
    );
    const observations = records(item.observations);
    if (observations.length === 0) {
      editor.append(createElement('div', 'dev-empty', 'Observation이 없습니다. 실시간 검사에서 오류로 표시됩니다.'));
      return;
    }
    observations.forEach((observation, index) => {
      const card = createElement('div', 'dev-card');
      const scopes = Array.isArray(observation.scopes) ? observation.scopes : [];
      card.append(
        createElement('h3', undefined, `Observation ${index + 1}`),
        createElement(
          'pre',
          'dev-code',
          JSON.stringify(
            {
              predicate: observation.predicate,
              scopes,
              confidence: observation.confidence,
              supports_claims: observation.supports_claims ?? observation.supportsClaimIds ?? [],
              contradicts_claims:
                observation.contradicts_claims ?? observation.contradictsClaimIds ?? [],
            },
            null,
            2,
          ),
        ),
      );
      if (scopes.length === 0) {
        card.append(createElement('div', 'dev-validation dev-validation--error', 'proof scope 누락'));
      }
      editor.append(card);
    });
  };

  const renderReactionEditor = (reactionKey: string): void => {
    editor.append(createElement('h3', undefined, `REACTION · ${reactionKey}`));
    const input = createElement('textarea');
    input.value = reactionLines(model, reactionKey).join('\n');
    input.setAttribute('aria-label', `${reactionKey} fallback lines`);
    input.addEventListener('input', () => {
      try {
        model = setReactionFallbackLines(model, reactionKey, linesFromEditor(input.value));
        renderValidation();
      } catch (error) {
        notify(errorMessage(error), true);
      }
    });
    editor.append(
      createElement('p', undefined, 'AI 응답 실패 시 사용할 결정론적 폴백 문장입니다.'),
      input,
      createButton('무대에서 재생', () => {
        const line = linesFromEditor(input.value)[0];
        if (line === undefined) {
          notify('재생할 반응 대사를 입력하세요.', true);
          return;
        }
        runtime.replayDialogue(line);
      }, 'dev-button dev-button--primary'),
    );
  };

  const renderEditor = (): void => {
    editor.replaceChildren();
    if (selectedId === undefined) {
      editor.append(createElement('div', 'dev-empty', '왼쪽 목록에서 편집할 항목을 선택하세요.'));
      return;
    }
    if (kind === 'claims') {
      const claim = claims().find((candidate) => candidate.claim_id === selectedId);
      if (claim !== undefined) renderClaimEditor(claim);
      return;
    }
    if (kind === 'evidence') {
      const item = evidence().find((candidate) => candidate.evidence_id === selectedId);
      if (item !== undefined) renderEvidenceEditor(item);
      return;
    }
    renderReactionEditor(selectedId);
  };

  const select = (id: string): void => {
    selectedId = id;
    renderList();
    renderEditor();
  };

  const renderList = (): void => {
    list.replaceChildren();
    const rows: readonly Readonly<{ id: string; summary: string }>[] =
      kind === 'claims'
        ? claims().map((claim) => ({
            id: text(claim.claim_id),
            summary: `${text(claim.facet)} · ${text(claim.canonical_meaning)}`,
          }))
        : kind === 'evidence'
          ? evidence().map((item) => ({
              id: text(item.evidence_id),
              summary: `${records(item.observations).length} observations · ${text(item.display_name_key)}`,
            }))
          : Object.keys(dialogueReactions(model)).map((reactionKey) => ({
              id: reactionKey,
              summary: `${reactionLines(model, reactionKey).length} fallback lines`,
            }));
    rows.forEach((row) => {
      const button = createElement('button', 'dev-list__item');
      button.type = 'button';
      button.ariaSelected = String(row.id === selectedId);
      button.append(document.createTextNode(row.id), createElement('span', undefined, row.summary));
      button.addEventListener('click', () => select(row.id));
      list.append(button);
    });
    if (kind === 'reactions') {
      const field = createElement('div', 'dev-field');
      const input = createElement('input');
      input.type = 'text';
      input.placeholder = 'reaction.key';
      input.setAttribute('aria-label', '새 ReactionKey');
      field.append(
        createElement('label', undefined, 'ReactionKey 추가'),
        input,
        createButton('추가', () => {
          const reactionKey = input.value.trim();
          if (reactionKey.length === 0) return;
          try {
            model = setReactionFallbackLines(model, reactionKey, ['새 폴백 대사']);
            select(reactionKey);
            renderValidation();
          } catch (error) {
            notify(errorMessage(error), true);
          }
        }),
      );
      list.append(field);
    }
    if (rows.length === 0) list.prepend(createElement('div', 'dev-empty', '로드된 항목이 없습니다.'));
  };

  const switchKind = (next: ContentKind): void => {
    kind = next;
    selectedId = undefined;
    renderTabs();
    renderList();
    renderEditor();
  };

  const renderTabs = (): void => {
    contentTabs.replaceChildren();
    const options: readonly Readonly<{ id: ContentKind; label: string }>[] = [
      { id: 'claims', label: `Claims ${claims().length}` },
      { id: 'evidence', label: `Evidence ${evidence().length}` },
      { id: 'reactions', label: `Reactions ${Object.keys(dialogueReactions(model)).length}` },
    ];
    options.forEach((option) => {
      const button = createButton(option.label, () => switchKind(option.id));
      button.ariaSelected = String(option.id === kind);
      contentTabs.append(button);
    });
  };

  renderTabs();
  renderValidation();
  renderList();
  renderEditor();
  return { view };
}
