import { escapeRegex } from "../src/utils/escapeRegex.js";

describe("escapeRegex (admin-search ReDoS guard)", () => {
  it("escapes regex metacharacters so input is treated literally", () => {
    expect(escapeRegex("a.b")).toBe("a\\.b");
    expect(escapeRegex("(a+)+$")).toBe("\\(a\\+\\)\\+\\$");
    expect(escapeRegex("c++ [dev]")).toBe("c\\+\\+ \\[dev\\]");
  });

  it("leaves plain alphanumerics untouched", () => {
    expect(escapeRegex("Aarav Mehta")).toBe("Aarav Mehta");
    expect(escapeRegex("student123")).toBe("student123");
  });

  it("caps length to bound worst-case matching cost", () => {
    expect(escapeRegex("x".repeat(500)).length).toBe(100);
  });

  it("a catastrophic-backtracking payload compiles to a harmless literal", () => {
    const evil = "(a+)+$";
    const safe = escapeRegex(evil);
    // Built as a literal pattern, matching is linear — no ReDoS hang.
    const start = Date.now();
    new RegExp(safe, "i").test("a".repeat(40) + "!");
    expect(Date.now() - start).toBeLessThan(50);
    // And it only matches the literal text, not a regex expansion.
    expect(new RegExp(safe, "i").test("(a+)+$")).toBe(true);
    expect(new RegExp(safe, "i").test("aaaa")).toBe(false);
  });
});
