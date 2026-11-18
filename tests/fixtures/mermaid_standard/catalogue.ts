// Copyright 2026 ExotUI contributors. MIT license.
// Upstream example sources are Mermaid MIT-licensed documentation, pinned to
// mermaid@12.1.0 commit 21f72f07ea22c0af48a3149c550654e80d8e40cb.
// Each example is executable evidence, not a claim of full per-feature coverage.
import { MERMAID_ZENUML_FIXTURES } from "./zenuml.ts";

export const MERMAID_STANDARD_FIXTURES: readonly {
  name: string;
  reference: string;
  source: string;
}[] = [
  ...MERMAID_ZENUML_FIXTURES,
  {
    "name": "flowchart",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/flowchart.md",
    "source": "---\ntitle: Node\n---\nflowchart LR\n    id",
  },
  {
    "name": "sequenceDiagram",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/sequenceDiagram.md",
    "source":
      "sequenceDiagram\n    Alice->>John: Hello John, how are you?\n    John-->>Alice: Great!\n    Alice-)John: See you later!",
  },
  {
    "name": "classDiagram",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/classDiagram.md",
    "source":
      '---\ntitle: Animal example\n---\nclassDiagram\n    note "From Duck till Zebra"\n    Animal <|-- Duck\n    note for Duck "can fly<br>can swim<br>can dive<br>can help in debugging"\n    Animal <|-- Fish\n    Animal <|-- Zebra\n    Animal : +int age\n    Animal : +String gender\n    Animal: +isMammal()\n    Animal: +mate()\n    class Duck{\n        +String beakColor\n        +swim()\n        +quack()\n    }\n    class Fish{\n        -int sizeInFeet\n        -canEat()\n    }\n    class Zebra{\n        +bool is_wild\n        +run()\n    }',
  },
  {
    "name": "stateDiagram",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/stateDiagram.md",
    "source":
      "---\ntitle: Simple sample\n---\nstateDiagram-v2\n    [*] --> Still\n    Still --> [*]\n\n    Still --> Moving\n    Moving --> Still\n    Moving --> Crash\n    Crash --> [*]",
  },
  {
    "name": "entityRelationshipDiagram",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/entityRelationshipDiagram.md",
    "source":
      "---\ntitle: Order example\n---\nerDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE-ITEM : contains\n    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses",
  },
  {
    "name": "gantt",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/gantt.md",
    "source":
      "gantt\n    title A Gantt Diagram\n    dateFormat YYYY-MM-DD\n    section Section\n        A task          :a1, 2014-01-01, 30d\n        Another task    :after a1, 20d\n    section Another\n        Task in Another :2014-01-12, 12d\n        another task    :24d",
  },
  {
    "name": "pie",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/pie.md",
    "source": 'pie title Pets adopted by volunteers\n    "Dogs" : 386\n    "Cats" : 85\n    "Rats" : 15',
  },
  {
    "name": "quadrantChart",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/quadrantChart.md",
    "source":
      "quadrantChart\n    title Reach and engagement of campaigns\n    x-axis Low Reach --> High Reach\n    y-axis Low Engagement --> High Engagement\n    quadrant-1 We should expand\n    quadrant-2 Need to promote\n    quadrant-3 Re-evaluate\n    quadrant-4 May be improved\n    Campaign A: [0.3, 0.6]\n    Campaign B: [0.45, 0.23]\n    Campaign C: [0.57, 0.69]\n    Campaign D: [0.78, 0.34]\n    Campaign E: [0.40, 0.34]\n    Campaign F: [0.35, 0.78]",
  },
  {
    "name": "requirementDiagram",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/requirementDiagram.md",
    "source":
      "requirementDiagram\n\n    requirement test_req {\n    id: 1\n    text: the test text.\n    risk: high\n    verifymethod: test\n    }\n\n    element test_entity {\n    type: simulation\n    }\n\n    test_entity - satisfies -> test_req",
  },
  {
    "name": "gitgraph",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/gitgraph.md",
    "source":
      "---\ntitle: Example Git diagram\n---\ngitGraph\n   commit\n   commit\n   branch develop\n   checkout develop\n   commit\n   commit\n   checkout main\n   merge develop\n   commit\n   commit",
  },
  {
    "name": "c4",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/c4.md",
    "source":
      'C4Context\n      title System Context diagram for Internet Banking System\n      Enterprise_Boundary(b0, "BankBoundary0") {\n        Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")\n        Person(customerB, "Banking Customer B")\n        Person_Ext(customerC, "Banking Customer C", "desc")\n\n        Person(customerD, "Banking Customer D", "A customer of the bank, <br/> with personal bank accounts.")\n\n        System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")\n\n        Enterprise_Boundary(b1, "BankBoundary") {\n\n          SystemDb_Ext(SystemE, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")\n\n          System_Boundary(b2, "BankBoundary2") {\n            System(SystemA, "Banking System A")\n            System(SystemB, "Banking System B", "A system of the bank, with personal bank accounts. next line.")\n          }\n\n          System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")\n          SystemDb(SystemD, "Banking System D Database", "A system of the bank, with personal bank accounts.")\n\n          Boundary(b3, "BankBoundary3", "boundary") {\n            SystemQueue(SystemF, "Banking System F Queue", "A system of the bank.")\n            SystemQueue_Ext(SystemG, "Banking System G Queue", "A system of the bank, with personal bank accounts.")\n          }\n        }\n      }\n\n      BiRel(customerA, SystemAA, "Uses")\n      BiRel(SystemAA, SystemE, "Uses")\n      Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")\n      Rel(SystemC, customerA, "Sends e-mails to")\n\n      UpdateElementStyle(customerA, $fontColor="red", $bgColor="grey", $borderColor="red")\n      UpdateRelStyle(customerA, SystemAA, $textColor="blue", $lineColor="blue", $offsetX="5")\n      UpdateRelStyle(SystemAA, SystemE, $textColor="blue", $lineColor="blue", $offsetY="-10")\n      UpdateRelStyle(SystemAA, SystemC, $textColor="blue", $lineColor="blue", $offsetY="-40", $offsetX="-50")\n      UpdateRelStyle(SystemC, customerA, $textColor="red", $lineColor="red", $offsetX="-50", $offsetY="20")\n\n      UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")',
  },
  {
    "name": "mindmap",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/mindmap.md",
    "source":
      "mindmap\n  root((mindmap))\n    Origins\n      Long history\n      ::icon(fa fa-book)\n      Popularisation\n        British popular psychology author Tony Buzan\n    Research\n      On effectiveness<br/>and features\n      On Automatic creation\n        Uses\n            Creative techniques\n            Strategic planning\n            Argument mapping\n    Tools\n      Pen and paper\n      Mermaid",
  },
  {
    "name": "timeline",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/timeline.md",
    "source":
      "timeline\n    title History of Social Media Platform\n    2002 : LinkedIn\n    2004 : Facebook\n         : Google\n    2005 : YouTube\n    2006 : Twitter",
  },
  {
    "name": "timeline-direction-td",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/timeline.md",
    "source":
      "timeline TD\n  title MermaidChart 2023 Timeline\n    section 2023 Q1 <br> Release Personal Tier\n      Bullet 1 : sub-point 1a : sub-point 1b\n      Bullet 2 : sub-point 2a : sub-point 2b\n    section 2023 Q2 <br> Release XYZ Tier\n      Bullet 3 : sub-point <br> 3a : sub-point 3b\n      Bullet 4 : sub-point 4a : sub-point 4b\n",
  },
  {
    "name": "sankey",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/sankey.md",
    "source":
      "---\nconfig:\n  sankey:\n    showValues: false\n---\nsankey\n\nAgricultural 'waste',Bio-conversion,124.729\nBio-conversion,Liquid,0.597\nBio-conversion,Losses,26.862\nBio-conversion,Solid,280.322\nBio-conversion,Gas,81.144\nBiofuel imports,Liquid,35\nBiomass imports,Solid,35\nCoal imports,Coal,11.606\nCoal reserves,Coal,63.965\nCoal,Solid,75.571\nDistrict heating,Industry,10.639\nDistrict heating,Heating and cooling - commercial,22.505\nDistrict heating,Heating and cooling - homes,46.184\nElectricity grid,Over generation / exports,104.453\nElectricity grid,Heating and cooling - homes,113.726\nElectricity grid,H2 conversion,27.14\nElectricity grid,Industry,342.165\nElectricity grid,Road transport,37.797\nElectricity grid,Agriculture,4.412\nElectricity grid,Heating and cooling - commercial,40.858\nElectricity grid,Losses,56.691\nElectricity grid,Rail transport,7.863\nElectricity grid,Lighting & appliances - commercial,90.008\nElectricity grid,Lighting & appliances - homes,93.494\nGas imports,Ngas,40.719\nGas reserves,Ngas,82.233\nGas,Heating and cooling - commercial,0.129\nGas,Losses,1.401\nGas,Thermal generation,151.891\nGas,Agriculture,2.096\nGas,Industry,48.58\nGeothermal,Electricity grid,7.013\nH2 conversion,H2,20.897\nH2 conversion,Losses,6.242\nH2,Road transport,20.897\nHydro,Electricity grid,6.995\nLiquid,Industry,121.066\nLiquid,International shipping,128.69\nLiquid,Road transport,135.835\nLiquid,Domestic aviation,14.458\nLiquid,International aviation,206.267\nLiquid,Agriculture,3.64\nLiquid,National navigation,33.218\nLiquid,Rail transport,4.413\nMarine algae,Bio-conversion,4.375\nNgas,Gas,122.952\nNuclear,Thermal generation,839.978\nOil imports,Oil,504.287\nOil reserves,Oil,107.703\nOil,Liquid,611.99\nOther waste,Solid,56.587\nOther waste,Bio-conversion,77.81\nPumped heat,Heating and cooling - homes,193.026\nPumped heat,Heating and cooling - commercial,70.672\nSolar PV,Electricity grid,59.901\nSolar Thermal,Heating and cooling - homes,19.263\nSolar,Solar Thermal,19.263\nSolar,Solar PV,59.901\nSolid,Agriculture,0.882\nSolid,Thermal generation,400.12\nSolid,Industry,46.477\nThermal generation,Electricity grid,525.531\nThermal generation,Losses,787.129\nThermal generation,District heating,79.329\nTidal,Electricity grid,9.452\nUK land based bioenergy,Bio-conversion,182.01\nWave,Electricity grid,19.013\nWind,Electricity grid,289.366",
  },
  {
    "name": "xyChart",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/xyChart.md",
    "source":
      'xychart\n    title "Sales Revenue"\n    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]\n    y-axis "Revenue (in $)" 4000 --> 11000\n    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]\n    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]',
  },
  {
    "name": "block",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/block.md",
    "source":
      'block\ncolumns 1\n  db(("DB"))\n  blockArrowId6<["&nbsp;&nbsp;&nbsp;"]>(down)\n  block:ID\n    A\n    B["A wide one in the middle"]\n    C\n  end\n  space\n  D\n  ID --> D\n  C --> D\n  style B fill:#969,stroke:#333,stroke-width:4px',
  },
  {
    "name": "packet",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/packet.md",
    "source":
      '---\ntitle: "TCP Packet"\n---\npacket\n0-15: "Source Port"\n16-31: "Destination Port"\n32-63: "Sequence Number"\n64-95: "Acknowledgment Number"\n96-99: "Data Offset"\n100-105: "Reserved"\n106: "URG"\n107: "ACK"\n108: "PSH"\n109: "RST"\n110: "SYN"\n111: "FIN"\n112-127: "Window"\n128-143: "Checksum"\n144-159: "Urgent Pointer"\n160-191: "(Options and Padding)"\n192-255: "Data (variable length)"',
  },
  {
    "name": "kanban",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/kanban.md",
    "source": "kanban\n  column1[Column Title]\n    task1[Task Description]",
  },
  {
    name: "kanban-full",
    reference:
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/kanban.md",
    source: `---
config:
  kanban:
    ticketBaseUrl: 'https://mermaidchart.atlassian.net/browse/#TICKET#'
---
kanban
  Todo
    [Create Documentation]
    docs[Create Blog about the new diagram]
  [In progress]
    id6[Create renderer so that it works in all cases. We also add some extra text here for testing purposes. And some more just for the extra flare.]
  id9[Ready for deploy]
    id8[Design grammar]@{ assigned: 'knsv' }
  id10[Ready for test]
    id4[Create parsing tests]@{ ticket: MC-2038, assigned: 'K.Sveidqvist', priority: 'High' }
    id66[last item]@{ priority: 'Very Low', assigned: 'knsv' }
  id11[Done]
    id5[define getData]
    id2[Title of diagram is more than 100 chars when user duplicates diagram with 100 char]@{ ticket: MC-2036, priority: 'Very High'}
    id3[Update DB function]@{ ticket: MC-2037, assigned: knsv, priority: 'High' }

  id12[Can't reproduce]
    id3[Weird flickering in Firefox]
`,
  },
  {
    "name": "architecture",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/architecture.md",
    "source":
      "architecture-beta\n    group api(cloud)[API]\n\n    service db(database)[Database] in api\n    service disk1(disk)[Storage] in api\n    service disk2(disk)[Storage] in api\n    service server(server)[Server] in api\n\n    db:L -- R:server\n    disk1:T -- B:server\n    disk2:T -- B:db",
  },
  {
    "name": "radar",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/radar.md",
    "source":
      '---\ntitle: "Grades"\n---\nradar-beta\n  axis m["Math"], s["Science"], e["English"]\n  axis h["History"], g["Geography"], a["Art"]\n  curve a["Alice"]{85, 90, 80, 70, 75, 90}\n  curve b["Bob"]{70, 75, 85, 80, 90, 85}\n\n  max 100\n  min 0',
  },
  {
    "name": "eventmodeling",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/eventmodeling.md",
    "source": "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem\ntf 03 evt ItemAdded",
  },
  {
    "name": "treemap",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/treemap.md",
    "source":
      'treemap-beta\n"Category A"\n    "Item A1": 10\n    "Item A2": 20\n"Category B"\n    "Item B1": 15\n    "Item B2": 25',
  },
  {
    "name": "venn",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/venn.md",
    "source":
      'venn-beta\n  title What makes a good feature\n  set Desirable\n  set Feasible\n  set Viable\n  union Desirable,Feasible["Buildable"]\n  union Feasible,Viable["Sustainable"]\n  union Desirable,Viable["Marketable"]\n  union Desirable,Feasible,Viable["Ship it"]',
  },
  {
    "name": "ishikawa",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/ishikawa.md",
    "source":
      "ishikawa-beta\n    Blurry Photo\n    Process\n        Out of focus\n        Shutter speed too slow\n        Protective film not removed\n        Beautification filter applied\n    User\n        Shaky hands\n    Equipment\n        LENS\n            Inappropriate lens\n            Damaged lens\n            Dirty lens\n        SENSOR\n            Damaged sensor\n            Dirty sensor\n    Environment\n        Subject moved too quickly\n        Too dark",
  },
  {
    "name": "wardley",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/wardley.md",
    "source":
      'wardley-beta\ntitle Tea Shop Value Chain\n\nanchor Business [0.95, 0.63]\ncomponent Cup of Tea [0.79, 0.61]\ncomponent Tea [0.63, 0.81]\ncomponent Hot Water [0.52, 0.80]\ncomponent Kettle [0.43, 0.35]\ncomponent Power [0.10, 0.70]\n\nBusiness -> Cup of Tea\nCup of Tea -> Tea\nCup of Tea -> Hot Water\nHot Water -> Kettle\nKettle -> Power\n\nevolve Kettle 0.62\nevolve Power 0.89\n\nnote "Standardising power allows Kettles to evolve faster" [0.30, 0.49]',
  },
  {
    "name": "cynefin",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/cynefin.md",
    "source":
      'cynefin-beta\n  title Incident Response\n\n  complex\n    "Investigate root cause"\n    "Run chaos experiment"\n\n  complicated\n    "Analyze performance data"\n    "Expert review needed"\n\n  clear\n    "Restart service"\n    "Apply known fix"\n\n  chaotic\n    "Page on-call immediately"\n\n  confusion\n    "Unknown failure mode"',
  },
  {
    "name": "treeView",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/treeView.md",
    "source": "treeView-beta\n├── src/\n│   ├── index.ts\n│   └── utils.ts\n├── package.json\n└── README.md",
  },
  {
    "name": "swimlanes",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/swimlanes.md",
    "source":
      "swimlane-beta LR\n  subgraph Customer\n    Browse[Browse catalogue]\n    Pay[Pay]\n  end\n  subgraph Warehouse\n    Pick[Pick items]\n    Ship[Ship order]\n  end\n  subgraph Finance\n    Invoice[Raise invoice]\n  end\n  Browse --> Pay\n  Pay --> Pick\n  Pick --> Ship\n  Pay --> Invoice",
  },
  {
    "name": "usecase",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/usecase.md",
    "source":
      'usecase-beta\ndirection LR\nactor Customer("Customer")\nsystemBoundary "Order system"\n  Checkout("Place order")\nend\nCustomer --> Checkout',
  },
  {
    "name": "agentflow",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/agentflow.md",
    "source":
      'agentflow-beta TB\n  flow reviewer["Review Agent"]\n    changes["Gather changes"]@{ shape: input }\n    analyse["Analyse diff"]@{ shape: task }\n    lint["run_linter"]@{ shape: tool }\n    ok["Clean?"]@{ shape: decision }\n\n    changes --> analyse --> lint --> ok\n  end',
  },
  {
    "name": "railroad-ebnf",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/railroad.md",
    "source":
      'railroad-ebnf-beta\ntitle "Digit Definition"\n\ndigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;',
  },
  {
    "name": "journey",
    "reference": "https://mermaid.js.org/syntax/userJourney.html",
    "source": "journey\n  title Delivery\n  section Build\n    Implement: 5: Developer\n    Review: 4: Maintainer",
  },
  {
    "name": "info",
    "reference": "https://mermaid.js.org/intro/",
    "source": "info",
  },
  {
    "name": "flowchart-elk",
    "reference": "https://mermaid.js.org/syntax/flowchart.html",
    "source": "flowchart-elk TB\n  A[Input] --> B[Output]",
  },
  {
    "name": "railroad-abnf",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/railroad.md",
    "source":
      'railroad-abnf-beta\ntitle "Email Address"\n\naddress = local-part "@" domain ;\nlocal-part = 1*( ALPHA / DIGIT / "." / "-" ) ;\ndomain = label *( "." label ) ;\nlabel = 1*( ALPHA / DIGIT / "-" ) ;',
  },
  {
    "name": "railroad-peg",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/railroad.md",
    "source":
      'railroad-peg-beta\ntitle "Calculator Grammar"\n\nExpression <- Term (("+" / "-") Term)* ;\nTerm <- Factor (("*" / "/") Factor)* ;\nFactor <- Number / "(" Expression ")" ;\nNumber <- Digit+ ;\nDigit <- "0" / "1" / "2" / "3" / "4" / "5" / "6" / "7" / "8" / "9" ;',
  },
  {
    "name": "railroad",
    "reference":
      "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/railroad.md",
    "source":
      'railroad-beta\ntitle Expression Grammar\n\nexpression = sequence(\n    nonterminal("term"),\n    zeroOrMore(sequence(\n        choice(terminal("+"), terminal("-")),\n        nonterminal("term")\n    ))\n) ;\nterm = sequence(\n    nonterminal("factor"),\n    zeroOrMore(sequence(\n        choice(terminal("*"), terminal("/")),\n        nonterminal("factor")\n    ))\n) ;\nfactor = choice(\n    nonterminal("number"),\n    sequence(terminal("("), nonterminal("expression"), terminal(")"))\n) ;\nnumber = oneOrMore(nonterminal("digit")) ;\ndigit = choice(terminal("0"), terminal("1"), terminal("2"), terminal("3"), terminal("4"), terminal("5"), terminal("6"), terminal("7"), terminal("8"), terminal("9")) ;',
  },
  {
    "name": "flowchart-features",
    "reference": "https://mermaid.js.org/syntax/flowchart.html",
    "source":
      "---\ntitle: Stack relationships\nconfig:\n  flowchart:\n    htmlLabels: false\n---\nflowchart TB\n  accTitle: Stack relationships\n  accDescr: A nested subsystem with styled nodes and multiple connections.\n  subgraph runtime[Runtime]\n    direction LR\n    A@{ shape: cyl, label: Database }\n    B([Start])\n    subgraph worker[Worker]\n      C{Ready?}\n      D[[Process]]\n    end\n  end\n  A & B --> C & D\n  C <-->|exchange| D\n  A --o B\n  B --x C\n  C ==>|primary| E((Result))\n  D -.-> E\n  classDef store fill:#123456,stroke:#abcdef,color:#ffffff\n  class A store\n  style B fill:#aabbcc,stroke-width:3px\n  linkStyle 0 stroke:#112233,stroke-width:4px",
  },
  {
    "name": "flowchart-markdown",
    "reference": "https://mermaid.js.org/syntax/flowchart.html",
    "source": 'flowchart LR\n  A["`**Readable** and *formatted*`"] --> B["Unicode: 你好 ❤"]',
  },
];
