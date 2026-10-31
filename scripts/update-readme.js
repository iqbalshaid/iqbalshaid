// Updates the "Projects" section of the profile README with the last 3 months of work.
// Runs inside GitHub Actions (see .github/workflows/monthly-projects.yml).
// Custom project descriptions go in descriptions.json: { "owner/repo": "description" }
const fs = require("fs");

const token = process.env.GH_TOKEN;
const login = process.env.GH_LOGIN;
const MONTHS = 3;
const TOP = 3;
const MAX_MESSAGES = 5;
const START = "<!--PROJECTS:START-->";
const END = "<!--PROJECTS:END-->";
const EXCLUDE = [`${login}/${login}`]; // the profile repo itself
const descriptions = fs.existsSync("descriptions.json") ? JSON.parse(fs.readFileSync("descriptions.json", "utf8")) : {};

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": login,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return res.json();
}

async function reposForMonth(from, to) {
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner url isPrivate description primaryLanguage { name } }
          contributions { totalCount }
        }
      }
    }
  }`;
  const data = await gh("/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables: { login, from: from.toISOString(), to: to.toISOString() } }),
  });
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data.user.contributionsCollection.commitContributionsByRepository.filter(
    (c) => !EXCLUDE.includes(c.repository.nameWithOwner)
  );
}

// Meaningful commit subjects only: skip merges, auto-push commits and one-word messages like "local"
async function workDone(repo, from, to) {
  const commits = await gh(
    `/repos/${repo}/commits?author=${login}&since=${from.toISOString()}&until=${to.toISOString()}&per_page=100`
  );
  const messages = commits
    .map((c) => c.commit.message.split("\n")[0].trim())
    .filter((m) => m.length >= 8 && m.split(/\s+/).length >= 2)
    .filter((m) => !/^Merge /i.test(m) && !/^Auto update/i.test(m));
  return [...new Set(messages)];
}

const repoName = (r) => (r.isPrivate ? `🔒 **${r.nameWithOwner}**` : `**[${r.nameWithOwner}](${r.url})**`);

async function main() {
  const now = new Date();

  const months = [];
  for (let i = 1; i <= MONTHS; i++) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1) - 1);
    const label = from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const short = from.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const repos = await reposForMonth(from, to);
    for (const c of repos) c.messages = await workDone(c.repository.nameWithOwner, from, to);
    if (repos.length) months.push({ label, short, repos });
  }

  // Totals per project across all months, newest work first
  const totals = new Map();
  for (const { short, repos } of months) {
    for (const { repository: r, contributions, messages } of repos) {
      const t = totals.get(r.nameWithOwner) || { r, count: 0, months: [], messages: [] };
      t.count += contributions.totalCount;
      t.months.push(short);
      t.messages.push(...messages);
      totals.set(r.nameWithOwner, t);
    }
  }
  const top = [...totals.values()].sort((a, b) => b.count - a.count).slice(0, TOP);

  let md = `## 🚀 What I've Been Working On\n\n_Top projects from the last ${MONTHS} months · auto-updated on ${now.toISOString().slice(0, 10)}_\n\n`;
  if (!top.length) md += `_No commits in the last ${MONTHS} months._\n`;

  const medals = ["🥇", "🥈", "🥉"];
  top.forEach((t, i) => {
    const desc = descriptions[t.r.nameWithOwner] || t.r.description;
    const meta = [t.r.primaryLanguage && `\`${t.r.primaryLanguage.name}\``, `${t.count} commits`, `Active: ${t.months.reverse().join(", ")}`];
    md += `### ${medals[i]} ${repoName(t.r)}\n\n`;
    if (desc) md += `> ${desc}\n\n`;
    md += `${meta.filter(Boolean).join(" · ")}\n\n`;
    const work = [...new Set(t.messages)].slice(0, MAX_MESSAGES);
    if (work.length) md += `**Recent work:**\n${work.map((m) => `- ${m}`).join("\n")}\n\n`;
  });

  if (months.length) {
    md += `<details>\n<summary>📅 Month-by-month activity</summary>\n\n`;
    for (const { label, repos } of months) {
      md += `#### ${label}\n\n`;
      for (const { repository: r, contributions } of repos) md += `- ${repoName(r)} · ${contributions.totalCount} commits\n`;
      md += `\n`;
    }
    md += `</details>\n\n`;
  }

  const readme = fs.readFileSync("README.md", "utf8");
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1) throw new Error(`README.md must contain ${START} and ${END}`);
  fs.writeFileSync("README.md", readme.slice(0, s + START.length) + "\n" + md + readme.slice(e));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
