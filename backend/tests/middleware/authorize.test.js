"use strict";

const { requireRole } = require("../../src/middleware/authorize");

function mockRes() {
  return {};
}

describe("requireRole middleware", () => {
  it("calls next(401 error) when there is no authenticated user", () => {
    const req = {};
    const next = jest.fn();

    requireRole("ADMIN")(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("calls next(403 error) when the user's role is not allowed", () => {
    const req = { user: { role: "USER" } };
    const next = jest.fn();

    requireRole("ADMIN", "SUPER_ADMIN")(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("calls next() with no error when the role is allowed", () => {
    const req = { user: { role: "ADMIN" } };
    const next = jest.fn();

    requireRole("ADMIN", "SUPER_ADMIN")(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows AGENT-only routes to reject USER and ADMIN alike when only AGENT is listed", () => {
    const next = jest.fn();
    requireRole("AGENT")({ user: { role: "USER" } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
