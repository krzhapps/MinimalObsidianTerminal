import { ItemView, Plugin, WorkspaceLeaf } from "obsidian";
import { spawn, ChildProcess } from "child_process";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const VIEW_TYPE_TERMINAL = "minimal-terminal-view";

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return "";
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === "") return "";
    }
  }
  return prefix;
}

class TerminalView extends ItemView {
  private outputEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private cwdEl!: HTMLElement;
  private cwd: string;
  private history: string[] = [];
  private historyIdx = -1;
  private current: ChildProcess | null = null;

  constructor(leaf: WorkspaceLeaf, initialCwd: string) {
    super(leaf);
    this.cwd = initialCwd;
  }

  getViewType() { return VIEW_TYPE_TERMINAL; }
  getDisplayText() { return "Terminal"; }
  getIcon() { return "terminal-square"; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("mot-container");

    this.cwdEl = root.createDiv({ cls: "mot-cwd", text: this.cwd });
    this.outputEl = root.createEl("pre", { cls: "mot-output" });

    const row = root.createDiv({ cls: "mot-input-row" });
    row.createSpan({ cls: "mot-prompt", text: "$" });
    this.inputEl = row.createEl("input", { cls: "mot-input", attr: { type: "text", placeholder: "Type a command…" } });

    this.inputEl.addEventListener("keydown", (e) => this.onKey(e));
    root.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).tagName !== "INPUT") this.inputEl.focus();
    });

    this.inputEl.focus();
  }

  async onClose() {
    this.current?.kill();
  }

  focusInput() {
    // Defer so focus wins against Obsidian's own layout/focus pass.
    setTimeout(() => this.inputEl?.focus(), 0);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = this.inputEl.value;
      this.inputEl.value = "";
      if (cmd.trim()) {
        this.history.push(cmd);
        this.historyIdx = this.history.length;
        this.run(cmd);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.historyIdx > 0) {
        this.historyIdx--;
        this.inputEl.value = this.history[this.historyIdx] ?? "";
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.historyIdx < this.history.length - 1) {
        this.historyIdx++;
        this.inputEl.value = this.history[this.historyIdx] ?? "";
      } else {
        this.historyIdx = this.history.length;
        this.inputEl.value = "";
      }
    } else if (e.key === "c" && e.ctrlKey) {
      if (this.current) {
        this.current.kill("SIGINT");
        this.append("^C\n", "mot-err");
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      this.outputEl.empty();
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.complete();
    }
  }

  private complete() {
    const value = this.inputEl.value;
    const caret = this.inputEl.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);

    // Find start of the current token (last whitespace before the caret).
    const tokenStart = Math.max(
      before.lastIndexOf(" "),
      before.lastIndexOf("\t"),
    ) + 1;
    const token = before.slice(tokenStart);

    // Split into directory part and the prefix we're completing.
    const slashIdx = token.lastIndexOf("/");
    const dirPart = slashIdx >= 0 ? token.slice(0, slashIdx + 1) : "";
    const prefix = slashIdx >= 0 ? token.slice(slashIdx + 1) : token;

    // Resolve the directory to read, honoring ~ and relative paths.
    const expanded = dirPart.replace(/^~(?=\/|$)/, os.homedir());
    const dirAbs = path.isAbsolute(expanded)
      ? (expanded || "/")
      : path.resolve(this.cwd, expanded || ".");

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    const matches = entries.filter((d) => d.name.startsWith(prefix));
    if (matches.length === 0) return;

    let completion: string;
    if (matches.length === 1) {
      const m = matches[0];
      completion = m.name + (m.isDirectory() ? "/" : " ");
    } else {
      const common = longestCommonPrefix(matches.map((m) => m.name));
      if (common.length > prefix.length) {
        completion = common;
      } else {
        this.append(matches.map((m) => m.name + (m.isDirectory() ? "/" : "")).join("  ") + "\n");
        return;
      }
    }

    const newToken = dirPart + completion;
    const newBefore = value.slice(0, tokenStart) + newToken;
    this.inputEl.value = newBefore + after;
    const pos = newBefore.length;
    this.inputEl.setSelectionRange(pos, pos);
  }

  private append(text: string, cls?: string) {
    const span = this.outputEl.createSpan({ text });
    if (cls) span.addClass(cls);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  private run(cmd: string) {
    if (this.current) {
      this.append("[a command is already running]\n", "mot-err");
      return;
    }

    this.append(`$ ${cmd}\n`, "mot-cmd");

    const trimmed = cmd.trim();

    // Handle `cd` in-process so cwd persists across commands.
    if (trimmed === "cd" || trimmed.startsWith("cd ")) {
      const target = trimmed === "cd" ? os.homedir() : trimmed.slice(3).trim();
      const resolved = path.resolve(this.cwd, target.replace(/^~(?=\/|$)/, os.homedir()));
      try {
        const fs = require("fs");
        const stat = fs.statSync(resolved);
        if (!stat.isDirectory()) throw new Error("not a directory");
        this.cwd = resolved;
        this.cwdEl.setText(this.cwd);
      } catch (err: any) {
        this.append(`cd: ${err.message}\n`, "mot-err");
      }
      return;
    }

    if (trimmed === "clear") {
      this.outputEl.empty();
      return;
    }

    const shell = process.env.SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
    const shellFlag = process.platform === "win32" ? "/c" : "-c";

    const child = spawn(shell, [shellFlag, cmd], {
      cwd: this.cwd,
      env: process.env,
    });
    this.current = child;

    child.stdout?.on("data", (d) => this.append(d.toString()));
    child.stderr?.on("data", (d) => this.append(d.toString(), "mot-err"));
    child.on("error", (err) => this.append(`${err.message}\n`, "mot-err"));
    child.on("close", (code) => {
      const cls = code === 0 ? "mot-exit-ok" : "mot-exit-bad";
      this.append(`[exit ${code}]\n`, cls);
      this.current = null;
    });
  }
}

export default class MinimalTerminalPlugin extends Plugin {
  async onload() {
    const initialCwd = this.getVaultPath() ?? os.homedir();

    this.registerView(
      VIEW_TYPE_TERMINAL,
      (leaf) => new TerminalView(leaf, initialCwd),
    );

    this.addCommand({
      id: "open-terminal",
      name: "Open terminal",
      callback: () => this.activate(),
    });

    this.addCommand({
      id: "toggle-terminal",
      name: "Toggle terminal",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "`" }],
      callback: () => this.toggle(),
    });

    this.addRibbonIcon("terminal-square", "Open terminal", () => this.activate());
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
  }

  private getVaultPath(): string | null {
    const adapter = this.app.vault.adapter as unknown as { basePath?: string };
    return adapter.basePath ?? null;
  }

  private async activate() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getLeaf("split", "horizontal");
      await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
    }
    workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });

    const view = leaf.view;
    if (view instanceof TerminalView) view.focusInput();
  }

  private toggle() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length === 0) {
      this.activate();
      return;
    }
    for (const leaf of existing) leaf.detach();
  }
}
