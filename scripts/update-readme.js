// Keeps the profile README in sync with the last 3 months of work:
//   PROJECTS -> top 3 projects with description + month-by-month activity
//   TOOLS    -> languages/frameworks detected from those repos
//   ASK      -> "Ask me about" line built from the same detection
// Runs inside GitHub Actions (see .github/workflows/monthly-projects.yml).
// Custom project descriptions go in descriptions.json: { "owner/repo": "description" }
const fs = require("fs");

const token = process.env.GH_TOKEN;
const login = process.env.GH_LOGIN;
const MONTHS = 3;
const TOP = 3;
const MAX_MESSAGES = 5;
const MAX_TOOLS = 16;
const EXCLUDE = [`${login}/${login}`]; // the profile repo itself
const descriptions = fs.existsSync("descriptions.json") ? JSON.parse(fs.readFileSync("descriptions.json", "utf8")) : {};

// skillicons.dev id -> display name
const SKILLS = {
  py: "Python", ts: "TypeScript", js: "JavaScript", html: "HTML", css: "CSS", sass: "Sass", bash: "Bash",
  java: "Java", c: "C", cpp: "C++", go: "Go", kotlin: "Kotlin", dart: "Dart", php: "PHP", rust: "Rust",
  react: "React", nextjs: "Next.js", vue: "Vue", nodejs: "Node.js", express: "Express", nestjs: "NestJS",
  mongodb: "MongoDB", postgres: "PostgreSQL", mysql: "MySQL", redis: "Redis", prisma: "Prisma", supabase: "Supabase",
  firebase: "Firebase", tailwind: "Tailwind", redux: "Redux", vite: "Vite", graphql: "GraphQL", jest: "Jest",
  fastapi: "FastAPI", django: "Django", flask: "Flask", tensorflow: "TensorFlow", pytorch: "PyTorch",
  sklearn: "scikit-learn", opencv: "OpenCV", docker: "Docker", githubactions: "GitHub Actions",
};
const LANGS = {
  Python: "py", TypeScript: "ts", JavaScript: "js", HTML: "html", CSS: "css", SCSS: "sass", Shell: "bash",
  Dockerfile: "docker", Java: "java", C: "c", "C++": "cpp", Go: "go", Kotlin: "kotlin", Dart: "dart",
  PHP: "php", Vue: "vue", Rust: "rust",
};
const DEPS = {
  react: "react", next: "nextjs", vue: "vue", express: "express", "@nestjs/core": "nestjs",
  mongoose: "mongodb", mongodb: "mongodb", pymongo: "mongodb", motor: "mongodb",
  pg: "postgres", psycopg: "postgres", psycopg2: "postgres", "psycopg2-binary": "postgres", asyncpg: "postgres",
  mysql2: "mysql", mysql: "mysql", pymysql: "mysql", redis: "redis", ioredis: "redis",
  prisma: "prisma", "@prisma/client": "prisma", "@supabase/supabase-js": "supabase", supabase: "supabase",
  firebase: "firebase", tailwindcss: "tailwind", redux: "redux", "@reduxjs/toolkit": "redux",
  vite: "vite", graphql: "graphql", jest: "jest", sass: "sass",
  fastapi: "fastapi", django: "django", flask: "flask", tensorflow: "tensorflow", torch: "pytorch",
  "scikit-learn": "sklearn", "opencv-python": "opencv",
};
const NODE_BACKEND = ["express", "nestjs"];
const AI_DEPS = /^(openai|anthropic|@anthropic-ai\/sdk|langchain.*|@langchain\/.*|llama-index.*|transformers|google-generativeai|@google\/generative-ai|groq|ollama|litellm|crewai)$/i;

async function gh(path, opts = {}, accept = "application/vnd.github+json") {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: accept, "User-Agent": login },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return accept.endsWith("raw+json") ? res.text() : res.json();
}
const tryGh = (...args) => gh(...args).catch(() => null);

async function reposForMonth(from, to) {
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            nameWithOwner url isPrivate description primaryLanguage { name } defaultBranchRef { name }
            languages(first: 8, orderBy: { field: SIZE, direction: DESC }) { totalSize edges { size node { name } } }
          }
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

