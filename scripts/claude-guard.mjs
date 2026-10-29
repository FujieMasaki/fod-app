import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The task branch pattern is shared with the quality gate. If that module
// cannot be loaded (a syntax error while it is being edited), only the
// main-checkout check is lost; the other checks still run.
let taskBranchPattern;
try {
  ({ taskBranchPattern } = await import("./claude-quality-gate.mjs"));
} catch {
  taskBranchPattern = undefined;
}

// Claude Code PreToolUse hook for Bash. A safety net next to permissions,
// Lefthook, and the GitHub ruleset on main, not the only defence: it cannot see
// through aliases, script files, or variable expansion. Exit code 2 denies the
// command and returns stderr to Claude.

const separators = new Set([";", "&", "|", "(", ")"]);
const heredocStart = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|()<>'"]+))/;

// Index of the `"` closing a double-quoted string that starts at `from`, or -1.
function closingDoubleQuote(command, from) {
  for (let index = from; index < command.length; index += 1) {
    if (command[index] === "\\") index += 1;
    else if (command[index] === '"') return index;
  }
  return -1;
}

// Skips the heredoc bodies that start after the newline at `index` and returns
// the index of the newline ending the last delimiter line, or -1 if one is missing.
function skipHeredocBodies(command, index, heredocs) {
  let position = index + 1;
  for (const { strip, delimiter } of heredocs) {
    let found = false;
    while (position <= command.length) {
      const lineEnd = command.indexOf("\n", position);
      const line = command.slice(position, lineEnd === -1 ? undefined : lineEnd);
      position = lineEnd === -1 ? command.length + 1 : lineEnd + 1;
      if ((strip ? line.replace(/^\t+/, "") : line) === delimiter) {
        found = true;
        break;
      }
    }
    if (!found) return -1;
  }
  return position - 1;
}
const redirectOperator = /^(?:&>>|&>|<<<|<<-|<<|<>|<&|>&|>>|>\||>|<)/;

