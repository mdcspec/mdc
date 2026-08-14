# Assignees, mentions, and notifications

*Authoring guidance for the `@assignee` token. Resolves [open question #1](../vision/risks-critiques-open-questions.md) (assignee autolink hazard). Normative backing: [spec §4, ATTR-2 note](../../spec/mdc-spec-v0.1.md).*

## What `@assignee` means in MDC

An MDC assignee is a **file-local coordination handle** — a label that says "this item is claimed by this identifier." That's all it is. **MDC assigns it no resolution and no notification semantics:** nothing in the format looks the handle up, pings it, checks it against a roster, or requires it to correspond to a real account anywhere. `mdc claim <id> --as <handle>` sets a string on one line; `mdc next`/`status` read it back. The handle's whole job is to let two workers — human or agent — avoid grabbing the same item, and to leave an audit trail in the git history.

Because there is no directory, the natural handles are **roles and agents**, not people's platform usernames:

```
- [ ] Cut the branch  {#branch @release-bot}
- [ ] Run the suite    {#tests needs=branch @agent-a}
- [ ] Sign off         {#signoff needs=tests @qa}
```

## The hazard: autolinking is a property of where you paste

MDC documents are valid GFM, so you can paste one straight into a GitHub or GitLab issue, PR, or comment and it renders as a live checklist. In **those surfaces** — issue/PR bodies and comments — an `@handle` that matches a real account **autolinks and can send that account a notification.** `@qa` is inert; `@maria`, if a real Maria exists, is a ping.

This is not MDC doing anything. It is the *rendering surface* interpreting an `@` token, exactly as it would in any prose you typed there. The same file rendered in a repo **file view** (not a comment) does not mention anyone — GitHub does not autolink `@handles` in rendered `.md` files, only in issue/PR/comment bodies. So the hazard is entirely about **where the bytes land**, and it is a two-sided thing:

- **Feature** when you *want* the assignee notified — paste the run into the tracking issue and the owner gets pinged.
- **Footgun** when you don't — pasting a checklist that happens to contain `@alex` into a public issue pings a real Alex who has nothing to do with your repo.

## Two ways to stay safe

**1. Author with a no-mention profile.** Prefer role/agent/local slugs (`@release-bot`, `@qa`, `@agent-a`, `@oncall`) over personal platform usernames. Reserve real handles for the specific case where notifying that person is the intent. A team that never puts platform usernames in its checklists never pings anyone by accident, and loses nothing — the coordination still works, because the handle only has to be unique within the file.

**2. Paste inside a code fence when sharing raw.** To drop an MDC document into an issue or PR *for review* — where you want people to read the bytes, not be mentioned by them — wrap it in a fenced code block:

````
```markdown
- [ ] Deploy  {#deploy @alex}
```
````

Inside a code fence nothing autolinks: `@alex` renders as literal text, no notification. This is the "escape hatch," and note where the escaping lives — in the **host markdown around the paste**, never in the MDC token itself. The file on disk stays canonical MDC; `@alex` is still a well-formed assignee that `mdc claim`/`next` read normally. (The tradeoff: a fenced paste renders as a code listing, not interactive checkboxes. Use the file view or a throwaway issue when you want live boxes — see [`spec/rendering/README.md`](../../spec/rendering/README.md).)

## Why there is no lint rule or "safe-mentions" flag for this

MDC deliberately ships **no** mechanical guard here, and that is a decision, not an omission. The check you would want — "warn when an assignee could notify a real account" — is not decidable: there is no syntactic difference between `@qa` (a role) and `@maria` (a person), and MDC has no roster to check either against. A lint rule would either cry wolf on every assignee or miss the real ones. A frontmatter "no-mention profile" flag would carry the same undecidability while adding closed-set surface the format is [constitutionally reluctant](../vision/risks-critiques-open-questions.md) to grow (*"would todo.txt have added this?"* — no). The honest, cheap, and complete answer is the guidance above: choose handles deliberately, and fence the paste when you need silence.
