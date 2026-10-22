export async function requestBody(init) {
  if (init.body instanceof FormData) return init.body;
  if (init.body instanceof Blob) return new Response(init.body, { headers: init.headers }).formData();
  return JSON.parse(init.body);
}
