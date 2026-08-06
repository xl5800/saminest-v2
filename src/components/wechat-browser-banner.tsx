const WECHAT_UA_MARKER = "MicroMessenger";

/**
 * 微信内置浏览器引导条：只在帖子详情页出现，不是全站通用（跟
 * app-shell.tsx 里"网络连接已断开"那条全站提示条不一样，那个是每个页面
 * 都可能用到，这个只有帖子详情页需要，所以单独做成组件，不塞进
 * app-shell.tsx）。
 *
 * 微信爬虫抓取 /post/:id 生成分享卡片这件事由 middleware.ts 在服务端处理
 * （注入 Open Graph 标签，爬虫不执行 JS，根本不会跑到这段前端代码）；这里
 * 处理的是另一个场景——真实用户在微信自带浏览器里点开这个链接，SPA 正常
 * 跑起来了，但微信不支持 Universal Links 在其内部浏览器里被动跳转 App，
 * 所以提示用户自己用"在浏览器中打开"切出去。App 内打开/下载按钮明确不在
 * 这次范围内（App 还没上架，没有可以跳转的链接目标），这次只做一条常驻
 * 提示，不做弹窗、不需要关闭按钮。
 *
 * 直接在渲染时读 navigator.userAgent（不用 state/effect）：这是纯客户端
 * 渲染的 SPA，没有服务端渲染 React 树、不存在 hydration 不一致的问题，
 * UA 在一次页面生命周期里也不会变，没必要为了这个多包一层 state。
 */
export function WechatBrowserBanner() {
  const isWechatBrowser = navigator.userAgent.includes(WECHAT_UA_MARKER);

  if (!isWechatBrowser) {
    return null;
  }

  return (
    <div role="status" className="bg-warning/10 px-4 py-2 text-center text-sm text-warning">
      点击右上角"···"选择"在浏览器中打开"，才能使用完整功能
    </div>
  );
}
