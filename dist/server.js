"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const prescriptions_1 = __importDefault(require("./routes/prescriptions"));
const medicines_1 = __importDefault(require("./routes/medicines"));
const bills_1 = __importDefault(require("./routes/bills"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const appointments_1 = __importDefault(require("./routes/appointments"));
const services_1 = __importDefault(require("./routes/services"));
const patient_services_1 = __importDefault(require("./routes/patient-services"));
const lab_tests_1 = __importDefault(require("./routes/lab-tests"));
const radiology_prescriptions_1 = __importDefault(require("./routes/radiology-prescriptions"));
const radiology_services_1 = __importDefault(require("./routes/radiology-services"));
const radiology_reports_1 = __importDefault(require("./routes/radiology-reports"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '5000', 10);
// Middleware
app.use((0, cors_1.default)({
    origin: true, // Allow all origins
    credentials: true
}));
app.use(express_1.default.json());
// Routes
app.use('/api/prescriptions', prescriptions_1.default);
app.use('/api/medicines', medicines_1.default);
app.use('/api/bills', bills_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/appointments', appointments_1.default);
app.use('/api/services', services_1.default);
app.use('/api/patient-services', patient_services_1.default);
app.use('/api/lab-tests', lab_tests_1.default);
app.use('/api/radiology-prescriptions', radiology_prescriptions_1.default);
app.use('/api/radiology-services', radiology_services_1.default);
app.use('/api/radiology-reports', radiology_reports_1.default);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Pharmacy API is running' });
});
// Error handling middleware
app.use((err, req, res, next) => {
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
//# sourceMappingURL=server.js.map