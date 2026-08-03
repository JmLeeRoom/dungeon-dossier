import { Container, Graphics } from 'pixi.js';
import type { PublicDTO } from '../../../dto';
import { createPixelText } from '../../core/pixelText';
import { UI_PALETTE } from '../../widgets/theme';
import {
  dossierPageCount,
  queryDossierRows,
  toggleDossierSelection,
  type DossierEvidenceRow,
} from './model';

export interface DossierScreenOptions {
  readonly dto: PublicDTO;
  readonly selectedEvidenceIds: readonly string[];
  readonly evidenceCosts?: Readonly<Record<string, number>>;
  readonly onApply: (selectedEvidenceIds: readonly string[]) => void;
  readonly onClose: () => void;
}

export interface DossierScreenController {
  readonly view: Container;
  readonly selectedEvidenceIds: readonly string[];
}

function button(label: string, width: number, onPress: () => void): Container {
  const view = new Container();
  const plate = new Graphics()
    .rect(0, 0, width, 20)
    .fill(UI_PALETTE.panelLight)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 1 });
  const text = createPixelText(label, { fontSize: 8, fill: UI_PALETTE.paper });
  text.anchor.set(0.5);
  text.position.set(width / 2, 10);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  view.on('pointertap', onPress);
  view.addChild(plate, text);
  return view;
}

function createEvidenceRow(
  row: DossierEvidenceRow,
  width: number,
  onToggle: () => void,
): Container {
  const view = new Container();
  const plate = new Graphics()
    .rect(0, 0, width, 76)
    .fill(row.selected ? 0x34423c : UI_PALETTE.panel)
    .stroke({ color: row.selected ? UI_PALETTE.cyan : UI_PALETTE.panelLight, width: 1 });
  const check = new Graphics()
    .rect(8, 8, 15, 15)
    .fill(row.selected ? UI_PALETTE.cyan : UI_PALETTE.deepInk)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 1 });
  const checkMark = createPixelText(row.selected ? '✓' : '', {
    fontSize: 10,
    fill: UI_PALETTE.ink,
  });
  checkMark.position.set(10, 8);
  const title = createPixelText(`${row.title}  [${row.grade}]`, {
    fontSize: 10,
    fill: UI_PALETTE.paper,
  });
  title.position.set(31, 7);
  const cost = createPixelText(`첨부 비용 ${row.attachmentCost} CP`, {
    fontSize: 8,
    fill: UI_PALETTE.amber,
  });
  cost.anchor.set(1, 0);
  cost.position.set(width - 8, 8);
  const scopes = createPixelText(`입증 범위  ${row.scopeLabels.join(' · ') || '없음'}`, {
    fontSize: 8,
    fill: UI_PALETTE.cyan,
    wordWrap: true,
    wordWrapWidth: width - 44,
  });
  scopes.position.set(31, 28);
  const exclusions = createPixelText(
    `입증하지 못하는 것  ${row.notProvenKeys.join(' · ') || '없음'}`,
    {
      fontSize: 8,
      fill: UI_PALETTE.parchmentDark,
      wordWrap: true,
      wordWrapWidth: width - 44,
      lineHeight: 10,
    },
  );
  exclusions.position.set(31, 48);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  view.on('pointertap', onToggle);
  view.addChild(plate, check, checkMark, title, cost, scopes, exclusions);
  return view;
}

export function createDossierScreen(options: DossierScreenOptions): DossierScreenController {
  const view = new Container();
  view.eventMode = 'static';
  const dimmer = new Graphics().rect(0, 0, 640, 400).fill({ color: 0x000000, alpha: 0.82 });
  const panel = new Graphics()
    .rect(28, 22, 584, 356)
    .fill(UI_PALETTE.deepInk)
    .stroke({ color: UI_PALETTE.parchmentDark, width: 2 });
  const title = createPixelText('사건 조서 / EVIDENCE DOSSIER', {
    fontSize: 14,
    fill: UI_PALETTE.paper,
  });
  title.position.set(43, 35);
  const freeReview = createPixelText('FREE REVIEW · 열람 비용 0 · 판정 예측 비공개', {
    fontSize: 8,
    fill: UI_PALETTE.cyan,
  });
  freeReview.position.set(43, 56);
  view.addChild(dimmer, panel, title, freeReview);

  let selectedIds = [...options.selectedEvidenceIds];
  let page = 0;
  const pageSize = 3;
  const rowsLayer = new Container();
  rowsLayer.position.set(42, 80);
  view.addChild(rowsLayer);

  const pageLabel = createPixelText('', { fontSize: 8, fill: UI_PALETTE.muted });
  pageLabel.anchor.set(0.5);
  pageLabel.position.set(320, 352);
  view.addChild(pageLabel);

  const renderRows = (): void => {
    rowsLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    const rows = queryDossierRows({
      dto: options.dto,
      selectedEvidenceIds: selectedIds,
      ...(options.evidenceCosts === undefined ? {} : { evidenceCosts: options.evidenceCosts }),
    });
    const pageCount = dossierPageCount(rows.length, pageSize);
    page = Math.min(pageCount - 1, Math.max(0, page));
    const visibleRows = rows.slice(page * pageSize, page * pageSize + pageSize);
    visibleRows.forEach((row, index) => {
      const rowView = createEvidenceRow(row, 556, () => {
        selectedIds = [...toggleDossierSelection(selectedIds, row.evidenceId)];
        renderRows();
      });
      rowView.position.set(0, index * 82);
      rowsLayer.addChild(rowView);
    });
    if (visibleRows.length === 0) {
      const empty = createPixelText('획득한 증거가 없습니다.', {
        fontSize: 11,
        fill: UI_PALETTE.muted,
      });
      empty.position.set(174, 110);
      rowsLayer.addChild(empty);
    }
    pageLabel.text = `${page + 1} / ${pageCount}  ·  첨부 ${selectedIds.length}/3`;
  };

  const previous = button('◀', 32, () => {
    page -= 1;
    renderRows();
  });
  previous.position.set(249, 342);
  const next = button('▶', 32, () => {
    page += 1;
    renderRows();
  });
  next.position.set(359, 342);
  const close = button('닫기', 56, options.onClose);
  close.position.set(43, 342);
  const apply = button('첨부 적용', 78, () => options.onApply([...selectedIds]));
  apply.position.set(519, 342);
  view.addChild(previous, next, close, apply);
  renderRows();

  return {
    view,
    get selectedEvidenceIds(): readonly string[] {
      return selectedIds;
    },
  };
}
