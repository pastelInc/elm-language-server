import globby from "globby";
import path from "path";
import {
  Connection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { WorkDoneProgress } from "vscode-languageserver/lib/progress";
import { URI } from "vscode-uri";
import Parser from "web-tree-sitter";
import { CapabilityCalculator } from "./capabilityCalculator";
import { ElmWorkspace } from "./elmWorkspace";
import {
  ASTProvider,
  CodeActionProvider,
  CodeLensProvider,
  CompletionProvider,
  DefinitionProvider,
  DiagnosticsProvider,
  DocumentFormattingProvider,
  DocumentSymbolProvider,
  ElmAnalyseDiagnostics,
  ElmMakeDiagnostics,
  FoldingRangeProvider,
  HoverProvider,
  ReferencesProvider,
  RenameProvider,
  SelectionRangeProvider,
  WorkspaceSymbolProvider,
} from "./providers";
import { DocumentEvents } from "./util/documentEvents";
import { Settings } from "./util/settings";
import { TextDocumentEvents } from "./util/textDocumentEvents";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
  init(): Promise<void>;
  registerInitializedProviders(): void;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;
  private settings: Settings;
  private elmWorkspaces: ElmWorkspace[] = [];

  constructor(
    private connection: Connection,
    private params: InitializeParams,
    private parser: Parser,
    private progress: WorkDoneProgress,
  ) {
    this.calculator = new CapabilityCalculator(params.capabilities);
    const initializationOptions = this.params.initializationOptions ?? {};
    this.settings = new Settings(
      this.connection,
      initializationOptions,
      params.capabilities,
    );

    const uri = this.getWorkspaceUri(params);

    if (uri) {
      // Cleanup the path on windows, as globby does not like backslashes
      const globUri = uri.fsPath.replace(/\\/g, "/");
      const elmJsonGlob = `${globUri}/**/{elm.json|elm-package.json}`;

      const elmJsons = globby.sync(
        [elmJsonGlob, "!**/node_modules/**", "!**/elm-stuff/**"],
        { suppressErrors: true },
      );
      if (elmJsons.length > 0) {
        connection.console.info(
          `Found ${elmJsons.length} elm.json files for workspace ${globUri}`,
        );
        const listOfElmJsonFolders = elmJsons.map((a) =>
          this.getElmJsonFolder(a),
        );
        const topLevelElmJsons: Map<string, URI> = this.findTopLevelFolders(
          listOfElmJsonFolders,
        );
        connection.console.info(
          `Found ${topLevelElmJsons.size} unique elmWorkspaces for workspace ${globUri}`,
        );

        topLevelElmJsons.forEach((elmWorkspace) => {
          this.elmWorkspaces.push(
            new ElmWorkspace(
              elmWorkspace,
              connection,
              this.settings,
              this.parser,
            ),
          );
        });
      } else {
        this.connection.window.showErrorMessage(
          "No elm.json found. Please run 'elm init' in your main directory.",
        );
        this.connection.console.info(`No elm.json found`);
      }
    } else {
      this.connection.console.info(`No workspace was setup by the client`);
    }
  }

  get capabilities(): InitializeResult {
    return {
      capabilities: this.calculator.capabilities,
    };
  }

  public async init(): Promise<void> {
    this.progress.begin("Indexing Elm", 0);
    await Promise.all(
      this.elmWorkspaces
        .map((ws) => ({ ws, indexedPercent: 0 }))
        .map((indexingWs, _, all) =>
          indexingWs.ws.init((percent: number) => {
            // update progress for this workspace
            indexingWs.indexedPercent = percent;

            // report average progress across all workspaces
            const avgIndexed =
              all.reduce((sum, { indexedPercent }) => sum + indexedPercent, 0) /
              all.length;
            this.progress.report(avgIndexed, `${Math.round(avgIndexed)}%`);
          }),
        ),
    );
    this.progress.done();
  }

  public async registerInitializedProviders(): Promise<void> {
    // We can now query the client for up to date settings
    this.settings.initFinished();

    const documentEvents = new DocumentEvents(this.connection);
    const textDocumentEvents = new TextDocumentEvents(
      TextDocument,
      documentEvents,
    );

    const settings = await this.settings.getClientSettings();

    const documentFormattingProvider = new DocumentFormattingProvider(
      this.connection,
      this.elmWorkspaces,
      textDocumentEvents,
      this.settings,
    );

    const elmAnalyse =
      settings.elmAnalyseTrigger !== "never"
        ? new ElmAnalyseDiagnostics(
            this.connection,
            this.elmWorkspaces,
            textDocumentEvents,
            this.settings,
            documentFormattingProvider,
          )
        : null;

    const elmMake = new ElmMakeDiagnostics(
      this.connection,
      this.elmWorkspaces,
      this.settings,
    );

    new DiagnosticsProvider(
      this.connection,
      this.elmWorkspaces,
      this.settings,
      textDocumentEvents,
      elmAnalyse,
      elmMake,
    );

    new CodeActionProvider(
      this.connection,
      this.elmWorkspaces,
      this.settings,
      elmAnalyse,
      elmMake,
    );

    new ASTProvider(
      this.connection,
      this.elmWorkspaces,
      documentEvents,
      this.parser,
    );
    new FoldingRangeProvider(this.connection, this.elmWorkspaces);
    new CompletionProvider(this.connection, this.elmWorkspaces);
    new HoverProvider(this.connection, this.elmWorkspaces);
    new DefinitionProvider(this.connection, this.elmWorkspaces);
    new ReferencesProvider(this.connection, this.elmWorkspaces);
    new DocumentSymbolProvider(this.connection, this.elmWorkspaces);
    new WorkspaceSymbolProvider(this.connection, this.elmWorkspaces);
    new CodeLensProvider(this.connection, this.elmWorkspaces, this.settings);
    new SelectionRangeProvider(this.connection, this.elmWorkspaces);
    new RenameProvider(this.connection, this.elmWorkspaces);
  }

  private getElmJsonFolder(uri: string): URI {
    return URI.file(path.dirname(uri));
  }

  private findTopLevelFolders(listOfElmJsonFolders: URI[]) {
    const result: Map<string, URI> = new Map<string, URI>();
    listOfElmJsonFolders.forEach((uri) => {
      result.set(uri.fsPath, uri);
    });

    listOfElmJsonFolders.forEach((parentUri) => {
      listOfElmJsonFolders.forEach((childUri) => {
        const parentPath = parentUri.fsPath + path.sep;
        const childPath = childUri.fsPath + path.sep;
        if (parentPath !== childPath && childPath.startsWith(parentPath)) {
          result.delete(childUri.fsPath);
        }
      });
    });

    return result;
  }

  private getWorkspaceUri(params: InitializeParams) {
    if (params.rootUri) {
      return URI.parse(params.rootUri);
    } else if (params.rootPath) {
      return URI.file(params.rootPath);
    } else {
      return null;
    }
  }
}
