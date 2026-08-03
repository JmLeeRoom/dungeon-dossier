import {
  createGameApplication,
  preloadRuntimeAssets,
  resolveAsset,
  runtimeAssetRegistry,
  type MountedGameApplication,
} from '../ui/core';
import {
  createInterrogationScreen,
  type InterrogationScreenController,
} from '../ui/screens/interrogation';
import { BalanceRepository, type BalanceDefinition } from '../content-io';
import type { FallbackCatalog } from '../ai';
import { toRenderableClaims } from '../dto';
import type { InterrogationScreenModel } from '../ui/screens/interrogation';
import { createPhase2Preview } from './createPhase2Preview';
import {
  createPhase4DialogueService,
  toComposureBand,
} from './createPhase4DialogueService';

function stableDialogueSeed(parts: readonly string[]): number {
  let seed = 2_166_136_261;
  for (const character of parts.join('|')) {
    seed ^= character.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16_777_619) >>> 0;
  }
  return seed;
}

async function loadPreverifiedCache(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function bootstrap(mount: HTMLElement): Promise<MountedGameApplication> {
  mount.dataset.assetCount = runtimeAssetRegistry.size.toString();
  try {
    await document.fonts.load('11px Galmuri11');
  } catch (error) {
    console.warn('Galmuri11 could not be preloaded; continuing with the browser fallback.', error);
  }
  const mounted = await createGameApplication(mount);
  await preloadRuntimeAssets();
  const fallback = runtimeAssetRegistry.get('placeholder/missing/fallback');
  const assets = {
    resolveUrl(key: string): string | undefined {
      if (fallback === undefined) {
        const exact = runtimeAssetRegistry.get(key);
        if (exact === undefined) console.warn(`Missing asset "${key}"; no fallback is installed.`);
        return exact?.url;
      }
      return resolveAsset(runtimeAssetRegistry, key, fallback).url;
    },
  };

  const balanceRepository = new BalanceRepository();
  await balanceRepository.reload();
  const preview = createPhase2Preview();
  const fallbackCatalog: FallbackCatalog = {
    statements: Object.fromEntries(
      preview.dto.statement.map((claim) => [
        claim.claimId,
        [
          {
            full_text: claim.text,
            tokens: [
              {
                token_id: `preview-${claim.facet.toLocaleLowerCase()}`,
                claim_ids: [claim.claimId],
                text: claim.text,
                span_start: 0,
                span_end: claim.text.length,
              },
            ],
          },
        ],
      ]),
    ),
    reactions: {},
  };
  const dialogueService = await createPhase4DialogueService({
    speakerProfile: {
      race: 'SLIME',
      personality: ['TIMID'],
      speech: 'POLITE_TREMBLING',
      forbidden_expressions: ['사실은', '거짓말'],
    },
    fallbackCatalog,
    forbiddenInformation: [
      'truth_relation',
      'proof_rules',
      'hypotheses',
      'exact_composure',
    ],
    allowedTimeHours: [17],
    preverifiedCacheFile: await loadPreverifiedCache(
      '/content/ai-cache/tutorial-slime-full-statement.json',
    ),
  });
  const runtime = {
    composure: preview.dto.resources.composure,
    coercion: preview.dto.resources.coercion,
    commandPoints: preview.dto.resources.commandPoints,
    stress: preview.stress,
    nodeId: 'P2_ARGUMENT',
    // The shipped static build is P0: presentation always has a complete
    // authored fallback path. Live AI can only be opted into from the dev UI.
    aiEnabled: false,
    qteAutoSuccess: false,
    flags: Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => [
        `F-${String(index + 1).padStart(2, '0')}`,
        false,
      ]),
    ) as Record<string, boolean>,
  };
  const availableNodes = ['P2_OPENING', 'P2_ARGUMENT', 'P2_CONFIRM'] as const;
  let interrogation: InterrogationScreenController;
  let recordDevJudgment: ((input: unknown, result: unknown) => void) | undefined;
  let destroyDevConsole = (): void => undefined;

  const currentModel = (): InterrogationScreenModel => ({
    ...preview,
    dto: {
      ...preview.dto,
      resources: {
        composure: runtime.composure,
        coercion: runtime.coercion,
        commandPoints: runtime.commandPoints,
      },
    },
    stress: runtime.stress,
  });

  const mountInterrogation = (): void => {
    const controller = createInterrogationScreen(
      currentModel(),
      {
        onSubmit(selection): void {
          recordDevJudgment?.(
            { source: 'P2_SUBMISSION', selection, nodeId: runtime.nodeId },
            // Presentation wording/provider metadata never enters JudgmentLog.
            // The same engine action therefore serializes identically with AI
            // enabled or disabled.
            { accepted: true },
          );
          const selectedClaim = toRenderableClaims(preview.dto).find(
            (claim) => claim.facet === selection.facet,
          );
          if (selectedClaim === undefined) {
            controller.useFallbackStatement('선택한 진술을 다시 확인하겠습니다.');
            return;
          }
          const request = {
            allowedClaims: [selectedClaim],
            reactionKey: 'preview.submission',
            missingScopes: [],
            seed: stableDialogueSeed([
              selection.cardId ?? '',
              selection.facet ?? '',
              ...selection.evidenceIds,
            ]),
          } as const;
          void dialogueService
            .renderReaction(request, {
              aiEnabled: runtime.aiEnabled,
              composureBand: toComposureBand(runtime.composure, preview.composureMax),
            })
            .then((line) => controller.useFallbackStatement(line))
            .catch(() => {
              // Valid pre-authored data makes this unreachable; retain a final
              // presentation-only guard so the game can never stall.
              controller.useFallbackStatement(selectedClaim.canonicalMeaning);
            });
        },
        onAdvance(): void {
          controller.finishStatement();
        },
        onSecureStatement(): void {
          controller.useFallbackStatement('진술 확보 조건을 확인했습니다. 사건 기록에 서명합니다.');
        },
      },
      { assets },
    );
    interrogation = controller;
    const update = (): void => controller.update(mounted.app.ticker.deltaMS);
    mounted.app.ticker.add(update);
    mounted.scenes.setScene({
      view: controller.view,
      onDestroy(): void {
        mounted.app.ticker.remove(update);
        controller.destroy();
      },
    });
  };
  mountInterrogation();

  if (import.meta.env.DEV) {
    const { mountDeveloperConsole } = await import('../dev');
    const devConsole = await mountDeveloperConsole({
      mount,
      balanceRepository,
      caseDirectory: 'tutorial',
      runtime: {
        getSnapshot() {
          return {
            ...runtime,
            flags: { ...runtime.flags },
          };
        },
        availableNodes() {
          return availableNodes;
        },
        setResource(key, value): void {
          runtime[key] = value;
          mountInterrogation();
        },
        jumpToNode(nodeId): void {
          if (!availableNodes.includes(nodeId as (typeof availableNodes)[number])) {
            throw new Error(`Unknown preview node: ${nodeId}`);
          }
          runtime.nodeId = nodeId;
          interrogation.useFallbackStatement(`개발자 노드 점프 · ${nodeId}`);
        },
        setAiEnabled(enabled): void {
          runtime.aiEnabled = enabled;
        },
        setQteAutoSuccess(enabled): void {
          runtime.qteAutoSuccess = enabled;
        },
        setFlag(flagId, enabled): void {
          runtime.flags[flagId] = enabled;
        },
        replayDialogue(text): void {
          interrogation.useFallbackStatement(text);
        },
        applyBalance(balance: BalanceDefinition): void {
          runtime.stress = Math.min(runtime.stress, balance.stress.max);
        },
      },
    });
    recordDevJudgment = (input, result): void => devConsole.recordJudgment(input, result);
    destroyDevConsole = (): void => devConsole.destroy();
  }

  return {
    app: mounted.app,
    scenes: mounted.scenes,
    destroy(): void {
      destroyDevConsole();
      mounted.destroy();
    },
  };
}
