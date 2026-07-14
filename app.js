const categoryIds = { flight: "flight-list", visa: "visa-list", international: "international-list", other: "other-list" };

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[c]);
}
function storyMarkup(story, lead = false) {
  const title = escapeHtml(story.title);
  const source = escapeHtml(story.source || "公开资讯源");
  const summary = escapeHtml(story.summary || "");
  const href = story.url ? `href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer"` : "";
  const original = story.url ? `<a class="original-link" ${href}>查看原文 →</a>` : "";
  return `<div class="${lead ? "lead-story" : "story-item"}"><div class="meta">${source} · ${escapeHtml(story.publishedLabel || "今日更新")}</div><${lead ? "h2" : "h3"}><a class="source-link" ${href}>${title}</a></${lead ? "h2" : "h3"}>${summary ? `<p class="summary">${summary}</p>` : ""}${original}</div>`;
}
async function loadReport() {
  const response = await fetch("data/today.json", { cache: "no-store" });
  if (!response.ok) throw new Error("report unavailable");
  return response.json();
}
loadReport().then(report => {
  document.title = `${report.title || "环球出行晨报"} · ${report.date}`;
  document.getElementById("date-line").textContent = `${report.date} · 中国相关国际出行与国际动态`;
  document.getElementById("updated-at").textContent = `更新于 ${report.generatedAt || report.date}`;
  document.getElementById("lead-story").innerHTML = storyMarkup(report.headline, true);
  for (const [category, id] of Object.entries(categoryIds)) {
    const stories = report.categories?.[category] || [];
    document.getElementById(id).innerHTML = stories.length ? stories.map(s => storyMarkup(s)).join("") : '<p class="empty">今日暂未发现值得跟进的更新。</p>';
  }
}).catch(() => {
  document.getElementById("date-line").textContent = "尚未生成日报数据，请运行生成脚本。";
  document.getElementById("lead-story").innerHTML = '<p class="empty">数据文件未找到。请参阅 README.md 完成首次生成。</p>';
});
