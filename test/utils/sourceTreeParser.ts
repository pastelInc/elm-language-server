import * as Path from "path";
import Parser from "web-tree-sitter";
import { IElmWorkspace } from "../../src/elmWorkspace";
import { MockElmWorkspace } from "./mockElmWorkspace";

export class SourceTreeParser {
  private parser?: Parser;

  public async init(): Promise<void> {
    if (this.parser) {
      return;
    }

    await Parser.init();
    const absolute = Path.join(__dirname, "../../tree-sitter-elm.wasm");
    const pathToWasm = Path.relative(process.cwd(), absolute);

    const language = await Parser.Language.load(pathToWasm);
    this.parser = new Parser();
    this.parser.setLanguage(language);
  }

  public getWorkspace(sources: { [K: string]: string }): IElmWorkspace {
    return new MockElmWorkspace(sources, this.parser!);
  }
}
