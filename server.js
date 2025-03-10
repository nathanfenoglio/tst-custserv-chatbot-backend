// node server.js
// const express = require('express');
// const { exec } = require('child_process');

// const app = express();
// app.use(express.json());

// app.post("/webhook", (req, res) => {
//   console.log(req.body);
//   const command = "npm run download";
//   exec(command, (error, stdout, stderr) => {
//     if (error) {
//       console.error(`exec error: ${error}`);
//       return;
//     }
//     console.log(`stdout: ${stdout}`);
//     console.log(`stderr: ${stderr}`);
//     res.sendStatus(200);
//   })
// })

// app.listen(3001, () => {
//   console.log("Listening on port 3001");
// })

const express = require('express');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log(req.body);

  // Step 1: Run `npm run download`
  exec("npm run download", (error, stdout, stderr) => {
    if (error) {
      console.error(`Download error: ${error}`);
      res.sendStatus(500); // Send an error response
      return;
    }
    console.log(`Download stdout: ${stdout}`);
    console.log(`Download stderr: ${stderr}`);

    // Step 2: Run `npm run seed -- tstcustserv` after `npm run download` finishes
    exec("npm run seed -- tstcustserv", (seedError, seedStdout, seedStderr) => {
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
