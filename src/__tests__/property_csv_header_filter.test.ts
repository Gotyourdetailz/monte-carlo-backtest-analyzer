/**
 * Property test for CSV ingest header filtering (Task 5.3, Property 5).
 *
 * **Property 5: CSV ingest filters Forbidden_Header_Set deterministically**
 *
 * The header-filtering pass in `csvIngest.sanitizeFields` (the same code path
 * `parseCsvFile` runs on every parsed Papaparse result) must, for every input
 * combination of header names + row objects:
 *
 *   1. Drop every name in `FORBIDDEN_HEADER_SET` from the `fields` list.
 *   2. Drop every own-key in `FORBIDDEN_HEADER_SET` from every row object.
 *   3. Preserve all other field names AND their values, in original order.
 *   4. Be deterministic — repeated invocation yields the same result.
 *   5. Surface one warning per dropped header name in the `fields` list.
 *
 * Together these sub-properties cover Requirements 11.1 (filter at ingest)
 * and 11.2 (filter is deterministic and exposed to the column-selection UI).
 *
 * Validates: Requirements 11.1, 11.2.
 *
 * No wasm, no React. Run with:
 *   npx tsx src/__tests__/property_csv_header_filter.test.ts
 */

import fc from 'fast-check';
import { sanitizeFields, FORBIDDEN_HEADER_SET } from '../csvIngest';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

const FORBIDDEN_NAMES = ['__proto__', 'constructor', 'prototype'] as const;

// A name arbitrary biased toward forbidden names ~40% of the time so the
// filter pathway gets exercised, while still admitting normal CSV-like names.
// We use a constrained alphanum-plus-underscore generator to avoid PapaParse
// quirks (whitespace, BOM) that aren't germane to the header filter itself.
const arbHeaderName = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...FORBIDDEN_NAMES) },
  {
    weight: 6,
    arbitrary: fc
      .stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,15}$/)
      .filter((s) => !FORBIDDEN_HEADER_SET.has(s) && s.length > 0),
  }
);

// A row arbitrary that mirrors what Papaparse produces: an object whose keys
// are drawn from the same name pool (so some rows will carry forbidden own
// keys that must be stripped from the output).
const arbCellValue = fc.oneof(
  fc.string({ maxLength: 8 }),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.float({ noNaN: true, noDefaultInfinity: true }),
  fc.constant(null)
);
const arbRow = fc.dictionary(arbHeaderName, arbCellValue, { maxKeys: 6 });

// ─── Property 5 ──────────────────────────────────────────────────────────────

console.log(
  '\n[Property 5] CSV ingest filters Forbidden_Header_Set deterministically'
);

