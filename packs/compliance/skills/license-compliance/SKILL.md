---
description: Dependency license compliance with an extractor per ecosystem, the JS bundling case, an SPDX table and blocking issues. Use when checking whether dependencies are safe to ship.
origin: original
license: MIT
---

# License Compliance

Produce the SPDX table of what actually ships, the blocking issues and the
notice tasks needed to ship. Engineering review of obligations, not legal
advice.

## Procedure

1. **Extract the real tree, transitive deps included**, with the
   ecosystem's tool:
   - Node: `npx license-checker --json` (or `npm ls --all` for the tree).
   - Python: `pip-licenses --format=json`.
   - Rust: `cargo license`.
   - Go: `go-licenses report ./...`.
   No tool for the ecosystem: read the lockfile and each package's declared
   license field.
2. **Verify declarations**: spot-check the highest-obligation entries
   (copyleft and unknowns) against the package's LICENSE/COPYING file;
   declared metadata lies often enough to matter.
3. **Group by obligation**: permissive (MIT, Apache-2.0, BSD, ISC), weak
   copyleft (LGPL, MPL-2.0), strong copyleft (GPL-2.0, GPL-3.0), network
   copyleft (AGPL-3.0), proprietary or unknown.
4. **Apply the JS bundling rule**: if the repo bundles dependencies into a
   shipped artifact (webpack/rollup/vite dist, single-binary builds), every
   bundled package's license text must ship with the artifact. A browser
   bundle is distribution, not internal use.
5. **Flag compatibility**: GPL/AGPL inside a permissive product;
   Apache-2.0 combined with GPL-2.0-only (the classic incompatible pair);
   code copy-pasted between license domains.

## Obligations by group

- Permissive: keep copyright and license notice; Apache-2.0 also needs
  NOTICE file handling when present.
- LGPL/MPL: keep modifications to that component available; static linking
  of LGPL inside a bundle needs care.
- GPL: the combined work triggers source obligations; flag prominently.
- AGPL: same obligations over a network; critical for SaaS.
- Unknown or none: treat as all-rights-reserved until clarified; propose
  asking the author or replacing.

## Output format

| package | version | license (SPDX) | obligation |
|---|---|---|---|
| left-pad | 1.3.0 | MIT | keep notice in THIRD-PARTY-NOTICES |

Then: blocking issues (copyleft in the shipped artifact, unknowns), and the
attribution tasks to ship (THIRD-PARTY-NOTICES exists and covers bundled
deps, license texts preserved in distributions).

## What not to do

- Do not report only direct dependencies; obligations ride the transitive
  tree.
- Do not trust the declared license without spot-checking copyleft and
  unknowns against the shipped files.
- Do not jump to "replace the package" before stating the obligation;
  replacement is the fix of last resort.
- Do not ship a bundle without the notice file its licenses require.

## Limits

- Not legal advice: GPL/AGPL in a commercial product, dual-licensing
  questions and license disputes go to counsel.
- This covers dependencies; trademarks, patents and contributor agreements
  are out of scope.
