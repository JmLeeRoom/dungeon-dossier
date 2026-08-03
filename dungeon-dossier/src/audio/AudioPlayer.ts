import { Howl } from 'howler';

export interface AudioDefinition {
  readonly id: string;
  readonly source: string;
  readonly loop?: boolean;
}

export class AudioPlayer {
  readonly #sounds = new Map<string, Howl>();

  register(definition: AudioDefinition): void {
    if (!definition.source.toLowerCase().endsWith('.ogg')) {
      throw new Error(`Only OGG audio is supported: ${definition.source}`);
    }

    this.#sounds.set(
      definition.id,
      new Howl({ src: [definition.source], loop: definition.loop ?? false }),
    );
  }

  play(id: string): void {
    const sound = this.#sounds.get(id);
    if (sound === undefined) throw new Error(`Unknown audio id: ${id}`);
    sound.play();
  }
}

