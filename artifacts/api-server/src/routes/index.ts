import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import eventsRouter from "./events.js";
import fightsRouter from "./fights.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(fightsRouter);

export default router;
