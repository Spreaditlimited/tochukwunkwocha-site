function parseHeaders(block) {
  const headers = {};
  String(block || "").split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(":");
    if (idx < 0) return;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  });
  return headers;
}

function parseContentDisposition(value) {
  const out = {};
  String(value || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    let val = part.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  });
  return out;
}

function parseMultipartForm(event) {
  const headers = event && event.headers ? event.headers : {};
  const contentType = headers["content-type"] || headers["Content-Type"] || "";
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return { fields: {}, files: {} };
  const boundary = match[1] || match[2];
  const bodyBuffer = Buffer.from(String(event.body || ""), event.isBase64Encoded ? "base64" : "utf8");
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let start = bodyBuffer.indexOf(delimiter);
  while (start >= 0) {
    start += delimiter.length;
    if (bodyBuffer[start] === 45 && bodyBuffer[start + 1] === 45) break;
    if (bodyBuffer[start] === 13 && bodyBuffer[start + 1] === 10) start += 2;
    const next = bodyBuffer.indexOf(delimiter, start);
    if (next < 0) break;
    let part = bodyBuffer.slice(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) part = part.slice(0, -2);
    const splitAt = part.indexOf(Buffer.from("\r\n\r\n"));
    if (splitAt >= 0) {
      const headerBlock = part.slice(0, splitAt).toString("utf8");
      const content = part.slice(splitAt + 4);
      const partHeaders = parseHeaders(headerBlock);
      const disposition = parseContentDisposition(partHeaders["content-disposition"]);
      const name = disposition.name;
      if (name) {
        if (disposition.filename) {
          files[name] = {
            filename: disposition.filename,
            contentType: partHeaders["content-type"] || "application/octet-stream",
            buffer: content,
          };
        } else {
          fields[name] = content.toString("utf8");
        }
      }
    }
    start = next;
  }
  return { fields, files };
}

module.exports = { parseMultipartForm };
