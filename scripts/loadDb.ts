// npm run seed -- "name of the collection that you want to seed"
import { DataAPIClient } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import pdf from "pdf-parse"; // for pdf
import mammoth from "mammoth"; // for docx
import fs from "fs"; // for text
import "dotenv/config";
import { localFoldersPerUserCollectionName } from "./localFoldersPerUserCollectionName";
import path from "path";


interface EmbeddingApiResponse {
  embedding: number[]; // or whatever type the embedding data is
}

type SimilarityMetric = "dot_product" | "cosine" | "euclidean";

const { ASTRA_DB_NAMESPACE, ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN } = process.env;

// get astra db collection name from command line arg to differentiate which collection to use
const collectionName: string = process.argv[2];

// get user local folder name from collection name
const DOCUMENTS_FOLDER = localFoldersPerUserCollectionName.get(collectionName);

if (!DOCUMENTS_FOLDER) {
  console.error(`The folder for collection "${collectionName}" is not defined.`);
  process.exit(1);
}

if (!collectionName) {
  console.error("Please provide a collection name as an argument.");
  process.exit(1);
}

// validate environment variables
const validateEnvVariables = () => {
  const requiredVars = {
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_APPLICATION_TOKEN,
  };

  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value || typeof value !== "string") {
      console.error(`Environment variable ${key} is missing or not a valid string.`);
      return false;
    }
  }

  return true;
};

// Terminate if any environment variable is missing or invalid
if (!validateEnvVariables()) {
  process.exit(1);
}

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);

// adding the '!' at the end of ASTRA_DB_API_ENDPOINT 
// tells typescript that it will never be null since you already checked above in validateEnvVariables function
const db = client.db(ASTRA_DB_API_ENDPOINT!, { namespace: ASTRA_DB_NAMESPACE });

// define langchain's RecursiveCharacterTextSplitter parameters
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  // chunkOverlap: 100,
  chunkOverlap: 200,
});

// choosing to drop and recreate the collection in Astra DB
// so that updated documents stored in the folder will be updated and new documents added
// avoiding duplicate info being written in the collection
// const recreateCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
const recreateCollection = async (similarityMetric: SimilarityMetric = "cosine") => {
  try {
    // drop the existing collection if it exists
    try {
      await db.collection(collectionName!).drop();
      console.log(`Dropped collection: ${collectionName}`);
    } catch (error) {
      console.warn(`No existing collection to drop: ${collectionName}, ${error}`);
    }

    // create the collection again or for the 1st time
    // using the similarity metric and 1536 dimensions -> changed to 768 dimensions now that using nomic-embed-text
    const res = await db.createCollection(collectionName!, {
      vector: {
        // dimension: 1536,
        dimension: 768,
        metric: similarityMetric,
      },
    });
    console.log(`Created collection: ${collectionName}`, res);
  } catch (error) {
    console.error(`Error recreating collection: ${error}`);
    throw error;
  }
};

// get file names from the user's specific directory
const getFilesInDirectory = (directory: string): string[] => {
  try {
    return fs.readdirSync(directory)
      .map(file => path.join(directory, file))
      .filter(filePath => filePath.endsWith(".pdf") || filePath.endsWith(".docx") || filePath.endsWith(".txt"));
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error);
    return [];
  }
};

const loadSampleData = async () => {
  // get reference to the collection you just created
  const collection = await db.collection(collectionName!);

  // get all files from user's specified directory
  const files = getFilesInDirectory(DOCUMENTS_FOLDER);

  if (files.length === 0) {
    console.warn(`No valid files found in ${DOCUMENTS_FOLDER}`);
    return;
  }

  // get content for each file specified in file paths for collection name passed in as command line arg
  // NOT USING filePathsPerUserCollectionName INSTEAD USING DIRECTORY PER USER GOOGLE DRIVE AND LOCALLY
  for (const filePath of files) {  
    try {
      let content: string;

      // Load content based on file type
      if (filePath.endsWith(".pdf")) {
        content = await loadPDF(filePath);
      } 
      else if (filePath.endsWith(".docx")) {
        content = await loadDocx(filePath);
      } 
      else if (filePath.endsWith(".txt")) {
        content = await loadText(filePath);
      } 
      else {
        console.warn(`Unsupported file type: ${filePath}`);
        continue;
      }

      // split content into chunks for vectorization using langchain RecursiveCharacterTextSplitter
      const chunks = await splitter.splitText(content);

      // create embedding (numerical representation) for each chunk
      for await (const chunk of chunks) {
        async function getEmbedding(text: string): Promise<number[] | null> {
          // was having trouble until I changed localhost to 127.0.0.1
          // const response = await fetch("http://localhost:11434/api/embeddings", {
          // send POST request to ollama nomic-embed-text model running locally
          const response = await fetch("http://127.0.0.1:11434/api/embeddings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "nomic-embed-text",
              prompt: text,
            }),
          });
        
          const data = await response.json() as EmbeddingApiResponse; 
          console.log("Embedding API Response:", data); 
        
          if (!data || !data.embedding) {
            console.error("ERROR: Embedding API did not return valid data");
            return null; 
          }
        
          return data.embedding;  
        }
        
        // get embedding for the chunk from ollama nomic-embed-text
        const vector = await getEmbedding(chunk);
        if (vector) {
          console.log("Storing embedding vector:", vector.length, vector.slice(0, 5)); // just printing 1st 5 elements to check
        } 
        else {
          console.error("ERROR: Embedding vector is null or undefined");
        }

        // insert embedding and text into the astradb collection
        // if you don't insert the text you will not have english to send to ai model
        const res = await collection.insertOne({
          $vector: vector,
          text: chunk, 
        });
        console.log(res);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
};

// loaders for different file types
const loadPDF = async (filePath: string): Promise<string> => { // pdf
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdf(dataBuffer);
  return pdfData.text;
};

const loadDocx = async (filePath: string): Promise<string> => { // docx
  const dataBuffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer: dataBuffer });
  return result.value;
};

const loadText = async (filePath: string): Promise<string> => { // txt
  return fs.readFileSync(filePath, "utf-8");
};

// main function to drop preexisting database, recreate the collection and seed it by loading the data from the specified files
const seedDatabase = async () => {
  await recreateCollection(); // drop and recreate the collection
  await loadSampleData(); // load and insert the data
};

// call seedDatabase to start the process
seedDatabase().catch((error) => {
  console.error("Error during database seeding:", error);
});
