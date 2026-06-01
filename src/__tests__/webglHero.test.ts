/**
 * Unit tests: `WebglHero` behaviour and error branches (webgl-hero task 5.4).
 *
 * Run with: npx tsx src/__tests__/webglHero.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure. Auto-joins
 * the suite via `run_all.test.ts`. No Jest/Vitest/jsdom (per tech.md) — these
 * are pure tsx-runnable scripts using Node built-ins only.
 *
 * ── What is verified PROGRAMMATICALLY here ──────────────────────────────────
 * The animation-lifecycle logic was deliberately factored out of the React
 * component into the dependency-injected `createHeroLifecycle(deps)` controller
 * (`src/components/webglHeroLifecycle.ts`) precisely so it can be unit-tested
 * with FAKE injected DOM handles — no jsdom, no renderer, no real WebGL. This
 * file drives that controller with fakes and asserts observable behaviour:
 *
 *   - Animation gating (Req 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4): `onAnimateChange`
 *     fires with the correct `shouldAnimate` value as reduced-motion,
 *     `document.hidden`, and intersection toggle; a static frame is requested
 *     while paused-but-visible under reduced motion (Req 7.4).
 *   - Resize (Req 10.4): firing the injected window `resize` listener calls
 *     `onResize`.
 *   - Disposal (Req 9.1, 9.2, 9.3, 9.4): after `dispose()` every registered
 *     listener/observer was removed (balanced add/remove tracked on the fakes),
 *     `cancelFrame` ran (Req 9.2), `disposeResources` ran (Req 9.1); a
 *     `disposeResources` that THROWS still completes `dispose()` without
 *     throwing (Req 9.4); `dispose()` is idempotent.
 *   - Modern + legacy media-query subscription APIs are both honoured.
 *
 * ── What is verified by SOURCE-SCAN here ────────────────────────────────────
 * The Hero_Contract DOM structure, scrim gating by `active`, the no-WebGL /
 * import-reject / pre-first-frame / failed → Fallback_Layer branches, and the
 * dynamic-import caching all live in `WebglHero.tsx` and genuinely require a
 * DOM/renderer to *render*. Without jsdom we cannot mount the component, so we
 * assert their presence structurally against the component source (comment-
 * stripped so documentation prose never false-positives) and clearly mark them
 * as structural checks. Their runtime rendering is covered by the manual /
 * browser verification noted in the design's Testing Strategy.
 *
 * ── DEFERRED to manual / browser verification (per design Testing Strategy) ──
 *   - Req 1.1, 1.2, 1.6, 4.3, 5.1: that the scene actually paints with
 *     perspective depth, loops without a perceptible hard cut, and raises no
 *     CSP violation / third-party request — GPU/perceptual/runtime concerns not
 *     amenable to a headless tsx unit test.
 *
 * Validates (programmatically): Requirements 7.2, 7.3, 7.4, 8.2, 8.4, 9.1, 9.2,
 *   9.3, 9.4, 10.4
 * Validates (structurally / source-scan): Requirements 1.5, 2.5, 2.6, 2.7, 4.4,
 *   4.5, 6.1, 6.2, 6.3, 6.4, 11.1, 11.2, 11.3, 11.4, 12.2, 12.5
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHeroLifecycle } from '../components/webglHeroLifecycle';
import type {
  EventTargetLike,
  HeroLifecycleDeps,
  IntersectionObserverLike,
  MediaQueryListLike,
} from '../components/webglHeroLifecycle';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WEBGL_HERO_TSX = path.resolve(REPO_ROOT, 'src', 'components', 'WebglHero.tsx');

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

function section(title: string): void {
  console.log(`\n[webglHero] ${title}`);
}

// ===========================================================================
// Fakes — minimal, counting stand-ins for the injected DOM handles.
// ===========================================================================

/**
 * A counting `addEventListener`/`removeEventListener` target. Tracks per-type
 * add/remove counts and the set of currently-registered listeners, so a test
 * can both fire an event and assert that registration is perfectly balanced
 * after teardown (Req 9.3).
 */
