import { SyntaxNode, Tree } from "tree-sitter";

export type NodeType = "Function" | "TypeAlias" | "Type" | "Operator";

export type Exposing = Array<{
  name: string;
  syntaxNode: SyntaxNode;
  type: NodeType;
  exposedUnionConstructors: string[] | undefined; // Only used for types
}>;

export class TreeUtils {
  public static NodeType: any;
  public static getModuleName(
    tree: Tree,
  ): { moduleName: string; exposing: Exposing } | undefined {
    const moduleDeclaration:
      | SyntaxNode
      | undefined = this.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
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
            const functions = tree.rootNode.descendantsOfType(
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
                const unionCostructors: string[] = [];
                typeDeclaration
                  .descendantsOfType("union_variant")
                  .forEach(variant => {
                    const name = TreeUtils.findFirstNamedChildOfType(
                      "upper_case_identifier",
                      variant,
                    );
                    if (name) {
                      unionCostructors.push(name.text);
                    }
                  });
                const typeDeclarationName = TreeUtils.findFirstNamedChildOfType(
                  "upper_case_identifier",
                  typeDeclaration,
                );
                if (typeDeclarationName) {
                  exposed.push({
                    exposedUnionConstructors: unionCostructors,
                    name: typeDeclarationName.text,
                    syntaxNode: typeDeclaration,
                    type: "Type",
                  });
                }
              });

              return { moduleName: moduleName.text, exposing: exposed };
            }
          }
        } else {
          const exposedOperators = exposingList.descendantsOfType(
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

          const exposedValues = exposingList.descendantsOfType("exposed_value");

          for (const value of exposedValues) {
            const functionNode = this.findFunction(tree, value.text);
            if (functionNode) {
              exposed.push({
                exposedUnionConstructors: undefined,
                name: value.text,
                syntaxNode: functionNode,
                type: "Function",
              });
            }
          }

          const exposedTypes = exposingList.descendantsOfType("exposed_type");
          for (const value of exposedTypes) {
            const doubleDot = value.descendantsOfType("double_dot");
            const exposedConstructors = value.descendantsOfType(
              "exposed_union_constructor",
            );
            if (doubleDot.length > 0) {
              const name = TreeUtils.findFirstNamedChildOfType(
                "upper_case_identifier",
                value,
              );

              if (name) {
                const typeDeclaration = this.findType(tree, name.text);
                if (typeDeclaration) {
                  const unionCostructors: string[] = [];
                  typeDeclaration
                    .descendantsOfType("union_variant")
                    .forEach(variant => {
                      const unionConstructorName = TreeUtils.findFirstNamedChildOfType(
                        "upper_case_identifier",
                        variant,
                      );
                      if (unionConstructorName) {
                        unionCostructors.push(unionConstructorName.text);
                      }
                    });

                  exposed.push({
                    exposedUnionConstructors: unionCostructors,
                    name: name.text,
                    syntaxNode: typeDeclaration,
                    type: "Type",
                  });
                }
              }
            } else if (exposedConstructors.length > 0) {
              const name = TreeUtils.findFirstNamedChildOfType(
                "upper_case_identifier",
                value,
              );
              if (name) {
                const typeNode = this.findType(tree, name.text);

                if (typeNode) {
                  exposed.push({
                    exposedUnionConstructors: exposedConstructors.map(
                      a => a.text,
                    ),
                    name: name.text,
                    syntaxNode: typeNode,
                    type: "Type",
                  });
                }
              }
            } else {
              const typeNode = this.findType(tree, value.text);

              if (typeNode) {
                exposed.push({
                  exposedUnionConstructors: undefined,
                  name: value.text,
                  syntaxNode: typeNode,
                  type: "Type",
                });
              } else {
                const typeAliasNode = this.findTypeAlias(tree, value.text);
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

  public static findAllNamedChildsOfType(
    type: string,
    node: SyntaxNode,
  ): SyntaxNode[] | undefined {
    const result = node.children.filter(child => child.type === type);
    if (result.length === 0) {
      return undefined;
    }
    return result;
  }

  public static isExposedFunction(tree: Tree, functionName: string) {
    const module = TreeUtils.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
    if (module) {
      const descendants = module.descendantsOfType("exposed_value");
      return descendants.some(desc => desc.text === functionName);
    }
    return false;
  }

  public static isExposedType(tree: Tree, typeName: string) {
    const module = TreeUtils.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
    if (module) {
      const descendants = module.descendantsOfType("exposed_type");
      return descendants.some(desc => desc.text.startsWith(typeName));
    }
    return false;
  }

  public static findFunction(
    tree: Tree,
    functionName: string,
  ): SyntaxNode | undefined {
    const functions = this.findAllFunctions(tree);
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
    const infixDeclarations = this.findAllNamedChildsOfType(
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
          return this.findFunction(tree, functionReference.text);
        }
      }
    }
  }

  public static findType(tree: Tree, typeName: string): SyntaxNode | undefined {
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

  public static findTypeAlias(
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

  public static findAllFunctions(tree: Tree): SyntaxNode[] | undefined {
    const functions = this.findAllNamedChildsOfType(
      "value_declaration",
      tree.rootNode,
    );
    return functions;
  }

  public static findAllTypeDeclarations(tree: Tree): SyntaxNode[] | undefined {
    const typeDeclarations = this.findAllNamedChildsOfType(
      "type_declaration",
      tree.rootNode,
    );
    return typeDeclarations;
  }

  public static findAllTypeAliasDeclarations(
    tree: Tree,
  ): SyntaxNode[] | undefined {
    const typeAliasDeclarations = this.findAllNamedChildsOfType(
      "type_alias_declaration",
      tree.rootNode,
    );
    return typeAliasDeclarations;
  }

  public static findDefinitionNode(
    tree: Tree,
    nodeAtPosition: SyntaxNode,
  ): SyntaxNode | undefined {
    let definitionNode;
    if (nodeAtPosition.type === "lower_case_identifier") {
      definitionNode = this.findOperator(tree, nodeAtPosition.text);
    } else if (nodeAtPosition.type === "upper_case_identifier") {
      definitionNode = this.findType(tree, nodeAtPosition.text);
      if (!definitionNode) {
        definitionNode = this.findTypeAlias(tree, nodeAtPosition.text);
      }
    }
    return definitionNode;
  }
}