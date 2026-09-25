import { describe, expect, it } from "vitest";

import { parseConfirmType } from "./confirm";

describe("parseConfirmType — ADMIN-SUPER-10", () => {
  it.each(["invite", "recovery"])("acepta %s", (tipo) => {
    expect(parseConfirmType(tipo)).toBe(tipo);
  });

  it.each([null, undefined, "", "signup", "magiclink", "email", "email_change", "INVITE", "invite "])(
    "rechaza %j",
    (tipo) => {
      expect(parseConfirmType(tipo)).toBeNull();
    },
  );
});
