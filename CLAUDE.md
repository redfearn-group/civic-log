# civic-log

Civic monitor for Spanish Fork, Utah County and (later) Utah. Public repo, Astro site at https://redfearn.group/civic-log/ (Pages, served under the custom domain of redfearn-group.github.io). The README explains the pipeline; this file holds what a session needs to change it safely.

## Pipeline and who runs what

| Step | Runs where | Files |
| :--- | :--- | :--- |
| Collect | GitHub Actions `collect.yml`, daily 12:00 UTC | `scripts/collect.mjs` writes `data/notices/<body>/<id>.yaml` |
| Summarize | Scheduled task `civic-log-summarize` on the XPS, 07:00/12:00/17:00 with a once-a-day guard | `scripts/pending.mjs` writes `work/pending.json` (gitignored); Claude writes `data/summaries/<id>.yaml`; PR self-merged, `data/summaries/` only |
| Validate | Locally and in `check.yml` | `scripts/check-summaries.mjs` |
| Alerts | `alerts.yml` on push to main touching summaries | `scripts/alerts.mjs`, one issue per body and date, deduped by `[pmn <ids>]` in the title |
| Digest | `digest.yml`, Monday 14:00 UTC | `scripts/digest.mjs` |
| Site | `deploy.yml` on push, and dispatched by collect daily | `src/` |

**Planned change:** summarizing moves to a GitHub Action calling the Claude API once Brady confirms three straight weeks with no factual errors. `prompts/summarize.md` and `check-summaries.mjs` are the contract and must not change shape for that. Only the runner changes. The API version should send PDFs directly instead of page images.

## Rules

- **Public repo.** `config/interests.yaml` holds topics only: never a home address, street, house-search detail or personal position. The collector deliberately drops PMN contact names and emails.
- **Names.** Officials may be named with their votes. Never staff, commenters or applicant employees. Do not copy commissioner rosters from agenda headers.
- **Applicant claims** carry `applicant: true` and "the applicant says" wording.
- **Watch topics are substantive.** A keyword match is not a hit; routine IT renewals are not `city-technology`. This was the main false-Attend source in the first backfill.
- **Votes come only from minutes,** which PMN posts with a later meeting's notice. A summary with no minutes leaves `result: null`. Never fill a vote from news or memory.
- **Dates:** fields are `YYYY-MM-DD`; prose is `DD MMM YYYY`. Scripts use `todayMountain()` because Actions runs in UTC.
- **Prompt changes:** change `prompts/summarize.md` and `scripts/check-summaries.mjs` together.
- **Scans:** `pending.mjs` renders scanned PDFs with PyMuPDF via `CIVIC_PYTHON`, which defaults to `C:\Program Files\Python314\python.exe`. Never use `python3` or `py`.

## Sources

- PMN body pages list only about 10 recent notices each, so the daily collect is what builds history.
- PMN has no RSS or API; robots.txt allows crawling. Keep the 1 request per second pace and the honest user agent.
- Do not scrape Spanish Fork's Diligent portal: its robots.txt disallows everything. BoardDocs and udot.utah.gov return 403 to scripts.
- Phase 3 bodies are listed in `config/sources.yaml` with `active: false`. Confirm each id on its PMN page before switching it on.
