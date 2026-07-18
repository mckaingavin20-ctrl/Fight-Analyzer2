import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import eventsRouter from "./events.js";
import fightsRouter from "./fights.js";
import recordRouter from "./record.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(fightsRouter);
router.use(recordRouter);
router.use(adminRouter);

export default router;