class FakeEventTarget implements EventTargetLike {
  readonly addCounts = new Map<string, number>();
  readonly removeCounts = new Map<string, number>();
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    this.addCounts.set(type, (this.addCounts.get(type) ?? 0) + 1);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.removeCounts.set(type, (this.removeCounts.get(type) ?? 0) + 1);
    this.listeners.get(type)?.delete(listener);
  }

  /** Invoke every currently-registered listener for `type`. */
  fire(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  /** Number of listeners still registered for `type` (0 after balanced teardown). */
  activeCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

/** Reduced-motion media query exposing the MODERN add/removeEventListener API. */
class FakeMotionQueryModern implements MediaQueryListLike {
  matches: boolean;
  addCount = 0;
  removeCount = 0;
  private readonly listeners = new Set<() => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(_type: 'change', listener: () => void): void {
    this.addCount++;
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.removeCount++;
    this.listeners.delete(listener);
  }

  /** Flip `matches` and notify subscribers (mirrors a real `change` event). */
  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of [...this.listeners]) listener();
  }

  activeCount(): number {
    return this.listeners.size;
  }
}

/** Reduced-motion media query exposing only the LEGACY add/removeListener API. */
class FakeMotionQueryLegacy implements MediaQueryListLike {
  matches: boolean;
  addCount = 0;
  removeCount = 0;
  private readonly listeners = new Set<() => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addListener(listener: () => void): void {
    this.addCount++;
    this.listeners.add(listener);
  }

  removeListener(listener: () => void): void {
    this.removeCount++;
    this.listeners.delete(listener);
  }

  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of [...this.listeners]) listener();
  }

  activeCount(): number {
    return this.listeners.size;
  }
}

/**
 * A fake `IntersectionObserver` factory. Captures the `onChange` callback the
 * controller wires up so a test can drive on-/off-screen transitions, and
 * tracks how many observers were created and disconnected.
 */
function makeIntersectionFactory() {
  const state = {
    created: 0,
    disconnected: 0,
    onChange: null as ((intersecting: boolean) => void) | null,
  };
  const factory = (onChange: (intersecting: boolean) => void): IntersectionObserverLike => {
    state.created++;
    state.onChange = onChange;
    return {
      observe: () => {},
      disconnect: () => {
        state.disconnected++;
      },
    };
  };
  const fire = (intersecting: boolean): void => state.onChange?.(intersecting);
  return { factory, state, fire };
}

/**
 * Build a `createHeroLifecycle` deps object from fakes, recording every call
 * the controller makes to the host so tests can assert observable behaviour.
 */
function makeDeps(overrides: Partial<HeroLifecycleDeps> = {}) {
  const documentTarget = new FakeEventTarget();
  const windowTarget = new FakeEventTarget();
  const animateCalls: boolean[] = [];
  const counters = { staticFrame: 0, resize: 0, cancelFrame: 0, dispose: 0 };
  let hidden = false;

  const deps: HeroLifecycleDeps = {
    documentTarget,
    isDocumentHidden: () => hidden,
    windowTarget,
    motionQuery: null,
    createIntersectionObserver: null,
    onAnimateChange: (animate) => animateCalls.push(animate),
    requestStaticFrame: () => {
      counters.staticFrame++;
    },
    onResize: () => {
      counters.resize++;
    },
    cancelFrame: () => {
      counters.cancelFrame++;
    },
    disposeResources: () => {
      counters.dispose++;
    },
    ...overrides,
  };

  return {
    deps,
    documentTarget,
    windowTarget,
    animateCalls,
    counters,
    setHidden: (value: boolean) => {
      hidden = value;
    },
  };
}

// ===========================================================================
// 1. Initial gating state (Req 7.1 / 8.1 / 8.3 baseline → animate on start)
// ===========================================================================

section('initial frameloop state');
{
  const { deps, animateCalls } = makeDeps();
  const lifecycle = createHeroLifecycle(deps);

  // Defaults: motion allowed, document visible, section on-screen → animate.
  check(
    'onAnimateChange fires once with true on a fresh, unconstrained start',
    animateCalls.length === 1 && animateCalls[0] === true,
    `calls=${JSON.stringify(animateCalls)}`,
  );
  check('isAnimating() reflects the initial true state', lifecycle.isAnimating() === true);

  lifecycle.dispose();
}

// ===========================================================================
// 2. Reduced-motion gating + static frame (Req 7.2, 7.3, 7.4)
// ===========================================================================

