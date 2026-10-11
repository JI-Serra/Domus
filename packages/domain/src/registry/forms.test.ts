import { describe, expect, it } from 'vitest';
import {
  billableFromChoice,
  billableToChoice,
  devicePairingSchema,
  formatCountdown,
  formatJoinCode,
  gateFormSchema,
  guardInvitationSchema,
  initialHolderSchema,
  petFormSchema,
  residentFormSchema,
  residentInvitationSchema,
  secondsUntil,
  unitFormSchema,
  unitListFilterSchema,
  vehicleFormSchema,
} from './forms';

const unit = {
  unit_code: ' Mz 1 Lote 2 ',
  unit_block_code: '1',
  unit_lot_number: '',
  unit_status: 'vacant',
  unit_coefficient: '1,5',
  unit_is_billable: 'inherit',
  unit_contact_phone: '',
  unit_backup_phone: ' +54 381 555 0101 ',
};
const person = {
  person_first_name: 'Ana',
  person_last_name: 'Gómez',
  person_document_type: 'dni',
  person_document_number: '30123456',
  person_email: ' ANA@Ejemplo.com ',
  person_phone: '',
  person_birth_date: '',
};

const messagesOf = (result: {
  error?: { issues: { message: string }[] };
}): string[] => result.error?.issues.map((issue) => issue.message) ?? [];

describe('unit form', () => {
  it('normalizes text, decimal comma and billing choice', () => {
    expect(unitFormSchema.parse(unit)).toMatchObject({
      unit_code: 'Mz 1 Lote 2',
      unit_lot_number: null,
      unit_coefficient: 1.5,
      unit_is_billable: null,
      unit_contact_phone: null,
      unit_backup_phone: '+54 381 555 0101',
    });
  });

  it('defaults an empty coefficient to 1 and maps explicit billing', () => {
    expect(
      unitFormSchema.parse({
        ...unit,
        unit_coefficient: '',
        unit_is_billable: 'yes',
      }),
    ).toMatchObject({ unit_coefficient: 1, unit_is_billable: true });
    expect(
      unitFormSchema.parse({ ...unit, unit_is_billable: 'no' })
        .unit_is_billable,
    ).toBe(false);
  });

  it('returns message keys for each problem', () => {
    const result = unitFormSchema.safeParse({
      ...unit,
      unit_code: '',
      unit_status: 'x',
      unit_coefficient: '-2',
      unit_is_billable: 'maybe',
      unit_backup_phone: 'x'.repeat(40),
    });
    expect(result.success).toBe(false);
    const byField = Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [
        issue.path[0],
        issue.message,
      ]),
    );
    expect(byField).toEqual({
      unit_code: 'unitCodeRequired',
      unit_status: 'statusInvalid',
      unit_coefficient: 'coefficientInvalid',
      unit_is_billable: 'billableInvalid',
      unit_backup_phone: 'phoneInvalid',
    });
    expect(
      unitFormSchema.safeParse({ ...unit, unit_coefficient: 'abc' }).success,
    ).toBe(false);
  });

  it('round-trips the billing choice', () => {
    expect(billableToChoice(null)).toBe('inherit');
    expect(billableToChoice(true)).toBe('yes');
    expect(billableToChoice(false)).toBe('no');
    expect(billableFromChoice('inherit')).toBeNull();
  });
});

describe('resident forms', () => {
  const resident = {
    ...person,
    unit_resident_relationship: 'owner',
    unit_resident_is_holder: 'on',
  };

  it('accepts an adult holder and normalizes the email', () => {
    expect(residentFormSchema.parse(resident)).toMatchObject({
      person_email: 'ana@ejemplo.com',
      person_phone: null,
      person_birth_date: null,
      unit_resident_is_holder: true,
      unit_resident_is_minor: false,
    });
  });

  it('rejects a holder who is a minor and requires an identity', () => {
    expect(
      messagesOf(
        residentFormSchema.safeParse({
          ...resident,
          unit_resident_is_minor: 'on',
        }),
      ),
    ).toContain('holderMinor');
    expect(
      messagesOf(
        residentFormSchema.safeParse({
          ...resident,
          person_email: '',
          person_document_type: '',
          person_document_number: '',
        }),
      ),
    ).toContain('identityRequired');
  });

  it('requires the document type and number together', () => {
    expect(
      messagesOf(
        residentFormSchema.safeParse({ ...resident, person_document_type: '' }),
      ),
    ).toContain('documentInvalid');
    expect(
      residentFormSchema.safeParse({
        ...resident,
        person_document_type: 'cuit',
      }).success,
    ).toBe(false);
  });

  it('validates birth date and email shape', () => {
    const messages = messagesOf(
      residentFormSchema.safeParse({
        ...resident,
        person_birth_date: '12/04/1985',
        person_email: 'no-es-email',
      }),
    );
    expect(messages).toContain('birthDateInvalid');
    expect(messages).toContain('emailInvalid');
  });

  it('asks the initial holder for an identity too', () => {
    expect(initialHolderSchema.safeParse(person).success).toBe(true);
    expect(
      messagesOf(
        initialHolderSchema.safeParse({
          ...person,
          person_email: '',
          person_document_type: '',
          person_document_number: '',
        }),
      ),
    ).toEqual(['identityRequired']);
    expect(
      initialHolderSchema.safeParse({ ...person, person_document_number: '' })
        .success,
    ).toBe(false);
  });
});

