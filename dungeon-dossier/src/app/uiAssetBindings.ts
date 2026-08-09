import type { SuspectAssetSet } from '../ui/widgets/suspectPortraitWidget';
import { requireAssetPlacement } from '../ui/core/placementRegistry';

/**
 * Every place a game-domain identifier chooses a picture.
 *
 * These tables are explicit on purpose. Nothing here is derived from array
 * order, a modulo, a Korean display name, or the folder a file happens to sit
 * in: those all produce a mapping that looks right until content is reordered.
 * The engine and the public DTO never carry an asset key; the app layer joins
 * the two and hands the UI a finished model.
 */

/* -------------------------------------------------------------------------- */
/* Suspects                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Approved character aliases, keyed by the case file's `portrait_asset_name`.
 *
 * Only characters the art delivery names unambiguously appear here. `bensi` and
 * `kimyongsa` ship as PNGs but no approval records which authored suspect they
 * depict, and guessing from filename similarity would put the wrong face on a
 * scripted interrogation — so they stay out until that decision exists.
 */
export const SUSPECT_ASSET_SETS: Readonly<Record<string, SuspectAssetSet>> = {
  물컹이: {
    base: 'idle/mulkung/base',
    upset: 'idle/mulkung/upset',
    lose: 'idle/mulkung/lose',
    stateMode: 'replace',
  },
  미노타우로스: {
    base: 'idle/minota/base',
    upset: 'idle/minota/upset',
    lose: 'idle/minota/lose',
    stateMode: 'replace',
  },
  고블린: {
    base: 'idle/goblin/base',
    upset: 'idle/goblin/upset',
    lose: 'idle/goblin/lose',
    stateMode: 'replace',
  },
  서큐버스: {
    base: 'idle/succuba/base',
    upset: 'idle/succuba/upset',
    lose: 'idle/succuba/lose',
    stateMode: 'replace',
  },
};

/**
 * Authored characters with no approved production art. They keep their
 * generated placeholder sheets — which are difference layers, hence `overlay` —
 * and are listed rather than silently defaulted so the gap stays visible.
 */
export const SUSPECTS_AWAITING_ART: readonly string[] = [
  '하피',
  '오크',
  '드워프',
  '사이클롭스',
  '타락한_용사',
  '켄타우로스',
];

/** The intern partner's two standing frames. */
export const PARTNER_ASSET_SET: SuspectAssetSet = {
  base: requireAssetPlacement('partner-base').assetKey,
  upset: requireAssetPlacement('partner-used').assetKey,
  lose: requireAssetPlacement('partner-used').assetKey,
  stateMode: 'replace',
};

export const PARTNER_USED_ASSET_KEY = 'idle/coffee/used';

/**
 * Legacy placeholder keys for a character with no approved art. The generated
 * sheets are authored as `base` plus a difference layer, so they stay in
 * `overlay` mode.
 */
export function legacySuspectAssetSet(portraitName: string): SuspectAssetSet {
  return {
    base: `portrait/${portraitName}/base`,
    upset: `portrait/${portraitName}/upset`,
    lose: `portrait/${portraitName}/lose`,
    stateMode: 'overlay',
  };
}

export function suspectAssetSet(portraitName: string | undefined): SuspectAssetSet | undefined {
  if (portraitName === undefined) return undefined;
  return SUSPECT_ASSET_SETS[portraitName] ?? legacySuspectAssetSet(portraitName);
}

/* -------------------------------------------------------------------------- */
/* Backgrounds                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Three cases author three tinted interrogation rooms; the delivery contains
 * one. They collapse onto it rather than keeping two visual languages in the
 * same scene — the tint carried no gameplay meaning.
 */
export const INTERROGATION_BACKGROUND_ASSET_KEY =
  requireAssetPlacement('bg-room').assetKey;
export const INTERROGATION_DESK_ASSET_KEY =
  requireAssetPlacement('fg-desk').assetKey;

export const LEGACY_BACKGROUND_REBINDINGS: Readonly<Record<string, string>> = {
  '배경/심문실/시안': INTERROGATION_BACKGROUND_ASSET_KEY,
  '배경/심문실/세피아': INTERROGATION_BACKGROUND_ASSET_KEY,
  '배경/심문실/마젠타': INTERROGATION_BACKGROUND_ASSET_KEY,
};

