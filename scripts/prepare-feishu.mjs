import { readFile, writeFile } from "node:fs/promises";

const current = JSON.parse(await readFile("data/today.json", "utf8"));
const previous = JSON.parse(await readFile("data/previous.json", "utf8"));
const categoryNames = { flight: "航班", visa: "签证", international: "国际", other: "其他" };
const allStories = report => [report.headline, ...Object.values(report.categories || {}).flat()].filter(Boolean);
const oldUrls = new Set(allStories(previous).map(story => story.url).filter(Boolean));
const fresh = allStories(current).filter(story => story.url && !oldUrls.has(story.url));

const lines = [`【环球出行晨报】${current.date}`];
if (!fresh.length) {
  lines.push("今日暂无新增重要更新。", "网站保留近 7 天有效资讯：", "https://vitachenqiuyi-collab.github.io/morning-brief/");
} else {
  const lead = fresh[0];
  lines.push(`头条：${lead.title}`, lead.summary || "", lead.url, "");
  for (const [key, label] of Object.entries(categoryNames)) {
    const stories = (current.categories?.[key] || []).filter(story => story.url && story.url !== lead.url && !oldUrls.has(story.url));
    if (!stories.length) continue;
    lines.push(`【${label}】`);
    for (const story of stories) lines.push(`• ${story.title}`, story.summary || "", story.url);
    lines.push("");
  }
  lines.push("完整晨报：", "https://vitachenqiuyi-collab.github.io/morning-brief/");
}

await writeFile("data/feishu-payload.json", JSON.stringify({ msg_type: "text", content: { text: lines.filter((line, index) => line || index > 0).join("\n") } }));
console.log(fresh.length ? `准备发送 ${fresh.length} 条新增资讯。` : "无新增资讯，将发送提示消息。");
