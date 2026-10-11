import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.saminest.app",
  appName: "Saminest",
  webDir: "dist",
  server: {
    androidScheme: "https"
  },
  plugins: {
    // 启动图不自动收起：等首页第一屏数据返回再由代码收起（最多等 3 秒），
    // 避免启动图一闪而过之后看到"加载中"，见 src/app/splash-screen.ts。
    SplashScreen: {
      launchAutoHide: false
    }
  }
};

export default config;
