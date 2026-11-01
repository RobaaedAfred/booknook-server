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

app.get("/", (_req, res) => {
  res.json({ message: "BookNook API is running" });
});

// 1) GET /books
app.get("/books", async (req, res) => {
  const db = await getDb();
  const sort = queryString(req.query.sort) ?? "newest";
  const category = queryString(req.query.category);
  const search = queryString(req.query.search);
  const email = queryString(req.query.email);
  const limit = parseInt(queryString(req.query.limit) ?? "", 10);

  // Built as a plain object because it uses a dotted key ("addedBy.email").
  const filter: Record<string, unknown> = {};
  if (category && category !== "All") filter.category = category;
  if (email) filter["addedBy.email"] = email;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: rx }, { author: rx }];
  }