# Civic Log

Short summaries of Spanish Fork and Utah County public meetings, with the hearings worth attending flagged.

**Site:** https://redfearn.group/civic-log/

## How it works

1. **Collect.** Every morning at 6 AM Mountain, a GitHub Action reads the [Utah Public Notice Website](https://www.utah.gov/pmn/) for each body in `config/sources.yaml`. It saves new or changed notices to `data/notices/`. No AI is involved, and the commit history is the change log.
2. **Summarize.** Claude reads each new notice, its agenda and its attachments, and writes `data/summaries/<id>.yaml` following `prompts/summarize.md`. Scanned PDFs are read as page images. During testing this runs as a scheduled task on the owner's laptop. It will move to a GitHub Action calling the Claude API once the summaries have proven reliable.
3. **Score.** Each item is tagged and scored 1 to 5 against `config/interests.yaml`. A meeting is marked **Attend** when it holds a public hearing on a high-impact item or touches a topic on the watch list.
4. **Deliver.**
   - The site, rebuilt daily.
   - An [RSS feed](https://redfearn.group/civic-log/feed.xml).
   - A [calendar feed](https://redfearn.group/civic-log/attend.ics) of Attend meetings.
   - An issue for each new Attend meeting, which GitHub emails to watchers.
   - A weekly digest issue every Monday.

## Ground rules

- Public records only. Every summary links its source notice and attachments.
- Applicant descriptions are labeled, never stated as fact.
- Elected and appointed officials are named with their votes. Residents who comment, staff and applicant employees are not named.
- AI summaries can be wrong. The notice is the record.

## Commands

```sh
npm run collect           # fetch notices for all active bodies
npm run pending           # list notices needing summaries, extract their text
npm run check-summaries   # validate every summary against the format rules
npm run build             # build the site to ./dist
npm run digest -- --dry-run
npm run alerts -- --dry-run
```

Brand tokens and `src/lib/kit/` are vendored from [redfearn-brand](https://github.com/redfearn-group/redfearn-brand). Do not edit them here.
