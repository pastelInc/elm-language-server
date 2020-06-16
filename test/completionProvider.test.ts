import { CompletionProvider, CompletionResult } from "../src/providers";
import {
  CompletionParams,
  CompletionContext,
  IConnection,
  CompletionItem,
  Position,
  TextEdit,
} from "vscode-languageserver";
import { IElmWorkspace } from "../src/elmWorkspace";
import { SourceTreeParser } from "./utils/sourceTreeParser";
import { baseUri } from "./utils/mockElmWorkspace";
import { mockDeep } from "jest-mock-extended";
import { getCaretPositionFromSource } from "./utils/sourceParser";
import { URI } from "vscode-uri";
import { isDeepStrictEqual } from "util";

class MockCompletionProvider extends CompletionProvider {
  public handleCompletion(
    params: CompletionParams,
    elmWorkspace: IElmWorkspace,
  ): CompletionResult {
    return this.handleCompletionRequest(params, elmWorkspace);
  }
}

type exactCompletions = "exactMatch" | "partialMatch";
type dotCompletions = "triggeredByDot" | "normal";

describe("CompletionProvider", () => {
  const connectionMock = mockDeep<IConnection>();

  const completionProvider = new MockCompletionProvider(connectionMock, []);
  const treeParser = new SourceTreeParser();

  /**
   * Run completion tests on a source
   *
   * @param source The source code in an array of lines
   * @param expectedCompletions The array of expected completions
   * @param testExactCompletions Test that the completion list ONLY includes the expected completions
   * @param testDotCompletion Test completions if a dot was the trigger character
   */
  async function testCompletions(
    source: string,
    expectedCompletions: (string | CompletionItem)[],
    testExactCompletions: exactCompletions = "partialMatch",
    testDotCompletion: dotCompletions = "normal",
  ) {
    await treeParser.init();

    const { newSources, position, fileWithCaret } = getCaretPositionFromSource(
      source,
    );

    if (!position) {
      fail();
    }

    function testCompletionsWithContext(context: CompletionContext) {
      const completions =
        completionProvider.handleCompletion(
          {
            textDocument: { uri: URI.file(baseUri + fileWithCaret).toString() },
            position: position!,
            context,
          },
          treeParser.getWorkspace(newSources),
        ) ?? [];

      const completionsList = Array.isArray(completions)
        ? completions
        : completions.items;

      if (testExactCompletions === "exactMatch") {
        expect(completionsList.length).toBe(expectedCompletions.length);
      } else {
        expect(completionsList.length).toBeGreaterThanOrEqual(
          expectedCompletions.length,
        );
      }

      expectedCompletions.forEach((completion) => {
        expect(
          completionsList.find((c) => {
            if (typeof completion === "string") {
              return c.label === completion;
            } else {
              // Compare label, detail, and text edit text
              return (
                c.label === completion.label &&
                c.detail === completion.detail &&
                c.additionalTextEdits &&
                completion.additionalTextEdits &&
                isDeepStrictEqual(
                  c.additionalTextEdits[0],
                  completion.additionalTextEdits[0],
                )
              );
            }
          }),
        ).toBeTruthy();
      });
    }

    testCompletionsWithContext({ triggerKind: 1 });

    if (testDotCompletion === "triggeredByDot") {
      testCompletionsWithContext({ triggerKind: 2, triggerCharacter: "." });
    }
  }

  it("Updating a record should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model -> Model
view model =
  { model | p{-caret-} }
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");
  });

  it("Updating a nested record should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: Data
  , prop2: Int
  }

type alias Data = 
  { item1: String
  , item2: Int
  }

view : Model -> Model
view model =
  { model | prop1 = { i{-caret-} } }
`;

    await testCompletions(source, ["item1", "item2"], "exactMatch");
  });

  it("A record return type should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model
view =
  { p{-caret-} }
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");

    const source2 = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model
view =
  let
    func : Model
    func = 
      { p{-caret-} }

  in
`;

    await testCompletions(source2, ["prop1", "prop2"], "exactMatch");
  });

  it("Record access should have completions inside a let", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model -> Model
view model =
  let
    var : String
    var = 
      model.{-caret-}
        |> String.toFloat
        |> String.fromFloat

  in
    model
`;

    await testCompletions(
      source,
      ["prop1", "prop2"],
      "partialMatch",
      "triggeredByDot",
    );
  });

  it("Function parameter should have completions in a function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

test : Model -> String
test param =
  p{-caret-}
`;

    await testCompletions(source, ["param"]);
  });

  it("Function parameter should have completions in a nested expression", async () => {
    const source = `
--@ Test.elm    
module Test exposing (..)

test : Model -> String
test param =
  let
    list = List.map (\_ -> p{-caret-})
  in
    ""
`;

    await testCompletions(source, ["param"]);
  });

  it("Let values should have completions", async () => {
    const source = `
--@ Test.elm    
module Test exposing (..)

test : Model -> String
test param =
  let
    val = "test"

    another = v{-caret-}

  in
    ""
`;

    await testCompletions(source, ["val"]);

    const source2 = `
--@ Test.elm    
module Test exposing (..)

test : Model -> String
test param =
  let
    val = "test"

  in
    "string" ++ v{-caret-}
`;

    await testCompletions(source2, ["val"]);
  });

  it("Imported values should have completions", async () => {
    const otherSource = `
--@ OtherModule.elm
module OtherModule exposing (Msg, TestType, testFunction)

type alias TestType =
    { prop1 : String
    , prop2 : Int
    }

type Msg
    = Msg1
    | Msg2

testFunction : String
testFunction =
    "Test"

localFunction : String
localFunction =
    ""

`;

    const source = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction)

test : Int -> String
test param =
  {-caret-}
`;

    await testCompletions(otherSource + source, [
      "testFunction",
      "OtherModule.testFunction",
    ]);

    const source2 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (..)

test : T{-caret-} -> String
test param =
  ""
`;

    await testCompletions(otherSource + source2, ["TestType"]);
  });

  it("Importing modules should have completions", async () => {
    const otherSource = `
--@ OtherModule.elm
module OtherModule exposing (..)

main = 
  ""
`;
    const source = `
--@ Test.elm
module Test exposing (..)

import {-caret-}
`;

    await testCompletions(
      otherSource + source,
      ["Test", "OtherModule"],
      "exactMatch",
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import T{-caret-}
`;

    await testCompletions(
      otherSource + source2,
      ["Test", "OtherModule"],
      "exactMatch",
    );
  });

  it("Exposing a value from another module should have completions", async () => {
    const otherSource = `
--@ OtherModule.elm
module OtherModule exposing (Msg, TestType, testFunction)

type alias TestType =
    { prop1 : String
    , prop2 : Int
    }

type Msg
    = Msg1
    | Msg2

testFunction : String
testFunction =
    "Test"

localFunction : String
localFunction =
    ""
`;

    const source = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing ({-caret-})
`;

    await testCompletions(
      otherSource + source,
      ["testFunction", "Msg", "TestType"],
      "exactMatch",
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, {-caret-})
`;

    await testCompletions(
      otherSource + source2,
      ["testFunction", "Msg", "TestType"],
      "exactMatch",
    );

    const source3 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, T{-caret-})
`;

    await testCompletions(
      otherSource + source3,
      ["testFunction", "Msg", "TestType"],
      "exactMatch",
    );
  });

  it("Module exposing list should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing ({-caret-})

testFunc : String
testFunc = 
  ""

type Msg = Msg1 | Msg2

type alias TestType = 
  { prop : String }
`;

    await testCompletions(
      source,
      ["testFunc", "Msg", "Msg(..)", "Msg1", "Msg2", "TestType"],
      "exactMatch",
    );
  });

  it("Function name should have completions in annotation and declaration", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

{-caret-} 
func =
  ""
    `;

    await testCompletions(source, ["func"], "exactMatch");

    const source2 = `
--@ Test.elm
module Test exposing (..)

func : String
f{-caret-} =  
  ""
`;

    await testCompletions(source2, ["func"], "exactMatch");
  });

  it("Case branch variables should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Msg = Msg1 String

func : Msg -> String
func msg = 
  case msg of
    Msg1 str ->
      s{-caret-}
`;

    await testCompletions(source, ["str"]);
  });

  it("There should be auto import completions from other modules", async () => {
    const source = `
--@ OtherModule.elm
module OtherModule exposing (testFunction, TestType)

testFunction : String
testFunction =
  ""

type alias TestType = {prop : String}

--@ Test.elm
module Test exposing (..)

func : String
func = 
  {-caret-}
`;

    await testCompletions(source, [
      {
        label: "testFunction",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (testFunction)\n",
          ),
        ],
      },
      {
        label: "TestType",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (TestType)\n",
          ),
        ],
      },
    ]);

    const source2 = `
--@ OtherModule.elm
module OtherModule exposing (Msg(..))

type Msg = Msg1 | Msg2

--@ Test.elm
module Test exposing (..)

func : String
func = 
  {-caret-}
`;

    await testCompletions(source2, [
      {
        label: "Msg",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (Msg)\n",
          ),
        ],
      },
      {
        label: "Msg1",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (Msg(..))\n",
          ),
        ],
      },
      {
        label: "Msg2",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (Msg(..))\n",
          ),
        ],
      },
    ]);
  });

  it("Module name with caret after dot should have completions", async () => {
    // TODO: Add auto import completions for modules and module values
    const source = `
--@ Data/User.elm
module Data.User exposing (..)

func : String
func = 
  ""
  
--@ Test.elm
module Test exposing (..)

import Data.User

test = 
  Data.{-caret-}
`;

    await testCompletions(
      source,
      ["Data.User.func"],
      "partialMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Data/User.elm
module Data.User exposing (..)

func : String
func = 
  ""

type alias TestType = { prop : String }
  
--@ Test.elm
module Test exposing (..)

import Data.User

test = 
  Data.User.{-caret-}
`;

    await testCompletions(
      source2,
      ["Data.User.func", "Data.User.TestType"],
      "partialMatch",
      "triggeredByDot",
    );
  });

  it("Qualified union constructor completion in expr should have completions", async () => {
    const source = `
--@ Page.elm
module Page exposing (..)

type Page = Home | Away

--@ Test.elm
import Page

defaultPage = 
  Page.{-caret-}
`;

    await testCompletions(
      source,
      ["Page.Home", "Page.Away"],
      "partialMatch",
      "triggeredByDot",
    );
  });

  xit("Chained record access should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Foo = { name : { first : String } }

f : Foo -> String
f foo =
    foo.name.{-caret-}
`;

    await testCompletions(source, ["first"], "exactMatch", "triggeredByDot");
  });

  it("Union constructor completions from pattern destructuring", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type MyState = State Int

f (S{-caret-} n) = n
`;

    await testCompletions(source, ["State"]);
  });

  it("Union type completions in a type annotation", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Page = Home

defaultPage : P{-caret-}
`;

    await testCompletions(source, ["Page"]);
  });

  it("Type alias completions in a type annotation", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias User = { name : String, age : Int }

viewUser : U{-caret-}
`;

    await testCompletions(source, ["User"]);
  });
});
