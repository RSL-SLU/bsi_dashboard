# CAFO Pond Watch

A static dashboard of manure-pond detections at cattle operations (CAFOs). It was built by the Remote Sensing Lab, Saint Louis University (SLU RSL), for Climate TRACE.

**Viewing:** not published. Clone the repo and serve it locally, e.g. `python -m http.server 8000`, then open http://localhost:8000/.

## What it shows

- **Map.** QC'd operations in 9 countries: Australia, Canada, China, France, Germany, New Zealand, Russia, Türkiye and the United States (1,399 farms; 7 US states). Each farm has a BSI-E pond history for each summer, 2017–2025.
  - Tiers: world → country → US state → farm.
  - The farm view shows yearly true-colour and BSI-E images, pond outlines, the pond area per year, and spectra.
  - For US farms and sample farms in other countries, it also shows monthly pond area.
- **Analyzer.** Three questions:
  - How accurate is BSI pond detection against the reviewer QC?
  - What are the false detections? This compares spectra inside each polygon with the surrounding 100 m ring.
  - How does pond area change over time?
- **Case studies.** 20 sites (10 China, 10 Kansas), followed every summer from 2017 to 2025.
  - Stable pond IDs and yearly images.
  - Rule-based candidate changes (new, removed, seasonal, transient) for review.

## Method in brief

- **Imagery:** Sentinel-2 surface reflectance (`COPERNICUS/S2_SR_HARMONIZED`) via Google Earth Engine, masked with Cloud Score+ (`cs_cdf ≥ 0.6`). One median composite per production window and year.
- **Index:** BSI-E = (B11 − 0.106)/(0.304 − 0.106) + (B8A − 0.112)/(0.272 − 0.112).
- **Pond rule:** BSI-E < 0.30, 8-connected, at least 5 pixels, inside the operation footprint. This is the production rule.
- **BSI-E images:** drawn inside the footprint only, because that is where ponds are searched.

## Status

Results are for review and are **not final labels**. Precision figures come from the reviewer QC sample.

## Rebuilding

This repository holds only the built site. It is generated from the `bsi-temporal` project:

```
python scripts/proto_dashboard_data.py
python scripts/analyzer_data.py
python scripts/case_data.py
python scripts/site/export_static.py <out>     # review app running on :8766
python scripts/site/make_pages_site.py <out>
```

## Credits

- **Imagery:** contains modified Copernicus Sentinel data (2017–2025).
- **Basemap:** Esri World Imagery.
- **Boundaries:** Natural Earth via world-atlas and us-atlas.
