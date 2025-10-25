import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prescriptionsRouter from './routes/prescriptions';
import medicinesRouter from './routes/medicines';
import billsRouter from './routes/bills';
import analyticsRouter from './routes/analytics';
import appointmentsRouter from './routes/appointments';
import servicesRouter from './routes/services';
import patientServicesRouter from './routes/patient-services';
import labTestsRouter from './routes/lab-tests';
import radiologyPrescriptionsRouter from './routes/radiology-prescriptions';
import radiologyServicesRouter from './routes/radiology-services';
import radiologyReportsRouter from './routes/radiology-reports';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/prescriptions', prescriptionsRouter);
app.use('/api/medicines', medicinesRouter);
app.use('/api/bills', billsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/patient-services', patientServicesRouter);
app.use('/api/lab-tests', labTestsRouter);
app.use('/api/radiology-prescriptions', radiologyPrescriptionsRouter);
app.use('/api/radiology-services', radiologyServicesRouter);
app.use('/api/radiology-reports', radiologyReportsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Pharmacy API is running' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start HTTP server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Server is running on port ${PORT}`);
  console.log(`Server is accessible at:`);
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Network: http://0.0.0.0:${PORT}`);
});