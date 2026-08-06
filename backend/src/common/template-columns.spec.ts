import { ConsentMethod, ConsentStatus, RegistrationSource } from '@prisma/client';
import { CANONICAL_REGIONS, TRADER_TYPES } from './normalize';
import {
  CONSENT_METHOD_VALUES,
  CROP_COLUMN_CATALOG,
  CROP_YES_NO,
  REGISTRATION_SOURCE_VALUES,
  SEX_VALUES,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  TEMPLATE_VERSION,
  TemplateColumn,
} from './template-columns';

/**
 * T-2 — Pins the import template's single source of truth so the generator
 * (T-3) and parser (T-5) share a contract that cannot silently drift (NFR-8).
 */
describe('template-columns', () => {
  const byField = (field: string): TemplateColumn => {
    const col = TEMPLATE_COLUMNS.find((c) => c.field === field);
    expect(col).toBeDefined();
    return col as TemplateColumn;
  };

  it('exports the template version stamp', () => {
    expect(TEMPLATE_VERSION).toBe('v2');
  });

  it('lists columns in the exact field-staff order', () => {
    expect(TEMPLATE_COLUMNS.map((c) => c.field)).toEqual([
      'traderId',
      'traderName',
      'traderType',
      'region',
      'district',
      'marketLocation',
      'sex',
      'position',
      'capacityTons',
      'technicalSupport',
      'phone',
      'email',
      'gpsLatitude',
      'gpsLongitude',
      'gpsAltitude',
      'gpsAccuracy',
      'cropSorghum',
      'cropCommonBean',
      'cropGroundnut',
      'consentStatus',
      'registrationSource',
      'consentMethod',
      'consentObtainedAt',
      'consentReference',
    ]);
  });

  it('exposes the headers in the same order as the columns', () => {
    expect(TEMPLATE_HEADERS).toEqual(TEMPLATE_COLUMNS.map((c) => c.header));
    // Human-readable headers for the constrained/identity columns.
    expect(byField('traderId').header).toBe('Trader ID');
    expect(byField('cropCommonBean').header).toBe('Crop: Common bean');
    expect(byField('consentStatus').header).toBe('Consent Status');
    expect(byField('registrationSource').header).toBe('Registration Source');
    expect(byField('consentMethod').header).toBe('Consent Method');
    expect(byField('consentObtainedAt').header).toBe('Consent Obtained At');
    expect(byField('consentReference').header).toBe('Consent Reference');
  });

  it('marks exactly the ActorCreateDto-required fields as required', () => {
    const required = TEMPLATE_COLUMNS.filter((c) => c.required).map(
      (c) => c.field,
    );
    expect(required).toEqual([
      'traderId',
      'traderName',
      'traderType',
      'region',
    ]);
  });

  it('enforces region allowed values equal to the canonical regions', () => {
    expect(byField('region').allowedValues).toEqual([...CANONICAL_REGIONS]);
  });

  it('enforces trader-type allowed values equal to the canonical taxonomy', () => {
    expect(byField('traderType').allowedValues).toEqual([...TRADER_TYPES]);
  });

  it('uses the M/F/Other sex values', () => {
    expect(byField('sex').allowedValues).toEqual([...SEX_VALUES]);
    expect(SEX_VALUES).toEqual(['M', 'F', 'Other']);
  });

  it('defines the three crop columns as optional YES/NO', () => {
    for (const field of ['cropSorghum', 'cropCommonBean', 'cropGroundnut']) {
      const col = byField(field);
      expect(col.required).toBe(false);
      expect(col.allowedValues).toEqual([...CROP_YES_NO]);
      expect(col.allowedValues).toEqual(['YES', 'NO']);
    }
  });

  it('maps each crop column field to its canonical crop name', () => {
    expect(CROP_COLUMN_CATALOG).toEqual({
      cropSorghum: 'sorghum',
      cropCommonBean: 'common_bean',
      cropGroundnut: 'groundnut',
    });
    // Every crop-catalog key is a real, YES/NO template column.
    for (const field of Object.keys(CROP_COLUMN_CATALOG)) {
      expect(byField(field).allowedValues).toEqual(['YES', 'NO']);
    }
  });

  it('enforces consent allowed values equal to the Prisma ConsentStatus enum', () => {
    expect(byField('consentStatus').allowedValues).toEqual(
      Object.values(ConsentStatus),
    );
    expect(byField('consentStatus').required).toBe(false);
  });

  it('provides format hints for the numeric/GPS/phone/email columns', () => {
    for (const field of [
      'capacityTons',
      'phone',
      'email',
      'gpsLatitude',
      'gpsLongitude',
      'gpsAltitude',
      'gpsAccuracy',
    ]) {
      expect(byField(field).format).toBeTruthy();
    }
  });

  // T-6 — the four new columns (FR-1, FR-2, FR-5, NFR-3).

  it('enforces registration-source allowed values equal to the Prisma RegistrationSource enum', () => {
    expect(REGISTRATION_SOURCE_VALUES).toEqual(Object.values(RegistrationSource));
    expect(byField('registrationSource').allowedValues).toEqual(
      REGISTRATION_SOURCE_VALUES,
    );
    expect(byField('registrationSource').required).toBe(false);
  });

  it('enforces consent-method allowed values equal to the Prisma ConsentMethod enum', () => {
    expect(CONSENT_METHOD_VALUES).toEqual(Object.values(ConsentMethod));
    expect(byField('consentMethod').allowedValues).toEqual(CONSENT_METHOD_VALUES);
    expect(byField('consentMethod').required).toBe(false);
    // PORTAL_CHECKBOX is listed even though this spec never writes it (design.md §2).
    expect(CONSENT_METHOD_VALUES).toContain('PORTAL_CHECKBOX');
  });

  it('provides format hints for the free-text/date provenance columns', () => {
    expect(byField('consentObtainedAt').format).toBeTruthy();
    expect(byField('consentObtainedAt').allowedValues).toBeUndefined();
    expect(byField('consentReference').format).toBeTruthy();
    expect(byField('consentReference').allowedValues).toBeUndefined();
    expect(byField('consentReference').required).toBe(false);
  });
});
