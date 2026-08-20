---
description: GDPR-oriented privacy review of a site or app with concrete articles, the surfaces to open, a data flow table and article-referenced findings. Use when reviewing forms, analytics, tracking, cookies or data storage.
origin: original
license: MIT
---

# Privacy Review

Produce a data flow table plus findings referenced to GDPR articles. This
is an engineering review of data practices, not a legal opinion.

## Surfaces to open, in order

1. **The cookie banner**: does it actually block scripts before consent?
   Load the page, reject all, watch the network tab: no `gtag`, pixel or
   tracker may fire pre-consent. A banner that only decorates is a finding.
2. **Forms**: every field is data; ask why each is collected, where it is
   stored and who can read it.
3. **Logs and analytics**: server logs, error trackers and analytics often
   hold IPs, user ids and URLs with query strings; check retention and
   access.
4. **Third parties**: name every external receiver (analytics, fonts, CDNs,
   chat widgets, payment iframes) and what leaves the EU/EEA for each
   (Chapter V transfers).
5. **Auth and account data**: what the account stores, and the export and
   delete paths.

## Review steps with their articles

1. **Data inventory** - what personal data (emails, IPs, ids, anything
   linkable to a person), where stored, who can access. This is the seed of
   the Art. 30 record of processing.
2. **Lawful basis and consent** - every flow has a basis (Art. 6);
   non-essential cookies and tracking need prior, informed opt-in (Art. 7
   plus ePrivacy): unbundled, as easy to withdraw as to give, and logged.
3. **Notices** - the privacy policy exists, is reachable and matches the
   actual flows (Art. 12-14).
4. **Data subject rights** - access/export feasible with current schemas
   (Art. 15); deletion cascades to backups and third parties acknowledged
   (Art. 17).
5. **Retention and minimization** - defined per data class (Art. 5(1)(c)
   and 5(1)(e)); logs do not keep PII forever.
6. **Risk gate** - profiling, children's data, health data or large-scale
   tracking means a DPIA conversation (Art. 35): stop and escalate.

## Output format

Data flow table first:

| data | source | destination | basis (Art. 6) | retention |
|---|---|---|---|---|
| email | signup form | postgres + email vendor | contract | until account deletion |

Then findings, one per line:
`[regression | gap | risk] GDPR Art. N - location - concrete fix`

Close with the consent and sharing issues that must be fixed first.

## What not to do

- Do not trust the banner's label; verify what fires before consent.
- Do not accept "anonymized" when ids remain linkable: that is
  pseudonymized and still personal data.
- Do not accept consent buried in terms of service; bundled consent is not
  valid.
- Do not invent article numbers; if you are unsure of the reference, say so
  and mark the finding as needing review.

## Limits

- Not a law firm and this is not a legal opinion: high-risk processing,
  DPIAs, transfers without safeguards and any dispute go to a DPO or
  counsel.
- Other regimes (CCPA/CPRA, ePrivacy detail, sector rules) share the
  mechanics but carry their own references; name the regime you are
  reviewing against.
