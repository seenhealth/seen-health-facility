# Overall Planning — floor plan and furniture update

## Controlling source

The user-supplied Overall Planning.jpg (7200 × 5400 pixels) supersedes the PDF ground-floor image for walls, openings, room configuration, furniture, site context and adjacent-building footprint. The original file is preserved unchanged; the viewer uses an RGB image of the same plan.

## Model update

- 68 room/space records.
- 266 wall segments across all levels.
- 306 furniture and plumbing/equipment instances.
- Exact supplied image available through Current floor plan and Source overlay.
- Source overlay hides extruded walls/furniture to avoid doubled depictions.
- Upper-level shells and PDF finish information are retained where the image provides no replacement.

## Seating configuration

| Area | Configuration |
|---|---|
| Dining | 5 diamond-oriented tables, 4 chairs each |
| Day room | 9 diamond-oriented tables, 4 chairs each |
| East banquette | 7 rectangular tables, 2 loose chairs each, continuous bench |
| Tree seating | 4 round tables and 12 chairs around central tree |
| Communal table | 14 chairs |
| North day-room tables | 2 tables with 2 chairs each |
| Lounge corner | 2 round side tables and 4 blue chairs |
| Administration workbench | 12 chairs |
| Small meeting rooms | 2 rooms with 3 chairs each |
| Conference room | 16 chairs |

## Trace contract

Every new wall and furniture instance retains coordinates in a 1800 × 1350 analysis frame (one quarter of the original image). Furniture records also retain horizontal footprints, rotations and stable IDs. These coordinates are converted once to meters. Use the data to replace a building or swap an asset family without modifying the renderer.

## Verification and limitations

Wall centerlines and furniture footprints were plotted directly over the supplied image. Positions, counts and horizontal footprints follow this image; heights, manufacturer geometry, hidden construction and unprovided upper-floor fit-out are not established by the image. Physical scale uses the PDF clinic area (3,254 sq ft) and remains provisional until a measured length or dimensioned drawing is supplied. This is not an as-built dimensional certification. Browser visual testing is not included.

## Room / space register

| ID | Room / space | Furniture / fixtures |
|---|---|---:|
| basement-shell | Basement | 0 |
| mezzanine-shell | Equipment mezzanine | 0 |
| upper-office-shell | Future office space | 0 |
| clinic-west-01 | West clinical room 01 | 1 |
| clinic-west-02 | West clinical room 02 | 1 |
| clinic-west-03 | West clinical room 03 | 0 |
| clinic-west-04 | West clinical room 04 | 1 |
| clinic-west-05 | West clinical room 05 | 2 |
| clinic-west-06 | West clinical room 06 | 4 |
| clinic-west-07 | West clinical room 07 | 2 |
| clinic-west-08 | West clinical room 08 | 4 |
| clinic-exam-01 | Clinical treatment room 01 | 6 |
| clinic-exam-02 | Clinical treatment room 02 | 6 |
| clinic-exam-03 | Clinical treatment room 03 | 6 |
| clinic-exam-04 | Clinical treatment room 04 | 6 |
| clinic-exam-05 | Clinical treatment room 05 | 4 |
| clinic-exam-06 | Clinical treatment room 06 | 6 |
| clinic-south-east | Clinical utility room | 0 |
| clinic-wc-north | Clinical bathroom north | 2 |
| clinic-wc-south | Clinical bathroom south | 2 |
| clinic-center-store | Central clinical support | 0 |
| clinic-treatment-south | South clinical treatment room | 4 |
| clinic-nurse | Nurse station | 3 |
| rear-stair | Rear stair | 1 |
| rear-north | Rear support north | 0 |
| rear-utility-nw | Rear utility northwest | 1 |
| rear-support-west | Rear support west | 0 |
| rear-support-center | Rear central support | 0 |
| rear-support-east | Rear support east | 0 |
| rear-shower-north | Rear personal-care room north | 2 |
| rear-shower-south | Rear personal-care room south | 2 |
| rear-wc-west | Accessible bathroom west | 3 |
| rear-wc-east | Accessible bathroom east | 4 |
| lobby-office-w1 | Reception-side room W1 | 0 |
| lobby-office-w2 | Reception-side room W2 | 0 |
| lobby-office-n1 | Reception-side room N1 | 0 |
| lobby-office-n2 | Reception-side room N2 | 0 |
| lobby-office-c1 | Central support room C1 | 0 |
| lobby-office-c2 | Central support room C2 | 0 |
| lobby-office-c3 | Central support room C3 | 0 |
| lobby-wc-1 | Lobby bathroom north | 2 |
| lobby-wc-2 | Lobby bathroom south | 2 |
| hall-1010 | East hallway · 1010 | 0 |
| lobby-arrival | Reception & arrival | 3 |
| day-open | Day room | 112 |
| dining-1421 | Dining · 1421 | 26 |
| kitchen-prep | Kitchen preparation & service | 11 |
| east-service | East service corridor | 0 |
| rehab-support-nw | Therapy support NW | 0 |
| rehab-support-west | Therapy west room | 0 |
| rehab-support-north | Therapy north support | 0 |
| rehab-entry | Therapy entry corridor | 0 |
| rehab-support-mid | Therapy southwest room | 0 |
| rehab-wc-nw | Therapy bathroom northwest | 2 |
| rehab-wc-sw | Therapy bathroom west | 2 |
| rehab-wc-east | Therapy personal care east | 6 |
| rehab-wc-south | Therapy personal care south | 6 |
| rehab-open | Open therapy space | 6 |
| admin-waiting-west | Administration waiting west | 3 |
| admin-waiting-east | Administration waiting east | 1 |
| admin-wc-north | Administration bathroom north | 2 |
| admin-wc-south | Administration bathroom south | 2 |
| admin-side-office | Administration side workspace | 3 |
| admin-meeting-west | Three-seat meeting room west | 4 |
| admin-meeting-east | Three-seat meeting room east | 4 |
| admin-conference | Conference room | 17 |
| admin-workstations | Administration shared workstations | 13 |
| adjacent-shell | Adjacent building shell | 0 |

## Source priority

1. Overall Planning.jpg: current ground-floor plan and furniture arrangement.
2. Final 2024 PDF: published areas, finish/elevation references, basement and upper-level information.
3. Inferred values: clearly identified dimensions and geometry not documented by either source.
