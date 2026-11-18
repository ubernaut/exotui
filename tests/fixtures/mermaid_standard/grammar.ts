// Copyright 2026 ExotUI contributors. MIT license.
/** Negative body/context cases for every registered Mermaid 12.1.0 parser.
 * Positive sources/provenance remain in catalogue.ts; this does not establish
 * exhaustive feature fidelity. Timeline preserves upstream's semantic TypeError.
 */
import { type MermaidStandardRenderer, renderMermaidNativeFrame } from "../../../mod.mermaid.ts";
import { MERMAID_STANDARD_FIXTURES } from "./catalogue.ts";

export const MERMAID_GRAMMAR_FIXTURES: readonly {
  name: string;
  diagramType: string;
  source: string;
  diagnostic: string;
}[] = [
  {
    name: "zenuml",
    diagramType: "zenuml",
    source: "zenuml\nA.foo() {",
    diagnostic: "ZenUML parse error on line 3, column 0: mismatched input '<EOF>'",
  },
  {
    "name": "flowchart",
    "diagramType": "flowchart-v2",
    "source": "flowchart LR\nA[Unclosed label",
    "diagnostic": "Parse error on line 3:",
  },
  {
    "name": "sequenceDiagram",
    "diagramType": "sequence",
    "source": "sequenceDiagram\nAlice->>Bob",
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "classDiagram",
    "diagramType": "classDiagram",
    "source": "classDiagram\nclass Example {\n+String name",
    "diagnostic": "Parse error on line 3:",
  },
  {
    "name": "stateDiagram",
    "diagramType": "stateDiagram",
    "source": "stateDiagram-v2\nstate Parent {\n[*] --> Child",
    "diagnostic": "Parse error on line 3:",
  },
  {
    "name": "entityRelationshipDiagram",
    "diagramType": "er",
    "source": "erDiagram\nCUSTOMER ||--o{ ORDER",
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "gantt",
    "diagramType": "gantt",
    "source": "gantt\ndateFormat",
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "pie",
    "diagramType": "pie",
    "source": 'pie\n"Slice" : nope',
    "diagnostic":
      "Parsing failed: Lexer error on line 2, column 11: unexpected character: ->n<- at offset: 14, skipped 4 characters. Parse error on line 2, column 15: Expecting token of ty",
  },
  {
    "name": "quadrantChart",
    "diagramType": "quadrantChart",
    "source": "quadrantChart\nPoint: [0.2, nope]",
    "diagnostic": "Lexical error on line 2. Unrecognized text.",
  },
  {
    "name": "requirementDiagram",
    "diagramType": "requirement",
    "source": "requirementDiagram\nrequirement R {\nid: 1",
    "diagnostic": "Parse error on line 4:",
  },
  {
    "name": "gitgraph",
    "diagramType": "gitGraph",
    "source": "gitGraph\nmerge",
    "diagnostic": "Parsing failed:  Parse error on line 2, column 6: Expecting: one of these possible Token sequences:",
  },
  {
    "name": "c4",
    "diagramType": "c4",
    "source": 'C4Context\nPerson(user, "Unclosed"',
    "diagnostic": "Parse error on line 3:",
  },
  {
    "name": "mindmap",
    "diagramType": "mindmap",
    "source": "mindmap\nRoot one\nRoot two",
    "diagnostic": 'There can be only one root. No parent could be found for ("Root two")',
  },
  {
    "name": "timeline",
    "diagramType": "timeline",
    "source": "timeline\n: Event without a period",
    "diagnostic": "Cannot read properties of undefined (reading 'events')",
  },
  {
    "name": "sankey",
    "diagramType": "sankey",
    "source": "sankey\nSource,Target",
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "xyChart",
    "diagramType": "xychart",
    "source": "xychart\nline [1, nope]",
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "block",
    "diagramType": "block",
    "source": "block\nblock:Group\n A\n",
    "diagnostic": "Parse error on line 3:",
  },
  {
    "name": "packet",
    "diagramType": "packet",
    "source": 'packet\n0-7: "Unclosed field',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 6: unexpected character: ->"<- at offset: 12, skipped 9 characters.',
  },
  {
    "name": "kanban",
    "diagramType": "kanban",
    "source": 'kanban\nTodo\n Task@{priority: "High"',
    "diagnostic": "Parse error on line 4:",
  },
  {
    "name": "architecture",
    "diagramType": "architecture",
    "source": "architecture-beta\nservice database(database)[Unclosed",
    "diagnostic":
      "Parsing failed: Lexer error on line 2, column 27: unexpected character: ->[<- at offset: 44, skipped 1 characters. Parse error on line 2, column 28: Expecting: one of the",
  },
  {
    "name": "radar",
    "diagramType": "radar",
    "source": 'radar-beta\naxis a["Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 8: unexpected character: ->"<- at offset: 18, skipped 1 characters. Parse error on line 2, column 9: Expecting token of type',
  },
  {
    "name": "eventmodeling",
    "diagramType": "eventmodeling",
    "source": "eventmodeling\ntf",
    "diagnostic": "Parsing failed:  Parse error on line ?, column ?: Expecting token of type 'EM_FID' but found ``.",
  },
  {
    "name": "treemap",
    "diagramType": "treemap",
    "source": 'treemap-beta\n"Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 1: unexpected character: ->"<- at offset: 13, skipped 1 characters. Parse error on line 2, column 2: Expecting end of file b',
  },
  {
    "name": "venn",
    "diagramType": "venn",
    "source": 'venn-beta\nset A["Unclosed',
    "diagnostic": "Lexical error on line 2. Unrecognized text.",
  },
  {
    "name": "ishikawa",
    "diagramType": "ishikawa",
    "source": "ishikawa-beta",
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "wardley",
    "diagramType": "wardley",
    "source": 'wardley-beta\ncomponent "Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 11: unexpected character: ->"<- at offset: 23, skipped 1 characters. Parse error on line 2, column 20: Expecting token of ty',
  },
  {
    "name": "cynefin",
    "diagramType": "cynefin",
    "source": 'cynefin-beta\nsimple "Unclosed',
    "diagnostic":
      "Parsing failed: Lexer error on line 2, column 1: unexpected character: ->s<- at offset: 13, skipped 6 characters.",
  },
  {
    "name": "treeView",
    "diagramType": "treeView",
    "source": 'treeView-beta\n"Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 1: unexpected character: ->"<- at offset: 14, skipped 1 characters. ',
  },
  {
    "name": "swimlanes",
    "diagramType": "swimlane",
    "source": 'swimlane-beta LR\nlane Work["Unclosed',
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "usecase",
    "diagramType": "usecase",
    "source": 'usecase-beta\nactor User["Unclosed',
    "diagnostic":
      'Error lexing usecase diagram: unexpected character: ->"<- at offset: 24, skipped 1 characters. at line 2, column 12 [24,25)',
  },
  {
    "name": "agentflow",
    "diagramType": "agentflow",
    "source": 'agentflow-beta TB\nagent Worker["Unclosed',
    "diagnostic": "Parse error on line 2:",
  },
  {
    "name": "railroad-ebnf",
    "diagramType": "railroadEbnf",
    "source": 'railroad-ebnf-beta\nrule = "Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 8: unexpected character: ->"<- at offset: 26, skipped 1 characters. Parse error on line ?, column ?: Expecting token of type',
  },
  {
    "name": "journey",
    "diagramType": "journey",
    "source": "journey\nsection Work\nTask",
    "diagnostic": "Parse error on line 3:",
  },
  {
    "name": "info",
    "diagramType": "info",
    "source": "info\nnot-a-valid-directive",
    "diagnostic":
      "Parsing failed: Lexer error on line 2, column 1: unexpected character: ->n<- at offset: 5, skipped 21 characters. ",
  },
  {
    "name": "flowchart-elk",
    "diagramType": "flowchart-elk",
    "source": "flowchart-elk LR\nA[Unclosed label",
    "diagnostic": "Parse error on line 3:",
  },
  {
    "name": "railroad-abnf",
    "diagramType": "railroadAbnf",
    "source": 'railroad-abnf-beta\nrule = "Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 8: unexpected character: ->"<- at offset: 26, skipped 1 characters. Parse error on line ?, column ?: Expecting token of type',
  },
  {
    "name": "railroad-peg",
    "diagramType": "railroadPeg",
    "source": 'railroad-peg-beta\nrule <- "Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 9: unexpected character: ->"<- at offset: 26, skipped 1 characters. Parse error on line ?, column ?: Expecting token of type',
  },
  {
    "name": "railroad",
    "diagramType": "railroad",
    "source": 'railroad-beta\nrule = terminal("Unclosed',
    "diagnostic":
      'Parsing failed: Lexer error on line 2, column 17: unexpected character: ->"<- at offset: 30, skipped 1 characters. Parse error on line 2, column 18: Expecting token of ty',
  },
];

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Real parser/renderer rejection, original diagnostics and next-request recovery. */
export async function verifyMermaidFamilyGrammar(
  renderer: Pick<MermaidStandardRenderer, "diagramTypes" | "parse" | "compile">,
) {
  const registered = await renderer.diagramTypes();
  const covered = MERMAID_GRAMMAR_FIXTURES.map((fixture) => fixture.diagramType);
  require(new Set(covered).size === covered.length, "Duplicate negative parser coverage.");
  require(
    registered.length === covered.length && registered.every((type) => covered.includes(type)),
    "Registered Mermaid parser missing negative grammar evidence.",
  );
  let parseRejections = 0, compileRejections = 0, recoveries = 0, nativeCells = 0;
  for (const fixture of MERMAID_GRAMMAR_FIXTURES) {
    const original = MERMAID_STANDARD_FIXTURES.find((example) => example.name === fixture.name);
    require(original, `Missing original positive fixture: ${fixture.name}`);
    require(await renderer.parse(original.source) === fixture.diagramType, `${fixture.name}: wrong positive parser`);
    for (const method of ["parse", "compile"] as const) {
      let failure: unknown;
      try {
        await renderer[method](fixture.source);
      } catch (error) {
        failure = error;
      }
      require(failure instanceof Error, `${fixture.name}/${method}: malformed body was not rejected`);
      require(
        failure.message.includes(fixture.diagnostic) && !failure.message.includes("Cannot serialize result"),
        `${fixture.name}/${method}: original parser diagnostic was lost: ${failure.message.slice(0, 400)}`,
      );
      if (method === "parse") parseRejections++;
      else compileRejections++;
    }
    const diagram = await renderer.compile(original.source);
    require(
      diagram.diagramType === fixture.diagramType && diagram.scene,
      `${fixture.name}: failed request poisoned recovery`,
    );
    const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(diagram.scene)), { background: "#05080b" });
    require(
      frame.columns > 0 && frame.rows > 0 && frame.cells.length === frame.rows &&
        frame.cells.every((row) => row.length === frame.columns) &&
        frame.cells.some((row) => row.some((cell) => cell.char.trim() || cell.foreground || cell.background)),
      `${fixture.name}: recovery did not produce visible native cells`,
    );
    recoveries++;
    nativeCells += frame.columns * frame.rows;
  }
  return { registered: registered.length, parseRejections, compileRejections, recoveries, nativeCells };
}
