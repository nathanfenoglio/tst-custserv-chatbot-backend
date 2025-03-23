// COPY BELOW TO PASTE INTO GOOGLE APPS SCRIPT 
// https://script.google.com/u/1/home 
// new project
// create Code.gs script

function onFileUpload(e) {
  // list of all folder ids for the various user specific documents in google drive 
  var folderIds = ["your folder id 1", "your folder id 2 etc"];  
  // map to persistent script properties lastFileDataX for each user folder in google drive to check for changes
  var folderIdsToLastFileDataNames = {"your folder id 1": "lastFileData", "your folder id 2": "lastFileData2"};

  folderIds.forEach((folderId) => {
    var folder = DriveApp.getFolderById(folderId);
    var files = folder.getFiles();

    // get saved file data per user's google drive folder
    var scriptProperties = PropertiesService.getScriptProperties();

    // Retrieve stored file IDs and modification timestamps for specific user's folder data
    var lastFileData = scriptProperties.getProperty(folderIdsToLastFileDataNames[folderId]);
    var knownFileData = lastFileData ? JSON.parse(lastFileData) : {}; // parse JSON saved folder data

    var newFileData = {}; // store the latest file data to compare with previously saved data
    var folderChangeDetected = false;
    
    var deletedFiles = []
    var currentFileIds = new Set();

    // compare each file in user's folder to what was previously saved
    while (files.hasNext()) {
      var file = files.next();
      var fileId = file.getId();

      var fileName = file.getName();
      var lastUpdated = file.getLastUpdated().getTime(); // get last modified timestamp

      newFileData[fileId] = lastUpdated; // store latest file info

      currentFileIds.add(fileId); // for checking if file is missing (user deleted) outside of while loop
      
      if (!(fileId in knownFileData)) {
        folderChangeDetected = true;
        Logger.log("New file detected: " + fileName);
      } else if (knownFileData[fileId] !== lastUpdated) {
        folderChangeDetected = true;
        Logger.log("File modified: " + fileName);
      }

      console.log(file.getName());
    }

    // check for deleted files (files present in knownFileData but missing from current files)
    for (var oldFileId in knownFileData) {
      if (!currentFileIds.has(oldFileId)) {
        deletedFiles.push(oldFileId);
        folderChangeDetected = true;
      }
    }

    // remove deleted files from newFileData before saving
    // I don't think that there would be the files that you would need to delete in newFileData since it is the new file data and the deleted files would be missing
    deletedFiles.forEach(fileId => delete newFileData[fileId]);

    // set persistent script property for this folder's data to the new file data found in the folder for next check
    scriptProperties.setProperty(folderIdsToLastFileDataNames[folderId], JSON.stringify(newFileData));

    // if a change in folder is found send folder id to backend 
    // to initiate redownloading user's folder and reseeding database associated with user for future queries
    if (folderChangeDetected) {
      var payload = {
        message: "at least one file changed in the google drive folder",
        folderId: folderId,
        timestamp: new Date()
      };

      // url where backend is running
      var webHookUrl = "https://b214-2600-1700-640-4100-34cb-af54-b06-c779.ngrok-free.app/webhook";
      var options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload)
      }

      // send post request to backend url
      UrlFetchApp.fetch(webHookUrl, options);

      // if you want to send notification email that a folder has changed and is being redownloaded/database reseeded
      // sendNotification("yup", "indeed");
      sendNotification("nathanrfenoglio@gmail.com", folderId);
    }

  });
}

function sendNotification(email, folderId) {
  MailApp.sendEmail({
    to: email,
    subject: "a change detected for folder  " + folderId,
    body: "a change has been detected and the files will be redownloaded and database reseeded for folder " + folderId
  });
}

