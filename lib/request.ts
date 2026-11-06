export async function readBody(request: Request, limit = 8192) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing request");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.length;
    if (size > limit) {
      await reader.cancel();
      throw Error("Request too large");
    }
    chunks.push(result.value);
  }
  return Buffer.concat(chunks).toString();
}
