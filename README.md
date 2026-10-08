# session-saver-mod

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that helps you use fewer tokens and spend less, without getting in your way. It warns and suggests. It only stops something when you've asked it to, through a question you answer.

| # | Feature | What you see |
|---|---|---|
| 1 | **Model router** | `/cheap` and `/smart` commands, and a dim tip when a short message goes to Opus |
| 2 | **Fresh-session nudge** | A yellow notice at 60% context and a red one at 85%, each shown once |
| 3 | **Subagent model default** | Subagents that don't pick a model run on Sonnet, with a dim line saying so |
| 4 | **Big-file warning** | A question before Claude reads a huge file or searches a huge folder |
| 5 | **Repeat-read detector** | A dim line when the same unchanged file is read 3+ times |
| 6 | **Cost-per-task receipt** | A one-line token and cost estimate after every answer |
| 7 | **Idle session reminder** | A question before a big context is re-sent after a long break |

Tested with Claude Code **2.1.295**. The mods API is new and can change between releases. If something stops working after `claude update`, see [Troubleshooting](#troubleshooting).

---

## 1. Requirements

- **Claude Code v2.1.287 or later.** Check your version in Terminal:

  ```bash
  claude --version
  ```

  If it's older than `2.1.287`, update it:

  ```bash
  claude update
  ```

- **git**, to download the mod. Check with `git --version`. If macOS asks to install the command line developer tools, say yes.

## 2. Download the mod

This puts the mod in your home folder (`~`) and moves into it:

```bash
cd ~
git clone https://github.com/GurshaanMand/session-saver-mod.git
cd ~/session-saver-mod
```

## 3. Check it and run its tests

```bash
claude plugin validate ~/session-saver-mod
claude plugin test ~/session-saver-mod
```

- `validate` should end with `✔ Validation passed`. Above that it lists the events the mod hooks and the calls it makes.
- `test` should end with `0 fail`. The tests run with no session, no sign-in and no network.

## 4. Try it in the terminal (one session)

```bash
claude --plugin-dir ~/session-saver-mod
```

This loads the mod for that one session only, straight from the folder. It's the best way to try it or to change its settings, because a saved change reloads at once (see [Hot reloading](#8-hot-reloading-updating-and-removing)).

## 5. Install it for good (terminal and the desktop app's Code tab)

### Option A: from inside a Claude Code session

Start `claude` in Terminal, then type this at the Claude Code prompt:

```text
/plugin install session-saver-mod --marketplace GurshaanMand/session-saver-mod
```

> **The `/` must be the very first character you type.** If there's a space or any other character before it, Claude Code sends the line to Claude as a normal message instead of running the command.

What happens next:

1. `Add marketplace?` with `github:GurshaanMand/session-saver-mod`: press `y`.
2. The plugin's details open. Pick **Install for you (user scope)** and press Enter.
3. You see `Installed session-saver-mod. Plugin is now active.`

### Option B: from your shell, with no session open

```bash
claude plugin marketplace add GurshaanMand/session-saver-mod
claude plugin install session-saver-mod@session-saver-mod
```

### The desktop app's Code tab

A plugin installed at **user scope** (either option above) is also on in the desktop app's local Code sessions, because they read the same settings. Start a new Code session after installing.

To install from inside the desktop app instead: in a local Code session, click **+** next to the prompt box, then **Plugins**, then **Add plugin**, and pick `session-saver-mod`. The marketplace has to be added first (Option B's first line). Mods need the desktop app's Claude Code to be v2.1.286 or later: type `/status` in a Code session and read the **Claude Code** row.

## 6. Check that it loaded

At the Claude Code prompt, type:

```text
/plugin
```

A dim line under the tabs lists the active mods, for example `1 mod active · session-saver-mod`. Press Tab to reach **Installed** to see it there, or disable it.

Two quick checks:

- Type `/smart`. It should answer `session-saver-mod: Already on Opus 5.5; /cheap is not on.` (with your model's name).
- Ask Claude anything. After the answer, a dim `receipt (estimate) · ...` line appears.

---

## 7. The features, one by one

All settings live in one file: [`hooks/config.ts`](hooks/config.ts). Each feature has an on/off switch under `features`, and its own section of thresholds, with a comment on every line. To change one:

- **Running with `--plugin-dir`:** edit `~/session-saver-mod/hooks/config.ts` and save. The mod reloads by itself.
- **Installed from GitHub:** your session runs a copy made at install time, so edits to your clone don't reach it. Either run with `--plugin-dir` instead, or install from your local folder so the installed mod reads your clone directly:

  ```bash
  claude plugin uninstall session-saver-mod@session-saver-mod
  claude plugin marketplace remove session-saver-mod
  claude plugin marketplace add ~/session-saver-mod
  claude plugin install session-saver-mod@session-saver-mod
  ```

  Then after each edit, run `/reload-plugins` in your session.

### Feature 1: Model router (`/cheap`, `/smart`, short-message tip)

**What it does.** `/cheap` sends the main conversation's requests to a cheaper model: Haiku by default, or `/cheap sonnet`. `/smart` switches back. When `/cheap` is on, a status line entry says `cheap mode: Haiku 5.5 · /smart to undo`.

When you send a short, simple message (under 15 words, no attached files or `@file` mentions, no code) while on Opus, a dim tip appears: `Short message on Opus. /cheap to switch.`

**What you'll see.**

```text
/cheap
  session-saver-mod: Main conversation now runs on Haiku 5.5 (claude-haiku-5-5), was Opus 5.5. /smart to switch back.
/smart
  session-saver-mod: Back on Opus 5.5.
```

If the context is big, `/cheap` also tells you that the first request on the new model re-sends the whole context once, without cache help, with the cost. The prompt cache belongs to one model, so switching models in a long conversation costs one full re-send. With a very big context, that one re-send can cost more than you save.

**Important limitation.** The mods API can't change the session's model setting, the one `/model` changes. So `/cheap` works differently: before every request, the mod sends it to the cheaper model instead. Claude really answers on Haiku/Sonnet, and the receipt shows it, but **`/model` and the status line's model name still show your original model.** The `cheap mode` status entry is how you know it's on. `/cheap` only applies to the current session.

**Settings** (`router` in `config.ts`): `defaultCheapModel`, the exact `models` IDs (change these if you use Bedrock, Vertex or a gateway), `shortMessageWords` (15), `shortMessageTipCooldownMinutes` (0 = every time).

### Feature 2: Fresh-session nudge

**What it does.** Watches how full the context window is. The first time it passes **60%**, a yellow notice above the prompt suggests `/compact`. The first time it passes **85%**, a red notice suggests asking Claude for a short summary, then `/clear` and pasting it in. Each notice appears once. Press **Dismiss** to hide it. If the context drops back under 60% (after `/compact` or `/clear`), both are armed again.

**What you'll see** (above the prompt box):

```text
▲ Context 62% full. Run /compact to summarize older messages so each request sends less.  [ Dismiss ]
● Context 87% full. Ask Claude for a short summary of where things stand, then /clear and paste it in to start fresh.  [ Dismiss ]
```

Where nothing draws above the prompt (`claude -p`, the VS Code chat panel), the notice is a dim transcript line instead.

**Settings** (`context`): `warnPercent` (60), `dangerPercent` (85).

### Feature 3: Subagent model default

**What it does.** When Claude starts a subagent without choosing a model, Claude Code normally runs it on your main model, often Opus. This mod runs it on **Sonnet** instead, and logs:

```text
Subagent 'Find logger config' running on Sonnet (session default is Opus 5.5).
```

It leaves the subagent alone when Claude passed a model for it, when it's a fork (forks always share the parent's model), when its type is in `skipAgentTypes`, or when your main model isn't Opus or Fable. With `/cheap` on, subagents follow the cheap model instead.

**Settings** (`subagent`): `defaultModel` (`'sonnet'`), `onlyWhenParentMatches`, and `skipAgentTypes`. Add any of your own agents whose definition file sets `model:` to `skipAgentTypes`: the mod can't see an agent's definition, so without that it would replace the definition's model with Sonnet.

> Claude Code also has a built-in setting for this, `CLAUDE_CODE_SUBAGENT_MODEL` ([docs](https://code.claude.com/docs/en/sub-agents)). Use one or the other.

### Feature 4: Big-file warning

**What it does.** Before Claude reads a file over **200 KB**, or runs Glob/Grep over a folder holding more than **5,000 files**, you get a question with the size and a rough token estimate (size ÷ 4):

```text
Claude wants to read a big file: /Users/you/app/data.json is 1.8 MB, roughly 472K tokens. Read it?
  1. Read it
  2. Skip it
```

- **Read it**: the read goes ahead, and that path isn't asked about again this session.
- **Skip it** (or Esc): the read is refused, and Claude is told to find the part it needs with Grep and read only those lines.

A read of part of a file (Claude passes `offset`/`limit`) is never asked about. In `claude -p`, where nobody can answer, it logs a line and lets the read go.

**Settings** (`bigFile`): `maxFileKB` (200), `maxDirEntries` (5000), `ignoreDirs` (folders not counted, like `node_modules` and `.git`), `bytesPerToken` (4).

### Feature 5: Repeat-read detector

**What it does.** Counts reads per file. On the **3rd** read of a file that hasn't changed since the last read, a dim line appears, and every read after that updates the count:

```text
/Users/you/app/src/server.ts has been read 3 times and hasn't changed since the last read.
```

A file that changed (different size or modified time) starts again from 1, because re-reading it is useful. Reads of different parts of a file (`offset`/`limit`) are counted separately.

**Settings** (`repeatRead`): `threshold` (3).

### Feature 6: Cost-per-task receipt

**What it does.** When Claude finishes answering a prompt, one dim line sums up every request that prompt caused, **including its subagents**. Tokens are split into the four kinds the API bills at different prices, and each is priced separately:

```text
receipt (estimate) · Opus 5.5 + Sonnet 5.5 · in 6 <$0.001 · out 142 $0.003 · cache read 57.7K $0.012 · cache write 36.6K $0.117 · total ≈ $0.131
```

- `in`: uncached input tokens
- `out`: output tokens (thinking included)
- `cache read`: input read from the prompt cache (cheap)
- `cache write`: input written to the prompt cache (a bit more than normal input)

**It's an estimate.** It uses Anthropic's list API prices, copied on 2026-10-08 from the [official pricing page](https://platform.claude.com/docs/en/about-claude/pricing) into **[`hooks/pricing.ts`](hooks/pricing.ts)**, one row per model. If prices change, edit that table. On a Pro/Max subscription you don't pay per token, so read the number as "what this would cost on the API". Bedrock, Vertex and regional endpoints have their own prices. A model missing from the table is named in the receipt (`no price for ...`).

A subagent still running in the background when Claude answers is counted in the next receipt.

**Settings** (`cost`): `cacheWriteTtl` (`'5m'`, or `'1h'` if your setup uses one-hour caching), `hideBelowUsd` (0 = always show).

### Feature 7: Idle session reminder

**What it does.** The prompt cache is what makes re-sending a long conversation cheap, and it expires after a few idle minutes. If more than **10 minutes** have passed since Claude's last response and the context is over **100K tokens**, your next message is held while you're asked:

```text
Idle for 14 min with 152K tokens of context. The prompt cache has likely expired, so this
message re-sends the full context at full price (about $0.760). What now?
  1. Continue
  2. Compact first
  3. Start fresh
```

- **Continue** (press `1`): your message is sent.
- **Compact first**: your message goes back into the prompt box and `/compact` starts. Send it once compaction finishes.
- **Start fresh**: your message goes back into the prompt box. Type `/clear`, then send it.
- **Esc**: your message is held, and sending it again (within 5 minutes) goes straight through.

**Settings** (`idle`): `idleMinutes` (10), `minContextTokens` (100,000), `resendGraceMinutes` (5).

---

## 8. Hot reloading, updating and removing

**Hot reloading.** When you run `claude --plugin-dir ~/session-saver-mod`, Claude Code watches the folder. Save a file and the mod reloads, with a dim line saying so. A reload keeps what the mod stores in `$.state` (whether `/cheap` is on, which context notices have shown, the idle clock). It forgets the per-file read counts and the paths you approved for big reads, so those start over.

**Updating.** Get the latest code:

```bash
cd ~/session-saver-mod
git pull
```

If you installed it from GitHub, also update the installed copy, then run `/reload-plugins` in any open session (new sessions pick it up by themselves):

```bash
claude plugin marketplace update session-saver-mod
claude plugin update session-saver-mod@session-saver-mod
```

**Removing.**

```bash
claude plugin uninstall session-saver-mod@session-saver-mod
claude plugin marketplace remove session-saver-mod
```

To keep it installed but turn it off, open `/plugin`, go to **Installed**, select it and press Space. To turn off just one feature, set its switch in `config.ts` to `false`.

## 9. Using it with token-tracker-mod

session-saver-mod doesn't depend on any other mod and works alongside token-tracker-mod: they're separate plugins, and each hook passes events on (`next(e)`), so neither blocks the other. Both can watch the same things, though, so you may see two lines for one event. Turn off the overlapping feature in one of them. For this mod, set the switch in `hooks/config.ts` to `false`:

| If token-tracker-mod already shows... | Turn off here |
|---|---|
| a per-turn token or cost line | `costReceipt` |
| context-window warnings | `contextNudge` |
| warnings about large reads | `bigFileWarning` |

If both mods ever route models or set a subagent's model, keep only one doing it (`modelRouter`, `subagentModel`).

## 10. Troubleshooting

**`/cheap` isn't in the command list, or nothing happens.** The mod didn't load. Run `/plugin` and look for `session-saver-mod` in the `mods active` line and under **Installed** (also check the **Errors** tab). Check `claude --version` is 2.1.287 or later. Run `claude plugin validate ~/session-saver-mod`. Start with `claude --debug --plugin-dir ~/session-saver-mod` to see why a hook was skipped.

**I typed `/plugin install ...` and Claude answered it like a question.** Something came before the `/`. Clear the prompt and type `/` first.

**`/model` still says Opus after `/cheap`.** That's expected. See the model router's [limitation](#feature-1-model-router-cheap-smart-short-message-tip). The `cheap mode` status entry and the receipt show which model actually answered.

**The receipt's cost looks wrong.** Check `hooks/pricing.ts` against the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing). If your setup uses one-hour caching, set `cost.cacheWriteTtl` to `'1h'`. Subscription plans aren't billed per token.

**A setting I changed does nothing.** An installed copy doesn't see edits to your clone. See [The features, one by one](#7-the-features-one-by-one).

**Mods don't load at all.** They're off under `--safe-mode`, `--bare`, `"disableAllHooks": true` in settings, in WSL sessions of the desktop app, or if your organization blocks user-installed mods.

## Limitations

- **The model router doesn't change the session's model setting.** The mods API can't, so the mod reroutes each request instead. `/model` and the status line keep showing your original model. `/cheap` lasts for the session only.
- **Switching models re-sends the context once without cache help** (the cache belongs to one model). With a very big context, that can cost more than it saves. `/cheap` tells you the cost when the context is over 20K tokens.
- **Subagents with a model set in their definition file** get Sonnet too, unless you list their type in `subagent.skipAgentTypes`, because a mod can't read an agent's definition. Built-in `claude-code-guide` and `statusline-setup` are already listed.
- **Costs are estimates** from list API prices, and the token estimate for big files is a rough size ÷ 4.
- **The big-folder count** walks the folder (up to 2,000 subfolders) skipping `ignoreDirs`. Grep also skips what your `.gitignore` lists, so it may search fewer files than counted.
- **Read counts and big-read approvals reset** when the mod hot-reloads.
- **Where nothing can draw** (`claude -p`, the VS Code chat panel, cloud sessions), the colored notices become dim transcript lines and the questions are skipped: the big-file and idle checks log a line and let the request go.
- **The idle reminder's question** uses Claude Code's question dialog while your message is being sent. If your version can't show it there, the message is held and you're told to send again, which goes straight through.

## How it's built

```text
.claude-plugin/
  plugin.json          the plugin manifest
  marketplace.json     makes this repo installable with /plugin install
hooks/
  hooks.json           points Claude Code at register.ts
  register.ts          switches each feature on
  config.ts            ← all settings
  pricing.ts           ← the price table
  state.ts             starting values for what the mod remembers ($.state)
  lib/format.ts        small helpers (token counts, dollars, model names)
  features/
    model-router.ts    1. /cheap, /smart, short-message tip
    context-nudge.tsx  2. 60% / 85% notices (draws the band above the prompt)
    subagent-model.ts  3. Sonnet for subagents
    big-file.ts        4. confirm huge reads and searches
    repeat-read.ts     5. repeat-read notice
    cost-receipt.ts    6. per-prompt receipt
    idle-reminder.ts   7. idle reminder
types/index.d.ts       the shape of what the mod remembers
tests/                 one test file per feature (claude plugin test)
```

Each feature file starts with a comment explaining what it does and which events it uses. The [mods docs](https://code.claude.com/docs/en/plugins/mods/overview) and the type declarations Claude Code writes into `.claude-plugin/types/` when it loads the mod are the reference for every event and call.
