// Builds index.html from site.src.html + guest-roles.csv + config.json.
// Each guest's role and secret line is encrypted with a key derived from a private access code
// that only they get (in Heidi's DM), so the page source holds no readable role map and
// knowing someone's phone number doesn't unlock their role.
// Usage: node build.mjs   (run from this folder). Rebuilding resets the live vote results.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const ITER = 600000;
const src = readFileSync("site.src.html", "utf8");
const config = JSON.parse(readFileSync("config.json", "utf8"));

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { cells.push(cur); cur = ""; } else cur += c;
    }
    cells.push(cur); rows.push(cells.map((s) => s.trim()));
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.toLowerCase(), r[i] || ""])));
}

const norm = (p) => { let d = p.replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d; };
const normCode = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
const guests = parseCsv(readFileSync(existsSync("guest-roles.csv") ? "guest-roles.csv" : "guest-roles.example.csv", "utf8")).filter((g) => g.name);
// Every guest gets a 6-character access code, saved back into guest-roles.csv so rebuilds keep it.
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
const newCode = () => { const b = crypto.getRandomValues(new Uint8Array(6)); const c = Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join(""); return c.slice(0, 3) + "-" + c.slice(3); };
const usedCodes = new Set(guests.map((g) => normCode(g.code || "")).filter(Boolean));
let codesAdded = false;
for (const g of guests) if (!g.code) { let c; do c = newCode(); while (usedCodes.has(normCode(c))); usedCodes.add(normCode(c)); g.code = c; codesAdded = true; }
if (codesAdded && existsSync("guest-roles.csv")) {
  const cols = ["name", "phone", "role", "team", "knows", "title", "code"].filter((c) => c !== "title" || guests.some((g) => g.title));
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  writeFileSync("guest-roles.csv", [cols.join(","), ...guests.map((g) => cols.map((c) => esc(g[c] || "")).join(","))].join("\n") + "\n");
}
const problems = [];
const byRole = (r) => guests.filter((g) => g.role.toLowerCase() === r.toLowerCase());
const one = (r) => byRole(r)[0]?.name;
const hackerA = one("Hacker A"), hackerB = one("Hacker B"), intern = one("Companion") || one("HALO") || one("Intern");

// Witness job titles (owned by the mystery thread). Flavor only; shown just in the private reveal.
const titlesFile = ["../witness-job-titles.md", "witness-job-titles.md"].find((f) => existsSync(f));
const TITLES = titlesFile ? readFileSync(titlesFile, "utf8").split("\n")
  .map((l) => l.match(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|[^|]*\|\s*([^|]+?)\s*\|/)).filter(Boolean)
  .map((m) => ({ title: m[1], flavor: m[2] })) : [];
const witnesses = byRole("Witness");
const usedTitles = new Set(witnesses.map((g) => g.title).filter(Boolean));
const freeTitles = TITLES.filter((t) => !usedTitles.has(t.title));
for (const g of witnesses) {
  if (!g.title) g.title = freeTitles.shift()?.title || "";
  g.flavor = TITLES.find((t) => t.title === g.title)?.flavor || "";
}

function secretFor(g) {
  const r = g.role.toLowerCase();
  if (r === "hacker a") return { role: "hacker", line: hackerB ? `Your fellow Hacker is ${hackerB}. Keep this secret. 😈` : "You're the only Hacker tonight. Keep this secret. 😈" };
  if (r === "hacker b") return { role: "hacker", line: hackerA ? `Your fellow Hacker is ${hackerA}. Keep this secret. 😈` : "You're the only Hacker tonight. Keep this secret. 😈" };
  if (r === "leaker") return { role: "leaker", line: `The Hackers are ${[hackerA, hackerB].filter(Boolean).join(" and ")}. But the Hackers don't know who the Leaker is.` };
  if (r === "auditor") { const pair = [intern, hackerA].filter(Boolean); /* fixed order so rebuilds keep DMs and site in sync */ return { role: "auditor", line: `One of these two is a Hacker: ${pair.join(" or ")}.` }; }
  if (r === "co-founder" || r === "cofounder") { const other = byRole("Co-founder").concat(byRole("Cofounder")).find((x) => x !== g); return { role: "cofounder", line: other ? `Your co-founder is ${other.name}. You're both innocent.` : "You're the only co-founder tonight. You're innocent." }; }
  if (r === "companion" || r === "halo" || r === "intern") return { role: "companion", line: hackerA ? `You were programmed to love ${hackerA}. 💘 They don't know it's you.` : "" };
  if (r === "lawyer") return { role: "lawyer", line: `Your client is ${hackerB}. You're not the only lawyer on this case.` };
  if (r === "witness") {
    if (!g.knows) problems.push(`${g.name}: Witness with no "knows" name`);
    if ([hackerA, hackerB, intern].includes(g.knows)) problems.push(`${g.name}: Witness clears ${g.knows}, who is a Hacker or the Companion`);
    return { role: "witness", title: g.title, flavor: g.flavor, line: g.knows ? `You know for sure that ${g.knows} is NOT a Hacker.` : "" };
  }
  if (r === "employee") return { role: "employee", line: "" };
  problems.push(`${g.name}: unknown role "${g.role}"`);
  return { role: "employee", line: "" };
}

