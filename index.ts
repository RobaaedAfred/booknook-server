import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { MongoClient, ObjectId, type Db, type Filter, type Sort } from "mongodb";


type AuthedRequest = Request & { user: AuthUser };

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(
  cors({
    origin: (process.env.CLIENT_URL || "http://localhost:3000").split(","),
    credentials: true,
  })
);
app.use(express.json());

//database connection to mongodb
let dbPromise: Promise<Db> | undefined;

function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error("MONGODB_URI is not set in server/.env");
      const client = new MongoClient(uri);
      await client.connect();
      const db = client.db(process.env.DB_NAME || "booknook");
      // A user can hold only one active borrow per book.
      await db.collection<Borrow>("borrows").createIndex({ bookId: 1, userEmail: 1 }, { unique: true });
      await db.collection<Book>("books").createIndex({ createdAt: -1 });
      return db;
    })();
    // If the connection fails, allow a retry on the next request.
    dbPromise.catch(() => {
      dbPromise = undefined;
    });
  }
  return dbPromise;
}