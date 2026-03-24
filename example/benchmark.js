import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parse,
  resolveType,
  typecheck,
  completionsAtPosition,
  typeAtPosition,
  findDeclaration,
} from "../packages/core/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Configuration ---
const TEMPLATE_PATH = path.join(__dirname, "src/templates/benchmark.html.tc");
const TYPES_PATH = path.resolve(
  __dirname,
  "src/models/benchmark-types.ts"
);
const TYPE_NAME = "BenchmarkPage";
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 10;

// --- Helpers ---

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function bench(label, fn, runs = MEASURED_RUNS, warmup = WARMUP_RUNS) {
  // Warmup
  for (let i = 0; i < warmup; i++) fn();

  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const med = median(times);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  return { label, med, min, max, avg, runs };
}

function printTable(results) {
  const labelWidth = Math.max(50, ...results.map((r) => r.label.length)) + 2;

  const header = [
    "Benchmark".padEnd(labelWidth),
    "Median".padStart(12),
    "Min".padStart(12),
    "Max".padStart(12),
    "Avg".padStart(12),
    "Runs".padStart(6),
  ].join(" | ");

  const separator = "-".repeat(header.length);

  console.log();
  console.log(separator);
  console.log(header);
  console.log(separator);

  for (const r of results) {
    console.log(
      [
        r.label.padEnd(labelWidth),
        `${r.med.toFixed(2)}ms`.padStart(12),
        `${r.min.toFixed(2)}ms`.padStart(12),
        `${r.max.toFixed(2)}ms`.padStart(12),
        `${r.avg.toFixed(2)}ms`.padStart(12),
        String(r.runs).padStart(6),
      ].join(" | ")
    );
  }

  console.log(separator);
  console.log();
}

// --- Main ---

console.log("Typecek Performance Benchmark");
console.log("=============================");
console.log();

const templateSource = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const lineCount = templateSource.split("\n").length;
console.log(`Template: ${TEMPLATE_PATH}`);
console.log(`Lines: ${lineCount}`);
console.log(`Size: ${(Buffer.byteLength(templateSource) / 1024).toFixed(1)} KB`);
console.log(`Types: ${TYPES_PATH}`);
console.log(`Warmup: ${WARMUP_RUNS} | Measured runs: ${MEASURED_RUNS}`);
console.log();

const results = [];

// 1. Parse (cold)
console.log("Benchmarking parse()...");
results.push(
  bench("parse() - cold (no cache)", () => {
    parse(templateSource, TEMPLATE_PATH);
  })
);

// Parse once for reuse
const ast = parse(templateSource, TEMPLATE_PATH);

// 2. resolveType() cold
console.log("Benchmarking resolveType() cold...");
results.push(
  bench(
    "resolveType() - cold",
    () => {
      resolveType(TYPES_PATH, TYPE_NAME);
    },
    5,
    1
  )
);

// 3. resolveType() cached (second call with same file)
console.log("Benchmarking resolveType() cached...");
const dataType = resolveType(TYPES_PATH, TYPE_NAME); // warm the cache
results.push(
  bench("resolveType() - cached", () => {
    resolveType(TYPES_PATH, TYPE_NAME);
  })
);

// 4. typecheck()
console.log("Benchmarking typecheck()...");
const typecheckContext = { templateDir: path.dirname(TEMPLATE_PATH) };
results.push(
  bench("typecheck() - full template", () => {
    typecheck(ast, dataType, typecheckContext);
  })
);

// 5. completionsAtPosition() at various positions
console.log("Benchmarking completionsAtPosition()...");

const completionPositions = [
  { line: 10, col: 0, label: "beginning of file (line 10)" },
  { line: 50, col: 0, label: "inside layout block (line 50)" },
  { line: Math.floor(lineCount * 0.25), col: 0, label: `25% through file (line ${Math.floor(lineCount * 0.25)})` },
  { line: Math.floor(lineCount * 0.5), col: 0, label: `50% through file (line ${Math.floor(lineCount * 0.5)})` },
  { line: Math.floor(lineCount * 0.75), col: 0, label: `75% through file (line ${Math.floor(lineCount * 0.75)})` },
  { line: lineCount - 10, col: 0, label: `end of file (line ${lineCount - 10})` },
];

for (const pos of completionPositions) {
  results.push(
    bench(`completionsAtPosition() - ${pos.label}`, () => {
      completionsAtPosition(ast, dataType, pos.line, pos.col);
    })
  );
}

// 6. typeAtPosition() at various expression positions
console.log("Benchmarking typeAtPosition()...");