// Splits a command into simple commands, each a list of words with shell
// quoting and escapes removed, so `"--force"` is checked as `--force`.
// Heredoc bodies and command substitutions are parsed separately and their
// commands are checked too, since `sh <<EOF` or `$(...)` runs them.
// `incomplete` reports input the parser could not close (quote, heredoc,
// substitution); callers treat it as unsafe rather than guess.
export function parseCommand(command) {
  const segments = [];
  const nested = [];
  let incomplete = false;
  let words = [];
  let word = "";
  let inWord = false;
  let redirectTarget = false;
  let heredocNext = null;
  const heredocs = [];

  const endWord = () => {
    if (inWord) {
      if (heredocNext) {
        heredocs.push({ ...heredocNext, delimiter: word });
        heredocNext = null;
      } else if (redirectTarget) {
        redirectTarget = false;
      } else {
        words.push(word);
      }
    }
    word = "";
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    redirectTarget = false;
    if (words.length) segments.push(words);
    words = [];
  };

  // Returns the index of the closing character of `$(...)` or `` `...` ``.
  // Quoted text and heredoc bodies are skipped, so `)` in a commit message
  // passed as `"$(cat <<'EOF' ... EOF)"` does not end the substitution.
  const substitution = (start, open, close) => {
    let depth = 1;
    const pending = [];
    for (let index = start; index < command.length; index += 1) {
      const char = command[index];
      if (char === "\\") {
        index += 1;
      } else if (char === "'" || (char === '"' && close !== '"')) {
        const end = char === "'" ? command.indexOf("'", index + 1) : closingDoubleQuote(command, index + 1);
        if (end === -1) break;
        index = end;
      } else if (char === "<" && command.startsWith("<<", index) && !command.startsWith("<<<", index)) {
        const match = command.slice(index).match(heredocStart);
        if (match) {
          pending.push({ strip: match[1] === "-", delimiter: match[2] ?? match[3] ?? match[4] });
          index += match[0].length - 1;
        }
      } else if (char === "\n" && pending.length) {
        index = skipHeredocBodies(command, index, pending.splice(0));
        if (index === -1) break;
      } else if (open && char === open) {
        depth += 1;
      } else if (char === close && --depth === 0) {
        nested.push({ text: command.slice(start, index), strict: true });
        return index;
      }
    }
    incomplete = true;
    return command.length;
  };

  // Consumes heredoc bodies that start after the newline at `index`.
  const readHeredocs = (index) => {
    let position = index + 1;
    for (const heredoc of heredocs.splice(0)) {
      const body = [];
      let found = false;
      while (position <= command.length) {
        const lineEnd = command.indexOf("\n", position);
        const line = command.slice(position, lineEnd === -1 ? undefined : lineEnd);
        position = lineEnd === -1 ? command.length + 1 : lineEnd + 1;
        if ((heredoc.strip ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) {
          found = true;
          break;
        }
        body.push(line);
      }
      if (!found) incomplete = true;
      // Bodies are often prose (commit messages), so an unbalanced quote there
      // is not a parse failure of the outer command.
      nested.push({ text: body.join("\n"), strict: false });
    }
    return position - 1;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "'") {
      const end = command.indexOf("'", index + 1);
      if (end === -1) incomplete = true;
      word += command.slice(index + 1, end === -1 ? undefined : end);
      inWord = true;
      index = end === -1 ? command.length : end;
    } else if (char === '"') {
      inWord = true;
      let closed = false;
      for (index += 1; index < command.length; index += 1) {
        const inner = command[index];
        if (inner === '"') {
          closed = true;
          break;
        }
        if (inner === "\\" && '"\\$`\n'.includes(command[index + 1] ?? "")) {
          index += 1;
          word += command[index];
        } else if (inner === "$" && command[index + 1] === "(") {
          index = substitution(index + 2, "(", ")");
        } else if (inner === "`") {
          index = substitution(index + 1, null, "`");
        } else {
          word += inner;
        }
      }
      if (!closed) incomplete = true;
    } else if (char === "\\") {
      index += 1;
      if (command[index] !== "\n") {
        word += command[index] ?? "";
        inWord = true;
      }
    } else if (char === "`") {
      index = substitution(index + 1, null, "`");
      inWord = true;
    } else if (char === "$" && command[index + 1] === "(") {
      index = substitution(index + 2, "(", ")");
      inWord = true;
    } else if (char === ">" || char === "<" || (char === "&" && command[index + 1] === ">")) {
      // A leading fd number (`2>`) belongs to the operator, not the arguments.
      if (/^\d+$/.test(word)) {
        word = "";
        inWord = false;
      }
      endWord();
      const operator = command.slice(index).match(redirectOperator)[0];
      index += operator.length - 1;
      if (operator === "<<" || operator === "<<-") {
        heredocNext = { strip: operator === "<<-" };
      } else if (operator.endsWith("&") && command[index + 1] === "-") {
        index += 1; // `2>&-` closes the fd and takes no target.
      } else {
        redirectTarget = true;
      }
    } else if (char === "#" && !inWord) {
      const end = command.indexOf("\n", index);
      index = end === -1 ? command.length : end - 1;
    } else if (char === "\n") {
      endSegment();
      if (heredocs.length) index = readHeredocs(index);
    } else if (separators.has(char)) {
      endSegment();
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      word += char;
      inWord = true;
    }
  }
  endSegment();
  if (heredocNext || heredocs.length) incomplete = true;

  for (const { text, strict } of nested) {
    const inner = parseCommand(text);
    segments.push(...inner.segments);
    if (strict && inner.incomplete) incomplete = true;
  }
  return { segments, incomplete };
}

export const tokenize = (command) => parseCommand(command).segments;

const assignmentPattern = /^[A-Za-z_][A-Za-z0-9_]*=/;

function isLefthookBypass(assignment) {
  return /^LEFTHOOK=(?:0|false)$/i.test(assignment) || assignment.startsWith("LEFTHOOK_EXCLUDE=");
}

// Leading `VAR=value` words and `env VAR=value` set the environment for the command.
function splitAssignments(words) {
  let index = words[0] === "env" ? skipOptions(words, 1, ["-u", "--unset", "-C", "--chdir", "-S"]) : 0;
  const assignments = [];
  while (assignmentPattern.test(words[index] ?? "")) assignments.push(words[index++]);
  return { assignments, rest: words.slice(index) };
}

