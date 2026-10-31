// Updates the "Projects" section of the profile README with the last 3 months of work.
// Runs inside GitHub Actions (see .github/workflows/monthly-projects.yml).
const fs = require("fs");

const token = process.env.GH_TOKEN;
const login = process.env.GH_LOGIN;
const MONTHS = 3;
const MAX_MESSAGES = 5;
const START = "<!--PROJECTS:START-->";
const END = "<!--PROJECTS:END-->";

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
          repository { nameWithOwner url isPrivate }
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
  return data.data.user.contributionsCollection.commitContributionsByRepository;
}

async function workDone(repo, from, to) {
  const commits = await gh(
    `/repos/${repo}/commits?author=${login}&since=${from.toISOString()}&until=${to.toISOString()}&per_page=100`
  );
  const messages = commits
    .map((c) => c.commit.message.split("\n")[0].trim())
    .filter((m) => m && !/^Merge /i.test(m) && !/^Auto update/i.test(m));
  return [...new Set(messages)].slice(0, MAX_MESSAGES);
}

const repoName = (r) => (r.isPrivate ? `🔒 **${r.nameWithOwner}**` : `**[${r.nameWithOwner}](${r.url})**`);

async function main() {
  const now = new Date();
  let md = `## 🚀 What I've Been Working On\n\n_Last ${MONTHS} months · auto-updated on ${now.toISOString().slice(0, 10)}_\n\n`;

  const months = [];
  for (let i = 1; i <= MONTHS; i++) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1) - 1);
    const label = from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const repos = await reposForMonth(from, to);
    if (repos.length) months.push({ from, to, label, repos });
  }

  if (!months.length) md += `_No commits in the last ${MONTHS} months._\n`;

  // Top 3 projects by total commits across all months
  const totals = new Map();
  for (const { repos } of months) {
    for (const { repository: r, contributions } of repos) {
      const t = totals.get(r.nameWithOwner) || { r, count: 0 };
      t.count += contributions.totalCount;
      totals.set(r.nameWithOwner, t);
    }
  }
  const top = [...totals.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  if (top.length) {
    const medals = ["🥇", "🥈", "🥉"];
    md += `### 🏆 Top ${top.length} Projects\n\n| | Project | Commits |\n|---|---|---|\n`;
    top.forEach((t, i) => (md += `| ${medals[i]} | ${repoName(t.r)} | ${t.count} |\n`));
    md += `\n`;
  }

  for (const { from, to, label, repos } of months) {
    md += `### ${label}\n\n`;
    for (const { repository: r, contributions } of repos) {
      md += `${repoName(r)} · ${contributions.totalCount} commits\n`;
      for (const m of await workDone(r.nameWithOwner, from, to)) md += `- ${m}\n`;
      md += `\n`;
    }
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
