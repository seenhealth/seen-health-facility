import type { Asset, Instance } from './schema';

/**
 * What a piece of furniture or equipment is, in plain words, for the 3D
 * viewer's furniture card: a friendly name and one sentence on how it is used
 * in a PACE day center (or, with `home`, in a participant's home). Keyed by
 * asset `kind` (assets.ts and its builders); `assetEntries` refines generic
 * kinds by asset id (a `box` that is a refrigerator, a treadmill drawn with
 * the stepper model) and `tabletopEntries` the table settings by their
 * `parameters.activity`.
 *
 * A kind missing here still gets a card: the asset's own `name` when the
 * specification gives one, else its id in words, with a generic purpose.
 * Add an entry when a facility brings a new kind.
 */
export type CatalogEntry = {
  name: string;
  purpose: string;
  /** Wording inside a home (a facility stamped on a `home` setting). */
  home?: { name?: string; purpose: string };
  /**
   * Part of the building rather than an item in it (doors, stairs, screens,
   * ceiling services): never highlighted or inspected.
   */
  structural?: boolean;
};

export const assetCatalog: Record<string, CatalogEntry> = {
  // Seating
  chair: {
    name: 'Chair',
    purpose:
      'Side chair for a participant or visitor at a desk or table; a firm seat with a back makes standing up easier.',
    home: {
      name: 'Desk chair',
      purpose:
        'Firm chair at the desk in the family bedroom, at a height where feet rest flat on the floor.',
    },
  },
  'task-chair': {
    name: 'Task chair',
    purpose:
      'Height-adjustable rolling chair for staff working at a desk, counter or nursing station.',
  },
  'mesh-chair': {
    name: 'Task chair',
    purpose:
      'Adjustable mesh office chair where staff chart, schedule rides and call families and providers.',
  },
  'upholstered-chair': {
    name: 'Armchair',
    purpose:
      'Upholstered chair with arms at the day-room and dining tables; the arms and firm seat give participants something to push up from when they stand.',
    home: {
      name: 'Dining chair',
      purpose:
        'Dining chair with arms: steady to push up from, so standing up from the table is safer.',
    },
  },
  'lounge-chair': {
    name: 'Lounge chair',
    purpose:
      'Deep armchair for resting between activities; its arms and higher seat help participants get up on their own.',
    home: {
      name: 'Armchair',
      purpose:
        'Armchair in the living room with clear floor beside it, so a wheelchair can park alongside for a side transfer.',
    },
  },
  'compact-sofa': {
    name: 'Sofa',
    purpose:
      'Three-seat sofa with firm cushions and arms, firm enough to sit down on and stand up from safely.',
  },
  bench: {
    name: 'Bench',
    purpose: 'Bench for waiting, resting between activities or changing shoes.',
    home: {
      name: 'Entry bench',
      purpose:
        'Bench by the front door for putting on stockings, shoes and a jacket sitting down before going out.',
    },
  },
  'rec-bench': {
    name: 'Bench',
    purpose:
      'Bench beside the games where players wait their turn and friends watch and cheer.',
  },
  'tree-seat': {
    name: 'Tree seat',
    purpose:
      'Round bench built around a planter: a place to wait, rest or chat on arrival.',
  },
  'clinical-stool': {
    name: "Clinician's stool",
    purpose:
      'Rolling stool that lets a doctor, nurse or therapist sit at eye level with the participant during an exam.',
  },
  'clinical-recliner': {
    name: 'Exam recliner',
    purpose:
      'Reclining exam chair for check-ups, vital signs, wound care and injections; easier to get into than a high exam table.',
  },
  'dental-chair': {
    name: 'Dental chair',
    purpose:
      'Dental chair for check-ups and cleanings on site; PACE covers dental care, so no separate trip is needed.',
  },
  'barber-chair': {
    name: 'Salon chair',
    purpose:
      'Hydraulic salon chair for haircuts in the personal-care suite, part of helping participants feel groomed and comfortable.',
  },
  'exam-chair': {
    name: 'Exam chair',
    purpose:
      'Padded exam chair used during clinic visits for assessments and treatment.',
  },

  // Tables and work surfaces
  table: {
    name: 'Table',
    purpose:
      'Table for meals, activities and conversation; chairs pull up with room for a wheelchair at the ends.',
    home: {
      name: 'Dining table',
      purpose:
        'Table for four in the dining nook; one chair slides out so a wheelchair can pull up to the table.',
    },
  },
  'round-table': {
    name: 'Round table',
    purpose:
      'Round table for small-group activities, so everyone can see and hear each other.',
    home: {
      name: 'Side table',
      purpose: 'Small round table for a drink or a book within easy reach.',
    },
  },
  'meeting-table': {
    name: 'Meeting table',
    purpose: 'Table for team meetings and family conferences.',
  },
  desk: {
    name: 'Desk',
    purpose:
      'Staff desk for charting, scheduling and phone calls with participants, families and providers.',
    home: {
      name: 'Desk',
      purpose:
        'Desk in the family bedroom for paperwork and for relatives who stay over.',
    },
  },
  'admin-workstation': {
    name: 'Workstation',
    purpose:
      'Office workstation upstairs where coordinators, social workers and the center manager schedule care, plan transport and call families.',
  },
  'admin-monitor': {
    name: 'Computer monitor',
    purpose:
      'Desk screen for the electronic health record, schedules and transport planning.',
  },
  counter: {
    name: 'Counter',
    purpose:
      'Work counter with storage below for supplies, paperwork or food preparation.',
    home: {
      name: 'Kitchen counter',
      purpose:
        'Kitchen counter with drawers and cupboards; everyday things are kept between hip and shoulder height to avoid reaching and bending.',
    },
  },
  'quartz-counter': {
    name: 'Counter',
    purpose:
      'Solid-surface counter for clean work: setting out supplies, snacks or medications.',
  },
  casework: {
    name: 'Built-in cabinets',
    purpose: 'Built-in cupboards and drawers for supplies.',
  },
  cabinet: {
    name: 'Cabinet',
    purpose: 'Storage cabinet for supplies and equipment.',
    home: {
      name: 'Cupboard',
      purpose:
        'Cupboard for everyday things; what is used daily sits within easy reach, so nobody climbs on a step stool.',
    },
  },
  'nurse-station': {
    name: 'Nurse station',
    purpose:
      'Staffed nursing station where nurses chart, prepare medications and keep an eye on the clinic.',
  },
  'clinical-nurse-station': {
    name: 'Nurse station',
    purpose:
      'Staffed nursing station where nurses chart, prepare medications and keep watch over the clinic; its low section lets a wheelchair user talk to staff face to face.',
  },

  // Clinic
  'glazed-cabinet': {
    name: 'Supply cabinet',
    purpose:
      'Glass-fronted cabinet for clinic supplies, so staff can see what is stocked at a glance.',
  },
  'medical-drawer-cart': {
    name: 'Supply cart',
    purpose:
      'Rolling drawer cart that brings dressings, gloves and supplies to the exam chair.',
  },
  'procedure-cart': {
    name: 'Procedure cart',
    purpose:
      'Rolling cart laid out with instruments and supplies for minor procedures.',
  },
  'clinical-drawers': {
    name: 'Drawer unit',
    purpose: 'Storage drawers for clinic and personal-care supplies.',
    home: {
      name: 'Bathroom drawers',
      purpose:
        'Drawers for towels and toiletries within reach of the shower seat.',
    },
  },
  'clinical-printer': {
    name: 'Printer',
    purpose: 'Printer for labels, care plans and after-visit instructions.',
  },
  'clinical-monitor': {
    name: 'Charting workstation',
    purpose:
      'Computer on a wall arm, so the clinician can chart and review results while facing the participant.',
  },
  'clinical-sink': {
    name: 'Clinic sink',
    purpose:
      'Hand-washing sink in the exam room; staff wash before and after every contact.',
  },
  'counter-basin': {
    name: 'Counter sink',
    purpose: 'Sink set into a counter for hand washing and cleaning up.',
    home: {
      name: 'Kitchen sink',
      purpose:
        'Kitchen sink with a removable base cabinet, so it can be used from a seat or a wheelchair.',
    },
  },
  'diagnostic-panel': {
    name: 'Wall diagnostic set',
    purpose:
      'Wall-mounted otoscope, ophthalmoscope and blood pressure cuff for routine checks of ears, eyes and blood pressure.',
  },
  'wall-dispenser': {
    name: 'Wall dispenser',
    purpose: 'Wall dispenser for gloves, sanitizer or paper towels.',
  },
  'exam-lamp': {
    name: 'Exam light',
    purpose: 'Adjustable exam light for skin, wound and foot checks.',
  },
  'dental-delivery': {
    name: 'Dental unit',
    purpose: 'Instrument tray and suction beside the dental chair.',
  },
  'therapy-bed': {
    name: 'Therapy bed',
    purpose: 'Padded treatment bed for therapy and exams.',
  },

  // Rehabilitation
  'rehab-plinth': {
    name: 'Treatment plinth',
    purpose:
      'Padded table where the physical therapist stretches and treats participants; it lowers for an easy transfer from a wheelchair.',
  },
  'rehab-bars': {
    name: 'Parallel bars',
    purpose:
      'Gait and balance training with a physical therapist; participants hold both rails while they practise standing and walking.',
  },
  'parallel-bars': {
    name: 'Parallel bars',
    purpose:
      'Gait and balance training with a physical therapist; participants hold both rails while they practise standing and walking.',
  },
  'rehab-stepper': {
    name: 'Recumbent stepper',
    purpose:
      'Seated stepping machine for low-impact endurance and leg strength; the seat and handles make it safe for people who cannot use a treadmill.',
  },
  'rehab-training-stairs': {
    name: 'Training stairs',
    purpose:
      'Practice steps with handrails, where a therapist coaches participants on stairs and curbs before they meet them at home.',
  },
  'rehab-rack': {
    name: 'Weights rack',
    purpose:
      'Rolling rack of light hand weights and resistance bands for strength exercises.',
  },
  'rehab-pulley': {
    name: 'Wall pulleys',
    purpose:
      'Overhead pulleys that help loosen stiff shoulders, for example after a fall or a stroke.',
  },
  'therapy-balls': {
    name: 'Exercise balls',
    purpose:
      'Large therapy balls for balance, core and stretching exercises with the therapist.',
  },

  // Personal care and laundry
  'care-shower': {
    name: 'Accessible shower',
    purpose:
      'Roll-in shower with a seat and grab bars, where aides help participants bathe safely; for many, the center is the safest place to shower.',
    home: {
      name: 'Roll-in shower',
      purpose:
        'Curbless shower with a fold-down seat and grab bars, so bathing at home can be done seated with the aide’s help.',
    },
  },
  toilet: {
    name: 'Accessible toilet',
    purpose:
      'Raised toilet with grab bars; aides help participants who need assistance.',
    home: {
      name: 'Raised toilet',
      purpose:
        'Raised toilet with side, rear and swing-up grab bars for safe transfers from a walker or a wheelchair.',
    },
  },
  basin: {
    name: 'Wash basin',
    purpose: 'Hand-washing basin.',
    home: {
      name: 'Roll-under basin',
      purpose:
        'Wash basin with open knee space, usable from a seat or a wheelchair.',
    },
  },
  'accessible-vanity': {
    name: 'Accessible double sink',
    purpose:
      'Double sink with open knee space, so participants can wash and groom from a wheelchair.',
  },
  vanity: {
    name: 'Vanity',
    purpose: 'Wash basin with storage below.',
  },
  'hair-wash-basin': {
    name: 'Hair-wash basin',
    purpose:
      'Salon basin with a reclining neck rest for hair washing in the personal-care suite.',
  },
  'laundry-machine': {
    name: 'Washer or dryer',
    purpose:
      'Laundry for towels, linens and participants’ clothes after a shower or an accident.',
    home: {
      name: 'Washer or dryer',
      purpose:
        'Raised on a pedestal, so loading and unloading needs less bending.',
    },
  },
  'linen-rack': {
    name: 'Linen rack',
    purpose: 'Clean towels and linens ready for showers and personal care.',
  },
  'wire-rack': {
    name: 'Storage shelving',
    purpose: 'Open wire shelving for supplies, files and equipment.',
  },
  'locker-bank': {
    name: 'Lockers',
    purpose: 'Lockers where staff keep their belongings during a shift.',
  },
  shelf: {
    name: 'Shelving',
    purpose: 'Open shelving for books, games and supplies.',
  },
  'library-bay': {
    name: 'Bookcase',
    purpose:
      'Library shelving with books, puzzles and magazines for quiet time between programs.',
  },

  // Meals
  'meal-cart': {
    name: 'Serving cart',
    purpose:
      'Rolling cart for plates, drinks and food during the lunch service.',
  },
  'kitchen-range': {
    name: 'Kitchen range',
    purpose:
      'Range with its controls at the front, so no one reaches over a hot burner; the aide cooks breakfast here.',
  },

  // Games and recreation
  'activity-tabletop': {
    name: 'Table setting',
    purpose: 'Items set out on a table for the day’s activity.',
  },
  'mahjong-table': {
    name: 'Mahjong table',
    purpose:
      'A familiar game for many participants that exercises memory, attention and hand coordination.',
  },
  'ping-pong-table': {
    name: 'Ping pong table',
    purpose:
      'Table tennis for participants who are steady on their feet: reaction time, balance and some friendly competition.',
  },
  'table-tennis-table': {
    name: 'Ping pong table',
    purpose:
      'Table tennis for participants who are steady on their feet: reaction time, balance and some friendly competition.',
  },
  'pool-table': {
    name: 'Pool table',
    purpose:
      'Pool in the games lounge; lining up a shot works standing balance and reach.',
  },
  'wii-station': {
    name: 'Wii station',
    purpose:
      'Video games with motion controllers, bowling played standing or seated: gentle exercise that feels like play.',
  },
  'karaoke-station': {
    name: 'Karaoke station',
    purpose:
      'Screen and microphones for karaoke; singing familiar songs lifts mood and exercises breathing and speech.',
  },
  'karaoke-media': {
    name: 'Karaoke screen',
    purpose: 'Screen and player for karaoke songs and lyrics.',
  },
  'mic-stand': {
    name: 'Microphone',
    purpose: 'Microphone on a stand for karaoke and announcements.',
  },
  'tower-speaker': {
    name: 'Speaker',
    purpose: 'Speaker for music, karaoke and exercise classes.',
  },
  'paddle-rack': {
    name: 'Paddle rack',
    purpose: 'Table tennis paddles and balls.',
  },
  screen: {
    name: 'Wall screen',
    purpose:
      'Screen for presentations, exercise videos and the day’s announcements.',
    home: {
      name: 'Television',
      purpose:
        'Television in the living room, in view of the sofa and the armchair.',
    },
  },

  // Home
  bed: {
    name: 'Bed',
    purpose:
      'Bed at a height where feet rest flat on the floor when sitting on the edge, which makes getting up safer.',
  },
  nightstand: {
    name: 'Nightstand',
    purpose:
      'Bedside table with a lamp in easy reach, so nobody walks to the bathroom in the dark.',
  },
  wardrobe: {
    name: 'Wardrobe',
    purpose:
      'Wardrobe for clothes, with everyday things kept between knee and shoulder height.',
  },
  'side-table-lamp': {
    name: 'Side table and lamp',
    purpose:
      'Lamp beside the armchair: good light for reading and for seeing the floor at night.',
  },
  'grab-bar': {
    name: 'Grab bar',
    purpose:
      'Bar fixed into the wall framing: something firm to hold when sitting, standing or turning in the bathroom.',
  },
  'swing-up-grab-bar': {
    name: 'Swing-up grab bar',
    purpose:
      'Hinged bar beside the toilet that folds up out of the way for a wheelchair transfer and down for support; the installer fits it after the OT’s home assessment.',
  },
  'bed-rail': {
    name: 'Bed rail',
    purpose:
      'Floor-standing assist rail by the bed to hold when sitting up and standing.',
  },
  'hospital-bed': {
    name: 'Hospital bed',
    purpose:
      'Adjustable bed with a raising head section, for someone who needs to sleep propped up or receive care in bed.',
  },
  ramp: {
    name: 'Ramp',
    purpose:
      'Gentle 1:12 ramp with handrails on both sides, so a wheelchair or walker gets in and out without steps.',
  },

  // Site
  car: {
    name: 'Parked car',
    purpose: 'A car parked on the street or in the lot by the center.',
  },
  bike: {
    name: 'Bicycle',
    purpose: 'A bicycle at the rack.',
  },
  tree: {
    name: 'Tree',
    purpose: 'Shade tree on the site.',
  },
  'tree-unseated': {
    name: 'Tree',
    purpose: 'Shade tree on the site.',
  },
  planter: {
    name: 'Planter',
    purpose:
      'Planter with greenery that softens the space and marks the walkway.',
  },

  // Part of the building: named for completeness, never inspected.
  'plan-door': { name: 'Door', purpose: 'Door.', structural: true },
  'folding-partition': {
    name: 'Folding partition',
    purpose: 'Operable wall.',
    structural: true,
  },
  'hinged-door': { name: 'Door', purpose: 'Door.', structural: true },
  'sliding-door': { name: 'Sliding door', purpose: 'Door.', structural: true },
  'lift-gate': { name: 'Lift', purpose: 'Lift.', structural: true },
  'landing-guard': { name: 'Guard rail', purpose: 'Guard.', structural: true },
  'dining-lattice': {
    name: 'Lattice screen',
    purpose: 'Screen.',
    structural: true,
  },
  'connected-stair': { name: 'Stair', purpose: 'Stair.', structural: true },
  'return-stair': { name: 'Stair', purpose: 'Stair.', structural: true },
  stair: { name: 'Stair', purpose: 'Stair.', structural: true },
  steps: { name: 'Steps', purpose: 'Steps.', structural: true },
  'slat-wall': { name: 'Slat wall', purpose: 'Wall finish.', structural: true },
  'moss-screen': {
    name: 'Moss wall',
    purpose: 'Wall finish.',
    structural: true,
  },
  'landscape-screen': {
    name: 'Landscape screen',
    purpose: 'Wall finish.',
    structural: true,
  },
  sign: { name: 'Sign', purpose: 'Sign.', structural: true },
  'ceiling-grid': { name: 'Ceiling', purpose: 'Ceiling.', structural: true },
  'linear-light': { name: 'Light', purpose: 'Light.', structural: true },
  'round-duct': { name: 'Duct', purpose: 'Duct.', structural: true },
  'timber-truss': { name: 'Truss', purpose: 'Truss.', structural: true },
  'fleet-van': { name: 'Seen van', purpose: 'Van.', structural: true },
  box: { name: 'Fitting', purpose: 'Built-in element.', structural: true },
};

