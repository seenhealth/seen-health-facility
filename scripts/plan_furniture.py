"""Apply the user's latest furniture authority after the photo/architecture layers."""
from copy import deepcopy


def restore_plan_furniture(model, baseline):
    baseline_ids = {o['id'] for o in baseline['objects']}
    # These photo additions are fixed furnishings even though they were assigned
    # to the architectural presentation layer. Remove them with loose furniture
    # so restored plan counters and seating do not overlap the photo variants.
    furnishing_ids = {
        'clinic-photo-nurse-station', 'reception-quartz-desk',
        'reception-accessible-return', 'reception-mustard-bench',
        'reception-bilingual-sign', 'staff-kitchenette',
        'staff-breakfast-counter', 'admin-entry-locker-bank',
        'meeting-0-screen', 'meeting-0-video-bar',
        'meeting-1-screen', 'meeting-1-video-bar',
        'rehab-wc-east-double-vanity', 'rehab-wc-south-double-vanity',
    }
    retained = [o for o in model['objects'] if o['id'] not in baseline_ids
                and o.get('layer', 'furniture') != 'furniture'
                and o['id'] not in furnishing_ids
                and not o['id'].startswith('day-library-bay-')]
    model['objects'] = deepcopy(baseline['objects']) + retained
    for asset_id in {o['assetId'] for o in baseline['objects']}:
        model['assets'][asset_id] = deepcopy(baseline['assets'][asset_id])
    model['planningTrace']['counts'] = deepcopy(baseline['planningTrace']['counts'])
    model['planningTrace']['furnitureAuthority'] = 'Overall Planning.jpg'
    model['planningTrace']['furniturePolicy'] = 'User requested furniture restored to Overall Planning.jpg: plan asset types, dimensions, counts, positions and rotations take precedence over photographs. Photographic architectural finishes are retained.'
    model['revision'] = '2026-09-18 / plan furniture restored; complete building envelope and section views retained'
    model['levels'][1]['notes'] = 'Furniture configuration follows Overall Planning.jpg. Photographs inform architectural finishes; confirmed room locations and the complete building shell are retained.'
    model['photoSurvey']['priority'] = ['Latest user direction: furniture follows Overall Planning.jpg', 'User-confirmed room locations', 'Photographs for architectural finishes and exterior appearance', '2024 architectural PDF']
    model['photoSurvey']['userConfirmed'] = [x for x in model['photoSurvey']['userConfirmed'] if x != 'Photographed arrangement takes precedence over the plan'] + ['Furniture reverted to Overall Planning.jpg at user request']
    room_notes = {
        'day-open': 'Furniture follows Overall Planning.jpg: diamond-oriented square tables and chairs, original tree and surrounding table positions, west banquette, four lounge chairs and two small tables. Photographed landscape wall, ceiling and finishes are retained.',
        'clinic-nurse': 'Nurse-station counters and furnishings restored to the planning layout. Photographed soffit, doors and ceiling remain architectural references.',
        'lobby-arrival': 'Reception counters follow Overall Planning.jpg. Photographed moss wall, timber slats and overhead fins remain; photo-only furniture and its desk-mounted sign were removed.',
        'admin-staff-lounge': 'User-confirmed Staff Lounge 1520 beside the upstairs stair and locker corridor. Furnishings follow the plan; photo-only stools, kitchenette, breakfast counter and locker bank are not added to this configuration.',
        'east-service': 'User-confirmed administration entry and locker corridor. The current model uses plan furnishings; photographs remain available as references for the built room.',
        'admin-meeting-west': 'Meeting table and three chairs follow Overall Planning.jpg. User-confirmed yellow walls and photographed carpet/whiteboard are retained.',
        'admin-meeting-east': 'Meeting table and three chairs follow Overall Planning.jpg. User-confirmed yellow walls and photographed carpet/whiteboard are retained.',
    }
    for r in model['rooms']:
        if r['id'] in room_notes:
            r['notes'] = room_notes[r['id']]
        if r['id'] in ['rehab-wc-east', 'rehab-wc-south']:
            r['notes'] = 'User-confirmed paired multistall restrooms beside OT/rehab and the day center. Plumbing fixture positions follow Overall Planning.jpg; photographed tile, stall partitions and mirrors are retained. Gender assignment remains unconfirmed.'
    for z in model['zones']:
        if z['id'] in ['day', 'lobby', 'veranda']:
            z['notes'] = room_notes[{'day':'day-open','lobby':'lobby-arrival','veranda':'admin-staff-lounge'}[z['id']]]
        if z['id'] == 'clinic':
            z['notes'] = 'Room boundaries, furnishings and counters follow Overall Planning.jpg. Photographed doors, soffits and finishes are retained; numbered exam-room correspondence remains unconfirmed.'
    for issue in model['accuracyIssues']:
        if issue['id'] == 'furniture-schedule':
            issue.update(title='Plan furniture configuration and estimated dimensions', detail='All plan furniture instances and their asset definitions have been restored from the saved Overall Planning trace. Counts, centers, rotations and symbol footprints match that trace. The image-derived scale and furniture dimensions are not surveyed or manufacturer-certified.', pages=[92])
    for source in model['referencePages']:
        if source['evidenceType'] == 'facility-photograph' and source['page'] < 109:
            source['findings'] = 'Photographic reference only for furniture; the active furniture arrangement follows Overall Planning.jpg. ' + source['findings']
