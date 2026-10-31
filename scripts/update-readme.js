// Keeps the profile README in sync with the last 3 months of work:
//   PROJECTS -> top 3 projects with description + month-by-month activity
//   TOOLS    -> languages/frameworks detected from those repos
//   ASK      -> "Ask me about" line built from the same detection
// Runs inside GitHub Actions (see .github/workflows/monthly-projects.yml).
// Custom project descriptions go in descriptions.json: { "owner/repo": "description" }
//   or { "owner/repo": { "description": "...", "features": ["Feature A"], "bullets": ["Built ..."] } }
//   features fix the "Worked on" list; bullets replace the AI-written ones
// Tools to always show go in tools.json: { "always": ["aws", "langgraph", ...] } (ids from SKILLS / BADGES)
const fs = require("fs");

const token = process.env.GH_TOKEN;
const login = process.env.GH_LOGIN;
const MONTHS = 3;
const TOP = 3;
const MAX_MODULES = 6;
const MAX_TOOLS = 16;
const EXCLUDE = [`${login}/${login}`]; // the profile repo itself
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);
const descriptions = readJson("descriptions.json", {});
const ALWAYS = readJson("tools.json", {}).always || [];

// skillicons.dev id -> display name
const SKILLS = {
  py: "Python", ts: "TypeScript", js: "JavaScript", html: "HTML", css: "CSS", sass: "Sass", bash: "Bash",
  java: "Java", c: "C", cpp: "C++", go: "Go", kotlin: "Kotlin", dart: "Dart", php: "PHP", rust: "Rust",
  react: "React", nextjs: "Next.js", vue: "Vue", nodejs: "Node.js", express: "Express", nestjs: "NestJS",
  mongodb: "MongoDB", postgres: "PostgreSQL", mysql: "MySQL", redis: "Redis", prisma: "Prisma", supabase: "Supabase",
  firebase: "Firebase", tailwind: "Tailwind", redux: "Redux", vite: "Vite", graphql: "GraphQL", jest: "Jest",
  fastapi: "FastAPI", django: "Django", flask: "Flask", tensorflow: "TensorFlow", pytorch: "PyTorch",
  sklearn: "scikit-learn", opencv: "OpenCV", docker: "Docker", githubactions: "GitHub Actions", aws: "AWS",
};
// Tools skillicons.dev has no icon for -> shields.io badge: [name, color, simple-icons logo, logo color]
const BADGES = {
  langgraph: ["LangGraph", "1C3C3C", "langchain"], langchain: ["LangChain", "1C3C3C", "langchain"],
  llamaindex: ["LlamaIndex", "000000"], openai: ["OpenAI", "412991", "openai"], anthropic: ["Claude", "D97757", "anthropic"],
  gemini: ["Gemini", "8E75B2", "googlegemini"], groq: ["Groq", "F55036"], ollama: ["Ollama", "000000", "ollama"],
  huggingface: ["Hugging Face", "FFD21E", "huggingface", "black"], chromadb: ["ChromaDB", "FF6446"],
  pinecone: ["Pinecone", "000000"], qdrant: ["Qdrant", "DC244C"], faiss: ["FAISS", "0467DF"],
  opentelemetry: ["OpenTelemetry", "425CC7", "opentelemetry"], grafana: ["Grafana", "F46800", "grafana"],
  prometheus: ["Prometheus", "E6522C", "prometheus"], sentry: ["Sentry", "362D59", "sentry"],
  swagger: ["Swagger", "85EA2D", "swagger", "black"],
};
const AI_TOOLS = ["langgraph", "langchain", "llamaindex", "openai", "anthropic", "gemini", "groq", "ollama", "huggingface", "chromadb", "pinecone", "qdrant", "faiss"];
const MONITORING = ["opentelemetry", "grafana", "prometheus", "sentry"];
const nameOf = (id) => SKILLS[id] || (BADGES[id] && BADGES[id][0]) || id;
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
  boto3: "aws", "aws-sdk": "aws", "aws-cdk-lib": "aws", openai: "openai", anthropic: "anthropic",
  "@anthropic-ai/sdk": "anthropic", "google-generativeai": "gemini", "google-genai": "gemini",
  "@google/generative-ai": "gemini", groq: "groq", "groq-sdk": "groq", ollama: "ollama",
  transformers: "huggingface", "huggingface-hub": "huggingface", chromadb: "chromadb",
  pinecone: "pinecone", "pinecone-client": "pinecone", "@pinecone-database/pinecone": "pinecone",
  "qdrant-client": "qdrant", "@qdrant/js-client-rest": "qdrant", "faiss-cpu": "faiss", "faiss-gpu": "faiss",
  "prometheus-client": "prometheus", "prom-client": "prometheus", "sentry-sdk": "sentry",
  "swagger-ui-express": "swagger", "swagger-jsdoc": "swagger", "@nestjs/swagger": "swagger",
  "drf-yasg": "swagger", "drf-spectacular": "swagger", flasgger: "swagger",
};
// Dependency families matched by prefix
const DEP_RULES = [
  [/^(langgraph|@langchain\/langgraph)/, "langgraph"], [/^(langchain|@langchain\/)/, "langchain"],
  [/^(llama-index|llamaindex)/, "llamaindex"], [/^(@aws-sdk\/|@aws-cdk\/)/, "aws"],
  [/^(opentelemetry-|@opentelemetry\/)/, "opentelemetry"], [/^@sentry\//, "sentry"],
];
// Services spotted in docker-compose / k8s / CI files
const FILE_RULES = [
  [/grafana/i, "grafana"], [/prometheus/i, "prometheus"], [/opentelemetry|otel-collector|otel\/|OTEL_/i, "opentelemetry"],
  [/chromadb|chroma:/i, "chromadb"], [/aws-actions\/|amazonaws\.com|AWS_ACCESS_KEY/i, "aws"],
];
const NODE_BACKEND = ["express", "nestjs"];

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

// Feature/module folder right after one of these, e.g. src/features/order2dispatch/... -> "Order to Dispatch"
const MODULE_PARENTS = /^(features|modules|services|controllers|routes|repositories|validators|pages|apps|api|routers|views|screens|agents|tools|pipelines)$/i;
const SKIP_MODULES = /^(_.*|\(.*\)|\[.*\]|components?|server|client|utils?|helpers?|common|shared|lib|core|config|types|hooks|styles|assets|tests?|__tests__|index|v\d+)$/i;
const MODULE_NAMES = {
  scotreport: "SCOT Report", whatsapp: "WhatsApp", llm: "LLM", api: "API", auth: "Auth", mis: "MIS", hr: "HR",
  sfms: "SFMS", hrfms: "HR FMS", storefms: "Store FMS", maintenancepro: "Maintenance Pro", momsystem: "MOM System",
  eadashboard: "EA Dashboard", checklistdelegation: "Checklist & Delegation",
};

const moduleKey = (seg) =>
  seg.replace(/([a-z])2([a-z])/gi, "$1to$2").replace(/[^a-z0-9]/gi, "").toLowerCase().replace("deligation", "delegation");
const moduleLabel = (seg) =>
  MODULE_NAMES[moduleKey(seg)] ||
  seg
    .replace(/([a-z])2([a-z])/gi, "$1 to $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .split(" ")
    .map((w, i) => (i > 0 && /^(to|and|of|for|in)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

function modulesOf(path) {
  const parts = path.split("/");
  const found = new Set();
  for (let i = 0; i < parts.length - 2; i++) {
    const seg = parts[i + 1];
    if (MODULE_PARENTS.test(parts[i]) && !seg.includes(".") && !SKIP_MODULES.test(seg)) found.add(seg);
  }
  return found;
}

// For flat projects with no features/ or services/ folders: first folder or file name, e.g. llm.py -> "LLM"
const SKIP_FLAT = /^(\..*|.*\..*|readme|dockerfile|requirements.*|package(-lock)?|docker-compose.*|compose|license|makefile|pyproject|poetry|tsconfig.*|.*config|env.*|main|__init__|init|setup|conftest|app|server|index|tests?|migrations?|scripts?|const(ants)?|static|public|docs?|deploy(ment)?|infra|nginx|workflows|pages|services|tools|routes|models|schemas)$/i;
const WRAPPERS = /^(src|app|backend|frontend|server|client|.+[-_](backend|frontend|server|app))$/i;
const CONTAINERS = /^(pages|services|tools|agents|routes|controllers|views|screens|modules|features|api)$/i;
function flatModuleOf(path) {
  const parts = path.split("/");
  while (parts.length > 1 && WRAPPERS.test(parts[0])) parts.shift();
  if (parts.length > 1 && CONTAINERS.test(parts[0])) parts.shift();
  let seg = parts[0];
  if (parts.length === 1) seg = seg.replace(/\.[^.]+$/, "").replace(/[-_.]?(service|page|controller|tool|routes?)$/i, "");
  return /[a-z]/i.test(seg) && !SKIP_FLAT.test(seg) && !SKIP_MODULES.test(seg) ? seg : null;
}

// My (non-merge) commits in a repo: modules touched (key -> { label, commits }), commit subjects, files changed
async function workDone(repo, from, to) {
  const commits = await gh(
    `/repos/${repo}/commits?author=${login}&since=${from.toISOString()}&until=${to.toISOString()}&per_page=100`
  );
  const messages = commits
    .map((c) => c.commit.message.split("\n")[0].trim())
    .filter((m) => m.length >= 8 && !/^(Merge |Auto update|Revert )/i.test(m));
  const files = new Set();
  const modules = new Map();
  const flat = new Map();
  const count = (map, touched) => {
    for (const [key, seg] of touched) {
      const m = map.get(key) || { label: moduleLabel(seg), commits: 0 };
      m.commits += 1;
      map.set(key, m);
    }
  };
  for (const c of commits) {
    if (c.parents && c.parents.length > 1) continue;
    const detail = await tryGh(`/repos/${repo}/commits/${c.sha}`);
    if (!detail || !detail.files) continue;
    const touched = new Map();
    const touchedFlat = new Map();
    for (const f of detail.files) {
      files.add(f.filename);
      for (const seg of modulesOf(f.filename)) touched.set(moduleKey(seg), seg);
      const seg = flatModuleOf(f.filename);
      if (seg) touchedFlat.set(moduleKey(seg), seg);
    }
    count(modules, touched);
    count(flat, touchedFlat);
  }
  return { modules: modules.size ? modules : flat, messages, files };
}

// ---- Resume-style write-ups by Claude, cached in writeups.json ----
// Regenerated only when a project got REFRESH_COMMITS new commits or the entry is REFRESH_DAYS old.
const REFRESH_COMMITS = 5;
const REFRESH_DAYS = 14;
const writeups = readJson("writeups.json", {});

const WRITEUP_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    tech: { type: "array", items: { type: "string" } },
    bullets: { type: "array", items: { type: "string" } },
  },
  required: ["title", "tech", "bullets"],
  additionalProperties: false,
};

const WRITEUP_SYSTEM = `You write the project entries on a software developer's public GitHub profile README, in the style of a strong resume.

For the project you are given, return:
- title: a short product-style name, optionally followed by the repo's working name in parentheses, e.g. "AI Research Copilot (Business Analyzer)".
- tech: 6-14 technologies, most important first, using their usual names (e.g. "FastAPI", "LangGraph", "GitHub Actions", "AWS EC2").
- bullets: 4-5 bullets. Each starts with a past-tense action verb (Built, Designed, Containerized, Implemented...), says what was built, how, and why it matters, and stays under 45 words. Wrap key technologies in **double asterisks**.

The developer's own description of the project, when given, is reliable context: keep its facts and expand on them.

Describe only what the evidence supports: the developer's own commit messages, the files they changed, the modules they touched, and the repository's README and dependencies. Prefer the parts this developer worked on over the rest of the codebase. Do not invent metrics, users, or results.

This page is public and the repository may be a private company codebase, so stay at the level of features and architecture: never include secrets, environment values, internal URLs, hostnames, client or employee names.`;

async function writeupFor(t) {
  const key = t.r.nameWithOwner;
  const cached = writeups[key];
  const ageDays = cached ? (Date.now() - Date.parse(cached.generatedAt)) / 86400000 : Infinity;
  if (cached && t.count - cached.commits < REFRESH_COMMITS && ageDays < REFRESH_DAYS) return cached;
  if (!process.env.ANTHROPIC_API_KEY) return cached || null;

  const branch = t.r.defaultBranchRef && t.r.defaultBranchRef.name;
  const readme = (await tryGh(`/repos/${key}/readme${branch ? `?ref=${branch}` : ""}`, {}, "application/vnd.github.raw+json")) || "";
  const custom = descriptions[key];
  const evidence = [
    `Repository: ${key}${t.r.isPrivate ? " (private)" : ""}`,
    `Description: ${(custom && typeof custom === "object" ? [custom.description, ...(custom.bullets || [])].filter(Boolean).join(" ") : custom) || t.r.description || "(none)"}`,
    `Languages: ${t.r.languages.edges.map((e) => e.node.name).join(", ")}`,
    `Detected tools: ${[...t.skills].map(nameOf).join(", ")}`,
    `My commits in the last ${MONTHS} months: ${t.count}`,
    `Modules I touched (by commits): ${[...t.modules.values()].sort((a, b) => b.commits - a.commits).slice(0, 15).map((m) => `${m.label} (${m.commits})`).join(", ")}`,
    `My commit messages:\n${[...new Set(t.messages)].slice(0, 80).map((m) => `- ${m}`).join("\n")}`,
    `Files I changed:\n${[...t.files].slice(0, 250).join("\n")}`,
    `Repository README:\n${readme.slice(0, 8000)}`,
  ].join("\n\n");

  try {
    const Anthropic = require("@anthropic-ai/sdk").default;
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: WRITEUP_SYSTEM,
      messages: [{ role: "user", content: evidence }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: WRITEUP_SCHEMA } },
    });
    if (response.stop_reason !== "end_turn") throw new Error(`stop_reason ${response.stop_reason}`);
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const entry = { ...JSON.parse(text), commits: t.count, generatedAt: new Date().toISOString() };
    writeups[key] = entry;
    return entry;
  } catch (err) {
    console.error(`Write-up for ${key} failed, keeping the previous one:`, err.message);
    return cached || null;
  }
}

