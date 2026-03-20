export function help(): void {
  console.log(`
typecek — typed templating for TypeScript

Usage: typecek <command> (or typecku <command>)

Commands:
  init       Set up tsconfig.json and .gitignore for Typecek
  compile    Compile all .tc templates to .typecek/ directory
  check      Type-check templates without generating output
  watch      Watch for changes and recompile automatically
  clean      Remove the .typecek/ directory (alias: clear)
  list       Show all templates and their associated types
  help       Show this help message
`.trim());
}
