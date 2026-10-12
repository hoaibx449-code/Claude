// node:buffer is provided by the nodejs_compat flag
declare module 'node:buffer' { export const Buffer: { from(data: string, enc: string): Uint8Array & { toString(enc?: string): string } } }
