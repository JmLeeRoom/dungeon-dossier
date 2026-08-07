import type { AudioDefinition, AudioChannel } from './AudioPlayer';

export const SFX_IDS = [
  'typewriter',
  'typewriter_return',
  'stamp',
  'card_snap',
  'paper_flip',
  'shield_break',
  'door_knock',
  'knock_triple',
  'qte_success',
  'qte_fail',
  'shuffle_bubble',
  'shredder',
  'crt_switch',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

export const BGM_IDS = [
  'bgm_interrogation',
  'bgm_boss',
  'bgm_ambient',
  'bgm_ending',
] as const;
export type BgmId = (typeof BGM_IDS)[number];

export const STINGER_IDS = [
  'sting_confession',
  'sting_arrest',
  'sting_collapse',
  'sting_gavel',
  'sting_clock',
  'sting_file_close',
] as const;
export type StingerId = (typeof STINGER_IDS)[number];

export const SOUND_IDS = [...SFX_IDS, ...BGM_IDS, ...STINGER_IDS] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export interface LogicalSoundDefinition {
  readonly id: SoundId;
  readonly channel: AudioChannel;
  /** Exact import.meta.glob key expected for this logical sound. */
  readonly modulePath: string;
  readonly loop: boolean;
}

function sfx(id: SfxId): LogicalSoundDefinition {
  return { id, channel: 'SFX', modulePath: `../../assets/sfx/${id}.ogg`, loop: false };
}

function bgm(id: BgmId): LogicalSoundDefinition {
  return { id, channel: 'BGM', modulePath: `../../assets/bgm/${id}.ogg`, loop: true };
}

function stinger(id: StingerId): LogicalSoundDefinition {
  return { id, channel: 'STINGER', modulePath: `../../assets/bgm/${id}.ogg`, loop: false };
}

export const SOUND_REGISTRY = {
  typewriter: sfx('typewriter'),
  typewriter_return: sfx('typewriter_return'),
  stamp: sfx('stamp'),
  card_snap: sfx('card_snap'),
  paper_flip: sfx('paper_flip'),
  shield_break: sfx('shield_break'),
  door_knock: sfx('door_knock'),
  knock_triple: sfx('knock_triple'),
  qte_success: sfx('qte_success'),
  qte_fail: sfx('qte_fail'),
  shuffle_bubble: sfx('shuffle_bubble'),
  shredder: sfx('shredder'),
  crt_switch: sfx('crt_switch'),
  bgm_interrogation: bgm('bgm_interrogation'),
  bgm_boss: bgm('bgm_boss'),
  bgm_ambient: bgm('bgm_ambient'),
  bgm_ending: bgm('bgm_ending'),
  sting_confession: stinger('sting_confession'),
  sting_arrest: stinger('sting_arrest'),
  sting_collapse: stinger('sting_collapse'),
  sting_gavel: stinger('sting_gavel'),
  sting_clock: stinger('sting_clock'),
  sting_file_close: stinger('sting_file_close'),
} satisfies Readonly<Record<SoundId, LogicalSoundDefinition>>;

const discoveredOggSources = import.meta.glob<string>(
  '../../assets/{sfx,bgm}/**/*.ogg',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
);

const OGG_SOURCE_PATTERN = /[.]ogg(?:$|[?#])/iu;

/**
 * Resolves only OGG files that Vite actually discovered. Logical entries with
 * no checked-in file remain absent and therefore become silent no-ops.
 */
export function resolveSoundDefinitions(
  sources: Readonly<Record<string, string>> = discoveredOggSources,
): readonly AudioDefinition[] {
  return SOUND_IDS.flatMap((id) => {
    const logical = SOUND_REGISTRY[id];
    const source = sources[logical.modulePath];
    if (source === undefined || !OGG_SOURCE_PATTERN.test(source)) return [];
    return [{
      id: logical.id,
      source,
      loop: logical.loop,
      channel: logical.channel,
    }];
  });
}

export const RUNTIME_SOUND_DEFINITIONS = resolveSoundDefinitions();
