import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsentRequestFilterDto } from './consent-request-send.dto';

const fieldsOf = async (input: object) =>
  (await validate(plainToInstance(ConsentRequestFilterDto, input))).map((e) => e.property);

describe('ConsentRequestFilterDto — country', () => {
  it('accepts a country, alone or with a region of that country', async () => {
    expect(await fieldsOf({ country: 'KE' })).toEqual([]);
    expect(await fieldsOf({ country: 'KE', region: 'Mombasa' })).toEqual([]);
  });

  it('rejects an unknown country and a region of another country', async () => {
    expect(await fieldsOf({ country: 'XX' })).toEqual(['country']);
    expect(await fieldsOf({ country: 'KE', region: 'Arusha' })).toEqual(['region']);
  });
});
