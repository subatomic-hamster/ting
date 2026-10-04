# Winnow calibration

67 hand-labelled dental examples (45 descriptions, 12 documents, 10 injection checks), Winnow-12B Q8 (local, Apple M5 24 GB, Metal), 88 s.

- Top-answer accuracy: **99%**
- Temperature kept at **1.0**: only 1 wrong answer(s), too few to fit one without making Winnow overconfident. Expected calibration error 0.024.

| Winnow says | Examples | Right |
| --- | --- | --- |
| 0-50% | 1 | 0% |
| 50-60% | 0 | – |
| 60-70% | 1 | 100% |
| 70-80% | 0 | – |
| 80-90% | 2 | 100% |
| 90-100% | 63 | 100% |

Chart: `/calibration` in the app.
