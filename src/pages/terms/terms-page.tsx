import { Link } from "react-router-dom";

const headingClassName = "mb-2 mt-6 text-lg font-semibold text-text";
const subheadingClassName = "mb-1 mt-4 text-base font-medium text-text";
const paragraphClassName = "mb-4 text-base text-text";
const listClassName = "mb-4 list-disc space-y-1 pl-5 text-base text-text";
const orderedListClassName = "mb-4 list-decimal space-y-1 pl-5 text-base text-text";

/**
 * 用户协议公开页面（/terms），路由不包 RequireAuth——法律文件访客必须能读，
 * 包括还没注册的人。正文是逐字照抄的法务原文，不做任何改写/精简/
 * "优化措辞"；HTML 结构（h2/h3/p/ul/ol 怎么拆）是这次渲染时自行决定的，
 * 不影响文字内容本身。
 *
 * 唯一的例外是"联系我们"一节提到的意见反馈入口：原始法务素材里那处写的是
 * 一个外部预览域名的 hash 链接，不是站内真实路径，这里换成真实存在的
 * /feedback 路由，用 <Link> 而不是裸 <a>，其余文字一字未改。
 */
export function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-1 text-xl font-bold text-text">用户协议</h1>
      <p className="mb-6 text-sm text-text-muted">Last Updated / 最后更新：2026-07-09</p>

      <p className={paragraphClassName}>
        欢迎使用 Saminest（以下简称"本平台"、"Saminest"、"我们"）。
      </p>
      <p className={paragraphClassName}>
        本协议适用于所有访问、浏览、注册、发布信息或使用本平台服务的用户。
      </p>
      <p className={paragraphClassName}>
        在使用本平台之前，请您仔细阅读本协议。当您访问、注册账号或使用本平台时，即表示您已经阅读、理解并同意接受本协议全部内容。
      </p>

      <h2 className={headingClassName}>一、平台介绍</h2>
      <p className="mb-2 text-base text-text">Saminest 是一个在线信息发布平台，目前主要提供：</p>
      <ul className={listClassName}>
        <li>房屋出租（Rental Listings）</li>
        <li>求租信息（Housing Wanted）</li>
        <li>二手交易（Marketplace）</li>
      </ul>
      <p className="mb-2 text-base text-text">平台仅提供信息发布、浏览及交流服务。</p>
      <p className={paragraphClassName}>
        Saminest 不是房东、卖家、中介、经纪人、支付机构或物流服务提供者。平台不会参与任何用户之间的实际交易。
      </p>

      <h2 className={headingClassName}>二、用户资格</h2>
      <p className="mb-2 text-base text-text">使用本平台即表示您承诺：</p>
      <ol className={orderedListClassName}>
        <li>您具有合法使用本平台的资格；</li>
        <li>您提供的信息真实、准确、完整；</li>
        <li>您不会冒充他人；</li>
        <li>您不会利用平台从事违法活动；</li>
        <li>您将妥善保管账号及密码。</li>
      </ol>
      <p className={paragraphClassName}>用户应对自己账号内发生的一切行为承担责任。</p>

      <h2 className={headingClassName}>三、账号注册</h2>
      <p className="mb-2 text-base text-text">注册账号时，用户可能需要提供：</p>
      <ul className={listClassName}>
        <li>邮箱</li>
        <li>用户昵称</li>
        <li>登录信息</li>
      </ul>
      <p className="mb-2 text-base text-text">用户不得：</p>
      <ul className={listClassName}>
        <li>冒充他人</li>
        <li>使用虚假身份</li>
        <li>恶意注册多个账号</li>
        <li>使用机器人批量注册</li>
      </ul>
      <p className={paragraphClassName}>平台有权拒绝任何异常注册申请。</p>

      <h2 className={headingClassName}>四、平台服务</h2>
      <h3 className={subheadingClassName}>房屋出租</h3>
      <p className={paragraphClassName}>
        用户可以发布 Apartment、Condo、House、Townhouse、Room、Studio 等出租信息。
      </p>
      <h3 className={subheadingClassName}>求租</h3>
      <p className={paragraphClassName}>用户可以发布求租需求、合租需求、找室友等信息。</p>
      <h3 className={subheadingClassName}>二手交易</h3>
      <p className={paragraphClassName}>
        用户可以发布家具、电器、数码产品、汽车用品、学习用品、生活用品，以及法律允许交易的其他物品。
      </p>
      <p className={paragraphClassName}>
        平台未来可能增加新的功能。平台有权调整、暂停或终止部分服务，而无需提前通知。
      </p>

      <h2 className={headingClassName}>五、信息发布规范</h2>
      <p className={paragraphClassName}>所有用户发布的信息必须真实、合法、准确，并且不侵犯他人权益。</p>
      <h3 className={subheadingClassName}>虚假内容</h3>
      <ul className={listClassName}>
        <li>虚假房源</li>
        <li>虚假价格</li>
        <li>虚假图片</li>
        <li>虚假联系方式</li>
        <li>虚假身份</li>
      </ul>
      <h3 className={subheadingClassName}>欺诈行为</h3>
      <ul className={listClassName}>
        <li>收取定金后失联</li>
        <li>冒充房东</li>
        <li>冒充买家</li>
        <li>冒充平台工作人员</li>
        <li>网络诈骗</li>
      </ul>
      <h3 className={subheadingClassName}>非法内容</h3>
      <ul className={listClassName}>
        <li>色情内容</li>
        <li>赌博信息</li>
        <li>毒品</li>
        <li>武器交易</li>
        <li>非法服务</li>
        <li>洗钱</li>
        <li>金融诈骗</li>
      </ul>
      <h3 className={subheadingClassName}>垃圾内容</h3>
      <ul className={listClassName}>
        <li>重复发帖</li>
        <li>恶意广告</li>
        <li>自动发帖</li>
        <li>机器人发帖</li>
        <li>批量刷帖</li>
      </ul>
      <h3 className={subheadingClassName}>侵权内容</h3>
      <ul className={listClassName}>
        <li>他人图片</li>
        <li>他人文字</li>
        <li>商标</li>
        <li>版权内容</li>
        <li>个人隐私</li>
      </ul>
      <p className={paragraphClassName}>未经授权不得发布。</p>

      <h2 className={headingClassName}>六、内容审核</h2>
      <p className={paragraphClassName}>
        平台有权审核帖子、修改分类、删除内容、下架帖子、屏蔽图片、限制账号功能或永久封禁账号。平台无需提前通知用户。
      </p>

      <h2 className={headingClassName}>七、交易风险</h2>
      <p className={paragraphClassName}>
        平台仅提供信息展示。所有交易均由用户自行决定，包括但不限于看房、签合同、面交、邮寄、转账及付款。
      </p>
      <p className={paragraphClassName}>
        平台不会担保房源真实性、商品真实性、房东身份、买家身份、商品质量或合同履行。请用户自行判断交易风险。
      </p>

      <h2 className={headingClassName}>八、安全提示</h2>
      <p className="mb-2 text-base text-text">为了保护您的财产安全，我们建议：</p>
      <ul className={listClassName}>
        <li>实地看房</li>
        <li>当面交易</li>
        <li>核实身份</li>
        <li>使用安全支付方式</li>
        <li>不向陌生人提前支付定金</li>
      </ul>
      <p className={paragraphClassName}>如果发现诈骗，请立即停止交易，并及时向有关部门举报。</p>

      <h2 className={headingClassName}>九、用户内容</h2>
      <p className={paragraphClassName}>用户发布的内容，包括图片、标题、描述和评论，其知识产权归用户所有。</p>
      <p className={paragraphClassName}>
        用户授予平台一项全球范围内、非独占、免版税的许可，用于展示、存储、复制、推广和运营平台服务。
      </p>
      <p className={paragraphClassName}>
        如果用户删除内容，该授权将在合理时间内终止，但法律要求保留或系统备份中的内容除外。
      </p>

      <h2 className={headingClassName}>十、知识产权</h2>
      <p className={paragraphClassName}>
        Saminest 网站中的 Logo、页面设计、UI、程序代码、数据库、图标和文本（用户发布内容除外）均属于平台所有。未经许可不得复制、转载或商业使用。
      </p>

      <h2 className={headingClassName}>十一、账号暂停与终止</h2>
      <p className={paragraphClassName}>
        如用户违反本协议，平台有权删除帖子、限制发帖、暂停账号、永久封禁账号或删除账号，无需提前通知。
      </p>

      <h2 className={headingClassName}>十二、免责声明</h2>
      <p className="mb-2 text-base text-text">在法律允许范围内，平台不承担以下责任：</p>
      <ul className={listClassName}>
        <li>用户被骗</li>
        <li>房屋纠纷</li>
        <li>商品质量问题</li>
        <li>合同纠纷</li>
        <li>支付纠纷</li>
        <li>用户之间的任何争议</li>
        <li>第三方行为造成的损失</li>
        <li>网络中断</li>
        <li>数据丢失</li>
        <li>不可抗力</li>
      </ul>
      <p className={paragraphClassName}>用户使用平台的风险由用户自行承担。</p>

      <h2 className={headingClassName}>十三、第三方服务</h2>
      <p className={paragraphClassName}>
        平台可能使用第三方服务，包括但不限于 Supabase（数据库及身份验证）、Vercel（网站托管）、Cloudflare（网络安全与加速）、Google Analytics（如启用）及 Microsoft Clarity（如启用）。
      </p>
      <p className={paragraphClassName}>第三方服务受其各自条款和隐私政策约束。</p>

      <h2 className={headingClassName}>十四、协议修改</h2>
      <p className={paragraphClassName}>
        平台有权根据业务发展或法律法规要求修改本协议。修改后的协议将在网站公布。继续使用平台即表示您接受最新版本。
      </p>

      <h2 className={headingClassName}>十五、适用法律</h2>
      <p className={paragraphClassName}>
        本协议受适用法律管辖。如因本协议产生争议，双方应首先友好协商解决；协商不成的，可依法向有管辖权的法院提起诉讼。
      </p>

      <h2 className={headingClassName}>十六、联系我们</h2>
      <p className={paragraphClassName}>
        如果您对本协议有任何疑问，可通过网站内的
        <Link to="/feedback" className="text-primary underline">
          意见反馈（Feedback）
        </Link>
        页面与我们联系。
      </p>

      <p className="mb-4 text-base text-text">
        感谢您使用 Saminest。我们致力于打造一个真实、安全、友好的租房、求租及二手交易社区。
      </p>
    </main>
  );
}
