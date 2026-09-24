# Take-home reflection

## What was the hardest decision, and why did you choose that way?

The hardest decision was deciding when not to extract a number. A parser that always returns something can look successful while quietly producing a wrong quote. I chose an evidence-first design: deterministic parsing is used when the text layer is clear, scanned or hybrid documents can use Gemini, and every emitted quantity must have a page and exact source text. If there are multiple plausible numbers, an unclear unit, missing description, low AI confidence, or unverifiable evidence, the value becomes a refusal instead of a guess.

## Where am I not confident?

The deterministic parser now uses PDF.js text coordinates as the primary path: it groups nearby Y baselines, orders tokens by X, and identifies a quantity beside a recognised unit in a table row. It only uses flattened text when PDF.js provides no individual text items at all; coordinate-based pages no longer fall back to guessing from a flattened line. Some layouts may therefore still produce explicit refusals even when a person can infer the intended quantity visually.
I am also not claiming that AI can never choose the wrong number. The backend validates AI output, requires the quantity to occur in the quoted evidence, and marks every AI result for human review, but an AI model could still select the wrong number when several real numbers are visible on the same page.

## What would I do with three more days?

1. Expand the geometry-aware parser into reusable column detection for more table layouts, preserve evidence bounding boxes, and add regression fixtures for every supplied PDF.
2. Add rendered page previews and evidence bounding boxes so a reviewer can jump directly from a line item or refusal to the source region.
3. Create an evaluation set with expected items/refusals, measure precision and refusal rate, and compare deterministic parsing with Gemini on the same files.
