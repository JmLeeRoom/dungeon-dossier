import {
  CacheProvider,
  ClaudeApiProvider,
  DialoguePipelineRenderer,
  FallbackProvider,
  importPreverifiedDialogueCache,
  MemoryDialogueCache,
  MemoryGenerationLog,
  OutputValidator,
  RequestBuilder,
  SafeDialogueProvider,
  type ComposureBand,
  type FallbackCatalog,
  type GenerationLogSummary,
  type PresentationGroup,
  type SpeakerProfile,
} from '../ai';
import type { DialogueRequest } from '../dto';

export const PHASE4_DIALOGUE_CONFIG = Object.freeze({
  // [DRAFT] The design does not fix a timeout yet; keep it tunable here.
  timeoutMs: 2_500,
  promptVersion: 'phase4-v1',
  modelId: 'claude-proxy',
});

export interface Phase4DialogueServiceOptions {
  readonly speakerProfile: SpeakerProfile;
  readonly fallbackCatalog: FallbackCatalog;
  readonly presentationGroups?: readonly PresentationGroup[];
  readonly forbiddenInformation?: readonly string[];
  readonly allowedTimeHours?: readonly number[];
  readonly entityDictionary?: Readonly<Record<string, boolean>>;
  readonly preverifiedCacheFile?: unknown;
  readonly proxyEndpoint?: string;
}

export interface Phase4DialogueService {
  renderStatement(
    request: DialogueRequest,
    options: Readonly<{ aiEnabled: boolean; composureBand: ComposureBand }>,
  ): Promise<string>;
  renderReaction(
    request: DialogueRequest,
    options: Readonly<{ aiEnabled: boolean; composureBand: ComposureBand }>,
  ): Promise<string>;
  generationSummary(): GenerationLogSummary;
}

export function toComposureBand(
  composure: number,
  composureMax: number,
): ComposureBand {
  if (!Number.isFinite(composure) || !Number.isFinite(composureMax) || composureMax <= 0) {
    throw new RangeError('Composure band requires finite values and a positive maximum.');
  }
  const ratio = composure / composureMax;
  if (ratio > 0.75) return 'HIGH';
  if (ratio > 0.5) return 'MID';
  if (ratio > 0.25) return 'LOW';
  return 'CRITICAL';
}

/**
 * App composition boundary for P0 cache/fallback replay and optional dev AI.
 * No API key is representable: ClaudeApiProvider only receives a same-origin
 * proxy URL. Engine judgment data never enters this service.
 */
export async function createPhase4DialogueService(
  options: Phase4DialogueServiceOptions,
): Promise<Phase4DialogueService> {
  const memoryCache = new MemoryDialogueCache();
  if (options.preverifiedCacheFile !== undefined) {
    await importPreverifiedDialogueCache(options.preverifiedCacheFile, memoryCache);
  }
  const cache = new CacheProvider(memoryCache, {
    promptVersion: PHASE4_DIALOGUE_CONFIG.promptVersion,
    modelId: PHASE4_DIALOGUE_CONFIG.modelId,
  });
  const fallback = new FallbackProvider(options.fallbackCatalog);
  const validator = new OutputValidator({
    maxOutOfTokenCharacters: 80,
    styleSampleRate: 0,
    allowedTimeHours: options.allowedTimeHours ?? [],
    entityDictionary: options.entityDictionary ?? {},
  });
  const generationLog = new MemoryGenerationLog();
  const primary = new ClaudeApiProvider({
    endpoint: options.proxyEndpoint ?? '/api/dialogue',
  });
  const p0 = new SafeDialogueProvider({
    primary: null,
    cache,
    fallback,
    validator,
    log: generationLog,
    config: PHASE4_DIALOGUE_CONFIG,
  });
  const live = new SafeDialogueProvider({
    primary,
    cache,
    fallback,
    validator,
    log: generationLog,
    config: PHASE4_DIALOGUE_CONFIG,
  });

  const renderer = (
    aiEnabled: boolean,
    composureBand: ComposureBand,
  ): DialoguePipelineRenderer => {
    const requestBuilder = new RequestBuilder({
      speakerProfile: options.speakerProfile,
      presentationGroups: options.presentationGroups ?? [],
      forbiddenInformation: options.forbiddenInformation ?? [],
      composureBand,
    });
    return new DialoguePipelineRenderer(
      requestBuilder,
      import.meta.env.DEV && aiEnabled ? live : p0,
    );
  };

  const service: Phase4DialogueService = {
    renderStatement(request, renderOptions) {
      return renderer(
        renderOptions.aiEnabled,
        renderOptions.composureBand,
      ).renderStatement(request);
    },
    renderReaction(request, renderOptions) {
      return renderer(
        renderOptions.aiEnabled,
        renderOptions.composureBand,
      ).renderReaction(request);
    },
    generationSummary() {
      return generationLog.summary();
    },
  };
  return Object.freeze(service);
}
