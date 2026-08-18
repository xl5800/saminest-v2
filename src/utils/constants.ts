// 生产域名写死在这里，不能用 window.location.origin 拼——capacitor.config.ts
// 没配 server.url，App 里跑的时候 location.origin 是 Capacitor 本地资源地址
// （Android 是 https://localhost，见该配置文件的 androidScheme），不是
// https://www.saminest.com，拿这个拼分享链接对方点了打不开。
//
// 这个常量最初只在 post-detail-page.tsx 里（帖子分享），活动详情页
// （activity-detail-page.tsx）加分享按钮时会用到同一个域名拼同一种
// "分享链接"，两处的取值理由完全一样、不会各自演化出不同的值，抽到这个
// 共享文件里，不在两个页面各写一份容易在换域名时漏改一处。
export const PRODUCTION_ORIGIN = "https://www.saminest.com";
