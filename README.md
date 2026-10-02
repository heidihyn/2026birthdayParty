# Heartware / HALO party site

Guest site for Heidi's AI murder mystery birthday (Sat Oct 3 2026, 8 PM, SF).

- Public site: https://heidihyn.github.io/2026birthdayParty/ (GitHub Pages; `.github/workflows/pages.yml` publishes `standalone/` on every push to `main`).
- Host vote panel + projector view: https://claude.ai/artifact/1nYHapyfbsfJ5G8xeQGAb6 (`#tally` for the big screen).

## Files
- `site.src.html`: the page template. Edit this, never the generated files.
- `config.json`: Spotify collaborator link and photo album link.
- `guest-roles.csv`: one row per guest (name, phone, role, team, knows). **Not in git** (it has phone numbers). `guest-roles.example.csv` shows the layout; the build uses it when the real file is missing. Roles: Hacker A, Hacker B, Leaker, Auditor, Co-founder, Companion, Lawyer, Witness, Employee. `knows` is the name a Witness knows is NOT a Hacker.
- `witness-job-titles.md`: snapshot of the Witness job titles (the build prefers `../witness-job-titles.md` when present). Titles show only in each Witness's private phone reveal, never in All roles.
- `build.mjs`: builds everything (plus a private, gitignored `dm-lines.md` with each guest's card and DM line) and prints roster problems. Each guest's role is AES-GCM encrypted with a key derived from a private 6-character access code (saved in the `code` column of `guest-roles.csv`, sent to each guest in Heidi's DM).

## Update the site
1. Edit `site.src.html` / `config.json` (and the local `guest-roles.csv`).
2. `node build.mjs` (writes `standalone/` for Netlify plus `index.html` and `tpl.txt` for the Claude host panel).
3. Commit and push `standalone/` and the source. GitHub Pages redeploys automatically.
4. If roles changed, also republish the Claude host panel. Republishing resets live votes, so never during the party.
