import { Link } from "react-router-dom";

const headingClassName = "mb-2 mt-6 text-lg font-semibold text-text";
const subheadingClassName = "mb-1 mt-4 text-base font-medium text-text";
const paragraphClassName = "mb-4 text-base text-text";
const listClassName = "mb-4 list-disc space-y-1 pl-5 text-base text-text";

/**
 * 隐私政策公开页面（/privacy），路由不包 RequireAuth，跟 /terms 是同一个
 * 道理——法律文件访客必须能读。正文是逐字照抄的法务原文，结构拆分方式
 * （h2/h3/p/ul）自行决定，不影响文字内容本身。
 *
 * "联系我们"一节的反馈入口同 /terms 页面一样，换成站内真实的 /feedback
 * 路由，其余文字一字未改。链接文案本次任务从"意见反馈（Feedback）"改成
 * "联系客服（Feedback）"——跟这个入口在"我的"页/反馈页本身改的名字保持
 * 一致，不是照抄法务原文的措辞（法务原文本来就不是这个项目写的）。
 */
export function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-1 text-xl font-bold text-text">隐私政策</h1>
      <p className="mb-6 text-sm text-text-muted">Last Updated / 最后更新：2026-07-09</p>

      <p className={paragraphClassName}>欢迎使用 Saminest（以下简称"本平台"、"我们"）。</p>
      <p className={paragraphClassName}>我们尊重您的隐私，并致力于保护您的个人信息安全。</p>
      <p className={paragraphClassName}>
        本隐私政策说明我们如何收集、使用、存储、共享及保护您的个人信息。当您访问或使用本平台时，即表示您已阅读并同意本隐私政策。
      </p>

      <h2 className={headingClassName}>一、我们收集的信息</h2>
      <h3 className={subheadingClassName}>1. 您主动提供的信息</h3>
      <p className="mb-2 text-base text-text">包括但不限于：</p>
      <ul className={listClassName}>
        <li>邮箱地址</li>
        <li>用户昵称</li>
        <li>头像（如适用）</li>
        <li>发布的房源信息</li>
        <li>发布的求租信息</li>
        <li>发布的二手商品信息</li>
        <li>上传的图片</li>
        <li>联系方式（如您主动填写）</li>
        <li>意见反馈内容</li>
      </ul>
      <h3 className={subheadingClassName}>2. 自动收集的信息</h3>
      <p className="mb-2 text-base text-text">为了保障平台安全及改善用户体验，我们可能自动收集：</p>
      <ul className={listClassName}>
        <li>IP 地址</li>
        <li>浏览器类型</li>
        <li>操作系统</li>
        <li>设备信息</li>
        <li>屏幕尺寸</li>
        <li>访问时间</li>
        <li>页面浏览记录</li>
        <li>点击记录</li>
        <li>来源页面</li>
        <li>Cookie</li>
        <li>Session 信息</li>
      </ul>
      <h3 className={subheadingClassName}>3. 第三方登录（如未来支持）</h3>
      <p className={paragraphClassName}>
        若未来支持 Google、Apple 等登录方式，我们可能获取用户名称、邮箱和用户头像，仅限完成登录及账号管理所必需的信息。
      </p>

      <h2 className={headingClassName}>二、信息的使用目的</h2>
      <p className="mb-2 text-base text-text">我们可能将您的信息用于：</p>
      <ul className={listClassName}>
        <li>创建及管理账号</li>
        <li>登录验证</li>
        <li>发布房源</li>
        <li>发布求租</li>
        <li>发布二手商品</li>
        <li>展示用户内容</li>
        <li>提供平台功能</li>
        <li>发送必要通知</li>
        <li>防止垃圾信息</li>
        <li>防止诈骗</li>
        <li>风险控制</li>
        <li>统计访问数据</li>
        <li>优化网站性能</li>
        <li>改善用户体验</li>
        <li>回应用户反馈</li>
      </ul>
      <p className={paragraphClassName}>我们不会将您的个人信息出售给任何第三方。</p>

      <h2 className={headingClassName}>三、Cookie</h2>
      <p className={paragraphClassName}>
        为了提供更好的服务，本平台可能使用 Cookie。Cookie 可用于保持登录状态、保存用户偏好、提高访问速度、防止重复登录、网站统计分析及提升用户体验。
      </p>
      <p className={paragraphClassName}>
        您可以通过浏览器关闭 Cookie。关闭 Cookie 后，部分功能可能无法正常使用。
      </p>

      <h2 className={headingClassName}>四、信息共享</h2>
      <p className="mb-2 text-base text-text">除以下情况外，我们不会出售、出租或公开您的个人信息：</p>
      <h3 className={subheadingClassName}>获得您的授权</h3>
      <p className={paragraphClassName}>您明确同意共享。</p>
      <h3 className={subheadingClassName}>法律要求</h3>
      <p className={paragraphClassName}>根据法律法规、法院命令或政府机关要求，依法提供必要信息。</p>
      <h3 className={subheadingClassName}>平台安全</h3>
      <p className={paragraphClassName}>为了防止诈骗、防止违法行为、保护用户权益及维护平台安全，平台可能披露必要信息。</p>
      <h3 className={subheadingClassName}>第三方服务</h3>
      <p className={paragraphClassName}>
        平台可能使用第三方服务提供商协助运营，例如 Supabase（数据库及身份验证）、Vercel（网站托管）、Cloudflare（CDN 与安全）、Google Analytics（访问统计，如启用）和 Microsoft Clarity（用户行为分析，如启用）。第三方可能根据其自身隐私政策处理必要的数据。
      </p>

      <h2 className={headingClassName}>五、数据存储</h2>
      <p className={paragraphClassName}>
        您的数据可能存储于第三方云服务器。平台会采取合理措施保护数据安全，包括 HTTPS 加密传输、权限控制、身份验证、数据备份和安全监控。
      </p>
      <p className={paragraphClassName}>尽管如此，没有任何互联网系统能够保证绝对安全。</p>

      <h2 className={headingClassName}>六、数据保留</h2>
      <p className={paragraphClassName}>我们将在实现本政策所述目的所必需的期限内保留您的信息。</p>
      <p className={paragraphClassName}>
        在法律法规要求、解决纠纷、防止欺诈、配合调查或履行法律义务的情况下，我们可能保留部分信息。
      </p>

      <h2 className={headingClassName}>七、用户权利</h2>
      <p className={paragraphClassName}>
        您有权查看自己的资料、修改资料、修改发布内容、删除发布内容、删除账号（如平台提供），以及请求删除依法无需保留的个人信息。
      </p>
      <p className={paragraphClassName}>平台将在合理期限内处理您的请求。</p>

      <h2 className={headingClassName}>八、儿童隐私</h2>
      <p className={paragraphClassName}>Saminest 不面向 13 岁以下儿童提供服务。</p>
      <p className={paragraphClassName}>
        如果我们发现儿童未经监护人同意提供个人信息，我们将在核实后尽快删除相关数据。
      </p>

      <h2 className={headingClassName}>九、安全措施</h2>
      <p className={paragraphClassName}>
        为了保护您的数据，我们采取包括但不限于 HTTPS 加密、身份认证、权限控制、安全更新、风险监测和数据备份等措施。
      </p>
      <p className={paragraphClassName}>请您妥善保管自己的账号和密码。如发现账号异常，请及时修改密码。</p>

      <h2 className={headingClassName}>十、第三方链接</h2>
      <p className={paragraphClassName}>
        平台可能包含房东网站、外部资源或第三方服务等链接。点击第三方链接后，相关网站的隐私政策将适用于您。
      </p>
      <p className={paragraphClassName}>Saminest 不对第三方网站负责。</p>

      <h2 className={headingClassName}>十一、国际数据传输</h2>
      <p className={paragraphClassName}>
        由于互联网服务具有全球性质，您的信息可能会在不同国家或地区进行处理和存储。我们将采取合理措施确保您的信息获得适当保护。
      </p>

      <h2 className={headingClassName}>十二、政策更新</h2>
      <p className={paragraphClassName}>
        我们可能根据法律法规变化、平台业务发展或产品更新修改本隐私政策。更新后的版本将在本页面公布。
      </p>
      <p className={paragraphClassName}>继续使用平台即表示您同意最新版本。</p>

      <h2 className={headingClassName}>十三、联系我们</h2>
      <p className={paragraphClassName}>
        如果您对本隐私政策有任何疑问、建议或请求，可通过网站内的
        <Link to="/feedback" className="text-primary underline">
          联系客服（Feedback）
        </Link>
        页面联系我们。
      </p>

      <p className="mb-4 text-base text-text">
        感谢您对 Saminest 的信任。我们将持续努力保护您的个人信息安全，并为您提供安全、可靠的租房、求租和二手交易平台。
      </p>
    </main>
  );
}
