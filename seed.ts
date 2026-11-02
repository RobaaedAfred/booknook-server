// Optional: npm run seed — adds sample books so the Home page has content.
import "dotenv/config";
import { MongoClient } from "mongodb";
import type { Book, Category } from "./types.js";

declare const process: { env: Record<string, string | undefined> };

type Sample = [title: string, author: string, category: Category, description: string];

const sample: Sample[] = [
  ["The Quiet Orchard", "Maren Hollis", "Fiction", "A slow-burning story about three sisters and the orchard they refuse to sell."],
  ["Atlas of Small Stars", "Dev Ranganathan", "Science", "A friendly tour of the faintest, strangest stars you can find with a pair of binoculars."],
  ["Salt Roads", "Imogen Fairweather", "History", "How a humble mineral shaped trade routes, empires and kitchens across a thousand years."],
  ["Pip and the Paper Moon", "Tilly Marsden", "Kids", "Pip folds a paper moon and learns that small ideas can light up a whole night."],
  ["Letters from Tidewater", "Jonas Okafor", "Fiction", "A lighthouse keeper's letters reveal a coastal town's best-kept secret."],
  ["The Cell Builders", "Dr. Anwen Pryce", "Science", "An approachable guide to how living cells build, repair and copy themselves."],
  ["Maps Without Borders", "Yusuf Demir", "History", "A look at how mapmakers drew the world, and what they chose to leave out."],
  ["Notes on Quiet Mornings", "Claire Abernathy", "Others", "Short essays on habits, tea and the lost art of doing one thing at a time."],
];

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set in server/.env");

const client = new MongoClient(uri);
await client.connect();
const books = client.db(process.env.DB_NAME || "booknook").collection<Omit<Book, "_id">>("books");

const now = Date.now();
const docs: Omit<Book, "_id">[] = sample.map(([title, author, category, description], i) => ({
  title,
  author,
  category,
  description,
  image: `https://picsum.photos/seed/booknook${i + 1}/600/800`,
  totalCopies: 3 + (i % 3),
  availableCopies: 3 + (i % 3),
  addedBy: { name: "BookNook Team", email: "team@booknook.dev" },
  createdAt: new Date(now - i * 86400000),
}));

await books.insertMany(docs);
console.log(`Inserted ${docs.length} sample books`);
await client.close();
