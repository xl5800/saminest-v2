import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.saminest.app",
  appName: "Saminest",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
