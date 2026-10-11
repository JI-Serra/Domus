import { describe, expect, it } from 'vitest';
import {
  classifyPlate,
  formatJoinCodeInput,
  formatPlate,
  isPetPhotoPathOf,
  isResidentCurrent,
  joinRequestFormSchema,
  memberDetailsSchema,
  memberFormSchema,
  memberInvitationSchema,
  petFormSchema,
  petPhotoPath,
  petPhotoProblem,
  residentStanding,
  togglePermission,
  vehicleFormSchema,
} from './index';

const NOW = new Date('2026-10-10T12:00:00Z');
const TENANT = '10000000-0000-0000-0000-000000000001';
const UNIT = 'a1000000-0000-0000-0000-000000000001';

const resident = (overrides = {}) => ({
  person_id: 'p1',
  unit_resident_is_holder: false,
  unit_resident_is_minor: false,
  unit_resident_valid_from_at: '2026-01-01T00:00:00Z',
  unit_resident_valid_to_at: null,
  ...overrides,
});

describe('togglePermission', () => {
  it('adds and removes a permission keeping the canonical order', () => {
    expect(
      togglePermission(
        ['manage_access_authorizations'],
        'view_unit_finance',
        true,
      ),
    ).toEqual(['view_unit_finance', 'manage_access_authorizations']);
    expect(
      togglePermission(
        ['view_unit_finance', 'manage_access_authorizations'],
        'manage_access_authorizations',
        false,
      ),
    ).toEqual(['view_unit_finance']);
  });

  it('is idempotent', () => {
    expect(togglePermission([], 'book_amenities', true)).toEqual([
      'book_amenities',
    ]);
    expect(
      togglePermission(['book_amenities'], 'book_amenities', true),
    ).toEqual(['book_amenities']);
    expect(togglePermission([], 'book_amenities', false)).toEqual([]);
  });
});

