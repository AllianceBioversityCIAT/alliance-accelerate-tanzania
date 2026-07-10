import { ConsentStatus } from '@prisma/client';
import { CANONICAL_REGIONS, TRADER_TYPES } from './normalize';
import {
  CROP_COLUMN_CATALOG,
  CROP_YES_NO,
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
    expect(TEMPLATE_VERSION).toBe('v1');
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
    ]);
  });

  it('exposes the headers in the same order as the columns', () => {
    expect(TEMPLATE_HEADERS).toEqual(TEMPLATE_COLUMNS.map((c) => c.header));
    // Human-readable headers for the constrained/identity columns.
    expect(byField('traderId').header).toBe('Trader ID');
    expect(byField('cropCommonBean').header).toBe('Crop: Common bean');
    expect(byField('consentStatus').header).toBe('Consent Status');
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
});
