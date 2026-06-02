/**
 * Maximum number of simulated equity paths drawn on the spaghetti plot.
 *
 * Recharts re-renders every series on hover/resize; rendering hundreds of
 * paths causes browser jank on mid-tier hardware. Capping at 50 keeps the
 * visualization legible (the eye cannot resolve more than a few dozen
 * overlapping curves anyway) while preserving the spread of outcomes.
 *
 * Validates: Requirement 25.4.
 */
export const MAX_PATHS_TO_PLOT = 50;
