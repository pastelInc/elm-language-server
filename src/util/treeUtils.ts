import { Position } from "vscode-languageserver";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IImport, IImports } from "../imports";

export type NodeType =
  | "Function"
  | "FunctionParameter"
  | "TypeAlias"
  | "Type"
  | "Operator"
  | "Module"
  | "UnionConstructor";

export type Exposing = Array<{
  name: string;
  syntaxNode: SyntaxNode;
  type: NodeType;
  exposedUnionConstructors?: Array<{
    name: string;
    syntaxNode: SyntaxNode;
    accessibleWithoutPrefix: boolean;
  }>;
}>;

export class TreeUtils {
  public static getModuleNameNode(tree: Tree): SyntaxNode | undefined {
    const moduleDeclaration:
      | SyntaxNode
      | undefined = this.findModuleDeclaration(tree);
    if (moduleDeclaration) {
      return this.findFirstNamedChildOfType(
        "upper_case_qid",
        moduleDeclaration,
      );
    }
  }

  public static getModuleNameAndExposing(
    tree: Tree,
  ): { moduleName: string; exposing: Exposing } | undefined {
    const moduleDeclaration:
      | SyntaxNode
      | undefined = this.findModuleDeclaration(tree);
    if (moduleDeclaration) {
      const moduleName = this.findFirstNamedChildOfType(
        "upper_case_qid",
        moduleDeclaration,
      );

      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        moduleDeclaration,
      );
      if (exposingList) {
        const exposed: Exposing = [];
        if (TreeUtils.findFirstNamedChildOfType("double_dot", exposingList)) {
          if (moduleName) {
            const functions = TreeUtils.descendantsOfType(
              tree.rootNode,
              "value_declaration",
            );
            if (functions) {
              functions.forEach(elmFunction => {
                const declaration = TreeUtils.findFirstNamedChildOfType(
                  "function_declaration_left",
                  elmFunction,
                );
                if (declaration && declaration.firstNamedChild) {
                  const functionName = declaration.firstNamedChild.text;
                  exposed.push({
                    exposedUnionConstructors: undefined,
                    name: functionName,
                    syntaxNode: declaration,
                    type: "Function",
                  });
                }
              });
            }

            const typeAliases = this.findAllTypeAliasDeclarations(tree);
            if (typeAliases) {
              typeAliases.forEach(typeAlias => {
                const name = TreeUtils.findFirstNamedChildOfType(
                  "upper_case_identifier",
                  typeAlias,
                );
                if (name) {
                  exposed.push({
                    exposedUnionConstructors: undefined,
                    name: name.text,
                    syntaxNode: typeAlias,
                    type: "TypeAlias",
                  });
                }
              });
            }

            const typeDeclarations = this.findAllTypeDeclarations(tree);
            if (typeDeclarations) {
              typeDeclarations.forEach(typeDeclaration => {
                const unionConstructors: Array<{
                  name: string;
                  syntaxNode: SyntaxNode;
                  accessibleWithoutPrefix: boolean;
                }> = [];
                TreeUtils.descendantsOfType(
                  typeDeclaration,
                  "union_variant",
                ).forEach(variant => {
                  const name = TreeUtils.findFirstNamedChildOfType(
                    "upper_case_identifier",
                    variant,
                  );
                  if (name && name.parent) {
                    unionConstructors.push({
                      accessibleWithoutPrefix: false,
                      name: name.text,
                      syntaxNode: name.parent,
                    });
                  }
                });
                const typeDeclarationName = TreeUtils.findFirstNamedChildOfType(
                  "upper_case_identifier",
                  typeDeclaration,
                );
                if (typeDeclarationName) {
                  exposed.push({
                    exposedUnionConstructors: unionConstructors,
                    name: typeDeclarationName.text,
                    syntaxNode: typeDeclaration,
                    type: "Type",
                  });
                }
              });
            }

            return { moduleName: moduleName.text, exposing: exposed };
          }
        } else {
          const exposedOperators = TreeUtils.descendantsOfType(
            exposingList,
            "operator_identifier",
          );

          for (const value of exposedOperators) {
            const functionNode = this.findOperator(tree, value.text);

            if (functionNode) {
              exposed.push({
                exposedUnionConstructors: undefined,
                name: value.text,
                syntaxNode: functionNode,
                type: "Operator",
              });
            }
          }

          const exposedValues = TreeUtils.descendantsOfType(
            exposingList,
            "exposed_value",
          );

          for (const value of exposedValues) {
            const functionNode = this.findFunction(tree.rootNode, value.text);
            if (functionNode) {
              exposed.push({
                exposedUnionConstructors: undefined,
                name: value.text,
                syntaxNode: functionNode,
                type: "Function",
              });
            }
          }

          const exposedTypes = TreeUtils.descendantsOfType(
            exposingList,
            "exposed_type",
          );
          for (const value of exposedTypes) {
            const doubleDot = TreeUtils.descendantsOfType(value, "double_dot");
            if (doubleDot.length > 0) {
              const name = TreeUtils.findFirstNamedChildOfType(
                "upper_case_identifier",
                value,
              );

              if (name) {
                const typeDeclaration = this.findTypeDeclaration(
                  tree,
                  name.text,
                );
                if (typeDeclaration) {
                  const unionConstructors: Array<{
                    name: string;
                    syntaxNode: SyntaxNode;
                    accessibleWithoutPrefix: boolean;
                  }> = [];
                  TreeUtils.descendantsOfType(
                    typeDeclaration,
                    "union_variant",
                  ).forEach(variant => {
                    const unionConstructorName = TreeUtils.findFirstNamedChildOfType(
                      "upper_case_identifier",
                      variant,
                    );
                    if (unionConstructorName && unionConstructorName.parent) {
                      unionConstructors.push({
                        accessibleWithoutPrefix: true,
                        name: unionConstructorName.text,
                        syntaxNode: unionConstructorName.parent,
                      });
                    }
                  });

                  exposed.push({
                    exposedUnionConstructors: unionConstructors,
                    name: name.text,
                    syntaxNode: typeDeclaration,
                    type: "Type",
                  });
                }
              }
            } else {
              const typeNode = this.findTypeDeclaration(tree, value.text);

              if (typeNode) {
                exposed.push({
                  exposedUnionConstructors: undefined,
                  name: value.text,
                  syntaxNode: typeNode,
                  type: "Type",
                });
              } else {
                const typeAliasNode = this.findTypeAliasDeclaration(
                  tree,
                  value.text,
                );
                if (typeAliasNode) {
                  exposed.push({
                    exposedUnionConstructors: undefined,
                    name: value.text,
                    syntaxNode: typeAliasNode,
                    type: "TypeAlias",
                  });
                }
              }
            }
          }

          if (moduleName) {
            return { moduleName: moduleName.text, exposing: exposed };
          }
        }
      }
    }
  }

  public static findFirstNamedChildOfType(
    type: string,
    node: SyntaxNode,
  ): SyntaxNode | undefined {
    return node.children.find(child => child.type === type);
  }

  public static findAllNamedChildrenOfType(
    type: string | string[],
    node: SyntaxNode,
  ): SyntaxNode[] | undefined {
    const result = Array.isArray(type)
      ? node.children.filter(child => type.includes(child.type))
      : node.children.filter(child => child.type === type);

    return result.length === 0 ? undefined : result;
  }

  public static findExposedFunctionNode(
    node: SyntaxNode,
    functionName: string,
  ): SyntaxNode | undefined {
    if (node) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        node,
      );
      if (exposingList) {
        const doubleDot = this.findFirstNamedChildOfType(
          "double_dot",
          exposingList,
        );
        if (doubleDot) {
          return undefined;
        }
      }
      const descendants = TreeUtils.descendantsOfType(node, "exposed_value");
      return descendants.find(desc => desc.text === functionName);
    }
  }

  public static isExposedFunction(tree: Tree, functionName: string) {
    const module = this.findModuleDeclaration(tree);
    if (module) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        module,
      );
      if (exposingList) {
        const doubleDot = this.findFirstNamedChildOfType(
          "double_dot",
          exposingList,
        );
        if (doubleDot) {
          return true;
        }
      }
      const descendants = TreeUtils.descendantsOfType(module, "exposed_value");
      return descendants.some(desc => desc.text === functionName);
    }
    return false;
  }

  public static findExposedTypeOrTypeAliasNode(
    node: SyntaxNode,
    typeName: string,
  ): SyntaxNode | undefined {
    if (node) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        node,
      );
      if (exposingList) {
        const doubleDot = this.findFirstNamedChildOfType(
          "double_dot",
          exposingList,
        );
        if (doubleDot) {
          return undefined;
        }
      }
      const descendants = TreeUtils.descendantsOfType(node, "exposed_type");
      const match = descendants.find(desc => desc.text.startsWith(typeName));
      if (match && match.firstNamedChild) {
        return match.firstNamedChild;
      }
    }
    return undefined;
  }

  public static isExposedTypeOrTypeAlias(tree: Tree, typeName: string) {
    const module = this.findModuleDeclaration(tree);
    if (module) {
      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        module,
      );
      if (exposingList) {
        const doubleDot = this.findFirstNamedChildOfType(
          "double_dot",
          exposingList,
        );
        if (doubleDot) {
          return true;
        }
      }
      const descendants = TreeUtils.descendantsOfType(module, "exposed_type");
      return descendants.some(desc => desc.text.startsWith(typeName));
    }
    return false;
  }

  public static findUnionConstructor(
    tree: Tree,
    unionConstructorName: string,
  ): SyntaxNode | undefined {
    const unionVariants = TreeUtils.descendantsOfType(
      tree.rootNode,
      "union_variant",
    );
    if (unionVariants.length > 0) {
      return unionVariants.find(
        a =>
          a.firstChild !== null &&
          a.firstChild.type === "upper_case_identifier" &&
          a.firstChild.text === unionConstructorName,
      );
    }
  }

  public static findUnionConstructorCalls(
    tree: Tree,
    unionConstructorName: string,
  ): SyntaxNode[] | undefined {
    const upperCaseQid = TreeUtils.descendantsOfType(
      tree.rootNode,
      "upper_case_qid",
    );
    if (upperCaseQid.length > 0) {
      const result = upperCaseQid.filter(
        a =>
          a.firstChild !== null &&
          a.firstChild.type === "upper_case_identifier" &&
          a.firstChild.text === unionConstructorName &&
          a.parent &&
          a.parent.type !== "type_ref",
      );
      return result.length === 0 ? undefined : result;
    }
  }

  public static findFunction(
    tree: SyntaxNode,
    functionName: string,
  ): SyntaxNode | undefined {
    const functions = tree.descendantsOfType("value_declaration");
    if (functions) {
      return functions.find(elmFunction => {
        const declaration = TreeUtils.findFirstNamedChildOfType(
          "function_declaration_left",
          elmFunction,
        );
        if (declaration && declaration.firstNamedChild) {
          return functionName === declaration.firstNamedChild.text;
        }
        return false;
      });
    }
  }

  public static findOperator(
    tree: Tree,
    operatorName: string,
  ): SyntaxNode | undefined {
    const infixDeclarations = this.findAllNamedChildrenOfType(
      "infix_declaration",
      tree.rootNode,
    );
    if (infixDeclarations) {
      const operatorNode = infixDeclarations.find(a => {
        const operator = TreeUtils.findFirstNamedChildOfType(
          "operator_identifier",
          a,
        );
        if (operator) {
          return operator.text === operatorName;
        }
        return false;
      });

      if (operatorNode) {
        const functionReference = TreeUtils.findFirstNamedChildOfType(
          "value_expr",
          operatorNode,
        );
        if (functionReference) {
          return this.findFunction(tree.rootNode, functionReference.text);
        }
      }
    }
  }

  public static findTypeDeclaration(
    tree: Tree,
    typeName: string,
  ): SyntaxNode | undefined {
    const types = this.findAllTypeDeclarations(tree);
    if (types) {
      return types.find(
        a =>
          a.children.length > 1 &&
          a.children[1].type === "upper_case_identifier" &&
          a.children[1].text === typeName,
      );
    }
  }

  public static findModuleDeclaration(tree: Tree): SyntaxNode | undefined {
    return this.findFirstNamedChildOfType("module_declaration", tree.rootNode);
  }

  public static findTypeAliasDeclaration(
    tree: Tree,
    typeAliasName: string,
  ): SyntaxNode | undefined {
    const typeAliases = this.findAllTypeAliasDeclarations(tree);
    if (typeAliases) {
      return typeAliases.find(
        a =>
          a.children.length > 2 &&
          a.children[2].type === "upper_case_identifier" &&
          a.children[2].text === typeAliasName,
      );
    }
  }

  public static findAllTopLeverFunctionDeclarations(
    tree: Tree,
  ): SyntaxNode[] | undefined {
    const result = tree.rootNode.children.filter(
      a => a.type === "value_declaration",
    );
    return result.length === 0 ? undefined : result;
  }

  public static findAllTypeOrTypeAliasCalls(
    tree: Tree,
  ): SyntaxNode[] | undefined {
    const result: SyntaxNode[] = [];
    const typeRefs = TreeUtils.descendantsOfType(tree.rootNode, "type_ref");
    if (typeRefs.length > 0) {
      typeRefs.forEach(a => {
        if (
          a.firstChild &&
          a.firstChild.type === "upper_case_qid" &&
          a.firstChild.firstChild
        ) {
          result.push(a.firstChild);
        }
      });
    }

    return result.length === 0 ? undefined : result;
  }

  public static getFunctionNameNodeFromDefinition(node: SyntaxNode) {
    const declaration = TreeUtils.findFirstNamedChildOfType(
      "function_declaration_left",
      node,
    );
    if (declaration && declaration.firstNamedChild) {
      return declaration.firstNamedChild;
    }
  }

  public static getTypeOrTypeAliasNameNodeFromDefinition(node: SyntaxNode) {
    return TreeUtils.findFirstNamedChildOfType("upper_case_identifier", node);
  }

  public static findTypeOrTypeAliasCalls(
    tree: Tree,
    typeOrTypeAliasName: string,
  ): SyntaxNode[] | undefined {
    const typeOrTypeAliasNodes = this.findAllTypeOrTypeAliasCalls(tree);
    if (typeOrTypeAliasNodes) {
      const result: SyntaxNode[] = typeOrTypeAliasNodes.filter(a => {
        return a.text === typeOrTypeAliasName;
      });

      return result.length === 0 ? undefined : result;
    }
  }

  public static findAllTypeDeclarations(tree: Tree): SyntaxNode[] | undefined {
    return this.findAllNamedChildrenOfType("type_declaration", tree.rootNode);
  }

  public static findAllTypeAliasDeclarations(
    tree: Tree,
  ): SyntaxNode[] | undefined {
    return this.findAllNamedChildrenOfType(
      "type_alias_declaration",
      tree.rootNode,
    );
  }

  public static findLowercaseQidNode(
    tree: SyntaxNode,
    nodeAtPosition: SyntaxNode,
  ): SyntaxNode | undefined {
    return this.findFunction(tree, nodeAtPosition.text);
  }

  public static findUppercaseQidNode(
    tree: Tree,
    nodeAtPosition: SyntaxNode,
  ): { node: SyntaxNode; nodeType: NodeType } | undefined {
    let definitionNode = this.findTypeDeclaration(tree, nodeAtPosition.text);
    if (definitionNode) {
      return { node: definitionNode, nodeType: "Type" };
    }
    definitionNode = this.findTypeAliasDeclaration(tree, nodeAtPosition.text);
    if (definitionNode) {
      return { node: definitionNode, nodeType: "TypeAlias" };
    }
    definitionNode = this.findUnionConstructor(tree, nodeAtPosition.text);
    if (definitionNode) {
      return { node: definitionNode, nodeType: "UnionConstructor" };
    }
  }

  public static findDefinitionNodeByReferencingNode(
    nodeAtPosition: SyntaxNode,
    uri: string,
    tree: Tree,
    imports: IImports,
  ): { node: SyntaxNode; uri: string; nodeType: NodeType } | undefined {
    if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "upper_case_qid" &&
      nodeAtPosition.parent.previousNamedSibling &&
      nodeAtPosition.parent.previousNamedSibling.type === "module"
    ) {
      const moduleNode = nodeAtPosition.parent.parent;

      if (moduleNode) {
        return {
          node: moduleNode,
          nodeType: "Module",
          uri,
        };
      }
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "upper_case_qid" &&
      nodeAtPosition.parent.previousNamedSibling &&
      nodeAtPosition.parent.previousNamedSibling.type === "import"
    ) {
      const upperCaseQid = nodeAtPosition.parent;
      const definitionFromOtherFile = this.findImportFromImportList(
        uri,
        upperCaseQid.text,
        "Module",
        imports,
      );
      if (definitionFromOtherFile) {
        return {
          node: definitionFromOtherFile.node,
          nodeType: "Module",
          uri: definitionFromOtherFile.fromUri,
        };
      }
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "function_declaration_left"
    ) {
      const definitionNode =
        nodeAtPosition.parent.parent &&
        nodeAtPosition.parent.parent.parent &&
        nodeAtPosition.parent.parent.parent.type === "let"
          ? TreeUtils.findLowercaseQidNode(
              nodeAtPosition.parent.parent.parent,
              nodeAtPosition,
            )
          : TreeUtils.findLowercaseQidNode(tree.rootNode, nodeAtPosition);

      if (definitionNode) {
        return {
          node: definitionNode,
          nodeType: "Function",
          uri,
        };
      }
    } else if (
      (nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "exposed_value" &&
        nodeAtPosition.parent.parent &&
        nodeAtPosition.parent.parent.parent &&
        nodeAtPosition.parent.parent.parent.type === "module_declaration") ||
      (nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "type_annotation")
    ) {
      const definitionNode = TreeUtils.findLowercaseQidNode(
        tree.rootNode,
        nodeAtPosition,
      );

      if (definitionNode) {
        return {
          node: definitionNode,
          nodeType: "Function",
          uri,
        };
      }
    } else if (
      (nodeAtPosition.parent &&
        nodeAtPosition.parent.type === "exposed_type" &&
        nodeAtPosition.parent.parent &&
        nodeAtPosition.parent.parent.parent &&
        nodeAtPosition.parent.parent.parent.type === "module_declaration") ||
      (nodeAtPosition.previousNamedSibling &&
        (nodeAtPosition.previousNamedSibling.type === "type" ||
          nodeAtPosition.previousNamedSibling.type === "alias"))
    ) {
      const upperCaseQid = nodeAtPosition;
      const definitionNode = TreeUtils.findUppercaseQidNode(tree, upperCaseQid);

      if (definitionNode) {
        return {
          node: definitionNode.node,
          nodeType: definitionNode.nodeType,
          uri,
        };
      }
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "exposed_value" &&
      nodeAtPosition.parent.parent &&
      nodeAtPosition.parent.parent.parent &&
      nodeAtPosition.parent.parent.parent.type === "import_clause"
    ) {
      const definitionFromOtherFile = this.findImportFromImportList(
        uri,
        nodeAtPosition.text,
        "Function",
        imports,
      );

      if (definitionFromOtherFile) {
        return {
          node: definitionFromOtherFile.node,
          nodeType: "Function",
          uri: definitionFromOtherFile.fromUri,
        };
      }
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "exposed_type" &&
      nodeAtPosition.parent.parent &&
      nodeAtPosition.parent.parent.parent &&
      nodeAtPosition.parent.parent.parent.type === "import_clause"
    ) {
      const upperCaseQid = nodeAtPosition;
      let definitionFromOtherFile = this.findImportFromImportList(
        uri,
        upperCaseQid.text,
        "Type",
        imports,
      );
      if (definitionFromOtherFile) {
        return {
          node: definitionFromOtherFile.node,
          nodeType: "Type",
          uri: definitionFromOtherFile.fromUri,
        };
      }

      definitionFromOtherFile = this.findImportFromImportList(
        uri,
        upperCaseQid.text,
        "TypeAlias",
        imports,
      );
      if (definitionFromOtherFile) {
        return {
          node: definitionFromOtherFile.node,
          nodeType: "TypeAlias",
          uri: definitionFromOtherFile.fromUri,
        };
      }
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "union_variant"
    ) {
      const definitionNode = nodeAtPosition.parent;
      return {
        node: definitionNode,
        nodeType: "UnionConstructor",
        uri,
      };
    } else if (
      nodeAtPosition.parent &&
      nodeAtPosition.parent.type === "upper_case_qid"
    ) {
      const upperCaseQid = nodeAtPosition.parent;
      const definitionNode = TreeUtils.findUppercaseQidNode(tree, upperCaseQid);

      let definitionFromOtherFile;
      if (!definitionNode) {
        definitionFromOtherFile = this.findImportFromImportList(
          uri,
          upperCaseQid.text,
          "Type",
          imports,
        );
        if (definitionFromOtherFile) {
          return {
            node: definitionFromOtherFile.node,
            nodeType: "Type",
            uri: definitionFromOtherFile.fromUri,
          };
        }

        definitionFromOtherFile = this.findImportFromImportList(
          uri,
          upperCaseQid.text,
          "TypeAlias",
          imports,
        );
        if (definitionFromOtherFile) {
          return {
            node: definitionFromOtherFile.node,
            nodeType: "TypeAlias",
            uri: definitionFromOtherFile.fromUri,
          };
        }

        definitionFromOtherFile = this.findImportFromImportList(
          uri,
          upperCaseQid.text,
          "UnionConstructor",
          imports,
        );
        if (definitionFromOtherFile) {
          return {
            node: definitionFromOtherFile.node,
            nodeType: "UnionConstructor",
            uri: definitionFromOtherFile.fromUri,
          };
        }
      }
      if (definitionNode) {
        return {
          node: definitionNode.node,
          nodeType: definitionNode.nodeType,
          uri,
        };
      }
    } else if (
      nodeAtPosition.parent &&
      (nodeAtPosition.parent.type === "value_qid" ||
        nodeAtPosition.parent.type === "lower_pattern" ||
        nodeAtPosition.parent.type === "record_base_identifier")
    ) {
      const functionParameter = this.findFunctionParameterDefinition(
        nodeAtPosition,
        nodeAtPosition.text,
      );

      if (functionParameter) {
        return {
          node: functionParameter,
          nodeType: "FunctionParameter",
          uri,
        };
      }

      const definitionNode = TreeUtils.findLowercaseQidNode(
        tree.rootNode,
        nodeAtPosition.parent,
      );

      if (!definitionNode) {
        const definitionFromOtherFile = this.findImportFromImportList(
          uri,
          nodeAtPosition.parent.text,
          "Function",
          imports,
        );

        if (definitionFromOtherFile) {
          return {
            node: definitionFromOtherFile.node,
            nodeType: "Function",
            uri: definitionFromOtherFile.fromUri,
          };
        }
      }

      if (definitionNode) {
        return {
          node: definitionNode,
          nodeType: "Function",
          uri,
        };
      }
    } else if (nodeAtPosition.type === "operator_identifier") {
      const definitionNode = TreeUtils.findOperator(tree, nodeAtPosition.text);

      if (!definitionNode) {
        const definitionFromOtherFile = this.findImportFromImportList(
          uri,
          nodeAtPosition.text,
          "Operator",
          imports,
        );

        if (definitionFromOtherFile) {
          return {
            node: definitionFromOtherFile.node,
            nodeType: "Operator",
            uri: definitionFromOtherFile.fromUri,
          };
        }
      }
      if (definitionNode) {
        return { node: definitionNode, uri, nodeType: "Operator" };
      }
    }
  }

  public static findFunctionParameterDefinition(
    node: SyntaxNode,
    functionParameterName: string,
  ): SyntaxNode | undefined {
    if (node.parent) {
      if (
        node.parent.type === "value_declaration" &&
        node.parent.firstChild &&
        node.parent.firstChild.type === "function_declaration_left"
      ) {
        if (node.parent.firstChild) {
          const match = node.parent.firstChild.children.find(
            a => a.type === "lower_pattern" && a.text === functionParameterName,
          );
          if (match) {
            return match;
          } else {
            return this.findFunctionParameterDefinition(
              node.parent,
              functionParameterName,
            );
          }
        }
      } else {
        return this.findFunctionParameterDefinition(
          node.parent,
          functionParameterName,
        );
      }
    }
  }

  public static findImportFromImportList(
    uri: string,
    nodeName: string,
    type: NodeType,
    imports: IImports,
  ): IImport | undefined {
    if (imports.imports) {
      const allFileImports = imports.imports[uri];
      if (allFileImports) {
        const foundNode = allFileImports.find(
          a => a.alias === nodeName && a.type === type,
        );
        if (foundNode) {
          return foundNode;
        }
      }
    }
  }

  public static findImportClauseByName(
    tree: Tree,
    moduleName: string,
  ): SyntaxNode | undefined {
    const allImports = this.findAllImportNameNodes(tree);
    if (allImports) {
      return allImports.find(
        a =>
          a.children.length > 1 &&
          a.children[1].type === "upper_case_qid" &&
          a.children[1].text === moduleName,
      );
    }
  }

  public static findImportNameNode(
    tree: Tree,
    moduleName: string,
  ): SyntaxNode | undefined {
    const allImports = this.findAllImportNameNodes(tree);
    if (allImports) {
      const match = allImports.find(
        a =>
          a.children.length > 1 &&
          a.children[1].type === "upper_case_qid" &&
          a.children[1].text === moduleName,
      );
      if (match) {
        return match.children[1];
      }
    }
  }

  public static getTypeOrTypeAliasOfFunctionParameter(
    node: SyntaxNode | undefined,
  ): SyntaxNode | undefined {
    if (
      node &&
      node.parent &&
      node.parent.parent &&
      node.parent.parent.previousNamedSibling &&
      node.parent.parent.previousNamedSibling.type === "type_annotation" &&
      node.parent.parent.previousNamedSibling.lastNamedChild
    ) {
      const functionParameterNodes = TreeUtils.findAllNamedChildrenOfType(
        ["pattern", "lower_pattern"],
        node.parent,
      );
      if (functionParameterNodes) {
        const matchIndex = functionParameterNodes.findIndex(
          a => a.text === node.text,
        );

        const typeAnnotationNodes = TreeUtils.findAllNamedChildrenOfType(
          ["type_ref", "type_expression"],
          node.parent.parent.previousNamedSibling.lastNamedChild,
        );
        if (typeAnnotationNodes) {
          return typeAnnotationNodes[matchIndex];
        }
      }
    }
  }

  public static getAllFieldsFromTypeAlias(
    node: SyntaxNode | undefined,
  ): Array<{ field: string; type: string }> | undefined {
    const result: Array<{ field: string; type: string }> = [];
    if (node) {
      const fieldTypes = TreeUtils.descendantsOfType(node, "field_type");
      if (fieldTypes.length > 0) {
        fieldTypes.forEach(a => {
          const fieldName = TreeUtils.findFirstNamedChildOfType(
            "lower_case_identifier",
            a,
          );
          const typeExpression = TreeUtils.findFirstNamedChildOfType(
            "type_expression",
            a,
          );
          if (fieldName && typeExpression) {
            result.push({ field: fieldName.text, type: typeExpression.text });
          }
        });
      }
    }
    return result.length === 0 ? undefined : result;
  }

  public static descendantsOfType(
    node: SyntaxNode,
    type: string,
  ): SyntaxNode[] {
    return node.descendantsOfType(type);
  }

  public static getNamedDescendantForPosition(
    node: SyntaxNode,
    position: Position,
  ): SyntaxNode {
    const previousCharColumn =
      position.character === 0 ? 0 : position.character - 1;
    const charBeforeCursor = node.text
      .split("\n")
      [position.line].substring(previousCharColumn, position.character);

    if (charBeforeCursor === " " || charBeforeCursor === "") {
      return node.namedDescendantForPosition({
        column: position.character,
        row: position.line,
      });
    } else {
      return node.namedDescendantForPosition(
        {
          column: previousCharColumn,
          row: position.line,
        },
        {
          column: position.character,
          row: position.line,
        },
      );
    }
  }

  public static getNamedDescendantForLineBeforePosition(
    node: SyntaxNode,
    position: Position,
  ): SyntaxNode {
    const previousLine = position.line === 0 ? 0 : position.line - 1;

    return node.namedDescendantForPosition({
      column: 0,
      row: previousLine,
    });
  }

  public static getNamedDescendantForLineAfterPosition(
    node: SyntaxNode,
    position: Position,
  ): SyntaxNode {
    const followingLine = position.line + 1;

    return node.namedDescendantForPosition({
      column: 0,
      row: followingLine,
    });
  }

  // tslint:disable-next-line: no-identical-functions
  private static findAllImportNameNodes(tree: Tree): SyntaxNode[] | undefined {
    const result = tree.rootNode.children.filter(
      a => a.type === "import_clause",
    );

    return result.length === 0 ? undefined : result;
  }
}