/** Asset ids that say more than their kind (generic `box`, `table`, … assets). */
export const assetEntries: Record<string, CatalogEntry> = {
  refrigerator: {
    name: 'Refrigerator',
    purpose:
      'Refrigerator for meals, snacks and medicines that must stay cold.',
    home: {
      purpose:
        'Kitchen refrigerator; the aide checks the home-delivered meals and leftovers on each visit.',
    },
  },
  'home-pill-organizer': {
    name: 'Pill organizer',
    purpose:
      'The week’s blister packs from the pharmacy, kept in one place so the aide and the nurse can see what has been taken.',
  },
  'home-microwave': {
    name: 'Microwave',
    purpose:
      'Microwave at counter height, so hot food comes out at chest level rather than overhead.',
  },
  'home-pedestal': {
    name: 'Laundry pedestal',
    purpose: 'Raises the washer or dryer so loading needs less bending.',
  },
  'home-mirror': {
    name: 'Mirror',
    purpose:
      'Mirror tilted for someone washing at the basin from a seat or a wheelchair.',
  },
  'home-threshold': {
    name: 'Flush threshold',
    purpose:
      'A 12 mm threshold plate at the front door that wheels and walker feet roll straight over.',
  },
  'home-seated-worktop': {
    name: 'Seated worktop',
    purpose:
      'Worktop at 0.76 m with open knee space, so breakfast and the morning pills can be done sitting down.',
  },
  'home-linen-cupboard': {
    name: 'Linen cupboard',
    purpose: 'Towels and bedding stored in the hall between bath and bedrooms.',
  },
  'home-bed-queen': {
    name: 'Queen bed',
    purpose:
      'Shared bed with a wide walker side by the bathroom and a wheelchair side with a transfer handle to hold when getting in and out.',
  },
  'home-bed-full': {
    name: 'Full bed',
    purpose: 'Bed in the second bedroom for family who stay over.',
  },
  'home-ramp-back': {
    name: 'Back ramp',
    purpose:
      'A 1:12 ramp from the back landing to the yard: a second step-free way out, needed in an emergency.',
  },
  'plan-dining-table': {
    name: 'Dining table',
    purpose:
      'Table for four where lunch is served; aides and the dietitian notice chewing, swallowing and appetite changes here.',
  },
  'interior-plan-dining-table': {
    name: 'Dining table',
    purpose:
      'Table for four where lunch is served; aides and the dietitian notice chewing, swallowing and appetite changes here.',
  },
  'interior-plan-banquette-table': {
    name: 'Banquette table',
    purpose: 'Day-room table along the banquette for tea, cards and crafts.',
  },
  'interior-plan-long-table': {
    name: 'Long table',
    purpose: 'Long table for group crafts and table games.',
  },
  'interior-plan-small-table': {
    name: 'Small table',
    purpose: 'Small table for a one-to-one conversation or a single activity.',
  },
  'plan-small-table': {
    name: 'Consult table',
    purpose:
      'Small table in a consult room, where a clinician and a participant or family member sit side by side.',
  },
  'interior-ot-table': {
    name: 'OT work table',
    purpose:
      'Occupational therapy table where participants practise everyday hand tasks: buttons, cards, pouring and writing.',
  },
  'upperfit-conference-table': {
    name: 'Conference table',
    purpose:
      'Where the interdisciplinary team meets to review each participant’s care plan.',
  },
  'review-table': {
    name: 'Table',
    purpose: 'Day-space table for meals, activities and conversation.',
  },
  'plan-lounge-table': {
    name: 'Lounge table',
    purpose:
      'Low table beside the lounge chairs for drinks, books and glasses.',
  },
  'interior-plan-lounge-table': {
    name: 'Lounge table',
    purpose:
      'Low table beside the lounge chairs for drinks, books and glasses.',
  },
  'plan-reception-counter': {
    name: 'Reception counter',
    purpose:
      'Front desk where participants check in on arrival and staff greet visitors, answer calls and track who is in the building.',
  },
  'interior-banquette': {
    name: 'Banquette',
    purpose:
      'Built-in bench seating along the day-room wall for tables and conversation.',
  },
  'photo-staff-stool': {
    name: 'Staff stool',
    purpose: 'Counter-height stool for staff at a work counter.',
  },
  'interior-procedure-chair': {
    name: 'Procedure chair',
    purpose:
      'Reclining chair for minor procedures such as wound care and injections, with room for staff on both sides.',
  },
  'review-treadmill': {
    name: 'Treadmill',
    purpose:
      'Treadmill station from the plan review, drawn with the stepper model; supervised walking with a therapist builds endurance.',
  },
  'interior-sharps': {
    name: 'Sharps container',
    purpose:
      'Wall container for used needles and lancets, out of participants’ reach.',
  },
  'interior-paper-bin': {
    name: 'Paper towels',
    purpose: 'Paper towel dispenser beside the sink for hand washing.',
  },
  'interior-wash-storage': {
    name: 'Wash storage',
    purpose: 'Drawers for towels, wipes and toiletries next to the showers.',
  },
  'interior-clinic-secure-bin': {
    name: 'Secure document bin',
    purpose:
      'Locked bin for papers with health information, shredded off site.',
  },
  'interior-clinic-telephone': {
    name: 'Telephone',
    purpose:
      'Clinic phone for calls with families, pharmacies and specialists.',
  },
  'interior-rehab-wc-east-sink-mirror': {
    name: 'Mirror',
    purpose: 'Mirror over the wash basin.',
  },
  'interior-rehab-wc-south-sink-mirror': {
    name: 'Mirror',
    purpose: 'Mirror over the wash basin.',
  },
  'alveare-rehab-mirror': {
    name: 'Mirror',
    purpose:
      'Full-length mirror in the therapy room, so participants can watch their posture while they exercise.',
  },
  'olympic-cafe-coffee': {
    name: 'Coffee station',
    purpose: 'Coffee and tea for participants, families and staff.',
  },
  'olympic-panel-electrical': {
    name: 'Electrical panel',
    purpose: 'Electrical distribution panel; kept clear for maintenance.',
  },
  'alveare-panel-electrical': {
    name: 'Electrical panel',
    purpose: 'Electrical distribution panel; kept clear for maintenance.',
  },
  'olympic-panel-idf': {
    name: 'Network cabinet',
    purpose: 'Network and phone equipment for the floor.',
  },
  'alveare-dishwasher': {
    name: 'Dishwasher',
    purpose: 'Dishwasher for the staff kitchen.',
  },
  'alveare-kitchen-dishmachine': {
    name: 'Dish machine',
    purpose: 'Commercial dish machine for lunch plates and cups.',
  },
  'alveare-hot-serving-counter': {
    name: 'Hot serving counter',
    purpose: 'Keeps lunch hot while it is plated and served.',
  },
  'alveare-serving-pan-433': {
    name: 'Serving pan',
    purpose: 'A pan of the day’s lunch on the hot counter.',
  },
  'alveare-serving-pan-442': {
    name: 'Serving pan',
    purpose: 'A pan of the day’s lunch on the hot counter.',
  },
  'alveare-serving-pan-451': {
    name: 'Serving pan',
    purpose: 'A pan of the day’s lunch on the hot counter.',
  },
  'alveare-serving-pan-460': {
    name: 'Serving pan',
    purpose: 'A pan of the day’s lunch on the hot counter.',
  },
  'alveare-staff-microwave': {
    name: 'Microwave',
    purpose: 'Microwave in the staff break area.',
  },
  'alveare-microwave-shelf': {
    name: 'Microwave',
    purpose: 'Microwave on a shelf in the kitchen.',
  },
  'alveare-beverage-925': {
    name: 'Beverage station',
    purpose: 'Water, juice and coffee for meals and breaks.',
  },
  'alveare-beverage-933': {
    name: 'Beverage station',
    purpose: 'Water, juice and coffee for meals and breaks.',
  },
  'alveare-staff-upper-cabinets': {
    name: 'Upper cabinets',
    purpose: 'Wall cabinets in the staff break area.',
  },
  'upperfit-display': {
    name: 'Conference display',
    purpose:
      'Screen in the conference room for video calls with specialists and families during team meetings.',
  },
  'upperfit-video-bar': {
    name: 'Video bar',
    purpose: 'Camera and microphone for video calls in the conference room.',
  },
  'upperfit-file-cabinet': {
    name: 'File cabinet',
    purpose: 'Locked files for records that are still kept on paper.',
  },
};

