/*
 * src/components/bench/HeroVideoBackdrop.tsx
 *
 * Full-bleed, low-opacity Monte-Carlo path-fan video sitting behind the whole
 * page (above the body radial, below all content). It dissolves toward the
 * fold via a bottom mask, and fades to nothing as you scroll past the hero
 * (JS scroll listener — CSS scroll-timeline isn't supported in Firefox/Zen).
 *
 * prefers-reduced-motion → static poster, no autoplay, no scroll work.
 * Mounted once at the page root; pointer-events:none so it never intercepts.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { useReducedMotion } from 'motion/react';

const WEBM = '/hero/mc-paths.webm';
const MP4 = '/hero/mc-paths.mp4';
const POSTER = '/hero/mc-paths-poster.jpg';
const BASE_OPACITY = 0.2;
const MASK = 'linear-gradient(to bottom, #000 28%, transparent 92%)';

export function HeroVideoBackdrop(): ReactElement {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      // Fully faded once the hero (~0.8 viewport) has scrolled away.
      const fade = Math.max(0, 1 - window.scrollY / (window.innerHeight * 0.8));
      el.style.opacity = String(BASE_OPACITY * fade);
      el.style.visibility = fade <= 0 ? 'hidden' : 'visible';
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const mediaStyle = {
    maskImage: MASK,
    WebkitMaskImage: MASK,
    transform: 'scale(1.12)', // a touch larger / more immersive
    transformOrigin: 'center',
  } as const;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ opacity: BASE_OPACITY }}
    >
      {reduce ? (
        <img
          src={POSTER}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={mediaStyle}
        />
      ) : (
        <video
          autoPlay
          muted
          loop
          playsInline
          poster={POSTER}
          className="absolute inset-0 h-full w-full object-cover"
          style={mediaStyle}
        >
          <source src={WEBM} type="video/webm" />
          <source src={MP4} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
