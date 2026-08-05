import { useEffect, useState } from "react";

/**
 * 浏览器/WebView 的网络连接状态：初始值读 navigator.onLine，之后靠 window
 * 的 online/offline 事件保持同步。这一轮不做离线缓存/Service Worker，
 * 只是给用户一个"网络断开了"的明确提示，不是让 App 具备离线可用能力，
 * 见 AppShell 里怎么用这个 hook 的说明。
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function handleOnline(): void {
      setIsOnline(true);
    }
    function handleOffline(): void {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
