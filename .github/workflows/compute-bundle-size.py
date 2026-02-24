#!/usr/bin/env python3

import argparse
import json
import os
import gzip

BOLD_THRESHOLD = 102

def get_file_size(path):
  """Returns raw size and gzipped size in bytes."""
  if not os.path.exists(path):
    return 0, 0
  
  size = os.path.getsize(path)
  with open(path, "rb") as f:
    buffer = f.read()
    compress = gzip.compress(buffer)
  
  return size, len(compress)

def fmt_kb(size):
  return f"{size / 1024:.1f} KiB"

def fmt_diff(head, base):
  diff = head - base
  sign = "+" if diff > 0 else ""
  if abs(diff) > BOLD_THRESHOLD:
    return f"**{sign}{fmt_kb(diff)}**"
  else:
    return f"{sign}{fmt_kb(diff)}"

def measure(args):
  """Scans a directory and saves size data to JSON file."""
  results = {}
  excluded_suffixes = (".map", ".d.ts", ".externs.js", "wrapper.js", "deps.js", "cast-boot.js", ".json")

  if os.path.exists(args.dir):
    for filename in os.listdir(args.dir):
      filepath = os.path.join(args.dir, filename)
      # Ignore directories, hidden files and excluded extensions
      if (
        os.path.isfile(filepath)
        and not filename.startswith(".")
        and not filename.endswith(excluded_suffixes)
      ):
        raw, gzip = get_file_size(filepath)
        results[filename] = {"raw": raw, "gzip": gzip}
  else:
    print(f"Warning: Directory {args.dir} does not exist.")
  
  with open(args.out, "w") as f:
    json.dump(results, f)

def compare(args):
  """Compares two JSON files and prints a Markdown table"""
  base_json = {}
  head_json = {}
  try:
    with open(args.base, "r") as f:
      base_json = json.load(f)
  except (FileNotFoundError, json.JSONDecodeError):
    base_json = {}

  try:
    with open(args.head, "r") as f:
      head_json = json.load(f)
  except (FileNotFoundError, json.JSONDecodeError):
    head_json = {}

  all_files = sorted(list(set(base_json.keys()) | set(head_json.keys())))

  # Markdown header
  lines = [
    "Bundle Size Report",
    "",
    "| File | HEAD | Base | Diff |",
    "|---|---|---|---|"
  ]

  if args.pr_number:
    lines[0] += " for PR #%s" % args.pr_number

  for f in all_files:
    b = base_json.get(f, {"raw": 0, "gzip": 0})
    h = head_json.get(f, {"raw": 0, "gzip": 0})

    if f not in head_json:
      lines.append(f"| -{f}- | Deleted | Deleted | Deleted |")
      continue

    if f not in base_json:
      lines.append(f"| {f} | {fmt_kb(h["raw"])} ({fmt_kb(h["gzip"])}) | (New) | (New) |")
    else:
      lines.append(f"| {f} | {fmt_kb(h["raw"])} ({fmt_kb(h["gzip"])}) | {fmt_kb(b["raw"])} ({fmt_kb(b["gzip"])}) | {fmt_diff(h["raw"], b["raw"])} |")
  
  print("\n".join(lines))

def main():
  parser = argparse.ArgumentParser(description="Measure and compare build sizes")
  subparsers = parser.add_subparsers(dest="command", required=True)

  parser_measure = subparsers.add_parser(name="measure", help="Measure build sizes in a directory")
  parser_measure.add_argument("--dir", required=True, help="Directory to scan")
  parser_measure.add_argument("--out", required=True, help="Output JSON file path")
  parser_measure.set_defaults(func=measure)

  parser_compare = subparsers.add_parser(name="compare", help="Generate Markdown report from two JSON files")
  parser_compare.add_argument("--pr-number", required=False, help="Pull request number")
  parser_compare.add_argument("--base", required=True, help="Base branch JSON file")
  parser_compare.add_argument("--head", required=True, help="Head branch JSON file")
  parser_compare.set_defaults(func=compare)

  args = parser.parse_args()
  args.func(args)

if __name__ == "__main__":
  main()