section('reduced-motion gating and static frame (Req 7.2, 7.3, 7.4)');
{
  const motionQuery = new FakeMotionQueryModern(false);
  const { deps, animateCalls, counters } = makeDeps({ motionQuery });
  const lifecycle = createHeroLifecycle(deps);

  // Start: motion allowed → animate true, no static frame yet.
  check(
    'starts animating when reduced-motion is inactive',
    animateCalls.length === 1 && animateCalls[0] === true,
    `calls=${JSON.stringify(animateCalls)}`,
  );
  check('no static frame requested while animating', counters.staticFrame === 0);

  // Inactive → active: must stop the loop AND hold a single static frame
  // (Req 7.2 stop, Req 7.4 static composition while visible).
  motionQuery.set(true);
  check(
    'reduced-motion inactive→active pauses the loop (onAnimateChange false)',
    animateCalls.length === 2 && animateCalls[1] === false,
    `calls=${JSON.stringify(animateCalls)}`,
  );
  check(
    'reduced-motion active+visible requests a static frame (Req 7.4)',
    counters.staticFrame === 1,
    `staticFrame=${counters.staticFrame}`,
  );
  check('isAnimating() is false under reduced motion', lifecycle.isAnimating() === false);

  // Active → inactive: resume animated rendering (Req 7.3).
  motionQuery.set(false);
  check(
    'reduced-motion active→inactive resumes the loop (onAnimateChange true)',
    animateCalls.length === 3 && animateCalls[2] === true,
    `calls=${JSON.stringify(animateCalls)}`,
  );

  lifecycle.dispose();
}

// A scene that STARTS under reduced motion must hold a static frame immediately
// (Req 7.1, 7.4): paused on start, but visible, so a single frame is painted.
{
  const motionQuery = new FakeMotionQueryModern(true);
  const { deps, animateCalls, counters } = makeDeps({ motionQuery });
  const lifecycle = createHeroLifecycle(deps);

  check(
    'starting under reduced motion does not start the loop',
    animateCalls.length === 1 && animateCalls[0] === false,
    `calls=${JSON.stringify(animateCalls)}`,
  );
  check(
    'starting under reduced motion paints one static frame (Req 7.1/7.4)',
    counters.staticFrame === 1,
    `staticFrame=${counters.staticFrame}`,
  );

  lifecycle.dispose();
}

// ===========================================================================
// 3. Visibility gating (Req 8.1, 8.2)
// ===========================================================================

section('visibility gating (Req 8.1, 8.2)');
{
  const ctx = makeDeps();
  const lifecycle = createHeroLifecycle(ctx.deps);

  // Hidden → pause (Req 8.1). Not reduced motion, so NO static frame.
  ctx.setHidden(true);
  ctx.documentTarget.fire('visibilitychange');
  check(
    'document.hidden=true pauses the loop (Req 8.1)',
    ctx.animateCalls.length === 2 && ctx.animateCalls[1] === false,
    `calls=${JSON.stringify(ctx.animateCalls)}`,
  );
  check(
    'a hidden (non-reduced-motion) tab requests no static frame',
    ctx.counters.staticFrame === 0,
  );

  // Visible again → resume (Req 8.2).
  ctx.setHidden(false);
  ctx.documentTarget.fire('visibilitychange');
  check(
    'document.hidden=false resumes the loop (Req 8.2)',
    ctx.animateCalls.length === 3 && ctx.animateCalls[2] === true,
    `calls=${JSON.stringify(ctx.animateCalls)}`,
  );

  lifecycle.dispose();
}

// ===========================================================================
// 4. Intersection gating (Req 8.3, 8.4)
// ===========================================================================

section('intersection gating (Req 8.3, 8.4)');
{
  const io = makeIntersectionFactory();
  const ctx = makeDeps({ createIntersectionObserver: io.factory });
  const lifecycle = createHeroLifecycle(ctx.deps);

  check('intersection observer was created', io.state.created === 1);
  check(
    'starts animating while assumed on-screen',
    ctx.animateCalls.length === 1 && ctx.animateCalls[0] === true,
  );

  // Offscreen → pause (Req 8.3).
  io.fire(false);
  check(
    'section offscreen pauses the loop (Req 8.3)',
    ctx.animateCalls.length === 2 && ctx.animateCalls[1] === false,
    `calls=${JSON.stringify(ctx.animateCalls)}`,
  );

  // Back on-screen → resume (Req 8.4).
  io.fire(true);
  check(
    'section re-entering the viewport resumes the loop (Req 8.4)',
    ctx.animateCalls.length === 3 && ctx.animateCalls[2] === true,
    `calls=${JSON.stringify(ctx.animateCalls)}`,
  );

  lifecycle.dispose();
}