// Index of the first word after a wrapper's options, `--` included.
function skipOptions(words, index, valueOptions = []) {
  while (words[index]?.startsWith("-")) {
    if (words[index] === "--") return index + 1;
    index += valueOptions.includes(words[index]) ? 2 : 1;
  }
  return index;
}

function parseGit(words) {
  let index = 1;
  const dirs = [];
  while (words[index]?.startsWith("-")) {
    if (words[index] === "-C") dirs.push(words[index + 1]);
    index += ["-C", "-c"].includes(words[index]) ? 2 : 1;
  }
  return { name: words[index], args: words.slice(index + 1), dirs };
}

// The environment without GIT_* variables, which can point git at another
// repository than the one at `-C dir` (git hooks set GIT_DIR, for example).
export function gitEnvFor(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_")));
}

// [gitDir, commonDir] of the repository at dir, or undefined outside one.
function gitDirs(dir) {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], {
    encoding: "utf8",
    env: gitEnvFor(),
    timeout: 2000,
  });
  if (result.status !== 0) return undefined;
  const [gitDir, commonDir] = result.stdout.trim().split("\n");
  return gitDir && commonDir ? [gitDir, commonDir] : undefined;
}

let guardRepository;
// The common git dir of the repository this script belongs to, so other
// repositories with the same branch naming are left alone.
function ownRepository() {
  guardRepository ??= gitDirs(path.dirname(fileURLToPath(import.meta.url)))?.[1] ?? null;
  return guardRepository;
}

// True when dir is the main working tree (not a linked worktree) of
// `repository`. Outside it, false, so unrelated commands are not denied.
export function isMainCheckout(dir, repository = ownRepository()) {
  const dirs = gitDirs(dir);
  return Boolean(dirs && repository) && dirs[0] === dirs[1] && dirs[1] === repository;
}

// The directory after `cd target` or `git -C target`, or undefined once it
// cannot be known (`~user`, `-`, a variable, or a relative path from nowhere).
function moveTo(dir, target) {
  if (target === "~" || target?.startsWith("~/")) target = path.join(homedir(), target.slice(1));
  if (!target || /^[~-]|\$/.test(target)) return undefined;
  if (path.isAbsolute(target)) return path.resolve(target);
  return dir && path.resolve(dir, target);
}

