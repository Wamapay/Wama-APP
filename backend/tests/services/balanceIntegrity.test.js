"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const walletService = require("../../src/services/wallet.service");
const adminFinanceService = require("../../src/services/adminFinance.service");

describe("wallet.service.getBalances", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the three balances plus their sum as the available withdrawal balance", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      cashbackBalance: "100.50",
      commissionBalance: "200.25",
      rewardBalance: "50",
    });

    const balances = await walletService.getBalances("user_1");

    expect(balances).toEqual({
      cashbackBalance: 100.5,
      commissionBalance: 200.25,
      rewardBalance: 50,
      availableWithdrawalBalance: 350.75,
    });
  });

  it("404s for an unknown user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(walletService.getBalances("nobody")).rejects.toMatchObject({ statusCode: 404 });
  });
});

// Platform rule "Balance Integrity Test": stored balances must correspond
// to valid ledger activity (credits - debits per balance type).
describe("adminFinance.service.reconcileUserBalances", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reports consistent when the stored balance matches ledger credits minus debits", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      cashbackBalance: "50",
      commissionBalance: "0",
      rewardBalance: "0",
    });
    // CASHBACK: 100 credited, 50 withdrawn -> ledger balance 50 (matches stored)
    mockPrisma.transaction.aggregate.mockImplementation(({ where }) => {
      if (where.type && where.type.in) {
        // credits query (CASHBACK/COMMISSION/REWARD/WITHDRAWAL_REVERSAL)
        return Promise.resolve({ _sum: { amount: where.balanceType === "CASHBACK" ? 100 : 0 } });
      }
      // debits query (WITHDRAWAL)
      return Promise.resolve({ _sum: { amount: where.balanceType === "CASHBACK" ? 50 : 0 } });
    });

    const result = await adminFinanceService.reconcileUserBalances("user_1");

    expect(result.balances.CASHBACK).toEqual({
      storedBalance: 50,
      ledgerBalance: 50,
      discrepancy: 0,
      consistent: true,
    });
  });

  it("flags a discrepancy instead of silently correcting it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      cashbackBalance: "999", // stored value doesn't match the ledger
      commissionBalance: "0",
      rewardBalance: "0",
    });
    mockPrisma.transaction.aggregate.mockImplementation(({ where }) => {
      if (where.type && where.type.in) {
        return Promise.resolve({ _sum: { amount: where.balanceType === "CASHBACK" ? 100 : 0 } });
      }
      return Promise.resolve({ _sum: { amount: 0 } });
    });

    const result = await adminFinanceService.reconcileUserBalances("user_1");

    expect(result.balances.CASHBACK.consistent).toBe(false);
    expect(result.balances.CASHBACK.discrepancy).toBeCloseTo(899);
    // Reconciliation is diagnostic only — it must never mutate the balance.
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
