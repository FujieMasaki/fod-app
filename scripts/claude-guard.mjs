import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Claude Code PreToolUse hook for Bash. A safety net next to permissions and
// Lefthook, not the only defence: string checks cannot see through aliases or
// scripts. Exit code 2 denies the command and returns stderr to Claude.

// Quoted text (commit messages, PR bodies) must not trigger flag checks.
function withoutQuotedText(command) {
  return command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
}

function segments(command) {
  return withoutQuotedText(command)
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim().split(/\s+/).filter(Boolean));
}

function gitSubcommand(words) {
  const gitIndex = words.indexOf("git");
  if (gitIndex === -1) return {};
  // Skip global options such as `-C dir` before the subcommand.
  let index = gitIndex + 1;
  while (words[index]?.startsWith("-")) index += ["-C", "-c"].includes(words[index]) ? 2 : 1;
  return { name: words[index], args: words.slice(index + 1) };
}

export function denyReason(command) {
  if (/co-authored-by:/i.test(command) && /\bgit\b[\s\S]*\bcommit\b/.test(command)) {
    return "Do not add Co-Authored-By or other attribution trailers to commits.";
  }

  for (const words of segments(command)) {
    if (words.includes("--no-verify") || words.some((word) => /^LEFTHOOK=0$/.test(word))) {
      return "Do not bypass Lefthook. Fix the failing check instead.";
    }

    if (words[0] === "gh" && words[1] === "pr" && words[2] === "merge") {
      return "Merging is done by a human. Leave the PR open.";
    }

    const git = gitSubcommand(words);
    if (git.name === "commit" && git.args.includes("-n")) {
      return "Do not bypass Lefthook (-n skips hooks). Fix the failing check instead.";
    }
    if (git.name === "push") {
      const forced = git.args.some(
        (arg) => arg === "--force" || /^-[a-zA-Z]*f/.test(arg) || (/^\+/.test(arg) && !arg.startsWith("+-")),
      );
      if (forced) return "Use --force-with-lease instead of --force.";

      const refspecs = git.args.filter((arg) => !arg.startsWith("-"));
      if (refspecs.some((ref) => /(^|:)(refs\/heads\/)?main$/.test(ref))) {
        return "Do not push to main. Push the task branch and open a PR.";
      }
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
