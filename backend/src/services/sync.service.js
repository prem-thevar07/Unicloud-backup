import cron from "node-cron";
import CloudAccount from "../models/CloudAccount.js";
import { fetchGoogleStorage } from "./providers/google.provider.js";

cron.schedule("*/20 * * * *", async () => {

  const accounts = await CloudAccount.find();

  for (const acc of accounts) {
    try {
      if (acc.provider === "google") {
        if (!acc.email) {
            console.warn("⚠️ Skipping account without email:", acc._id);
            continue;
        }
        acc.status = "syncing";
        await acc.save();

        const storage = await fetchGoogleStorage(acc);

        acc.storage = storage;
        acc.status = "connected";
        acc.lastSyncedAt = new Date();

        await acc.save();
      }
    } catch (err) {
      console.error("❌ Sync failed for:", acc.email || acc._id, err.message);
      try {
          if (acc.email) {
             acc.status = "error";
             await acc.save();
          }
      } catch(saveErr) {
          console.error("❌ Could not update status:", saveErr.message);
      }
    }
  }
});