import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  ValidationArguments,
  registerDecorator,
} from 'class-validator';
import { TRADER_TYPES } from './normalize';

/** Fails when the array contains the object's own `traderType` (skipped if that is unset). */
function NotMainTraderType() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'notMainTraderType',
      target: object.constructor,
      propertyName,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const main = (args.object as Record<string, unknown>).traderType;
          return !(Array.isArray(value) && typeof main === 'string' && value.includes(main));
        },
        defaultMessage: () => 'additionalTraderTypes must not contain the main traderType',
      },
    });
  };
}

/** Optional additional actor types: unique taxonomy members, never the main type. */
export function IsAdditionalTraderTypes() {
  return applyDecorators(
    IsOptional(),
    IsArray(),
    ArrayUnique(),
    ArrayMaxSize(TRADER_TYPES.length - 1),
    IsIn(TRADER_TYPES as readonly string[], { each: true }),
    NotMainTraderType(),
  );
}