export function interrogationBackgroundAssetKey(authoredKey: string | undefined): string {
  if (authoredKey === undefined) return INTERROGATION_BACKGROUND_ASSET_KEY;
  return LEGACY_BACKGROUND_REBINDINGS[authoredKey] ?? authoredKey;
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

export const CARD_BASE_ASSET_KEY = requireAssetPlacement('card-base').assetKey;

/**
 * Card id to illustration. Six illustrations serve fourteen cards, so the
 * mapping is many-to-one and written out in full: `illust00` is the detective
 * leading a question, `01` a sealed file, `02` a contradiction, `03` annotated
 * cross-referenced documents, `04` a raised weapon.
 *
 * `card_recover_*` and `card_special_notice` are absent deliberately. Nothing in
 * the delivery depicts steadying the room or reading out procedure, and
 * `illust05` — a phone full of abuse — is the obstruction plate, not a recovery
 * one. Those three keep their generated illustration until art exists.
 */
export const CARD_ILLUSTRATION_ASSET_KEYS: Readonly<Record<string, string>> = {
  card_query_who: 'ui/card/illust00',
  card_query_when: 'ui/card/illust00',
  card_clarify_basic: 'ui/card/illust00',
  card_clarify_deep: 'ui/card/illust00',
  card_confirm_basic: 'ui/card/illust01',
  card_confirm_careful: 'ui/card/illust01',
  card_commit_clip: 'ui/card/illust01',
  card_contradict_basic: 'ui/card/illust02',
  card_contradict_precise: 'ui/card/illust02',
  card_forensic: 'ui/card/illust03',
  card_pressure: 'ui/card/illust04',
};

export const CARDS_AWAITING_ART: readonly string[] = [
  'card_recover_breathe',
  'card_recover_pace',
  'card_special_notice',
];

/** The obstruction plate, shown in place of the illustration on a locked card. */
export const CARD_LOCKED_ILLUSTRATION_ASSET_KEY = 'ui/card/illust05';
export const CARD_LOCK_OVERLAY_ASSET_KEY = 'ui/debuff/kiss';

/**
 * Attachment tokens to overlays. `BLUE`/`RED` are the card's own attribute
 * seals; the six facet tokens all share the post-it; `CLIP` is the commit clip.
 */
export const CARD_ATTACHMENT_ASSET_KEYS: Readonly<Record<string, string>> = {
  BLUE: 'ui/card_stamp/logic',
  RED: 'ui/card_stamp/pushy',
  WHO: 'ui/card/post',
  WHEN: 'ui/card/post',
  WHERE: 'ui/card/post',
  WHAT: 'ui/card/post',
  HOW: 'ui/card/post',
  WHY: 'ui/card/post',
  CLIP: 'ui/card/pushy',
};

/* -------------------------------------------------------------------------- */
/* Evidence                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * All twenty-four authored evidence ids against the six polaroids, by what the
 * exhibit physically is: `00` a physical trace, `01` a person or photograph,
 * `02` a log or register, `03` the tutorial's vending receipt, `04` the episode
 * one ledgers, `05` a schematic or timing plan.
 */
export const EVIDENCE_ASSET_KEYS: Readonly<Record<string, string>> = {
  ev_tutorial_cabinet_wingprint: 'ui/card/evidence00',
  ev_tutorial_handle_forensics: 'ui/card/evidence00',
  ev_tutorial_corridor_photo: 'ui/card/evidence01',
  ev_tutorial_witness_note: 'ui/card/evidence01',
  ev_tutorial_roster: 'ui/card/evidence02',
  ev_tutorial_gate_log: 'ui/card/evidence02',
  ev_tutorial_locker_inventory: 'ui/card/evidence02',
  ev_tutorial_receipt: 'ui/card/evidence03',

  ev_ep001_seal_residue: 'ui/card/evidence00',
  ev_ep001_commission_note: 'ui/card/evidence01',
  ev_ep001_bell_access_log: 'ui/card/evidence02',
  ev_ep001_west_gate_log: 'ui/card/evidence02',
  ev_ep001_reception_register: 'ui/card/evidence02',
  ev_ep001_audit_trail: 'ui/card/evidence04',
  ev_ep001_cargo_manifest: 'ui/card/evidence04',
  ev_ep001_orc_backup_bundle: 'ui/card/evidence04',

  ev_ep004_wrench_imprint: 'ui/card/evidence00',
  ev_ep004_audio_cache: 'ui/card/evidence00',
  ev_ep004_corridor_lens: 'ui/card/evidence01',
  ev_ep004_vip_ticket_trace: 'ui/card/evidence02',
  ev_ep004_diversion_contract: 'ui/card/evidence02',
  ev_ep004_heat_clock: 'ui/card/evidence05',
  ev_ep004_platform_manifest: 'ui/card/evidence05',
  ev_ep004_signal_switch_log: 'ui/card/evidence05',
};

/* -------------------------------------------------------------------------- */
/* HUD, tags, board and results                                                */
/* -------------------------------------------------------------------------- */

export const HUD_ICON_ASSET_KEYS = {
  composure: requireAssetPlacement('icon-composure').assetKey,
  coercion: requireAssetPlacement('icon-coercion').assetKey,
} as const;

/** The detective and the intern, as pinned file photographs. */
export const DETECTIVE_PHOTO_ASSET_KEY = 'ui/photo/teahoon';
/**
 * The intern is the paper-cup slime, which is the same character the board
 * files under `mulkung`. One photograph therefore serves both the partner card
 * and the slime suspect's board marker.
 */
export const PARTNER_PHOTO_ASSET_KEY = 'ui/photo/mulkung';

export const BOARD_ASSET_KEYS = {
  background: 'bg/event/crazyboard',
  veiledMarker: 'ui/board/event',
  pin: 'ui/pin/00',
} as const;

/** Board photographs for characters the delivery names. */
export const BOARD_PHOTO_ASSET_KEYS: Readonly<Record<string, string>> = {
  물컹이: 'ui/photo/mulkung',
  미노타우로스: 'ui/photo/minota',
  고블린: 'ui/photo/goblin',
  서큐버스: 'ui/photo/succuba',
};

/**
 * Encounter id to the photograph pinned on its board card. Keyed by encounter
 * rather than by character so an episode that reuses a face still states which
 * node it belongs to — and so a VEILED slot has nothing to look up.
 */
export const BOARD_NODE_PHOTO_ASSET_KEYS: Readonly<Record<string, string>> = {
  enc_tutorial_slime: 'ui/photo/mulkung',
  enc_tutorial_minotaur: 'ui/photo/minota',
  enc_ep001_goblin: 'ui/photo/goblin',
  enc_ep001_succubus: 'ui/photo/succuba',
};

export function boardNodePhotoAssetKey(encounterRef: string): string | undefined {
  return BOARD_NODE_PHOTO_ASSET_KEYS[encounterRef];
}

export const RESULT_ASSET_KEYS = {
  clear: 'ui/game/clear',
  fail: 'ui/game/fail',
} as const;

export const EVENT_BACKGROUND_ASSET_KEYS = {
  rest: 'bg/event/rest',
  safe: 'bg/event/safe',
  phone: 'bg/event/phone',
  town: 'bg/event/town',
  dead: 'bg/event/dead',
} as const;

export const EVENT_OVERLAY_ASSET_KEYS = {
  post: 'bg/event/post',
  stamp: 'bg/event/stamp',
} as const;

export const CUTSCENE_SCENE_ASSET_KEYS = [
  'bg/event/scene0',
  'bg/event/scene1',
  'bg/event/scene2',
] as const;

export interface EventDecorationBinding {
  readonly assetKey: string;
  /** Logical 640x400 stage coordinates. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EventArtBinding {
  readonly backgroundAssetKey: string;
  readonly decoration?: EventDecorationBinding;
}

/**
 * Non-combat content id to authored scene art. These are deliberately explicit:
 * pattern letters are mechanics, not locations, so deriving a background from
 * `A`..`F` would put the same room behind unrelated events.
 */
export const EVENT_ART_BINDINGS: Readonly<Record<string, EventArtBinding>> = {
  event_tutorial_choice: {
    backgroundAssetKey: EVENT_BACKGROUND_ASSET_KEYS.rest,
    decoration: {
      assetKey: EVENT_OVERLAY_ASSET_KEYS.post,
      x: 395,
      y: 176,
      width: 181,
      height: 156,
    },
  },
  event_tutorial_placement: {
    backgroundAssetKey: EVENT_BACKGROUND_ASSET_KEYS.phone,
    decoration: {
      assetKey: EVENT_OVERLAY_ASSET_KEYS.stamp,
      x: 395,
      y: 176,
      width: 181,
      height: 156,
    },
  },
  event_tutorial_investigation: {
    backgroundAssetKey: EVENT_BACKGROUND_ASSET_KEYS.rest,
  },
  event_ep001_forensic_sweep: {
    backgroundAssetKey: EVENT_BACKGROUND_ASSET_KEYS.phone,
  },
  event_ep001_warehouse: {
    backgroundAssetKey: EVENT_BACKGROUND_ASSET_KEYS.safe,
  },
  event_ep004_machine_room: {
    backgroundAssetKey: EVENT_BACKGROUND_ASSET_KEYS.safe,
    decoration: {
      assetKey: EVENT_OVERLAY_ASSET_KEYS.stamp,
      x: 395,
      y: 176,
      width: 181,
      height: 156,
    },
  },
  event_ep004_broker_canvass: {
    backgroundAssetKey: EVENT_BACKGROUND_ASSET_KEYS.town,
    decoration: {
      assetKey: EVENT_OVERLAY_ASSET_KEYS.post,
      x: 395,
      y: 176,
      width: 181,
      height: 156,
    },
  },
};

export function eventArtBinding(eventId: string): EventArtBinding | undefined {
  return EVENT_ART_BINDINGS[eventId];
}

export function eventPresentationAssetKeys(eventId: string): readonly string[] {
  const binding = eventArtBinding(eventId);
  if (binding === undefined) return [];
  return binding.decoration === undefined
    ? [binding.backgroundAssetKey]
    : [binding.backgroundAssetKey, binding.decoration.assetKey];
}

/** Existing authored portrait keys that have approved assets in this delivery. */
export const CUTSCENE_PORTRAIT_ASSET_REBINDINGS: Readonly<Record<string, string>> = {
  'portrait/김태훈/base': DETECTIVE_PHOTO_ASSET_KEY,
  'portrait/김_인턴/base': PARTNER_ASSET_SET.base,
};

export function cutsceneBackgroundAssetKey(
  _beatId: string,
  authoredKey: string | undefined,
): string | undefined {
  // `scene0`..`scene2` are delivered as generic event plates. Neither the
  // naming workbook nor content metadata approves a beat-to-plate mapping, so
  // the runtime must preserve the authored key instead of inferring one from
  // episode or beat order. Add an explicit table here only after content signs
  // off that 1:1 mapping.
  return authoredKey;
}

export function cutscenePortraitAssetKey(authoredKey: string): string {
  return CUTSCENE_PORTRAIT_ASSET_REBINDINGS[authoredKey] ?? authoredKey;
}

/**
 * Every key these tables can produce, for the boot-time completeness check and
 * for the route preloads. Anything missing from the catalog is a wiring error,
 * not a missing decoration.
 */
export function allBoundAssetKeys(): readonly string[] {
  return [
    ...new Set([
      ...Object.values(SUSPECT_ASSET_SETS).flatMap((set) =>
        [set.base, set.upset, set.lose].filter((key): key is string => key !== undefined),
      ),
      PARTNER_ASSET_SET.base,
      PARTNER_USED_ASSET_KEY,
      INTERROGATION_BACKGROUND_ASSET_KEY,
      INTERROGATION_DESK_ASSET_KEY,
      CARD_BASE_ASSET_KEY,
      CARD_LOCKED_ILLUSTRATION_ASSET_KEY,
      CARD_LOCK_OVERLAY_ASSET_KEY,
      ...Object.values(CARD_ILLUSTRATION_ASSET_KEYS),
      ...Object.values(CARD_ATTACHMENT_ASSET_KEYS),
      ...Object.values(EVIDENCE_ASSET_KEYS),
      ...Object.values(HUD_ICON_ASSET_KEYS),
      DETECTIVE_PHOTO_ASSET_KEY,
      PARTNER_PHOTO_ASSET_KEY,
      ...Object.values(BOARD_ASSET_KEYS),
      ...Object.values(BOARD_PHOTO_ASSET_KEYS),
      ...Object.values(BOARD_NODE_PHOTO_ASSET_KEYS),
      ...Object.values(RESULT_ASSET_KEYS),
      ...Object.values(EVENT_BACKGROUND_ASSET_KEYS),
      ...Object.values(EVENT_OVERLAY_ASSET_KEYS),
      ...CUTSCENE_SCENE_ASSET_KEYS,
    ]),
  ];
}