// Find some actual expression positions by scanning the template
const expressionPositions = [];
const lines = templateSource.split("\n");

// Find lines with expressions to hover over
const targetPatterns = [
  { pattern: /\{\{currentUser\.username\}\}/, label: "currentUser.username" },
  { pattern: /\{\{currency\}\}/, label: "currency" },
  { pattern: /\{\{analytics\.revenue\.value\}\}/, label: "analytics.revenue.value" },
  { pattern: /\{\{product\.name\}\}/, label: "product.name (in for loop)" },
  { pattern: /\{\{order\.customer\.username\}\}/, label: "order.customer.username (nested)" },
  { pattern: /\{\{currentUser\.address\?\.city\.name\}\}/, label: "currentUser.address?.city.name (optional)" },
  { pattern: /\{\{order\.shipping\.address\.city\.region\.name\}\}/, label: "order.shipping...region.name (deep chain)" },
  { pattern: /\{\{settings\.general\.siteName\}\}/, label: "settings.general.siteName" },
  { pattern: /\{\{notif\.timestamp\}\}/, label: "notif.timestamp (in notification loop)" },
];

for (const tp of targetPatterns) {
  for (let i = 0; i < lines.length; i++) {
    const match = tp.pattern.exec(lines[i]);
    if (match) {
      // Position the cursor at the start of the expression content (after {{)
      const col = match.index + 2;
      expressionPositions.push({ line: i + 1, col, label: tp.label });
      break;
    }
  }
}

for (const pos of expressionPositions) {
  results.push(
    bench(`typeAtPosition() - ${pos.label}`, () => {
      typeAtPosition(ast, dataType, pos.line, pos.col);
    })
  );
}

// 7. findDeclaration()
console.log("Benchmarking findDeclaration()...");

const declarationPaths = [
  { path: [], label: "BenchmarkPage (root type)" },
  { path: ["currentUser"], label: "currentUser" },
  { path: ["currentUser", "username"], label: "currentUser.username" },
  { path: ["currentUser", "address", "city", "name"], label: "currentUser.address.city.name" },
  { path: ["currentUser", "address", "city", "region", "timezone"], label: "...address.city.region.timezone" },
  { path: ["orders", "items", "product", "name"], label: "orders[].items[].product.name" },
  { path: ["analytics", "currentPeriod", "dailyData"], label: "analytics.currentPeriod.dailyData" },
  { path: ["settings", "payment", "taxRate"], label: "settings.payment.taxRate" },
  { path: ["notifications"], label: "notifications" },
  { path: ["products", "variants", "attributes", "name"], label: "products[].variants[].attributes[].name" },
];

for (const dp of declarationPaths) {
  results.push(
    bench(`findDeclaration() - ${dp.label}`, () => {
      findDeclaration(TYPES_PATH, TYPE_NAME, dp.path);
    })
  );
}

// --- Print Results ---
printTable(results);

// --- Summary ---
const parseTime = results.find((r) => r.label.includes("parse()"));
const typecheckTime = results.find((r) => r.label.includes("typecheck()"));
const completionTimes = results.filter((r) => r.label.includes("completionsAtPosition"));
const hoverTimes = results.filter((r) => r.label.includes("typeAtPosition"));
const declTimes = results.filter((r) => r.label.includes("findDeclaration"));

console.log("Summary");
console.log("-------");
if (parseTime) console.log(`  Parse:       ${parseTime.med.toFixed(2)}ms median`);
if (typecheckTime) console.log(`  Typecheck:   ${typecheckTime.med.toFixed(2)}ms median`);
if (completionTimes.length > 0) {
  const avgMed = completionTimes.reduce((s, r) => s + r.med, 0) / completionTimes.length;
  const maxMed = Math.max(...completionTimes.map((r) => r.med));
  console.log(`  Completions: ${avgMed.toFixed(2)}ms avg median, ${maxMed.toFixed(2)}ms worst`);
}
if (hoverTimes.length > 0) {
  const avgMed = hoverTimes.reduce((s, r) => s + r.med, 0) / hoverTimes.length;
  const maxMed = Math.max(...hoverTimes.map((r) => r.med));
  console.log(`  Hover:       ${avgMed.toFixed(2)}ms avg median, ${maxMed.toFixed(2)}ms worst`);
}
if (declTimes.length > 0) {
  const avgMed = declTimes.reduce((s, r) => s + r.med, 0) / declTimes.length;
  const maxMed = Math.max(...declTimes.map((r) => r.med));
  console.log(`  GoToDef:     ${avgMed.toFixed(2)}ms avg median, ${maxMed.toFixed(2)}ms worst`);
}
console.log();
