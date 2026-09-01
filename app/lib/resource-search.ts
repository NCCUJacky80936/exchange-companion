import type { ResourceItem } from "./types";

export const RESOURCE_GROUPS = [
  "申請與行政",
  "學校與學業",
  "住宿與生活",
  "交通與行李",
  "料理與採買",
  "其他",
] as const;

export type ResourceGroup = (typeof RESOURCE_GROUPS)[number];
export type ResourceTypeFilter = "all" | ResourceItem["type"];
export type ResourcePrivacyFilter = "all" | ResourceItem["privacy"];
export type ResourceSort = "relevance" | "updated" | "title";

export interface ResourceSearchOptions {
  query?: string;
  group?: "全部" | ResourceGroup;
  type?: ResourceTypeFilter;
  privacy?: ResourcePrivacyFilter;
  sort?: ResourceSort;
}

const resourceTypeLabel: Record<ResourceItem["type"], string> = {
  official: "官方",
  school: "學校",
  city: "城市",
  experience: "經驗分享",
  personal: "個人資料",
};

const searchConcepts = [
  ["簽證", "學生簽證", "visa", "居留", "居留證", "residence permit"],
  ["住宿", "宿舍", "租屋", "租房", "房租", "租約", "housing", "dorm"],
  ["交通", "大眾運輸", "公車", "地鐵", "vvs", "transport"],
  ["德鐵", "db", "deutsche bahn", "db navigator"],
  ["火車", "鐵路", "train", "bahn"],
  ["買票", "購票", "車票", "票券", "ticket", "d ticket", "deutschlandticket"],
  ["行李", "托運", "手提", "隨身", "登機箱", "baggage", "luggage", "海關"],
  ["食譜", "料理", "煮飯", "食材", "菜單", "recipe", "採買", "超市"],
  ["學業", "學校", "課程", "選課", "考試", "學分", "learning agreement", "行事曆"],
  ["保險", "健康保險", "醫療保險", "tk", "insurance", "健保"],
  ["財務", "銀行", "開戶", "封鎖帳戶", "blocked account", "expatrio", "付款"],
  ["醫療", "看醫生", "診所", "藥局", "急診", "health", "doctor"],
  ["網路", "電話", "門號", "sim", "esim", "電信", "手機"],
  ["行政", "住址登記", "anmeldung", "報到", "註冊", "登記"],
] as const;

const stopPhrases = [
  "可以幫我",
  "我想要",
  "我想找",
  "想找",
  "幫我",
  "請問",
  "怎麼辦",
  "怎麼",
  "如何",
  "哪裡",
  "我要",
  "相關",
  "資料",
  "資訊",
  "一下",
  "查詢",
  "搜尋",
  "找",
  "的",
] as const;

export function normalizeResourceSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-TW")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function aliasIncluded(haystack: string, rawAlias: string): boolean {
  const alias = normalizeResourceSearchText(rawAlias);
  if (!alias) return false;
  if (/^[a-z0-9]{1,2}$/.test(alias)) return (` ${haystack} `).includes(` ${alias} `);
  return haystack.includes(alias);
}

function queryClauses(rawQuery: string): string[][] {
  const query = normalizeResourceSearchText(rawQuery);
  if (!query) return [];

  const conceptClauses = searchConcepts
    .map((aliases) => aliases.map(normalizeResourceSearchText))
    .filter((aliases) => aliases.some((alias) => aliasIncluded(query, alias)));
  const matchedAliases = [...new Set(conceptClauses.flat().filter((alias) => aliasIncluded(query, alias)))]
    .sort((left, right) => right.length - left.length);

  let remainder = query;
  [...matchedAliases, ...stopPhrases.map(normalizeResourceSearchText).sort((left, right) => right.length - left.length)]
    .forEach((phrase) => { remainder = remainder.split(phrase).join(" "); });
  const remainingTerms = normalizeResourceSearchText(remainder)
    .split(" ")
    .filter((term) => term && (term.length > 1 || /[\u3400-\u9fff]/u.test(term)))
    .map((term) => [term]);

  const clauses = [...conceptClauses, ...remainingTerms];
  return clauses.length ? clauses : [[query]];
}

export function resourceGroup(category: string): ResourceGroup {
  if (/食譜|料理|食材|採買|超市|菜單/.test(category)) return "料理與採買";
  if (/學校|學業|日曆|選課|課程|考試|學分|校園/.test(category)) return "學校與學業";
  if (/交通|航班|飛機|行李|海關|火車|票券|鐵路|機票/.test(category)) return "交通與行李";
  if (/住宿|生活|醫療|緊急|網路|門號|電信/.test(category)) return "住宿與生活";
  if (/簽證|居留|行政|財力|保險|銀行|報到|登記/.test(category)) return "申請與行政";
  return "其他";
}

function scoreResource(resource: ResourceItem, rawQuery: string): number {
  const clauses = queryClauses(rawQuery);
  if (!clauses.length) return 0;
  const fields: Array<[string, number]> = [
    [resource.title, 16],
    [(resource.searchTags ?? []).join(" "), 14],
    [resource.category, 12],
    [resourceGroup(resource.category), 10],
    [resource.description, 7],
    [resource.details ?? "", 4],
    [resource.sourceLabel, 3],
    [resource.region, 2],
    [resourceTypeLabel[resource.type], 2],
    [resource.privacy === "private" ? "私人" : "可分享", 1],
  ].map(([value, weight]) => [normalizeResourceSearchText(value), weight]);

  let score = 0;
  for (const aliases of clauses) {
    let best = 0;
    for (const [field, weight] of fields) {
      if (aliases.some((alias) => aliasIncluded(field, alias))) best = Math.max(best, weight);
    }
    if (!best) return 0;
    score += best;
  }

  const query = normalizeResourceSearchText(rawQuery);
  if (normalizeResourceSearchText(resource.title).includes(query)) score += 24;
  if ((resource.searchTags ?? []).some((tag) => normalizeResourceSearchText(tag) === query)) score += 16;
  return score;
}

export function searchResources(resources: ResourceItem[], options: ResourceSearchOptions = {}): ResourceItem[] {
  const query = options.query?.trim() ?? "";
  const group = options.group ?? "全部";
  const type = options.type ?? "all";
  const privacy = options.privacy ?? "all";
  const sort = options.sort ?? "relevance";

  const matches = resources
    .filter((resource) => group === "全部" || resourceGroup(resource.category) === group)
    .filter((resource) => type === "all" || resource.type === type)
    .filter((resource) => privacy === "all" || resource.privacy === privacy)
    .map((resource, index) => ({ resource, index, score: query ? scoreResource(resource, query) : 0 }))
    .filter((item) => !query || item.score > 0);

  matches.sort((left, right) => {
    if (sort === "relevance" && query && right.score !== left.score) return right.score - left.score;
    if (sort === "title") {
      const order = left.resource.title.localeCompare(right.resource.title, "zh-Hant");
      return order || left.index - right.index;
    }
    const verifiedOrder = right.resource.verifiedAt.localeCompare(left.resource.verifiedAt);
    return verifiedOrder || left.index - right.index;
  });

  return matches.map((item) => item.resource);
}
