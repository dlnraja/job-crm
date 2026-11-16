function winAnsi(text) {
  const encoded = [];
  for (const char of String(text)) {
    const code = char.charCodeAt(0);
    if (code === 0x0a) continue;
    if (code < 128 || (code >= 160 && code <= 255)) encoded.push(code);
    else encoded.push(63);
  }
  return encoded;
}

function escapePdf(bytes) {
  let out = "";
  for (const code of bytes) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else out += String.fromCharCode(code);
  }
  return out;
}

export function textToPdf(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").slice(0, 48);
  const commands = ["BT", "/F1 11 Tf", "50 800 Td", "14 TL"];
  lines.forEach((line, index) => {
    const shown = escapePdf(winAnsi(line.slice(0, 110)));
    commands.push(index === 0 ? `(${shown}) Tj` : `T* (${shown}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}
