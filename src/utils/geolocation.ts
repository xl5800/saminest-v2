/**
 * 首页"附近的二手"任务卡：取手机的大概位置。
 *
 * App 里（Capacitor 的 WebView）和网页版都用浏览器自带的定位接口，不额外装
 * 插件：iOS 靠 Info.plist 的 NSLocationWhenInUseUsageDescription 弹系统权限框，
 * Android 由 Capacitor 的 WebView 按 AndroidManifest 里声明的定位权限去申请。
 *
 * 不开高精度（enableHighAccuracy: false）：几百米误差足够，定位更快、更省电，
 * 隐私也更好；10 分钟内的缓存位置可以直接用。
 *
 * 只能在用户主动点"用我现在的位置"时调用——苹果要求在用到的时候才请求权限。
 */
export type GeolocationFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function getApproximatePosition(): Promise<Coordinates> {
  return new Promise((resolve, reject: (reason: GeolocationFailure) => void) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject("unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) reject("denied");
        else if (error.code === error.TIMEOUT) reject("timeout");
        else reject("unavailable");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  });
}
