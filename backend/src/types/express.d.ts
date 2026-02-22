import type { User } from "./api.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: User | null;
    }
  }
}

export {};
