# Intake accuracy scorecard

Generated 2026-10-04 against the deployed API. A case passes when every expected procedure's top code (and tooth, when the text names one) matches, in order.

- **Bedrock translator + tested parser (live): 30/30 (100%)**
- Local parser alone: see `src/intake/accuracy.test.ts` (`npx vitest run src/intake/accuracy.test.ts --reporter=verbose`).
- Engine: the hand-calculated plan cases in `src/engine/engine.test.ts`.
- Caveat: the translator prompt was adjusted once after a first live run on this same set (93% → 100%), so treat this as a development score; a held-out set would be the fair test.

| Description | Expected | Got | |
| --- | --- | --- | --- |
| Root canal on #19 | D3330#19 | D3330#19 | pass |
| root canal and a crown on #19 | D3330#19 D2740#19 | D3330#19 D2740#19 | pass |
| Crown on a lower back molar, replacing the old one | D2740 | D2740#19 | pass |
| two wisdom teeth out | D7240 D7240 | D7240#17 D7240#17 | pass |
| cleaning and x-rays | D1110 D0274 | D1110 D0274 | pass |
| deep cleaning on the upper right | D4341 | D4341 | pass |
| gold crown on tooth 3 | D2790#3 | D2790#3 | pass |
| porcelain fused to metal crown #30 | D2750#30 | D2750#30 | pass |
| filling on #14, two surfaces, tooth colored | D2392#14 | D2392#14 | pass |
| silver filling one surface on 30 | D2140#30 | D2140#30 | pass |
| night guard for grinding | D9944 | D9944 | pass |
| sealants for my kid | D1351 | D1351 | pass |
| fluoride treatment | D1206 | D1206 | pass |
| panoramic x-ray | D0330 | D0330 | pass |
| full mouth x-rays and a new patient exam | D0210 D0150 | D0210 D0150 | pass |
| emergency exam for a toothache | D0140 | D0140 | pass |
| implant on #19 | D6010#19 | D6010#19 | pass |
| implant crown on #30 | D6065#30 | D6065#30 | pass |
| bridge on the upper left | D6750 | D6750 | pass |
| partial denture | D5213 | D5213 | pass |
| pull tooth #2, it's broken | D7210#2 | D7210#2 | pass |
| core buildup on #19 then a crown | D2950#19 D2740#19 | D2950#19 D2740#19 | pass |
| scaling and root planing | D4341 | D4341 | pass |
| checkup | D0120 | D0120 | pass |
| my dentist says I need a cap on my bottom left molar | D2740 | D2740#19 | pass |
| RCT on 30 plus a post | D3330#30 D2954#30 | D3330#30 D2954#30 | pass |
| necesito una corona de porcelana en la muela de abajo a la izquierda | D2740 | D2740#19 | pass |
| endodoncia en el diente 19 | D3330#19 | D3330#19 | pass |
| limpieza y radiografías | D1110 D0274 | D1110 D0274 | pass |
| they want to do a nerve treatment on my back tooth and then cap it | D3330 D2740 | D3330#19 D2740#19 | pass |
