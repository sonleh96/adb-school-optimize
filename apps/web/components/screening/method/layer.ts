/**
 * The method layer's code, in one chunk that loads when the method details are first turned on (or pointed at), so
 * a plain view never downloads it. `mounts.tsx` imports this module dynamically and nothing imports it statically.
 */
export { buildMounts, comparedOf, filterOptions, paintFor } from "./build";
