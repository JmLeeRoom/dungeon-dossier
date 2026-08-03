import {
  CaseRepository,
  FallbackRepository,
  type BalanceRepository,
} from '../../content-io';
import { createContentEditorModel } from '../content';
import { createBalancePanel } from './balancePanel';
import { createContentPanel } from './contentPanel';
import { createButton, createElement, errorMessage, type DevPanelController } from './dom';
import { createLogPanel } from './logPanel';
import type { DeveloperRuntimeBridge } from './model';
import { createQaPanel } from './qaPanel';
import { createRuntimePanel } from './runtimePanel';

export interface DeveloperConsoleOptions {
  readonly mount: HTMLElement;
  readonly balanceRepository: BalanceRepository;
  readonly runtime: DeveloperRuntimeBridge;
  readonly caseDirectory?: string;
}

export interface DeveloperConsoleController {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
  recordJudgment(input: unknown, result: unknown): void;
  destroy(): void;
}

interface TabDefinition {
  readonly id: 'balance' | 'content' | 'qa' | 'runtime' | 'logs';
  readonly label: string;
}

const TABS: readonly TabDefinition[] = [
  { id: 'balance', label: '밸런스 튜너' },
  { id: 'content', label: '사건 & 대사' },
  { id: 'qa', label: '12 QA 재생' },
  { id: 'runtime', label: '런타임 제어' },
  { id: 'logs', label: '판정 로그' },
];

export async function mountDeveloperConsole(
  options: DeveloperConsoleOptions,
): Promise<DeveloperConsoleController> {
  const caseDirectory = options.caseDirectory ?? 'tutorial';
  const loadErrors: string[] = [];
  const caseRepository = new CaseRepository();
  const fallbackRepository = new FallbackRepository();

  const [caseData, dialogueData] = await Promise.all([
    caseRepository.load(caseDirectory).catch((error: unknown) => {
      loadErrors.push(`case.json: ${errorMessage(error)}`);
      return undefined;
    }),
    fallbackRepository.load(caseDirectory).catch((error: unknown) => {
      loadErrors.push(`dialogue.json: ${errorMessage(error)}`);
      return undefined;
    }),
  ]);
  const embeddedDialogue =
    typeof caseData === 'object' && caseData !== null && 'dialogue' in caseData
      ? caseData.dialogue
      : {};
  const editorModel = createContentEditorModel(
    caseData ?? {},
    dialogueData ?? embeddedDialogue,
  );

  const host = createElement('div', 'dev-console-host');
  host.hidden = true;
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', '개발자 콘솔');
  const shell = createElement('div', 'dev-console');
  const header = createElement('header', 'dev-console__header');
  const signal = createElement('span', 'dev-console__signal');
  signal.setAttribute('aria-hidden', 'true');
  const title = createElement('div', 'dev-console__title');
  title.append(
    createElement('strong', undefined, 'DUNGEON DOSSIER · LIVE CONSOLE'),
    createElement('span', undefined, 'DEV BUILD / BACKTICK TO TOGGLE / RUNTIME DATA FETCHED'),
  );
  const headerStatus = createElement(
    'span',
    'dev-console__header-status',
    loadErrors.length === 0 ? `CASE ${caseDirectory} · READY` : `LOAD WARN ${loadErrors.length}`,
  );
  const close = createButton('×', () => setOpen(false), 'dev-button dev-console__close');
  close.setAttribute('aria-label', '개발자 콘솔 닫기');
  header.append(signal, title, headerStatus, close);

  const body = createElement('div', 'dev-console__body');
  const nav = createElement('nav', 'dev-console__nav');
  nav.setAttribute('aria-label', '개발자 콘솔 패널');
  nav.append(createElement('div', 'dev-console__nav-label', 'CONSOLE MODULES'));
  const main = createElement('main', 'dev-console__main');
  const toast = createElement('div', 'dev-toast');
  toast.hidden = true;
  let toastTimer: number | undefined;
  const notify = (message: string, isError = false): void => {
    toast.textContent = message;
    toast.className = `dev-toast${isError ? ' dev-toast--error' : ''}`;
    toast.hidden = false;
    if (toastTimer !== undefined) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
      toastTimer = undefined;
    }, 3200);
  };

  const logPanel = createLogPanel();
  const panels = new Map<TabDefinition['id'], DevPanelController>([
    ['balance', createBalancePanel(options.balanceRepository, options.runtime, notify)],
    ['content', createContentPanel(editorModel, options.runtime, notify)],
    [
      'qa',
      createQaPanel(
        options.runtime,
        (input, result) => logPanel.record(input, result),
        notify,
      ),
    ],
    ['runtime', createRuntimePanel(options.runtime, caseData ?? {}, notify)],
    ['logs', logPanel],
  ]);
  panels.forEach((panel) => {
    panel.view.hidden = true;
    main.append(panel.view);
  });

  let activeTab: TabDefinition['id'] = 'balance';
  const tabButtons = new Map<TabDefinition['id'], HTMLButtonElement>();
  const selectTab = (tab: TabDefinition['id']): void => {
    activeTab = tab;
    panels.forEach((panel, id) => {
      panel.view.hidden = id !== activeTab;
      if (id === activeTab) panel.refresh?.();
    });
    tabButtons.forEach((button, id) => {
      button.ariaSelected = String(id === activeTab);
    });
  };
  TABS.forEach((tab) => {
    const button = createButton(tab.label, () => selectTab(tab.id), 'dev-console__tab');
    button.setAttribute('role', 'tab');
    tabButtons.set(tab.id, button);
    nav.append(button);
  });
  nav.append(createElement('p', 'dev-console__hint', '릴리스 번들에는 이 콘솔과 truth overlay 코드가 포함되지 않습니다.'));

  body.append(nav, main);
  shell.append(header, body);
  host.append(shell, toast);
  options.mount.append(host);
  selectTab(activeTab);
  if (loadErrors.length > 0) notify(loadErrors.join('\n'), true);

  let open = false;
  let priorFocus: HTMLElement | null = null;
  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    host.hidden = !open;
    if (open) {
      priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panels.get(activeTab)?.refresh?.();
      close.focus();
    } else {
      priorFocus?.focus();
      priorFocus = null;
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== '`') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
  };
  window.addEventListener('keydown', onKeyDown, true);

  return {
    get isOpen(): boolean {
      return open;
    },
    setOpen,
    toggle(): void {
      setOpen(!open);
    },
    recordJudgment(input, result): void {
      logPanel.record(input, result);
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown, true);
      if (toastTimer !== undefined) window.clearTimeout(toastTimer);
      panels.forEach((panel) => panel.destroy?.());
      host.remove();
    },
  };
}
