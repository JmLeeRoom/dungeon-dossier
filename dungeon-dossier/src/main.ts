import { bootstrap } from './app/bootstrap';
import './style.css';

const mount = document.querySelector<HTMLElement>('#game-root');
if (mount === null) {
  throw new Error('Missing #game-root mount element.');
}

void bootstrap(mount).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  mount.textContent = `게임 초기화 실패: ${message}`;
});

