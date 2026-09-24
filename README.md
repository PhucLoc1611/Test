# Take-home reflection

## What was the hardest decision, and why did you choose that way?

The hardest decision was deciding when not to extract a number. A parser that always returns something can look successful while quietly producing a wrong quote. I chose an evidence-first design: deterministic parsing is used when the text layer is clear, scanned or hybrid documents can use Gemini, and every emitted quantity must have a page and exact source text. If there are multiple plausible numbers, an unclear unit, missing description, low AI confidence, or unverifiable evidence, the value becomes a refusal instead of a guess.

This makes the result less complete on messy table layouts, but it keeps an incorrect quantity from looking authoritative. It also keeps the failure visible in the UI rather than converting it into a generic error.

## Where am I not confident?

The deterministic parser currently works from flattened PDF text lines. PDF.js does not preserve the meaning of visual columns, so a row such as `1 ... 2400x1200 48 sheet $24.90 $1,195.20` contains several numbers even though a person can identify `48 sheet` from the table layout. The parser refuses some of these rows because it cannot prove which number is the quantity from the flattened line alone.

I am also not claiming that AI can never choose the wrong number. The backend validates AI output, requires the quantity to occur in the quoted evidence, and marks every AI result for human review, but an AI model could still select the wrong number when several real numbers are visible on the same page. The current Gemini path is therefore a guarded assistive extractor, not an autonomous quoting authority.

The Supabase policies are intentionally demo-only. There is no tenant ownership or authenticated row-level isolation in this take-home, so it is not ready to store real customer documents without adding authentication and per-user policies.

## What would I do with three more days?

1. Build a geometry-aware table parser using PDF.js coordinates. It would identify the quantity and unit columns by position, preserve the original evidence line, and add regression fixtures for every supplied PDF.
2. Add rendered page previews and evidence bounding boxes so a reviewer can jump directly from a line item or refusal to the source region.
3. Create an evaluation set with expected items/refusals, measure precision and refusal rate, and compare deterministic parsing with Gemini on the same files.
4. Add request IDs, structured logs, Gemini latency/model tracking, rate limits, and clearer retry behavior for temporary provider failures.
5. Add authentication and tenant ownership to Supabase, then replace the demo-wide RLS policies with per-user policies.
