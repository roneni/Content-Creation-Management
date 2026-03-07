import { router } from "./index";
import { userRouter } from "./routers/user";
import { sitesRouter } from "./routers/sites";

export const appRouter = router({
  user: userRouter,
  sites: sitesRouter,
});

export type AppRouter = typeof appRouter;
