# Data foundations for future availability prediction

Chalo Yaar does **not** predict whether a business will be able to help. It shows facts (who confirmed, when, until when) and explains uncertainty. This document describes what is collected so that a model *could* be built later, and the bar it must clear before anything is shown to drivers.

## What is collected, and when

`public.visit_feature_snapshots` gets one row when a driver records a stop outcome, **only if** they ticked the data-sharing box on *Plan errands* (`user_preferences.data_sharing_consent`). Rows contain no user id, no coordinates and no free text:

| Column | Meaning |
|---|---|
| `category` | Business category (mechanic, pharmacy, …) |
| `weekday`, `hour_bucket` | Local day of week and hour of the planned arrival |
| `availability_state_at_departure` | State shown when the trip started |
| `confirmation_age_minutes` | Minutes between the last confirmation and departure |
| `confirmation_response_minutes` | How long the business took to answer the request |
| `service_ready` | Last reported part/service readiness |
| `prior_confirmed_visits`, `prior_successful_visits` | Earlier recorded outcomes for the business |
| `outcome`, `failure_cause` | The label: success / failed (with cause) / skipped / avoided |

Export with `node scripts/export-visit-features.mjs > features.csv` (service key required).

## Interface

`apps/web/src/lib/predictor.ts` defines `AvailabilityPredictor`. The only implementation, `rulesPredictor`, returns `{ kind: "no_model", facts, explanation }`. A model implementation must return `{ kind: "model", probability, modelVersion, baselineComparison }`.

## Before a model may be shown

1. Train with scikit-learn on real labelled outcomes only (no demo rows), split **by time** (train on earlier months, test on later ones).
2. Compare against the baseline “last known state”: predict success when the state at departure was CONFIRMED.
3. Report log-loss and calibration (reliability curve) on the held-out period; ship only if it beats the baseline and is calibrated.
4. Record `modelVersion` and the comparison in `baselineComparison`; show the probability next to the facts, never instead of them.
5. Re-evaluate monthly; fall back to `rulesPredictor` if quality drops.
