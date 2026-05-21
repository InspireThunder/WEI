import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const dailyDir = path.join(root, "daily");
const maxItems = 10;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeConfidence(value) {
  return ["high", "medium", "low"].includes(value) ? value : "medium";
}

function confidenceLabel(value) {
  return {
    high: "高可信",
    medium: "中可信",
    low: "待确认",
  }[normalizeConfidence(value)];
}

function safeDateLabel(value) {
  if (!value) return "时间待确认";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function reportItems(report) {
  return Array.isArray(report.items) ? report.items.slice(0, maxItems) : [];
}

function fallbackSummary(report, items) {
  if (report.dailySummary) return report.dailySummary;

  return {
    headline: items.length
      ? `今天最值得关注的是：${items[0].title || "AI 行业继续快速变化"}。`
      : "今日高可信资讯较少，等待下一次自动化抓取。",
    bullets: items.slice(0, 3).map((item) => item.title).filter(Boolean),
  };
}

function nav(prefix, current, latestDate) {
  const latestClass = current === "latest" ? "is-active" : "";
  const archiveClass = current === "archive" ? "is-active" : "";
  const latestHref = latestDate ? `${prefix}daily/${latestDate}.html` : `${prefix}index.html`;

  return `
    <nav class="top-nav" aria-label="站点导航">
      <a class="${archiveClass}" href="${prefix}index.html">每日列表</a>
      <a class="${latestClass}" href="${latestHref}">最新日报</a>
    </nav>`;
}

function summaryBlock(summary) {
  const bullets = Array.isArray(summary.bullets) ? summary.bullets.filter(Boolean) : [];
  return `
    <section class="summary-panel" aria-labelledby="summary-title">
      <p class="section-kicker">今日总结</p>
      <h2 id="summary-title">${escapeHtml(summary.headline || "今日 AI 资讯摘要")}</h2>
      ${
        bullets.length
          ? `<ul class="summary-list">${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
          : ""
      }
    </section>`;
}

function itemCard(item, index) {
  const confidence = normalizeConfidence(item.confidence);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const originalTitle = item.originalTitle ? `<p class="original-title">原文：${escapeHtml(item.originalTitle)}</p>` : "";
  const impact = item.impact ? `<p class="impact"><strong>影响：</strong>${escapeHtml(item.impact)}</p>` : "";
  const url = item.url || "#";

  return `
    <article class="story-card">
      <div class="rank">#${String(index + 1).padStart(2, "0")}</div>
      <div class="story-body">
        <div class="story-labels">
          <span class="category-badge">${escapeHtml(item.category || "资讯")}</span>
          <span class="source-type">${escapeHtml(item.sourceType || "来源")}</span>
          <span class="confidence ${confidence}">${confidenceLabel(confidence)}</span>
          ${item.highlight ? `<span class="tag">重点</span>` : ""}
        </div>
        <h3><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || "未命名资讯")}</a></h3>
        ${originalTitle}
        <p>${escapeHtml(item.summary || "暂无摘要。")}</p>
        ${impact}
        <div class="card-meta">
          ${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div class="item-footer">
          <span>${escapeHtml(item.source || "未知来源")} · ${escapeHtml(safeDateLabel(item.publishedAt))}</span>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">查看来源</a>
        </div>
      </div>
    </article>`;
}

function renderTopStories(items) {
  return `
    <section class="section">
      <div class="section-title">
        <div>
          <p class="section-kicker">按热度排序</p>
          <h2>今日 Top 10</h2>
        </div>
        <span class="count">${items.length} 条</span>
      </div>
      ${
        items.length
          ? `<div class="story-list">${items.map(itemCard).join("")}</div>`
          : `<div class="empty">暂无高可信资讯。</div>`
      }
    </section>`;
}

function archivePreview(archives, prefix) {
  const recent = archives.slice(0, 7);
  return `
    <section class="section">
      <div class="section-title">
        <div>
          <p class="section-kicker">历史</p>
          <h2>最近日报</h2>
        </div>
        <a class="text-link" href="${prefix}index.html">查看全部</a>
      </div>
      <ol class="daily-list">
        ${recent.map((archive) => archiveRow(archive, prefix)).join("")}
      </ol>
    </section>`;
}

function archiveRow(archive, prefix) {
  return `
    <li class="daily-row">
      <a href="${prefix}daily/${archive.date}.html">
        <span class="daily-date">${escapeHtml(archive.date)}</span>
        <span class="daily-title">${escapeHtml(archive.headline || "AI 资讯日报")}</span>
        <span class="daily-count">${archive.count} 条</span>
      </a>
    </li>`;
}

function renderReportPage(report, archives) {
  const items = reportItems(report);
  const summary = fallbackSummary(report, items);
  const prefix = "../";
  const statusNote = report.statusNote || (items.length ? "" : "今日高可信资讯较少，等待自动化任务完成抓取后更新。");
  const latestDate = archives[0]?.date;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI 资讯热点 · ${escapeHtml(report.date || "最新")}</title>
  <link rel="stylesheet" href="${prefix}assets/style.css">
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      ${nav(prefix, "latest", latestDate)}
      <p class="eyebrow">AI 资讯热点</p>
      <h1>${escapeHtml(report.date || "最新日报")}</h1>
      <p class="subtitle">每天只保留热度最高的 10 条 AI 资讯，先看总结，再看详情。</p>
      <div class="meta-row">
        <span class="pill">生成时间：${escapeHtml(report.generatedAt || "待生成")}</span>
        <span class="pill">窗口：${escapeHtml(report.window || "最近 24 小时")}</span>
        <span class="pill">Top ${items.length}</span>
      </div>
    </div>
  </header>
  <main class="main">
    ${statusNote ? `<div class="notice">${escapeHtml(statusNote)}</div>` : ""}
    ${summaryBlock(summary)}
    ${renderTopStories(items)}
    ${archivePreview(archives, prefix)}
  </main>
  <footer class="site-footer">
    <div class="footer-inner">由 Codex 自动化生成。请以原始来源为准。</div>
  </footer>
</body>
</html>
`;
}

