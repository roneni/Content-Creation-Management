import { router } from "./index";
import { userRouter } from "./routers/user";
import { sitesRouter } from "./routers/sites";
import { crawlRouter } from "./routers/crawl";
import { analysisRouter } from "./routers/analysis";
import { strategyRouter } from "./routers/strategy";

export const appRouter = router({
  user: userRouter,
  sites: sitesRouter,
  crawl: crawlRouter,
  analysis: analysisRouter,
  strategy: strategyRouter,
});

export type AppRouter = typeof appRouter;
