import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: "typecek-html" },
      { language: "typecek-ts" },
      { language: "typecek" },
      { language: "typecek-json" },
      { language: "typecek-css" },
      { language: "typecek-scss" },
      { language: "typecek-sass" },
    ],
    synchronize: {
      configurationSection: "typecek",
    },
  };

  client = new LanguageClient(
    "typecek",
    "Typecek",
    serverOptions,
    clientOptions,
  );
  client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
