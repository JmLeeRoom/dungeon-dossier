import {
  SaveRepository,
  type SaveStorage,
} from './save';

/**
 * Creates the run-save boundary used by bootstrap. Autoplay and an explicit
 * player reset remove only the run slot; the deliberately narrow SaveStorage
 * interface cannot erase workbench transforms, locks, or other preferences.
 */
export function createRunSaveRepository(
  storage: SaveStorage,
  resetRun: boolean,
): SaveRepository {
  const repository = new SaveRepository(storage);
  if (resetRun) repository.clear();
  return repository;
}
