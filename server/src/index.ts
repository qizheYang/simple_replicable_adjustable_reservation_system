import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { bookingRoutes } from './routes/bookings';
import { machineRoutes } from './routes/machines';
import { adminRoutes } from './routes/admin';

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/bookings', bookingRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
