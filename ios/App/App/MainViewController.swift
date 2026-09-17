import UIKit
import Capacitor

/**
 * 修复"帖子列表滑到顶部/底部边界停止得很生硬、没有回弹效果"：
 *
 * Capacitor 官方的 CAPBridgeViewController 在内部准备 WKWebView 那一步
 * （prepareWebView，私有方法，改不了）会主动把 webView.scrollView.bounces
 * 设成 false——这是 Capacitor 框架自己的默认行为（GitHub 上
 * ionic-team/capacitor 的 CAPBridgeViewController.swift 源码可以看到这一
 * 行），不是这个项目之前哪次改动不小心关掉的，之前找遍这个项目自己的代码
 * （index.css、mobile-bootstrap.ts、AppDelegate.swift）都没有找到关掉回弹
 * 的地方，原因就在这——它压根不在这个项目自己的代码里，而是 Capacitor 库
 * 内置的默认值。之前"iOS 沉浸式状态栏 + 安全区适配"那次改动（overlay:
 * true）解决的是状态栏黑边的问题，跟这个回弹问题是两回事，没有覆盖到。
 *
 * 修法：子类化 CAPBridgeViewController，在 viewDidLoad 里等
 * super.viewDidLoad() 跑完（这时 webView 已经创建好、Capacitor 已经把
 * bounces 设成 false 了）之后，再显式改回 true。额外加上
 * alwaysBounceVertical = true，是 iOS 16 上一个已知系统问题的通用
 * workaround（只设 bounces = true 在部分 iOS 16 真机上不完全生效）。
 *
 * 要让这个类生效，Main.storyboard 里 Bridge View Controller 的
 * customClass 需要从 CAPBridgeViewController（Capacitor 模块）改成这个
 * MainViewController（App 模块）——见该文件改动。
 */
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
    }
}
