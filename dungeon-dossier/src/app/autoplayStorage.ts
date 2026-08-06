import {
  SaveRepository,
  type SaveStorage,
} from './save';

/**
 * Creates the run-save boundary used by bootstrap. Autoplay resets only the
 * run slot; the deliberately narrow SaveStorage interface cannot erase
 * workbench transforms, locks, or any other same-origin localStorage data.
 */
export function createRunSaveRepository(
  storage: SaveStorage,
  resetForAutoplay: boolean,
): SaveRepository {
  const repository = new SaveRepository(storage);
  if (resetForAutoplay) repository.clear();
  return repository;
}
