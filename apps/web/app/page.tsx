import { redirect } from 'next/navigation';

// K3：Creator Chat 为应用默认页（Track J 门禁已满足）。
// 打开应用即进入持续对话创作面；侧栏「创作对话」常驻可达。
export default function HomePage() {
  redirect('/creator-chats');
}