// ===========================================================================
// 5. Resize forwarding (Req 10.4)
// ===========================================================================

section('resize forwarding (Req 10.4)');
{
  const ctx = makeDeps();
  const lifecycle = createHeroLifecycle(ctx.deps);

  check('no resize forwarded before any resize event', ctx.counters.resize === 0);
  ctx.windowTarget.fire('resize');
  check('firing window resize forwards to onResize (Req 10.4)', ctx.counters.resize === 1);
  ctx.windowTarget.fire('resize');
  check('each resize event forwards again', ctx.counters.resize === 2);

  lifecycle.dispose();
}

// ===========================================================================
// 6. Disposal — balanced teardown + resource release (Req 9.1, 9.2, 9.3)
// ===========================================================================

section('disposal balances every registration and releases resources (Req 9.1, 9.2, 9.3)');
{
  const motionQuery = new FakeMotionQueryModern(false);
  const io = makeIntersectionFactory();
  const ctx = makeDeps({ motionQuery, createIntersectionObserver: io.factory });
  const lifecycle = createHeroLifecycle(ctx.deps);

  // Pre-dispose: exactly one of each registration exists.
  check(
    'visibilitychange listener registered once',
    ctx.documentTarget.addCounts.get('visibilitychange') === 1 &&
      ctx.documentTarget.activeCount('visibilitychange') === 1,
  );
  check(
    'resize listener registered once',
    ctx.windowTarget.addCounts.get('resize') === 1 &&
      ctx.windowTarget.activeCount('resize') === 1,
  );
  check(
    'reduced-motion listener registered once',
    motionQuery.addCount === 1 && motionQuery.activeCount() === 1,
  );
  check('intersection observer created once, not yet disconnected', io.state.disconnected === 0);

  lifecycle.dispose();

  // Post-dispose: every registration removed (balanced add/remove, Req 9.3).
  check(
    'visibilitychange listener removed (balanced add/remove)',
    ctx.documentTarget.removeCounts.get('visibilitychange') === 1 &&
      ctx.documentTarget.activeCount('visibilitychange') === 0,
  );
  check(
    'resize listener removed (balanced add/remove)',
    ctx.windowTarget.removeCounts.get('resize') === 1 &&
      ctx.windowTarget.activeCount('resize') === 0,
  );
  check(
    'reduced-motion listener removed (balanced add/remove)',
    motionQuery.removeCount === 1 && motionQuery.activeCount() === 0,
  );
  check('intersection observer disconnected exactly once', io.state.disconnected === 1);

  // Resource teardown (Req 9.1 dispose, Req 9.2 cancel pending frame).
  check('cancelFrame called on dispose (Req 9.2)', ctx.counters.cancelFrame === 1);
  check('disposeResources called on dispose (Req 9.1)', ctx.counters.dispose === 1);

  // Idempotency: a second dispose() is a no-op (no extra removals/calls).
  lifecycle.dispose();
  check(
    'dispose() is idempotent — no extra teardown on a second call',
    ctx.documentTarget.removeCounts.get('visibilitychange') === 1 &&
      ctx.windowTarget.removeCounts.get('resize') === 1 &&
      motionQuery.removeCount === 1 &&
      io.state.disconnected === 1 &&
      ctx.counters.cancelFrame === 1 &&
      ctx.counters.dispose === 1,
  );
}

// Legacy media-query API (addListener/removeListener) must also be balanced.
section('disposal balances the legacy media-query subscription API');
{
  const motionQuery = new FakeMotionQueryLegacy(false);
  const { deps } = makeDeps({ motionQuery });
  const lifecycle = createHeroLifecycle(deps);

  check('legacy addListener used once', motionQuery.addCount === 1 && motionQuery.activeCount() === 1);
  lifecycle.dispose();
  check(
    'legacy removeListener balances the registration on dispose',
    motionQuery.removeCount === 1 && motionQuery.activeCount() === 0,
  );
}

