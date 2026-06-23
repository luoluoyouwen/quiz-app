const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8125;
const FILE = path.join(__dirname, 'test_import.docx');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment');
  const stream = fs.createReadStream(FILE);
  stream.pipe(res);
});

server.listen(PORT, () => {
  console.log('Serving DOCX on http://127.0.0.1:' + PORT);
});
