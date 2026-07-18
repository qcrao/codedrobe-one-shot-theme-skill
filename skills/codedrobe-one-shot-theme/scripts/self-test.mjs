import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, "../assets/one-shot-starter/codex.css");
const css = fs.readFileSync(cssPath, "utf8");

function requireMatch(pattern, message) {
  if (!pattern.test(css)) throw new Error(message);
}

function requireAbsent(pattern, message) {
  if (pattern.test(css)) throw new Error(message);
}

requireMatch(
  /#codedrobe-codex-skin-chrome\s*\{[^}]*pointer-events:\s*none\s*!important;/s,
  "decorative chrome must remain noninteractive",
);
requireMatch(
  /main\.main-surface::before\s*\{[^}]*pointer-events:\s*none;/s,
  "conversation artwork must remain noninteractive",
);
requireAbsent(
  /--thread-content-max-width\s*:/,
  "the theme must not resize shared project dock and composer geometry",
);
requireMatch(
  /\.group\\\/project-selector\s*\{[^}]*opacity:\s*1\s*!important;/s,
  "the selected project container must remain readable",
);
requireAbsent(
  /\.group\\\/project-selector[^{}]*\*[^{}]*\{[^}]*(?:opacity|stroke|fill)\s*:/s,
  "project descendants must keep native opacity and SVG paint states",
);
requireMatch(
  /\.sticky\.bottom-0\s*>\s*\.pointer-events-none\.absolute\s*>\s*\.bg-gradient-to-t\.from-token-main-surface-primary\s*\{[^}]*background-image:\s*none\s*!important;/s,
  "only the direct conversation footer scrim should be removed",
);
requireMatch(
  /\.composer-surface-chrome:focus-within\s*\{[^}]*0\s+0\s+0\s+3px/s,
  "the native-readable composer focus halo must remain",
);

console.log("codedrobe-one-shot-theme visual invariants passed");