/** `activity-tabletop` and `meal-cart` sets by their `parameters.activity`. */
export const tabletopEntries: Record<string, CatalogEntry> = {
  meal: {
    name: 'Lunch place settings',
    purpose:
      'Plates, cups and cutlery for lunch; aides help with cutting and opening and note how much each participant eats.',
  },
  tea: {
    name: 'Tea service',
    purpose:
      'Cups, a teapot and snacks on the day-room tables for the social time between programs.',
  },
  craft: {
    name: 'Craft supplies',
    purpose:
      'Paper, brushes and materials for arts, crafts and calligraphy: gentle practice for hands and fingers.',
  },
  games: {
    name: 'Table games',
    purpose:
      'Cards, dominoes and board games that keep small groups talking, thinking and laughing.',
  },
  buffet: {
    name: 'Lunch service',
    purpose: 'Hot and cold dishes ready for the lunch line in the dining room.',
  },
};

export type AssetDescription = {
  name: string;
  purpose: string;
  kind: string;
  /** False when neither the kind nor the asset id has an entry. */
  catalogued: boolean;
};

/** "photo-clinic-red-cart-2" → "Clinic red cart". */
export function assetIdWords(id: string) {
  const words = id
    .replace(
      /^(photo|plan|interior|access|home|review|upperfit|daily|community|olympic|alveare)-/,
      '',
    )
    .replace(/-\d+$/, '')
    .replace(/-/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

/**
 * Name and purpose of an asset: the asset id's entry, then the table setting,
 * then the kind; inside a home the `home` wording of either wins. Unknown
 * kinds fall back to the specification's own `name` (when it has one) or the
 * asset id in words.
 */
export function describeAsset(
  assetId: string,
  asset: Asset | undefined,
  context: { home?: boolean } = {},
): AssetDescription {
  const kind = asset?.kind ?? 'unknown',
    byId = assetEntries[assetId],
    byKind = assetCatalog[kind],
    activity = asset?.parameters?.activity,
    bySetting =
      (kind === 'activity-tabletop' || kind === 'meal-cart') &&
      typeof activity === 'string'
        ? tabletopEntries[activity]
        : undefined;
  const home = context.home ? (byId?.home ?? byKind?.home) : undefined;
  // A structural kind (a generic `box`) says nothing about a furnishing.
  const entry = byId ?? bySetting ?? (byKind?.structural ? undefined : byKind);
  if (home)
    return {
      name: home.name ?? entry?.name ?? assetIdWords(assetId),
      purpose: home.purpose,
      kind,
      catalogued: true,
    };
  if (entry)
    return { name: entry.name, purpose: entry.purpose, kind, catalogued: true };
  const own = (asset as { name?: unknown } | undefined)?.name;
  return {
    name: typeof own === 'string' && own ? own : assetIdWords(assetId),
    purpose: `Furnishing from this facility’s specification (${kind.replace(/-/g, ' ')}); its use here is not described yet.`,
    kind,
    catalogued: false,
  };
}

/**
 * Whether an object can be highlighted and inspected: everything in the
 * furniture layer, and architecture-layer items that are fittings rather
 * than building (grab bars, cupboards, a ramp), never doors, stairs or wall,
 * ceiling, exterior and roof layers.
 */
export function isInspectable(object: Instance, asset: Asset | undefined) {
  const layer = object.layer ?? 'furniture';
  if (layer === 'furniture') return !!asset;
  if (layer !== 'architecture' || !asset) return false;
  const entry = assetEntries[object.assetId] ?? assetCatalog[asset.kind];
  return !!entry && !entry.structural;
}
