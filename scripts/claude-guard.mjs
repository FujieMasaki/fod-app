import { readFileSync } from "node:fs";
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
  // The word after a redirection operator is its target, not an argument.
  let redirectTarget = false;
  const endWord = () => {
    if (inWord) {
      if (redirectTarget) redirectTarget = false;
      else words.push(word);
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
    } else if (char === ">" || char === "<" || (char === "&" && command[index + 1] === ">")) {
      // `2>&1`, `>>log`, `&>log`, `<<'EOF'`: drop the fd number and the target.
      if (/^\d+$/.test(word)) {
        word = "";
        inWord = false;
      }
      endWord();
      while (/[<>&|-]/.test(command[index + 1] ?? "")) index += 1;
      redirectTarget = true;
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

function parseGit(words) {
  let index = 1;
  while (words[index]?.startsWith("-")) index += ["-C", "-c"].includes(words[index]) ? 2 : 1;
  return { name: words[index], args: words.slice(index + 1) };
}

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
  "Name the destination branch explicitly, e.g. `git push -u origin HEAD:claude/task-008-<slug>`. " +
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
    const separator = refspec.lastIndexOf(":");
    const destination = separator === -1 ? "" : refspec.slice(separator + 1).replace(/^refs\/heads\//, "");
    if (destination === "main") return "Do not push to main. Push the task branch and open a PR.";
    if (!destination || ["HEAD", "@"].includes(destination)) return explicitPushReason;
  }
  return undefined;
}

export function denyReason(command) {
  if (/co-authored-by:/i.test(command) && /\bgit\b[\s\S]*\bcommit\b/.test(command)) {
    return "Do not add Co-Authored-By or other attribution trailers to commits.";
  }

  for (const words of tokenize(command)) {
    const { assignments, rest } = splitAssignments(words);
    const exported = rest[0] === "export" ? rest.slice(1) : [];
    if ([...assignments, ...exported].some(isLefthookBypass)) {
      return "Do not bypass Lefthook. Fix the failing check instead.";
    }

    const [program, ...args] = rest;

    if (program === "gh") {
      const prIndex = args.indexOf("pr");
      if (prIndex !== -1 && args[prIndex + 1] === "merge") return "Merging is done by a human. Leave the PR open.";
    }

    if (program !== "git") continue;
    const git = parseGit(rest);
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
  const reason = denyReason(input.tool_input?.command ?? "");
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exitCode = 2;
  }
}
