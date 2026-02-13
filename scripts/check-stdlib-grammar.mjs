#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const DEFAULT_STD_DIR = "/Users/f00lg/github/c3/c3c/lib/std";
const DEFAULT_C3C = "c3c";

function printUsage() {
  console.log(`Usage: node scripts/check-stdlib-grammar.mjs [options]

Options:
  --std-dir <path>   Stdlib directory to scan (default: ${DEFAULT_STD_DIR})
  --c3c <path>       c3c executable for parser parity checks (default: $C3C or ${DEFAULT_C3C})
  --strict           Fail on any tree-sitter parse error
  --list-compiler-rejected  Print files rejected by both parser and compiler (parity mode)
  --help             Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    stdDir: DEFAULT_STD_DIR,
    c3cPath: null,
    strict: false,
    listCompilerRejected: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--strict") {
      opts.strict = true;
    } else if (arg === "--list-compiler-rejected") {
      opts.listCompilerRejected = true;
    } else if (arg === "--std-dir") {
      i += 1;
      if (i >= argv.length) throw new Error("Missing value for --std-dir");
      opts.stdDir = argv[i];
    } else if (arg === "--c3c") {
      i += 1;
      if (i >= argv.length) throw new Error("Missing value for --c3c");
      opts.c3cPath = argv[i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function collectC3Files(rootDir, out = []) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectC3Files(abs, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".c3")) {
      out.push(abs);
    }
  }
  return out;
}

function parseWithC3c(c3cPath, filePath) {
  const result = spawnSync(c3cPath, ["-P", "compile-only", filePath], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function resolveC3cPath(explicitPath) {
  const candidate = explicitPath || process.env.C3C || DEFAULT_C3C;
  const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    return null;
  }
  return candidate;
}

function parseWithTreeSitter(files) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const listPath = path.join(
    os.tmpdir(),
    `tree-sitter-c3-stdlib-${process.pid}.txt`,
  );
  fs.writeFileSync(listPath, `${files.join("\n")}\n`, "utf8");

  try {
    const result = spawnSync(
      "npx",
      [
        "tree-sitter-cli",
        "parse",
        "-p",
        ".",
        "--json-summary",
        "--paths",
        listPath,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    const jsonStart = result.stdout.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(
        result.stderr.trim() || "tree-sitter parse produced no JSON output",
      );
    }

    let payload;
    try {
      payload = JSON.parse(result.stdout.slice(jsonStart));
    } catch {
      throw new Error(result.stderr.trim() || "tree-sitter parse failed");
    }

    if (!payload.parse_summaries || !Array.isArray(payload.parse_summaries)) {
      throw new Error("tree-sitter parse returned an unexpected JSON payload");
    }

    return payload.parse_summaries
      .filter((summary) => !summary.successful)
      .map((summary) => summary.file);
  } finally {
    try {
      fs.unlinkSync(listPath);
    } catch {
      // ignored
    }
  }
}

function toRelative(filePath) {
  return path.relative(process.cwd(), filePath) || filePath;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    printUsage();
    process.exit(2);
  }

  if (opts.help) {
    printUsage();
    return;
  }

  if (!fs.existsSync(opts.stdDir) || !fs.statSync(opts.stdDir).isDirectory()) {
    console.error(`ERROR: stdlib directory not found: ${opts.stdDir}`);
    process.exit(2);
  }

  const c3cPath = opts.strict ? null : resolveC3cPath(opts.c3cPath);

  if (!opts.strict && !c3cPath) {
    const requested = opts.c3cPath || process.env.C3C || DEFAULT_C3C;
    console.error(`ERROR: c3c executable not found: ${requested}`);
    console.error("Hint: pass --c3c <path> or use --strict mode.");
    process.exit(2);
  }

  const files = collectC3Files(opts.stdDir).sort();
  let c3cRejects = 0;
  const compilerRejected = [];
  const mismatches = [];
  let parseFailures;

  try {
    parseFailures = parseWithTreeSitter(files);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }

  for (const filePath of parseFailures) {
    if (opts.strict) {
      continue;
    }
    if (parseWithC3c(c3cPath, filePath)) {
      mismatches.push(filePath);
      continue;
    }
    c3cRejects += 1;
    compilerRejected.push(filePath);
  }

  const mode = opts.strict ? "strict" : "parity";
  console.log(`Mode: ${mode}`);
  console.log(`Scanned directory: ${opts.stdDir}`);
  console.log(`Total .c3 files: ${files.length}`);
  console.log(`Tree-sitter parse errors: ${parseFailures.length}`);

  if (opts.strict) {
    if (parseFailures.length) {
      console.log(`\nStrict failures (${parseFailures.length}):`);
      for (const filePath of parseFailures) {
        console.log(`  - ${toRelative(filePath)}`);
      }
      process.exit(1);
    }

    console.log("\nOK: no tree-sitter parse errors.");
    process.exit(0);
  }

  console.log(`Compiler rejected among parse errors: ${c3cRejects}`);
  console.log(`Compiler accepted mismatches: ${mismatches.length}`);

  if (opts.listCompilerRejected && compilerRejected.length) {
    console.log(`\nCompiler rejected files (${compilerRejected.length}):`);
    for (const filePath of compilerRejected) {
      console.log(`  - ${toRelative(filePath)}`);
    }
  }

  if (mismatches.length) {
    console.log(`\nMismatches (${mismatches.length}):`);
    for (const filePath of mismatches) {
      console.log(`  - ${toRelative(filePath)}`);
    }
    process.exit(1);
  }

  console.log("\nOK: no tree-sitter/c3c parser mismatches.");
}

main();
