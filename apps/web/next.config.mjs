/** @type {import('next').NextConfig} */
const nextConfig = {
  // 工作区包以 TS 源码形式被消费：UI 组件、空间视图（@zivith/cosmos）、领域合同子路径（@zivith/domain/space）。
  transpilePackages: ['@zivith/ui', '@zivith/cosmos', '@zivith/domain'],
  // 桌面创作面不要露出 Next 开发角标（左下黑底 N）。
  devIndicators: false,
  // 用户环境用 127.0.0.1 访问（本机代理劫持 localhost），允许其 HMR 连接，
  // 否则 dev 期间组件改动不热更新（加载旧编译产物导致报错）。
  allowedDevOrigins: ['127.0.0.1'],
  async redirects() {
    return [
      { source: '/signup', destination: '/register', permanent: false },
      { source: '/studio', destination: '/projects', permanent: false },
    ];
  },
};

export default nextConfig;
