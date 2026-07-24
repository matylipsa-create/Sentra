import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaemonMode } from '../types';

const INACTIVITY_TIMEOUT_MS = 10_000;
const COUNTDOWN_THRESHOLD_MS = 3_000;

interface InactivityState {
  countdownActive: boolean;
  remainingSec: number;
}

export function useInactivityReturn(
  currentMode: DaemonMode,
  onReturn: () => void,
): InactivityState & { registerActivity: () => void } {
  const [countdownActive, setCountdownActive] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onReturnRef = useRef(onReturn);
  onReturnRef.current = onReturn;

  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setCountdownActive(false);
    setRemainingSec(0);

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    setCountdownActive(true);
    setRemainingSec(Math.ceil(COUNTDOWN_THRESHOLD_MS / 1000));

    countdownRef.current = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          setCountdownActive(false);
          onReturnRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (currentMode === 'OBSERVE') return;

    const checkInactivity = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        startCountdown();
      }
    };

    timeoutRef.current = setInterval(checkInactivity, 500);

    return () => {
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [currentMode, startCountdown]);

  return { countdownActive, remainingSec, registerActivity };
}
