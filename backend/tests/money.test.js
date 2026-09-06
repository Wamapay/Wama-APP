"use strict";

const money = require("../../src/utils/money");

describe("utils/money", () => {
  it("calculates 20% cashback exactly (GH₵500 -> GH₵100), never via floating-point *", () => {
    expect(money.calculateCashback(500).toString()).toBe("100");
    expect(money.toNumber(money.calculateCashback(500))).toBe(100);
  });

  it("calculates 40% commission exactly (GH₵500 -> GH₵200)", () => {
    expect(money.calculateCommission(500).toString()).toBe("200");
    expect(money.toNumber(money.calculateCommission(500))).toBe(200);
  });

  it("rounds to 2 decimal places, half-up", () => {
    // 33.335 * 0.20 = 6.667 -> rounds to 6.67
    expect(money.calculateCashback(33.335).toString()).toBe("6.67");
  });

  it("never produces classic floating-point drift (0.1 + 0.2 style errors)", () => {
    const result = money.add("0.1", "0.2");
    expect(result.toString()).toBe("0.3");
  });

  it("isPositive rejects zero and negative amounts", () => {
    expect(money.isPositive(0)).toBe(false);
    expect(money.isPositive(-5)).toBe(false);
    expect(money.isPositive(0.01)).toBe(true);
  });

  it("equals compares money values exactly, never via native === on floats", () => {
    expect(money.equals(500, "500.00")).toBe(true);
    expect(money.equals(500, 500.01)).toBe(false);
  });

  describe("Paystack subunit conversion (Backend Stage 5)", () => {
    it("toSubunit converts GHS 500.00 -> 50000 pesewas without a ×100 float bug", () => {
      expect(money.toSubunit(500)).toBe(50000);
      expect(money.toSubunit("500.00")).toBe(50000);
      expect(money.toSubunit(19.99)).toBe(1999);
    });

    it("fromSubunit is the exact inverse of toSubunit", () => {
      expect(money.fromSubunit(50000).toString()).toBe("500");
      expect(money.fromSubunit(1999).toString()).toBe("19.99");
    });

    it("round-trips through toSubunit/fromSubunit without drift", () => {
      const original = money.toDecimal("129.50");
      const roundTripped = money.fromSubunit(money.toSubunit(original));
      expect(money.equals(original, roundTripped)).toBe(true);
    });
  });
});
