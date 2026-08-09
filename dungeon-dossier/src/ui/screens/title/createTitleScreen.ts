import { Container, Graphics, Text } from 'pixi.js';
import type { PublicDTO } from '../../../dto';

export function createTitleScreen(dto: PublicDTO): Container {
  const screen = new Container();
  const backdrop = new Graphics().rect(0, 0, 640, 400).fill(0x11131d);
  const frame = new Graphics().rect(24, 24, 592, 352).stroke({ color: 0x77d8d0, width: 2 });
  const title = new Text({
    text: '던전 탐정 김태훈',
    style: {
      fill: 0xf4e7c5,
      fontFamily: 'monospace',
      fontSize: 32,
      fontWeight: '700',
    },
  });
  title.position.set(198, 148);

  const subtitle = new Text({
    text: 'SYSTEM ARCHITECTURE ONLINE',
    style: { fill: 0x77d8d0, fontFamily: 'monospace', fontSize: 12, letterSpacing: 2 },
  });
  subtitle.position.set(202, 202);

  const status = new Text({
    text: `STATEMENTS ${dto.statement.length.toString().padStart(2, '0')}  ·  EVIDENCE ${dto.evidence.length.toString().padStart(2, '0')}`,
    style: { fill: 0x8c92a8, fontFamily: 'monospace', fontSize: 10 },
  });
  status.position.set(214, 244);

  screen.addChild(backdrop, frame, title, subtitle, status);
  return screen;
}

