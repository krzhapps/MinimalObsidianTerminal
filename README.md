# Minimal Obsidian Terminal

A tiny terminal pane for [Obsidian](https://obsidian.md). Opens a split at the bottom of the workspace where you can run shell commands against your vault directory. No TTY emulation, no dependencies beyond Obsidian itself — just `stdin`/`stdout`/`stderr` piped into a simple text view.

If you need full interactive programs (`vim`, `htop`, password prompts), use the community [Terminal](https://github.com/polyipseity/obsidian-terminal) plugin instead. This one is for running one-shot commands (`git`, `npm`, `ls`, pipes, etc.) with the smallest possible surface area.

## Features

- Opens in a horizontal split at the bottom of the workspace
- Uses your login shell (`$SHELL`), so aliases, pipes, globs, and redirection all work
- Starts in the vault directory; `cd` is handled in-process so the working directory persists across commands
- Command history via `Up` / `Down`
- `Ctrl+C` sends `SIGINT` to the running process
- `Ctrl+L` or `clear` clears the output
- `Tab` completes file and directory paths relative to the current working directory (supports `~` and absolute paths)
- **Toggle terminal** command (default `Ctrl/Cmd+Shift+` `` ` ``) shows or hides the pane
- stderr shown in red, exit codes shown after each command
- Styled with Obsidian theme variables — adapts to light/dark themes automatically

## Limitations

- **Desktop only.** Mobile Obsidian has no Node.js runtime.
- **No TTY.** Programs that require a terminal (fullscreen TUIs, interactive prompts, `sudo` password entry) will not work. Some programs disable colors when they don't detect a TTY — pass `--color=always` or equivalent if you want them.
- **No stdin to running processes.** Once a command is running, you can only send `SIGINT`, not additional input.

## Installation

### From this repo (development)

This plugin lives inside the vault at `.obsidian/plugins/MinimalObsidianTerminal`.

```bash
npm install
npm run build
```

Then in Obsidian: **Settings → Community plugins → Installed plugins**, enable **Minimal Terminal**. If it doesn't appear, toggle "Restricted mode" off and reload.

### Development workflow

```bash
npm run dev
```

Runs esbuild in watch mode. After each change, trigger **Reload app without saving** from the Obsidian command palette to pick up the new `main.js`.

## Usage

- Click the terminal ribbon icon, or run **Open terminal** from the command palette (`Ctrl/Cmd+P`).
- Type a command, press `Enter`.
- `cd some/path` changes the working directory for subsequent commands. `cd` with no argument returns to `$HOME`. `~` expansion is supported.

## Keybindings

| Key | Action |
|-----|--------|
| `Enter` | Run the current command |
| `Up` / `Down` | Navigate command history |
| `Ctrl+C` | Send `SIGINT` to the running process |
| `Ctrl+L` | Clear the output |
| `Tab` | Complete file/directory paths |
| `Ctrl/Cmd+Shift+` `` ` `` | Toggle the terminal pane (show/hide) |

## How it works

Commands are executed with `child_process.spawn($SHELL, ['-lc', cmd])` (login shell, so your profile sets `PATH` etc.). Output streams are appended to a `<pre>` element; stderr is styled separately. The working directory is tracked in the plugin (not the shell), so `cd` is intercepted and applied to subsequent `spawn` calls via the `cwd` option.

On Windows the shell falls back to `cmd.exe /c`.

### Flatpak Obsidian

If Obsidian is running as a Flatpak (detected via `/.flatpak-info`), commands are wrapped with `flatpak-spawn --host` so they run on the host system instead of inside the sandbox. Otherwise host binaries like `gh`, `git` credential helpers, or anything outside the runtime would be invisible to the shell.

This requires the Flatpak to be allowed to talk to the host portal. Grant it once:

```bash
flatpak override --user --talk-name=org.freedesktop.Flatpak md.obsidian.Obsidian
```

Then fully quit and relaunch Obsidian. Without this override you'll see `Portal call failed: org.freedesktop.DBus.Error.ServiceUnknown` from `flatpak-spawn`.

## License

MIT
