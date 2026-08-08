import { describe, it, expect } from "vitest";
// The pure core is exported from the script so it can be tested without firing
// network requests; the script only calls main() when invoked directly.
import { countOccurrences, detectMode, findViolations } from "../../scripts/check-flag-coherence.mjs";

// The check this file guards was written after a real half-flip. On 8 August the
// purchase CTAs were switched on by one environment variable; eight surfaces
// changed and two did not, because they had never been wired to the flag. The
// homepage hero went on saying "Join the Waitlist" and pointing at a contact
// form, on a site that had just started selling, with a green build and a 200
// response.
//
// The first test below is that exact page. If someone simplifies the check and
// it stops catching this, the suite goes red.

const MODES = {
  purchase: { markers: ["Get started", "Contact sales"], forbidden: ["waitlist"] },
  waitlist: { markers: ["Join Waitlist", "Join the Waitlist"], forbidden: [] },
};

/** The homepage as it actually shipped: nav flipped, hero not. */
const HALF_FLIPPED_HOME = {
  path: "/",
  html: `<nav><a href="/signup">Get started</a></nav>
         <h1>Modern Methods of Construction</h1>
         <a class="btn" href="/contact">Join the Waitlist</a>`,
};

const FLIPPED_HOME = {
  path: "/",
  html: `<nav><a href="/signup">Get started</a></nav>
         <h1>Modern Methods of Construction</h1>
         <a class="btn" href="/signup">Get started</a>`,
};

const PRICING = {
  path: "/pricing",
  html: `<a href="/signup">Get started</a><a href="/contact">Contact sales</a>`,
};

describe("the half-flip it was written for", () => {
  it("catches waitlist copy surviving on a site that has switched to purchase", () => {
    const docs = [HALF_FLIPPED_HOME, PRICING];
    const mode = detectMode(MODES, docs);
    expect(mode).toBe("purchase");

    const violations = findViolations(mode, MODES, docs);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe("/");
    expect(violations[0].term).toBe("waitlist");
  });

  it("reports the surrounding context, not just a count", () => {
    // A number tells you something is wrong; the snippet tells you WHAT. On the
    // day, the context is what revealed the survivor was a hero button pointing
    // at /contact rather than an incidental mention.
    const violations = findViolations("purchase", MODES, [HALF_FLIPPED_HOME]);
    expect(violations[0].context).toContain("/contact");
  });

  it("passes once both surfaces are flipped", () => {
    const docs = [FLIPPED_HOME, PRICING];
    expect(findViolations(detectMode(MODES, docs), MODES, docs)).toHaveLength(0);
  });
});

describe("the wording trap that hid it", () => {
  it("matches the bare token regardless of how the phrase is worded", () => {
    // THE bug in my own verification: I searched for "join waitlist", got zero,
    // and called the page clean. The string was "Join THE Waitlist".
    const html = HALF_FLIPPED_HOME.html;
    expect(countOccurrences(html, "join waitlist")).toBe(0); // the trap
    expect(countOccurrences(html, "waitlist")).toBe(1); // what the config uses
  });

  it("is case-insensitive and counts every occurrence", () => {
    expect(countOccurrences("Waitlist waitlist WAITLIST", "waitlist")).toBe(3);
  });

  it("does not overlap-count", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
  });
});

describe("mode detection", () => {
  it("picks the mode the site is mostly in", () => {
    expect(detectMode(MODES, [FLIPPED_HOME, PRICING])).toBe("purchase");
    expect(
      detectMode(MODES, [{ path: "/", html: `<a>Join Waitlist</a><a>Join Waitlist</a>` }]),
    ).toBe("waitlist");
  });

  it("returns null when no declared marker appears at all", () => {
    // The config has gone stale against a redesign. That must fail rather than
    // pass: an assertion that no longer matches what it guards reads as green
    // forever, which is worse than having no assertion.
    expect(detectMode(MODES, [{ path: "/", html: "<h1>Something else entirely</h1>" }])).toBeNull();
  });

  it("flags a tie as ambiguous rather than guessing", () => {
    const docs = [{ path: "/", html: `<a>Get started</a><a>Join Waitlist</a>` }];
    expect(detectMode(MODES, docs)).toBe("__ambiguous__");
  });
});

describe("direction", () => {
  it("would also catch a rollback that left purchase copy behind", () => {
    // The flip is meant to be the fastest thing to revert if launch goes wrong.
    // A rollback can strand copy exactly as the flip did, so the check has to
    // work in both directions — hence detecting the mode rather than hardcoding
    // the expected one.
    const modes = {
      purchase: { markers: ["Get started"], forbidden: ["waitlist"] },
      waitlist: { markers: ["Join Waitlist"], forbidden: ["get started"] },
    };
    const docs = [
      { path: "/", html: `<a>Join Waitlist</a><a>Join Waitlist</a><a href="/signup">Get started</a>` },
    ];
    expect(detectMode(modes, docs)).toBe("waitlist");
    expect(findViolations("waitlist", modes, docs)).toHaveLength(1);
  });
});