// Skills used in one repo: languages + dependencies + Docker/CI files
async function detectSkills(r) {
  const skills = new Set();
  let ai = false;
  for (const { size, node } of r.languages.edges) {
    if (LANGS[node.name] && size / r.languages.totalSize >= 0.05) skills.add(LANGS[node.name]);
  }

  const branch = r.defaultBranchRef && r.defaultBranchRef.name;
  const tree = branch && (await tryGh(`/repos/${r.nameWithOwner}/git/trees/${branch}?recursive=1`));
  if (!tree) return { skills, ai };
  const paths = tree.tree.map((t) => t.path).filter((p) => !p.includes("node_modules/"));

  if (paths.some((p) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/.test(p))) skills.add("docker");
  if (paths.some((p) => p.startsWith(".github/workflows/"))) skills.add("githubactions");

  const depFiles = paths.filter((p) => /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml)$/.test(p)).slice(0, 6);
  for (const p of depFiles) {
    const text = await tryGh(`/repos/${r.nameWithOwner}/contents/${p}?ref=${branch}`, {}, "application/vnd.github.raw+json");
    if (!text) continue;
    let deps = [];
    if (p.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(text);
        deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      } catch {}
    } else {
      deps = [...text.matchAll(/^\s*"?([A-Za-z0-9_.\-]+)/gm)].map((m) => m[1].toLowerCase());
    }
    for (const d of deps) {
      if (DEPS[d]) skills.add(DEPS[d]);
      if (AI_DEPS.test(d)) ai = true;
    }
  }
  if (NODE_BACKEND.some((s) => skills.has(s))) skills.add("nodejs");
  return { skills, ai };
}

const repoName = (r) => (r.isPrivate ? `🔒 **${r.nameWithOwner}**` : `**[${r.nameWithOwner}](${r.url})**`);

function replaceBlock(readme, name, content) {
  const start = `<!--${name}:START-->`;
  const end = `<!--${name}:END-->`;
  const s = readme.indexOf(start);
  const e = readme.indexOf(end);
  if (s === -1 || e === -1) throw new Error(`README.md must contain ${start} and ${end}`);
  return readme.slice(0, s + start.length) + content + readme.slice(e);
}

async function main() {
  const now = new Date();

  // Current month + previous months
  const months = [];
  for (let i = 0; i < MONTHS; i++) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const to = new Date(Math.min(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1) - 1, now));
    const label = from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const short = from.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const repos = await reposForMonth(from, to);
    for (const c of repos) c.messages = await workDone(c.repository.nameWithOwner, from, to);
    if (repos.length) months.push({ label, short, repos });
  }

  // Totals per project across all months
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
  const ranked = [...totals.values()].sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, TOP);

  // ---- PROJECTS ----
  let md = `\n## 🚀 What I've Been Working On\n\n_Top projects from the last ${MONTHS} months · auto-updated on ${now.toISOString().slice(0, 10)}_\n\n`;
  if (!top.length) md += `_No commits in the last ${MONTHS} months._\n`;

  const medals = ["🥇", "🥈", "🥉"];
  top.forEach((t, i) => {
    const desc = descriptions[t.r.nameWithOwner] || t.r.description;
    const meta = [t.r.primaryLanguage && `\`${t.r.primaryLanguage.name}\``, `${t.count} commits`, `Active: ${[...t.months].reverse().join(", ")}`];
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

  // ---- TOOLS + ASK: skills weighted by commits in each repo ----
  const score = new Map();
  let ai = false;
  for (const t of ranked) {
    const found = await detectSkills(t.r);
    ai = ai || found.ai;
    for (const s of found.skills) score.set(s, (score.get(s) || 0) + t.count);
  }
  const skills = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, MAX_TOOLS);

  let readme = fs.readFileSync("README.md", "utf8");
  readme = replaceBlock(readme, "PROJECTS", md);

  // Keep the previous tools/ask text if nothing could be detected
  if (skills.length) {
    const tools =
      `\n<h3 align="left">Languages and Tools:</h3>\n` +
      `<p align="left"><img src="https://skillicons.dev/icons?i=${skills.join(",")}&perline=12" alt="${skills.map((s) => SKILLS[s]).join(", ")}" /></p>\n\n` +
      `<sub>Based on what I've used in the last ${MONTHS} months</sub>\n`;
    readme = replaceBlock(readme, "TOOLS", tools);

    const areas = [...(ai ? ["AI / LLM Apps"] : []), ...skills.slice(0, 5).map((s) => SKILLS[s])];
    readme = replaceBlock(readme, "ASK", `**${areas.join(", ")}**`);
  }

  fs.writeFileSync("README.md", readme);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
