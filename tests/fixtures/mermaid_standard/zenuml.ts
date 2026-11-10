// Copyright 2026 ExotUI contributors. MIT license.
// All sixteen Mermaid MIT-licensed ZenUML documentation examples, pinned to
// mermaid@12.1.0 commit 21f72f07ea22c0af48a3149c550654e80d8e40cb.
const reference =
  "https://raw.githubusercontent.com/mermaid-js/mermaid/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/syntax/zenuml.md";

export const MERMAID_ZENUML_FIXTURES = [
  {
    name: "zenuml",
    source:
      "zenuml\n    title Demo\n    Alice->John: Hello John, how are you?\n    John->Alice: Great!\n    Alice->John: See you later!",
  },
  {
    name: "zenuml-participants",
    source:
      "zenuml\n    title Declare participant (optional)\n    Bob\n    Alice\n    Alice->Bob: Hi Bob\n    Bob->Alice: Hi Alice",
  },
  {
    name: "zenuml-annotators",
    source:
      "zenuml\n    title Annotators\n    @Actor Alice\n    @Database Bob\n    Alice->Bob: Hi Bob\n    Bob->Alice: Hi Alice",
  },
  {
    name: "zenuml-aliases",
    source:
      "zenuml\n    title Aliases\n    A as Alice\n    J as John\n    A->J: Hello John, how are you?\n    J->A: Great!",
  },
  {
    name: "zenuml-sync",
    source:
      "zenuml\n    title Sync message\n    A.SyncMessage\n    A.SyncMessage(with, parameters) {\n      B.nestedSyncMessage()\n    }",
  },
  { name: "zenuml-async", source: "zenuml\n    title Async message\n    Alice->Bob: How are you?" },
  { name: "zenuml-creation", source: "zenuml\n    new A1\n    new A2(with, parameters)" },
  {
    name: "zenuml-reply",
    source:
      "zenuml\n    // 1. assign a variable from a sync message.\n    a = A.SyncMessage()\n\n    // 1.1. optionally give the variable a type\n    SomeType a = A.SyncMessage()\n\n    // 2. use return keyword\n    A.SyncMessage() {\n    return result\n    }\n\n    // 3. use @return or @reply annotator on an async message\n    @return\n    A->B: result",
  },
  {
    name: "zenuml-early-return",
    source:
      "zenuml\n    title Reply message\n    Client->A.method() {\n      B.method() {\n        if(condition) {\n          return x1\n          // return early\n          @return\n          A->Client: x11\n        }\n      }\n      return x2\n    }",
  },
  {
    name: "zenuml-nesting",
    source: "zenuml\n    A.method() {\n      B.nested_sync_method()\n      B->C: nested async message\n    }",
  },
  {
    name: "zenuml-comments",
    source:
      "zenuml\n    // a comment on a participant will not be rendered\n    BookService\n    // a comment on a message.\n    // **Markdown** is supported.\n    BookService.getBook()",
  },
  {
    name: "zenuml-loop",
    source: "zenuml\n    Alice->John: Hello John, how are you?\n    while(true) {\n      John->Alice: Great!\n    }",
  },
  {
    name: "zenuml-alt",
    source:
      "zenuml\n    Alice->Bob: Hello Bob, how are you?\n    if(is_sick) {\n      Bob->Alice: Not so good :(\n    } else {\n      Bob->Alice: Feeling fresh like a daisy\n    }",
  },
  {
    name: "zenuml-opt",
    source:
      "zenuml\n    Alice->Bob: Hello Bob, how are you?\n    Bob->Alice: Not so good :(\n    opt {\n      Bob->Alice: Thanks for asking\n    }",
  },
  {
    name: "zenuml-parallel",
    source: "zenuml\n    par {\n        Alice->Bob: Hello guys!\n        Alice->John: Hello guys!\n    }",
  },
  {
    name: "zenuml-break",
    source:
      "zenuml\n    try {\n      Consumer->API: Book something\n      API->BookingService: Start booking process\n    } catch {\n      API->Consumer: show failure\n    } finally {\n      API->BookingService: rollback status\n    }",
  },
].map((fixture) => ({ ...fixture, reference }));
