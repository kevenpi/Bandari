// The mobile app reuses the EXACT same typed client + schemas as web.
// This is the whole point of packages/shared: one contract, no rewrites.
import { BandariClient } from "@bandari/shared";

// In a real Expo app, read this from expo-constants (app.json -> extra.apiUrl).
const API_URL = "http://localhost:4000";

export const api = new BandariClient({ baseUrl: API_URL });

// Example usage (identical to web):
//   const quote = await api.createQuote({ sendAmountKes: 50000 });
//   const payment = await api.createPayment({ importerId, supplierId, quoteId: quote.id });
//   const view = await api.getPayment(payment.id);
