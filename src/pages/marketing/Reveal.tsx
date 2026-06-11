/**
 * src/pages/marketing/Reveal.tsx — on-scroll reveal wrapper for the public
 * marketing landing.
 *
 * Adds `.reveal` (opacity 0 / translateY) and flips to `.is-visible` the
 * first time the element enters the viewport, via one IntersectionObserver
 * per instance (disconnected after firing — no scroll-listener cost).
 * `prefers-reduced-motion` is honoured in CSS: the reveal renders fully
 * visible with no transform. Below-the-fold sections use this instead of
 * mount-time `panel-enter` animations, which would otherwise finish before
 * the user ever scrolls to them.
 */
import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Optional transition delay in ms, for staggering siblings. */
  delay?: number;
}

export function Reveal({ children, className, delay = 0 }: RevealProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('is-visible');
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties | undefined =
    delay > 0 ? { transitionDelay: `${delay}ms` } : undefined;

  return (
    <div ref={ref} className={cn('reveal', className)} style={style}>
      {children}
    </div>
  );
}
