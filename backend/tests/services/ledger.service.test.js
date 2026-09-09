"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

// ledger.service.js is transaction-client-agnostic — it takes `tx` as a
// parameter, so a plain mock stands in for an interactive Prisma
// transaction client here.
const tx = createPrismaMock();

const ledger = require("../../src/services/ledger.service");

describe("ledger.service.recordTransaction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a transaction with a human-readable, date-stamped ID and applies the balance delta", async () => {
    tx.transaction.findFirst.mockResolvedValue(null);
    tx.transaction.count.mockResolvedValue(0);
    tx.transaction.create.mockImplementation(({ data }) => Promise.resolve({ id: "txn_1", ...data }));
    tx.user.update.mockResolvedValue({});

    const { transaction, created } = await ledger.recordTransaction(tx, {
      userId: "user_1",
      type: "CASHBACK",
      amount: 100,
      balanceType: "CASHBACK",
      referenceType: "ORDER",
      referenceId: "order_1",
      applyBalance: true,
    });

    expect(created).toBe(true);
    expect(transaction.transactionId).toMatch(/^TXN-\d{8}-\d{6}$/);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { cashbackBalance: { increment: expect.anything() } },
    });
  });

  it("is idempotent for the same (type, referenceId): a second call returns the existing row and never re-applies the balance", async () => {
    const existing = { id: "txn_1", transactionId: "TXN-20260822-000001", type: "CASHBACK", referenceId: "order_1" };
    tx.transaction.findFirst.mockResolvedValue(existing);

    const { transaction, created } = await ledger.recordTransaction(tx, {
      userId: "user_1",
      type: "CASHBACK",
      amount: 100,
      balanceType: "CASHBACK",
      referenceType: "ORDER",
      referenceId: "order_1",
      applyBalance: true,
    });

    expect(created).toBe(false);
    expect(transaction).toBe(existing);
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("never touches a balance when balanceType is null (e.g. COURSE_PURCHASE)", async () => {
    tx.transaction.findFirst.mockResolvedValue(null);
    tx.transaction.count.mockResolvedValue(0);
    tx.transaction.create.mockImplementation(({ data }) => Promise.resolve({ id: "txn_2", ...data }));

    await ledger.recordTransaction(tx, {
      userId: "user_1",
      type: "COURSE_PURCHASE",
      amount: 500,
      referenceType: "ORDER",
      referenceId: "order_1",
      applyBalance: false,
    });

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("does not apply a balance delta for a non-SUCCESSFUL transaction", async () => {
    tx.transaction.findFirst.mockResolvedValue(null);
    tx.transaction.count.mockResolvedValue(0);
    tx.transaction.create.mockImplementation(({ data }) => Promise.resolve({ id: "txn_3", ...data }));

    await ledger.recordTransaction(tx, {
      userId: "user_1",
      type: "WITHDRAWAL",
      amount: 50,
      status: "PENDING",
      balanceType: "CASHBACK",
      referenceType: "WITHDRAWAL",
      referenceId: "wd_1",
      applyBalance: true,
    });

    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
