# Who owns which file (read this before editing any `.md`)

Two partners, two agents, one repo. Every Markdown file has one owner. Owners edit; everyone else opens a PR and the owner reviews. The list below is the source of truth; if a file is not on it, ask PK before creating it.

## The contract (PK's side — this is the main line)
| File | Owner | What it is | Who may change it |
|---|---|---|---|
| `CLAUDE.md` | PK / FOUNDER | The agent contract for **this repo**. The only instruction file any agent loads by default. | PR to PK. Agents never edit it on their own. |
| `docs/BUILD_SPEC.md` | FOUNDER | What to build. Wins over code. | PR; spec changes ride in the same PR as the code, with the reason. |
| `docs/TEAM_CHARTER.md` | PK | Who decides what. | PK only. |
| `docs/FILE_OWNERSHIP.md` | PK | This page. | PK only. |
| `README.md` | FOUNDER | How to run the thing. | PR. |
| `vault-mirror/*.md` | FOUNDER | Read-only mirrors of the vault. The vault is the source; never edit the mirror. | Nobody; FOUNDER re-mirrors. |
| `docs/screenshots/`, `test/fixtures/` | Claude Code (PK's agent) | Preview screenshots and golden test expectations. | PR. Fixtures change only with a stated reason. |

## Partner 2's side
Partner 2's agent has its own instruction and planning files. They live in **their own folder** and are named so nobody mistakes them for the contract:

| Path | Owner | Rule |
|---|---|---|
| `partner/AGENT.md` | Partner 2 | Partner 2's agent instructions. Read by their agent only. Must start with: "Defer to `/CLAUDE.md`; where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins." |
| `partner/*.md` | Partner 2 | Their plans, notes, proposals. Proposals that would change the spec become a PR against `docs/BUILD_SPEC.md`. |

Not allowed anywhere in the repo: a second `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, or any other root-level agent file. One contract, one prototype, one brand guide (charter).

## How the two agents avoid stepping on each other
- Branch prefixes carry the author: PK's agent uses `feat/…`, `fix/…`, `docs/…`; Partner 2's agent uses `p2/feat/…`, `p2/fix/…`, `p2/docs/…`.
- Neither agent edits the other's files. A disagreement goes to PK with both options written down (charter), not argued in PR comments.
- Decisions PK makes are logged in `vault/spec/decisions-*.md` and mirrored to `vault-mirror/`.

*Open item for PK (charter): Partner 2's lane and write access are still to be defined. Until then their agent has read access and opens PRs only.*
