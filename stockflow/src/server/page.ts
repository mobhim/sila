import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "./errors";

/** Await a service call in a page; render the 404 page for not-found/forbidden errors. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}
