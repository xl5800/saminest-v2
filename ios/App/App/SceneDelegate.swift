import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // 回弹修复真正生效的地方：这个项目的根视图控制器是在这里直接
        // new 出来的，不走 Main.storyboard 那条路径（Main.storyboard 里
        // 虽然也改了 customClass，但从来不会被这个 App 实际调用到，是一次
        // 白改）。MainViewController.swift 里重写 viewDidLoad 把
        // Capacitor 默认关掉的 scrollView.bounces 重新打开，必须在这里
        // 换成实例化这个子类，那段代码才会真的被执行。
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