describe('isResidentCurrent', () => {
  it('uses the half-open window [from, to)', () => {
    expect(isResidentCurrent(resident(), NOW)).toBe(true);
    expect(
      isResidentCurrent(
        resident({ unit_resident_valid_from_at: '2026-11-01T00:00:00Z' }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isResidentCurrent(
        resident({ unit_resident_valid_to_at: '2026-10-10T12:00:00Z' }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isResidentCurrent(
        resident({ unit_resident_valid_to_at: '2026-10-11T00:00:00Z' }),
        NOW,
      ),
    ).toBe(true);
  });

  it('treats unreadable dates as not current', () => {
    expect(
      isResidentCurrent(resident({ unit_resident_valid_from_at: 'x' }), NOW),
    ).toBe(false);
    expect(
      isResidentCurrent(resident({ unit_resident_valid_to_at: 'x' }), NOW),
    ).toBe(false);
  });
});

describe('residentStanding', () => {
  const membership = (overrides = {}) => ({
    person_id: 'p1',
    membership_role: 'household_member',
    membership_status: 'active',
    membership_valid_from: '2026-01-01T00:00:00Z',
    membership_valid_to: null,
    ...overrides,
  });
  const invitation = (overrides = {}) => ({
    person_id: 'p1',
    invitation_status: 'pending',
    invitation_expires_at: '2026-10-12T00:00:00Z',
    ...overrides,
  });

  it('ranks holder first, then minor', () => {
    expect(
      residentStanding(
        resident({ unit_resident_is_holder: true }),
        [membership()],
        [],
        NOW,
      ),
    ).toBe('holder');
    expect(
      residentStanding(
        resident({ unit_resident_is_minor: true }),
        [membership()],
        [],
        NOW,
      ),
    ).toBe('minor');
    expect(
      residentStanding(
        resident({ person_birth_date: '2015-01-01' }),
        [],
        [],
        NOW,
      ),
    ).toBe('minor');
  });

  it('recognises an active account, a live invitation, or neither', () => {
    expect(residentStanding(resident(), [membership()], [], NOW)).toBe(
      'member',
    );
    expect(
      residentStanding(
        resident(),
        [membership({ membership_valid_to: '2026-10-10T12:00:00Z' })],
        [],
        NOW,
      ),
    ).toBe('former');
    expect(
      residentStanding(
        resident(),
        [membership({ membership_status: 'revoked' })],
        [invitation()],
        NOW,
      ),
    ).toBe('invited');
    expect(
      residentStanding(
        resident(),
        [membership({ person_id: 'other' })],
        [invitation({ invitation_expires_at: '2026-10-09T00:00:00Z' })],
        NOW,
      ),
    ).toBe('unregistered');
    expect(
      residentStanding(
        resident(),
        [],
        [invitation({ invitation_status: 'revoked' })],
        NOW,
      ),
    ).toBe('unregistered');
  });

  it('marks a person whose account was ended as former, not as somebody to invite or edit', () => {
    expect(
      residentStanding(
        resident(),
        [membership({ membership_status: 'revoked' })],
        [],
        NOW,
      ),
    ).toBe('former');
    expect(
      residentStanding(
        resident(),
        [membership({ membership_valid_to: '2026-10-10T12:00:00Z' })],
        [],
        NOW,
      ),
    ).toBe('former');
    // A membership of another person or role does not count.
    expect(
      residentStanding(
        resident(),
        [membership({ membership_role: 'unit_holder' })],
        [],
        NOW,
      ),
    ).toBe('unregistered');
  });

  it('counts a membership with a future end as active and ignores one that has not started', () => {
    expect(
      residentStanding(
        resident(),
        [membership({ membership_valid_to: '2027-01-01T00:00:00Z' })],
        [],
        NOW,
      ),
    ).toBe('member');
    expect(
      residentStanding(
        resident(),
        [membership({ membership_valid_from: '2026-11-01T00:00:00Z' })],
        [],
        NOW,
      ),
    ).toBe('unregistered');
  });
});

describe('plates', () => {
  it('classifies the four Argentine formats and nothing else', () => {
    expect(classifyPlate('ab 123 cd')).toBe('car_mercosur');
    expect(classifyPlate('ABC-123')).toBe('car_legacy');
    expect(classifyPlate('A123BCD')).toBe('motorcycle_mercosur');
    expect(classifyPlate('123abc')).toBe('motorcycle_legacy');
    expect(classifyPlate('XYZ12345')).toBeNull();
  });

  it('writes known formats with spaces and keeps the rest normalized', () => {
    expect(formatPlate('ab123cd')).toBe('AB 123 CD');
    expect(formatPlate('abc-123')).toBe('ABC 123');
    expect(formatPlate('a123bcd')).toBe('A 123 BCD');
    expect(formatPlate('xyz-12345')).toBe('XYZ12345');
  });
});

describe('formatJoinCodeInput', () => {
  it('groups pasted codes 4-4-4 whatever the separators or case', () => {
    expect(formatJoinCodeInput('abcdefghjkmn')).toBe('ABCD-EFGH-JKMN');
    expect(formatJoinCodeInput(' abcd efgh jkmn ')).toBe('ABCD-EFGH-JKMN');
    expect(formatJoinCodeInput('ABCD-EFGH-JKMN')).toBe('ABCD-EFGH-JKMN');
  });

  it('works while typing and caps at twelve characters', () => {
    expect(formatJoinCodeInput('')).toBe('');
    expect(formatJoinCodeInput('abc')).toBe('ABC');
    expect(formatJoinCodeInput('abcde')).toBe('ABCD-E');
    expect(formatJoinCodeInput('abcdefghjkmnpqrs')).toBe('ABCD-EFGH-JKMN');
  });
});

describe('member forms', () => {
  const adult = {
    person_first_name: ' Ana ',
    person_last_name: 'Pérez',
    person_email: ' ANA@Example.com ',
    person_phone: '',
    person_birth_date: '',
    unit_resident_relationship: 'family',
  };

  it('normalizes an adult member and requires the email', () => {
    const parsed = memberFormSchema.parse(adult);
    expect(parsed).toMatchObject({
      person_first_name: 'Ana',
      person_email: 'ana@example.com',
      person_phone: null,
      person_birth_date: null,
      is_minor: false,
    });
    const missing = memberFormSchema.safeParse({ ...adult, person_email: '' });
    expect(missing.error?.issues[0]).toMatchObject({
      path: ['person_email'],
      message: 'emailRequired',
    });
  });

  it('registers a minor without email', () => {
    expect(
      memberFormSchema.safeParse({ ...adult, person_email: '', is_minor: true })
        .success,
    ).toBe(true);
  });

  it('rejects bad names, emails, dates and relationships with message keys', () => {
    const issues = (value: unknown) =>
      memberFormSchema.safeParse(value).error?.issues.map((i) => i.message);
    expect(issues({ ...adult, person_first_name: ' ' })).toContain(
      'firstNameRequired',
    );
    expect(issues({ ...adult, person_last_name: '' })).toContain(
      'lastNameRequired',
    );
    expect(issues({ ...adult, person_first_name: 'x'.repeat(101) })).toContain(
      'nameTooLong',
    );
    expect(issues({ ...adult, person_email: 'nope' })).toContain(
      'emailInvalid',
    );
    expect(issues({ ...adult, person_birth_date: '31/12/2000' })).toContain(
      'birthDateInvalid',
    );
    expect(issues({ ...adult, unit_resident_relationship: 'boss' })).toContain(
      'relationshipInvalid',
    );
    expect(issues({ ...adult, person_phone: '1'.repeat(33) })).toContain(
      'phoneInvalid',
    );
  });

  it('keeps the email optional when editing', () => {
    expect(
      memberDetailsSchema.parse({ ...adult, person_email: '' }).person_email,
    ).toBeNull();
  });

  it('validates the invitation address', () => {
    expect(
      memberInvitationSchema.parse({ person_email: ' A@B.co ' }).person_email,
    ).toBe('a@b.co');
    expect(
      memberInvitationSchema.safeParse({ person_email: '' }).error?.issues[0]
        ?.message,
    ).toBe('emailRequired');
    expect(
      memberInvitationSchema.safeParse({ person_email: 'x' }).error?.issues[0]
        ?.message,
    ).toBe('emailInvalid');
  });
});

describe('vehicle and pet forms', () => {
  it('normalizes the plate and accepts 3-12 letters or digits', () => {
    expect(
      vehicleFormSchema.parse({
        vehicle_plate_code: 'ab 123 cd',
        vehicle_make_name: ' Fiat ',
        vehicle_model_name: '',
        vehicle_color_name: '',
      }),
    ).toMatchObject({
      vehicle_plate_code: 'AB123CD',
      vehicle_make_name: 'Fiat',
      vehicle_model_name: null,
    });
    expect(
      vehicleFormSchema.safeParse({ vehicle_plate_code: 'A-' }).error?.issues[0]
        ?.message,
    ).toBe('plateInvalid');
    expect(
      vehicleFormSchema.safeParse({ vehicle_plate_code: 'A'.repeat(13) })
        .success,
    ).toBe(false);
  });

  it('requires a name and a species for pets', () => {
    expect(
      petFormSchema.parse({
        pet_name: ' Luna ',
        pet_species_name: 'Perro',
        pet_breed_name: '',
      }),
    ).toMatchObject({ pet_name: 'Luna', pet_breed_name: null });
    const issues = petFormSchema
      .safeParse({ pet_name: '', pet_species_name: '' })
      .error?.issues.map((issue) => issue.message);
    expect(issues).toEqual(['petNameRequired', 'petSpeciesRequired']);
  });
});

describe('pet photos', () => {
  it('accepts PNG, JPEG and WebP up to 2 MiB', () => {
    expect(petPhotoProblem({ type: 'image/png', size: 100 })).toBeNull();
    expect(
      petPhotoProblem({ type: 'image/webp', size: 2 * 1024 * 1024 }),
    ).toBeNull();
    expect(petPhotoProblem({ type: 'image/gif', size: 100 })).toBe('photoType');
    expect(
      petPhotoProblem({ type: 'image/jpeg', size: 2 * 1024 * 1024 + 1 }),
    ).toBe('photoSize');
  });

  it('builds and recognises paths inside the unit folder only', () => {
    const id = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
    const path = petPhotoPath(TENANT, UNIT, id, 'image/jpeg');
    expect(path).toBe(`${TENANT}/${UNIT}/${id}.jpg`);
    expect(isPetPhotoPathOf(path, TENANT, UNIT)).toBe(true);
    expect(isPetPhotoPathOf(path, TENANT, 'other')).toBe(false);
    expect(isPetPhotoPathOf(`${TENANT}/${UNIT}/../x.png`, TENANT, UNIT)).toBe(
      false,
    );
    expect(isPetPhotoPathOf(`${TENANT}/${UNIT}/${id}.exe`, TENANT, UNIT)).toBe(
      false,
    );
  });
});

describe('joinRequestFormSchema', () => {
  const base = {
    join_code: 'abcd-efgh-jkmn',
    person_first_name: 'Ana',
    person_last_name: 'Pérez',
    person_document_type: '',
    person_document_number: '',
  };

  it('normalizes the code and leaves the document out when empty', () => {
    expect(joinRequestFormSchema.parse(base)).toMatchObject({
      join_code: 'ABCDEFGHJKMN',
      person_document_type: null,
      person_document_number: null,
    });
  });

  it('uses one key for every unusable code', () => {
    for (const join_code of ['', 'ABC', 'ABCD-EFGH-JKM0', 'ABCD-EFGH-JKMN-X']) {
      expect(
        joinRequestFormSchema.safeParse({ ...base, join_code }).error?.issues[0]
          ?.message,
      ).toBe('codeUnavailable');
    }
  });

  it('needs the document type and number together', () => {
    const incompleteNumber = joinRequestFormSchema.safeParse({
      ...base,
      person_document_type: 'dni',
    });
    expect(incompleteNumber.error?.issues[0]).toMatchObject({
      path: ['person_document_number'],
      message: 'documentIncomplete',
    });
    const incompleteType = joinRequestFormSchema.safeParse({
      ...base,
      person_document_number: '123',
    });
    expect(incompleteType.error?.issues[0]).toMatchObject({
      path: ['person_document_type'],
    });
    expect(
      joinRequestFormSchema.safeParse({
        ...base,
        person_document_type: 'dni',
        person_document_number: '12345678',
      }).success,
    ).toBe(true);
  });
});
