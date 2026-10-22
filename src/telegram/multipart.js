// Use the platform's encoder, then send that exact immutable body. Blob.size
// includes UTF-8 fields, filenames, boundaries and CRLF, not just file bytes.
export async function prepareMultipart(form) {
  const response = new Response(form);
  const body = await response.blob();
  return {
    body,
    headers: { 'Content-Type': response.headers.get('content-type') },
    bytes: body.size,
    chatId: form.get('chat_id'),
    files: [...form.entries()].filter(([, value]) => value instanceof Blob)
      .map(([field, value]) => ({ field, bytes: value.size, mime: value.type })),
  };
}
