import express from 'express';
import cors from 'cors';
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'api' }));
app.get('/api/v1/status', (req, res) => res.json({ service: process.env.DOMAIN, version: '1.0.0', timestamp: new Date().toISOString() }));
app.listen(PORT, () => console.log(`API server on port ${PORT}`));
