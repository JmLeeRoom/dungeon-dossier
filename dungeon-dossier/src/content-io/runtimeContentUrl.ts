/**
 * Resolves copied runtime JSON against Vite's configured deployment base.
 *
 * Repository URLs used to start at `/content`, which works only when the game
 * is hosted at the origin root. With the production `base: './'`, a relative
 * URL keeps the copied `content/` tree beside `index.html` even when the whole
 * build is mounted under a subdirectory.
 */
export function runtimeContentUrl(
  relativePath: string,
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  const cleanPath = relativePath.replace(/^\/+/, '');
  if (cleanPath === '' || cleanPath.split('/').includes('..')) {
    throw new Error(`Runtime content path must stay inside content/: ${relativePath}`);
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}content/${cleanPath}`;
}
