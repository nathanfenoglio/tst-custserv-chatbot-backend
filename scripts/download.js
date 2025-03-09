const fs = require('fs');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const FOLDER_ID = '1IpL6FSnv5xzqls8JUbLZMAGrfY1MBrQk';

async function authorize() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './client_secret.json',
    scopes: SCOPES,
  });
  return auth;
}

async function listFiles(auth) {
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  const files = res.data.files;
  if (!files || files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log('Downloading files...');
  for (const file of files) {
    console.log(`Found File: ${file.name} (ID: ${file.id}, MIME Type: ${file.mimeType})`);
    await downloadFile(auth, file.id, file.name, file.mimeType);
  }
}

async function downloadFile(auth, fileId, fileName, mimeType) {
  const drive = google.drive({ version: 'v3', auth });

  let requestOptions;
  
  // Check if the file is a Google Docs Editors file (Docs, Sheets, Slides)
  const googleMimeTypes = {
    'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.google-apps.drawing': 'image/png' // PNG
  };

  if (googleMimeTypes[mimeType]) {
    console.log(`Exporting ${fileName} as ${googleMimeTypes[mimeType]}`);
    
    requestOptions = drive.files.export(
      { fileId, mimeType: googleMimeTypes[mimeType] },
      { responseType: 'stream' }
    );

  } else {
    console.log(`Downloading binary file: ${fileName}`);

    requestOptions = drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
  }

  const res = await requestOptions;

  // const dest = fs.createWriteStream(`./downloads/${fileName}`);
  const dest = fs.createWriteStream(`./documents/${fileName}`);
  res.data.pipe(dest);

  return new Promise((resolve, reject) => {
    dest.on('finish', () => {
      console.log(`Downloaded ${fileName}`);
      resolve();
    });
    dest.on('error', reject);
  });
}



authorize().then(listFiles).catch(console.error);
