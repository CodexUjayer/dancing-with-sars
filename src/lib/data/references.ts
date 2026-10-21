/**
 * Scientific reference registry.
 *
 * Every reference below supports a specific claim, equation or data source
 * used by this application. checkedAt documents when the link/DOI was last
 * verified reachable. This registry is exposed through /api/references and
 * rendered in the UI next to the results it supports.
 */

export interface ScienceReference {
  key: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  url: string;
  doi?: string;
  type: 'paper' | 'document' | 'dataset' | 'api' | 'software';
  supports: string[];
  note?: string;
  checkedAt: string;
}

export const REFERENCES: ScienceReference[] = [
  {
    key: 'okada1985',
    title: 'Surface deformation due to shear and tensile faults in a half-space',
    authors: 'Y. Okada',
    year: 1985,
    venue: 'Bulletin of the Seismological Society of America 75(4):1135–1154',
    url: 'https://doi.org/10.1785/BSSA0750041135',
    doi: '10.1785/BSSA0750041135',
    type: 'paper',
    supports: [
      'Analytic elastic half-space dislocation model used for synthetic validation fixtures and for the earthquake forward-model consistency screen',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'okada1992',
    title: 'Internal deformation due to shear and tensile faults in a half-space',
    authors: 'Y. Okada',
    year: 1992,
    venue: 'Bulletin of the Seismological Society of America 82(2):1018–1040',
    url: 'https://doi.org/10.1785/BSSA0820021018',
    doi: '10.1785/BSSA0820021018',
    type: 'paper',
    supports: [
      'DC3D reference implementation lineage; our TypeScript port is benchmarked against a Python port of this code',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'dc3dpy',
    title: 'dc3d.py — Python port of the dislocation model DC3D.f by Okada (1992)',
    authors: 'satoshi-pes (GitHub)',
    year: 2023,
    venue: 'GitHub repository',
    url: 'https://github.com/satoshi-pes/dc3d.py',
    type: 'software',
    supports: [
      'Independent reference implementation used to generate the Okada benchmark suite (vendored at tools/dc3d_reference.py)',
    ],
    note: 'Cross-validation: 72 scalar comparisons, worst relative difference 0.0 (8 significant digits).',
    checkedAt: '2026-10-20',
  },
  {
    key: 'rodriguez1992',
    title: 'Theory and design of interferometric synthetic aperture radars',
    authors: 'E. Rodriguez, J. M. Martin',
    year: 1992,
    venue: 'IEE Proceedings F 139(2):147–159',
    url: 'https://doi.org/10.1049/ip-f-2.1992.0018',
    doi: '10.1049/ip-f-2.1992.0018',
    type: 'paper',
    supports: [
      'Coherence-based interferometric phase standard deviation σ_φ = sqrt((1−γ²)/(2Lγ²)) used in the uncertainty layer',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'hanssen2001',
    title: 'Radar Interferometry: Data Interpretation and Error Analysis',
    authors: 'R. F. Hanssen',
    year: 2001,
    venue: 'Kluwer Academic Publishers, Dordrecht',
    url: 'https://doi.org/10.1007/0-306-47633-9',
    doi: '10.1007/0-306-47633-9',
    type: 'paper',
    supports: [
      'Error taxonomy of InSAR (atmospheric, ionospheric, unwrapping, decorrelation) informing the uncertainty and attribution layers',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'nisar-atbd',
    title: 'NISAR NASA SDS Algorithm Theoretical Basis Document (JPL D-95677, Rev A)',
    authors: 'NASA Jet Propulsion Laboratory / NISAR Project',
    year: 2023,
    venue: 'JPL document D-95677',
    url: 'https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf',
    type: 'document',
    supports: [
      'Interferogram formation convention (reference × conj(secondary)) and the phase decomposition Δφ = (4π/λ)(Δr_d + Δr_g + Δr_t + Δr_i + Δr_n) (§5.7, §5.11.1) underlying the phase→displacement conversion',
      'Split-spectrum ionospheric correction description',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'nisar-gunw-spec',
    title: 'NISAR L2 GUNW Product Specification (JPL D-102272, Rev E)',
    authors: 'NASA Jet Propulsion Laboratory / NISAR Project',
    year: 2024,
    venue: 'JPL document D-102272',
    url: 'https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-102272_RevE_NASA_SDS_Product_Specification_L2_GUNW_Nov8_2024_w-sigs.pdf',
    type: 'document',
    supports: [
      'HDF5 layout of the GUNW product (unwrappedPhase, coherenceMagnitude, connectedComponents, ionosphere screens, radarGrid metadata) consumed by the extractor',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'nisar-sample-data',
    title: 'NISAR Sample Data portal',
    authors: 'NASA / ASF DAAC',
    year: 2025,
    venue: 'ASF Earthdata Cloud',
    url: 'https://nisar.jpl.nasa.gov/data/sample-data/',
    type: 'dataset',
    supports: [
      'Openly distributed NISAR-format sample products; the analysed L2 GUNW sample (ALOS PALSAR 2008 pair over the Los Angeles region, NISAR SDS v0.24.0) originates here',
    ],
    note: 'Local copy: data/nisar-sample/. Product DOI recorded in-file: 10.5067/NIL2GUNW-B1.',
    checkedAt: '2026-10-20',
  },
  {
    key: 'cmr-api',
    title: 'NASA Common Metadata Repository (CMR) Search API',
    authors: 'NASA Earthdata',
    year: 2026,
    venue: 'cmr.earthdata.nasa.gov',
    url: 'https://cmr.earthdata.nasa.gov/search/',
    type: 'api',
    supports: [
      'Live discovery of NISAR L2 GUNW granule availability (collections NISAR_L2_GUNW_PROVISIONAL_V1 / BETA_V1) used by the availability panel',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'usgs-fdsn',
    title: 'USGS Earthquake Catalog API (ComCat FDSN ws-event)',
    authors: 'U.S. Geological Survey',
    year: 2026,
    venue: 'earthquake.usgs.gov/fdsnws',
    url: 'https://earthquake.usgs.gov/fdsnws/event/1/',
    type: 'api',
    supports: [
      'Independent seismic evidence for the attribution layer; moment-tensor nodal planes used by the forward-model screen',
    ],
    checkedAt: '2026-10-20',
  },
  {
    key: 'hanks1979',
    title: 'A moment magnitude scale',
    authors: 'T. C. Hanks, H. Kanamori',
    year: 1979,
    venue: 'Journal of Geophysical Research 84(B5):2348–2350',
    url: 'https://doi.org/10.1029/JB084iB05p02348',
    doi: '10.1029/JB084iB05p02348',
    type: 'paper',
    supports: ['Moment–magnitude relation M0 = 10^(1.5 Mw + 9.1) N·m used to scale the forward model'],
    checkedAt: '2026-10-20',
  },
  {
    key: 'wc1994',
    title: 'New empirical relationships among magnitude, rupture length, rupture width, rupture area, and surface displacement',
    authors: 'D. L. Wells, K. J. Coppersmith',
    year: 1994,
    venue: 'Bulletin of the Seismological Society of America 84(4):974–1002',
    url: 'https://doi.org/10.1785/BSSA0840040974',
    doi: '10.1785/BSSA0840040974',
    type: 'paper',
    supports: [
      'Empirical magnitude–rupture-area scaling (log10 A = 0.91 Mw − 3.49, all slip types) used for fault dimensions in the forward-model screen',
    ],
    note: 'Regression scatter ≈ 0.25 orders of magnitude — used only as an order-of-magnitude screen.',
    checkedAt: '2026-10-20',
  },
  {
    key: 'snyder1987',
    title: 'Map Projections — A Working Manual',
    authors: 'J. P. Snyder',
    year: 1987,
    venue: 'U.S. Geological Survey Professional Paper 1395',
    url: 'https://doi.org/10.3133/pp1395',
    doi: '10.3133/pp1395',
    type: 'document',
    supports: ['Transverse Mercator (UTM) forward/inverse series used for map alignment of product grids'],
    checkedAt: '2026-10-20',
  },
  {
    key: 'huber1981',
    title: 'Robust Statistics',
    authors: 'P. J. Huber',
    year: 1981,
    venue: 'John Wiley & Sons, New York',
    url: 'https://doi.org/10.1002/0471725250',
    doi: '10.1002/0471725250',
    type: 'paper',
    supports: ['Median/MAD robust estimators used for referencing and reference-region scatter'],
    checkedAt: '2026-10-20',
  },
  {
    key: 'akirichards',
    title: 'Quantitative Seismology (2nd edition)',
    authors: 'K. Aki, P. G. Richards',
    year: 2002,
    venue: 'University Science Books, Sausalito',
    url: 'https://www.uscis.org/books/quantitative-seismology-2nd-edition-aki-richards',
    type: 'paper',
    supports: ['Rake (slip vector) convention used to map USGS moment-tensor solutions onto Okada dislocation components'],
    checkedAt: '2026-10-20',
  },
];

export function referenceByKey(key: string): ScienceReference | undefined {
  return REFERENCES.find((r) => r.key === key);
}
