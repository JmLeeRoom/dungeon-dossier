import type { EvidenceView, PublicDTO } from '../../../dto';
import { proofScopeLabel } from '../../widgets/theme';

export interface DossierEvidenceRow {
  readonly evidenceId: string;
  readonly title: string;
  readonly grade: EvidenceView['grade'];
  readonly scopeLabels: readonly string[];
  readonly notProvenKeys: readonly string[];
  readonly attachmentCost: number;
  readonly selected: boolean;
}

export interface DossierQuery {
  readonly dto: PublicDTO;
  readonly selectedEvidenceIds: readonly string[];
  readonly evidenceCosts?: Readonly<Record<string, number>>;
}

/** Pure FREE_REVIEW projection: it cannot call or mutate the engine. */
export function queryDossierRows(query: DossierQuery): readonly DossierEvidenceRow[] {
  const selected = new Set(query.selectedEvidenceIds);
  return query.dto.evidence.map((evidence) => ({
    evidenceId: evidence.evidenceId,
    title: evidence.displayName,
    grade: evidence.grade,
    scopeLabels: evidence.scopes.map(proofScopeLabel),
    notProvenKeys: [...evidence.notProvenKeys],
    attachmentCost: Math.max(0, query.evidenceCosts?.[evidence.evidenceId] ?? 0),
    selected: selected.has(evidence.evidenceId),
  }));
}

export function toggleDossierSelection(
  selectedEvidenceIds: readonly string[],
  evidenceId: string,
  maximumAttachments = 3,
): readonly string[] {
  const selected = new Set(selectedEvidenceIds);
  if (selected.delete(evidenceId)) return [...selected];
  if (selected.size >= maximumAttachments) return [...selected];
  selected.add(evidenceId);
  return [...selected];
}

export function dossierPageCount(rowCount: number, pageSize = 3): number {
  return Math.max(1, Math.ceil(Math.max(0, rowCount) / Math.max(1, pageSize)));
}
