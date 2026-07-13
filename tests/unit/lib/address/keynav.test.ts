import { describe, it, expect } from "vitest";
import { resolveAddressKey } from "@/lib/address/keynav";

// Regression coverage for SCRUM-335: creating a project without picking a sample
// "bounced / required re-entering the details". Root cause was Enter in the
// address autocomplete submitting the surrounding <form> before an address was
// chosen. The load-bearing invariant: Enter must NEVER pass through to the form
// submit from the address field.
describe("resolveAddressKey", () => {
  describe("Enter never submits the form (SCRUM-335)", () => {
    it("selects the highlighted suggestion when the list is open", () => {
      expect(
        resolveAddressKey("Enter", { open: true, count: 5, highlight: 2 }),
      ).toEqual({ type: "select", index: 2 });
    });

    it("clamps the selected index into range when highlight is stale", () => {
      expect(
        resolveAddressKey("Enter", { open: true, count: 3, highlight: 9 }),
      ).toEqual({ type: "select", index: 2 });
      expect(
        resolveAddressKey("Enter", { open: true, count: 3, highlight: -1 }),
      ).toEqual({ type: "select", index: 0 });
    });

    it("swallows Enter (preventSubmit) when the list is closed", () => {
      expect(
        resolveAddressKey("Enter", { open: false, count: 0, highlight: 0 }),
      ).toEqual({ type: "preventSubmit" });
    });

    it("swallows Enter when open but there are no suggestions", () => {
      expect(
        resolveAddressKey("Enter", { open: true, count: 0, highlight: 0 }),
      ).toEqual({ type: "preventSubmit" });
    });

    it("never returns passthrough for Enter in any state", () => {
      for (const open of [true, false]) {
        for (const count of [0, 1, 4]) {
          for (const highlight of [-1, 0, 2, 99]) {
            const action = resolveAddressKey("Enter", { open, count, highlight });
            expect(action.type).not.toBe("passthrough");
          }
        }
      }
    });
  });

  describe("arrow navigation", () => {
    it("moves the highlight down and clamps at the last item", () => {
      expect(
        resolveAddressKey("ArrowDown", { open: true, count: 3, highlight: 0 }),
      ).toEqual({ type: "move", highlight: 1 });
      expect(
        resolveAddressKey("ArrowDown", { open: true, count: 3, highlight: 2 }),
      ).toEqual({ type: "move", highlight: 2 });
    });

    it("moves the highlight up and clamps at the first item", () => {
      expect(
        resolveAddressKey("ArrowUp", { open: true, count: 3, highlight: 2 }),
      ).toEqual({ type: "move", highlight: 1 });
      expect(
        resolveAddressKey("ArrowUp", { open: true, count: 3, highlight: 0 }),
      ).toEqual({ type: "move", highlight: 0 });
    });

    it("passes arrow keys through when the list is closed", () => {
      expect(
        resolveAddressKey("ArrowDown", { open: false, count: 0, highlight: 0 }),
      ).toEqual({ type: "passthrough" });
    });
  });

  describe("Escape", () => {
    it("closes an open list", () => {
      expect(
        resolveAddressKey("Escape", { open: true, count: 3, highlight: 1 }),
      ).toEqual({ type: "close" });
    });

    it("passes through when nothing is open", () => {
      expect(
        resolveAddressKey("Escape", { open: false, count: 0, highlight: 0 }),
      ).toEqual({ type: "passthrough" });
    });
  });

  it("passes through unrelated keys", () => {
    expect(
      resolveAddressKey("a", { open: true, count: 3, highlight: 0 }),
    ).toEqual({ type: "passthrough" });
  });
});
