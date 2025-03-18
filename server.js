import express from "express";
import { exec } from "child_process";
import { folderIdsCollections } from "./folderIdsCollections.js";


const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log(req.body);
  const folderId = req.body.folderId;
  if (!folderId) {
    console.error("❌ Error: Missing folderId in request body.");
    return res.status(400).send("Missing folderId");
  }
  console.log(`📂 Received folderId: ${folderId}`);

  const collectionName = folderIdsCollections.get(folderId);

  if (!collectionName) {
    console.error(`❌ Error: No collection name mapped for folderId: ${folderId}`);
    return res.status(400).send("Invalid folderId");
  }

  console.log(`📂 Mapped Collection Name: ${collectionName}`);

  // Step 1: Run `npm run download`
  // run download.js script to download the files from the user's folderId 
  // from google drive to their specified local folder
  exec(`npm run download -- ${folderId}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Download error: ${error}`);
      res.sendStatus(500); // Send an error response
      return;
    }
    console.log(`Download stdout: ${stdout}`);
    console.log(`Download stderr: ${stderr}`);

    // reseed astra db for user's specified collection with user's specified folder files
    // runs loadDb.ts script
    exec(`npm run seed -- ${collectionName}`, (seedError, seedStdout, seedStderr) => {
      if (seedError) {
        console.error(`Seed error: ${seedError}`);
        res.sendStatus(500); // Send an error response
        return;
      }
      console.log(`Seed stdout: ${seedStdout}`);
      console.log(`Seed stderr: ${seedStderr}`);

      res.sendStatus(200); // Send success response after both commands complete
    });
  });
});

app.listen(3001, () => {
  console.log("Listening on port 3001");
});
