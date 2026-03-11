export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x === 0n ? 1n : x;
}

export function lcm(a: bigint, b: bigint): bigint {
  const left = a < 0n ? -a : a;
  const right = b < 0n ? -b : b;
  if (left === 0n || right === 0n) {
    return 0n;
  }
  return (left / gcd(left, right)) * right;
}

export class Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: bigint, denominator: bigint = 1n) {
    if (denominator === 0n) {
      throw new Error("Rational denominator cannot be zero.");
    }

    const sign = denominator < 0n ? -1n : 1n;
    const normalizedNumerator = numerator * sign;
    const normalizedDenominator = denominator * sign;

    if (normalizedNumerator === 0n) {
      this.numerator = 0n;
      this.denominator = 1n;
      return;
    }

    const divisor = gcd(normalizedNumerator, normalizedDenominator);
    this.numerator = normalizedNumerator / divisor;
    this.denominator = normalizedDenominator / divisor;
  }

  static zero(): Rational {
    return new Rational(0n, 1n);
  }

  static one(): Rational {
    return new Rational(1n, 1n);
  }

  static fromBigInt(value: bigint): Rational {
    return new Rational(value, 1n);
  }

  static parse(input: string): Rational {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("Expected a numeric value.");
    }
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(`Invalid numeric value: ${input}`);
    }

    const negative = trimmed.startsWith("-");
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [whole, fractional = ""] = unsigned.split(".");
    const scale = 10n ** BigInt(fractional.length);
    const combined = BigInt(`${whole}${fractional}`);
    return new Rational(negative ? -combined : combined, scale);
  }

  add(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  sub(other: Rational): Rational {
    return new Rational(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  mul(other: Rational): Rational {
    return new Rational(
      this.numerator * other.numerator,
      this.denominator * other.denominator,
    );
  }

  div(other: Rational): Rational {
    if (other.numerator === 0n) {
      throw new Error("Cannot divide by zero.");
    }
    return new Rational(
      this.numerator * other.denominator,
      this.denominator * other.numerator,
    );
  }

  isZero(): boolean {
    return this.numerator === 0n;
  }

  compare(other: Rational): number {
    const left = this.numerator * other.denominator;
    const right = other.numerator * this.denominator;
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  }

  toFractionString(): string {
    if (this.denominator === 1n) {
      return this.numerator.toString();
    }
    return `${this.numerator}/${this.denominator}`;
  }

  toDecimalString(precision = 4): string {
    const sign = this.numerator < 0n ? "-" : "";
    const absNum = this.numerator < 0n ? -this.numerator : this.numerator;
    const integerPart = absNum / this.denominator;
    let remainder = absNum % this.denominator;

    if (precision === 0) {
      return `${sign}${integerPart.toString()}`;
    }

    let fractional = "";
    for (let index = 0; index < precision; index += 1) {
      remainder *= 10n;
      const digit = remainder / this.denominator;
      fractional += digit.toString();
      remainder %= this.denominator;
    }
    fractional = fractional.replace(/0+$/, "");
    return fractional
      ? `${sign}${integerPart.toString()}.${fractional}`
      : `${sign}${integerPart.toString()}`;
  }
}
