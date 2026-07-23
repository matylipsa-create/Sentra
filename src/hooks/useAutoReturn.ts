import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaemonMode } from '../types';

const AUTO_RETURN_SECS: Record<DaemonMode, number> = {
  ASSIST:    0,
  STABILIZE: 6,
  SOFT_WARN: 10,
  OBSERVE:   8,
};

interface AutoReturnState {
  remaining: number;
  active: boolean;
}

export function useAutoReturn(
  mode: DaemonMode,
  onReturn: () => void,
): AutoReturnState & { cancel: () => void } {
  const [remaining, setRemaining] = useState(0);
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onReturnRef = useRef(onReturn);
  onReturnRef.current = onReturn;

  const cancel = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setActive(false);
    setRemaining(0);
  }, []);

  useEffect(() => {
    cancel();
    const secs = AUTO_RETURN_SECS[mode];
    if (!secs) return;

    setActive(true);
    setRemaining(secs);
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          setActive(false);
          onReturnRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return cancel;
  }, [mode, cancel]);

  return { remaining, active, cancel };
}
