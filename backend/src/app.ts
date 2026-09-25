import express from 'express';
import cors from 'cors';
import path from 'path';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import priorityRoutes from './routes/priorityRoutes.js';
import routeOptimizationRoutes from './routes/routeOptimizationRoutes.js';
import gapDetectionRoutes from './routes/gapDetectionRoutes.js';
import complaintAnalyticsRoutes from './routes/complaintAnalyticsRoutes.js';
import budgetRecommendationRoutes from './routes/budgetRecommendationRoutes.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import { errorHandler } from './middleware/error.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.resolve('backend/uploads')));

// Routes
app.use(publicRoutes);
app.use(authRoutes);
app.use(adminRoutes);
app.use(uploadRoutes);

// Priority Engine Routes (mounted at both root and /api for compatibility)
app.use(priorityRoutes);
app.use('/api', priorityRoutes);

// Route Optimization Module Routes
app.use(routeOptimizationRoutes);
app.use('/api', routeOptimizationRoutes);

// Gap Detection Module Routes
app.use(gapDetectionRoutes);
app.use('/api', gapDetectionRoutes);

// Complaint Analytics & Heatmap Routes
app.use(complaintAnalyticsRoutes);
app.use('/api', complaintAnalyticsRoutes);

// Budget-Based Infrastructure Recommendation Routes
app.use(budgetRecommendationRoutes);
app.use('/api', budgetRecommendationRoutes);

// Maintenance Assignment Routes
app.use(assignmentRoutes);
app.use('/api', assignmentRoutes);

// Citizen Complaint Lifecycle & Civic Engagement Routes
app.use(complaintRoutes);
app.use('/api', complaintRoutes);

// Database-backed analytical reports (admin-only)
app.use('/api', reportRoutes);

app.use(errorHandler);
export default app;
