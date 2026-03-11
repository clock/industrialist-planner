import { describe, expect, it } from "vitest";
import { gcd, lcm, Rational } from "../src/core/rational";

describe("rational helpers", () => {
  it("reduces fractions and supports arithmetic", () => {
    const ratio = new Rational(2n, 4n);
    expect(ratio.toFractionString()).toBe("1/2");
    expect(ratio.add(new Rational(1n, 3n)).toFractionString()).toBe("5/6");
    expect(ratio.mul(new Rational(3n, 1n)).toFractionString()).toBe("3/2");
  });

  it("parses decimal input exactly", () => {
    const value = Rational.parse("1.25");
    expect(value.toFractionString()).toBe("5/4");
    expect(value.toDecimalString(3)).toBe("1.25");
  });

  it("computes gcd and lcm", () => {
    expect(gcd(10n, 15n)).toBe(5n);
    expect(lcm(4n, 10n)).toBe(20n);
  });
});
