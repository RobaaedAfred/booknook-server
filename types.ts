import type { ObjectId } from "mongodb";

export const CATEGORIES = ["Fiction", "Science", "History", "Kids", "Others"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}


export interface BookInput {
  title: string;
  author: string;
  category: Category;
  image: string;
  description: string;
  totalCopies: number;
}

export interface Book extends BookInput {
  _id: ObjectId;
  availableCopies: number;
  addedBy: { name: string; email: string };
  createdAt: Date;
  updatedAt?: Date;
}
export interface Borrow {
  _id: ObjectId;
  bookId: string;
  bookTitle: string;
  bookImage: string;
  userName: string;
  userEmail: string;
  borrowDate: Date;
  returnDate: Date;
}
