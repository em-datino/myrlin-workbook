# Myrlin Workbook -- Quick Start Guide

A practical walkthrough for setting up a Claude Code agent team session and managing it from the web UI, including Telegram push notifications.

---

## 1. Launch the Server

```bash
# Default: binds to 0.0.0.0:3456 (reachable over Tailscale / LAN)
node src/gui.js

# Restrict to localhost only
CWM_HOST=127.0.0.1 node src/gui.js

# Custom port
CWM_PORT=8080 node src/gui.js
```

On first run the server generates a random password and saves it to `~/.myrlin/config.json`. You can override it with `CWM_PASSWORD=yourpass`.

Open the URL printed in the terminal and log in.

---

## 2. Create a Workspace

A workspace groups related sessions together and gives them shared docs/context.

1. Click **+ New Workspace** in the sidebar.
2. Give it a name (e.g. `my-project`) and optionally pick a color tag.
3. The workspace appears in the sidebar and is automatically activated.

> **Tip:** Use workspace groups (right-click a workspace → "Move to Group") to organize multiple projects.

---

## 3. Create Sessions (Agent Team)

Inside your workspace, create one session per agent role. For a typical team:

| Session name | Purpose |
|---|---|
| **Lead** | Orchestrates the team, delegates tasks |
| **Backend** | Implements server/API code |
| **Frontend** | Implements UI code |
| **Tests** | Writes and runs tests |

For each session:

1. Click **+ New Session** inside the workspace.
2. Fill in:
   - **Name** -- e.g. `Lead Agent`
   - **Working Directory** -- the project root (use the folder browser)
   - **Command** -- leave as `claude` (default)
   - **Skip Permissions** -- toggle on if you want fully autonomous agents
   - **Model** -- pick your preferred model (optional)
3. Click **Create**.

The session appears in the workspace panel with status **idle**.

---

## 4. Start Sessions

Click the **play button** on a session card to launch it. The session opens in a terminal pane powered by xterm.js.

- Up to **4 terminal panes** are visible at once (2x2 grid).
- Drag session tabs between pane slots to rearrange.
- Type directly in the terminal to interact with Claude.

To give the lead agent an initial prompt, just type in its terminal pane:

```
Build the authentication module. Delegate backend work to the Backend
session and frontend work to the Frontend session.
```

### Session Controls

| Action | How |
|---|---|
| **Stop** | Click the stop button on the session card |
| **Restart** | Click the restart button (stops then relaunches) |
| **Restart All** | Click the rotate-arrows icon in the header bar |

---

## 5. Monitor Subagents

When a session uses Claude's `Task` tool to spawn subagents, you can track them:

- Click a running session card to expand its details.
- The **Subagents** section shows spawned tasks, their types, and status.
- The workspace-level view shows all active sessions at a glance.

---

## 6. Set Up Telegram Notifications

Get push notifications on your phone when a session errors out or needs attention.

### One-time setup

1. **Create a Telegram bot:**
   - Open Telegram and search for **@BotFather**.
   - Send `/newbot`, follow the prompts, and copy the **bot token**.

2. **Start a chat with your bot:**
   - Find your new bot in Telegram and send it `/start`.

3. **Configure in Myrlin:**
   - Click the **paper-plane icon** in the top-right header bar.
   - Paste your **bot token** into the token field.
   - Click **Detect** -- your chat ID will be filled in automatically.
   - Choose which notification levels to receive:
     - **Errors** and **Warnings** are on by default.
     - Toggle on **Success** or **Info** if you want more visibility.
   - Set a **throttle** (default 10 seconds) to avoid message floods.
   - Toggle **Enable** on.
   - Click **Save**.

4. **Verify:**
   - Click **Send Test** -- you should receive a confirmation message in Telegram.

### What triggers a notification

| Event | Level |
|---|---|
| Session crashes or errors | `error` |
| Session deleted | `warning` |
| Store/system error | `error` |
| Session started successfully | `success` |
| Workspace created/switched | `info` |

Only the levels you enabled in step 3 will be sent to Telegram.

### Environment variable override

You can also configure Telegram without the UI:

```bash
CWM_TELEGRAM_BOT_TOKEN=123456:ABC-DEF... \
CWM_TELEGRAM_CHAT_ID=987654321 \
node src/gui.js
```

These take priority over the saved config.

---

## 7. Workspace Docs (Shared Agent Context)

Each workspace has built-in documentation sections that all sessions in the workspace can read:

- **Notes** -- free-form scratchpad
- **Goals** -- what the team is trying to achieve
- **Tasks** -- work items and status
- **Rules** -- coding standards, constraints

Click the **docs icon** on a workspace card to open the editor. Agents in the workspace can reference these docs for shared context.

---

## Typical Workflow

```
1. Create workspace "my-app"
2. Add sessions: Lead, Backend, Frontend, Tests
3. Set up Telegram notifications (paper-plane icon)
4. Start the Lead session
5. Give it instructions in the terminal
6. Monitor progress across terminal panes
7. Get Telegram alerts if anything fails
8. Review results, restart sessions as needed
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Quick switcher (jump to any workspace/session) |
| `Ctrl+1` through `Ctrl+4` | Switch terminal pane focus |
| `Ctrl+Shift+R` | Restart all sessions |

---

## Remote Access via Tailscale

The server binds to `0.0.0.0` by default, so if you have Tailscale installed you can access the UI from any device on your tailnet:

```
http://your-machine.ts.net:3456
```

CORS, CSP, and WebSocket connections all work automatically over Tailscale hostnames (`*.ts.net`) and Tailscale IPs (`100.x.x.x`).
