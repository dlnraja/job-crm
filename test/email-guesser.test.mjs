import assert from "node:assert/strict";
import test from "node:test";
import { fold, guessEmails } from "../src/lib/email-guesser.mjs";

test("folds accents, ligatures and case", () => {
  assert.equal(fold("Élodie"), "elodie");
  assert.equal(fold("Cœur"), "coeur");
  assert.equal(fold("Ægir"), "aegir");
});

test("detects first.last from a published sample", () => {
  const result = guessEmails({
    firstName: "Claire",
    lastName: "Fontaine",
    domain: "Phare.Example",
    samples: [{ firstName: "Hugo", lastName: "Bernard", email: "hugo.bernard@phare.example" }],
    bouncedPatterns: [],
  });
  assert.equal(result[0].email, "claire.fontaine@phare.example");
  assert.equal(result[0].pattern, "first.last");
  assert.equal(result[0].support, 1);
  assert.equal(result[0].bounced, false);
});

test("strips accents when the sample is already folded", () => {
  const result = guessEmails({
    firstName: "Élodie",
    lastName: "Cœur",
    domain: "@nord.example",
    samples: [{ firstName: "Héloïse", lastName: "Béné", email: "heloise.bene@nord.example" }],
    bouncedPatterns: [],
  });
  assert.equal(result[0].email, "elodie.coeur@nord.example");
  assert.equal(result[0].pattern, "first.last");
});

test("preserves the hyphen style observed in the sample", () => {
  const result = guessEmails({
    firstName: "Anne-Marie",
    lastName: "Durand",
    domain: "nord.example",
    samples: [
      {
        firstName: "Jean-Pierre",
        lastName: "Martin",
        email: "jean-pierre.martin@nord.example",
      },
    ],
    bouncedPatterns: [],
  });
  assert.equal(result[0].email, "anne-marie.durand@nord.example");
  assert.equal(result[0].pattern, "first.last");
  assert.ok(result.some((row) => row.email === "annemarie.durand@nord.example"));
});

test("detects a compact hyphen style", () => {
  const result = guessEmails({
    firstName: "Anne-Marie",
    lastName: "Durand",
    domain: "nord.example",
    samples: [
      {
        firstName: "Jean-Pierre",
        lastName: "Martin",
        email: "jeanpierre.martin@nord.example",
      },
    ],
    bouncedPatterns: [],
  });
  assert.equal(result[0].email, "annemarie.durand@nord.example");
});

test("detects flast, f.last, firstlast, first, last.first and first_last", () => {
  const cases = [
    ["pmorel@nord.example", "flast", "jmartin@nord.example"],
    ["p.morel@nord.example", "f.last", "j.martin@nord.example"],
    ["paulmorel@nord.example", "firstlast", "jeanmartin@nord.example"],
    ["paul@nord.example", "first", "jean@nord.example"],
    ["morel.paul@nord.example", "last.first", "martin.jean@nord.example"],
    ["paul_morel@nord.example", "first_last", "jean_martin@nord.example"],
    ["paul-morel@nord.example", "first-last", "jean-martin@nord.example"],
  ];
  for (const [sampleEmail, pattern, expected] of cases) {
    const result = guessEmails({
      firstName: "Jean",
      lastName: "Martin",
      domain: "nord.example",
      samples: [{ firstName: "Paul", lastName: "Morel", email: sampleEmail }],
      bouncedPatterns: [],
    });
    assert.equal(result[0].pattern, pattern, sampleEmail);
    assert.equal(result[0].email, expected, sampleEmail);
  }
});

test("ranks the pattern that matches the most samples first", () => {
  const result = guessEmails({
    firstName: "Claire",
    lastName: "Fontaine",
    domain: "nord.example",
    samples: [
      { firstName: "Hugo", lastName: "Bernard", email: "hugo.bernard@nord.example" },
      { firstName: "Léa", lastName: "Petit", email: "lea.petit@nord.example" },
      { firstName: "Paul", lastName: "Morel", email: "pmorel@nord.example" },
    ],
    bouncedPatterns: [],
  });
  assert.equal(result[0].pattern, "first.last");
  assert.equal(result[0].support, 2);
});

test("flags patterns that already bounced without hiding them", () => {
  const result = guessEmails({
    firstName: "Claire",
    lastName: "Fontaine",
    domain: "nord.example",
    samples: [{ firstName: "Hugo", lastName: "Bernard", email: "hugo.bernard@nord.example" }],
    bouncedPatterns: ["first.last"],
  });
  const match = result.find((row) => row.pattern === "first.last");
  assert.ok(match);
  assert.equal(match.bounced, true);
  assert.equal(result[0].pattern, "first.last");
});

test("proposes the usual patterns when no sample is known", () => {
  const result = guessEmails({
    firstName: "Claire",
    lastName: "Fontaine",
    domain: "nord.example",
    samples: [],
    bouncedPatterns: ["flast"],
  });
  const patterns = result.map((row) => row.pattern);
  assert.equal(patterns[0], "first.last");
  for (const id of ["flast", "f.last", "firstlast", "first", "last.first", "first_last"]) {
    assert.ok(patterns.includes(id), id);
  }
  const flast = result.find((row) => row.pattern === "flast");
  assert.equal(flast.bounced, true);
  assert.equal(flast.email, "cfontaine@nord.example");
});

test("handles particle surnames and apostrophes", () => {
  const result = guessEmails({
    firstName: "Paul",
    lastName: "Le Roux",
    domain: "nord.example",
    samples: [
      {
        firstName: "Alice",
        lastName: "De La Fontaine",
        email: "alice.de-la-fontaine@nord.example",
      },
    ],
    bouncedPatterns: [],
  });
  assert.equal(result[0].email, "paul.le-roux@nord.example");
  assert.equal(result[0].pattern, "first.last");

  const apostrophe = guessEmails({
    firstName: "Jean",
    lastName: "D'Andrés",
    domain: "nord.example",
    samples: [{ firstName: "Luc", lastName: "D'Arcy", email: "luc.darcy@nord.example" }],
    bouncedPatterns: [],
  });
  assert.equal(apostrophe[0].email, "jean.dandres@nord.example");
});

test("returns nothing for a missing name or domain", () => {
  assert.deepEqual(
    guessEmails({
      firstName: " ",
      lastName: "Martin",
      domain: "nord.example",
      samples: [],
      bouncedPatterns: [],
    }),
    [],
  );
  assert.deepEqual(
    guessEmails({
      firstName: "Jean",
      lastName: "Martin",
      domain: "  ",
      samples: [],
      bouncedPatterns: [],
    }),
    [],
  );
});
