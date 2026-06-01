/**
 * webglHeroLifecycle — the dependency-injected animation-lifecycle controller
 * for `WebglHero` (task 5.3).
 *
 * `WebglHero.tsx` owns the React/WebGL concerns; this module owns the *wiring*
 * that decides WHEN the scene animates and tears everything down on unmount.
 * It is factored out (and takes its DOM dependencies by injection) so the
 * lifecycle is observable and unit-testable in isolation under the repo's pure
 * `tsx` test harness — there is no jsdom, so the component cannot be mounted in
 * a test, but this controller can be driven with fake DOM handles (task 5.4).
 *
 * Responsibilities (Req 7, 8, 9, 10):
 *   - Derive the single `shouldAnimate` predicate from reduced-motion,
 *     `document.hidden`, and `IntersectionObserver` state, and notify the host
 *     whenever it flips so the host can flip the r3f frameloop between
 *     `'always'` (running) and `'demand'` (paused) — never starting a perpetual
 *     loop under reduced motion (Req 7.1, constraint C6).
 *   - Request a single static frame while paused-but-visible under reduced
 *     motion, so the scene is still shown rather than degrading to a blank box
 *     (Req 7.2, 7.4).
 *   - Forward resize events so the host can re-resolve the render budget /
 *     re-clamp the device pixel ratio (Req 10.1, 10.3, 10.4).
 *   - On `dispose()`, remove EVERY listener/observer it registered (balanced
 *     add/remove, Req 9.3), cancel any pending animation frame (Req 9.2), and
 *     dispose GPU resources inside a `try/catch` so a throwing dispose still
 *     completes the unmount (Req 9.1, 9.4).
 *
 * This module imports no React and touches the DOM only through the injected
 * handles, so it is portable and testable.
 */
import { shouldAnimate } from './webglHeroHelpers';

/**
 * Minimal `MediaQueryList` surface used for the reduced-motion query. Supports
 * both the modern `addEventListener('change', …)` API and the legacy
 * `addListener`/`removeListener` API for older engines.
 */
export interface MediaQueryListLike {
  matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

/** Minimal `IntersectionObserver` surface (only what the controller needs). */
export interface IntersectionObserverLike {
  observe: (target: unknown) => void;
  disconnect: () => void;
}

/** Minimal `addEventListener`/`removeEventListener` target surface. */
export interface EventTargetLike {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/** Injected dependencies for {@link createHeroLifecycle}. */
export interface HeroLifecycleDeps {
  /** Document-like target carrying the `visibilitychange` event. */
  documentTarget: EventTargetLike;
  /** Reads the current `document.hidden` value (Req 8.1/8.2). */
  isDocumentHidden: () => boolean;
  /** Window-like target carrying the `resize` event. */
  windowTarget: EventTargetLike;
  /** Reduced-motion media query, or `null` when `matchMedia` is unavailable. */
  motionQuery: MediaQueryListLike | null;
  /**
   * Factory that creates and starts an `IntersectionObserver` reporting whether
   * the hero section is on-screen, or `null` when `IntersectionObserver` is
   * unavailable (the section is then treated as always on-screen).
   */
  createIntersectionObserver:
    | ((onChange: (intersecting: boolean) => void) => IntersectionObserverLike)
    | null;

  /**
   * Notified with the new `shouldAnimate` value whenever it changes (and once
   * on start). The host flips the r3f frameloop: `true → 'always'` (run the
   * loop), `false → 'demand'` (pause it). Req 7.1/7.2/7.3, 8.1–8.4.
   */
  onAnimateChange: (animate: boolean) => void;
  /**
   * Render exactly one static frame. Invoked while the scene is paused but
   * should still be visible (reduced motion, on-screen, foreground tab) so the
   * scene is held static rather than blank (Req 7.2, 7.4).
   */
  requestStaticFrame: () => void;
  /**
   * Forwarded on every `resize` so the host can re-resolve the path budget and
   * re-clamp/resync the render target (Req 10.1, 10.3, 10.4).
   */
  onResize: () => void;