// ===========================================================================
// 7. Disposal robustness — a throwing dispose still completes (Req 9.4)
// ===========================================================================

section('disposal survives throwing teardown / cancel / dispose (Req 9.4)');
{
  const io = makeIntersectionFactory();
  // A disconnect that throws must NOT stop the rest of teardown.
  const throwingIo = (onChange: (i: boolean) => void): IntersectionObserverLike => {
    io.state.created++;
    io.state.onChange = onChange;
    return {
      observe: () => {},
      disconnect: () => {
        io.state.disconnected++;
        throw new Error('boom: observer disconnect');
      },
    };
  };

  const ctx = makeDeps({
    createIntersectionObserver: throwingIo,
    cancelFrame: () => {
      throw new Error('boom: cancelFrame');
    },
    disposeResources: () => {
      throw new Error('boom: disposeResources (e.g. WebGL context loss)');
    },
  });
  const lifecycle = createHeroLifecycle(ctx.deps);

  let threw = false;
  try {
    lifecycle.dispose();
  } catch {
    threw = true;
  }

  check('dispose() does not throw even when disposeResources throws (Req 9.4)', threw === false);
  // Even with a throwing observer disconnect, the listener teardowns that ran
  // before it must still have removed the window/document listeners.
  check(
    'listeners are still removed despite a throwing observer disconnect (Req 9.3/9.4)',
    ctx.documentTarget.activeCount('visibilitychange') === 0 &&
      ctx.windowTarget.activeCount('resize') === 0,
  );
}

// A bare dispose with only a throwing disposeResources (no observers/motion).
{
  const ctx = makeDeps({
    disposeResources: () => {
      throw new Error('boom');
    },
  });
  const lifecycle = createHeroLifecycle(ctx.deps);
  let threw = false;
  try {
    lifecycle.dispose();
  } catch {
    threw = true;
  }
  check('minimal lifecycle still completes dispose() when disposeResources throws', threw === false);
  check('cancelFrame still ran before the throwing disposeResources', ctx.counters.cancelFrame === 1);
}

// ===========================================================================
// 8. Combined gating — any single blocker pauses the loop
// ===========================================================================

section('combined gating — any blocker pauses, all-clear resumes');
{
  const motionQuery = new FakeMotionQueryModern(false);
  const io = makeIntersectionFactory();
  const ctx = makeDeps({ motionQuery, createIntersectionObserver: io.factory });
  const lifecycle = createHeroLifecycle(ctx.deps);

  // Start animating, then block via intersection, then ALSO hide the tab.
  io.fire(false); // offscreen → pause
  ctx.setHidden(true);
  ctx.documentTarget.fire('visibilitychange'); // hidden, already paused → no change
  check('isAnimating() stays false while any blocker is active', lifecycle.isAnimating() === false);

  // Clear intersection but tab still hidden → still paused.
  io.fire(true);
  check('still paused while the tab remains hidden', lifecycle.isAnimating() === false);

  // Clear visibility too → all clear → resume.
  ctx.setHidden(false);
  ctx.documentTarget.fire('visibilitychange');
  check('resumes only once every blocker is cleared', lifecycle.isAnimating() === true);

  lifecycle.dispose();
}

// ===========================================================================
// 9. Structural source-scan of WebglHero.tsx for the DOM-only contract parts.
//
// These cannot be RENDERED without jsdom, so we assert their presence in the
// component source instead, and defer their runtime rendering to the manual /
// browser verification in the design's Testing Strategy. The source is comment-
// stripped first so JSDoc prose (which legitimately discusses these concepts)
// never satisfies a check on its own.
// ===========================================================================

