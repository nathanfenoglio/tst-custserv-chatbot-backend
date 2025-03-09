// node server.js
const express = require('express');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log(req.body);
  const command = "npm run download";
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
    res.sendStatus(200);
  })
})

app.listen(3001, () => {
  console.log("Listening on port 3001");
})