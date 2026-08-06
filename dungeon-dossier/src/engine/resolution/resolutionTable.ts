import type {
  HypothesisResult,
  Independence,
  Relation,
  Relevance,
  ResolutionCode,
  Sufficiency,
} from './types';

type EvidenceIntent = 'CONTRADICT' | 'CONFIRM';
type Match<T> = T | '*';

export interface ResolutionTableInput {
  readonly intent: EvidenceIntent;
  readonly relevance: Relevance;
  readonly relation: Relation;
  readonly sufficiency: Sufficiency;
  readonly independence: Independence;
  readonly hypotheses: HypothesisResult;
}

export interface ResolutionTableRow {
  readonly intent: EvidenceIntent;
  readonly relevance: Match<Relevance>;
  readonly relation: Match<Relation>;
  readonly sufficiency: Match<Sufficiency>;
  readonly independence: Match<Independence>;
  readonly hypotheses: Match<HypothesisResult>;
  readonly code: ResolutionCode;
}

export const RESOLUTION_TABLE = [
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'SUFFICIENT', independence: 'MET', hypotheses: 'CLEARED',
    code: 'R_DIRECT_CONTRADICTION',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'SUFFICIENT', independence: 'MET', hypotheses: 'NOT_APPLICABLE',
    code: 'R_DIRECT_CONTRADICTION',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'SUFFICIENT', independence: 'UNMET', hypotheses: '*',
    code: 'R_INDIRECT_SUSPICION',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'SUFFICIENT', independence: 'MET', hypotheses: 'REMAINING',
    code: 'R_INDIRECT_SUSPICION',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'PROVISIONAL', independence: '*', hypotheses: '*',
    code: 'R_INDIRECT_SUSPICION',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'INSUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'PARTIAL', relation: 'CONTRADICTS',
    sufficiency: 'PROVISIONAL', independence: '*', hypotheses: '*',
    code: 'R_INDIRECT_SUSPICION',
  },
  {
    intent: 'CONTRADICT', relevance: 'PARTIAL', relation: 'CONTRADICTS',
    sufficiency: 'SUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_INDIRECT_SUSPICION',
  },
  {
    intent: 'CONTRADICT', relevance: 'PARTIAL', relation: 'CONTRADICTS',
    sufficiency: 'INSUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'PARTIAL', relation: 'AMBIGUOUS',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'PARTIAL', relation: 'NEUTRAL',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'PARTIAL', relation: 'SUPPORTS',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'SUPPORTS',
    sufficiency: 'SUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_TRUTH_ATTACKED',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'SUPPORTS',
    sufficiency: 'INSUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'SUPPORTS',
    sufficiency: 'PROVISIONAL', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'NEUTRAL',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'FULL', relation: 'AMBIGUOUS',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONTRADICT', relevance: 'NONE', relation: '*',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_IRRELEVANT_EVIDENCE',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'SUPPORTS',
    sufficiency: 'SUFFICIENT', independence: 'MET', hypotheses: '*',
    code: 'R_CONFIRM_LOCKED',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'SUPPORTS',
    sufficiency: 'SUFFICIENT', independence: 'UNMET', hypotheses: '*',
    code: 'R_CONFIRM_PROVISIONAL',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'SUPPORTS',
    sufficiency: 'PROVISIONAL', independence: '*', hypotheses: '*',
    code: 'R_CONFIRM_PROVISIONAL',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'SUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_CONFIRM_CONFLICT',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'SUPPORTS',
    sufficiency: 'INSUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'PROVISIONAL', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'CONTRADICTS',
    sufficiency: 'INSUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'NEUTRAL',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'FULL', relation: 'AMBIGUOUS',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'PARTIAL', relation: 'SUPPORTS',
    sufficiency: 'SUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_CONFIRM_PROVISIONAL',
  },
  {
    intent: 'CONFIRM', relevance: 'PARTIAL', relation: 'SUPPORTS',
    sufficiency: 'PROVISIONAL', independence: '*', hypotheses: '*',
    code: 'R_CONFIRM_PROVISIONAL',
  },
  {
    intent: 'CONFIRM', relevance: 'PARTIAL', relation: 'SUPPORTS',
    sufficiency: 'INSUFFICIENT', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'PARTIAL', relation: 'CONTRADICTS',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'PARTIAL', relation: 'AMBIGUOUS',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'PARTIAL', relation: 'NEUTRAL',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_INSUFFICIENT_GROUNDS',
  },
  {
    intent: 'CONFIRM', relevance: 'NONE', relation: '*',
    sufficiency: '*', independence: '*', hypotheses: '*',
    code: 'R_IRRELEVANT_EVIDENCE',
  },
] as const satisfies readonly ResolutionTableRow[];

function matches<T>(pattern: Match<T>, value: T): boolean {
  return pattern === '*' || pattern === value;
}

export function lookupResolutionCode(input: ResolutionTableInput): ResolutionCode {
  return lookupResolutionTableRow(input).code;
}

export function lookupResolutionTableRow(input: ResolutionTableInput): ResolutionTableRow {
  const row = RESOLUTION_TABLE.find(
    (candidate) =>
      candidate.intent === input.intent &&
      matches(candidate.relevance, input.relevance) &&
      matches(candidate.relation, input.relation) &&
      matches(candidate.sufficiency, input.sufficiency) &&
      matches(candidate.independence, input.independence) &&
      matches(candidate.hypotheses, input.hypotheses),
  );

  // A table miss must never crash a live encounter; the neutral fallback keeps
  // the submission legal while the completeness test keeps this branch cold.
  return row ?? {
    intent: input.intent,
    relevance: input.relevance,
    relation: input.relation,
    sufficiency: input.sufficiency,
    independence: input.independence,
    hypotheses: input.hypotheses,
    code: 'R_INSUFFICIENT_GROUNDS',
  };
}
