import * as cp from "child_process";
import * as readline from "readline";
import {
  Diagnostic,
  DiagnosticSeverity,
  IConnection,
  Range,
  Position,
} from "vscode-languageserver";
import URI from "vscode-uri";
import * as utils from "../../util/elmUtils";
import { Settings } from "../../util/settings";
import { IElmIssue } from "./diagnosticsProvider";
import { IForest } from "../../forest";
import { TreeUtils } from "../../util/treeUtils";

type INewTreeSitterCallback = (diagnostics: Map<string, Diagnostic[]>) => void;

export class TreeSitterDiagnostics {
  constructor(
    private connection: IConnection,
    private elmWorkspaceFolder: URI,
    private forest: IForest,
    private onNewDiagnostics: INewTreeSitterCallback,
  ) {}

  public createDiagnostics = (filePath: URI): void => {
    this.checkForErrors(
      this.connection,
      this.elmWorkspaceFolder.fsPath,
      filePath.fsPath,
    );
  };

  private async checkForErrors(
    connection: IConnection,
    rootPath: string,
    filename: string,
  ) {
    const settings = await Settings.getSettings(connection);

    const diagnostics: Map<string, Diagnostic[]> = new Map();
    this.forest.treeIndex.forEach(a => {
      const diag: Diagnostic[] = [];
      const errors = a.tree.rootNode.descendantsOfType("ERROR");
      errors.forEach(b => {
        if (b) {
          diag.push(
            Diagnostic.create(
              Range.create(
                Position.create(b.startPosition.row, b.startPosition.column),
                Position.create(b.endPosition.row, b.endPosition.column),
              ),
              b.text,
              DiagnosticSeverity.Error,
            ),
          );
        }
      });
      const missing = a.tree.rootNode.descendantsOfType("MISSING");
      missing.forEach(b => {
        if (b) {
          diag.push(
            Diagnostic.create(
              Range.create(
                Position.create(b.startPosition.row, b.startPosition.column),
                Position.create(b.endPosition.row, b.endPosition.column),
              ),
              b.text,
              DiagnosticSeverity.Error,
            ),
          );
        }
      });
      diagnostics.set(a.uri, diag);
    });

    this.onNewDiagnostics(diagnostics);
  }
}
