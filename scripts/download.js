import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { driveFolderIdToLocalFolder } from "../driveFolderIdToLocalFolder.js";

const SCOPES = ['https://www.googleapis.com/auth/drive'];
// get folder ID from command line arg passed in from server.js received from google apps script trigger 
// when file in folder is deleted, modified, or added
const FOLDER_ID = process.argv[2];
console.log(`📂 Checking Google Drive folder with ID: ${FOLDER_ID}`);

if (!FOLDER_ID) {
  console.error("❌ Error: No FOLDER_ID provided. Exiting...");
  process.exit(1);
}
// get documents folder for where to download the files from google drive locally from folder id
const DOCUMENTS_FOLDER = driveFolderIdToLocalFolder.get(FOLDER_ID);

// Function to delete all files in the documents folder
function clearDocumentsFolder() {
  if (fs.existsSync(DOCUMENTS_FOLDER)) {
    fs.readdirSync(DOCUMENTS_FOLDER).forEach(file => {
      const filePath = path.join(DOCUMENTS_FOLDER, file);
      fs.unlinkSync(filePath);
    });
    console.log('All files in the documents folder have been deleted.');
  } else {
    console.log('Documents folder does not exist. Creating it now...');
    fs.mkdirSync(DOCUMENTS_FOLDER, { recursive: true });
  }
}

async function authorize() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './client_secret.json',
    scopes: SCOPES,
  });
  return auth;
}

async function listFiles(auth) {
  const drive = google.drive({ version: 'v3', auth });
  
  clearDocumentsFolder(); // delete all of the documents in folder before redownloading from google drive

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
  // write file to specified local folder that corresponds to this user and google drive folder 
  const dest = fs.createWriteStream(`${DOCUMENTS_FOLDER}/${fileName}`);
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
