export enum TokenType {
  Text,
  OpenExpression,
  CloseExpression,
  OpenRawExpression,
  CloseRawExpression,
  OpenBlock,
  CloseBlock,
  OpenComment,
  CloseComment,
  OpenPartial,
  BlockName,
  Identifier,
  Dot,
  StringLiteral,
  NumberLiteral,
  MetaVariable,
  TypeDirective,
  From,
  In,
  Assign,
  And,
  Or,
  Not,
  Equal,
  NotEqual,
  GreaterThan,
  LessThan,
  GreaterThanOrEqual,
  LessThanOrEqual,
  Plus,
  Minus,
  Star,
  Slash,
  OpenParen,
  CloseParen,
  WhitespaceStrip,
  DotDotSlash,
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const BLOCK_NAMES = new Set([
  "if", "else", "for", "empty", "switch", "case", "default", "raw", "with", "import",
]);

const META_VARIABLES = new Set(["@index", "@first", "@last", "@length"]);

export function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let textBuf = "";
  let textBufStart = 0;

  // Precompute line start offsets for O(1) position lookup
  const lineStarts = [0];
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "\n") lineStarts.push(i + 1);
  }

  function offsetToLoc(offset: number): { line: number; column: number } {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, column: offset - lineStarts[lo] };
  }

  function emit(type: TokenType, value: string, offset: number) {
    const loc = offsetToLoc(offset);
    tokens.push({ type, value, line: loc.line, column: loc.column });
  }

  function flushText() {
    if (textBuf.length > 0) {
      emit(TokenType.Text, textBuf, textBufStart);
      textBuf = "";
    }
  }

  function peek(offset = 0): string {
    return template[pos + offset] ?? "";
  }

  function match(str: string): boolean {
    return template.startsWith(str, pos);
  }

  function advance(n = 1): string {
    const s = template.slice(pos, pos + n);
    pos += n;
    return s;
  }

  function skipWhitespace() {
    while (pos < template.length && /\s/.test(template[pos])) {
      pos++;
    }
  }

  function readString(quote: string): string {
    pos++; // skip opening quote
    let value = "";
    while (pos < template.length && template[pos] !== quote) {
      value += template[pos];
      pos++;
    }
    pos++; // skip closing quote
    return value;
  }

  function readWord(): string {
    let word = "";
    while (pos < template.length && /[a-zA-Z0-9_$]/.test(template[pos])) {
      word += template[pos];
      pos++;
    }
    return word;
  }

  function readNumber(): string {
    let num = "";
    while (pos < template.length && /[0-9.]/.test(template[pos])) {
      num += template[pos];
      pos++;
    }
    return num;
  }

  function tokenizeExpressionContent(closeTokenType: TokenType, closeStr: string) {
    while (pos < template.length) {
      skipWhitespace();
      if (pos >= template.length) break;

      const tokenStart = pos;

      // Check for close with tilde
      if (match("~" + closeStr)) {
        emit(TokenType.WhitespaceStrip, "~", tokenStart);
        advance(1 + closeStr.length);
        emit(closeTokenType, closeStr, tokenStart + 1);
        return;
      }

      // Check for close
      if (match(closeStr)) {
        advance(closeStr.length);
        emit(closeTokenType, closeStr, tokenStart);
        return;
      }

      const ch = template[pos];

      if (ch === "~") {
        emit(TokenType.WhitespaceStrip, "~", tokenStart);
        pos++;
      } else if (ch === "&" && peek(1) === "&") {
        emit(TokenType.And, "&&", tokenStart);
        pos += 2;
      } else if (ch === "|" && peek(1) === "|") {
        emit(TokenType.Or, "||", tokenStart);
        pos += 2;
      } else if (ch === "!" && peek(1) === "=") {
        emit(TokenType.NotEqual, "!=", tokenStart);
        pos += 2;
      } else if (ch === "!") {
        emit(TokenType.Not, "!", tokenStart);
        pos++;
      } else if (ch === "=" && peek(1) === "=") {
        emit(TokenType.Equal, "==", tokenStart);
        pos += 2;
      } else if (ch === "=" && peek(1) !== "=") {
        emit(TokenType.Assign, "=", tokenStart);
        pos++;
      } else if (ch === ">" && peek(1) === "=") {
        emit(TokenType.GreaterThanOrEqual, ">=", tokenStart);
        pos += 2;
      } else if (ch === "<" && peek(1) === "=") {
        emit(TokenType.LessThanOrEqual, "<=", tokenStart);
        pos += 2;
      } else if (ch === ">") {
        emit(TokenType.GreaterThan, ">", tokenStart);
        pos++;
      } else if (ch === "<") {
        emit(TokenType.LessThan, "<", tokenStart);
        pos++;
      } else if (ch === "+") {
        emit(TokenType.Plus, "+", tokenStart);
        pos++;
      } else if (ch === "-") {
        emit(TokenType.Minus, "-", tokenStart);
        pos++;
      } else if (ch === "*") {
        emit(TokenType.Star, "*", tokenStart);
        pos++;
      } else if (ch === "/") {
        emit(TokenType.Slash, "/", tokenStart);
        pos++;
      } else if (ch === "(") {
        emit(TokenType.OpenParen, "(", tokenStart);
        pos++;
      } else if (ch === ")") {
        emit(TokenType.CloseParen, ")", tokenStart);
        pos++;
      } else if (ch === "." && template[pos + 1] === "." && template[pos + 2] === "/") {
        emit(TokenType.DotDotSlash, "../", tokenStart);
        pos += 3;
      } else if (ch === ".") {
        emit(TokenType.Dot, ".", tokenStart);
        pos++;
      } else if (ch === '"' || ch === "'") {
        const value = readString(ch);
        emit(TokenType.StringLiteral, value, tokenStart);
      } else if (ch === "@") {
        // Meta-variable or type directive
        if (match("@type")) {
          emit(TokenType.TypeDirective, "@type", tokenStart);
          pos += 5;
        } else {
          // Read full @word
          pos++; // skip @
          const word = readWord();
          const metaVar = "@" + word;
          if (META_VARIABLES.has(metaVar)) {
            emit(TokenType.MetaVariable, metaVar, tokenStart);
          } else {
            emit(TokenType.Identifier, metaVar, tokenStart);
          }
        }
      } else if (/[0-9]/.test(ch)) {
        const num = readNumber();
        emit(TokenType.NumberLiteral, num, tokenStart);
      } else if (/[a-zA-Z_$]/.test(ch)) {
        const word = readWord();
        if (word === "from") {
          emit(TokenType.From, "from", tokenStart);
        } else if (word === "in") {
          emit(TokenType.In, "in", tokenStart);
        } else if (BLOCK_NAMES.has(word)) {
          emit(TokenType.BlockName, word, tokenStart);
        } else {
          emit(TokenType.Identifier, word, tokenStart);
        }
      } else {
        // Skip unknown characters
        pos++;
      }
    }
  }

  while (pos < template.length) {
    // Escaped braces
    if (match("\\{{")) {
      if (textBuf.length === 0) textBufStart = pos;
      pos += 3; // skip \{{
      // Collect until \}} or end
      let escaped = "{{";
      while (pos < template.length) {
        if (match("\\}}")) {
          escaped += "}}";
          pos += 3;
          break;
        }
        escaped += template[pos];
        pos++;
      }
      textBuf += escaped;
      continue;
    }

    // Raw expression {{{
    if (match("{{{")) {
      flushText();
      emit(TokenType.OpenRawExpression, "{{{", pos);
      pos += 3;
      tokenizeExpressionContent(TokenType.CloseRawExpression, "}}}");
      continue;
    }

    // Comment {{! (only if followed by space, @, or --)
    if (match("{{!") && (template[pos + 3] === " " || template[pos + 3] === "@" || template[pos + 3] === "-")) {
      flushText();
      emit(TokenType.OpenComment, "{{!", pos);
      pos += 3;
      tokenizeExpressionContent(TokenType.CloseComment, "}}");
      continue;
    }

    // Partial {{>
    if (match("{{>")) {
      flushText();
      emit(TokenType.OpenPartial, "{{>", pos);
      pos += 3;
      tokenizeExpressionContent(TokenType.CloseExpression, "}}");
      continue;
    }

    // Close block {{/
    if (match("{{/")) {
      flushText();
      emit(TokenType.CloseBlock, "{{/", pos);
      pos += 3;
      tokenizeExpressionContent(TokenType.CloseExpression, "}}");
      continue;
    }

    // Open block {{~#
    if (match("{{~#")) {
      flushText();
      emit(TokenType.OpenBlock, "{{~#", pos);
      pos += 4;
      // Check for raw block
      const savedPos = pos;
      skipWhitespace();
      if (match("raw")) {
        const afterRaw = pos + 3;
        if (afterRaw >= template.length || /[\s}]/.test(template[afterRaw])) {
          const rawStart = pos;
          pos = afterRaw;
          emit(TokenType.BlockName, "raw", rawStart);
          skipWhitespace();
          if (match("}}")) {
            emit(TokenType.CloseExpression, "}}", pos);
            pos += 2;
          }
          // Now collect raw content until {{/raw}}
          collectRawContent();
          continue;
        }
      }
      pos = savedPos;
      tokenizeExpressionContent(TokenType.CloseExpression, "}}");
      continue;
    }

    // Open block {{#
    if (match("{{#")) {
      flushText();
      emit(TokenType.OpenBlock, "{{#", pos);
      pos += 3;
      // Check for raw block
      const savedPos = pos;
      skipWhitespace();
      if (match("raw")) {
        const afterRaw = pos + 3;
        if (afterRaw >= template.length || /[\s}]/.test(template[afterRaw])) {
          const rawStart = pos;
          pos = afterRaw;
          emit(TokenType.BlockName, "raw", rawStart);
          skipWhitespace();
          if (match("}}")) {
            emit(TokenType.CloseExpression, "}}", pos);
            pos += 2;
          }
          // Now collect raw content until {{/raw}}
          collectRawContent();
          continue;
        }
      }
      pos = savedPos;
      tokenizeExpressionContent(TokenType.CloseExpression, "}}");
      continue;
    }

    // Expression {{~ (with whitespace strip)
    if (match("{{~")) {
      flushText();
      emit(TokenType.OpenExpression, "{{", pos);
      emit(TokenType.WhitespaceStrip, "~", pos + 2);
      pos += 3;
      tokenizeExpressionContent(TokenType.CloseExpression, "}}");
      continue;
    }

    // Expression {{
    if (match("{{")) {
      flushText();
      emit(TokenType.OpenExpression, "{{", pos);
      pos += 2;
      tokenizeExpressionContent(TokenType.CloseExpression, "}}");
      continue;
    }

    // Regular text
    if (textBuf.length === 0) textBufStart = pos;
    textBuf += template[pos];
    pos++;
  }

  flushText();
  return tokens;

  function collectRawContent() {
    let raw = "";
    let rawStart = pos;
    while (pos < template.length) {
      if (match("{{/raw}}")) {
        if (raw.length > 0) {
          emit(TokenType.Text, raw, rawStart);
        }
        emit(TokenType.CloseBlock, "{{/", pos);
        pos += 3;
        tokenizeExpressionContent(TokenType.CloseExpression, "}}");
        return;
      }
      raw += template[pos];
      pos++;
    }
    // If we reach here, unclosed raw block
    if (raw.length > 0) {
      emit(TokenType.Text, raw, rawStart);
    }
  }
}
