// Browser stub for `node:module`. sone's bundle calls createRequire() only for
// optional server-side hyphenation, inside a try/catch — throwing here leaves
// that feature disabled in the browser without breaking the build.
export function createRequire(): never {
  throw new Error('node:module createRequire is unavailable in the browser')
}
export default { createRequire }
