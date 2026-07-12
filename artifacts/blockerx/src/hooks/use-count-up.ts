import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 to `target` over `duration` ms using easeOutExpo.
 * Only starts when `active` is true (defaults to true).
 */
export function useCountUp(target: number, duration = 1400, active = true) {
  const [count, setCount] = useState(0);
  const raf = useRef<number>(0);
  const startTime = useRef<number>(0);
  const startVal = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    if (target === 0) { setCount(0); return; }

    startTime.current = performance.now();
    startVal.current = 0;

    const animate = (now: number) => {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        raf.current = requestAnimationFrame(animate);
      }
    };

    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, active]);

  return count;
}
