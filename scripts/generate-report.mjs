import { mkdir, writeFile } from "node:fs/promises";

// 官方新闻/公告栏目。每篇文章会再次读取发布日期，未在近 7 天发布的不会进入晨报。
const sources = [
  ["flight", "中国民航局", "https://www.caac.gov.cn/XXGK/XXGK/TZTG/"],
  ["visa", "国家移民管理局", "https://www.nia.gov.cn/n741435/n741517/index.html"],
  ["visa", "中国领事服务网", "https://cs.mfa.gov.cn/"],
  ["international", "外交部", "https://www.mfa.gov.cn/web/zyxw/"],
  ["visa", "澳大利亚内政部", "https://immi.homeaffairs.gov.au/"],
  ["international", "澳大利亚外交贸易部", "https://www.dfat.gov.au/news/media-release"],
  ["flight", "澳大利亚航空安全局", "https://www.aviation.gov.au/about-us/news"],
  ["visa", "新西兰移民局", "https://www.immigration.govt.nz/about-us/media-centre/newsletters-and-news-items"],
  ["international", "新西兰外交贸易部", "https://www.mfat.govt.nz/en/media-and-resources/news"],
  ["flight", "新西兰民航局", "https://www.aviation.govt.nz/about-us/media-releases/"],
  ["visa", "挪威移民局", "https://www.udi.no/en/news/"],
  ["international", "挪威政府", "https://www.regjeringen.no/en/whats-new/id2006120/"],
  ["flight", "挪威机场运营方", "https://www.avinor.no/en/corporate/press/"],
  ["visa", "冰岛移民局", "https://island.is/en/o/directorate-of-immigration/news"],
  ["international", "冰岛政府", "https://www.government.is/news/"],
  ["flight", "冰岛机场运营方", "https://www.isavia.is/en/corporate/news-and-media/news"],
];

const textOnly = value => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const truncate = (value, limit) => {
  const clean = textOnly(value).trim();
  return [...clean].slice(0, limit).join("") + ([...clean].length > limit ? "…" : "");
};
const oneLine = value => {
  const clean = textOnly(value).replace(/^\[[^\]]+\]\s*/, "").trim();
  return truncate(clean, 40);
};
const ignoredTitles = /^(首页|新闻|公告|更多|下一页|上一页|局领导|联系我们|网站地图|搜索|打印|返回顶部|english)$/i;

async function getPage(url) {
  const response = await fetch(url, { headers: { "User-Agent": "MorningBriefBot/1.0 (public information dashboard)" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function articleLinks(html, indexUrl) {
  const index = new URL(indexUrl);
  const links = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = textOnly(match[3]);
    let url;
    try { url = new URL(match[2], index).href; } catch { continue; }
    if (url.startsWith("javascript:") || new URL(url).hostname !== index.hostname || title.length < 8 || ignoredTitles.test(title)) continue;
    const key = `${url}|${title}`;
    if (!seen.has(key)) { seen.add(key); links.push({ title, url }); }
  }
  return links.slice(0, 12);
}

function publishedTime(html) {
  const plain = textOnly(html).slice(0, 12_000);
  const iso = plain.match(/20\d{2}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}/)?.[0];
  if (iso) {
    const numbers = iso.match(/\d+/g);
    const date = new Date(`${numbers[0]}-${numbers[1].padStart(2, "0")}-${numbers[2].padStart(2, "0")}T12:00:00+08:00`);
    if (!Number.isNaN(date.valueOf())) return date.valueOf();
  }
  const english = plain.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}/i)?.[0];
  const date = english ? new Date(english) : new Date("invalid");
  return Number.isNaN(date.valueOf()) ? 0 : date.valueOf();
}

function articleSummary(html) {
  const meta = html.match(/<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*>/i)?.[1];
  if (meta && textOnly(meta).length > 25) return truncate(meta, 250);
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => textOnly(match[1]));
  const useful = paragraphs.find(item => item.length >= 35 && !/(cookie|copyright|contact us)/i.test(item));
  return useful ? truncate(useful, 250) : "";
}

async function crawlSource([category, source, indexUrl], now) {
  const indexHtml = await getPage(indexUrl);
  const candidates = articleLinks(indexHtml, indexUrl);
  const pages = await Promise.allSettled(candidates.map(async candidate => {
    const html = await getPage(candidate.url);
    const publishedAt = publishedTime(html);
    return { title: oneLine(candidate.title), source, url: candidate.url, summary: articleSummary(html), publishedAt, category };
  }));
  const oneWeekAgo = now - 7 * 24 * 3_600_000;
  return pages.flatMap(result => result.status === "fulfilled" ? [result.value] : []).filter(story => story.publishedAt >= oneWeekAgo && story.publishedAt <= now + 3_600_000);
}

function score(story, now) {
  const ageHours = Math.max(0, (now - story.publishedAt) / 3_600_000);
  const current = ageHours < 28 ? 60 : ageHours < 72 ? 32 : 10;
  const terms = ["中国", "china", "签证", "visa", "免签", "航班", "flight", "航空", "访问", "会晤", "政策", "恢复", "新增", "暂停", "取消"];
  return current + terms.reduce((sum, term) => sum + (story.title.toLowerCase().includes(term) ? 8 : 0), 0);
}

const now = Date.now();
const crawled = await Promise.allSettled(sources.map(source => crawlSource(source, now)));
const failures = crawled.filter(result => result.status === "rejected").length;
const seen = new Set();
const stories = crawled.flatMap(result => result.status === "fulfilled" ? result.value : []).filter(story => {
  const key = normalize(story.title);
  if (seen.has(key)) return false;
  seen.add(key); return true;
}).map(story => ({ ...story, publishedLabel: new Date(story.publishedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }), score: score(story, now) })).sort((a, b) => b.score - a.score);

// 网络或官网暂时不可访问时，保留上一版，不用空白晨报覆盖网站。
if (!stories.length) {
  console.log("未读取到可用资讯，保留上一版晨报。");
  process.exit(0);
}

const headline = stories[0] || { title: "近 7 天未检测到指定官网更新", source: "系统", publishedLabel: "今日", summary: "" };
const categories = { flight: [], visa: [], international: [], other: [] };
// 头条独立展示，避免在下方分类卡片中重复出现。
for (const story of stories) {
  if (story.url && story.url === headline.url) continue;
  if (categories[story.category].length < 4) categories[story.category].push(story);
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const generatedAt = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date());
await mkdir("data", { recursive: true });
await writeFile("data/today.json", JSON.stringify({ title: "环球出行晨报", date: today, generatedAt: `${generatedAt} (Asia/Shanghai)`, headline, categories }, null, 2));
console.log(`已生成 ${today}：${stories.length} 条官方资讯，${failures} 个官网暂时无法读取。`);
