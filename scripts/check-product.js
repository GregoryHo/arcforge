#!/usr/bin/env node

/**
 * check-product.js — runner for the product linter.
 *
 * Reads the hand-maintained product state under `product/` — the roadmap table
 * and Decision Log in `ROADMAP.md`, plus every living spec in `specs/` — and
 * validates it with scripts/lib/product-lint.js, which owns the C1–C7 rules
 * (reading the roadmap table through scripts/lib/product-roadmap.js)
 * (the `← we are here` marker, the log's numbering and supersession
 * invariants, spec headers against their governing roadmap row, spec citations,
 * the sanity floor, and the `Tag` cell). Fits the scripts/check-*.js family.
 *
 * CLI tier: prints a report and exits 0 (valid) / 1 (invalid).
 */

const fs = require('node:fs');
const path = require('node:path');

const { validateProduct, parseDecisions } = require('./lib/product-lint');
const { parseRoadmapRows } = require('./lib/product-roadmap');

const PRODUCT_DIR = path.resolve(__dirname, '..', 'product');
const ROADMAP_MD = path.join(PRODUCT_DIR, 'ROADMAP.md');
const SPECS_DIR = path.join(PRODUCT_DIR, 'specs');

function readProduct() {
  const roadmap = fs.readFileSync(ROADMAP_MD, 'utf8');
  const specs = fs.existsSync(SPECS_DIR)
    ? fs
        .readdirSync(SPECS_DIR)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => ({
          name: f.slice(0, -3),
          content: fs.readFileSync(path.join(SPECS_DIR, f), 'utf8'),
        }))
    : [];
  return { roadmap, specs };
}

function main() {
  let product;
  try {
    product = readProduct();
  } catch (err) {
    console.error(`product linter — cannot read product/: ${err.message}`);
    process.exit(1);
  }

  const errors = validateProduct(product);
  const rows = parseRoadmapRows(product.roadmap, []).length;
  const decisions = parseDecisions(product.roadmap, []).length;

  console.log(
    `product linter — ${rows} roadmap row(s) / ${decisions} decision(s) / ${product.specs.length} spec(s)\n`,
  );

  if (errors.length === 0) {
    console.log('product state is consistent.');
    process.exit(0);
  }

  console.error(`product/ has ${errors.length} consistency violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (require.main === module) {
  main();
}
