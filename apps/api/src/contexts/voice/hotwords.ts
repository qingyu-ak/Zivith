// ADR-0017: 热词来自世界实体「名称」,不是小说导入切出来的别名碎片。
// 「诺诺点 / 可诺诺也」这类 n-gram 会拉偏 zipformer,专名反而认不准。

const MAX_HOTWORDS = 300;
/** 功能字/标点:出现则不像专名。 */
const NOT_A_NAME = /[的了在也是和与或着过地得吗呢吧啊，。、；：！？,.;:!?()（）【】]/;

export interface HotwordSource {
  name?: string | null;
}

export function isNameLikeHotword(value: string): boolean {
  const word = value.trim();
  if (word.length < 2 || word.length > 16) return false;
  if (NOT_A_NAME.test(word)) return false;
  if (/\s/.test(word) && !/^[A-Za-z][A-Za-z0-9' -]{1,15}$/.test(word)) return false;
  return true;
}

/** 只收名称与事件标题;别名一律丢弃(导入切片不是专名)。 */
export function collectHotwords(
  assets: HotwordSource[],
  eventTitles: Array<string | null | undefined>,
): string[] {
  const words = new Set<string>();
  for (const asset of assets) {
    if (asset.name && isNameLikeHotword(asset.name)) words.add(asset.name.trim());
  }
  for (const title of eventTitles) {
    if (title && isNameLikeHotword(title)) words.add(title.trim());
  }
  return [...words].slice(0, MAX_HOTWORDS);
}
