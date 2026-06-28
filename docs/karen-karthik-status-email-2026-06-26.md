DRAFT — status email to Karen + Karthik (Dennis to review & send)
To: Karen, Karthik (@mmcbuild.com.au) · From: dennis@factory2key.com.au
Optional attachment: mmc-comply-th01-v11-test-v1.pdf (sample Comply report)

---

Subject: MMC Build — design pre-fill, multi-storey 3D & a clean Comply run (now live)

Hi Karen, Karthik,

A quick update on the work coming out of the beta walkthrough — several of the
items you raised are now built, shipped, and verified live in production.

1) The questionnaire now pre-fills from your uploaded design.

This was the "it's doing all that work and not transferring the data into the
fields" issue, Karen. The Comply questionnaire now reads the design and fills in
what's on the drawings — number of storeys, total floor area, building height,
ceiling heights, number of wet areas, door and corridor widths, roof and wall
materials, party walls — each badged "Extracted from your design," with the rest
left for you to complete. It now waits for the design to finish processing
before showing the form (with a progress message so you can see it working), so
answers no longer come up blank because the form opened too early.

2) Multi-storey plans now work end to end.

The 3D model renders both storeys (you can toggle Ground / First / All), and the
floor area now reflects the whole building rather than just the ground floor.
This same work fixed plans that previously wouldn't process at all — large
documents (e.g. 70-page sets) and big file sizes now extract reliably, because
the system reads each drawing sheet individually to find the floor plans instead
of guessing across the whole set at once.

3) Comply ran cleanly — and no longer hangs on energy / Section J.

We ran a full compliance check on a real two-storey terrace plan from start to
finish. It completed across all domains without getting stuck on the energy /
Section J stage that timed out previously. The report came through complete —
findings mapped to NCC clauses, with severity, who each item is assigned to, and
specific remediation actions.

All of the above is live in production now.

Still on the list (smaller items, tracked in Jira):
- Re-adding the ready-made sample designs to the picker now that multi-storey
  renders correctly.
- A couple of report-labelling tidy-ups we spotted in the latest run (one NCC
  volume label and a duplicate domain heading).
- The remaining walkthrough items (progress-time wording, the "Back to project"
  link label, the knowledge base, etc.).

Karthik — happy to walk through any of the technical detail; it all went out as
a single release.

We'll keep the Jira board updated with the specifics.

Best,
Dennis
