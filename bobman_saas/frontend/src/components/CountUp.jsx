import { useEffect, useRef, useState } from 'react';

/**
 * Animates from the previous value up to `value` whenever `value` changes.
 * Uses requestAnimationFrame with ease-out cubic for smooth motion.
 */
export default function CountUp({ value, duration = 1100, from = 0 }) {
  const [display, setDisplay] = useState(typeof value === 'number' ? from : 0);
  const fromRef = useRef(from);
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof value !== 'number') return;
    const start = performance.now();
    const initial = fromRef.current;
    const target = value;
    const span = target - initial;

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(initial + span * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className="countup">{display.toLocaleString()}</span>;
}
