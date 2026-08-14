/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@zivith/ui'],
  // 用户环境用 127.0.0.1 访问（本机代理劫持 localhost），允许其 HMR 连接，
  // 否则 dev 期间组件改动不热更新（加载旧编译产物导致报错）。
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
