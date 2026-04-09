import { Router } from 'express';
import { MACHINES } from 'shared';

export const machineRoutes = Router();

machineRoutes.get('/', (_req, res) => {
  res.json(MACHINES);
});
