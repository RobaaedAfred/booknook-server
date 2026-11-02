import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { MongoClient, ObjectId, type Db, type Filter, type Sort } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { CATEGORIES, type AuthUser, type Book, type 

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

    dbPromise.catch(() => {
      dbPromise = undefined;
    });
  }
  return dbPromise;
}



const isValidId = (id: unknown): id is string =>
  typeof id === "string" && ObjectId.isValid(id) && String(new ObjectId(id)) === id;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const queryString = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

type CleanResult = { data: BookInput; error?: undefined } | { data?: undefined; error: string };

function cleanBookInput(body: Record<string, unknown> | undefined): CleanResult {
  const b = body ?? {};
  const title = String(b.title ?? "").trim();
  const author = String(b.author ?? "").trim();
  const category = String(b.category ?? "").trim();
  const image = String(b.image ?? "").trim();
  const description = String(b.description ?? "").trim();
  const totalCopies = Number(b.totalCopies);

  if (!title || !author || !image || !description) return { error: "All fields are required" };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { error: "Invalid category" };
  if (!Number.isInteger(totalCopies) || totalCopies < 1) return { error: "Total copies must be at least 1" };
  return { data: { title, author, category: category as Category, image, description, totalCopies } };
}


app.get("/", (_req, res) => {
  res.json({ message: "BookNook API is running" });
});

//get Book data
app.get("/books", async (req, res) => {
  const db = await getDb();
  const sort = queryString(req.query.sort) ?? "newest";
  const category = queryString(req.query.category);
  const search = queryString(req.query.search);
  const email = queryString(req.query.email);
  const limit = parseInt(queryString(req.query.limit) ?? "", 10);


  const filter: Record<string, unknown> = {};
  if (category && category !== "All") filter.category = category;
  if (email) filter["addedBy.email"] = email;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: rx }, { author: rx }];
  }

  const direction = sort === "oldest" ? 1 : -1;
  const sortSpec: Sort = { createdAt: direction, _id: direction };
  let cursor = db.collection<Book>("books").find(filter as Filter<Book>).sort(sortSpec);
  if (limit > 0) cursor = cursor.limit(Math.min(limit, 100));

  res.json(await cursor.toArray());
});

// GET books/:id
app.get("/books/:id",  async (req, res) => {
  const id = req.params.id;
  if (!isValidId(id)) {
    res.status(400).json({ message: "Invalid book id" });
    return;
  }
  const db = await getDb();
  const book = await db.collection<Book>("books").findOne({ _id: new ObjectId(id) });
  if (!book) {
    res.status(404).json({ message: "Book not found" });
    return;
  }
  res.json(book);
});

// POST /books
app.post("/books", async (req, res) => {
  const user = (req as AuthedRequest).user;
  const { data, error } = cleanBookInput(req.body);
  if (!data) {
    res.status(400).json({ message: error });
    return;
  }

  const db = await getDb();
  const doc: Omit<Book, "_id"> = {
    ...data,
    availableCopies: data.totalCopies,
    addedBy: { name: user.name, email: user.email },
    createdAt: new Date(),
  };
  const result = await db.collection<Omit<Book, "_id">>("books").insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});


  const db = await getDb();
  const books = db.collection<Book>("books");
  const _id = new ObjectId(id);
  const book = await books.findOne({ _id });
  if (!book) {
    res.status(404).json({ message: "Book not found" });
    return;
  }
  if (book.addedBy?.email !== user.email) {
    res.status(403).json({ message: "You can only edit your own books" });
    return;
  }

// 6) POST /borrows
app.post("/borrows", verifyJWT, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const { bookId, returnDate } = (req.body ?? {}) as { bookId?: unknown; returnDate?: unknown };
  if (!isValidId(bookId)) {
    res.status(400).json({ message: "Invalid book id" });
    return;
  }

  const db = await getDb();
  const books = db.collection<Book>("books");
  const borrows = db.collection<Omit<Borrow, "_id">>("borrows");
  const book = await books.findOne({ _id: new ObjectId(bookId) });
  if (!book) {
    res.status(404).json({ message: "Book not found" });
    return;
  }

  const borrowDate = new Date();
  let due = typeof returnDate === "string" && returnDate ? new Date(returnDate) : null;
  if (!due || isNaN(due.getTime()) || due <= borrowDate) {
    due = new Date(borrowDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  }