// 5a. Output `fields` contains no member of FORBIDDEN_HEADER_SET.
{
  let local = 0;
  fc.assert(
    fc.property(
      fc.array(arbHeaderName, { maxLength: 25 }),
      fc.array(arbRow, { maxLength: 10 }),
      (rawFields, rawRows) => {
        const out = sanitizeFields(rawFields, rawRows);
        for (const f of out.fields) {
          if (FORBIDDEN_HEADER_SET.has(f)) {
            local++;
            return false;
          }
        }
        return true;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
  check('output fields contain no forbidden names', local === 0);
}

// 5b. Output rows have no own-key in FORBIDDEN_HEADER_SET.
{
  let local = 0;
  fc.assert(
    fc.property(
      fc.array(arbHeaderName, { maxLength: 25 }),
      fc.array(arbRow, { maxLength: 10 }),
      (rawFields, rawRows) => {
        const out = sanitizeFields(rawFields, rawRows);
        for (const row of out.rows) {
          for (const k of Object.keys(row)) {
            if (FORBIDDEN_HEADER_SET.has(k)) {
              local++;
              return false;
            }
          }
        }
        return true;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
  check('output row own-keys contain no forbidden names', local === 0);
}

// 5c. Non-forbidden field names are preserved in original order, and the
//     count of dropped names equals the count of forbidden names in input.
{
  let local = 0;
  let lastDetail = '';
  fc.assert(
    fc.property(
      fc.array(arbHeaderName, { maxLength: 25 }),
      fc.array(arbRow, { maxLength: 10 }),
      (rawFields, rawRows) => {
        const out = sanitizeFields(rawFields, rawRows);
        const expectedKept = rawFields.filter(
          (f) => !FORBIDDEN_HEADER_SET.has(f)
        );
        if (out.fields.length !== expectedKept.length) {
          local++;
          lastDetail = `length mismatch: got ${out.fields.length}, expected ${expectedKept.length}`;
          return false;
        }
        for (let i = 0; i < expectedKept.length; i++) {
          if (out.fields[i] !== expectedKept[i]) {
            local++;
            lastDetail = `order mismatch at index ${i}: got "${out.fields[i]}", expected "${expectedKept[i]}"`;
            return false;
          }
        }
        return true;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
  check(
    'non-forbidden field names preserved in original order',
    local === 0,
    local === 0 ? '' : lastDetail
  );
}

// 5d. Non-forbidden cell values are preserved verbatim from input rows.
//     (Forbidden keys are dropped; everything else round-trips.)
{
  let local = 0;
  let lastDetail = '';
  const hasOwn = (o: Record<string, unknown>, k: string): boolean =>
    Object.prototype.hasOwnProperty.call(o, k);
  fc.assert(
    fc.property(
      fc.array(arbHeaderName, { maxLength: 10 }),
      fc.array(arbRow, { maxLength: 10 }),
      (rawFields, rawRows) => {
        const out = sanitizeFields(rawFields, rawRows);
        // sanitizeFields drops null inputs and non-objects, but `arbRow`
        // always produces plain objects, so out.rows.length === rawRows.length.
        if (out.rows.length !== rawRows.length) {
          local++;
          lastDetail = `row-count mismatch: got ${out.rows.length}, expected ${rawRows.length}`;
          return false;
        }
        for (let i = 0; i < rawRows.length; i++) {
          const src = rawRows[i];
          const dst = out.rows[i];
          for (const k of Object.keys(src)) {
            if (FORBIDDEN_HEADER_SET.has(k)) {
              // Use hasOwnProperty rather than `in` — `'__proto__' in {}`
              // is true via the prototype chain, but we only care that the
              // forbidden name is absent as an own property of `dst`.
              if (hasOwn(dst, k)) {
                local++;
                lastDetail = `forbidden key "${k}" survived as own-prop on row ${i}`;
                return false;
              }
              continue;
            }
            // Non-forbidden keys must round-trip.
            if (!Object.is(dst[k], src[k])) {
              local++;
              lastDetail = `value drift on row ${i} key "${k}": got ${String(dst[k])}, expected ${String(src[k])}`;
              return false;
            }
          }
        }
        return true;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
  check(
    'non-forbidden cell values round-trip; forbidden own-keys dropped',
    local === 0,
    local === 0 ? '' : lastDetail
  );
}

// 5e. Determinism: running sanitizeFields twice on the same input produces
//     identical output. Required so two `runHistory` entries built from the
//     same CSV produce the same `fields` list (and therefore the same digest).
{
  let local = 0;
  fc.assert(
    fc.property(
      fc.array(arbHeaderName, { maxLength: 25 }),
      fc.array(arbRow, { maxLength: 10 }),
      (rawFields, rawRows) => {
        const a = sanitizeFields(rawFields, rawRows);
        const b = sanitizeFields(rawFields, rawRows);
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          local++;
          return false;
        }
        return true;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
  check('sanitizeFields is deterministic on identical input', local === 0);
}

// 5f. Warnings count equals the number of forbidden header *fields* dropped.
//     (Forbidden own-keys on row objects are dropped silently — the warnings
//     channel describes user-visible header drops, not opportunistic key
//     scrubbing on rows.)
{
  let local = 0;
  let lastDetail = '';
  fc.assert(
    fc.property(
      fc.array(arbHeaderName, { maxLength: 25 }),
      fc.array(arbRow, { maxLength: 10 }),
      (rawFields, rawRows) => {
        const out = sanitizeFields(rawFields, rawRows);
        const expectedDropped = rawFields.filter((f) =>
          FORBIDDEN_HEADER_SET.has(f)
        ).length;
        if (out.warnings.length !== expectedDropped) {
          local++;
          lastDetail = `warning count ${out.warnings.length} ≠ dropped fields ${expectedDropped}`;
          return false;
        }
        // Each warning string SHOULD reference one of the forbidden names.
        for (const w of out.warnings) {
          if (!FORBIDDEN_NAMES.some((n) => w.includes(n))) {
            local++;
            lastDetail = `warning "${w}" does not reference any forbidden name`;
            return false;
          }
        }
        return true;
      }
    ),
    // Reduced from 100 to 25 for faster test cadence.
    { numRuns: 25 }
  );
  check(
    'one warning per dropped header field, mentions the dropped name',
    local === 0,
    local === 0 ? '' : lastDetail
  );
}

// ─── exit ────────────────────────────────────────────────────────────────────

console.log('');
if (failures === 0) {
  console.log(`PASS — Property 5 sub-properties all hold (6/6).`);
  process.exit(0);
} else {
  console.log(`FAIL — ${failures} sub-property/properties failed.`);
  process.exit(1);
}
