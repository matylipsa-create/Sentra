export type GestureType = 'tap' | 'long-press' | 'swipe-up' | 'swipe-down' | 'pinch-zoom' | 'double-tap' | 'circular-swipe';

export interface Gesture {
  type: GestureType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
  intensity: number; // 0-1
  pressure?: number; // 0-1 if supported
}

interface GestureContext {
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  touchCount: number;
  initialDistance: number;
}

const GESTURE_THRESHOLDS = {
  TAP_DURATION: 300,
  LONG_PRESS_DURATION: 500,
  SWIPE_MIN_DISTANCE: 50,
  SWIPE_MAX_DURATION: 500,
  DOUBLE_TAP_INTERVAL: 300,
};

export class GestureRecognizer {
  private context: GestureContext | null = null;
  private lastTapTime = 0;
  private listeners: ((gesture: Gesture) => void)[] = [];
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    this.attachListeners();
  }

  private attachListeners() {
    this.element.addEventListener('touchstart', (e) => this.onTouchStart(e));
    this.element.addEventListener('touchmove', (e) => this.onTouchMove(e));
    this.element.addEventListener('touchend', (e) => this.onTouchEnd(e));
    this.element.addEventListener('touchcancel', () => this.context = null);
  }

  private onTouchStart(e: TouchEvent) {
    if (e.touches.length === 0) return;

    const touch = e.touches[0];
    this.context = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      lastX: touch.clientX,
      lastY: touch.clientY,
      touchCount: e.touches.length,
      initialDistance: this.getDistance(e.touches),
    };
  }

  private onTouchMove(e: TouchEvent) {
    if (!this.context || e.touches.length === 0) return;

    const touch = e.touches[0];
    this.context.lastX = touch.clientX;
    this.context.lastY = touch.clientY;
    this.context.touchCount = e.touches.length;
  }

  private onTouchEnd(e: TouchEvent) {
    if (!this.context) return;

    const duration = Date.now() - this.context.startTime;
    const dx = this.context.lastX - this.context.startX;
    const dy = this.context.lastY - this.context.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const pressure = (e.changedTouches[0] as any).force ?? 1;

    let gesture: Gesture | null = null;

    if (this.context.touchCount === 2) {
      const currentDistance = this.getDistance(e.changedTouches);
      const scale = currentDistance / this.context.initialDistance;
      if (Math.abs(scale - 1) > 0.2) {
        gesture = {
          type: 'pinch-zoom',
          startX: this.context.startX,
          startY: this.context.startY,
          endX: this.context.lastX,
          endY: this.context.lastY,
          duration,
          intensity: Math.abs(scale - 1),
          pressure,
        };
      }
    } else if (duration > GESTURE_THRESHOLDS.LONG_PRESS_DURATION && distance < 10) {
      gesture = {
        type: 'long-press',
        startX: this.context.startX,
        startY: this.context.startY,
        endX: this.context.lastX,
        endY: this.context.lastY,
        duration,
        intensity: 1,
        pressure,
      };
    } else if (duration < GESTURE_THRESHOLDS.DOUBLE_TAP_INTERVAL && distance < 10) {
      const now = Date.now();
      if (now - this.lastTapTime < GESTURE_THRESHOLDS.DOUBLE_TAP_INTERVAL) {
        gesture = {
          type: 'double-tap',
          startX: this.context.startX,
          startY: this.context.startY,
          endX: this.context.lastX,
          endY: this.context.lastY,
          duration,
          intensity: 1,
          pressure,
        };
      } else {
        gesture = {
          type: 'tap',
          startX: this.context.startX,
          startY: this.context.startY,
          endX: this.context.lastX,
          endY: this.context.lastY,
          duration,
          intensity: 1,
          pressure,
        };
      }
      this.lastTapTime = now;
    } else if (duration < GESTURE_THRESHOLDS.SWIPE_MAX_DURATION && distance > GESTURE_THRESHOLDS.SWIPE_MIN_DISTANCE) {
      const isCircular = this.detectCircularSwipe(dx, dy);
      if (isCircular) {
        gesture = {
          type: 'circular-swipe',
          startX: this.context.startX,
          startY: this.context.startY,
          endX: this.context.lastX,
          endY: this.context.lastY,
          duration,
          intensity: distance / 100,
          pressure,
        };
      } else if (Math.abs(dy) > Math.abs(dx)) {
        gesture = {
          type: dy < 0 ? 'swipe-up' : 'swipe-down',
          startX: this.context.startX,
          startY: this.context.startY,
          endX: this.context.lastX,
          endY: this.context.lastY,
          duration,
          intensity: Math.abs(dy) / 100,
          pressure,
        };
      }
    }

    if (gesture) {
      this.emit(gesture);
    }

    this.context = null;
  }

  private detectCircularSwipe(dx: number, dy: number): boolean {
    // Detecta si el movimiento es aproximadamente circular (cambio en ambos ejes)
    return Math.abs(dx) > 20 && Math.abs(dy) > 20;
  }

  private getDistance(touches: TouchList | Touch[]): number {
    if (touches.length < 2) return 0;
    const t1 = touches[0] as any;
    const t2 = touches[1] as any;
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  subscribe(callback: (gesture: Gesture) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private emit(gesture: Gesture) {
    this.listeners.forEach((cb) => cb(gesture));
  }

  destroy() {
    this.element.removeEventListener('touchstart', (e) => this.onTouchStart(e));
    this.element.removeEventListener('touchmove', (e) => this.onTouchMove(e));
    this.element.removeEventListener('touchend', (e) => this.onTouchEnd(e));
  }
}
