declare module "file-icons-js";
declare module "vscode-icons-js" {
  export function getIconForFile(fileName: string): string | undefined;
  export function getIconForFolder(folderName: string): string | undefined;
  export function getIconForOpenFolder(folderName: string): string | undefined;
}

