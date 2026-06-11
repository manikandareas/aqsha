import { describe, expect, it } from "vitest";
import { parseGrobidTei } from "../convex/papers/grobid/teiParser";

const sampleTei = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title level="a">Learning Analytics in Higher Education</title>
      </titleStmt>
      <sourceDesc>
        <biblStruct>
          <analytic>
            <title level="a">Learning Analytics in Higher Education</title>
            <author>
              <persName>
                <forename>Ada</forename>
                <surname>Lovelace</surname>
              </persName>
              <affiliation>University of Computing</affiliation>
            </author>
            <author>
              <persName>
                <forename>Alan</forename>
                <surname>Turing</surname>
              </persName>
            </author>
            <idno type="DOI">10.1234/example.2026</idno>
          </analytic>
          <monogr>
            <title level="j">Journal of Education Data</title>
            <imprint>
              <publisher>Example Press</publisher>
              <date when="2026-01-15" />
            </imprint>
          </monogr>
        </biblStruct>
      </sourceDesc>
    </fileDesc>
    <profileDesc>
      <abstract>
        <p>This paper studies learning analytics adoption.</p>
      </abstract>
      <textClass>
        <keywords>
          <term>learning analytics</term>
          <term>higher education</term>
        </keywords>
      </textClass>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <head>Introduction</head>
        <p>Learning analytics helps students and teachers.</p>
      </div>
      <div>
        <head>Method</head>
        <p>We reviewed published studies.</p>
      </div>
    </body>
    <back>
      <listBibl>
        <biblStruct>
          <analytic>
            <title level="a">Prior Study</title>
            <author>
              <persName><forename>Grace</forename><surname>Hopper</surname></persName>
            </author>
            <idno type="DOI">10.5555/prior</idno>
          </analytic>
          <monogr><imprint><date when="2020" /></imprint></monogr>
        </biblStruct>
      </listBibl>
    </back>
  </text>
</TEI>`;

describe("GROBID TEI parser", () => {
  it("normalizes core paper metadata, sections, and references", () => {
    const parsed = parseGrobidTei(sampleTei);

    expect(parsed.title).toBe("Learning Analytics in Higher Education");
    expect(parsed.abstract).toBe("This paper studies learning analytics adoption.");
    expect(parsed.doi).toBe("10.1234/example.2026");
    expect(parsed.authors.map((author) => author.name)).toEqual([
      "Ada Lovelace",
      "Alan Turing",
    ]);
    expect(parsed.affiliations).toContain("University of Computing");
    expect(parsed.journal).toBe("Journal of Education Data");
    expect(parsed.publisher).toBe("Example Press");
    expect(parsed.publishedYear).toBe(2026);
    expect(parsed.keywords).toEqual(["learning analytics", "higher education"]);
    expect(parsed.sections).toEqual([
      {
        title: "Introduction",
        text: "Learning analytics helps students and teachers.",
      },
      {
        title: "Method",
        text: "We reviewed published studies.",
      },
    ]);
    expect(parsed.references[0]).toMatchObject({
      title: "Prior Study",
      authors: ["Grace Hopper"],
      doi: "10.5555/prior",
      year: 2020,
    });
    expect(parsed.plainText).toContain("Abstract");
    expect(parsed.confidence).toBeGreaterThan(0.8);
  });
});