function renderArchivePage(archives) {
  const latestDate = archives[0]?.date;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI 资讯热点 · 每日列表</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="site-header compact">
    <div class="header-inner">
      ${nav("", "archive", latestDate)}
      <p class="eyebrow">AI 资讯热点</p>
      <h1>每日资讯列表</h1>
      <p class="subtitle">固定入口是这个列表页，点开日期进入当天的 AI 热点 Top 10。</p>
      <div class="meta-row">
        <span class="pill">固定入口：index.html</span>
        <span class="pill">共 ${archives.length} 天</span>
      </div>
    </div>
  </header>
  <main class="main">
    <section class="section">
      <div class="section-title">
        <div>
          <p class="section-kicker">归档</p>
          <h2>全部日报</h2>
        </div>
        <span class="count">${archives.length} 天</span>
      </div>
      <ol class="daily-list archive-page-list">
        ${archives.map((archive) => archiveRow(archive, "")).join("")}
      </ol>
    </section>
  </main>
  <footer class="site-footer">
    <div class="footer-inner">由 Codex 自动化生成。请以原始来源为准。</div>
  </footer>
</body>
</html>
`;
}

async function readReports() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(dailyDir, { recursive: true });

  const files = (await fs.readdir(dataDir))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  const reports = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(dataDir, file), "utf8");
    const report = JSON.parse(raw);
    report.date ||= file.replace(/\.json$/, "");
    report.items = Array.isArray(report.items) ? report.items : [];
    reports.push(report);
  }

  return reports.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function main() {
  const reports = await readReports();
  if (!reports.length) {
    throw new Error("No report JSON files found in data/.");
  }

  const archives = reports.map((report) => {
    const items = reportItems(report);
    const summary = fallbackSummary(report, items);
    return {
      date: report.date,
      count: items.length,
      headline: summary.headline,
    };
  });

  for (const report of reports) {
    await fs.writeFile(path.join(dailyDir, `${report.date}.html`), renderReportPage(report, archives));
  }

  const archiveHtml = renderArchivePage(archives);
  await fs.writeFile(path.join(root, "index.html"), archiveHtml);
  await fs.writeFile(path.join(root, "archive.html"), archiveHtml);
  console.log(`Built ${reports.length} report page(s). Latest: ${reports[0].date}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
