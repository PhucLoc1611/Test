# Take-home reflection

## What was the hardest decision, and why did you choose that way?

The hardest decision was deciding when not to extract a number. A parser that always returns something can look successful while quietly producing a wrong quote. I chose an evidence-first design: deterministic parsing is used when the text layer is clear, scanned or hybrid documents can use Gemini, and every emitted quantity must have a page and exact source text. If there are multiple plausible numbers, an unclear unit, missing description, low AI confidence, or unverifiable evidence, the value becomes a refusal instead of a guess.

## Where am I not confident?

The deterministic parser currently works from flattened PDF text lines. PDF.js does not preserve the meaning of visual columns, so a row contains several numbers even though a person can identify `48 sheet` from the table layout. The parser refuses some of these rows because it cannot prove which number is the quantity from the flattened line alone.
I am also not claiming that AI can never choose the wrong number. The backend validates AI output, requires the quantity to occur in the quoted evidence, and marks every AI result for human review, but an AI model could still select the wrong number when several real numbers are visible on the same page.

## What would I do with three more days?

1. Build a geometry-aware table parser using PDF.js coordinates. It would identify the quantity and unit columns by position, preserve the original evidence line, and add regression fixtures for every supplied PDF.
2. Add rendered page previews and evidence bounding boxes so a reviewer can jump directly from a line item or refusal to the source region.
3. Create an evaluation set with expected items/refusals, measure precision and refusal rate, and compare deterministic parsing with Gemini on the same files.
