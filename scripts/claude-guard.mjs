import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Claude Code PreToolUse hook for Bash. A safety net next to permissions and
// Lefthook, not the only defence: it cannot see through aliases, scripts, or
// variable expansion. Exit code 2 denies the command and returns stderr to Claude.

const separators = new Set([";", "&", "|", "\n", "(", ")"]);

// Splits a command into simple commands, each a list of words with shell
// quoting and escapes removed, so `"--force"` is checked as `--force`.
export function tokenize(command) {
  const segments = [];
  let words = [];
  let word = "";
  let inWord = false;
  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length) segments.push(words);
    words = [];
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "'") {
      const end = command.indexOf("'", index + 1);
      word += command.slice(index + 1, end === -1 ? undefined : end);
      inWord = true;
      index = end === -1 ? command.length : end;
    } else if (char === '"') {
      inWord = true;
      for (index += 1; index < command.length && command[index] !== '"'; index += 1) {
        if (command[index] === "\\" && '"\\$`\n'.includes(command[index + 1] ?? "")) index += 1;
        word += command[index];
      }
    } else if (char === "\\") {
      index += 1;
      if (command[index] !== "\n") {
        word += command[index] ?? "";
        inWord = true;
      }
    } else if (char === "#" && !inWord) {
      const end = command.indexOf("\n", index);
      index = end === -1 ? command.length : end - 1;
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
  return segments;
}

const assignmentPattern = /^[A-Za-z_][A-Za-z0-9_]*=/;

function isLefthookBypass(assignment) {
  return /^LEFTHOOK=(?:0|false)$/i.test(assignment) || assignment.startsWith("LEFTHOOK_EXCLUDE=");
}

// Leading `VAR=value` words and `env VAR=value` set the environment for the command.
function splitAssignments(words) {
  let index = words[0] === "env" ? 1 : 0;
  const assignments = [];
  while (assignmentPattern.test(words[index] ?? "")) assignments.push(words[index++]);
  return { assignments, rest: words.slice(index) };
}

function parseGit(words, cwd) {
  let dir = cwd;
  let index = 1;
  while (words[index]?.startsWith("-")) {
    if (words[index] === "-C") dir = path.resolve(dir, words[index + 1] ?? ".");
    index += ["-C", "-c"].includes(words[index]) ? 2 : 1;
  }
  return { name: words[index], args: words.slice(index + 1), dir };
}

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
    } else if (/^-[a-zA-Z]+$/.test(arg)) {
      // A short cluster such as -nm: stop at the first flag that takes a value.
      for (const flag of arg.slice(1)) {
        if (flag === "n") return true;
        if (commitShortValueFlags.has(flag)) {
          if (flag === arg.at(-1)) index += 1;
          break;
        }
      }
    }
  }
  return false;
}

const pushValueOptions = new Set(["--repo", "-o", "--push-option", "--receive-pack", "--exec"]);

function pushDenyReason(args, currentBranch) {
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-verify") return "Do not bypass Lefthook. Fix the failing check instead.";
    if (arg === "--force" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(arg)) return "Use --force-with-lease instead of --force.";
    if (arg === "--all" || arg === "--mirror" || arg === "--branches") {
      return "Push only the task branch, not every branch.";
    }
    if (pushValueOptions.has(arg)) index += 1;
    else if (!arg.startsWith("-")) positional.push(arg);
  }

  const refspecs = positional.slice(1);
  // Without a refspec, git pushes the current branch to its namesake.
  const destinations = refspecs.length ? [] : [currentBranch()];
  for (const refspec of refspecs) {
    if (refspec.startsWith("+")) return "Use --force-with-lease instead of a +refspec.";
    const [source, destination = source] = refspec.split(":");
    destinations.push(["HEAD", "@"].includes(destination) ? currentBranch() : destination);
  }

  if (destinations.some((destination) => destination?.replace(/^refs\/heads\//, "") === "main")) {
    return "Do not push to main. Push the task branch and open a PR.";
  }
  return undefined;
}

function gitCurrentBranch(dir) {
  const result = spawnSync("git", ["branch", "--show-current"], { cwd: dir, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

export function denyReason(command, { cwd = process.cwd(), currentBranch = gitCurrentBranch } = {}) {
  if (/co-authored-by:/i.test(command) && /\bgit\b[\s\S]*\bcommit\b/.test(command)) {
    return "Do not add Co-Authored-By or other attribution trailers to commits.";
  }

  let dir = cwd;
  for (const words of tokenize(command)) {
    const { assignments, rest } = splitAssignments(words);
    const exported = rest[0] === "export" ? rest.slice(1) : [];
    if ([...assignments, ...exported].some(isLefthookBypass)) {
      return "Do not bypass Lefthook. Fix the failing check instead.";
    }

    const [program, ...args] = rest;
    if (program === "cd") {
      dir = path.resolve(dir, (args[0] ?? homedir()).replace(/^~(?=$|\/)/, homedir()));
      continue;
    }

    if (program === "gh") {
      const prIndex = args.indexOf("pr");
      if (prIndex !== -1 && args[prIndex + 1] === "merge") return "Merging is done by a human. Leave the PR open.";
    }

    if (program !== "git") continue;
    const git = parseGit(rest, dir);
    if (git.name === "commit" && commitBypassesHooks(git.args)) {
      return "Do not bypass Lefthook (--no-verify / -n skips hooks). Fix the failing check instead.";
    }
    if (git.name === "push") {
      const reason = pushDenyReason(git.args, () => currentBranch(git.dir));
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
  const reason = denyReason(input.tool_input?.command ?? "", { cwd: input.cwd ?? process.cwd() });
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exitCode = 2;
  }
}