  /** Cancel a pending animation frame request on teardown (Req 9.2). */
  cancelFrame: () => void;
  /**
   * Dispose GPU geometries/materials/renderer on teardown (Req 9.1). May throw
   * (e.g. on WebGL context loss); the controller swallows the error so unmount
   * still completes (Req 9.4).
   */
  disposeResources: () => void;
}

/** Handle returned by {@link createHeroLifecycle}. */
export interface HeroLifecycle {
  /** The current derived `shouldAnimate` value. */
  isAnimating: () => boolean;
  /**
   * Tear everything down: remove every listener/observer (balanced add/remove,
   * Req 9.3), cancel the pending frame (Req 9.2), and dispose GPU resources in
   * a `try/catch` (Req 9.1, 9.4). Idempotent.
   */
  dispose: () => void;
}

/** Subscribe to a media query's `change` event across modern/legacy APIs. */
function subscribeMotion(query: MediaQueryListLike, listener: () => void): () => void {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener?.('change', listener);
  }
  if (typeof query.addListener === 'function') {
    query.addListener(listener);
    return () => query.removeListener?.(listener);
  }
  return () => {};
}

/**
 * Create and start the hero animation-lifecycle controller.
 *
 * Registers the reduced-motion, visibility, intersection, and resize listeners,
 * computes the initial `shouldAnimate` state, and notifies the host. Returns a
 * handle whose `dispose()` reverses every registration and releases resources.
 *
 * The returned controller is total and defensive: every listener removal is
 * paired with its registration, and `dispose()` never throws even if the
 * injected `disposeResources` does.
 */
export function createHeroLifecycle(deps: HeroLifecycleDeps): HeroLifecycle {
  // Initial gating state. The section is assumed on-screen until an observer
  // reports otherwise (the observer fires an initial callback when it starts).
  let reducedMotion = deps.motionQuery?.matches ?? false;
  let documentHidden = deps.isDocumentHidden();
  let sectionIntersecting = true;

  let lastAnimate: boolean | null = null;
  let disposed = false;

  // Teardown stack: every registration pushes its matching removal so disposal
  // is provably balanced (Req 9.3).
  const teardowns: Array<() => void> = [];

  const currentAnimate = (): boolean =>
    shouldAnimate({ reducedMotion, documentHidden, sectionIntersecting });

  /**
   * Re-derive `shouldAnimate`; notify the host on change, and hold a single
   * static frame whenever the scene is paused-but-visible under reduced motion.
   */
  const recompute = (): void => {
    const animate = currentAnimate();
    if (animate !== lastAnimate) {
      lastAnimate = animate;
      deps.onAnimateChange(animate);
    }
    // Paused, on-screen, foreground, and motion-suppressed → show a static
    // frame so the scene stays visible rather than blank (Req 7.2, 7.4).
    if (!animate && reducedMotion && !documentHidden && sectionIntersecting) {
      deps.requestStaticFrame();
    }
  };

  // --- Reduced motion (Req 7.2, 7.3) ---------------------------------------
  if (deps.motionQuery) {
    const query = deps.motionQuery;
    const onMotionChange = (): void => {
      reducedMotion = query.matches;
      recompute();
    };
    teardowns.push(subscribeMotion(query, onMotionChange));
  }

  // --- Visibility (Req 8.1, 8.2) -------------------------------------------
  {
    const onVisibility = (): void => {
      documentHidden = deps.isDocumentHidden();
      recompute();
    };
    deps.documentTarget.addEventListener('visibilitychange', onVisibility);
    teardowns.push(() =>
      deps.documentTarget.removeEventListener('visibilitychange', onVisibility),
    );
  }

  // --- Intersection (Req 8.3, 8.4) -----------------------------------------
  if (deps.createIntersectionObserver) {
    const observer = deps.createIntersectionObserver((intersecting) => {
      sectionIntersecting = intersecting;
      recompute();
    });
    teardowns.push(() => observer.disconnect());
  }

  // --- Resize (Req 10.1, 10.3, 10.4) ---------------------------------------
  {
    const onResize = (): void => deps.onResize();
    deps.windowTarget.addEventListener('resize', onResize);
    teardowns.push(() => deps.windowTarget.removeEventListener('resize', onResize));
  }

  // Establish the initial frameloop state (and an initial static frame if the
  // scene starts paused under reduced motion).
  recompute();

  return {
    isAnimating: currentAnimate,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;

      // 1. Remove every listener/observer first so a throwing resource dispose
      //    can never leave a dangling registration (Req 9.3).
      for (const teardown of teardowns) {
        try {
          teardown();
        } catch {
          // A listener removal should never throw, but never let one stop the
          // rest of the teardown from running.
        }
      }
      teardowns.length = 0;

      // 2. Cancel the pending animation frame (Req 9.2).
      try {
        deps.cancelFrame();
      } catch {
        // Ignore — unmount must complete regardless (Req 9.4).
      }

      // 3. Dispose GPU resources. A throwing dispose (e.g. on context loss)
      //    must not block unmount (Req 9.4).
      try {
        deps.disposeResources();
      } catch {
        // Swallow — the component is going away; nothing left to recover.
      }
    },
  };
}
