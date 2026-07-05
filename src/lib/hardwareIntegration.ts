export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface CameraFrame {
  dataUrl: string;
  timestamp: Date;
}

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
          facingMode: 'environment', // Back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      this.videoStream = stream;
      videoElement.srcObject = stream;

      // Start capturing frames every 100ms
      this.captureFrames(videoElement);

      return true;
    } catch (error) {
      console.warn('Camera access denied or unavailable:', error);
      return false;
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
      console.warn('Geolocation not available');
      return false;
    }

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(),
          };

          this.currentLocation = locationData;
          this.locationListeners.forEach((cb) => cb(locationData));
        },
        (error) => {
          console.error('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );

      return true;
    } catch (error) {
      console.warn('Geolocation initialization failed:', error);
      return false;
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
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
      this.videoStream = null;
    }
  }

  stopGeolocation() {
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
