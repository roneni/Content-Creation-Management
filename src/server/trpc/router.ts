import { router } from "./index";
import { userRouter } from "./routers/user";
import { sitesRouter } from "./routers/sites";
import { crawlRouter } from "./routers/crawl";
import { analysisRouter } from "./routers/analysis";

export const appRouter = router({
  user: userRouter,
  sites: sitesRouter,
  crawl: crawlRouter,
  analysis: analysisRouter,
});

export type AppRouter = typeof appRouter;
