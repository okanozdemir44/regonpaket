import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.regon.paket",
  appName: "DoyDoy Kurye",
  webDir: "out",
  plugins: {
    Geolocation: {
      // Android 12+ için yüksek doğruluk
    },
  },
};

export default config;
