import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("typeResolveDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  xit(`test union type ref`, async () => {
    const source = `
type Page = Home
     --X
title : Page -> String
        --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test union type ref from module exposing list`, async () => {
    const source = `
module Main exposing (Page)
                      --^
type Page = Home
     --X
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor ref`, async () => {
    const source = `
type Page = Home
            --X
defaultPage = Home
              --^
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor pattern matching`, async () => {
    const source = `
type Page = Home
            --X
title page =
    case page of
        Home -> "home"
        --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref from module exposing list`, async () => {
    const source = `
module Main exposing (Page(Home))
                           --^
type Page = Home
            --X
`;
    await testBase.testDefinition(source);
  });

  xit(`test type alias ref from module exposing list`, async () => {
    const source = `
module Main exposing (Person)
                      --^
type alias Person = { name : String, age: Int }
           --X
`;
    await testBase.testDefinition(source);
  });

  xit(`test type alias ref in type annotation`, async () => {
    const source = `
type alias Person = { name : String, age: Int }
           --X
personToString : Person -> String
                 --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test type alias record constructor ref`, async () => {
    const source = `
type alias Person = { name : String, age: Int }
           --X
defaultPerson = Person "George" 42
                --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test parametric union type ref `, async () => {
    const source = `
type Page a = Home a
     --X
title : Page a -> String
        --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test parametric type alias ref `, async () => {
    const source = `
type alias Person a = { name : String, extra : a }
           --X
title : Person a -> String
        --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref should not resolve to a record constructor`, async () => {
    const source = `
    type alias User = { name : String, age : Int }
    foo user =
    case user of
    User -> "foo"
    --^unresolved
    `;
    await testBase.testDefinition(source);
  });

  xit(`test variable in union type`, async () => {
    const source = `
type Page a = Home a
        --X      --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test variable in a record type alias`, async () => {
    const source = `
type alias User details = { name : String, extra : details }
                --X                                --^
`;
    await testBase.testDefinition(source);
  });
});
