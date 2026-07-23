export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
  simulated?: boolean;
}

export interface CameraFrame {
  dataUrl: string;
  timestamp: Date;
  simulated?: boolean;
}

// ── Simulated position (Buenos Aires, Argentina) ────────────────────────────
const SIMULATED_LOCATION: LocationData = {
  latitude: -34.6037,
  longitude: -58.3816,
  accuracy: 50,
  timestamp: new Date(),
  simulated: true,
};

const GPS_TIMEOUT_MS = 3_000;

// ── Simulated camera frame (1x1 dark grey pixel JPEG) ───────────────────────
const SIMULATED_FRAME_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC0zNDI/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrqztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQITASEDEhMhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrqztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

class HardwareIntegration {
  private locationListeners: ((loc: LocationData) => void)[] = [];
  private cameraListeners: ((frame: CameraFrame) => void)[] = [];
  private watchId: number | null = null;
  private currentLocation: LocationData | null = null;
  private videoStream: MediaStream | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;

  async initializeCamera(videoElement: HTMLVideoElement): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      this.videoStream = stream;
      videoElement.srcObject = stream;
      this.captureFrames(videoElement);
      return true;
    } catch {
      this.startSimulatedCamera();
      return true;
    }
  }

  private simulatedCameraInterval: ReturnType<typeof setInterval> | null = null;

  private startSimulatedCamera() {
    if (this.simulatedCameraInterval) return;
    this.simulatedCameraInterval = setInterval(() => {
      const frame: CameraFrame = {
        dataUrl: SIMULATED_FRAME_DATA_URL,
        timestamp: new Date(),
        simulated: true,
      };
      this.cameraListeners.forEach((cb) => cb(frame));
    }, 100);
  }

  private stopSimulatedCamera() {
    if (this.simulatedCameraInterval) {
      clearInterval(this.simulatedCameraInterval);
      this.simulatedCameraInterval = null;
    }
  }

  private captureFrames(videoElement: HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1920;
    canvas.height = videoElement.videoHeight || 1080;
    this.canvasContext = canvas.getContext('2d');

    const interval = setInterval(() => {
      if (!this.canvasContext || !videoElement.videoWidth) return;

      try {
        this.canvasContext.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const frame: CameraFrame = {
          dataUrl: canvas.toDataURL('image/jpeg', 0.7),
          timestamp: new Date(),
        };

        this.cameraListeners.forEach((cb) => cb(frame));
      } catch (e) {
        console.error('Frame capture error:', e);
      }
    }, 100);

    return () => clearInterval(interval);
  }

  async initializeGeolocation(): Promise<boolean> {
    if (!navigator.geolocation) {
      this.startSimulatedLocation();
      return true;
    }

    let resolved = false;

    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        this.startSimulatedLocation();
      }
    }, GPS_TIMEOUT_MS);

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          resolved = true;
          clearTimeout(fallbackTimer);
          this.stopSimulatedLocation();
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(),
          };

          this.currentLocation = locationData;
          this.locationListeners.forEach((cb) => cb(locationData));
        },
        () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(fallbackTimer);
            this.startSimulatedLocation();
          }
        },
        {
          enableHighAccuracy: true,
          timeout: GPS_TIMEOUT_MS,
          maximumAge: 0,
        }
      );

      return true;
    } catch {
      clearTimeout(fallbackTimer);
      this.startSimulatedLocation();
      return true;
    }
  }

  private simulatedLocationInterval: ReturnType<typeof setInterval> | null = null;

  private startSimulatedLocation() {
    if (this.simulatedLocationInterval) return;
    this.currentLocation = { ...SIMULATED_LOCATION, timestamp: new Date() };
    this.locationListeners.forEach((cb) => cb(this.currentLocation!));
    this.simulatedLocationInterval = setInterval(() => {
      const drift = 0.0001;
      this.currentLocation = {
        ...SIMULATED_LOCATION,
        latitude: SIMULATED_LOCATION.latitude + (Math.random() - 0.5) * drift,
        longitude: SIMULATED_LOCATION.longitude + (Math.random() - 0.5) * drift,
        accuracy: 40 + Math.random() * 20,
        timestamp: new Date(),
        simulated: true,
      };
      this.locationListeners.forEach((cb) => cb(this.currentLocation!));
    }, 2000);
  }

  private stopSimulatedLocation() {
    if (this.simulatedLocationInterval) {
      clearInterval(this.simulatedLocationInterval);
      this.simulatedLocationInterval = null;
    }
  }

  subscribeToLocation(callback: (loc: LocationData) => void): () => void {
    this.locationListeners.push(callback);
    return () => {
      this.locationListeners = this.locationListeners.filter((l) => l !== callback);
    };
  }

  subscribeToCamera(callback: (frame: CameraFrame) => void): () => void {
    this.cameraListeners.push(callback);
    return () => {
      this.cameraListeners = this.cameraListeners.filter((l) => l !== callback);
    };
  }

  getCurrentLocation(): LocationData | null {
    return this.currentLocation;
  }

  stopCamera() {
    this.stopSimulatedCamera();
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
      this.videoStream = null;
    }
  }

  stopGeolocation() {
    this.stopSimulatedLocation();
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  shutdown() {
    this.stopCamera();
    this.stopGeolocation();
  }
}

export const hardwareIntegration = new HardwareIntegration();
