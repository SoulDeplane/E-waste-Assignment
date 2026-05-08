export interface Coords {
  lat: number;
  lng: number;
}

// Resolves the browser's current latitude and longitude via the Geolocation API.
export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Failed to get location')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}