const seen = new Set();
for (const g of guests.filter((x) => x.phone)) { const p = norm(g.phone); if (p.length < 7) problems.push(`${g.name}: phone "${g.phone}" looks incomplete`); if (seen.has(p)) problems.push(`${g.name}: duplicate phone ${g.phone}`); seen.add(p); }
if (guests.length && !hackerB) problems.push("No Hacker B, so Lawyer lines have no client");

const b64 = (u8) => Buffer.from(u8).toString("base64");
const hex = (u8) => Buffer.from(u8).toString("hex");
const salt = crypto.getRandomValues(new Uint8Array(16));
const entries = {};
const secrets = new Map(guests.map((g) => [g, secretFor(g)]));
for (const g of guests) {
  const s = secrets.get(g);
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normCode(g.code)), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, base, 512));
  const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify({ name: g.name, ...s }))));
  entries[hex(bits.slice(32, 48))] = b64(new Uint8Array([...iv, ...ct]));
}
// Shuffle entry order so it doesn't follow the CSV (role) order.
const shuffled = Object.fromEntries(Object.entries(entries).sort(() => Math.random() - 0.5));
const roster = { v: 1, iter: ITER, salt: guests.length ? b64(salt) : "", entries: shuffled };
config.live = guests.length > 0;

const out = src
  .replace(/\/\*CONFIG\*\/[\s\S]*?\/\*END\*\//, "/*CONFIG*/" + JSON.stringify(config) + "/*END*/")
  .replace(/\/\*ROSTER\*\/[\s\S]*?\/\*END\*\//, "/*ROSTER*/" + JSON.stringify(roster) + "/*END*/")
  .replace(/\/\*GUESTS\*\/[\s\S]*?\/\*END\*\//, "/*GUESTS*/" + JSON.stringify(guests.map((g) => g.name).sort((a, b) => a.localeCompare(b))) + "/*END*/");
writeFileSync(process.argv[2] || "index.html", out);
// tpl.txt lets the host panel republish the page with vote results filled in.
writeFileSync(process.argv[3] || "tpl.txt", out);
// Standalone copy for hosting outside claude.ai (Netlify etc.): no live vote panel,
// Verdict points to the projector instead.
const standaloneVerdict = `  <section id="verdict">
    <details class="fold">
      <summary class="sec-head">
      <span class="label">Board vote · live</span>
      <h2>Verdict</h2>
      <span class="chev" aria-hidden="true"></span></summary>
      <div class="fold-body"><p class="lede">Voting opens at 9:15. Your team is the small group you're put in on the night, not your role's side. Each team gets one vote: text Heidi your suspect and why. First vote counts. Watch the results come in live on the big screen.</p></div>
    </details>
  </section>
`;
const standalone = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<meta name=\"description\" content=\"HALO private beta · Sat Oct 3 · San Francisco\">\n<meta property=\"og:title\" content=\"HALO Private Beta · Heartware\">\n<meta property=\"og:description\" content=\"You've been selected to test HALO, the companion that loves you back. Sat Oct 3, SF.\">\n<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:url\" content=\"https://heidihyn.github.io/2026birthdayParty/\">\n<meta property=\"og:image\" content=\"https://heidihyn.github.io/2026birthdayParty/og-image.png\">\n<meta property=\"og:image:width\" content=\"1200\">\n<meta property=\"og:image:height\" content=\"630\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:image\" content=\"https://heidihyn.github.io/2026birthdayParty/og-image.png\">\n<title>Heartware Beta Portal</title>\n</head>\n<body>\n"
  + out.replace(/<title>[^<]*<\/title>\n?/, "").replace(/<!--VERDICT-START-->[\s\S]*?<!--VERDICT-END-->/, standaloneVerdict)
  + "\n</body>\n</html>\n";
mkdirSync("standalone", { recursive: true });
writeFileSync("standalone/index.html", standalone);

// Private DM sheet for Heidi (gitignored): who gets which card and line.
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const card = (g, s) => s.title ? `witness/role-witness-${slug(s.title)}.png` : `role-${s.role}.png`;
const dm = guests.map((g) => { const s = secrets.get(g); return `| ${g.name} | ${g.phone || "no number: they text you"} | ${g.code} | ${g.team} | ${s.title || g.role} | ${card(g, s)} | ${s.line} |`; });
writeFileSync("dm-lines.md", "# Friday DMs (private: has phone numbers)\n\nSend each guest their card from printables/phone-cards/, the line, and their access code (they enter it at heidihyn.github.io/2026birthdayParty to re-read their role).\n\n| Name | Phone | Code | Team | Role | Card | Line |\n|---|---|---|---|---|---|---|\n" + dm.join("\n") + "\n");
for (const f of ["nda.pdf", "nda-share.png", "og-image.png"]) copyFileSync(f, "standalone/" + f);
console.log(`Built with ${guests.length} guests.`);
if (problems.length) console.log("Check these:\n- " + problems.join("\n- "));
