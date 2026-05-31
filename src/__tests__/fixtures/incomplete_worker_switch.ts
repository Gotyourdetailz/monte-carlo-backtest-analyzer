/**
 * NEGATIVE TEST FIXTURE — this file is intentionally broken.
 *
 * It models a `simulationWorker.ts`-style exhaustive switch over
 * `WorkerRequest['kind']` that deliberately omits one arm of the
 * discriminated union. Because the final `assertNever(request)` call
 * narrows `request` to `never`, the missing arm leaves a non-`never`
 * residual type and TypeScript MUST emit a compile error such as:
 *
 *   error TS2345: Argument of type 'PositionSizingRequest' is not
 *   assignable to parameter of type 'never'.
 *
 * The runner test (`sanity_worker_protocol_exhaustiveness.test.ts`)
 * asserts that `tsc --noEmit` against this fixture exits non-zero. If
 * a future refactor removes the missing arm from `WorkerRequest`, or
 * collapses the union, this fixture will start type-checking cleanly
 * and the runner test will fail — surfacing the regression at CI time.
 *
 * THIS FILE MUST NEVER COMPILE CLEANLY. The repo's root `tsconfig.json`
 * excludes `src/__tests__/fixtures/**` so it does not poison
 * `npm run lint`; only the local `tsconfig.json` next to this file
 * (driven by the runner test) ever compiles it.
 *
 * Validates: Requirements 8.1, 8.2 — Property 14 (worker protocol
 * discriminated-union exhaustiveness, verified at compile time).
 */

import type { WorkerRequest } from '../../workerProtocol';

function assertNever(x: never): never {
  throw new Error(`Unhandled WorkerRequest kind: ${JSON.stringify(x)}`);
}

/**
 * Intentionally NON-exhaustive dispatcher. The `'position-sizing-search'`
 * arm is missing on purpose so that `assertNever(request)` fails to
 * type-check.
 */
export function dispatchIncomplete(request: WorkerRequest): string {
  switch (request.kind) {
    case 'single-run':
      return request.modelType;
    case 'portfolio-run':
      return 'portfolio';
    // Missing: case 'position-sizing-search'
  }
  // Expected compile error here: `request` is still typed as
  // PositionSizingRequest, which is NOT assignable to `never`.
  return assertNever(request);
}
