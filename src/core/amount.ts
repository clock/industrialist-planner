import { Rational } from "./rational";
import { RecipeAmount, RecipeDuration } from "./types";

function parseDecimalish(value: string | bigint): Rational {
  if (typeof value === "bigint") {
    return Rational.fromBigInt(value);
  }

  return Rational.parse(value.trim());
}

function formatDecimalish(value: string | bigint): string {
  return typeof value === "bigint" ? value.toString() : value.trim();
}

export function parseRecipeAmount(amount: RecipeAmount): Rational {
  return parseDecimalish(amount);
}

export function formatRecipeAmount(amount: RecipeAmount): string {
  return formatDecimalish(amount);
}

export function parseRecipeDuration(duration: RecipeDuration): Rational {
  return parseDecimalish(duration);
}

export function formatRecipeDuration(duration: RecipeDuration): string {
  return formatDecimalish(duration);
}
