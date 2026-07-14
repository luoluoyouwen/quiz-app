const mammoth = require('mammoth');
const fs = require('fs');

const docxPath = process.argv[2];
if (!docxPath) {
  console.error('Usage: node extract_raw.cjs <docx_path>');
  process.exit(1);
}

const buffer = fs.readFileSync(docxPath);
mammoth.extractRawText({ buffer }).then(result => {
  console.log(result.value);
}).catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
