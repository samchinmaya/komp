/**
 * Prefix for files in /public. The site is served from /komp on GitHub Pages,
 * and plain <img src> / CSS url() don't get Next's basePath added automatically.
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const asset = (path: string) => `${basePath}${path}`;
