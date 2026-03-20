import { init } from "./commands/init.js";
import { compileAll } from "./commands/compile.js";
import { clean } from "./commands/clean.js";
import { list } from "./commands/list.js";
import { watch } from "./commands/watch.js";
import { help } from "./commands/help.js";

export function main(args: string[]): void {
  const command = args[0] ?? "help";

  switch (command) {
    case "init":
      init();
      break;
    case "compile":
      compileAll(false);
      break;
    case "check":
      compileAll(true);
      break;
    case "watch":
      watch();
      break;
    case "clean":
    case "clear":
      clean();
      break;
    case "list":
      list();
      break;
    case "help":
      help();
      break;
    default:
      console.error(`typecek: unknown command "${command}". Run "typecek help" for usage.`);
      process.exitCode = 1;
  }
}
