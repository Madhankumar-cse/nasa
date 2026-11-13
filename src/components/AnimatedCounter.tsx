import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  decimals?: number;
  durationMs?: number;
  startFromZeroKey?: number;
  className?: string;
  suffix?: string;
}

export function AnimatedCounter({
  value,
  decimals = 0,
  durationMs = 950,
  startFromZeroKey = 0,
  className = '',
  suffix = '',
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(value);
  const prevValueRef = useRef(value);
  const prevKeyRef = useRef(startFromZeroKey);

  useEffect(() => {
    const resetToZero = prevKeyRef.current !== startFromZeroKey;
    prevKeyRef.current = startFromZeroKey;

    const from = resetToZero ? 0 : prevValueRef.current;
    const to = value;
    prevValueRef.current = to;

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs, startFromZeroKey]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
