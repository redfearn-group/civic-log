# Summarize one public notice

This prompt is the contract for the summarizer. The local scheduled task follows it today; a GitHub Actions job calling the Claude API will follow the same file later. Change the output format only together with `scripts/check-summaries.mjs`.

## Input
- `config/interests.yaml`: the impact tags and watch topics.
- One notice: `data/notices/<body>/<id>.yaml` (title, date, agenda text, attachment list).
- Extracted attachment text, if any: `work/text/<attachmentId>.txt`, listed in `work/pending.json`.
- The meeting video's captions, if `video` is set in the pending entry: `excerpts` (passages around motions, votes and watch-topic keywords) and `transcript` (the whole meeting, timestamped). See Meeting video below.

## Output
Write `data/summaries/<id>.yaml` with exactly these fields:

```yaml
notice: 1111313              # the notice id
sourceHash: 1a2b3c4d5e6f7a8b # the notice's hash field, copied exactly
engine: claude-local         # claude-local now; claude-api later
model: <model id you are running on>
summarized: 2026-10-06       # today, YYYY-MM-DD
headline: <one line, 90 characters max, the most important thing>
summary: <2 or 3 sentences: what is happening, why it matters, what a resident can do>
items:                       # substantive agenda items only, at most 12
  - title: <short name, 60 characters max>
    what: <one sentence, 200 characters max>
    tags: [land-use]         # zero or more tag ids from interests.yaml
    watch: [data-centers]    # zero or more watch ids from interests.yaml
    hearing: true            # a public hearing is held on this item
    applicant: false         # true if the description comes from the applicant's own material
    result: null             # from minutes or the meeting video, e.g. "Approved 3-2 (Cardon, Tooke opposed)"
    resultFrom: minutes      # minutes | video; only when result is set
    at: "1:01:20"            # optional: where this item is in the meeting video (m:ss or h:mm:ss)
tags: [land-use]             # union of the item tags
watch: [data-centers]        # union of the item watch ids
score: 4                     # 1 to 5, see scoring
hearing: { date: 2026-10-20, time: "18:20" }   # or null if no public hearing
attend: true                 # see the attend rule
attendWhy: <one line, or null>
basis: agenda                # agenda | agenda+attachments | agenda text only (scan); add "+video" when the captions were used
video: { id: xupvfBbJDPI, url: "https://www.youtube.com/watch?v=xupvfBbJDPI" }   # the video you used, copied from the pending entry; omit if none
sources:
  - { label: PMN notice, url: <notice url> }
  - { label: <attachment name>, url: <attachment url> }   # each attachment you used
```

## What to keep and drop
- **Drop:** call to order, pledge, prayer, roll call, approval of the agenda, ceremonial proclamations, routine approval of prior minutes, adjournment, standing boilerplate about comment rules and ADA notices.
- **Keep, briefly:** consent items that spend money, grant a franchise, change a fee, or approve a plat.
- **Keep, in full:** public hearings, zone changes, code amendments, annexations, development agreements, budgets, bonds, contracts over routine size, anything on the watch list.
- **Notices with no agenda** (hearing notices, vacancy notices, schedule changes): one item describing what the notice announces.
- **A cancelled meeting:** headline says so, `items: []`, score 1.
- **Minutes of an earlier meeting** are often attached to a later notice. Report only their decisions on substantive items, one item each, titled "Minutes, DD MMM YYYY: <topic>", with `result` set from the recorded vote. Skip unanimous routine approvals.

## Meeting video
The city streams its Council and Planning Commission meetings, and the video is up the same night. Minutes take weeks. When the pending entry has a `video`, use it as the record of what happened at this meeting.
- **Read the excerpts first.** They hold every motion, vote and watch-topic passage. Search the full transcript for any substantive agenda item whose outcome the excerpts do not show.
- **Results.** For each substantive item that was decided, set `result` from the motion and roll call heard in the video, e.g. "Approved 3-2 (Cardon, Tooke opposed)" or "Continued to 20 OCT 2026", with `resultFrom: video` and `at` set to the timestamp of the vote. Give a count such as 3-2 only when every member's answer is heard in the captions; otherwise write "Approved, no opposing vote heard" and name any no votes that are heard. If the video does not make the outcome clear, leave `result: null`.
- **Staff reports and discussion** on a watch topic that is not its own agenda item (an update under staff reports, direction given to staff): add one item titled "Staff report: <topic>" or "Discussion: <topic>", with `at` and no `result`. Say what was reported or directed, not who said it.
- **Captions are automatic and mishear things.** Spell officials' names as the agenda or earlier minutes do (the captions write Oyler as "Oiler", Tooke as "Tuk", Cardon as "Carden"). Never take a dollar figure, address, acreage or vote count from captions alone when the agenda or an attachment gives it; if only the captions give a number, write "about". Never quote a resident who spoke in public comment, and never name one.
- **Minutes outrank the video.** When minutes of this meeting arrive with a later notice, they are summarized there as usual. If the two disagree, the minutes are right; say so in the later summary's item.
- Set `video` to the pending entry's `id` and `url`, and add `+video` to `basis`. Leave `video` out when no captions were given.

## Watch topics are about substance, not keywords
A watch id applies only when the item is actually about that topic: a decision, hearing or policy that changes it. A keyword match alone is not enough. Routine renewals or purchases of existing software, IT services, records schedules and maintenance contracts do not count as `city-technology`. A new system, a new policy, or a contract that changes how residents are served does. When unsure, tag the item (e.g. `technology`) without a watch id.

## Hearing date and time
Use the time stated in the notice text for the public hearing. If the text gives none, use the notice's event start time. When one notice announces hearings before two bodies on two dates, use the first date that has not passed, and say both dates in the summary.

## Scoring (1 to 5)
- **5:** a watch topic with a decision or public hearing.
- **4:** a land-use, tax or technology decision in Spanish Fork, or a county decision that applies county-wide.
- **3:** a discussion or work-session item on a tagged topic, or a decision in another city or county area.
- **2:** routine business with some resident impact.
- **1:** nothing substantive.

## Attend rule
`attend: true` only when the meeting date is today or later AND either (a) `hearing` is set and `score >= 4`, or (b) `watch` is not empty. Otherwise `attend: false` and `attendWhy: null`. `attendWhy` names the item, e.g. "Public hearing on Title 15 amendments and a General Plan map change."

## Writing rules
- Plain language. Name the place, the size and the decision. No jargon without a gloss.
- No em-dashes anywhere. Use a period, comma or colon.
- Dates in prose as DD MMM YYYY (20 OCT 2026). Fields stay YYYY-MM-DD.
- **Names:** elected and appointed officials may be named with their motions and votes. Never name residents who comment, city staff, or applicant employees. Name a company or development, not its people.
- **Applicant claims are not facts.** When a description comes from an applicant's presentation, set `applicant: true` and write "the applicant says" or "proposed". The city's own staff report or the agenda counts as a city record.
- Never guess. If the agenda does not say it, leave it out.
- **Scans:** an attachment marked `scan: true` has its pages rendered as PNG images in `images`. Read every image and summarize from them, with `basis: agenda+attachments (scan read as images)`. Only if no images are listed, summarize from the notice's agenda text and set `basis: agenda text only (scan)`.
- Every summary must list the PMN notice as its first source.
