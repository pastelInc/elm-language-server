import diff from "fast-diff";
import { Range, TextEdit } from "vscode-languageserver";
// Given two strings (`before`, `after`), return a list of all substrings
// that appear in `after` but not in `before`, and the positions of each
// of the substrings within `after`.
export function getTextRangeChanges(
  before: string,
  after: string,
): Promise<TextEdit[]> {
  const newRanges: TextEdit[] = [];
  let lineNumber = 0;
  let column = 0;

  const parts = diff(before, after);

  // Loop over every part, keeping track of:
  // 1. The current line no. and column in the `after` string
  // 2. Character ranges for all "added" parts in the `after` string
  parts.forEach(part => {
    const startLineNumber = lineNumber;
    const startColumn = column;
    if (part[0] === 0 || part[0] === -1) {
      // Split the part into lines. Loop through these lines to find
      // the line no. and column at the end of this part.
      const substring = part[1];
      const lines = substring.split("\n");
      lines.forEach((line, lineIndex) => {
        // The first `line` is actually just a continuation of the last line
        if (lineIndex === 0) {
          column += line.length;
          // All other lines come after a line break.
        } else if (lineIndex > 0) {
          lineNumber += 1;
          column = line.length;
        }
      });
    }

    if (part[0] === 1) {
      newRanges.push({
        newText: part[1],
        range: Range.create(
          startLineNumber,
          startColumn,
          startLineNumber,
          startColumn,
        ),
      });
    } else if (part[0] === -1) {
      newRanges.push({
        newText: "",
        range: Range.create(startLineNumber, startColumn, lineNumber, column),
      });
    }
  });
  return Promise.resolve(newRanges);
}
