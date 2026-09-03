"use strict";

const { ADMIN_ROLES, PERMISSIONS, hasPermission } = require("../../src/config/adminPermissions");
const ApiError = require("../../src/utils/ApiError");
const requirePermission = require("../../src/middleware/requirePermission");

describe("adminPermissions config", () => {
  it("ADMIN_ROLES includes every specialized role plus the original ADMIN/SUPER_ADMIN", () => {
    expect(ADMIN_ROLES).toEqual(
      expect.arrayContaining(["ADMIN", "SUPER_ADMIN", "FINANCE_ADMIN", "CONTENT_ADMIN", "LEARNING_ADMIN", "CUSTOMER_SUPPORT", "MARKETING_ADMIN"])
    );
  });

  it("backward compatibility: plain ADMIN has every permission, unrestricted, exactly like before this feature existed", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission("ADMIN", permission)).toBe(true);
    }
  });

  it("SUPER_ADMIN has every permission", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission("SUPER_ADMIN", permission)).toBe(true);
    }
  });

  it("FINANCE_ADMIN can adjust balances and manage withdrawals, but cannot send notifications", () => {
    expect(hasPermission("FINANCE_ADMIN", PERMISSIONS.ADJUST_BALANCE)).toBe(true);
    expect(hasPermission("FINANCE_ADMIN", PERMISSIONS.MANAGE_WITHDRAWALS)).toBe(true);
    expect(hasPermission("FINANCE_ADMIN", PERMISSIONS.SEND_NOTIFICATIONS)).toBe(false);
  });

  it("MARKETING_ADMIN can send notifications, but cannot adjust balances or manage withdrawals", () => {
    expect(hasPermission("MARKETING_ADMIN", PERMISSIONS.SEND_NOTIFICATIONS)).toBe(true);
    expect(hasPermission("MARKETING_ADMIN", PERMISSIONS.ADJUST_BALANCE)).toBe(false);
    expect(hasPermission("MARKETING_ADMIN", PERMISSIONS.MANAGE_WITHDRAWALS)).toBe(false);
  });

  it("CUSTOMER_SUPPORT can suspend/reinstate users but cannot adjust balances or change settings", () => {
    expect(hasPermission("CUSTOMER_SUPPORT", PERMISSIONS.MANAGE_USERS)).toBe(true);
    expect(hasPermission("CUSTOMER_SUPPORT", PERMISSIONS.ADJUST_BALANCE)).toBe(false);
    expect(hasPermission("CUSTOMER_SUPPORT", PERMISSIONS.MANAGE_SETTINGS)).toBe(false);
  });

  it("an unrecognized/plain USER role has no admin permissions at all", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission("USER", permission)).toBe(false);
    }
  });
});

describe("requirePermission middleware", () => {
  function mockReqRes(role) {
    const req = { user: role ? { id: "u1", role } : null };
    const res = {};
    let calledWith;
    const next = (err) => { calledWith = err; };
    return { req, res, next: (err) => next(err), getCalledWith: () => calledWith };
  }

  it("calls next(401) when there is no authenticated user", () => {
    const { req, res } = mockReqRes(null);
    let errArg;
    requirePermission(PERMISSIONS.ADJUST_BALANCE)(req, res, (err) => { errArg = err; });
    expect(errArg).toBeInstanceOf(ApiError);
    expect(errArg.statusCode).toBe(401);
  });

  it("calls next(403) when the role lacks the required permission", () => {
    const { req, res } = mockReqRes("MARKETING_ADMIN");
    let errArg;
    requirePermission(PERMISSIONS.ADJUST_BALANCE)(req, res, (err) => { errArg = err; });
    expect(errArg).toBeInstanceOf(ApiError);
    expect(errArg.statusCode).toBe(403);
  });

  it("calls next() with no error when the role has the required permission", () => {
    const { req, res } = mockReqRes("FINANCE_ADMIN");
    let errArg = "not called";
    requirePermission(PERMISSIONS.ADJUST_BALANCE)(req, res, (err) => { errArg = err; });
    expect(errArg).toBeUndefined();
  });

  it("a plain ADMIN passes every permission check (backward compatibility)", () => {
    const { req, res } = mockReqRes("ADMIN");
    let errArg = "not called";
    requirePermission(PERMISSIONS.ADJUST_BALANCE)(req, res, (err) => { errArg = err; });
    expect(errArg).toBeUndefined();
  });
});