/**
 * Remove block comments (`/* ... *​/`, incl. JSDoc and JSX `{/* ... *​/}`) and
 * line comments (`// ...`). Lexer-free: WebglHero.tsx contains no string/regex
 * literals carrying comment delimiters (verified: no `://` or regex literals),
 * so naive stripping is safe and keeps the scan honest about *code* presence.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

section('Hero_Contract + fallback/scrim/import structure (source-scan; render deferred to manual)');
{
  let raw = '';
  let exists = true;
  try {
    raw = readFileSync(WEBGL_HERO_TSX, 'utf8');
  } catch {
    exists = false;
  }
  check('WebglHero.tsx exists at its dedicated component path', exists);

  if (exists) {
    const code = stripComments(raw);

    // --- Hero_Contract structure (Req 1.5, 6.1, 6.2, 6.3) ------------------
    check('root carries aria-hidden="true" (Req 6.1)', code.includes('aria-hidden="true"'));
    check('root carries pointer-events-none (Req 6.2)', code.includes('pointer-events-none'));
    check('backdrop is -z-10 behind the hero text (Req 1.5, 6.3)', code.includes('-z-10'));
    check('backdrop clips overflow (Hero_Contract)', code.includes('overflow-hidden'));

    // --- Decorative only: no focusable element / control (Req 6.4) ---------
    const noButton = !/<button[\s>]/i.test(code);
    const noAnchor = !/<a[\s>]/i.test(code);
    const noTabIndex = !/tabindex/i.test(code);
    const noHref = !/\bhref\s*=/i.test(code);
    const noOnClick = !/\bonClick\b/.test(code);
    const noRole = !/\brole\s*=/i.test(code);
    check(
      'renders no focusable/interactive element — no button/anchor/tabindex/href/onClick/role (Req 6.4)',
      noButton && noAnchor && noTabIndex && noHref && noOnClick && noRole,
      `button=${!noButton} anchor=${!noAnchor} tabindex=${!noTabIndex} href=${!noHref} onClick=${!noOnClick} role=${!noRole}`,
    );

    // --- Scrim gating by `active` (Req 2.5, 2.6) and failure → fallback (2.7)
    check('scrim is gated behind an `active` check (Req 2.5, 2.6)', /if\s*\(\s*active\s*\)/.test(code));
    check('scrim is built via buildScrim()', code.includes('buildScrim()'));
    check(
      'a scrim build failure degrades to the Fallback_Layer (Req 2.7)',
      /catch\s*\{[\s\S]*?return\s*<FallbackLayer\s*\/>/.test(code),
    );

    // --- Capability / error fallback branches (Req 4.4, 4.5, 11.1–11.4) ----
    check(
      'no WebGL context → Fallback_Layer (Req 11.1, 4.4)',
      /if\s*\(\s*!webglAvailable\s*\)/.test(code),
    );
    check('a permanent failure flag → Fallback_Layer (Req 11.3)', /if\s*\(\s*failed\s*\)/.test(code));
    check(
      'an import rejection sets the failure flag (Req 11.2, 4.5)',
      code.includes('loadWebglRuntime()') && /\.catch\([\s\S]*?setFailed\(true\)/.test(code),
    );
    check(
      'pre-first-frame renders the static fallback rather than an empty box (Req 11.4)',
      /!painted\s*\?/.test(code),
    );
    check('a CSP violation while loading sets the failure flag (Req 4.5)', code.includes("'securitypolicyviolation'") || code.includes('securitypolicyviolation'));

    // --- Dynamic import used + cached on remount (Req 12.2, 12.5) ----------
    check(
      "WebGL runtime is pulled in via dynamic import('three') (Req 12.2)",
      /import\(\s*'three'\s*\)/.test(code),
    );
    check(
      "WebGL runtime is pulled in via dynamic import('@react-three/fiber') (Req 12.2)",
      /import\(\s*'@react-three\/fiber'\s*\)/.test(code),
    );
    check(
      'a module-level cache reuses the in-memory runtime on remount (Req 12.5)',
      /if\s*\(\s*runtimePromise\s*\)\s*return\s+runtimePromise/.test(code),
    );
    check(
      'the lazy import is started only after the WebGL gate passes (Req 12.2)',
      /if\s*\(\s*!webglAvailable\s*\|\|\s*failed\s*\)\s*return/.test(code),
    );
  } else {
    // Surface the dependent structural checks as failures rather than skipping.
    check('WebglHero.tsx structural checks could not run — file missing', false);
  }
}

// ===========================================================================
// Summary
// ===========================================================================

if (failures > 0) {
  console.log(`\n[webglHero] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[webglHero] all checks passed');