// Skills used in one repo: languages + dependencies + Docker/CI/infra files
async function detectSkills(r) {
  const skills = new Set();
  for (const { size, node } of r.languages.edges) {
    if (LANGS[node.name] && size / r.languages.totalSize >= 0.05) skills.add(LANGS[node.name]);
  }

  const branch = r.defaultBranchRef && r.defaultBranchRef.name;
  const tree = branch && (await tryGh(`/repos/${r.nameWithOwner}/git/trees/${branch}?recursive=1`));
  if (!tree) return skills;
  const paths = tree.tree.map((t) => t.path).filter((p) => !p.includes("node_modules/"));

  if (paths.some((p) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/.test(p))) skills.add("docker");
  if (paths.some((p) => p.startsWith(".github/workflows/"))) skills.add("githubactions");
  if (paths.some((p) => /(^|\/)(cdk\.json|serverless\.ya?ml|samconfig\.toml)$/.test(p))) skills.add("aws");
  for (const p of paths) for (const [re, id] of FILE_RULES.slice(0, 3)) if (re.test(p)) skills.add(id);

  const depFiles = paths.filter((p) => /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml)$/.test(p)).slice(0, 8);
  const infraFiles = paths
    .filter((p) => /(^|\/)(docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/.test(p) || p.startsWith(".github/workflows/"))
    .slice(0, 6);
  for (const p of [...depFiles, ...infraFiles]) {
    const text = await tryGh(`/repos/${r.nameWithOwner}/contents/${p}?ref=${branch}`, {}, "application/vnd.github.raw+json");
    if (!text) continue;
    if (infraFiles.includes(p)) {
      for (const [re, id] of FILE_RULES) if (re.test(text)) skills.add(id);
      continue;
    }
    let deps = [];
    if (p.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(text);
        deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      } catch {}
    } else {
      deps = [...text.matchAll(/^\s*"?([A-Za-z0-9_.\-@\/]+)/gm)].map((m) => m[1].toLowerCase().replace(/_/g, "-"));
    }
    for (const d of deps) {
      if (DEPS[d]) skills.add(DEPS[d]);
      for (const [re, id] of DEP_RULES) if (re.test(d)) skills.add(id);
    }
  }
  if (NODE_BACKEND.some((s) => skills.has(s))) skills.add("nodejs");
  return skills;
}

const badge = (id) => {
  const [name, color, logo, logoColor = "white"] = BADGES[id];
  const label = encodeURIComponent(name.replace(/-/g, "--").replace(/_/g, "__"));
  return `<img src="https://img.shields.io/badge/${label}-${color}?style=for-the-badge${logo ? `&logo=${logo}&logoColor=${logoColor}` : ""}" alt="${name}" />`;
};

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
    for (const c of repos) c.work = await workDone(c.repository.nameWithOwner, from, to);
    if (repos.length) months.push({ label, short, repos });
  }

  // Totals per project across all months
  const totals = new Map();
  for (const { short, repos } of months) {
    for (const { repository: r, contributions, work } of repos) {
      const t = totals.get(r.nameWithOwner) || { r, count: 0, months: [], modules: new Map(), messages: [], files: new Set() };
      t.count += contributions.totalCount;
      t.months.push(short);
      t.messages.push(...work.messages);
      for (const f of work.files) t.files.add(f);
      for (const [key, m] of work.modules) {
        const prev = t.modules.get(key) || { label: m.label, commits: 0 };
        prev.commits += m.commits;
        t.modules.set(key, prev);
      }
      totals.set(r.nameWithOwner, t);
    }
  }
  const ranked = [...totals.values()].sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, TOP);
  for (const t of ranked) t.skills = await detectSkills(t.r);

  // ---- PROJECTS ----
  const updated = now.toISOString().slice(0, 10);
  let md = `\n## 🏆 My Top ${TOP} Projects\n\n_Where I've committed the most in the last ${MONTHS} months · auto-updated on ${updated}_\n\n`;
  if (!top.length) md += `_No commits in the last ${MONTHS} months._\n\n`;

  const medals = ["🥇", "🥈", "🥉"];
  for (const [i, t] of top.entries()) {
    const custom = descriptions[t.r.nameWithOwner];
    const w = await writeupFor(t);
    const own = custom && typeof custom === "object" ? custom : { description: custom };
    const work = own.features || [...t.modules.values()].sort((a, b) => b.commits - a.commits).slice(0, MAX_MODULES).map((m) => m.label);
    // Bullets: my own from descriptions.json, else Claude's, else the description split into sentences
    const desc = own.description || t.r.description;
    const bullets = own.bullets || (w && w.bullets) || (desc ? desc.split(/(?<=\.)\s+/).filter(Boolean) : []);
    const tech = (w && w.tech) || [...t.skills].map(nameOf);

    md += w ? `### ${medals[i]} ${w.title}\n\n${t.r.isPrivate ? "🔒 " : ""}\`${t.r.nameWithOwner}\`\n\n` : `### ${medals[i]} ${repoName(t.r)}\n\n`;
    if (tech.length) md += `**Tech:** _${tech.join(", ")}_\n\n`;
    if (work.length) md += `**Worked on:** ${work.join(" · ")}\n\n`;
    if (bullets.length) md += `${bullets.map((b) => `- ${b}`).join("\n")}\n\n`;
  }

  if (months.length) {
    md += `## 🚀 What I've Been Working On\n\n`;
    for (const { label, repos } of months) {
      md += `#### ${label}\n\n`;
      for (const { repository: r, contributions } of repos) md += `- ${repoName(r)} · ${contributions.totalCount} commits\n`;
      md += `\n`;
    }
  }

  // ---- TOOLS + ASK: skills weighted by commits in each repo ----
  const score = new Map();
  for (const t of ranked) {
    for (const s of t.skills) score.set(s, (score.get(s) || 0) + t.count);
  }
  for (const s of ALWAYS) if (!score.has(s) && (SKILLS[s] || BADGES[s])) score.set(s, 0);
  const all = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const icons = all.filter((s) => SKILLS[s]).slice(0, MAX_TOOLS);
  const badges = all.filter((s) => BADGES[s]);

  let readme = fs.readFileSync("README.md", "utf8");
  readme = replaceBlock(readme, "PROJECTS", md);

  // Keep the previous tools/ask text if nothing could be detected
  if (all.length) {
    let tools = `\n<h3 align="left">Languages and Tools:</h3>\n`;
    if (icons.length) tools += `<p align="left"><img src="https://skillicons.dev/icons?i=${icons.join(",")}&perline=12" alt="${icons.map(nameOf).join(", ")}" /></p>\n\n`;
    const aiBadges = badges.filter((s) => AI_TOOLS.includes(s));
    const otherBadges = badges.filter((s) => !AI_TOOLS.includes(s));
    if (aiBadges.length) tools += `<p align="left"><b>AI &amp; LLM:</b><br/>\n${aiBadges.map(badge).join("\n")}\n</p>\n\n`;
    if (otherBadges.length) tools += `<p align="left"><b>Monitoring &amp; APIs:</b><br/>\n${otherBadges.map(badge).join("\n")}\n</p>\n\n`;
    tools += `<sub>Based on what I've used in the last ${MONTHS} months</sub>\n`;
    readme = replaceBlock(readme, "TOOLS", tools);

    const areas = [
      ...(all.some((s) => AI_TOOLS.includes(s)) ? ["AI / LLM Apps"] : []),
      ...(all.some((s) => MONITORING.includes(s)) ? ["Monitoring & Observability"] : []),
      ...all.filter((s) => score.get(s) > 0 && !AI_TOOLS.includes(s) && !MONITORING.includes(s)).slice(0, 4).map(nameOf),
    ];
    readme = replaceBlock(readme, "ASK", `**${areas.join(", ")}**`);
  }

  fs.writeFileSync("README.md", readme);
  fs.writeFileSync("writeups.json", JSON.stringify(writeups, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