describe('vehicle, pet, gate and invitation forms', () => {
  it('normalizes plates', () => {
    expect(
      vehicleFormSchema.parse({
        vehicle_plate_code: 'ab 123-cd',
        vehicle_make_name: '',
        vehicle_model_name: 'Gol',
        vehicle_color_name: '',
      }),
    ).toMatchObject({ vehicle_plate_code: 'AB123CD', vehicle_make_name: null });
    expect(
      messagesOf(
        vehicleFormSchema.safeParse({
          vehicle_plate_code: '--',
          vehicle_make_name: '',
          vehicle_model_name: '',
          vehicle_color_name: '',
        }),
      ),
    ).toEqual(['plateInvalid']);
  });

  it('requires a pet name and species', () => {
    expect(
      messagesOf(
        petFormSchema.safeParse({
          pet_name: '',
          pet_species_name: '',
          pet_breed_name: '',
        }),
      ),
    ).toEqual(['petNameRequired', 'petSpeciesRequired']);
  });

  it('validates gates, with the active flag from a checkbox', () => {
    expect(
      gateFormSchema.parse({
        gate_name: ' Acceso 2 ',
        gate_kind: 'pedestrian',
        gate_is_active: 'on',
      }),
    ).toEqual({
      gate_name: 'Acceso 2',
      gate_kind: 'pedestrian',
      gate_is_active: true,
    });
    expect(
      gateFormSchema.parse({ gate_name: 'A', gate_kind: 'vehicular' })
        .gate_is_active,
    ).toBe(false);
    expect(
      gateFormSchema.safeParse({ gate_name: '', gate_kind: 'x' }).success,
    ).toBe(false);
  });

  it('validates resident and guard invitations', () => {
    expect(
      residentInvitationSchema.parse({
        invited_email: ' Ana@Ejemplo.com ',
        target_role: 'household_member',
        mode: 'link',
      }),
    ).toEqual({
      invited_email: 'ana@ejemplo.com',
      target_role: 'household_member',
      mode: 'link',
    });
    expect(
      messagesOf(
        residentInvitationSchema.safeParse({
          invited_email: '',
          target_role: 'guard',
          mode: 'sms',
        }),
      ),
    ).toEqual(['emailRequired', 'roleInvalid', 'modeInvalid']);
    expect(
      messagesOf(
        guardInvitationSchema.safeParse({
          invited_email: 'g@ejemplo.com',
          first_name: 'G',
          last_name: '',
        }),
      ),
    ).toEqual(['lastNameRequired']);
  });

  it('cleans a pairing code', () => {
    expect(
      devicePairingSchema.parse({
        device_name: ' Tablet 1 ',
        pairing_code: 'ABCD-ef01 2345-6789 abcd-ef01 2345-6789',
      }),
    ).toEqual({
      device_name: 'Tablet 1',
      pairing_code: 'abcdef0123456789abcdef0123456789',
    });
    expect(
      messagesOf(
        devicePairingSchema.safeParse({ device_name: '', pairing_code: 'abc' }),
      ),
    ).toEqual(['deviceNameRequired', 'pairingCodeInvalid']);
  });
});

describe('list filters and display helpers', () => {
  it('falls back to safe defaults for bad query strings', () => {
    expect(
      unitListFilterSchema.parse({
        q: ' mz 1 ',
        status: 'bogus',
        billable: 'maybe',
        page: '-3',
      }),
    ).toEqual({
      q: 'mz 1',
      status: undefined,
      billable: undefined,
      block: '',
      archived: undefined,
      page: 1,
    });
    expect(
      unitListFilterSchema.parse({
        status: 'occupied',
        billable: 'yes',
        block: '2',
        archived: 'yes',
        page: '3',
      }),
    ).toMatchObject({ status: 'occupied', billable: 'yes', page: 3 });
  });

  it('groups join codes by four', () => {
    expect(formatJoinCode('abcdefghjklm')).toBe('ABCD-EFGH-JKLM');
    expect(formatJoinCode('ABCD EFGH-JK')).toBe('ABCD-EFGH-JK');
    expect(formatJoinCode('')).toBe('');
  });

  it('counts down without going negative', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(secondsUntil('2026-10-10T12:10:00Z', now)).toBe(600);
    expect(secondsUntil(new Date('2026-10-10T12:00:00.400Z'), now)).toBe(1);
    expect(secondsUntil('2026-10-10T11:00:00Z', now)).toBe(0);
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(65.9)).toBe('1:05');
    expect(formatCountdown(-4)).toBe('0:00');
  });
});
