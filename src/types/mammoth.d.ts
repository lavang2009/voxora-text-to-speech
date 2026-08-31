declare module "mammoth/mammoth.browser" {
  export interface ExtractResult {
    value: string;
    messages: unknown[];
  }

  export interface ExtractOptions {
    arrayBuffer: ArrayBuffer;
  }

  export function extractRawText(
    options: ExtractOptions
  ): Promise<ExtractResult>;
}
