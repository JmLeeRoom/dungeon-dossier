import { bootstrap } from './app/bootstrap';
import { parseAutoplaySeedParameter } from './app/autoplayPort';
import './style.css';

const mountElement = document.querySelector<HTMLElement>('#game-root');
if (mountElement === null) {
  throw new Error('Missing #game-root mount element.');
}
const mount: HTMLElement = mountElement;

async function start(): Promise<void> {
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);
    const parsedSeed = parseAutoplaySeedParameter(params.get('seed'));
    const { installAutoPlayGlobal } = await import('./dev/autoPlayHarness');
    installAutoPlayGlobal(
      window,
      parsedSeed === undefined ? {} : { seed: parsedSeed },
    );
  }
  await bootstrap(mount);
}

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  mount.dataset.bootstrapError = message;
  mount.textContent = '게임을 불러오지 못했습니다. 페이지를 새로 고쳐 다시 시도해 주세요.';
  console.error('Game bootstrap failed.', error);
});