const refPrefix = /^(?:refs\/heads\/|refs\/remotes\/)/;
// `feat/task-…`, or a remote-tracking name such as `upstream/feat/task-…`.
const isTaskBranch = (name) => {
  if (!name || !taskBranchPattern) return false;
  const branch = name.replace(refPrefix, "");
  return taskBranchPattern.test(branch) || taskBranchPattern.test(branch.replace(/^[^/]+\//, ""));
};
const createOptions = new Set(["-c", "-C", "--create", "--force-create", "-b", "-B", "--orphan"]);
const attachedCreate = /^-[cCbB](.+)$/;

// `git switch` / `git checkout` moving onto a task branch, created or existing.
// `git checkout <ref> -- <path>` restores files and stays on the branch, but a
// trailing `--` with no path still switches.
function switchesToTaskBranch(git) {
  const separator = git.args.indexOf("--");
  if (git.name === "checkout" && separator !== -1 && separator < git.args.length - 1) return false;
  const beforePaths = separator === -1 ? git.args : git.args.slice(0, separator);
  // `git switch` takes no paths, so a branch may follow its `--`.
  const args = git.name === "switch" ? git.args.filter((arg) => arg !== "--") : beforePaths;
  // A detached HEAD is not a task branch, so the quality gate does not hold it.
  if (args.includes("--detach") || (git.name === "switch" && args.includes("-d"))) return false;
  for (let index = 0; index < args.length; index += 1) {
    // A new branch is judged by its own name; its start point may be a task branch.
    const [option, value] = args[index].split(/=(.*)/);
    if (createOptions.has(option)) return isTaskBranch(value ?? args[index + 1]);
    const attached = args[index].match(attachedCreate)?.[1];
    if (attached) return isTaskBranch(attached);
  }
  return args.some((arg) => !arg.startsWith("-") && isTaskBranch(arg));
}

const mainCheckoutReason =
  "Do not move the main checkout onto a task branch: every session in this checkout would then be held by the " +
  "quality gate for that task. Work in the task's worktree instead (find it with `git worktree list`, or create it " +
  "with `git worktree add .claude/worktrees/task-NNN <branch>`; if the main checkout is already on that branch, " +
  "`git switch main` first). Before entering it, follow the start of `.claude/skills/pr-review-cycle/SKILL.md` " +
  "(no scheduled session working there, `FOD_DB_SUFFIX` when the branch has migrations, dependencies and `--reset`). " +
  "To read a branch without switching, use `git show <branch>:<path>` or `git diff`.";
const prCheckoutReason =
  "Do not run `gh pr checkout` in the main checkout: if the PR is a task branch, every session in this checkout " +
  "would be held by the quality gate for that task. Check the branch out in a worktree instead " +
  "(`gh pr view <number> --json headRefName`, then `git worktree add .claude/worktrees/task-NNN <branch>`), " +
  "following the start of `.claude/skills/pr-review-cycle/SKILL.md`.";

// Reads a short option cluster such as `-nm"msg"` or `-uf` from the left, as
// git does: flags up to the first one that takes a value, whose value is the
// rest of the word or, if nothing is left, the next word.
function shortCluster(arg, valueFlags) {
  const flags = [];
  for (let index = 1; index < arg.length; index += 1) {
    flags.push(arg[index]);
    if (valueFlags.has(arg[index])) return { flags, takesNext: index === arg.length - 1 };
  }
  return { flags, takesNext: false };
}

const isShortCluster = (arg) => arg.length > 1 && arg.startsWith("-") && !arg.startsWith("--");

// Options whose next word is a value (a message or path), not a flag.
const commitValueOptions = new Set([
  "-m",
  "--message",
  "-F",
  "--file",
  "-C",
  "-c",
  "--author",
  "--date",
  "-t",
  "--template",
  "--fixup",
  "--squash",
  "--trailer",
]);
const commitShortValueFlags = new Set(["m", "F", "C", "c", "t"]);

function commitBypassesHooks(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-verify") return true;
    if (commitValueOptions.has(arg)) {
      index += 1;
    } else if (isShortCluster(arg)) {
      const { flags, takesNext } = shortCluster(arg, commitShortValueFlags);
      if (flags.includes("n")) return true;
      if (takesNext) index += 1;
    }
  }
  return false;
}

const pushValueOptions = new Set(["--repo", "--push-option", "--receive-pack", "--exec"]);
const pushShortValueFlags = new Set(["o"]);

const explicitPushReason =
  "Name the destination branch explicitly, e.g. `git push -u origin HEAD:feat/task-008-<slug>`. " +
  "Pushes without an explicit destination are denied because where they land depends on the current " +
  "branch and push config at run time.";

// Only pushes whose every destination is spelled out are allowed, so the
// check never depends on which branch is checked out when the push runs.
function pushDenyReason(args) {
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-verify") return "Do not bypass Lefthook. Fix the failing check instead.";
    if (arg === "--force") return "Use --force-with-lease instead of --force.";
    if (["--all", "--mirror", "--branches"].includes(arg)) return "Push only the task branch, not every branch.";
    if (pushValueOptions.has(arg)) {
      index += 1;
    } else if (isShortCluster(arg)) {
      const { flags, takesNext } = shortCluster(arg, pushShortValueFlags);
      if (flags.includes("f")) return "Use --force-with-lease instead of --force.";
      if (takesNext) index += 1;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const refspecs = positional.slice(1);
  if (refspecs.length === 0) return explicitPushReason;
  for (const refspec of refspecs) {
    if (refspec.startsWith("+")) return "Use --force-with-lease instead of a +refspec.";
    if (refspec.includes("*") || refspec.startsWith("^")) {
      return "Push one explicit branch; wildcard and negative refspecs can expand to main.";
    }
    const separator = refspec.lastIndexOf(":");
    const destination = separator === -1 ? "" : refspec.slice(separator + 1).replace(/^refs\/heads\//, "");
    if (destination === "main") return "Do not push to main. Push the task branch and open a PR.";
    if (!destination || ["HEAD", "@"].includes(destination)) return explicitPushReason;
  }
  return undefined;
}

// Words that run the rest of the line as a command.
const commandWrappers = new Set(["command", "builtin", "exec", "nohup", "time", "noglob"]);
const shells = new Set(["sh", "bash", "zsh", "dash"]);
const MAX_NESTING = 5;

// context: { cwd, isMainCheckout(dir) } from the hook input. Without it, the
// main-checkout check is skipped.
export function denyReason(command, context = {}, depth = 0) {
  if (depth > MAX_NESTING) return "This command nests shells too deeply to check. Run it directly.";
  if (/co-authored-by:/i.test(command) && /\bgit\b[\s\S]*\bcommit\b/.test(command)) {
    return "Do not add Co-Authored-By or other attribution trailers to commits.";
  }

  const { segments, incomplete } = parseCommand(command);
  if (incomplete && /\b(?:git|gh)\b|LEFTHOOK/.test(command)) {
    return (
      "Could not parse this command safely (an unterminated quote, heredoc, or substitution). " +
      "Split it into simpler commands."
    );
  }

  let cwd = context.cwd;
  const inMainCheckout = (dir) => Boolean(dir && context.isMainCheckout?.(dir));
  for (const words of segments) {
    const { assignments, rest: afterAssignments } = splitAssignments(words);
    let rest = afterAssignments;
    while (commandWrappers.has(rest[0])) rest = rest.slice(skipOptions(rest, 1, ["-a"]));
    const exported = rest[0] === "export" ? rest.slice(1) : [];
    if ([...assignments, ...exported].some(isLefthookBypass)) {
      return "Do not bypass Lefthook. Fix the failing check instead.";
    }

    const [program, ...args] = rest;
    if (program === "cd") {
      // `cd` with no directory goes home; `cd -` goes back to a place not tracked.
      cwd = args.includes("-") ? undefined : moveTo(cwd, args.find((arg) => !arg.startsWith("-")) ?? "~");
      continue;
    }

    // `sh -c '...'` and `eval ...` run their argument as a command line.
    const scriptIndex = shells.has(program) ? args.findIndex((arg) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg)) : -1;
    const script = scriptIndex !== -1 ? args[scriptIndex + 1] : program === "eval" ? args.join(" ") : undefined;
    if (script !== undefined) {
      const reason = denyReason(script, { ...context, cwd }, depth + 1);
      if (reason) return reason;
      continue;
    }

    if (program === "gh") {
      const prIndex = args.indexOf("pr");
      if (prIndex !== -1 && args[prIndex + 1] === "merge") return "Merging is done by a human. Leave the PR open.";
      const prCheckout = (prIndex !== -1 && args[prIndex + 1] === "checkout") || args[0] === "co";
      if (prCheckout && inMainCheckout(cwd)) return prCheckoutReason;
    }

    if (program !== "git") continue;
    const git = parseGit(rest);
    if (
      ["switch", "checkout"].includes(git.name) &&
      switchesToTaskBranch(git) &&
      inMainCheckout(git.dirs.reduce(moveTo, cwd))
    ) {
      return mainCheckoutReason;
    }
    if (git.name === "commit" && commitBypassesHooks(git.args)) {
      return "Do not bypass Lefthook (--no-verify / -n skips hooks). Fix the failing check instead.";
    }
    if (git.name === "push") {
      const reason = pushDenyReason(git.args);
      if (reason) return reason;
    } else if (git.name !== "commit" && git.args.includes("--no-verify")) {
      return "Do not bypass Lefthook. Fix the failing check instead.";
    }
  }
  return undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    // Not a hook payload; nothing to check.
  }
  const reason = denyReason(input.tool_input?.command ?? "", { cwd: input.cwd ?? process.cwd(), isMainCheckout });
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exitCode = 2;
  }
}
