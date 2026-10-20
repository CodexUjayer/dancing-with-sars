#!/usr/bin/env python3
"""
Extract analysis-ready layers from a NISAR L2 GUNW (HDF5) product into the
MOTUS derived-product format.

This is a data-access tool, not scientific processing: it performs a lossless
extraction of the product's own science layers (unwrapped phase, coherence,
connected components) plus the metadata needed for interpretation. All
scientific analysis (referencing, phase->displacement, uncertainty, detection,
attribution) is performed by the TypeScript pipeline in src/lib/science/.

Usage:
    python3 tools/extract_gunw.py <product.h5> <output_dir> [--slug name]

References:
  - NISAR L2 GUNW Product Specification (JPL D-102272 RevE, Nov 2024)
  - NISAR NASA SDS L1/L2 ATBD (JPL D-95677 RevA, Nov 2023)
"""
import argparse
import json
import math
import os
import re

import h5py
import numpy as np

GUNW_BASE = "science/LSAR/GUNW"


def wkt_to_coords(wkt: str):
    m = re.search(r"\(\(([^)]+)\)", wkt)
    if not m:
        return []
    pts = []
    for tok in m.group(1).split(","):
        parts = tok.strip().split()
        if len(parts) >= 2:
            pts.append([float(parts[0]), float(parts[1])])
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("product")
    ap.add_argument("outdir")
    ap.add_argument("--slug", default="gunw")
    ap.add_argument("--title", default="")
    ap.add_argument("--blurb", default="")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    f = h5py.File(args.product, "r")

    ident = f["science/LSAR/identification"]
    grid = f[f"{GUNW_BASE}/grids/frequencyA"]
    ui = grid["unwrappedInterferogram/HH"]
    meta = f[f"{GUNW_BASE}/metadata"]

    def s(node):
        v = node[()]
        return v.decode() if isinstance(v, bytes) else v

    wavelength = 299792458.0 / float(grid["centerFrequency"][()])

    # Grid geometry (NISAR: y decreases with row index).
    x0 = float(ui["xCoordinates"][0])
    dx = float(ui["xCoordinateSpacing"][()])
    y0 = float(ui["yCoordinates"][0])
    dy = float(ui["yCoordinateSpacing"][()])
    epsg = int(ui["projection"][()])
    width = ui["xCoordinates"].shape[0]
    height = ui["yCoordinates"].shape[0]

    # Radar geometry from the product's own radarGrid metadata.
    rg = meta["radarGrid"]
    inc = float(np.nanmean(rg["incidenceAngle"][()]))
    lx = float(np.nanmean(rg["losUnitVectorX"][()]))
    ly = float(np.nanmean(rg["losUnitVectorY"][()]))

    # Heading derived from the product LOS unit vector (satellite->ground,
    # E/N components). ground->satellite azimuth = sat->ground azimuth + 180,
    # and for a right-looking radar heading = groundToSatAzimuth - 90.
    sat2g_az = math.degrees(math.atan2(lx, ly))
    g2s_az = sat2g_az + 180.0
    look = s(ident["lookDirection"]).lower()
    heading = g2s_az - 90.0 if look == "right" else g2s_az + 90.0
    pass_dir = s(ident["orbitPassDirection"]).lower()

    # Iono screen uncertainty (robust median of the absolute values over a sample).
    # NOTE interpretation: this is the uncertainty of the ALREADY-APPLIED
    # ionospheric correction — a spatially correlated systematic term, NOT
    # independent per-pixel noise. The pipeline reports it as a systematic
    # detection floor rather than folding it into per-pixel sigma.
    iono = ui["ionospherePhaseScreenUncertainty"][()]
    sample = iono[:: max(1, iono.shape[0] // 64), :: max(1, iono.shape[1] // 64)]
    finite = sample[np.isfinite(sample)]
    iono_sigma = float(np.median(np.abs(finite))) if finite.size else None

    # Science layers (lossless).
    phase = ui["unwrappedPhase"][()]
    coherence = ui["coherenceMagnitude"][()]
    components = ui["connectedComponents"][()]

    phase.astype("<f4").tofile(os.path.join(args.outdir, "phase.f32"))
    coherence.astype("<f4").tofile(os.path.join(args.outdir, "coherence.f32"))
    components.astype("<u2").tofile(os.path.join(args.outdir, "components.u16"))

    pr = meta["processingInformation"]
    looks_az = int(pr["parameters/unwrappedInterferogram/frequencyA/numberOfAzimuthLooks"][()])
    looks_rg = int(pr["parameters/unwrappedInterferogram/frequencyA/numberOfRangeLooks"][()])

    ref_start = s(ident["referenceZeroDopplerStartTime"])
    ref_end = s(ident["referenceZeroDopplerEndTime"])
    sec_start = s(ident["secondaryZeroDopplerStartTime"])
    sec_end = s(ident["secondaryZeroDopplerEndTime"])

    meta_out = {
        "slug": args.slug,
        "title": args.title or s(ident["granuleId"]),
        "blurb": args.blurb,
        "grid": {
            "width": int(width),
            "height": int(height),
            "xStart": x0,
            "xSpacing": dx,
            "yStart": y0,
            "ySpacing": dy,
            "epsg": epsg,
        },
        "radar": {
            "wavelength": wavelength,
            "incidenceAngleDeg": inc,
            "headingDeg": heading,
            "passDirection": "ascending" if "asc" in pass_dir else "descending",
            "lookDirection": s(ident["lookDirection"]).lower(),
            "losUnitVectorProductX": lx,
            "losUnitVectorProductY": ly,
            "numberOfLooks": looks_az * looks_rg,
            "ionoScreenSigmaRad": iono_sigma,
        },
        "identification": {
            "missionId": s(ident["missionId"]),
            "granuleId": s(ident["granuleId"]),
            "frameNumber": int(ident["frameNumber"][()]),
            "trackNumber": int(ident["trackNumber"][()]),
            "productDoi": s(ident["productDoi"]),
            "productSpecificationVersion": s(ident["productSpecificationVersion"]),
            "processingDateTime": s(ident["processingDateTime"]),
            "referenceZeroDopplerStartTime": ref_start,
            "referenceZeroDopplerEndTime": ref_end,
            "secondaryZeroDopplerStartTime": sec_start,
            "secondaryZeroDopplerEndTime": sec_end,
            "temporalBaselineDays": int(meta["orbit/temporalBaseline"][()]),
            "boundingPolygon": wkt_to_coords(s(ident["boundingPolygon"])),
        },
        "processing": {
            "softwareVersion": s(pr["algorithms/softwareVersion"]),
            "unwrappingAlgorithm": s(pr["algorithms/unwrapping/unwrappingAlgorithm"]),
            "flatteningMethod": s(pr["algorithms/interferogramFormation/flatteningMethod"]),
            "wrappedFiltering": s(pr["algorithms/interferogramFormation/wrappedInterferogramFiltering"]),
            "topographicFlatteningApplied": s(pr["parameters/unwrappedInterferogram/frequencyA/topographicFlatteningApplied"]),
            "ellipsoidalFlatteningApplied": s(pr["parameters/unwrappedInterferogram/frequencyA/ellipsoidalFlatteningApplied"]),
            "rangeIonosphericCorrectionApplied": s(pr["parameters/geocoding/rangeIonosphericCorrectionApplied"]),
            "azimuthIonosphericCorrectionApplied": s(pr["parameters/geocoding/azimuthIonosphericCorrectionApplied"]),
            "hydrostaticTroposphericCorrectionApplied": s(pr["parameters/geocoding/hydrostaticTroposphericCorrectionApplied"]),
            "wetTroposphericCorrectionApplied": s(pr["parameters/geocoding/wetTroposphericCorrectionApplied"]),
            "demSource": s(pr["inputs/demSource"])[:200],
            "l1ReferenceSlcGranules": [g.decode() for g in pr["inputs/l1ReferenceSlcGranules"][()]],
            "l1SecondarySlcGranules": [g.decode() for g in pr["inputs/l1SecondarySlcGranules"][()]],
            "looksAzimuth": looks_az,
            "looksRange": looks_rg,
        },
        "stats": {
            "phaseNanFraction": float(np.isnan(phase).mean()),
            "coherenceMean": float(np.nanmean(coherence)),
            "coherenceMedian": float(np.nanmedian(coherence)),
        },
    }

    with open(os.path.join(args.outdir, "meta.json"), "w") as fh:
        json.dump(meta_out, fh, indent=2)
    print(json.dumps({
        "slug": args.slug,
        "grid": f'{width}x{height}',
        "epsg": epsg,
        "wavelength": wavelength,
        "incidence": inc,
        "heading": heading,
        "pass": pass_dir,
        "looks": looks_az * looks_rg,
        "ionoSigma": iono_sigma,
    }, indent=2))


if __name__ == "__main__":
    main()
